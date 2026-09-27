// Read-only policy shared by Web preparation and Bridge's last pre-send check.
export const DEVICE_GAS = 100_000_000_000_000n;
export const DEVICE_NEAR_LIMIT = 120_000_000_000_000_000_000_000n;
export type DeviceAuthorization = { session_public_key: string; certificate_sha256: string; authorization_duration_ms: string };
const deny = (): never => { throw new Error('device_activation_unavailable'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : deny();
const decode64 = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 8192) return deny();
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...bytes)) !== value) return deny();
    return bytes;
};

// Market stores a Borsh Vec<PlaybackDevice> at this exact key; at most three entries.
export function activeDeviceKeys(values: unknown, accountId: string, now = Date.now()): string[] {
    if (!Array.isArray(values) || values.length > 1) return deny();
    if (!values.length) return [];
    const row = object(values[0]);
    if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(decode64(row.key)) !== `youtick:market:playback-devices:v1:${accountId}`) return deny();
    const bytes = decode64(row.value), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const u32 = () => { const value = view.getUint32(offset, true); offset += 4; return value; };
    const string = () => {
        const size = u32(); if (size > 128 || offset + size > bytes.length) return deny();
        const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.subarray(offset, offset + size)); offset += size; return value;
    };
    const u64 = () => { const value = view.getBigUint64(offset, true); offset += 8; if (value > BigInt(Number.MAX_SAFE_INTEGER)) return deny(); return Number(value); };
    const count = u32(); if (count > 3) return deny();
    const keys: string[] = [], all = new Set<string>();
    for (let i = 0; i < count; i++) {
        const key = string(), certificate = string(), start = u64(), end = u64();
        const option = view.getUint8(offset++);
        if (option === 1) { if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(string())) return deny(); }
        else if (option !== 0) return deny();
        if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(key) || !/^[a-f0-9]{64}$/.test(certificate)
            || all.has(key) || start > now || end - start !== 2592000000) return deny();
        all.add(key); if (end > now) keys.push(key);
    }
    if (offset !== bytes.length) return deny();
    return keys;
}

export async function readDeviceRecoveryState(rpc: (method: string, params: object) => Promise<Record<string, unknown>>,
    market: string, accountId: string, publicationId: string, device: DeviceAuthorization, block: string) {
    const query = async (params: object) => {
        const value = await rpc('query', { ...params, account_id: market, block_id: block });
        if (value.block_hash !== block) return deny();
        return value;
    };
    const view = async (method_name: string, args: object) => {
        const value = await query({ request_type: 'call_function', method_name,
            args_base64: btoa(JSON.stringify(args)) });
        if (!Array.isArray(value.result) || value.result.length > 16384 || !value.result.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return deny();
        return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(new Uint8Array(value.result))) as unknown;
    };
    const [publicationValue, governance, entitled, records, blockValue] = await Promise.all([
        view('get_publication', { publication_id: publicationId }), view('get_governance_state', {}),
        view('has_entitlement', { account_id: accountId, publication_id: publicationId }),
        query({ request_type: 'view_state', prefix_base64: btoa(`youtick:market:playback-devices:v1:${accountId}`) }),
        rpc('block', { block_id: block }),
    ]);
    const publication = object(publicationValue);
    if (publication.publication_id !== publicationId || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))
        || entitled !== true || object(governance).bridge_frozen !== false) throw new Error('playback_denied');
    const header = object(blockValue.header);
    if (header.hash !== block || typeof header.timestamp_nanosec !== 'string' || !/^[0-9]{1,20}$/.test(header.timestamp_nanosec)) return deny();
    const now = Number(BigInt(header.timestamp_nanosec) / 1_000_000n);
    if (!Number.isSafeInteger(now)) return deny();
    const keys = activeDeviceKeys(records.values, accountId, now);
    if (!keys.includes(device.session_public_key) && keys.length >= 3) throw new Error('device_slots_full');
    return publication;
}
