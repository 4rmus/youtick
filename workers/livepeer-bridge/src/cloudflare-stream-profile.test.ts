import { expect, it } from 'vitest';
import descriptor from '../../../protocol/paid-media-v1/stream-profile.json';
import studioProfiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import {
    STREAM_PROFILE_HASH,
    describeMediaProfile,
    mediaProfileFamily,
    streamDescribeProfile,
    streamSupportsProfile,
    supportsMediaProfile,
} from './media-provider';
import { livepeerProfiles, livepeerSupportsProfile } from './livepeer-provider';
import { rawStreamFixture, streamFixtureNames, streamJson, streamText } from './stream-test-fixtures';

// The sortedJson rule of scripts/check-paid-media-livepeer-v1.mjs.
const sortedJson = (value: unknown) => JSON.stringify(value, (_key, entry) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
        : entry
));

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

it('pins the Stream descriptor hash to the sortedJson of the entry without its hash', async () => {
    const { hash, ...entry } = descriptor.stream;
    expect(await sha256(sortedJson(entry))).toBe(hash);
    expect(hash).toBe('1128da32be3187c804326ef68a3c4c5344b47fc956a09ee88f8c0779ea5f4c64');
    expect(STREAM_PROFILE_HASH).toBe(hash);
    expect(Object.keys(descriptor)).toEqual(['stream']);
    expect(entry).toEqual({
        provider: 'cloudflare-stream',
        container: 'fmp4',
        codec: 'h264',
        policy: { requireSignedURLs: true, tokenPlacement: 'path' },
        maxDurationSecondsCap: 7200,
        profiles: [
            { name: '240p', width: 426, height: 240 },
            { name: '360p', width: 640, height: 360 },
            { name: '480p', width: 852, height: 480 },
            { name: '720p', width: 1280, height: 720 },
            { name: '1080p', width: 1920, height: 1080 },
        ],
    });
});

it('unions both catalogs and keeps every hash in exactly one adapter', () => {
    const studioHashes = Object.values(studioProfiles).map((entry) => entry.hash);
    expect(studioHashes).not.toContain(STREAM_PROFILE_HASH);
    for (const hash of studioHashes) {
        expect(mediaProfileFamily(hash)).toBe('studio');
        expect(supportsMediaProfile(hash)).toBe(true);
        expect(livepeerSupportsProfile(hash)).toBe(true);
        expect(streamSupportsProfile(hash)).toBe(false);
        expect(() => streamDescribeProfile(hash)).toThrow('unsupported_profile');
        expect(describeMediaProfile(hash).renditions).toEqual(
            livepeerProfiles(hash).map(({ width, height }) => ({ width, height })),
        );
    }
    expect(mediaProfileFamily(STREAM_PROFILE_HASH)).toBe('stream');
    expect(livepeerSupportsProfile(STREAM_PROFILE_HASH)).toBe(false);
    expect(() => livepeerProfiles(STREAM_PROFILE_HASH)).toThrow('unsupported_profile');
    expect(streamDescribeProfile(STREAM_PROFILE_HASH).renditions.map((size) => size.height))
        .toEqual([240, 360, 480, 720, 1080]);
    for (const unknown of ['0'.repeat(64), '', null, 7, undefined]) {
        expect(mediaProfileFamily(unknown)).toBeNull();
        expect(supportsMediaProfile(unknown)).toBe(false);
        expect(() => describeMediaProfile(unknown)).toThrow('unsupported_profile');
    }
});

it('keeps the recorded Stream fixtures free of ids, tokens, keys and account values', async () => {
    const names = await streamFixtureNames();
    expect(names.length).toBeGreaterThanOrEqual(20);
    for (const name of names) {
        const text = await rawStreamFixture(name);
        // No 32-hex UID/account id/key id, no 64-hex signature, no JWT, no PEM, no bearer token.
        expect(text, name).not.toMatch(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/i);
        expect(text, name).not.toMatch(/[0-9a-f]{64}/i);
        expect(text, name).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
        expect(text, name).not.toMatch(/-----BEGIN|Bearer |sig1=[0-9a-f]/i);
        // Customer subdomains, segment parameters and the account path are placeholders only.
        expect(text, name).not.toMatch(/customer-(?!<CUSTOMER_CODE>)[^.]+\.cloudflarestream\.com/);
        expect(text, name).not.toMatch(/[?&][ps]=(?!<[PS]>)/);
        expect(text, name).not.toMatch(/accounts\/(?!<ACCOUNT_ID>)/);
    }
});

it('loads fixtures with synthetic substitutions only', async () => {
    const ready = await streamJson<{ result: { uid: string; size: number; status: { pctComplete: string } } }>(
        'video-ready-33.json',
    );
    expect(ready.result.uid).toMatch(/^[0-9a-f]{32}$/);
    expect(ready.result.size).toBe(20_000_000);
    expect(ready.result.status.pctComplete).toBe('33.000000');
    const master = await streamText('master.m3u8');
    expect(master.match(/#EXT-X-STREAM-INF:/g)).toHaveLength(5);
    expect(master).toMatch(/#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio"/);
    const variant = await streamText('variant.m3u8', { HEIGHT: '720' });
    expect(variant).toMatch(/#EXT-X-MAP:URI="\.\.\/\.\.\/[0-9a-f]{32}\/video\/720\/init\.mp4\?p=[^&]+&s=[0-9a-f]+"/);
    expect(variant).toMatch(/seg_1\.mp4\?p=/);
});
