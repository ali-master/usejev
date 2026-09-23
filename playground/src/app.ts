import {demoContent} from './demos-fa';
import {type Language, localizeDemo, translate} from './i18n';
import {type Category, type Demo, demos} from './demos';
import {icon} from './icons';
import type {Questions, SystemOneRequest, SystemOneResult} from '@typesafe-ai/sdk';

type Run = {
  result: SystemOneResult<Questions>;
  elapsedMs: number;
  requestId: string;
  request: SystemOneRequest;
  demoId: string;
  time: number
};
const root = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]!);
const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
};
let language: Language = storage.get('laya-language') === 'fa' ? 'fa' : 'en';
const t = (text: string) => translate(text, language);
let dark = storage.get('laya-theme') === 'dark';
let demo = demos[0];
let input = demoContent(demo, language).samples[0];
let questionText = JSON.stringify(demoContent(demo, language).questions, null, 2);
let inputMode = 'text';
let category: Category = 'All';
let search = '';
let activeTab = 'playground';
let resultTab = 'visual';
let connection: 'checking' | 'ready' | 'offline' = 'checking';
let model = 'laya-english';
let busy = false;
let stale = false;
let current: Run | null = null;
let history: Run[] = [];
let controller: AbortController | null = null;
let generation = 0;
let error = '';
let mobileOpen = false;
let codeOpen = false;
let schemaOpen = false;
type Draft = { input: string; questionText: string; inputMode: string; schemaOpen: boolean };
let drafts: Partial<Record<Language, Draft>> = {};
const mobileViewport = matchMedia('(max-width: 700px)');
mobileViewport.addEventListener('change', () => render());
const title = (d: Demo) => localizeDemo(d, language).title;
const categories: Category[] = ['All', 'Customer', 'Content', 'Business', 'Engineering'];
const categoryLabel = (c: Category) => t(({
  All: 'All demos',
  Customer: 'Customer',
  Content: 'Content',
  Business: 'Business',
  Engineering: 'Engineering'
})[c]);
const pretty = (key: string) => key.replaceAll('_', ' ');
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function sideList() {
  const filtered = demos.filter(d => (category === 'All' || d.category === category) && `${d.title} ${d.description} ${title(d)} ${localizeDemo(d, language).description}`.toLowerCase().includes(search.toLowerCase()));
  return filtered.length ? filtered.map((d) => `<button class="demo-item ${demo.id === d.id ? 'selected' : ''}" data-demo="${d.id}" aria-current="${demo.id === d.id ? 'true' : 'false'}"><span class="demo-icon">${icon(d.icon, 18)}</span><span>${escape(title(d))}</span>${demo.id === d.id ? '<span class="active-dot"></span>' : ''}</button>`).join('') : `<div class="no-matches">${t('No demos found. Try another search.')}</div>`;
}

function status() {
  return `<span class="status-dot ${connection}"></span>${connection === 'ready' ? t('Model connected') : connection === 'offline' ? t('Model offline') : t('Connecting…')}`;
}

