<#
    POST the sample payloads (n8n/samples/*.json) to each POVO AI Guidance
    webhook of a running n8n and print the responses.

        .\n8n\tools\test-webhooks.ps1                          # http://localhost:5680, production /webhook/
        .\n8n\tools\test-webhooks.ps1 -N8nUrl http://vm:5678
        .\n8n\tools\test-webhooks.ps1 -Test                    # /webhook-test/ (editor "Listen for test event")
        .\n8n\tools\test-webhooks.ps1 -Only compliance-check

    Production URLs answer only when the workflow is ACTIVE. Every response
    must be {ok:true, ...payload} or {ok:false, reason}.
#>
param(
    [string]$N8nUrl = $(if ($env:N8N_URL) { $env:N8N_URL } else { "http://localhost:5680" }),
    [switch]$Test,
    [string]$Only = "",
    [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"
$samples = Join-Path (Split-Path -Parent $PSScriptRoot) "samples"
$prefix = if ($Test) { "webhook-test" } else { "webhook" }
$base = $N8nUrl.TrimEnd('/')

$cases = @(
    @{ Name = "call-prep";                   Path = "povo-call-prep";        File = "call-prep.json" },
    @{ Name = "compliance-check";            Path = "povo-compliance-check"; File = "compliance-check.json" },
    @{ Name = "compliance-check-additional"; Path = "povo-compliance-check"; File = "compliance-check-additional.json" },
    @{ Name = "next-call";                   Path = "povo-next-call";        File = "next-call.json" }
)

$failed = 0
foreach ($c in $cases) {
    if ($Only -and $c.Name -notlike "$Only*") { continue }
    $url = "$base/$prefix/$($c.Path)"
    $body = Get-Content -Raw -Encoding UTF8 (Join-Path $samples $c.File)
    Write-Host ""
    Write-Host "== $($c.Name)  POST $url" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json; charset=utf-8" `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec $TimeoutSec
        $sw.Stop()
        $resp | ConvertTo-Json -Depth 10 | Write-Host
        if ($null -eq $resp.ok) { Write-Host "   NOT A CONTRACT RESPONSE (no 'ok' field)" -ForegroundColor Red; $failed++ }
        elseif ($resp.ok) { Write-Host ("   ok:true  in {0:N1}s" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green }
        else { Write-Host ("   ok:false ({0})  in {1:N1}s - the backend would fall back to rules" -f $resp.reason, $sw.Elapsed.TotalSeconds) -ForegroundColor Yellow }
    }
    catch {
        $sw.Stop()
        Write-Host "   REQUEST FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}
Write-Host ""
if ($failed) { Write-Host "$failed request(s) failed" -ForegroundColor Red; exit 1 }
Write-Host "done"
