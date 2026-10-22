// Visible ticket-code overlay (roadmap E9; launch brief 2026-10-18, K14 and D5). The code is the
// first 8 hex characters of the ticket id: sha256 of the ticket's public key, public on chain and
// carrying no buyer account. It cannot be turned back into the ticket key and puts no personal data
// on screen; the operator can match it against on-chain ticket ids. It is a deterrent overlay, not a
// forensic mark: the media provider serves one stream to every viewer, so nothing is burned into the video
// itself, and no copy may describe it as a per-viewer watermark (claim register, claim 14).

/** Seconds a watermark stays in one place; moving it makes cropping it out harder. */
export const WATERMARK_MOVE_MS = 30_000;

/** Positions as top/left percentages, kept clear of the native controls along the bottom edge. */
const POSITIONS: ReadonlyArray<{ top: number; left: number }> = [
    { top: 6, left: 6 }, { top: 6, left: 62 }, { top: 34, left: 12 }, { top: 34, left: 56 },
    { top: 62, left: 6 }, { top: 62, left: 62 }, { top: 20, left: 34 }, { top: 48, left: 34 },
];

export function watermarkCode(ticketId: string): string {
    if (!/^[0-9a-f]{64}$/.test(ticketId)) throw new Error('invalid_ticket_id');
    return `${ticketId.slice(0, 4)}-${ticketId.slice(4, 8)}`.toUpperCase();
}

/** Where the watermark sits during time slot `slot`; it changes on every slot. */
export function watermarkPosition(ticketId: string, slot: number): { top: number; left: number } {
    const seed = Number.parseInt(ticketId.slice(8, 12), 16) || 0;
    const index = (seed + Math.max(0, Math.floor(slot)) * 5) % POSITIONS.length;
    return POSITIONS[index];
}

export function watermarkSlot(nowMs: number): number {
    return Math.floor(nowMs / WATERMARK_MOVE_MS);
}
