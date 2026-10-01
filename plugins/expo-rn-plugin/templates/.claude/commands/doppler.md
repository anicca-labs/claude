---
name: doppler
description: Add a new secret/env var to Doppler and sync it locally
argument-hint: "<VAR_NAME=value>"
---

To add a new secret (`$ARGUMENTS`):

1. Add to `env.template.yaml`:
   ```yaml
   VAR_NAME={{ .VAR_NAME }}
   ```

2. Set in all Doppler configs (dev and stg yourself; **prd only with the human's explicit approval**, or hand them the command):
   ```bash
   doppler secrets set VAR_NAME="value" --project mobile --config dev
   doppler secrets set VAR_NAME="value" --project mobile --config stg
   doppler secrets set VAR_NAME="value" --project mobile --config prd
   ```

3. Sync to local `.env`:
   ```bash
   yarn sync-env-vars
   ```

Use `EXPO_PUBLIC_` prefix for vars accessed in client-side code.
