import { describe, expect, it } from 'vitest';
import { qualityOptions } from '@/lib/livepeer-player-media';
import { resumablePosition } from '@/lib/watch-progress';
import { playerTime } from '@/lib/player-copy';

describe('player choices', () => {
    it('uses real rendition dimensions, retaining their level indexes', () => {
        expect(qualityOptions([
            { width: 0, height: 0, bitrate: 0 },
            { width: 468, height: 360, bitrate: 800_000 },
            { width: 934, height: 720, bitrate: 3_000_000 },
            { width: 1280, height: 720, bitrate: 3_000_000 },
            { width: 720, height: 1280, bitrate: 3_000_000 },
        ])).toEqual([
            { index: 1, label: '468 × 360' }, { index: 2, label: '934 × 720' },
            { index: 3, label: '720p' }, { index: 4, label: '720 × 1280' },
        ]);
    });
    it('distinguishes equal dimensions with different bitrates', () => {
        expect(qualityOptions([{ width: 640, height: 360, bitrate: 800_000 }, { width: 640, height: 360, bitrate: 400_000 }]).map(option => option.label))
            .toEqual(['360p · 800 kbps', '360p · 400 kbps']);
    });
    it('does not resume invalid, barely started or finished positions', () => {
        for (const position of [NaN, Infinity, -1, 0, 9, 105, 119, 120]) {
            expect(resumablePosition({ position, duration: 120, updatedAt: 1 })).toBeNull();
        }
        expect(resumablePosition({ position: 20, duration: 120, updatedAt: 1, token: 'discard' }))
            .toEqual({ position: 20, duration: 120, updatedAt: 1 });
        expect(resumablePosition('{bad json')).toBeNull();
    });
    it('formats long videos without resetting hours', () => {
        expect([NaN, 9, 65, 7200].map(playerTime)).toEqual(['0:00', '0:09', '1:05', '2:00:00']);
    });
});
