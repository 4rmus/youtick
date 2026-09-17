// Wire version 1. Never reorder these immutable profile identifiers.
const PROFILE_HASHES = [
    '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
    '28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2',
    'a6751ecd819f080430d3bea4cab0d7b906cd729993c925ae16c676433fe65752',
];
export const COMPACT_UPLOAD_PREFIX = 'yt:u1:';
type ObjectValue = Record<string, unknown>;
export type CompactUploadContext = {
    network: string; market: string; creator: string; usdc: string;
    keyString: (bytes: Uint8Array) => string;
};
const object = (value: unknown): ObjectValue => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_compact_upload');
    return value as ObjectValue;
};
const text = (value: unknown) => { if (typeof value !== 'string') throw Error('invalid_compact_upload'); return value; };
const integer = (value: unknown) => {
    const string = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : text(value);
    if (!/^(0|[1-9][0-9]*)$/.test(string)) throw Error('invalid_compact_upload');
    return BigInt(string);
};
const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (value: unknown) => {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('invalid_compact_upload');
    return Uint8Array.from(value.match(/../g)!, b => parseInt(b, 16));
};
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unbase64 = (value: string) => {
    if (value.length > 800 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('invalid_compact_upload');
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    if (base64(bytes) !== value) throw Error('invalid_compact_upload');
    return bytes;
};
const sha = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as ObjectValue)[k])}`).join(',')}}`
    : JSON.stringify(value);

export async function packCompactUpload(value: unknown, keyBytes: (key: string) => Uint8Array, context: CompactUploadContext): Promise<string> {
    const m = object(value), q = object(m.sponsor_quote), d = object(m.playback_session);
    const out: number[] = [];
    const uint = (value: unknown, width: number) => {
        let n = integer(value);
        if (n >= 1n << BigInt(width * 8)) throw Error('invalid_compact_upload');
        for (let i = 0; i < width; i++) { out.push(Number(n & 255n)); n >>= 8n; }
    };
    const bytes = (value: Uint8Array, size: number) => {
        if (value.length !== size) throw Error('invalid_compact_upload'); out.push(...value);
    };
    const string = (value: unknown, max: number) => {
        const v = text(value), encoded = new TextEncoder().encode(v);
        if (encoded.length > max || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoded) !== v) throw Error('invalid_compact_upload');
        uint(String(encoded.length), 4); out.push(...encoded);
    };
    string(m.job_id, 128); string(m.title, 200);
    uint(m.price_usdc, 16); uint(m.expected_source_bytes, 8);
    const profile = PROFILE_HASHES.indexOf(text(m.profile_config_sha256));
    if (profile < 0) throw Error('invalid_compact_upload'); uint(String(profile), 1);
    bytes(keyBytes(text(m.upload_public_key)), 32);
    uint((integer(m.upload_key_expires_at_ms) - integer(q.issued_at_ms)).toString(), 4);
    bytes(keyBytes(text(d.session_public_key)), 32); bytes(fromHex(d.certificate_sha256), 32);
    uint(d.authorization_duration_ms, 4); uint(q.issued_at_ms, 8);
    uint((integer(q.expires_at_ms) - integer(q.issued_at_ms)).toString(), 4);
    uint(q.quote_block_height, 8);
    uint((integer(q.max_delegate_block_height) - integer(q.quote_block_height)).toString(), 1);
    uint(q.quote_key_version, 4); bytes(unbase64(text(m.sponsor_quote_signature)), 64);
    const message = COMPACT_UPLOAD_PREFIX + base64(Uint8Array.from(out));
    const expanded = await unpackCompactUpload(message, context);
    // Existing normalized message is the review input; never silently drop or alter a field.
    if (canonical(expanded) !== canonical(m)) throw Error('invalid_compact_upload');
    return message;
}

export async function unpackCompactUpload(message: string, context: CompactUploadContext): Promise<ObjectValue> {
    if (!message.startsWith(COMPACT_UPLOAD_PREFIX)) throw Error('invalid_compact_upload');
    const data = unbase64(message.slice(COMPACT_UPLOAD_PREFIX.length));
    let offset = 0;
    const take = (n: number) => {
        if (n < 0 || offset + n > data.length) throw Error('invalid_compact_upload');
        const out = data.slice(offset, offset + n); offset += n; return out;
    };
    const uint = (width: number) => {
        const bytes = take(width); let n = 0n;
        for (let i = width - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
        return n;
    };
    const string = (max: number) => {
        const n = Number(uint(4)); if (n > max) throw Error('invalid_compact_upload');
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(take(n));
    };
    const job = string(128), title = string(200), price = uint(16), source = uint(8), profile = Number(uint(1));
    const uploadKey = context.keyString(take(32)), uploadDuration = uint(4);
    const deviceKey = context.keyString(take(32)), certificate = hex(take(32)), deviceDuration = uint(4);
    const issued = uint(8), lifetime = uint(4), block = uint(8), blockWindow = uint(1), keyVersion = Number(uint(4));
    const signature = base64(take(64));
    if (offset !== data.length || !/^[A-Za-z0-9._:-]{1,128}$/.test(job) || !title.trim()
        || price < 2_000_000n || price >= 100_000_000_000_000_000_000n || source < 1n || source > 5_000_000_000n
        || profile >= PROFILE_HASHES.length || deviceDuration !== 2_592_000_000n || uploadDuration === 0n
        || lifetime < 1n || lifetime > 120_000n || blockWindow !== 200n || keyVersion < 1
        || issued + uploadDuration > 18_446_744_073_709_551_615n || issued + lifetime > 18_446_744_073_709_551_615n
        || block + blockWindow > 18_446_744_073_709_551_615n
        || !['testnet', 'mainnet'].includes(context.network)) throw Error('invalid_compact_upload');
    const request = { creator_id: context.creator, job_id: job, title, price_usdc: price.toString(), expected_source_bytes: source.toString(),
        profile_id: 'paid-media-livepeer-v1', profile_config_sha256: PROFILE_HASHES[profile], upload_public_key: uploadKey,
        upload_key_expires_at_ms: (issued + uploadDuration).toString() };
    const byteFee = (source * 3n + 9_999n) / 10_000n, fee = byteFee < 500_000n ? 500_000n : byteFee;
    const quote: Record<string, string | number> = { domain: 'youtick.sponsored-upload-quote', version: '1', network: context.network,
        contract_id: context.market, creator_id: context.creator, job_id: job, request_sha256: await sha(JSON.stringify(request)),
        expected_source_bytes: source.toString(), upload_fee_usdc: fee.toString(), sponsor_fee_usdc: '100000', total_fee_usdc: (fee + 100_000n).toString(),
        delegate_receiver_id: context.usdc, delegate_method: 'ft_transfer_call', delegate_gas: '100000000000000', delegate_deposit_yocto: '1',
        issued_at_ms: issued.toString(), quote_block_height: block.toString(), max_delegate_block_height: (block + blockWindow).toString(),
        expires_at_ms: (issued + lifetime).toString(), quote_key_version: keyVersion };
    quote.quote_id = await sha(Object.values(quote).map(String).join('\n'));
    return { action: 'create_paid_job', ...request, playback_session: { session_public_key: deviceKey,
        certificate_sha256: certificate, authorization_duration_ms: deviceDuration.toString() }, sponsor_quote: quote, sponsor_quote_signature: signature };
}
