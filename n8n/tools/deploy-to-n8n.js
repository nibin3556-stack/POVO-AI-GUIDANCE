#!/usr/bin/env node
/**
 * PUSH THE POVO AI GUIDANCE WORKFLOWS TO n8n - create or update BY NAME
 * =============================================================================
 *   node n8n/tools/deploy-to-n8n.js [--dry-run] [--activate] [file.json ...]
 *
 * Environment:
 *   N8N_URL                   default http://localhost:5680 (docker-compose)
 *   N8N_API_KEY               n8n public API key (Settings > n8n API)
 *   N8N_AZURE_CREDENTIAL_ID   optional: id of the "Azure OpenAI account"
 *                             credential on the target instance
 *
 * With no files it pushes every *.json directly in n8n/. No dependencies
 * (Node 18+ global fetch).
 *
 * MATCHING BY NAME. Ids are per instance and the files carry none, so the
 * workflow name (which includes the version, e.g. "... Call Prep v1") is the
 * key. An archived workflow of the same name is ignored.
 *
 * MODEL CREDENTIAL. The files carry the placeholder credential
 * {id: REPLACE_WITH_YOUR_AZURE_OPENAI_CRED_ID, name: "Azure OpenAI account"}.
 * Before pushing, each Azure model node is bound to a real credential, first
 * match wins:
 *   1. the credential the SAME node already has in the live workflow (update)
 *   2. N8N_AZURE_CREDENTIAL_ID
 *   3. the Azure OpenAI credential any other workflow on the instance uses
 * If none is found the placeholder is kept and a warning printed: attach the
 * credential in the n8n editor before activating. The file is never modified.
 *
 * SETTINGS. The public API rejects unknown settings keys; only the keys it
 * accepts are sent. `timezone` matters: the nightly cron runs in it.
 *
 * ACTIVATION is opt-in (--activate). n8n serves one active workflow per
 * webhook path, so any other active workflow on the same path is deactivated
 * first.
 *
 * --dry-run lists what would happen. Without N8N_API_KEY it works offline and
 * only prints the payload summary.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || args.includes('--dry');
const ACTIVATE = args.includes('--activate');
const DIR = path.resolve(__dirname, '..');
const fileArgs = args.filter((a) => !a.startsWith('--'));
const files = fileArgs.length
  ? fileArgs.map((f) => path.resolve(f))
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(DIR, f));

const BASE = (process.env.N8N_URL || 'http://localhost:5680').replace(/\/+$/, '');
const KEY = (process.env.N8N_API_KEY || '').trim();
const CRED_ID = (process.env.N8N_AZURE_CREDENTIAL_ID || '').trim();
const PLACEHOLDER = /^REPLACE_/;
const ALLOWED_SETTINGS = ['executionOrder', 'timezone', 'executionTimeout', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'callerPolicy', 'errorWorkflow'];

if (!KEY && !DRY) {
  console.error('N8N_API_KEY is not set. Create one in n8n (Settings > n8n API) or use --dry-run.');
  process.exit(1);
}

const isAzureModel = (n) => /lmChatAzureOpenAi$/.test(String(n.type));
const webhookPath = (wf) => ((wf.nodes || []).find((n) => /\.webhook$/.test(n.type)) || { parameters: {} }).parameters.path || null;

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* keep text */ }
  return { ok: res.ok, status: res.status, body: parsed, text };
}

async function listAll() {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 50; i += 1) {
    const r = await api('GET', '/api/v1/workflows?limit=250' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (!r.ok) throw new Error('cannot list workflows: ' + r.status + ' ' + r.text.slice(0, 200));
    out.push(...(r.body.data || []));
    cursor = r.body.nextCursor;
    if (!cursor) break;
  }
  return out;
}

const fullCache = new Map();
async function getFull(id) {
  if (!fullCache.has(id)) {
    const r = await api('GET', '/api/v1/workflows/' + id);
    fullCache.set(id, r.ok ? r.body : null);
  }
  return fullCache.get(id);
}

async function findDonorCredential(all, skipId) {
  for (const w of all) {
    if (w.isArchived || w.id === skipId) continue;
    const full = await getFull(w.id);
    const node = ((full && full.nodes) || []).find((n) => isAzureModel(n) && n.credentials && n.credentials.azureOpenAiApi && !PLACEHOLDER.test(String(n.credentials.azureOpenAiApi.id)));
    if (node) return { cred: node.credentials.azureOpenAiApi, from: w.name };
  }
  return null;
}

