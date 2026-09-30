/** NEAR named or implicit account ids, as accepted elsewhere in the web app. */
export const CREATOR_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;

const NEAR_IMPLICIT = /^[0-9a-f]{64}$/;
const ETH_IMPLICIT = /^0x[0-9a-f]{40}$/;

export function isImplicitAccount(accountId: string): boolean {
    return NEAR_IMPLICIT.test(accountId) || ETH_IMPLICIT.test(accountId);
}

/** Implicit (hash-like) accounts are shortened for display; named accounts are shown in full. */
export function displayAccount(accountId: string): string {
    return isImplicitAccount(accountId) ? `${accountId.slice(0, 6)}…${accountId.slice(-4)}` : accountId;
}
