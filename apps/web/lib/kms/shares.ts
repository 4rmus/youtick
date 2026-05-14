import { base64Decode, base64Encode } from '../crypto/codec';

const FIELD_POLY = 0x11b;

export interface SecretShare {
    shareId: number;
    shareB64: string;
}

export interface ShareIntegrityCommitment {
    shareId: number;
    digest: string;
}

export interface ShareCandidate extends SecretShare {
    totalShares?: number;
    requiredShares?: number;
    scheme?: 'shamir-v1' | string;
    shareCommitments?: ShareIntegrityCommitment[];
}

const SHARE_DIGEST_VERSION = 'youtick-kms-share-digest-v1';

function gfMul(a: number, b: number): number {
    let x = a;
    let y = b;
    let result = 0;

    while (y > 0) {
        if (y & 1) {
            result ^= x;
        }
        x <<= 1;
        if (x & 0x100) {
            x ^= FIELD_POLY;
        }
        y >>= 1;
    }

    return result & 0xff;
}

function gfPow(base: number, exponent: number): number {
    let result = 1;
    for (let i = 0; i < exponent; i += 1) {
        result = gfMul(result, base);
    }
    return result;
}

function gfInv(value: number): number {
    if (value === 0) {
        throw new Error('Cannot invert zero in GF(256)');
    }
    return gfPow(value, 254);
}

function gfDiv(a: number, b: number): number {
    return gfMul(a, gfInv(b));
}

function randomByte(): number {
    return crypto.getRandomValues(new Uint8Array(1))[0];
}

function evaluatePolynomial(coefficients: number[], x: number): number {
    let result = 0;

    for (let power = 0; power < coefficients.length; power += 1) {
        const coefficient = coefficients[power];
        if (coefficient === 0) {
            continue;
        }
        result ^= gfMul(coefficient, gfPow(x, power));
    }

    return result;
}

