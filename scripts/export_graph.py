"""Export adapter: express PyTorch MHA with dynamic sequence dimensions.
Weights and math are unchanged. The legacy MHA exporter freezes the trace's
sequence length in a reshape; explicit tensor ops avoid that restriction.
"""
import math
import torch
import torch.nn.functional as F

class ExportGraph(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        model = self.model
        h = model.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        h = h + model.type_emb(qtype)[:, None, :]
        if model.head is not None:
            for layer in model.head.layers:
                x = layer.norm1(h)
                attn = layer.self_attn
                batch, length, width = x.shape
                heads, dim = attn.num_heads, attn.head_dim
                packed = F.linear(x, attn.in_proj_weight, attn.in_proj_bias)
                q, k, v = packed.reshape(batch, length, 3, heads, dim).permute(2, 0, 3, 1, 4).unbind(0)
                scores = torch.matmul(q, k.transpose(-1, -2)) / math.sqrt(dim)
                scores = scores.masked_fill(~attention_mask[:, None, None, :].bool(), float('-inf'))
                context = torch.matmul(torch.softmax(scores, -1), v).transpose(1, 2).reshape(batch, length, width)
                h = h + F.linear(context, attn.out_proj.weight, attn.out_proj.bias)
                x = layer.norm2(h)
                h = h + layer.linear2(layer.activation(layer.linear1(x)))
        positions = marker_pos.clamp(min=0)[:, :, None].expand(-1, -1, h.size(-1))
        logits = model.scorer(torch.gather(h, 1, positions)).squeeze(-1).float()
        logits = logits.masked_fill(~marker_mask, -1e4)
        p = torch.softmax(logits, -1)
        count = marker_mask.sum(-1).clamp(min=2).float()
        entropy = -(p * torch.log(p.clamp_min(1e-9))).sum(-1) / torch.log(count)
        top = p.topk(2, -1).values
        features = torch.stack([top[:, 0], top[:, 0] - top[:, 1], entropy, count / 255.0], -1)
        return logits, model.act_head(torch.cat([h[:, 0].float(), features], -1))
