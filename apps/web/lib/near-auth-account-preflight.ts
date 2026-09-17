import { PublicKey } from 'near-api-js';
import { NEAR_AUTH_LAB_DOMAIN, NEAR_AUTH_TESTNET_RPC } from './near-auth-lab';

const RPC = NEAR_AUTH_TESTNET_RPC;
const FAST_AUTH = 'fast-auth.testnet';
const MPC = 'v1.signer-prod.testnet';

export async function nearAuthAccountPreflight(subject: string, prepareFunding = false) {
    if (!subject || subject.length > 512 || subject.includes('#')) throw new Error('invalid_subject');
    const signal = AbortSignal.timeout(prepareFunding ? 30_000 : 20_000);
    async function rpc(params: Record<string, unknown>, allowMissing = false) {
        const response = await fetch(RPC, { method: 'POST', cache: 'no-store', signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab', method: 'query', params }),
        });
        if (!response.ok) throw new Error('rpc_unavailable');
        const body = await response.json();
        if (allowMissing && (body?.error?.cause?.name === 'UNKNOWN_ACCOUNT'
            || (params.request_type === 'view_access_key' && body?.error?.cause?.name === 'UNKNOWN_ACCESS_KEY'))) return null;
        if (body?.error || !body?.result || typeof body.result.block_hash !== 'string'
            || !Number.isSafeInteger(body.result.block_height)) throw new Error('rpc_invalid');
        if (params.block_id && body.result.block_hash !== params.block_id) throw new Error('block_mismatch');
        // Some RPC nodes return missing keys as a legacy error inside result.
        if (allowMissing && body.result.error === `access key ${params.public_key} does not exist while viewing`) return null;
        if (allowMissing && params.request_type === 'view_account'
            && body.result.error === `account ${params.account_id} does not exist while viewing`) return null;
        if (body.result.error !== undefined) throw new Error('rpc_invalid');
        return body.result as { block_hash: string; block_height: number; result?: unknown; permission?: unknown };
    }
    async function view(accountId: string, method: string, args: object, block?: string) {
        const result = await rpc({ request_type: 'call_function', account_id: accountId, method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
            ...(block ? { block_id: block } : { finality: 'final' }),
        });
        if (block && result!.block_hash !== block) throw new Error('block_mismatch');
        const bytes = result!.result;
        if (!Array.isArray(bytes) || bytes.length > 4096 || !bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
            throw new Error('invalid_view');
        }
        return { ...result!, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))) as unknown };
    }
    const state = await view(FAST_AUTH, 'paused', {});
    const block = state.block_hash;
    const [address, domain] = await Promise.all([
        view(FAST_AUTH, 'mpc_address', {}, block), view(FAST_AUTH, 'mpc_domain_id', {}, block),
    ]);
    if (state.value !== false || address.value !== MPC || domain.value !== 1) throw new Error('provider_configuration_changed');
    const derived = await view(MPC, 'derived_public_key', {
        path: `jwt#https://${NEAR_AUTH_LAB_DOMAIN}/#${subject}`, predecessor: FAST_AUTH, domain_id: 1,
    }, block);
    if (typeof derived.value !== 'string' || !derived.value.startsWith('ed25519:')) throw new Error('invalid_public_key');
    const key = PublicKey.fromString(derived.value);
    if (key.data.length !== 32 || key.toString() !== derived.value) throw new Error('invalid_public_key');
    const publicKey = key.toString();
    const implicitAccount = Buffer.from(key.data).toString('hex');
    const response = await fetch(`https://test.api.fastnear.com/v0/public_key/${encodeURIComponent(publicKey)}`, {
        cache: 'no-store', signal,
    });
    if (!response.ok) throw new Error('discovery_unavailable');
    const indexed = await response.json();
    // ponytail: at most five indexed candidates in this lab; require an explicit selection flow beyond that.
    if (indexed?.public_key !== publicKey || !Array.isArray(indexed.account_ids) || indexed.account_ids.length > 5
        || !indexed.account_ids.every((id: unknown) => typeof id === 'string' && id.length >= 2 && id.length <= 64
            && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id))) throw new Error('invalid_discovery');
    const candidates: string[] = [...new Set<string>([...indexed.account_ids, implicitAccount])];
    const accounts = (await Promise.all(candidates.map(async (accountId) => {
        const result = await rpc({ request_type: 'view_access_key', block_id: block, account_id: accountId, public_key: publicKey }, true);
        if (result && result.block_hash !== block) throw new Error('block_mismatch');
        if (result && result.permission !== 'FullAccess' && (!result.permission || typeof result.permission !== 'object'
            || !('FunctionCall' in result.permission))) throw new Error('invalid_permission');
        return result?.permission === 'FullAccess' ? accountId : null;
    }))).filter((id): id is string => id !== null);
    let funding: { allowed: boolean; reason: string; checkedAt: number } | undefined;
    if (prepareFunding) {
        const account = await rpc({ request_type: 'view_account', block_id: block, account_id: implicitAccount }, true);
        let withinBudget = false;
        if (!account && accounts.length === 0) {
            const read = async (method: string, params: unknown) => {
                const response = await fetch(RPC, { method: 'POST', cache: 'no-store', signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab', method, params }),
                });
                if (!response.ok) throw new Error('rpc_unavailable');
                const body = await response.json();
                if (body.error || !body.result) throw new Error('rpc_invalid');
                return body.result;
            };
            const [config, price] = await Promise.all([
                read('EXPERIMENTAL_protocol_config', { block_id: block }), read('gas_price', [block]),
            ]);
            const rt = config.runtime_config;
            const fees = rt?.transaction_costs;
            const integer = (value: unknown) => {
                if ((typeof value !== 'string' || !/^\d{1,30}$/.test(value))
                    && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid_fee');
                return BigInt(value);
            };
            const buyPrice = [integer(price.gas_price), integer(rt.min_gas_purchase_price)].reduce((a, b) => a > b ? a : b);
            const cost = (value: Record<string, unknown>) => integer(value.send_not_sir) + integer(value.execution);
            // Conservative preflight allowance, not a protocol-level signed fee cap.
            const gas = cost(fees.action_creation_config.create_account_cost)
                + cost(fees.action_creation_config.add_key_cost.full_access_cost)
                + cost(fees.action_creation_config.transfer_cost) + 10n * cost(fees.action_receipt_creation_config);
            withinBudget = config.protocol_version === 85 && buyPrice > 0n && gas > 0n && gas * buyPrice <= 20000000000000000000000n;
        }
        funding = { allowed: !account && accounts.length === 0 && withinBudget,
            reason: account || accounts.length ? 'account_exists' : withinBudget ? 'ready' : 'fee_not_verified', checkedAt: Date.now() };
    }
    return { publicKey, accounts, implicitAccount, blockHeight: state.block_height, signingTested: false as const,
        ...(funding ? { funding } : {}) };
}