function sidebar() {
  return `<aside ${mobileViewport.matches && !mobileOpen || codeOpen ? 'inert' : ''} class="sidebar ${mobileOpen ? 'open' : ''}" aria-label="${t('Demo library')}">
    <a class="brand" href="/" aria-label="Laya Playground"><span class="brand-mark"><i></i><i></i><i></i></span><span>laya<span class="brand-period">.</span></span><span class="brand-tag">PLAY</span></a>
    <div class="sidebar-heading">${t('THE DEMO LIBRARY')}<span>16</span></div>
    <label class="search">${icon('search', 17)}<input id="demo-search" type="search" value="${escape(search)}" placeholder="${t('Find a use case…')}" aria-label="${t('Search demos')}"/><span class="search-key">/</span></label>
    <div class="category-wrap"><select id="category" aria-label="${t('Filter by category')}">${categories.map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${categoryLabel(c)}</option>`).join('')}</select>${icon('grid', 15)}</div>
    <nav id="demo-list" class="demo-list">${sideList()}</nav>
    <div class="sidebar-bottom"><div class="local-symbol">${icon('lock', 17)}</div><div><strong>${t('Local by design')}</strong><p>${t('Your inputs stay on your machine.')}</p></div></div>
    <div class="sidebar-version"><span>Laya / System 1</span><span>v0.1</span></div>
  </aside>`;
}

function header() {
  return `<header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-expanded="${mobileOpen}" aria-label="${t('Open demo library')}">${icon('menu')}</button><span class="breadcrumb">${t('Workspace')}</span><span class="slash">/</span><strong>${t('Playground')}</strong></div><div class="topbar-actions"><button class="connection" data-action="health" title="${t('Refresh connection')}">${status()}</button><span class="top-divider"></span><button class="icon-button lang-button" data-action="language" aria-label="${language === 'en' ? 'Switch to Persian' : 'Switch to English'}" title="${language === 'en' ? 'فارسی' : 'English'}">${language === 'en' ? 'فا' : 'EN'}</button><button class="icon-button" data-action="theme" aria-label="${t('Toggle color theme')}">${icon(dark ? 'sun' : 'moon', 18)}</button><a class="github-link" href="https://huggingface.co/convaiinnovations/laya" target="_blank" rel="noopener noreferrer">${t('Model card')}${icon('arrow', 15)}</a></div></header>`;
}

function tabs() {
  return `<nav class="workspace-tabs" aria-label="${t('Workspace views')}">${[['playground', 'grid', 'Playground'], ['history', 'clock', 'Session history'], ['guide', 'book', 'How it works']].map(([id, ico, text]) => `<button class="workspace-tab ${activeTab === id ? 'active' : ''}" data-tab="${id}" aria-current="${activeTab === id ? 'page' : 'false'}">${icon(ico, 16)}${t(text)}${id === 'history' && history.length ? `<span class="count">${history.length}</span>` : ''}</button>`).join('')}<div class="model-label"><span class="tiny-square"></span>${escape(model)}</div></nav>`;
}

function questionCards() {
  let questions: Questions;
  try {
    questions = JSON.parse(questionText);
  } catch {
    return `<p class="muted">${t('Edit the schema below to fix invalid JSON.')}</p>`;
  }
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) return '';
  return Object.entries(questions).map(([key, q]) => `<div class="question-card"><div><span class="question-name" dir="auto">${escape(pretty(key))}</span><span class="type-pill ${escape(q?.type)}">${escape(q?.type)}</span></div><p dir="auto">${escape(typeof q?.instructions === 'string' ? q.instructions : JSON.stringify(q?.instructions ?? ''))}</p></div>`).join('');
}

function editor() {
  return `<section class="panel editor-panel" aria-label="${t('Input editor')}"><div class="panel-heading"><div class="panel-label"><span class="step">01</span><h2>${t('Give it context')}</h2></div><button class="icon-button" data-action="reset" title="${t('Reset this demo')}" aria-label="${t('Reset this demo')}">${icon('reset', 16)}</button></div>
    <div class="editor-body"><div class="field-top"><label for="state-input">${t('INPUT STATE')}</label><div class="segmented small"><button data-mode="text" class="${inputMode === 'text' ? 'active' : ''}">${t('Text')}</button><button data-mode="json" class="${inputMode === 'json' ? 'active' : ''}">JSON</button></div></div>
    <textarea id="state-input" ${busy ? 'disabled' : ''} dir="auto" spellcheck="false" maxlength="20000" aria-label="${t('Input state')}">${escape(input)}</textarea>
    <div class="input-bottom"><span id="char-count">${input.length.toLocaleString(language)} ${t('characters')}</span><button class="text-button" data-action="sample">${icon('reset', 13)}${t('Try another example')}</button></div>
    <div class="questions-heading"><h3>${t('What do you want to know?')}</h3><span>${t('TYPED QUESTIONS')}</span></div>
    <div id="question-cards" class="question-cards">${questionCards()}</div>
    <details class="schema-editor" ${schemaOpen ? 'open' : ''}><summary>${icon('code', 15)}${t('Edit question schema')}<span>JSON</span></summary><label class="sr-only" for="question-input">${t('Question schema JSON')}</label><textarea id="question-input" ${busy ? 'disabled' : ''} dir="ltr" spellcheck="false">${escape(questionText)}</textarea></details>
    <div id="error-region" role="alert" ${error ? '' : 'hidden'} class="error-banner">${escape(t(error))}</div>
    </div><div class="run-footer"><button class="run-button" data-action="run" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span>' : icon('bolt', 18)}<span>${busy ? t('Making decisions…') : t('Run inference')}</span><kbd>⌘ ↵</kbd></button>${busy ? `<button class="cancel-button" data-action="cancel">${t('Cancel')}</button>` : `<p>${icon('lock', 12)}${t('One forward pass. No text generation.')}</p>`}</div></section>`;
}

