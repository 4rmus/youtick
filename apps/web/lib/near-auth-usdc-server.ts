import { EncryptJWT, jwtDecrypt } from 'jose';
import { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { rpc, sessionKey } from './near-auth-signing-server';
import { ticketConfig } from './near-auth-ticket-purchase';

const AMOUNT = '600000';
const GAS = '30000000000000';
const NEAR_LIMIT = 80_000_000_000_000_000_000_000n;
const STORAGE_LIMIT = 2_000_000_000_000_000_000_000n;
const validAccount = (value: unknown): value is string => typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
const integer = (value: unknown) => {
    if (typeof value !== 'string' || !/^[0-9]{1,39}$/.test(value)) throw new Error('invalid_amount');
    return BigInt(value);
};
const registered = (value: unknown) => {
    if (value === null) return false;
    if (!value || typeof value !== 'object' || !('total' in value) || integer(value.total) <= 0n) throw new Error('invalid_storage');
    return true;
};

function fundingActions(target: string, deposit: string) {
    const call = (methodName: string, args: Record<string, string | boolean>, amount: string) => ({
        type: 'FunctionCall' as const, params: { methodName, args, gas: GAS, deposit: amount },
    });
    return [
        ...(deposit === '0' ? [] : [call('storage_deposit', { account_id: target, registration_only: true }, deposit)]),
        call('ft_transfer', { receiver_id: target, amount: AMOUNT, memo: 'YouTick auth lab test balance' }, '1'),
    ];
}

async function readState(target: string, publicKey: string, sender: string) {
    const { usdc } = ticketConfig();
    const key = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: target, public_key: publicKey });
    if (key.permission !== 'FullAccess' || typeof key.block_hash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(key.block_hash)
        || !Number.isSafeInteger(key.block_height) || key.block_height <= 0) throw new Error('account_changed');
    const query = async (params: object) => {
        const result = await rpc('query', { ...params, block_id: key.block_hash });
        if (result.block_hash !== key.block_hash || result.block_height !== key.block_height) throw new Error('block_mismatch');
        return result;
    };
    const view = async (method_name: string, args: object) => {
        const result = await query({ request_type: 'call_function', account_id: usdc, method_name,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
        if (!Array.isArray(result.result) || result.result.length > 4096
            || !result.result.every((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('invalid_view');
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(result.result)));
    };
    const [metadata, targetStorage, targetBalance, senderStorage, senderBalance, bounds, near, config, price] = await Promise.all([
        view('ft_metadata', {}), view('storage_balance_of', { account_id: target }), view('ft_balance_of', { account_id: target }),
        view('storage_balance_of', { account_id: sender }), view('ft_balance_of', { account_id: sender }), view('storage_balance_bounds', {}),
        query({ request_type: 'view_account', account_id: sender }), rpc('EXPERIMENTAL_protocol_config', { block_id: key.block_hash }),
        rpc('gas_price', [key.block_hash]),
    ]);
    if (metadata?.decimals !== 6) throw new Error('invalid_token');
    const hasStorage = registered(targetStorage);
    const recipientBalance = integer(targetBalance);
    if (!hasStorage && recipientBalance !== 0n) throw new Error('invalid_storage');
    const deposit = hasStorage ? 0n : integer(bounds?.min);
    if ((!hasStorage && deposit <= 0n) || deposit > STORAGE_LIMIT) throw new Error('storage_budget_exceeded');
    const buyPrice = integer(config.runtime_config?.min_gas_purchase_price);
    // ponytail: protocol-85 fee ceiling for this lab; re-audit before increasing either budget.
    if (config.protocol_version !== 85 || buyPrice !== 1_000_000_000n || integer(price.gas_price) <= 0n
        || integer(price.gas_price) > buyPrice) throw new Error('fee_not_verified');
    const reserve = integer(config.runtime_config.storage_amount_per_byte) * integer(String(near.storage_usage));
    const availableNear = integer(near.amount) - integer(near.locked) - reserve;
    const ready = hasStorage && recipientBalance >= BigInt(AMOUNT);
    const reason = ready ? 'ready' : !registered(senderStorage) ? 'sender_storage_required'
        : integer(senderBalance) < BigInt(AMOUNT) ? 'sender_usdc_required'
            : availableNear < NEAR_LIMIT ? 'sender_near_required' : 'review';
    return { accountId: target, publicKey, sender, tokenContractId: usdc, recipientBalance: recipientBalance.toString(),
        senderBalance: integer(senderBalance).toString(), storageDepositYocto: deposit.toString(), amountMicro: AMOUNT,
        nearLimitYocto: NEAR_LIMIT.toString(), registered: hasStorage, ready, allowed: reason === 'review', reason,
        blockHeight: key.block_height, actions: ready ? [] : fundingActions(target, deposit.toString()) };
}

export async function prepareGoogleUsdc(subject: string, origin: string, sender: unknown) {
    ticketConfig();
    if (!validAccount(sender)) throw new Error('invalid_sender');
    const account = await nearAuthAccountPreflight(subject);
    if (!account.accounts.includes(account.implicitAccount) || sender === account.implicitAccount) throw new Error('account_required');
    const state = await readState(account.implicitAccount, account.publicKey, sender);
    const now = Math.floor(Date.now() / 1000);
    const ticket = state.allowed ? await new EncryptJWT({ accountId: state.accountId, publicKey: state.publicKey, sender,
        tokenContractId: state.tokenContractId, storageDepositYocto: state.storageDepositYocto, recipientBalance: state.recipientBalance })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer('youtick-auth-lab-usdc').setAudience(origin)
        .setSubject(subject).setIssuedAt(now).setExpirationTime(now + 300).encrypt(sessionKey()) : null;
    return { ...state, ticket, expiresAt: (now + 300) * 1000 };
}

async function readReview(subject: string, origin: string, ticket: unknown) {
    if (typeof ticket !== 'string' || ticket.length > 8192) throw new Error('invalid_review');
    const { payload } = await jwtDecrypt(ticket, sessionKey(), { issuer: 'youtick-auth-lab-usdc', audience: origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'], requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 300 });
    if (payload.sub !== subject || typeof payload.accountId !== 'string' || !/^[a-f0-9]{64}$/.test(payload.accountId)
        || typeof payload.publicKey !== 'string' || !validAccount(payload.sender) || payload.sender === payload.accountId
        || payload.tokenContractId !== ticketConfig().usdc || typeof payload.storageDepositYocto !== 'string'
        || integer(payload.storageDepositYocto) > STORAGE_LIMIT || typeof payload.recipientBalance !== 'string'
        || integer(payload.recipientBalance) >= BigInt(AMOUNT)) throw new Error('invalid_review');
    return { accountId: payload.accountId, publicKey: payload.publicKey, sender: payload.sender,
        tokenContractId: payload.tokenContractId, storageDepositYocto: payload.storageDepositYocto, recipientBalance: payload.recipientBalance };
}

export async function authorizeGoogleUsdc(subject: string, origin: string, ticket: unknown) {
    const expected = await readReview(subject, origin, ticket);
    const current = await prepareGoogleUsdc(subject, origin, expected.sender);
    if (!current.allowed || Object.entries(expected).some(([key, value]) => current[key as keyof typeof current] !== value)) throw new Error('review_changed');
    return { accountId: current.accountId, sender: current.sender, receiverId: current.tokenContractId, actions: current.actions };
}

export async function verifyGoogleUsdc(subject: string, origin: string, ticket: unknown, txHash: unknown) {
    const review = await readReview(subject, origin, ticket);
    if (typeof txHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(txHash)) throw new Error('invalid_hash');
    const result = await rpc('tx', { tx_hash: txHash, sender_account_id: review.sender, wait_until: 'FINAL' });
    const tx = result.transaction;
    const expected = fundingActions(review.accountId, review.storageDepositYocto);
    if (result.final_execution_status !== 'FINAL' || typeof result.status?.SuccessValue !== 'string'
        || tx?.hash !== txHash || tx.signer_id !== review.sender || tx.receiver_id !== review.tokenContractId
        || !Array.isArray(tx.actions) || tx.actions.length !== expected.length || !Array.isArray(result.receipts_outcome)) throw new Error('funding_not_verified');
    expected.forEach(({ params }, index) => {
        const action = tx.actions[index]; const call = action?.FunctionCall;
        if (Object.keys(action).length !== 1 || call?.method_name !== params.methodName || String(call.gas) !== params.gas
            || call.deposit !== params.deposit || typeof call.args !== 'string' || call.args.length > 2048) throw new Error('funding_not_verified');
        const args = JSON.parse(Buffer.from(call.args, 'base64').toString());
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== Object.keys(params.args).length
            || Object.entries(params.args).some(([key, value]) => args[key] !== value)) throw new Error('funding_not_verified');
    });
    const burnt = [result.transaction_outcome, ...result.receipts_outcome].reduce((sum, receipt) => {
        if (!receipt?.outcome?.status || 'Failure' in receipt.outcome.status) throw new Error('funding_not_verified');
        return sum + integer(receipt.outcome.tokens_burnt);
    }, 0n);
    if (burnt + integer(review.storageDepositYocto) + 1n > NEAR_LIMIT) throw new Error('budget_exceeded');
    const transfer = result.receipts_outcome.some((receipt: { outcome?: { executor_id?: unknown; logs?: unknown } }) => receipt.outcome?.executor_id === review.tokenContractId
        && Array.isArray(receipt.outcome.logs) && receipt.outcome.logs.some((line: unknown) => {
            if (typeof line !== 'string' || !line.startsWith('EVENT_JSON:')) return false;
            try {
                const event = JSON.parse(line.slice(11));
                return event.standard === 'nep141' && event.version === '1.0.0' && event.event === 'ft_transfer' && Array.isArray(event.data)
                    && event.data.some((item: Record<string, unknown>) => item.old_owner_id === review.sender && item.new_owner_id === review.accountId && item.amount === AMOUNT);
            } catch { return false; }
        }));
    if (!transfer) throw new Error('funding_not_verified');
    const current = await readState(review.accountId, review.publicKey, review.sender);
    if (!current.ready) throw new Error('funding_not_verified');
    return { verified: true, transactionHash: txHash, accountId: review.accountId, balanceMicro: current.recipientBalance,
        feeYocto: burnt.toString() };
}
