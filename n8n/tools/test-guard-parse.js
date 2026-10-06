#!/usr/bin/env node
/**
 * TEST THE GUARD'S TOLERANT PARSE - no n8n, no model needed
 * =============================================================================
 *   node n8n/tools/test-guard-parse.js
 *
 * Pulls firstObject() and unwrap() out of each webhook workflow's Guard node
 * (the exact code n8n runs) and feeds them model outputs seen in practice,
 * including the Claude answer with a stray closing brace that the old strict
 * Structured Output Parser rejected. Exit code 1 if any case fails.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const FILES = [
  'POVO AI Guidance - Call Prep v1.json',
  'POVO AI Guidance - Compliance Check v1.json',
  'POVO AI Guidance - Example Notes v1.json',
  'POVO AI Guidance - Next Call v1.json',
];

const PAYLOAD = { issues: [{ rule_id: 'claim', excerpt: 'HiSCR50 data', why: 'x' }], suggested_text: 'ok' };
const BODY = JSON.stringify(PAYLOAD);
const CASES = [
  { name: 'plain JSON', input: BODY, expect: PAYLOAD },
  { name: 'code fences', input: '```json\n' + BODY + '\n```', expect: PAYLOAD },
  { name: 'stray closing brace (Claude, run 215)', input: '```json\n{"output":' + BODY + '}}\n```', expect: PAYLOAD },
  { name: 'prose before and after', input: 'Here is the result:\n' + BODY + '\nLet me know.', expect: PAYLOAD },
  { name: 'braces inside strings', input: '{"suggested_text":"use {curly} and \\"quotes\\"","issues":[]}}', expect: { suggested_text: 'use {curly} and "quotes"', issues: [] } },
  { name: 'chain wrapper {text}', input: { text: BODY }, expect: PAYLOAD },
  { name: 'parser wrapper {output}', input: { output: PAYLOAD }, expect: PAYLOAD },
  { name: 'no JSON at all', input: 'I cannot help with that.', expect: null },
  { name: 'cut off mid-object', input: '{"issues":[{"rule_id":"claim"', expect: null },
];

function guardFunctions(file) {
  const wf = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const guard = wf.nodes.find((n) => n.name === 'Guard');
  if (!guard) throw new Error('no Guard node');
  const code = guard.parameters.jsCode;
  const start = code.indexOf('function firstObject');
  const unwrapAt = code.indexOf('function unwrap(');
  if (start < 0) throw new Error('Guard has no firstObject() (tolerant parse missing)');
  const end = code.indexOf('\n}\n', unwrapAt) + 3;
  if (wf.nodes.some((n) => n.type === '@n8n/n8n-nodes-langchain.outputParserStructured')) {
    throw new Error('a Structured Output Parser is still attached');
  }
  // eslint-disable-next-line no-new-func
  return new Function(code.slice(start, end) + '\nreturn unwrap;')();
}

let failed = 0;
for (const file of FILES) {
  let unwrap;
  try {
    unwrap = guardFunctions(file);
  } catch (e) {
    console.log('FAIL  ' + file + '\n        - ' + e.message);
    failed += 1;
    continue;
  }
  const bad = CASES.filter((c) => JSON.stringify(unwrap(c.input)) !== JSON.stringify(c.expect));
  if (bad.length) {
    failed += 1;
    console.log('FAIL  ' + file);
    bad.forEach((c) => console.log('        - ' + c.name + ': got ' + JSON.stringify(unwrap(c.input))));
  } else {
    console.log('ok    ' + file + '  (' + CASES.length + ' cases)');
  }
}
console.log('\n' + FILES.length + ' workflow(s), ' + failed + ' failed');
process.exit(failed ? 1 : 0);
