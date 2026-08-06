const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(value: string): Uint8Array {
    const encoded = value.replace(/^ed25519:/, '');
    const bytes = [0];

    for (const char of encoded) {
        const digit = ALPHABET.indexOf(char);
        if (digit < 0) throw new Error(`Invalid base58 character: ${char}`);

        let carry = digit;
        for (let index = 0; index < bytes.length; index += 1) {
            carry += bytes[index] * 58;
            bytes[index] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    for (const char of encoded) {
        if (char !== '1') break;
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}
