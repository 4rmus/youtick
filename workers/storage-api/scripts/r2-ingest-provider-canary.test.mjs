import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseParts,
    parseUploadId,
    presignPart,
    readConfig,
} from './r2-ingest-provider-canary.mjs';

const env = {
    R2_CANARY_ACK: 'run-paid-media-v4-r2-provider-canary',
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    R2_BUCKET: 'youtick-paid-media-canary',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_CANARY_ORIGIN: 'http://localhost:4173',
};

test('config is explicit and fixed to the private EU canary scope', () => {
    const config = readConfig(env);
    assert.equal(config.endpoint, `https://${'a'.repeat(32)}.eu.r2.cloudflarestorage.com`);
    assert.throws(() => readConfig({ ...env, R2_CANARY_ACK: undefined }), /R2_CANARY_ACK/);
    assert.throws(
        () => readConfig({ ...env, R2_CANARY_ORIGIN: 'https://wrong.invalid' }),
        /missing_or_invalid_r2_canary_config/,
    );
});

test('part grant signs exact length and origin without returning secrets', async () => {
    const config = readConfig(env);
    const grant = await presignPart(config, {
        expectedBytes: 7,
        key: 'raw/jobs/job-1/1/source',
        partNumber: 2,
        uploadId: 'upload-12345678',
        now: new Date('2026-07-31T00:00:00Z'),
    });
    const url = new URL(grant.url);
    assert.equal(url.hostname, `${'a'.repeat(32)}.eu.r2.cloudflarestorage.com`);
    assert.equal(
        url.searchParams.get('X-Amz-SignedHeaders'),
        'content-length;content-type;host;origin',
    );
    assert.equal(JSON.stringify(grant).includes('secret-key'), false);
});

test('multipart XML parsing keeps exact provider order, ETags and lengths', () => {
    assert.equal(
        parseUploadId('<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>'),
        'upload-1',
    );
    assert.deepEqual(parseParts(`
        <ListPartsResult>
          <Part><PartNumber>2</PartNumber><ETag>&quot;bbbb&quot;</ETag><Size>7</Size></Part>
          <Part><PartNumber>1</PartNumber><ETag>&quot;aaaa&quot;</ETag><Size>67108864</Size></Part>
        </ListPartsResult>
    `), [
        { partNumber: 1, etag: '"aaaa"', size: 67_108_864 },
        { partNumber: 2, etag: '"bbbb"', size: 7 },
    ]);
});
