# Lighthouse L3 real-account canary evidence v1

This evidence contract is separate from the runtime verification Queue
protocol. It records only allowlisted observations and never includes a
presigned URL, query value, credential, raw header map, raw response body,
stack trace, or raw error message.

The canary writes three unique-key 4 KiB synthetic objects in a confirmed dedicated
non-production bucket:

1. an exact PUT followed by HEAD, full L3 GET, full CID-gateway GET, two replay
   attempts, another full L3 GET, DELETE, signed HEAD/GET absence, one
   post-delete replay of the old PUT URL, final DELETE, and bounded cleanup
   convergence;
2. a one-byte-short PUT whose payload SHA-256 is correct but whose automatic
   request length differs from the signed `Content-Length`;
3. a 60-second PUT grant that first succeeds and is fully read back, is deleted,
   then is replayed after both wall and monotonic clocks exceed the TTL by a
   15-second safety margin. Only an unredirected provider `403`, followed by
   fresh signed HEAD/GET `404` results and bounded cleanup convergence, proves
   expiry enforcement.

All three key mappings are deleted and checked with HEAD/GET. DELETE does not erase the
IPFS/Filecoin content; the synthetic bytes may remain retrievable by CID.
Only the `x-amz-meta-cid` header is accepted. It must decode as canonical
CIDv0/base58btc dag-pb or lowercase CIDv1/base32 raw/dag-pb, using a 32-byte
sha2-256 multihash. For raw CIDv1, the multihash digest must equal the
ciphertext SHA-256.

Before mutation, the CLI creates a new mode `0600` recovery file at the
operator-provided absolute path. The evidence payload carries no raw bucket or
provider key. The recovery file remains after success because key deletion does
not erase the IPFS/Filecoin content.

The evidence payload uses RFC 8785 JSON Canonicalization Scheme. Consumers must
run `npm run check:canary-evidence -- <evidence.json>` or equivalently validate
the schema, match `provenance.evidenceSchemaSha256` to the schema bytes,
recompute `evidencePayloadSha256` over the canonical document without that final
field, and recompute the observation/check relationships.

`technicalResult=PASS` is only this bounded provider-contract result.
`verdict` remains `EVIDENCE_MISSING` until replay billing/quota, `aws-chunked`,
key rotation, exact 20 GB resume, Filecoin persistence, CDN, and playback gates
are independently proven.
