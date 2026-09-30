#!/usr/bin/env node
/**
 * VALIDATE THE n8n WORKFLOW EXPORTS - POVO AI Guidance
 * =============================================================================
 *   node n8n/tools/validate-workflows.js [file.json ...]
 *
 * With no arguments it checks every *.json directly in n8n/. No dependencies.
 * Exit code 0 when every file passes, 1 otherwise.
 *
 * Checks per file:
 *   - parses as JSON; has name, nodes, connections, settings; active === false
 *   - the file name is "<workflow name>.json" and the name ends in " v<N>"
 *   - node names unique, node ids unique and UUID-shaped
 *   - every connection source and target is an existing node, with a known
 *     connection type; no node (except sticky notes / triggers) is dangling
 *   - Code nodes compile (as the async function body n8n runs)
 *   - webhook: POST, responseMode responseNode, a Respond to Webhook node exists
 *   - model nodes use the "Azure OpenAI account" placeholder credential
 *   - no hardcoded secrets (keys, tokens, bearer strings, passwords, IPs)
 * Across files:
 *   - webhook paths are unique (n8n serves one active workflow per path)
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(DIR, f));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONNECTION_TYPES = new Set(['main', 'ai_languageModel', 'ai_outputParser', 'ai_tool', 'ai_memory', 'ai_document', 'ai_embedding', 'ai_retriever', 'ai_textSplitter', 'ai_vectorStore']);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, 'OpenAI-style secret key'],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}/, 'Anthropic key'],
  [/\bdapi[0-9a-f]{32}\b/i, 'Databricks token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\bBearer\s+[A-Za-z0-9._-]{12,}/, 'Bearer token'],
  [/\b[0-9a-f]{32}\b/i, '32-hex string (Azure key?)'],
  [/"(password|passwd|secret|api_?key|apikey|client_secret)"\s*:\s*"[^"=][^"]{3,}"/i, 'secret-like field'],
  [/https?:\/\/\d{1,3}(\.\d{1,3}){3}/, 'hardcoded IP URL'],
  [/\.openai\.azure\.com/i, 'hardcoded Azure OpenAI endpoint'],
];

let failures = 0;
const webhookPaths = new Map();

function check(file) {
  const errors = [];
  const warn = [];
  const rel = path.basename(file);
  let text;
  let wf;
  try {
    text = fs.readFileSync(file, 'utf8');
    wf = JSON.parse(text);
  } catch (e) {
    return { rel, errors: ['cannot parse: ' + e.message], warn, summary: '' };
  }

  ['name', 'nodes', 'connections', 'settings'].forEach((k) => { if (wf[k] === undefined) errors.push('missing top-level "' + k + '"'); });
  if (wf.active !== false) errors.push('"active" must be false in the export');
  if (wf.name && rel !== wf.name + '.json') errors.push('file name must be "' + wf.name + '.json"');
  if (wf.name && !/ v\d+$/.test(wf.name)) errors.push('workflow name must end in a version, e.g. " v1"');
  if (wf.settings && wf.settings.executionOrder !== 'v1') errors.push('settings.executionOrder must be "v1"');

  const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
  const byName = new Map();
  const ids = new Set();
  nodes.forEach((n) => {
    if (!n.name) errors.push('node without a name');
    if (byName.has(n.name)) errors.push('duplicate node name: ' + n.name);
    byName.set(n.name, n);
    if (!n.id || !UUID.test(n.id)) errors.push('node id is not a UUID: ' + n.name);
    if (ids.has(n.id)) errors.push('duplicate node id: ' + n.id);
    ids.add(n.id);
    if (!n.type || n.typeVersion === undefined) errors.push('node missing type/typeVersion: ' + n.name);
    if (!Array.isArray(n.position) || n.position.length !== 2) errors.push('node missing position: ' + n.name);
  });

  /* connections */
  const touched = new Set();
  Object.entries(wf.connections || {}).forEach(([src, byType]) => {
    if (!byName.has(src)) errors.push('connection from unknown node: ' + src);
    touched.add(src);
    Object.entries(byType || {}).forEach(([type, outputs]) => {
      if (!CONNECTION_TYPES.has(type)) errors.push('unknown connection type "' + type + '" from ' + src);
      (outputs || []).forEach((targets, outIndex) => {
        (targets || []).forEach((t) => {
          if (!byName.has(t.node)) errors.push('connection ' + src + '[' + outIndex + '] -> unknown node: ' + t.node);
          if (t.type !== type) errors.push('connection type mismatch ' + src + ' -> ' + t.node);
          touched.add(t.node);
        });
      });
      const srcNode = byName.get(src);
      if (type === 'main' && srcNode && srcNode.onError === 'continueErrorOutput' && (!outputs[1] || !outputs[1].length)) {
        errors.push(src + ' uses the error output but it is not connected');
      }
    });
  });
  nodes.forEach((n) => {
    if (/stickyNote$/.test(n.type)) return;
    if (!touched.has(n.name)) errors.push('dangling node (no connections): ' + n.name);
  });

  /* code nodes compile */
  nodes.filter((n) => /\.code$/.test(n.type)).forEach((n) => {
    try { new AsyncFunction('$input', '$', '$json', '$now', '$env', '$execution', n.parameters.jsCode); } catch (e) { errors.push('Code node "' + n.name + '" does not compile: ' + e.message); }
  });

  /* webhooks */
  const hooks = nodes.filter((n) => /\.webhook$/.test(n.type));
  hooks.forEach((h) => {
    const p = h.parameters || {};
    if (p.httpMethod !== 'POST') errors.push('webhook "' + h.name + '" must be POST');
    if (p.responseMode !== 'responseNode') errors.push('webhook "' + h.name + '" must use responseMode responseNode');
    if (!nodes.some((n) => /respondToWebhook$/.test(n.type))) errors.push('webhook workflow has no Respond to Webhook node');
    if (!p.path) errors.push('webhook "' + h.name + '" has no path');
    else {
      if (webhookPaths.has(p.path)) errors.push('webhook path "' + p.path + '" also used by ' + webhookPaths.get(p.path));
      webhookPaths.set(p.path, rel);
    }
  });

  /* model credentials */
  nodes.filter((n) => /lmChat/.test(n.type)).forEach((n) => {
    const c = n.credentials && n.credentials.azureOpenAiApi;
    if (!/lmChatAzureOpenAi$/.test(n.type)) errors.push('model node is not Azure OpenAI: ' + n.name);
    if (!c || c.name !== 'Azure OpenAI account') errors.push('model node must reference credential "Azure OpenAI account": ' + n.name);
    else if (!/^REPLACE_/.test(String(c.id))) warn.push('credential id is instance-specific (' + c.id + '); prefer the REPLACE_ placeholder');
    const o = (n.parameters || {}).options || {};
    if (o.temperature !== 0) errors.push('model temperature must be 0: ' + n.name);
  });

  /* secrets */
  const scan = text.replace(/"(id|webhookId|versionId)"\s*:\s*"[^"]*"/g, '');
  SECRET_PATTERNS.forEach(([re, label]) => { const m = scan.match(re); if (m) errors.push('possible hardcoded secret (' + label + '): ' + m[0].slice(0, 24) + '...'); });
  nodes.filter((n) => /httpRequest$/.test(n.type)).forEach((n) => {
    const hp = (((n.parameters || {}).headerParameters || {}).parameters) || [];
    hp.forEach((h) => {
      if (/token|key|auth|secret/i.test(h.name)) errors.push('header "' + h.name + '" on ' + n.name + ' carries a secret; use an n8n credential (Header Auth)');
    });
    /* The backend URL comes from the Settings node (env when allowed, else its default), never a literal per node. */
    const url = String((n.parameters || {}).url || '');
    if (!/^=\{\{\s*(\$env\.|\$\('Settings'\))/.test(url)) errors.push('HTTP node ' + n.name + " URL must start from $('Settings') or an $env variable");
  });

  const summary = nodes.length + ' nodes' + (hooks.length ? ', webhook /' + hooks.map((h) => h.parameters.path).join(',') : ', no webhook');
  return { rel, errors, warn, summary };
}

files.forEach((f) => {
  const r = check(f);
  if (r.errors.length) {
    failures += 1;
    console.log('FAIL  ' + r.rel);
    r.errors.forEach((e) => console.log('        - ' + e));
  } else {
    console.log('ok    ' + r.rel + '  (' + r.summary + ')');
  }
  r.warn.forEach((w) => console.log('        warn: ' + w));
});
console.log('\n' + files.length + ' workflow file(s), ' + failures + ' failed, ' + webhookPaths.size + ' unique webhook path(s)');
process.exit(failures ? 1 : 0);
