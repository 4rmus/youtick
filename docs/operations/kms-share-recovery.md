# KMS share backup and restore

Each operator backs up only its own `VIDEO_KEYS` namespace. Stored share records are already encrypted with that operator's `SHARE_STORAGE_KEY`; a backup never combines quorum shares or contains that secret.

## Backup

1. Export the operator namespace with Wrangler's remote KV bulk export into an encrypted, access-controlled temporary volume.
2. Record operator account, namespace ID, UTC time, object count and SHA-256 of the export.
3. Encrypt the export again with the operator's offline recovery key, upload it to the operator's independent vault, then securely remove the temporary plaintext export.
4. Keep `SHARE_STORAGE_KEY`, current `SHARE_STORAGE_KEY_VERSION`, and the immediately previous rotation key in a separate vault record. Never place them beside the export.

## Restore drill

Use a new disposable KV namespace and a non-production Worker environment:

1. Import one operator backup into the disposable namespace.
2. Configure only that operator's matching storage keys.
3. Verify `/live`, `/ready`, then retrieve a designated recovery fixture through the normal signed request path.
4. Verify a wrong storage key and a modified share commitment both fail closed.
5. Delete the disposable namespace and record hashes, test transaction/request IDs, duration and result.

Run the drill quarterly and before retiring a storage-key version. A production restore requires incident approval; never overwrite a healthy namespace in place.