async function deploy(file, all) {
  const local = JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = local.name;
  const existing = all.find((w) => w.name === name && !w.isArchived) || null;
  const liveFull = existing ? await getFull(existing.id) : null;

  console.log((existing ? 'UPDATE ' : 'CREATE ') + name + (existing ? '  (id ' + existing.id + ')' : '') + (webhookPath(local) ? '  path /webhook/' + webhookPath(local) : '  (schedule)'));

  let donor = null;
  const nodes = [];
  for (const n of local.nodes || []) {
    if (!isAzureModel(n)) { nodes.push(n); continue; }
    let cred = null;
    let source = '';
    const liveNode = liveFull && (liveFull.nodes || []).find((x) => x.name === n.name && isAzureModel(x));
    if (liveNode && liveNode.credentials && liveNode.credentials.azureOpenAiApi && !PLACEHOLDER.test(String(liveNode.credentials.azureOpenAiApi.id))) {
      cred = liveNode.credentials.azureOpenAiApi; source = 'kept from the live workflow';
    } else if (CRED_ID) {
      cred = { id: CRED_ID, name: 'Azure OpenAI account' }; source = 'N8N_AZURE_CREDENTIAL_ID';
    } else if (KEY) {
      donor = donor || (await findDonorCredential(all, existing && existing.id));
      if (donor) { cred = donor.cred; source = 'borrowed from "' + donor.from + '"'; }
    }
    if (cred) {
      nodes.push({ ...n, credentials: { azureOpenAiApi: { id: cred.id, name: cred.name } } });
      console.log('   model "' + n.name + '": credential ' + cred.name + ' (' + cred.id + ') ' + source);
    } else {
      nodes.push(n);
      console.log('   WARN model "' + n.name + '": no Azure OpenAI credential found; attach "Azure OpenAI account" in the editor');
    }
  }

  const settings = {};
  ALLOWED_SETTINGS.forEach((k) => { if ((local.settings || {})[k] !== undefined) settings[k] = local.settings[k]; });
  const payload = { name, nodes, connections: local.connections, settings };

  if (DRY) { console.log('   (dry run: nothing sent)'); return true; }

  const res = existing
    ? await api('PUT', '/api/v1/workflows/' + existing.id, payload)
    : await api('POST', '/api/v1/workflows', payload);
  if (!res.ok) { console.error('   PUSH FAILED ' + res.status + ': ' + res.text.slice(0, 300)); return false; }
  const id = res.body.id;
  console.log('   pushed ok  id=' + id);

  if (ACTIVATE) {
    const p = webhookPath(local);
    if (p) {
      for (const w of all.filter((x) => x.active && x.id !== id)) {
        const full = await getFull(w.id);
        const clash = full && (full.nodes || []).some((n) => /\.webhook$/.test(n.type) && n.parameters && n.parameters.path === p);
        if (clash) {
          const off = await api('POST', '/api/v1/workflows/' + w.id + '/deactivate');
          console.log('   deactivated "' + w.name + '" (same webhook path) -> ' + off.status);
        }
      }
    }
    const act = await api('POST', '/api/v1/workflows/' + id + '/activate');
    console.log('   activate -> ' + (act.ok ? 'ok' : act.status + ' ' + act.text.slice(0, 200)));
    if (!act.ok) return false;
  }
  return true;
}

(async () => {
  console.log('n8n: ' + BASE + (DRY ? '  [dry run]' : '') + (ACTIVATE ? '  [activate]' : ''));
  let all = [];
  if (KEY) {
    try { all = await listAll(); } catch (e) { console.error(e.message); process.exit(1); }
    console.log(all.length + ' workflow(s) on the instance');
  } else {
    console.log('no N8N_API_KEY: offline dry run, every file shown as CREATE');
  }
  let ok = true;
  for (const f of files) {
    try { ok = (await deploy(f, all)) && ok; } catch (e) { console.error('   ERROR ' + path.basename(f) + ': ' + e.message); ok = false; }
  }
  process.exit(ok ? 0 : 1);
})();
