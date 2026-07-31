#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AwsClient, AwsV4Signer } from 'aws4fetch';

const ACK = 'run-paid-media-v4-r2-provider-canary';
const PART_BYTES = 64 * 1024 * 1024;
const LAST_PART_BYTES = 1024 * 1024;
const DEFAULT_ORIGIN = 'http://localhost:4173';

export function readConfig(env = process.env) {
    if (env.R2_CANARY_ACK !== ACK) {
        throw new Error(`R2_CANARY_ACK must equal ${ACK}`);
    }
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const bucket = env.R2_BUCKET?.trim();
    const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
    const origin = env.R2_CANARY_ORIGIN?.trim() || DEFAULT_ORIGIN;
    if (!/^[0-9a-f]{32}$/.test(accountId || '')
        || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '')
        || !accessKeyId
        || !secretAccessKey
        || origin !== DEFAULT_ORIGIN) {
        throw new Error('missing_or_invalid_r2_canary_config');
    }
    return {
        accessKeyId,
        accountId,
        bucket,
        endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
        origin,
        secretAccessKey,
    };
}

export async function presignPart(config, input) {
    const url = new URL(`${config.endpoint}/${config.bucket}/${input.key}`);
    url.searchParams.set('partNumber', String(input.partNumber));
    url.searchParams.set('uploadId', input.uploadId);
    url.searchParams.set('X-Amz-Expires', '600');
    const headers = {
        'content-length': String(input.expectedBytes),
        'content-type': 'application/octet-stream',
        origin: config.origin,
    };
    const signed = await new AwsV4Signer({
        method: 'PUT',
        url: url.toString(),
        headers,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
        datetime: (input.now || new Date()).toISOString().replace(/[:-]|\.\d{3}/g, ''),
        signQuery: true,
        allHeaders: true,
    }).sign();
    return {
        url: signed.url.toString(),
        headers: { 'Content-Type': 'application/octet-stream' },
    };
}

export function parseUploadId(xml) {
    return tag(xml, 'UploadId');
}

export function parseParts(xml) {
    return Array.from(xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g), (match) => ({
        partNumber: Number(tag(match[1], 'PartNumber')),
        etag: tag(match[1], 'ETag'),
        size: Number(tag(match[1], 'Size')),
    })).sort((left, right) => left.partNumber - right.partNumber);
}