function emptyResult() {
  return `<div class="empty-result ${busy ? 'is-running' : ''}"><div class="decision-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-point p-one">${icon('check', 18)}</span><span class="art-point p-two">${icon('branch', 18)}</span><span class="art-point p-three">${icon('pulse', 18)}</span><div class="art-core">${icon('spark', 36)}</div><span class="orbit-dot"></span></div><span class="eyebrow">${busy ? t('CONNECTING THE DOTS') : t('READY WHEN YOU ARE')}</span><h3>${busy ? t('A little context. A clear answer.') : t('Let’s make a decision.')}</h3><p>${busy ? t('Laya is evaluating your questions locally. Your real results will appear here.') : t('Choose a demo, make the input your own, and see what Laya thinks.')}</p><div class="empty-types"><span class="type-pill choice">choice</span><span class="type-pill score">score</span><span class="type-pill noul">noul</span></div></div>`;
}

function answerCards() {
  if (!current) return '';
  return Object.entries(current.result.answers).map(([name, answer], index) => {
    let body = '';
    if (answer.type === 'noul') {
      const yes = answer.noul;
      body = `<div class="noul-result"><div class="probability-ring" style="--progress:${yes * 100}%"><span>${Math.round(yes * 100)}<small>%</small></span></div><div><span class="answer-caption">${t('PROBABILITY OF TRUE')}</span><strong>${yes >= 0.5 ? t('Leaning yes') : t('Leaning no')}</strong><p>${t('Yes')} <b>${pct(yes)}</b><span>·</span>${t('No')} <b>${pct(1 - yes)}</b></p></div></div>`;
    } else {
      body = answer.type === 'choice' ? `<div class="choice-result"><strong dir="auto">${escape(pretty(answer.choice))}</strong><span>${pct(answer.probabilities[answer.choice])} ${t('probability')}</span></div>` : `<div class="score-result"><strong>${answer.score.toFixed(2)}<small> / ${Object.keys(answer.legend).length - 1}</small></strong><span>${t('Expected score')}</span></div>`;
      const entries = Object.entries(answer.probabilities);
      body += `<div class="probability-bars">${entries.map(([key, value]) => `<div class="bar-row"><div><span dir="auto">${escape(answer.type === 'score' ? `${key} · ${typeof answer.legend[key as never] === 'string' ? answer.legend[key as never] : JSON.stringify(answer.legend[key as never])}` : pretty(key))}</span><b>${pct(value)}</b></div><div class="bar-track"><i class="${answer.type === 'choice' && key === answer.choice ? 'winner' : ''}" style="width:${value * 100}%"></i></div></div>`).join('')}</div><div class="confidence-row"><span>${t('Entropy confidence')}<span class="help" tabindex="0" title="${t('1 − normalized entropy. This is not the winning-label probability or a guarantee of correctness.')}">?</span></span><b>${pct(answer.confidence)}</b></div>`;
    }
    return `<article class="answer-card" style="--delay:${index * 65}ms"><div class="answer-heading"><h3 dir="auto">${escape(pretty(name))}</h3><span class="type-pill ${answer.type}">${answer.type}</span></div>${body}</article>`;
  }).join('');
}

