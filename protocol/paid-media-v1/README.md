# paid-media-v1: Cloudflare Stream profile descriptor

Market V2 publications carry the provider-neutral profile id `paid-media-v1` and a
`profile_config_sha256`. The contract pins the id and accepts any 64-hex hash; the hash tells the
Bridge which media adapter and which verification rules apply to the job.

`stream-profile.json` holds one entry, `stream`, for Cloudflare Stream. Its hash does not describe
anything Stream consumes: Stream encodes a fixed ladder chosen by Cloudflare and takes no profile
input. The hash binds the Bridge's verification spec for that ladder:

- `provider`, `container` (`fmp4`) and `codec` (`h264`): the delivery the Bridge expects to find.
- `policy`: every upload requires signed URLs, and the viewer token travels in the URL path.
- `maxDurationSecondsCap`: the largest `maxDurationSeconds` the Bridge may book for one upload.
- `profiles`: the rendition heights the Bridge requires before it finalizes a publication, capped
  by the source height (a 720p source is not expected to have a 1080p rendition).

A change to any of these is a new descriptor with a new hash; publications keep the hash they were
finalized with, so a published hash is never edited in place.

## Hash rule

`hash` is the SHA-256 (lowercase hex) of the UTF-8 JSON of the entry without its `hash` field,
object keys sorted recursively, arrays in order, no whitespace. This is the `sortedJson` rule of
`scripts/check-paid-media-livepeer-v1.mjs`:

```js
const sortedJson = (value) => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const { hash, ...entry } = descriptor.stream;
createHash("sha256").update(sortedJson(entry)).digest("hex") === hash;
```

## Relation to `protocol/paid-media-livepeer-v1`

The V1 catalog `protocol/paid-media-livepeer-v1/profiles.json` stays frozen: its checker asserts
every entry against `contracts/nft-ticket`. The Bridge reads both files: Studio hashes select the
Studio adapter, the hash above selects the Stream adapter, and each adapter refuses the other's
hashes.
