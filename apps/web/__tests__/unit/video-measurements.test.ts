import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackEvent } from '@livepeer/react';
import { measureVideoOperation, observeVideoState, recordVideoPlaybackEvents, startVideoMeasurement } from '@/lib/video-measurements';

describe('local video measurements', () => {
    afterEach(() => vi.restoreAllMocks());

    it('uses one monotonic clock and preserves both success and rejection', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        let now = 10;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.spyOn(Date, 'now').mockReturnValue(9_000_000_000);
        const result = { token: 'secret-token' };
        await expect(measureVideoOperation('source_transfer', async () => {
            now = 35;
            return result;
        }, 5_000_000_000)).resolves.toBe(result);
        expect(JSON.parse(String(log.mock.calls[1][0]))).toMatchObject({
            phase: 'source_transfer', outcome: 'completed', durationMs: 25,
            startedAtMs: 10, sourceBytes: 5_000_000_000, clock: 'performance',
        });
        const failure = new Error('secret-signed-transaction');
        await expect(measureVideoOperation('wallet_signature', async () => {
            throw failure;
        })).rejects.toBe(failure);
        expect(JSON.parse(String(log.mock.calls[3][0])).outcome).toBe('failed');
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });

    it('does not let a broken measurement sink change the operation', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('console disabled'); });
        const operation = vi.fn().mockResolvedValue('paid');
        await expect(measureVideoOperation('payment_relay', operation)).resolves.toBe('paid');
        expect(operation).toHaveBeenCalledOnce();
    });

    it('records one terminal result when component cleanup follows completion', () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const finish = startVideoMeasurement('playback_preparation');
        finish('completed');
        finish('cancelled');
        expect(log).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(log.mock.calls[1][0])).outcome).toBe('completed');
    });

    it('keeps chain time as metadata and ignores unknown provider states', () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        observeVideoState('PUBLICATION_OBSERVED', 1_785_000_000_000);
        observeVideoState('secret-provider-error');
        expect(log).toHaveBeenCalledOnce();
        const entry = JSON.parse(String(log.mock.calls[0][0]));
        expect(entry.chainPublishedAtMs).toBe(1_785_000_000_000);
        expect(entry).not.toHaveProperty('durationMs');
    });

    it('uses SDK TTFF rather than batch arrival or module-load time and drops raw errors', () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        recordVideoPlaybackEvents([
            { type: 'heartbeat', timestamp: 100, play_to_first_frame_ms: 25,
                mount_to_first_frame_ms: 9000, time_waiting_ms: 8, time_stalled_ms: -1 },
            { type: 'first-frame', timestamp: 75 },
            { type: 'error', timestamp: 101, message: 'https://private.example/?jwt=secret' },
        ] as PlaybackEvent[]);
        const entries = log.mock.calls.map(([value]) => JSON.parse(String(value)));
        expect(entries[0].metrics).toEqual({ play_to_first_frame_ms: 25, time_waiting_ms: 8 });
        expect(entries[1]).toMatchObject({ playerEvent: 'first-frame', playerTimestampMs: 75 });
        expect(entries[1]).not.toHaveProperty('durationMs');
        expect(JSON.stringify(entries)).not.toMatch(/jwt|secret|mount_to_first_frame/);
    });
});
