import { AwsV4Signer } from 'aws4fetch';
import {
    STORAGE_MANIFEST_V1_MAX_OBJECT_BYTES,
    STORAGE_MANIFEST_V1_MAX_OBJECTS,
} from '../../shared/src/storage-manifest-v1';

const LIGHTHOUSE_ENDPOINT = 'https://s3.lighthouse.storage';
const LIGHTHOUSE_REGION = 'auto';
const MAX_GRANT_TTL_SECONDS = 10 * 60;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const JOB_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export type L3ObjectDescriptor = {
    ordinal: number;
    ciphertextSha256: string;
    byteLength: number;
};

export type L3PutObjectGrant = {
    method: 'PUT';
    providerKey: string;
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
};

export type L3ReadObjectGrant = {
    providerKey: string;
    headUrl: string;
    getUrl: string;
    expiresAt: string;
};

export type SigV4Credentials = {
    accessKeyId: string;
    secretAccessKey: string;
};

type PresignRequest = {
    method: 'GET' | 'HEAD' | 'PUT';
    endpoint: string;
    region: string;
    canonicalPath: string;
    headers?: Record<string, string>;
    expiresInSeconds: number;
    now: Date;
    credentials: SigV4Credentials;
};

export function l3ProviderKey(jobId: string, descriptor: L3ObjectDescriptor): string {
    validateJobId(jobId);
    validateDescriptor(descriptor);
    return `jobs/${jobId}/objects/${descriptor.ordinal}-${descriptor.ciphertextSha256}`;
}

export async function presignL3PutObject(input: {
    bucket: string;
    jobId: string;
    descriptor: L3ObjectDescriptor;
    expiresInSeconds?: number;
    now?: Date;
    credentials: SigV4Credentials;
}): Promise<L3PutObjectGrant> {
    validateBucket(input.bucket);
    const providerKey = l3ProviderKey(input.jobId, input.descriptor);
    const expiresInSeconds = input.expiresInSeconds ?? MAX_GRANT_TTL_SECONDS;
    if (!Number.isInteger(expiresInSeconds)
        || expiresInSeconds < 1
        || expiresInSeconds > MAX_GRANT_TTL_SECONDS) {
        throw new Error('invalid_l3_grant_ttl');
    }

    const headers = {
        'content-length': String(input.descriptor.byteLength),
        'content-type': 'application/octet-stream',
        'x-amz-meta-youtick-ciphertext-sha256': input.descriptor.ciphertextSha256,
        'x-amz-meta-youtick-job-id': input.jobId,
        'x-amz-meta-youtick-object-ordinal': String(input.descriptor.ordinal),
    };
    const now = input.now ?? new Date();
    const url = await presignS3Request({
        method: 'PUT',
        endpoint: LIGHTHOUSE_ENDPOINT,
        region: LIGHTHOUSE_REGION,
        canonicalPath: `/${input.bucket}/${providerKey}`,
        headers,
        expiresInSeconds,
        now,
        credentials: input.credentials,
    });

    return {
        method: 'PUT',
        providerKey,
        url,
        headers: {
            'Content-Length': headers['content-length'],
            'Content-Type': headers['content-type'],
            'x-amz-meta-youtick-ciphertext-sha256': headers['x-amz-meta-youtick-ciphertext-sha256'],
            'x-amz-meta-youtick-job-id': headers['x-amz-meta-youtick-job-id'],
            'x-amz-meta-youtick-object-ordinal': headers['x-amz-meta-youtick-object-ordinal'],
        },
        expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    };
}

export async function presignL3ReadObject(input: {
    bucket: string;
    jobId: string;
    descriptor: L3ObjectDescriptor;
    expiresInSeconds: number;
    now?: Date;
    credentials: SigV4Credentials;
}): Promise<L3ReadObjectGrant> {
    validateBucket(input.bucket);
    const providerKey = l3ProviderKey(input.jobId, input.descriptor);
    if (!Number.isInteger(input.expiresInSeconds)
        || input.expiresInSeconds < 1
        || input.expiresInSeconds > MAX_GRANT_TTL_SECONDS) {
        throw new Error('invalid_l3_read_ttl');
    }
    const now = input.now ?? new Date();
    const common = {
        endpoint: LIGHTHOUSE_ENDPOINT,
        region: LIGHTHOUSE_REGION,
        canonicalPath: `/${input.bucket}/${providerKey}`,
        expiresInSeconds: input.expiresInSeconds,
        now,
        credentials: input.credentials,
    };
    const [headUrl, getUrl] = await Promise.all([
        presignS3Request({ ...common, method: 'HEAD' }),
        presignS3Request({ ...common, method: 'GET' }),
    ]);
    return {
        providerKey,
        headUrl,
        getUrl,
        expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000).toISOString(),
    };
}

export async function presignS3Request(input: PresignRequest): Promise<string> {
    const endpoint = new URL(input.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
        throw new Error('invalid_s3_endpoint');
    }
    if (!Number.isInteger(input.expiresInSeconds)
        || input.expiresInSeconds < 1
        || input.expiresInSeconds > 7 * 24 * 60 * 60) {
        throw new Error('invalid_presign_ttl');
    }
    if (!Number.isFinite(input.now.getTime())) {
        throw new Error('invalid_presign_time');
    }
    if (!input.credentials.accessKeyId || !input.credentials.secretAccessKey) {
        throw new Error('missing_sigv4_credentials');
    }
    if (!input.canonicalPath.startsWith('/')
        || input.canonicalPath.includes('//')
        || input.canonicalPath.includes('?')
        || input.canonicalPath.includes('#')) {
        throw new Error('invalid_s3_path');
    }

    const url = new URL(`${endpoint.origin}${input.canonicalPath}`);
    url.searchParams.set('X-Amz-Expires', String(input.expiresInSeconds));
    const signed = await new AwsV4Signer({
        method: input.method,
        url: url.toString(),
        headers: input.headers,
        accessKeyId: input.credentials.accessKeyId,
        secretAccessKey: input.credentials.secretAccessKey,
        service: 's3',
        region: input.region,
        datetime: input.now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
        signQuery: true,
        allHeaders: true,
    }).sign();
    return signed.url.toString();
}

function validateJobId(jobId: string): void {
    if (!JOB_ID_PATTERN.test(jobId)) {
        throw new Error('invalid_job_id');
    }
}

function validateBucket(bucket: string): void {
    if (!BUCKET_PATTERN.test(bucket)
        || bucket.includes('..')
        || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)) {
        throw new Error('invalid_l3_bucket');
    }
}

function validateDescriptor(descriptor: L3ObjectDescriptor): void {
    if (!Number.isInteger(descriptor.ordinal)
        || descriptor.ordinal < 0
        || descriptor.ordinal >= STORAGE_MANIFEST_V1_MAX_OBJECTS
        || !Number.isSafeInteger(descriptor.byteLength)
        || descriptor.byteLength < 17
        || descriptor.byteLength > STORAGE_MANIFEST_V1_MAX_OBJECT_BYTES
        || !SHA256_PATTERN.test(descriptor.ciphertextSha256)) {
        throw new Error('invalid_object_descriptor');
    }
}
