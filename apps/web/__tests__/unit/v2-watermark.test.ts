import { describe, expect, it } from 'vitest';
import { watermarkCode, watermarkPosition, watermarkSlot, WATERMARK_MOVE_MS } from '@/lib/v2/watermark';

const TICKET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('V2 ticket watermark', () => {
    it('shows a short code from the public ticket id and refuses anything else', () => {
        expect(watermarkCode(TICKET)).toBe('A1B2-C3D4');
        expect(() => watermarkCode('alice.near')).toThrow('invalid_ticket_id');
        expect(() => watermarkCode(TICKET.toUpperCase())).toThrow('invalid_ticket_id');
    });

    it('moves to a new place every slot and visits every position', () => {
        const seen = new Set<string>();
        let previous = '';
        for (let slot = 0; slot < 8; slot += 1) {
            const place = JSON.stringify(watermarkPosition(TICKET, slot));
            expect(place).not.toBe(previous);
            previous = place;
            seen.add(place);
        }
        expect(seen.size).toBe(8);
        for (const place of seen) {
            const { top, left } = JSON.parse(place) as { top: number; left: number };
            // Clear of the bottom control bar and inside the frame.
            expect(top).toBeLessThanOrEqual(62);
            expect(left).toBeLessThanOrEqual(62);
        }
    });

    it('changes slot every 30 seconds', () => {
        expect(WATERMARK_MOVE_MS).toBe(30_000);
        expect(watermarkSlot(29_999)).toBe(0);
        expect(watermarkSlot(30_000)).toBe(1);
    });
});