function results() {
  return `<section class="panel result-panel" aria-label="${t('Model results')}" aria-busy="${busy}"><div class="panel-heading"><div class="panel-label"><span class="step">02</span><h2>${t('See the decision')}</h2></div><div class="segmented small"><button data-result-tab="visual" class="${resultTab === 'visual' ? 'active' : ''}">${t('Visual')}</button><button data-result-tab="json" class="${resultTab === 'json' ? 'active' : ''}">JSON</button></div></div><div id="result-content" aria-live="polite">${busy || !current ? emptyResult() : `<div class="result-stats"><div><span class="live-dot"></span>${t('INFERENCE COMPLETE')}</div><span>${icon('clock', 13)}${current.elapsedMs} ms</span></div>${stale ? `<div class="stale-banner">${t('Input changed. Run again to refresh these results.')}</div>` : ''}${resultTab === 'visual' ? `<div class="answers">${answerCards()}</div>` : `<pre class="raw-result" dir="ltr">${escape(JSON.stringify(current.result, null, 2))}</pre>`}<div class="result-footer"><span>${current.result.usage.input_tokens} ${t('input tokens')}<span class="dot-separator">·</span>${escape(current.result.model)}</span><button class="text-button" data-action="copy-result">${icon('copy', 14)}${t('Copy JSON')}</button></div>`}</div></section>`;
}

function playground() {
  return `<section class="hero"><div class="hero-text"><span class="eyebrow"><span></span>${t('THE SYSTEM 1 PLAYGROUND')}</span><h1>${t('Less guessing.<br>More <em>knowing.</em>')}</h1><p>${t('Real-world questions. Typed answers. One forward pass.<br>Discover what a decision model can do.')}</p></div><div class="hero-card"><span class="hero-card-top">${icon('branch', 18)}<span>LAYA ENGINE</span><span class="live-dot"></span></span><div class="mini-flow"><span>${t('Context')}</span><i></i><b>laya</b><i></i><div><span>choice</span><span>score</span><span>noul</span></div></div><div class="hero-card-bottom"><span>${t('16 use cases')}</span><span>${t('3 answer types')}</span></div></div></section>
  <div class="demo-intro"><div class="scenario-icon">${icon(demo.icon, 25)}</div><div><div class="scenario-meta">${categoryLabel(demo.category)}<span>/</span>${t('DEMO')} ${String(demos.indexOf(demo) + 1).padStart(2, '0')}</div><h2>${escape(title(demo))}</h2><p>${escape(localizeDemo(demo, language).context)}</p></div><button class="outline-button" data-action="code">${icon('code', 16)}${t('Get the code')}</button></div>
  <div class="workbench">${editor()}${results()}</div><div class="footnote">${icon('spark', 14)}<span>${t('Explore, don’t assume. Outputs are model estimates. Validate them for your use case.')} ${t('English checkpoint · Persian examples are experimental.')}</span></div>
  <section class="explore-section"><div><span class="eyebrow">${t('KEEP EXPLORING')}</span><h2>${t('A different question. A new possibility.')}</h2></div><div class="explore-grid">${demos.filter(d => d.id !== demo.id && d.category !== demo.category).slice(0, 3).map(d => `<button class="explore-card" data-demo="${d.id}"><span class="explore-icon">${icon(d.icon, 22)}</span><span class="explore-category">${categoryLabel(d.category)}</span><strong>${escape(title(d))}</strong><p>${escape(localizeDemo(d, language).description)}</p><span class="explore-arrow">${icon('arrow', 18)}</span></button>`).join('')}</div></section>`;
}

function historyPage() {
  return `<section class="page-intro"><span class="eyebrow">${t('YOUR SESSION')}</span><h1>${t('A trail of decisions.')}</h1><p>${t('Compare your experiments. History stays in this tab and disappears when you reload.')}</p></section><div class="history-toolbar"><strong>${history.length} ${t('runs')}</strong><button class="outline-button" data-action="clear-history" ${history.length ? '' : 'disabled'}>${t('Clear history')}</button></div>${history.length ? `<div class="history-list">${history.map((run, i) => `<button class="history-item" data-history="${i}"><span class="history-icon">${icon(demos.find(d => d.id === run.demoId)!.icon)}</span><div><strong>${escape(title(demos.find(d => d.id === run.demoId)!))}</strong><p dir="auto">${escape(typeof run.request.state === 'string' ? run.request.state : JSON.stringify(run.request.state))}</p></div><span class="history-time">${new Date(run.time).toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit'
  })}<small>${run.elapsedMs} ms</small></span>${icon('chevron', 18)}</button>`).join('')}</div>` : `<div class="blank-page">${icon('clock', 44)}<h2>${t('Your first experiment starts here.')}</h2><p>${t('Run any demo to start your session history.')}</p><button class="run-button" data-tab="playground">${t('Explore the playground')}${icon('arrow')}</button></div>`}`;
}

