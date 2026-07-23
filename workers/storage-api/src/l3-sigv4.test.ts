import { describe, expect, it } from 'vitest';
import {
    l3ProviderKey,
    presignL3ReadObject,
    presignL3PutObject,
    presignS3Request,
} from './l3-sigv4';

const credentials = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

describe('Lighthouse L3 SigV4', () => {
    it('matches the official AWS S3 presigned URL example', async () => {
        const url = await presignS3Request({
            method: 'GET',
            endpoint: 'https://examplebucket.s3.amazonaws.com',
            region: 'us-east-1',
            canonicalPath: '/test.txt',
            expiresInSeconds: 86_400,
            now: new Date('2013-05-24T00:00:00.000Z'),
            credentials,
        });

        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe(
            'https://examplebucket.s3.amazonaws.com/test.txt',
        );
        expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
            'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request',
        );
        expect(parsed.searchParams.get('X-Amz-Signature')).toBe(
            'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
        );
    });

    it('binds a PUT grant to the exact L3 key, length and expected-hash metadata', async () => {
        const descriptor = {
            ordinal: 7,
            ciphertextSha256: 'ab'.repeat(32),
            byteLength: 1_048_592,
        };
        const grant = await presignL3PutObject({
            bucket: 'youtick-testnet',
            jobId: 'job-01hxyz',
            descriptor,
            expiresInSeconds: 600,
            now: new Date('2026-07-23T10:20:30.000Z'),
            credentials,
        });
        const url = new URL(grant.url);

        expect(grant.method).toBe('PUT');
        expect(grant.providerKey).toBe(`jobs/job-01hxyz/objects/7-${'ab'.repeat(32)}`);
        expect(url.origin).toBe('https://s3.lighthouse.storage');
        expect(url.pathname).toBe(`/youtick-testnet/${grant.providerKey}`);
        expect(url.searchParams.get('X-Amz-Credential')).toBe(
            'AKIAIOSFODNN7EXAMPLE/20260723/auto/s3/aws4_request',
        );
        expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
            'content-length;content-type;host;x-amz-meta-youtick-ciphertext-sha256;'
            + 'x-amz-meta-youtick-job-id;x-amz-meta-youtick-object-ordinal',
        );
        expect(url.searchParams.get('X-Amz-Signature')).toBe(
            '82363e798ecde29b138c3250737539a21d87ace6199a4817f491df7c48cf5ec8',
        );
        expect(grant.headers).toEqual({
            'Content-Length': '1048592',
            'Content-Type': 'application/octet-stream',
            'x-amz-meta-youtick-ciphertext-sha256': 'ab'.repeat(32),
            'x-amz-meta-youtick-job-id': 'job-01hxyz',
            'x-amz-meta-youtick-object-ordinal': '7',
        });
        expect(grant.expiresAt).toBe('2026-07-23T10:30:30.000Z');
        expect(grant.url).not.toContain(credentials.secretAccessKey);
    });

    it('rejects mutable keys, oversized objects and long grants', async () => {
        expect(() => l3ProviderKey('job/other', {
            ordinal: 0,
            ciphertextSha256: 'ab'.repeat(32),
            byteLength: 17,
        })).toThrow('invalid_job_id');
        expect(() => l3ProviderKey('job-1', {
            ordinal: 10_000,
            ciphertextSha256: 'ab'.repeat(32),
            byteLength: 17,
        })).toThrow('invalid_object_descriptor');

        await expect(presignL3PutObject({
            bucket: 'youtick-testnet',
            jobId: 'job-1',
            descriptor: {
                ordinal: 0,
                ciphertextSha256: 'ab'.repeat(32),
                byteLength: 64 * 1024 * 1024 + 1,
            },
            credentials,
        })).rejects.toThrow('invalid_object_descriptor');

        await expect(presignL3PutObject({
            bucket: 'youtick-testnet',
            jobId: 'job-1',
            descriptor: {
                ordinal: 0,
                ciphertextSha256: 'ab'.repeat(32),
                byteLength: 17,
            },
            expiresInSeconds: 601,
            credentials,
        })).rejects.toThrow('invalid_l3_grant_ttl');
    });

    it('creates short exact-key HEAD and GET read capabilities', async () => {
        const grant = await presignL3ReadObject({
            bucket: 'youtick-testnet',
            jobId: 'job-01hxyz',
            descriptor: {
                ordinal: 7,
                ciphertextSha256: 'ab'.repeat(32),
                byteLength: 1_048_592,
            },
            expiresInSeconds: 360,
            now: new Date('2026-07-23T10:20:30.000Z'),
            credentials,
        });
        const head = new URL(grant.headUrl);
        const get = new URL(grant.getUrl);

        expect(head.origin + head.pathname).toBe(get.origin + get.pathname);
        expect(head.pathname).toBe(`/youtick-testnet/${grant.providerKey}`);
        expect(head.searchParams.get('X-Amz-Expires')).toBe('360');
        expect(get.searchParams.get('X-Amz-Expires')).toBe('360');
        expect(head.searchParams.get('X-Amz-Signature'))
            .not.toBe(get.searchParams.get('X-Amz-Signature'));
        expect(grant.expiresAt).toBe('2026-07-23T10:26:30.000Z');
        expect(grant.headUrl + grant.getUrl).not.toContain(credentials.secretAccessKey);
    });
});
