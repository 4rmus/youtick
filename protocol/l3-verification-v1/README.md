# L3 verification queue v1

The queue message is a pointer to immutable state in `MediaJobState`. It carries
no media bytes, URLs, CID, expected hash, object length, provider credential, or
secret. The verifier must claim the exact task from the job Durable Object
before reading either L3 or the CID gateway.

`verificationId` is lower-hex SHA-256 of these UTF-8 fields joined by a single
NUL byte, with no trailing delimiter:

1. `youtick.l3-readback.verify.v1`
2. authority digest
3. job ID
4. decimal generation
5. reservation ID
6. decimal ordinal
7. exact provider key
8. decimal byte length
9. ciphertext SHA-256

The Durable Object alone derives and stores this ID during
`RESERVED -> VERIFY_PENDING`. Consumers never choose it.

The checked-in golden vector also fixes the live Lighthouse CID boundary:
`providerCid` is the exact CIDv0 returned by L3 and used for gateway readback;
`manifestCid` is its deterministic lowercase CIDv1/dag-pb form. Only the
CIDv1 value may cross the Durable Object and `StorageManifestV1` boundary.

The state transition and the `PENDING` outbox record commit in one Durable
Object transaction. Queue send happens afterward. A Durable Object alarm
retries a pending pointer after a send failure or process interruption; the
consumer must still treat Queue delivery as at-least-once and claim a live
lease before reading or committing any result. A successful claim also marks
the matching outbox record dispatched in the same transaction, closing the
producer-crash window where Queue delivery happened before the producer could
persist its dispatch marker.
