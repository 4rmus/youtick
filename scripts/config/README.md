# Operator Configuration

## Security Notice — Faz 1 (2026-04-23)

`mainnet-kms-operators.json` now contains **dummy/example endpoints only**.
The real production endpoints have been removed from the repository.

## Required Action

1. **Never commit real operator endpoints to git.**
2. Store the real `mainnet-kms-operators.json` in a secret manager:
   - 1Password (Secure Notes)
   - HashiCorp Vault
   - AWS Secrets Manager / GCP Secret Manager
   - Cloudflare Workers secrets (for the bootstrap script)
3. When running `bootstrap-registry-mainnet.js`, inject the real config via:
   - Environment variable (`KMS_OPERATORS_CONFIG`)
   - Or temporarily place the real file here **outside of git** (it is ignored).

## Example Structure

See `mainnet-kms-operators.example.json` for the expected JSON schema.
All endpoint URLs must use `*.workers.dev` (or your custom domain) with
valid `transportPublicKey` values for Ed25519 signature verification.
