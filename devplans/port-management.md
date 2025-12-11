---
description: freeing local dev ports 3003-3007
---

## Context
- Ports 3003-3007 kept reopening with orphaned node processes.
- Required clean slate before continuing lightweight-charts work.

## Actions performed
1. Enumerated listeners with:
   ```powershell
   for ($port=3003; $port -le 3007; $port++) {
       Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
           Select-Object LocalPort,State,OwningProcess
   }
   ```
2. Terminated the reported PIDs (29428, 29500, 42160) via `Stop-Process -Id ... -Force`.
3. Re-ran the listener check to confirm all target ports are now free.

## Follow-ups / decisions
- Decide whether to standardize on a single dev server port to avoid conflicts.
- Consider wrapping the check/teardown commands into a helper script for repeatability (PowerShell + pnpm context).
- Monitor for any service that keeps auto-spawning on these ports and document mitigation if it repeats.
