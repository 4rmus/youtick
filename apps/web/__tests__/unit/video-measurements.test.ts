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

    it.each(['completed', 'failed', 'cancelled', 'disconnected'] as const)(
        'keeps a delayed wallet restore open until %s without exposing errors', (outcome) => {
            const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
            let now = 100;
            vi.spyOn(performance, 'now').mockImplementation(() => now);
            const finish = startVideoMeasurement('wallet_restore');
            now = 5100;
            finish('delayed');
            now = 6100;
            finish(outcome, new Error('secret wallet payload'));
            finish('cancelled');
            const events = log.mock.calls.map(([value]) => JSON.parse(String(value)));
            expect(events.map((event) => event.outcome)).toEqual(['started', 'delayed', outcome]);
            expect(events[1]).toMatchObject({ phase: 'wallet_restore', durationMs: 5000 });
            expect(events[2]).toMatchObject({ phase: 'wallet_restore', durationMs: 6000 });
            expect(JSON.stringify(events)).not.toContain('secret');
        },
    );

    it.each([
        ['playback_denied', 403], ['rate_limited', 429],
        ['provider_unavailable', 503], ['internal_error', 500],
        ['invalid_livepeer_playback_token', 200],
    ])('records only the safe token error %s and status %s', async (code, status) => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const failure = Object.assign(new Error(String(code)), {
            status, token: 'secret-token', cause: 'secret-cause', url: 'https://private/?jwt=secret',
        });
        for (const phase of ['playback_token_initial', 'playback_token_renewal'] as const) {
            await expect(measureVideoOperation(phase, async () => { throw failure; })).rejects.toBe(failure);
        }
        expect(log.mock.calls).toHaveLength(4);
        for (const index of [1, 3]) {
            expect(JSON.parse(String(log.mock.calls[index][0]))).toMatchObject({
                outcome: 'failed', errorCode: code, httpStatus: status,
            });
        }
        expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private|stack|cause/);
    });

    it.each([undefined, '503', NaN, Infinity, 429.5, 99, 600])(
        'drops unknown messages and invalid status %s', async (status) => {
            const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
            const failure = Object.assign(new Error('device_session_secret_https://private/?jwt=secret'), { status });
            await expect(measureVideoOperation('playback_token_initial', async () => { throw failure; })).rejects.toBe(failure);
            const event = JSON.parse(String(log.mock.calls[1][0]));
            expect(event.errorCode).toBe('unknown_error');
            expect(event).not.toHaveProperty('httpStatus');
            expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private/);
        },
    );

    it('does not label TypeError as a network failure or expose it to payment measurements', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const failure = new TypeError('secret crypto operation');
        await expect(measureVideoOperation('playback_token_initial', async () => { throw failure; })).rejects.toBe(failure);
        expect(JSON.parse(String(log.mock.calls[1][0]))).toMatchObject({ outcome: 'failed', errorCode: 'type_error' });
        for (const phase of ['wallet_signature', 'source_transfer', 'playback_preparation'] as const) {
            await expect(measureVideoOperation(phase, async () => { throw failure; })).rejects.toBe(failure);
            const event = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
            expect(event).not.toHaveProperty('errorCode');
            expect(event).not.toHaveProperty('httpStatus');
        }
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });

    it.each([
        new DOMException('secret abort reason', 'AbortError'),
        new Error('device_session_cancelled'), new Error('livepeer_playback_cancelled'),
    ])('records explicit cancellation without replacing the thrown error', async (failure) => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        await expect(measureVideoOperation('playback_token_initial', async () => { throw failure; })).rejects.toBe(failure);
        expect(JSON.parse(String(log.mock.calls[1][0])).outcome).toBe('cancelled');
        expect(log).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });

    it('records signal cancellation on rejection and late success without changing either result', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const controller = new AbortController();
        const failure = Object.assign(new Error('playback_denied'), { status: 403 });
        const operation = vi.fn(async () => {
            controller.abort('secret reason');
            throw failure;
        });
        await expect(measureVideoOperation('playback_token_initial', operation, undefined, controller.signal)).rejects.toBe(failure);
        expect(operation).toHaveBeenCalledOnce();
        expect(JSON.parse(String(log.mock.calls[1][0]))).toMatchObject({
            outcome: 'cancelled', errorCode: 'playback_denied', httpStatus: 403,
        });
        const result = { token: 'secret-token' };
        await expect(measureVideoOperation('playback_token_renewal', async () => result, undefined, controller.signal)).resolves.toBe(result);
        expect(JSON.parse(String(log.mock.calls[3][0]))).toMatchObject({ outcome: 'cancelled', errorCode: 'cancelled' });
        expect(log).toHaveBeenCalledTimes(4);
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });

    it('keeps extraction and console failures from changing the original rejection', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const failure = Object.defineProperty(new Error(), 'message', { get() { throw new Error('secret getter'); } });
        await expect(measureVideoOperation('playback_token_initial', async () => { throw failure; })).rejects.toBe(failure);
        expect(JSON.parse(String(log.mock.calls[1][0])).errorCode).toBe('unknown_error');
        log.mockImplementation(() => { throw new Error('console disabled'); });
        await expect(measureVideoOperation('playback_token_initial', async () => { throw failure; })).rejects.toBe(failure);
    });

    it('omits error fields and token content on success', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const result = { token: 'secret-token' };
        await expect(measureVideoOperation('playback_token_initial', async () => result)).resolves.toBe(result);
        expect(JSON.parse(String(log.mock.calls[1][0]))).not.toHaveProperty('errorCode');
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
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
