import { describe, expect, it } from 'vitest';

import { getLatestEventsQuery } from '@/lib/event-query';

describe('event query helpers', () => {
    it('selects the latest event window from the contract list', () => {
        expect(getLatestEventsQuery(125)).toEqual({
            from_index: '25',
            limit: 100,
        });
    });

    it('uses all events when the count is below the window size', () => {
        expect(getLatestEventsQuery(3)).toEqual({
            from_index: '0',
            limit: 3,
        });
    });

    it('returns no query when there are no events', () => {
        expect(getLatestEventsQuery(0)).toBeNull();
    });
});