export async function runCanary(config, fetchImpl = fetch) {
    const sourceBytes = PART_BYTES + LAST_PART_BYTES;
    const key = `raw/jobs/canary-${randomUUID()}/1/source`;
    const prefix = key.slice(0, key.lastIndexOf('/') + 1);
    const aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
    });
    const provider = providerClient(config, aws, fetchImpl);
    const checks = {};
    let uploadId;
    let completed = false;
    let failure;
    try {
        const preflight = await fetchImpl(`${config.endpoint}/${config.bucket}/${key}`, {
            method: 'OPTIONS',
            headers: {
                Origin: config.origin,
                'Access-Control-Request-Method': 'PUT',
                'Access-Control-Request-Headers': 'content-type',
            },
        });
        checks.cors = preflight.status === 204
            && preflight.headers.get('access-control-allow-origin') === config.origin
            && (preflight.headers.get('access-control-allow-methods') || '').includes('PUT')
            && !(preflight.headers.get('access-control-allow-origin') || '').includes('*');

        uploadId = await provider.createMultipart(key);
        const partOne = Buffer.alloc(PART_BYTES, 0x31);
        const partTwo = Buffer.alloc(LAST_PART_BYTES, 0x32);
        const expectedSha256 = createHash('sha256').update(partOne).update(partTwo).digest('hex');
        const grantOne = await presignPart(config, {
            expectedBytes: partOne.byteLength,
            key,
            partNumber: 1,
            uploadId,
        });
        const short = await upload(grantOne, partOne.subarray(0, LAST_PART_BYTES), config.origin, fetchImpl);
        checks.shortLengthDenied = short.status === 403;
        const wrongOrigin = await upload(grantOne, partOne, 'https://wrong-origin.invalid', fetchImpl);
        checks.wrongOriginDenied = wrongOrigin.status === 403;
        const wrongKeyUrl = new URL(grantOne.url);
        wrongKeyUrl.pathname = `${wrongKeyUrl.pathname}-wrong`;
        const wrongKey = await fetchImpl(wrongKeyUrl, {
            method: 'PUT',
            headers: { ...grantOne.headers, Origin: config.origin },
            body: partOne,
            redirect: 'manual',
        });
        checks.wrongPrefixDenied = wrongKey.status === 403;

        const uploadedOne = await upload(grantOne, partOne, config.origin, fetchImpl);
        requireStatus(uploadedOne, 200, 'upload_part_one');
        const partOneEtag = requiredEtag(uploadedOne);
        const resumed = await provider.listParts(key, uploadId);
        checks.resumeListsOnlyUploaded = resumed.length === 1
            && resumed[0].partNumber === 1
            && resumed[0].size === PART_BYTES;

        const grantTwo = await presignPart(config, {
            expectedBytes: partTwo.byteLength,
            key,
            partNumber: 2,
            uploadId,
        });
        const long = await upload(
            grantTwo,
            Buffer.concat([partTwo, Buffer.of(0)]),
            config.origin,
            fetchImpl,
        );
        checks.longLengthDenied = long.status === 403;
        const uploadedTwo = await upload(grantTwo, partTwo, config.origin, fetchImpl);
        requireStatus(uploadedTwo, 200, 'upload_part_two');
        const parts = await provider.listParts(key, uploadId);
        checks.exactProviderInventory = parts.length === 2
            && parts[0].partNumber === 1
            && parts[0].size === PART_BYTES
            && parts[1].partNumber === 2
            && parts[1].size === LAST_PART_BYTES;
        await provider.completeMultipart(key, uploadId, [
            { partNumber: 1, etag: partOneEtag },
            { partNumber: 2, etag: requiredEtag(uploadedTwo) },
        ]);
        completed = true;
        const head = await provider.headObject(key);
        checks.completedLengthExact = head.exists && head.byteLength === sourceBytes;
        const readback = await provider.getObject(key);
        checks.fullReadbackSha256 = readback.status === 200
            && createHash('sha256').update(Buffer.from(await readback.arrayBuffer())).digest('hex')
                === expectedSha256;
        await provider.deleteObject(key);
        const [deletedHead, deletedGet] = await Promise.all([
            provider.headObject(key),
            provider.getObject(key),
        ]);
        checks.deleteNotFound = !deletedHead.exists && deletedGet.status === 404;
        const [objects, uploads] = await Promise.all([
            provider.listObjects(prefix),
            provider.listMultipartUploads(prefix),
        ]);
        checks.zeroInventory = objects.count === 0
            && uploads.count === 0
            && !objects.truncated
            && !uploads.truncated;
        if (!Object.values(checks).every(Boolean)) {
            throw new Error('r2_provider_canary_failed');
        }
        return {
            schema: 'youtick.r2-ingest-provider-canary.v1',
            verdict: 'PASS',
            scope: 'SMALL_PROVIDER_CONTRACT_ONLY',
            sourceBytes,
            partCount: 2,
            accountSha256: sha256(config.accountId),
            bucketSha256: sha256(config.bucket),
            checks,
            caveats: [
                'Not a 20 GB or physical-device canary.',
                'Not a deployed Storage API or on-chain authorization canary.',
            ],
        };
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        try {
            if (uploadId && !completed) await provider.abortMultipart(key, uploadId);
            await provider.deleteObject(key);
            const [objects, uploads] = await Promise.all([
                provider.listObjects(prefix),
                provider.listMultipartUploads(prefix),
            ]);
            if (objects.count !== 0 || uploads.count !== 0) {
                throw new Error('r2_canary_cleanup_failed');
            }
        } catch (cleanupError) {
            if (!failure) throw cleanupError;
        }
    }
}

