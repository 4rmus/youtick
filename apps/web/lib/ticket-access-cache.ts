'use client';

const RECENT_TICKET_PURCHASE_PREFIX = 'youtick:recent-ticket-purchase:';
const RECENT_TICKET_PURCHASE_TTL_MS = 5 * 60 * 1000;

function getRecentTicketPurchaseKey(accountId: string | null | undefined, cid: string | null | undefined): string | null {
    if (!accountId || !cid) {
        return null;
    }

    return `${RECENT_TICKET_PURCHASE_PREFIX}${accountId}:${cid}`;
}

export function markRecentTicketPurchase(accountId: string | null | undefined, cid: string | null | undefined): void {
    const key = getRecentTicketPurchaseKey(accountId, cid);
    if (!key || typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(key, JSON.stringify({
            expiresAt: Date.now() + RECENT_TICKET_PURCHASE_TTL_MS,
            confirmed: true,
        }));
    } catch {
        // Session storage only remembers already-confirmed access.
    }
}

export function hasRecentTicketPurchase(accountId: string | null | undefined, cid: string | null | undefined): boolean {
    const key = getRecentTicketPurchaseKey(accountId, cid);
    if (!key || typeof window === 'undefined') {
        return false;
    }

    try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) {
            return false;
        }

        const parsed = JSON.parse(raw) as { expiresAt?: number; confirmed?: boolean };
        if (!parsed.expiresAt || parsed.expiresAt <= Date.now() || parsed.confirmed !== true) {
            window.sessionStorage.removeItem(key);
            return false;
        }

        return true;
    } catch {
        window.sessionStorage.removeItem(key);
        return false;
    }
}