function guide() {
  return `<section class="page-intro"><span class="eyebrow">${t('A QUICK FIELD GUIDE')}</span><h1>${t('Decisions, not conversations.')}</h1><p>${t('Laya evaluates your context against questions you define. It returns structured decisions and probabilities, without generating text.')}</p></section><div class="guide-grid">${[
    ['choice', 'Pick a direction', 'Define named options. Get a selected label and a probability for every option. Useful for routing, categories, and intent.'],
    ['score', 'Find its place on a scale', 'Define an ordered rubric, starting at zero. The output is an expected score and can sit between levels.'],
    ['noul', 'Ask a yes-or-no question', 'Get the probability that a statement is true, from 0 to 1. A 0.8 is an estimate, not a guarantee.'],
  ].map(([type, heading, desc]) => `<article class="guide-card"><span class="type-pill ${type}">${type}</span><h2>${t(heading)}</h2><p>${t(desc)}</p></article>`).join('')}</div><section class="guide-note"><span>${icon('shield', 28)}</span><div><h2>${t('Know what the numbers mean.')}</h2><p>${t('Choice and score confidence measure how concentrated the distribution is (1 − normalized entropy). They are not accuracy scores. The selected-label probability is shown separately. This playground does not take actions on your behalf.')}</p></div></section><section class="guide-note"><span>${icon('globe', 28)}</span><div><h2>${t('An English model, for now.')}</h2><p>${t('The loaded checkpoint is English. Persian examples send Persian text and questions directly to it; Persian accuracy is not verified. For multilingual use, load and evaluate a multilingual checkpoint separately. Long inputs are truncated to the model’s token budget.')}</p></div></section>`;
}

function codeSnippet() {
  let questions;
  try {
    questions = JSON.parse(questionText);
  } catch {
    questions = demoContent(demo, language).questions;
  }
  let state: unknown = input;
  if (inputMode === 'json') {
    try {
      state = JSON.parse(input);
    } catch {
    }
  }
  return `import { TypeSafeClient } from '@typesafe-ai/sdk';\n\nconst client = new TypeSafeClient({\n  baseURL: 'http://127.0.0.1:3000',\n  apiKey: process.env.LAYA_API_KEY ?? 'local-development',\n  defaultModel: 'laya',\n  timeout: 60_000,\n});\n\nconst result = await client.systemOne(${JSON.stringify({
    state,
    questions
  }, null, 2)});\n\nconsole.log(result.answers);`;
}

function modal() {
  return `<div class="modal-backdrop" data-action="close-code"><section class="code-modal" role="dialog" aria-modal="true" aria-labelledby="code-title"><div class="panel-heading"><div><span class="eyebrow">OFFICIAL TYPESAFE SDK</span><h2 id="code-title">${t('Take this experiment with you.')}</h2></div><button class="icon-button" data-action="close-code" aria-label="${t('Close dialog')}">${icon('close')}</button></div><pre dir="ltr">${escape(codeSnippet())}</pre><div class="modal-footer"><span>${t('Run on your server with Bun or Node.js.')}</span><button class="run-button" data-action="copy-code">${icon('copy', 16)}${t('Copy code')}</button></div></section></div>`;
}

function render() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  root.innerHTML = `${mobileOpen ? '<div class="mobile-backdrop" data-action="menu"></div>' : ''}${sidebar()}<div class="main-shell" ${codeOpen ? 'inert' : ''}>${header()}<main>${tabs()}${activeTab === 'playground' ? playground() : activeTab === 'history' ? historyPage() : guide()}<footer class="page-footer"><span>${t('Built for curious minds.')}</span><span>LAYA<span> / </span>${t('Local inference. Real possibilities.')}</span></footer></main></div>${codeOpen ? modal() : ''}`;
}

