# Operator Configuration

## Security Notice

`mainnet-kms-operators.json` contains **dummy/example endpoints only**.
The real production endpoints are not stored in the repository.

## Required Action

1. **Never commit real operator endpoints to git.**
2. Store the real mainnet operator config in a secret manager:
   - 1Password (Secure Notes)
   - HashiCorp Vault
   - AWS Secrets Manager / GCP Secret Manager
   - Cloudflare Workers secrets (for the bootstrap script)
3. When running `bootstrap-registry-mainnet.js`, inject the real config via:
   - Environment variable (`KMS_OPERATORS_CONFIG`)
   - Or `KMS_OPERATORS_PATH=scripts/config/mainnet-kms-operators.local.json`.
     That `.local.json` file is ignored by git.

`mainnet-kms-operators.json` is tracked and must stay example-only. The
bootstrap script refuses example endpoints unless
`ALLOW_EXAMPLE_KMS_CONFIG=true` is set for local dry checks.

## Example Structure

See `mainnet-kms-operators.example.json` for the expected JSON schema.
All endpoint URLs must use `*.workers.dev` (or your custom domain) with
valid `transportPublicKey` values for Ed25519 signature verification.
