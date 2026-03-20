const YOCTO_PER_NEAR = 10n ** 24n;

function normalizeNearAmount(value: string | number): string {
    const normalized = typeof value === 'number' ? value.toString() : value.trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        throw new Error(`Invalid NEAR amount: ${value}`);
    }
    return normalized;
}

export function nearAmountToYocto(value: string | number | bigint): bigint {
    if (typeof value === 'bigint') {
        return value;
    }

    const normalized = normalizeNearAmount(value);
    const [wholePart, fractionPart = ''] = normalized.split('.');

    if (fractionPart.length > 24) {
        throw new Error(`NEAR amount has too many decimal places: ${value}`);
    }

    const whole = BigInt(wholePart || '0') * YOCTO_PER_NEAR;
    const fraction = BigInt((fractionPart + '0'.repeat(24)).slice(0, 24) || '0');

    return whole + fraction;
}

export function isYoctoAmountBelowNear(yoctoAmount: string | bigint, nearAmount: string | number): boolean {
    const yocto = typeof yoctoAmount === 'bigint' ? yoctoAmount : BigInt(yoctoAmount);
    return yocto < nearAmountToYocto(nearAmount);
}