function notify(message: string) {
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.textContent = t(message);
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2400);
}

function cancel() {
  generation++;
  controller?.abort();
  controller = null;
  busy = false;
}

function switchLanguage() {
  cancel();
  drafts[language] = {input, questionText, inputMode, schemaOpen};
  language = language === 'en' ? 'fa' : 'en';
  const content = demoContent(demo, language);
  const draft = drafts[language] ?? {
    input: content.samples[0],
    questionText: JSON.stringify(content.questions, null, 2),
    inputMode: 'text',
    schemaOpen: false
  };
  ({input, questionText, inputMode, schemaOpen} = draft);
  stale = Boolean(current);
  error = '';
  storage.set('laya-language', language);
  render();
  document.querySelector<HTMLButtonElement>('[data-action="language"]')?.focus();
}

function selectDemo(id: string) {
  drafts = {};
  cancel();
  demo = demos.find(d => d.id === id)!;
  input = demoContent(demo, language).samples[0];
  questionText = JSON.stringify(demoContent(demo, language).questions, null, 2);
  inputMode = 'text';
  schemaOpen = false;
  current = null;
  stale = false;
  error = '';
  mobileOpen = false;
  activeTab = 'playground';
  render();
}

async function checkHealth() {
  connection = 'checking';
  updateConnection();
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    connection = response.ok && data.status === 'ready' ? 'ready' : 'offline';
    if (data.model) model = data.model;
  } catch {
    connection = 'offline';
  }
  updateConnection();
  const label = document.querySelector('.model-label');
  if (label) label.innerHTML = `<span class="tiny-square"></span>${escape(model)}`;
}

function updateConnection() {
  const el = document.querySelector('.connection');
  if (el) el.innerHTML = status();
}

