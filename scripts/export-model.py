"""One-time export of the COMPLETE Laya encoder and decision head, plus parity fixtures.
Python is never invoked by the serving app. Inputs match upstream build_sequence.
"""
import os
os.environ['USE_TF'] = '0'
import json
from pathlib import Path
import numpy as np
import torch
from transformers import AutoConfig, AutoModel, PreTrainedTokenizerFast
from safetensors.torch import load_file
from export_graph import ExportGraph
from vendor.laya_common import DecisionModel, build_sequence, collate_items, QTYPES

checkpoint = os.getenv('LAYA_CHECKPOINT', 'english')
source = Path(os.getenv('LAYA_SOURCE_DIR', f'models/{checkpoint}/source'))
target = Path(os.getenv('LAYA_MODEL_DIR', f'models/{checkpoint}/onnx'))
target.mkdir(parents=True, exist_ok=True)
# A failed re-export must not leave an old ready marker beside a new graph.
(target / 'manifest.json').unlink(missing_ok=True)
cfg = json.loads((source / 'rl_agent_config.json').read_text())
ec = AutoConfig.from_pretrained(source / 'encoder')
ec.reference_compile = False
encoder = AutoModel.from_config(ec, attn_implementation='eager')
model = DecisionModel(encoder, cfg.get('head_layers', 2), len(cfg.get('act_costs', {})) + 1)
model.load_state_dict(load_file(source / 'model.safetensors'), strict=True)
model.eval()
torch.set_num_threads(4)
torch.backends.mha.set_fastpath_enabled(False)
tc = json.loads((source / 'tokenizer/tokenizer_config.json').read_text())
# Avoid version-sensitive AutoTokenizer class metadata in the published checkpoint.
tok = PreTrainedTokenizerFast(tokenizer_file=str(source / 'tokenizer/tokenizer.json'), **{k: tc[k] for k in ['cls_token', 'sep_token', 'mask_token', 'pad_token', 'unk_token'] if k in tc})

cases = [
 {'state': 'Only one possible label.', 'questions': {'single': {'type': 'choice', 'instructions': 'Choose', 'criteria': {'only': None}}}},
 {'state': 'I was charged twice. Please refund the duplicate payment.', 'questions': {
  'department': {'type': 'choice', 'instructions': 'Which department should handle this request?', 'criteria': {'billing': 'invoices, payments, refunds', 'technical': 'bugs, outages', 'other': None}},
  'urgency': {'type': 'score', 'instructions': 'How urgent is the request?', 'criteria': ['not urgent', 'soon', 'critical']},
  'refund': {'type': 'noul', 'instructions': 'Does the user request a refund?'}}},
 {'state': {'body': 'سلام، لطفاً هزینه را برگردانید.', 'tags': ['refund', 'test']}, 'questions': {
  'refund': {'type': 'noul', 'instructions': 'Is a refund requested?'},
  'single': {'type': 'choice', 'instructions': None, 'criteria': {'only': None}}}},
 {'state': 'All systems are operating normally. ' * 100, 'questions': {'ok': {'type': 'noul', 'instructions': 'Are systems healthy?', 'criteria': {'true': 'working', 'false': 'outage'}}}},
 {'state': None, 'questions': {'kind': {'type': 'choice', 'instructions': {'prompt': 'Choose the category'}, 'criteria': {'one': {'label': 'First'}, 'two': ['Second']}}}},
]

def batch(case):
 items = []
 for q in case['questions'].values():
  ins = q.get('instructions')
  internal = {'t': q['type'], 'ins': ins if isinstance(ins, str) else json.dumps(ins), 'crit': q.get('criteria')}
  ids, markers = build_sequence(tok, case['state'], internal, cfg['max_len'], cfg['head_max_len'])
  items.append({'ids': ids, 'markers': markers, 'qtype': QTYPES[q['type']]})
 return collate_items([items], tok.pad_token_id)

names = ['input_ids', 'attention_mask', 'marker_pos', 'marker_mask', 'qtype']
b = batch(cases[1])
args = tuple(b[k] for k in names)
print('Exporting full checkpoint to ONNX...', flush=True)
with torch.no_grad():
 torch.onnx.export(ExportGraph(model).eval(), args, str(target / 'model.onnx'), input_names=names,
  output_names=['logits', 'act_logits'], opset_version=17, dynamo=False,
  dynamic_axes={**{k: {0: 'batch', 1: 'sequence'} for k in names[:2]}, **{k: {0: 'batch', 1: 'options'} for k in names[2:4]}, 'qtype': {0: 'batch'}, 'logits': {0: 'batch', 1: 'options'}, 'act_logits': {0: 'batch'}})

# Compare different sequence lengths, batch sizes and option counts, not just trace inputs.
import onnxruntime as ort
session = ort.InferenceSession(str(target / 'model.onnx'), providers=['CPUExecutionProvider'])
fixtures = []
with torch.no_grad():
 for case in cases:
  b = batch(case)
  inputs = {k: b[k].numpy() for k in names}
  if inputs['marker_pos'].shape[1] == 1:
   inputs['marker_pos'] = np.pad(inputs['marker_pos'], ((0, 0), (0, 1)))
   inputs['marker_mask'] = np.pad(inputs['marker_mask'], ((0, 0), (0, 1)))
  logits, acts = model(*(b[k] for k in names))
  actual = session.run(None, inputs)
  np.testing.assert_allclose(actual[0][:, :logits.shape[1]], logits.numpy(), rtol=2e-3, atol=2e-3)
  np.testing.assert_allclose(actual[1], acts.numpy(), rtol=2e-3, atol=2e-3)
  fixtures.append({'request': case, 'inputs': {k: v.tolist() for k, v in inputs.items()}, 'logits': logits.tolist(), 'act_logits': acts.tolist()})
  print('Parity passed:', list(case['questions']), flush=True)
(target / 'parity.json').write_text(json.dumps(fixtures, ensure_ascii=False))
for name in ['tokenizer.json', 'tokenizer_config.json']:
 (target / name).write_bytes((source / 'tokenizer' / name).read_bytes())
manifest = {**cfg, **json.loads((source / 'provenance.json').read_text()), 'format': 'laya-onnx-v1', 'special_tokens': {k: getattr(tok, k + '_token_id') for k in ['cls', 'sep', 'mask', 'pad']}, 'mask_token': tok.mask_token}
(target / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('Export and PyTorch/ONNX parity complete:', target, flush=True)
