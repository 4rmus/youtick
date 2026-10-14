// Several trusted ckd-gates per network (lib/ticket-keys/ckd.ts, CKD_TRUST_ROOTS). Sign-in and
// purchases use the current gate; each retired gate's secret is fetched with one more sign-in so
// tickets bought with it can be found. These helpers keep that bookkeeping out of React state code.
import type { CkdTrustRoot } from '../ticket-keys/ckd';
import type { GateKey } from './tickets';

export interface PendingGate {
    gateAccountId: string;
    state: 'idle' | 'signing_in' | 'error';
    error?: string;
}

export type UnlockState = Record<string, Omit<PendingGate, 'gateAccountId'>>;

/** Retired gates this session has no secret for yet, with the state of their extra sign-in. */
export function pendingGates(retired: readonly CkdTrustRoot[], keys: readonly GateKey[], unlocking: UnlockState): PendingGate[] {
    return retired
        .filter((root) => !keys.some((key) => key.gateAccountId === root.gateAccountId))
        .map((root) => ({ gateAccountId: root.gateAccountId, ...(unlocking[root.gateAccountId] ?? { state: 'idle' as const }) }));
}

/** Whether an extra sign-in may start for this gate: retired, not yet held, signed in. */
export function canUnlock(retired: readonly CkdTrustRoot[], keys: readonly GateKey[], gateAccountId: string): boolean {
    return retired.some((root) => root.gateAccountId === gateAccountId) && !keys.some((key) => key.gateAccountId === gateAccountId);
}

/**
 * Adds a retired gate's secret to the session. The extra sign-in must resolve to the session's own
 * account: a different account's secret never joins, and a gate is never added twice.
 */
export function addGateKey(keys: readonly GateKey[], sessionAccountId: string, result: {
    accountId: string; gateAccountId: string; ckdKey: Uint8Array;
}): GateKey[] {
    if (result.accountId !== sessionAccountId) throw new Error('ckd_account_changed');
    if (keys.some((key) => key.gateAccountId === result.gateAccountId)) return [...keys];
    return [...keys, { gateAccountId: result.gateAccountId, ckdKey: result.ckdKey }];
}