async function run() {
  if (busy) return;
  error = '';
  let request: SystemOneRequest;
  try {
    if (!input.trim()) throw new Error('Add some context before running the model.');
    request = {state: inputMode === 'json' ? JSON.parse(input) : input, questions: JSON.parse(questionText)};
  } catch (e) {
    error = e instanceof SyntaxError ? 'Invalid JSON. Check the input and question schema.' : String((e as Error).message);
    render();
    return;
  }
  const id = ++generation;
  const selectedDemo = demo.id;
  busy = true;
  controller = new AbortController();
  render();
  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(request),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(95_000)])
    });
    const data = await response.json();
    if (id !== generation) return;
    if (!response.ok) throw new Error(data.error ?? 'Inference failed.');
    current = {...data, request, demoId: selectedDemo, time: Date.now()};
    history = [current!, ...history].slice(0, 30);
    stale = false;
    connection = 'ready';
  } catch (e) {
    if (id !== generation) return;
    error = e instanceof Error ? e.name === 'TimeoutError' ? 'The request timed out. Please try again.' : e.message : 'Something went wrong.';
    void checkHealth();
  } finally {
    if (id === generation) {
      busy = false;
      controller = null;
      render();
    }
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify('Copied to clipboard');
  } catch {
    notify('Clipboard unavailable. Select and copy the text manually.');
  }
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('.code-modal') && !target.closest('[data-action]')) return;
  const button = target.closest<HTMLElement>('[data-action], [data-demo], [data-tab], [data-mode], [data-result-tab], [data-history]');
  if (!button || button.hasAttribute('disabled')) return;
  if (button.classList.contains('modal-backdrop') && target.closest('.code-modal')) return;
  if (button.dataset.demo) return selectDemo(button.dataset.demo);
  if (button.dataset.tab) {
    activeTab = button.dataset.tab;
    render();
    return;
  }
  if (button.dataset.mode) {
    const next = button.dataset.mode;
    if (next !== inputMode) {
      cancel();
      if (next === 'json') input = JSON.stringify({text: input}, null, 2);
      else {
        try {
          const parsed = JSON.parse(input);
          input = typeof parsed === 'string' ? parsed : parsed?.text ?? input;
        } catch {
        }
      }
      inputMode = next;
      stale = Boolean(current);
      render();
    }
    return;
  }
  if (button.dataset.resultTab) {
    resultTab = button.dataset.resultTab;
    render();
    return;
  }
  if (button.dataset.history !== undefined) {
    cancel();
    drafts = {};
    current = history[Number(button.dataset.history)];
    demo = demos.find(d => d.id === current!.demoId)!;
    inputMode = typeof current.request.state === 'string' ? 'text' : 'json';
    input = inputMode === 'text' ? current.request.state as string : JSON.stringify(current.request.state, null, 2);
    questionText = JSON.stringify(current.request.questions, null, 2);
    stale = false;
    error = '';
    activeTab = 'playground';
    render();
    return;
  }
  switch (button.dataset.action) {
    case 'run':
      void run();
      break;
    case 'cancel':
      cancel();
      render();
      break;
    case 'reset':
      selectDemo(demo.id);
      break;
    case 'sample':
      cancel();
      input = input === demoContent(demo, language).samples[0] ? demoContent(demo, language).samples[1] : demoContent(demo, language).samples[0];
      inputMode = 'text';
      stale = Boolean(current);
      error = '';
      render();
      break;
    case 'language':
      switchLanguage();
      break;
    case 'theme':
      dark = !dark;
      storage.set('laya-theme', dark ? 'dark' : 'light');
      render();
      break;
    case 'health':
      void checkHealth();
      break;
    case 'menu':
      mobileOpen = !mobileOpen;
      render();
      break;
    case 'clear-history':
      history = [];
      render();
      break;
    case 'code':
      codeOpen = true;
      render();
      document.querySelector<HTMLButtonElement>('.code-modal button')?.focus();
      break;
    case 'close-code':
      codeOpen = false;
      render();
      document.querySelector<HTMLButtonElement>('[data-action="code"]')?.focus();
      break;
    case 'copy-code':
      void copy(codeSnippet());
      break;
    case 'copy-result':
      if (current) void copy(JSON.stringify(current.result, null, 2));
      break;
  }
});
root.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'demo-search') {
    search = target.value;
    document.querySelector('#demo-list')!.innerHTML = sideList();
  }
  if (target.id === 'state-input' || target.id === 'question-input') {
    if (busy) cancel();
    if (target.id === 'state-input') {
      input = target.value;
      document.querySelector('#char-count')!.textContent = `${input.length.toLocaleString(language)} ${t('characters')}`;
    } else {
      questionText = target.value;
      document.querySelector('#question-cards')!.innerHTML = questionCards();
    }
    if (current && !stale) {
      stale = true;
      const region = document.querySelector('.result-stats');
      region?.insertAdjacentHTML('afterend', `<div class="stale-banner">${t('Input changed. Run again to refresh these results.')}</div>`);
    }
    const runButton = document.querySelector<HTMLButtonElement>('[data-action="run"]');
    if (runButton?.disabled) {
      runButton.disabled = false;
      runButton.innerHTML = `${icon('bolt', 18)}<span>${t('Run inference')}</span><kbd>⌘ ↵</kbd>`;
    }
    error = '';
    const errorRegion = document.querySelector<HTMLElement>('#error-region');
    if (errorRegion) errorRegion.hidden = true;
  }
});
root.addEventListener('toggle', event => {
  if ((event.target as HTMLElement).classList?.contains('schema-editor')) schemaOpen = (event.target as HTMLDetailsElement).open;
}, true);
root.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'category') {
    category = target.value as Category;
    document.querySelector('#demo-list')!.innerHTML = sideList();
  }
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && activeTab === 'playground' && !codeOpen) {
    event.preventDefault();
    void run();
  }
  if (event.key === 'Escape') {
    if (codeOpen) {
      codeOpen = false;
      render();
      document.querySelector<HTMLButtonElement>('[data-action="code"]')?.focus();
    } else if (mobileOpen) {
      mobileOpen = false;
      render();
    }
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>('#demo-search')?.focus();
  }
  if (event.key === 'Tab' && codeOpen) {
    const focusable = Array.from(document.querySelectorAll<HTMLButtonElement>('.code-modal button'));
    const first = focusable[0], last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
render();
void checkHealth();