export function providerClient(config, aws, fetchImpl) {
    const bucketUrl = `${config.endpoint}/${config.bucket}`;
    const objectUrl = (key) => `${bucketUrl}/${key}`;
    const signed = (url, init) => aws.fetch(url, { ...init, fetch: fetchImpl });
    return {
        async createMultipart(key) {
            const response = await signed(`${objectUrl(key)}?uploads`, { method: 'POST' });
            requireStatus(response, 200, 'create_multipart');
            return parseUploadId(await response.text());
        },
        async listParts(key, uploadId) {
            const url = new URL(objectUrl(key));
            url.searchParams.set('uploadId', uploadId);
            const response = await signed(url, { method: 'GET' });
            requireStatus(response, 200, 'list_parts');
            return parseParts(await response.text());
        },
        async completeMultipart(key, uploadId, parts) {
            const url = new URL(objectUrl(key));
            url.searchParams.set('uploadId', uploadId);
            const body = `<CompleteMultipartUpload>${parts.map((part) => (
                `<Part><PartNumber>${part.partNumber}</PartNumber>`
                + `<ETag>${escapeXml(part.etag)}</ETag></Part>`
            )).join('')}</CompleteMultipartUpload>`;
            const response = await signed(url, {
                method: 'POST',
                headers: { 'content-type': 'application/xml' },
                body,
            });
            requireStatus(response, 200, 'complete_multipart');
        },
        async abortMultipart(key, uploadId) {
            const url = new URL(objectUrl(key));
            url.searchParams.set('uploadId', uploadId);
            const response = await signed(url, { method: 'DELETE' });
            if (![204, 404].includes(response.status)) {
                throw new Error(`abort_multipart_status_${response.status}`);
            }
        },
        async deleteObject(key) {
            const response = await signed(objectUrl(key), { method: 'DELETE' });
            if (![204, 404].includes(response.status)) {
                throw new Error(`delete_object_status_${response.status}`);
            }
        },
        async headObject(key) {
            const response = await signed(objectUrl(key), { method: 'HEAD' });
            if (response.status === 404) return { exists: false, byteLength: null };
            requireStatus(response, 200, 'head_object');
            return { exists: true, byteLength: Number(response.headers.get('content-length')) };
        },
        getObject(key) {
            return signed(objectUrl(key), { method: 'GET' });
        },
        async listObjects(prefix) {
            const url = new URL(bucketUrl);
            url.searchParams.set('list-type', '2');
            url.searchParams.set('prefix', prefix);
            const response = await signed(url, { method: 'GET' });
            requireStatus(response, 200, 'list_objects');
            const xml = await response.text();
            return { count: (xml.match(/<Key>/g) || []).length, truncated: tag(xml, 'IsTruncated') === 'true' };
        },
        async listMultipartUploads(prefix) {
            const url = new URL(bucketUrl);
            url.searchParams.set('uploads', '');
            url.searchParams.set('prefix', prefix);
            const response = await signed(url, { method: 'GET' });
            requireStatus(response, 200, 'list_multipart_uploads');
            const xml = await response.text();
            return { count: (xml.match(/<Upload>/g) || []).length, truncated: tag(xml, 'IsTruncated') === 'true' };
        },
    };
}

function upload(grant, body, origin, fetchImpl) {
    return fetchImpl(grant.url, {
        method: 'PUT',
        headers: { ...grant.headers, Origin: origin },
        body,
        redirect: 'manual',
    });
}

function requiredEtag(response) {
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('missing_upload_part_etag');
    return etag;
}

function requireStatus(response, status, operation) {
    if (response.status !== status) throw new Error(`${operation}_status_${response.status}`);
}

function tag(xml, name) {
    const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    if (!match) throw new Error(`missing_xml_${name}`);
    return match[1].trim()
        .replaceAll('&quot;', '"')
        .replaceAll('&#34;', '"')
        .replaceAll('&amp;', '&');
}

function escapeXml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const receipt = await runCanary(readConfig());
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
