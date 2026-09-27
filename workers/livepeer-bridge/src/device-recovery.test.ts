import { expect, it, vi } from 'vitest';
import { activeDeviceKeys, readDeviceRecoveryState } from '../../../protocol/paid-media-livepeer-v1/device-recovery';
import { serialize } from 'borsh';
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const account = 'a'.repeat(64), key = 'ed25519:11111111111111111111111111111111';
const authorization = { session_public_key: key, certificate_sha256: 'c'.repeat(64), authorization_duration_ms: '2592000000' };
const schema = { array: { type: { struct: { session_public_key: 'string', certificate_sha256: 'string', authorized_at_ms: 'u64', expires_at_ms: 'u64', authorizing_public_key: { option: 'string' } } } } } as const;
function rows(keys: string[], start = Date.now() - 1000) {
    return [{ key: btoa(`youtick:market:playback-devices:v1:${account}`),
        value: b64(serialize(schema, keys.map(session_public_key => ({ session_public_key, certificate_sha256: 'c'.repeat(64),
            authorized_at_ms: BigInt(start), expires_at_ms: BigInt(start + 2592000000), authorizing_public_key: key })))) }];
}
it('decodes the Market Borsh layout, ignores expired entries and fails closed on corrupt/misbound data', () => {
    expect(activeDeviceKeys(rows([key]), account)).toEqual([key]);
    expect(activeDeviceKeys(rows([key], Date.now() - 2592000001), account)).toEqual([]);
    expect(() => activeDeviceKeys(rows([key]), 'b'.repeat(64))).toThrow();
    expect(() => activeDeviceKeys(rows([key, key]), account)).toThrow();
    expect(() => activeDeviceKeys([{ ...rows([])[0], value: 'AAAA' }], account)).toThrow();
    expect(() => activeDeviceKeys([{ ...rows([])[0], value: 'AAAAAAE=' }], account)).toThrow();
    expect(() => activeDeviceKeys(rows([key], Date.now() + 60000), account)).toThrow();
});
it('permits same-key renewal/no-op and expired slots; denies a fourth active key and mismatched final blocks', async () => {
    const chainNow = Date.now(), keys = [key, key + '2', key + '3']; let records = rows(keys), mismatch = false;
    const rpc = async (method: string, params: object) => {
        if (method === 'block') return { header: { hash: 'block', timestamp_nanosec: String(BigInt(chainNow) * 1000000n) } };
        const p = params as { request_type: string; method_name: string; block_id: string };
        return p.request_type === 'view_state' ? { values: records, block_hash: 'block' }
            : { block_hash: mismatch ? 'wrong' : p.block_id, result: [...new TextEncoder().encode(JSON.stringify({ get_publication: {
                publication_id: 'video-1', availability: 'SALES_SUSPENDED' }, get_governance_state: { bridge_frozen: false, new_purchases_paused: true },
                has_entitlement: true }[p.method_name as 'has_entitlement']))] };
    };
    await expect(readDeviceRecoveryState(rpc, 'market.testnet', account, 'video-1', authorization, 'block')).resolves.toBeTruthy();
    await expect(readDeviceRecoveryState(rpc, 'market.testnet', account, 'video-1', { ...authorization, session_public_key: key + '4' }, 'block')).rejects.toThrow('device_slots_full');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(chainNow + 40 * 86400000);
    try {
        await expect(readDeviceRecoveryState(rpc, 'market.testnet', account, 'video-1', { ...authorization, session_public_key: key + '4' }, 'block')).rejects.toThrow('device_slots_full');
    } finally { clock.mockRestore(); }
    records = rows(keys, chainNow - 2592000001);
    await expect(readDeviceRecoveryState(rpc, 'market.testnet', account, 'video-1', authorization, 'block')).resolves.toBeTruthy();
    mismatch = true;
    await expect(readDeviceRecoveryState(rpc, 'market.testnet', account, 'video-1', authorization, 'block')).rejects.toThrow('unavailable');
});