export function splitSecretIntoShares(
    secretB64: string,
    totalShares: number,
    requiredShares: number,
): SecretShare[] {
    if (requiredShares < 2) {
        throw new Error('requiredShares must be at least 2');
    }
    if (totalShares < requiredShares) {
        throw new Error('totalShares must be greater than or equal to requiredShares');
    }
    if (totalShares > 255) {
        throw new Error('totalShares must be 255 or less');
    }

    const secretBytes = base64Decode(secretB64);
    const shareBuffers = Array.from({ length: totalShares }, () => new Uint8Array(secretBytes.length));

    for (let byteIndex = 0; byteIndex < secretBytes.length; byteIndex += 1) {
        const coefficients = [secretBytes[byteIndex]];
        for (let i = 1; i < requiredShares; i += 1) {
            let coeff;
            do {
                coeff = randomByte();
            } while (coeff === 0);
            coefficients.push(coeff);
        }

        for (let shareIndex = 0; shareIndex < totalShares; shareIndex += 1) {
            const x = shareIndex + 1;
            shareBuffers[shareIndex][byteIndex] = evaluatePolynomial(coefficients, x);
        }
    }

    return shareBuffers.map((shareBytes, index) => ({
        shareId: index + 1,
        shareB64: base64Encode(shareBytes.buffer),
    }));
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalShareDigestPayload(
    videoId: string,
    share: SecretShare,
    totalShares: number,
    requiredShares: number,
): string {
    return [
        SHARE_DIGEST_VERSION,
        videoId,
        'shamir-v1',
        String(totalShares),
        String(requiredShares),
        String(share.shareId),
        share.shareB64,
    ].join(':');
}

export async function digestShare(
    videoId: string,
    share: SecretShare,
    totalShares: number,
    requiredShares: number,
): Promise<string> {
    const payload = canonicalShareDigestPayload(videoId, share, totalShares, requiredShares);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return bytesToHex(new Uint8Array(digest));
}

export async function buildShareIntegrityCommitments(
    videoId: string,
    shares: SecretShare[],
    totalShares: number,
    requiredShares: number,
): Promise<ShareIntegrityCommitment[]> {
    return Promise.all(shares.map(async (share) => ({
        shareId: share.shareId,
        digest: await digestShare(videoId, share, totalShares, requiredShares),
    })));
}

function normalizeCommitments(commitments: ShareIntegrityCommitment[] | undefined): ShareIntegrityCommitment[] {
    if (!commitments?.length) {
        return [];
    }

    const byShareId = new Map<number, ShareIntegrityCommitment>();
    for (const commitment of commitments) {
        if (
            Number.isInteger(commitment.shareId)
            && commitment.shareId >= 1
            && commitment.shareId <= 255
            && /^[a-f0-9]{64}$/.test(commitment.digest)
        ) {
            byShareId.set(commitment.shareId, commitment);
        }
    }

    return Array.from(byShareId.values()).sort((a, b) => a.shareId - b.shareId);
}

function commitmentKey(commitments: ShareIntegrityCommitment[]): string {
    return JSON.stringify(commitments.map((commitment) => [commitment.shareId, commitment.digest]));
}

async function isShareValidForCommitments(
    videoId: string,
    candidate: ShareCandidate,
    commitments: ShareIntegrityCommitment[],
): Promise<boolean> {
    if (
        candidate.scheme !== 'shamir-v1'
        || typeof candidate.totalShares !== 'number'
        || typeof candidate.requiredShares !== 'number'
    ) {
        return false;
    }

    const expected = commitments.find((commitment) => commitment.shareId === candidate.shareId);
    if (!expected) {
        return false;
    }

    const actual = await digestShare(
        videoId,
        candidate,
        candidate.totalShares,
        candidate.requiredShares,
    );
    return actual === expected.digest;
}

export async function selectSharesForReconstruction(
    videoId: string,
    candidates: ShareCandidate[],
    requiredShares: number,
): Promise<SecretShare[] | null> {
    const commitmentSets = new Map<string, ShareIntegrityCommitment[]>();

    for (const candidate of candidates) {
        const commitments = normalizeCommitments(candidate.shareCommitments);
        if (commitments.length > 0) {
            commitmentSets.set(commitmentKey(commitments), commitments);
        }
    }

    if (commitmentSets.size === 0) {
        const uniqueCandidates = firstUniqueShares(candidates);
        return uniqueCandidates.length >= requiredShares
            ? uniqueCandidates.slice(0, requiredShares)
            : null;
    }

    let bestValidShares: SecretShare[] = [];

    for (const commitments of commitmentSets.values()) {
        const validShares: SecretShare[] = [];
        const seenShareIds = new Set<number>();
        for (const candidate of candidates) {
            if (seenShareIds.has(candidate.shareId)) {
                continue;
            }
            if (await isShareValidForCommitments(videoId, candidate, commitments)) {
                seenShareIds.add(candidate.shareId);
                validShares.push({
                    shareId: candidate.shareId,
                    shareB64: candidate.shareB64,
                });
            }
        }

        if (validShares.length > bestValidShares.length) {
            bestValidShares = validShares;
        }
    }

    return bestValidShares.length >= requiredShares
        ? bestValidShares.slice(0, requiredShares)
        : null;
}

function firstUniqueShares(candidates: ShareCandidate[]): SecretShare[] {
    const shares: SecretShare[] = [];
    const seenShareIds = new Set<number>();

    for (const candidate of candidates) {
        if (!seenShareIds.has(candidate.shareId)) {
            seenShareIds.add(candidate.shareId);
            shares.push({
                shareId: candidate.shareId,
                shareB64: candidate.shareB64,
            });
        }
    }

    return shares;
}

export function reconstructSecretFromShares(
    shares: SecretShare[],
    requiredShares: number,
): string {
    if (shares.length < requiredShares) {
        throw new Error('Not enough shares to reconstruct secret');
    }

    const seen = new Set<number>();
    const uniqueShares: SecretShare[] = [];
    for (const share of shares) {
        if (!seen.has(share.shareId)) {
            seen.add(share.shareId);
            uniqueShares.push(share);
        }
    }

    if (uniqueShares.length < requiredShares) {
        throw new Error('Not enough unique shares to reconstruct secret');
    }

    const selectedShares = uniqueShares.slice(0, requiredShares).map((share) => ({
        x: share.shareId,
        bytes: base64Decode(share.shareB64),
    }));

    const secretLength = selectedShares[0]?.bytes.length ?? 0;
    const secret = new Uint8Array(secretLength);

    for (let byteIndex = 0; byteIndex < secretLength; byteIndex += 1) {
        let value = 0;

        for (let i = 0; i < selectedShares.length; i += 1) {
            const { x: xi, bytes } = selectedShares[i];
            let basis = 1;

            for (let j = 0; j < selectedShares.length; j += 1) {
                if (i === j) {
                    continue;
                }
                const xj = selectedShares[j].x;
                basis = gfMul(basis, gfDiv(xj, xi ^ xj));
            }

            value ^= gfMul(bytes[byteIndex], basis);
        }

        secret[byteIndex] = value;
    }

    return base64Encode(secret.buffer);
}
