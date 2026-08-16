import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertDurableObjectRecordCapacity,
    type DurableObjectStateKind,
} from './durable-object-capacity';

const STATE_KINDS: DurableObjectStateKind[] = [
    'upload_job',
    'admission',
    'operator',
    'rate_limit',
];

describe('Durable Object capacity telemetry', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(STATE_KINDS)('rejects %s record 257 before writing it', async (stateKind) => {
        const values = new Map(Array.from(
            { length: 255 },
            (_, index) => [`record:${index}`, index],
        ));
        const storage = {
            get: vi.fn(async (key: string) => values.get(key)),
            list: vi.fn(async () => values),
            put: vi.fn(),
        } as unknown as DurableObjectTransaction;
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        await expect((async () => {
            await assertDurableObjectRecordCapacity(
                storage,
                ['candidate:a', 'candidate:b'],
                stateKind,
            );
            await storage.put('candidate:a', 1);
        })()).rejects.toThrow('durable_object_record_limit');

        expect(storage.put).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledOnce();
        expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({
            event: 'durable_object_storage_observed',
            details: {
                stateKind,
                persistentRecordCount: 255,
                pendingRecordCount: 2,
                projectedRecordCount: 257,
                maxRecords: 256,
            },
        });
    });

    it.each(STATE_KINDS)('permits a %s existing-key update at 256 records', async (stateKind) => {
        const values = new Map(Array.from(
            { length: 256 },
            (_, index) => [`record:${index}`, index],
        ));
        const storage = {
            get: vi.fn(async (key: string) => values.get(key)),
            list: vi.fn(async () => values),
            put: vi.fn(),
        } as unknown as DurableObjectTransaction;

        await assertDurableObjectRecordCapacity(storage, ['record:0'], stateKind);
        await storage.put('record:0', 257);

        expect(storage.list).not.toHaveBeenCalled();
        expect(storage.put).toHaveBeenCalledWith('record:0', 257);
    });
});
