#!/usr/bin/env bash
# POST the sample payloads (n8n/samples/*.json) to each POVO AI Guidance
# webhook of a running n8n and print the responses.
#
#   n8n/tools/test-webhooks.sh                 # http://localhost:5680, /webhook/
#   N8N_URL=http://vm:5678 n8n/tools/test-webhooks.sh
#   n8n/tools/test-webhooks.sh --test          # /webhook-test/ (editor "Listen for test event")
#
# Production URLs answer only when the workflow is ACTIVE. Every response
# must be {ok:true, ...payload} or {ok:false, reason}.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SAMPLES="$HERE/../samples"
BASE="${N8N_URL:-http://localhost:5680}"
BASE="${BASE%/}"
PREFIX="webhook"
[ "${1:-}" = "--test" ] && PREFIX="webhook-test"

failed=0
for pair in \
  "povo-call-prep:call-prep.json" \
  "povo-compliance-check:compliance-check.json" \
  "povo-compliance-check:compliance-check-additional.json" \
  "povo-next-call:next-call.json"; do
  path="${pair%%:*}"; file="${pair#*:}"
  url="$BASE/$PREFIX/$path"
  echo
  echo "== $file  POST $url"
  out="$(curl -sS -m 60 -w '\n%{http_code} %{time_total}s' -H 'Content-Type: application/json' --data-binary "@$SAMPLES/$file" "$url")" || { echo "   REQUEST FAILED"; failed=$((failed+1)); continue; }
  body="$(printf '%s' "$out" | sed '$d')"
  meta="$(printf '%s' "$out" | tail -n1)"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(JSON.stringify(j,null,2));console.log(j.ok===true?"   ok:true":j.ok===false?"   ok:false ("+j.reason+") - backend would fall back to rules":"   NOT A CONTRACT RESPONSE")}catch(e){console.log(s)}})'
  else
    printf '%s\n' "$body"
  fi
  echo "   HTTP $meta"
  case "$meta" in 2*) ;; *) failed=$((failed+1));; esac
done
echo
[ "$failed" -gt 0 ] && { echo "$failed request(s) failed"; exit 1; }
echo "done"
