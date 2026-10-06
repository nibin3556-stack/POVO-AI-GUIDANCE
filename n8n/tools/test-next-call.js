#!/usr/bin/env node
/**
 * TEST THE NEXT CALL BUILD PROMPT AND GUARD - no n8n, no model needed
 * =============================================================================
 *   node n8n/tools/test-next-call.js
 *
 * Runs the exact Build Prompt and Guard code of the Next Call workflow on
 * samples/next-call.json (call history and messaging candidates included),
 * then feeds the Guard model answers: a good pick, a pick outside the
 * candidates, a repeated id, an insight with an invented figure, and no pick.
 * Exit code 1 if any case fails.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const wf = JSON.parse(fs.readFileSync(path.join(DIR, 'POVO AI Guidance - Next Call v1.json'), 'utf8'));
const code = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const sample = JSON.parse(fs.readFileSync(path.join(DIR, 'samples', 'next-call.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const run = async (js, input, built) => {
  const $input = { first: () => ({ json: input }) };
  const $ = () => ({ first: () => ({ json: built }) });
  return new AsyncFunction('$input', '$', js)($input, $);
};

const STATES = [{ point_id: 'OBJ-JAK-01', state: 'open' }, { point_id: 'OBJ-BIO-01', state: 'resolved' }];
const BASE = { objection_states: STATES, summary: 'Dr. Whitfield engaged with the efficacy data; the switching concern is still open.', next_best_action: 'Lead with the lesion and pain message and clear the switching concern first.' };

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failed += 1;
};

(async () => {
  const [built] = await run(code('Build Prompt'), { body: sample });
  const b = built.json;
  check('request is valid', b.valid === true, JSON.stringify(b));
  check('candidates reach the Guard', JSON.stringify(b.candidate_ids) === JSON.stringify(sample.messaging_candidates.map((c) => c.point_id)), b.candidate_ids);
  check('history is in the prompt', b.user_prompt.includes('call 2026-09-02') && b.user_prompt.includes('Asked for the lesion and pain slides'), '');
  check('brand comes from the request', b.system_prompt.includes(sample.brand.name), '');

  const guard = async (out) => (await run(code('Guard'), { output: JSON.stringify(out) }, b))[0].json;

  const ids = b.candidate_ids;
  let r = await guard({ ...BASE, next_messaging: { ordered_point_ids: [ids[1], ids[0]], insights: { [ids[1]]: 'Asked for the lesion and pain slides on 09/30; open with them.', [ids[0]]: 'Built on the well received Week 12 message.' } } });
  check('a good pick is kept, in order', r.ok && JSON.stringify(r.next_messaging.ordered_point_ids) === JSON.stringify([ids[1], ids[0]]), JSON.stringify(r));
  check('insights are kept', r.next_messaging && Object.keys(r.next_messaging.insights).length === 2, JSON.stringify(r));

  r = await guard({ ...BASE, next_messaging: { ordered_point_ids: ['MADE-UP'], insights: {} } });
  check('a pick outside the candidates is dropped, the rest still ok', r.ok && !r.next_messaging && r.summary, JSON.stringify(r));

  r = await guard({ ...BASE, next_messaging: { ordered_point_ids: [ids[0], ids[0]], insights: {} } });
  check('a repeated id drops the pick', r.ok && !r.next_messaging, JSON.stringify(r));

  r = await guard({ ...BASE, next_messaging: { ordered_point_ids: [ids[0]], insights: { [ids[0]]: 'Cuts lesions by 73% at Week 12.' } } });
  check('an insight with an invented figure is dropped', r.ok && r.next_messaging && !r.next_messaging.insights[ids[0]], JSON.stringify(r));

  r = await guard({ ...BASE, next_messaging: { ordered_point_ids: ids, insights: {} } });
  check('at most max_messaging ids are kept', r.ok && r.next_messaging.ordered_point_ids.length === b.max_messaging, JSON.stringify(r));

  r = await guard(BASE);
  check('no pick is fine', r.ok && !r.next_messaging, JSON.stringify(r));

  console.log(`\n${failed ? `${failed} failed` : 'all passed'}`);
  process.exit(failed ? 1 : 0);
})();
