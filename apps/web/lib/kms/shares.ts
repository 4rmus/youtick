const FIELD_POLY = 0x11b;

export interface SecretShare {
    shareId: number;
    shareB64: string;
}

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

    const secretBytes = base64ToUint8Array(secretB64);
    const shareBuffers = Array.from({ length: totalShares }, () => new Uint8Array(secretBytes.length));

    for (let byteIndex = 0; byteIndex < secretBytes.length; byteIndex += 1) {
        const coefficients = [secretBytes[byteIndex]];
        for (let i = 1; i < requiredShares; i += 1) {
            coefficients.push(randomByte());
        }

        for (let shareIndex = 0; shareIndex < totalShares; shareIndex += 1) {
            const x = shareIndex + 1;
            shareBuffers[shareIndex][byteIndex] = evaluatePolynomial(coefficients, x);
        }
    }

    return shareBuffers.map((shareBytes, index) => ({
        shareId: index + 1,
        shareB64: arrayBufferToBase64(shareBytes.buffer),
    }));
}

export function reconstructSecretFromShares(
    shares: SecretShare[],
    requiredShares: number,
): string {
    if (shares.length < requiredShares) {
        throw new Error('Not enough shares to reconstruct secret');
    }

    const selectedShares = shares.slice(0, requiredShares).map((share) => ({
        x: share.shareId,
        bytes: base64ToUint8Array(share.shareB64),
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

    return arrayBufferToBase64(secret.buffer);
}
