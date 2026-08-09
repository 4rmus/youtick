import { describe, expect, it, vi } from 'vitest';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';

describe('Durable Object capacity telemetry', () => {
    it('emits the bounded projected record count before rejecting overflow', async () => {
        const values = new Map(Array.from(
            { length: 255 },
            (_, index) => [`record:${index}`, index],
        ));
        const storage = {
            get: vi.fn(async (key: string) => values.get(key)),
            list: vi.fn(async () => values),
        } as unknown as DurableObjectStorage;
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        await expect(assertDurableObjectRecordCapacity(
            storage,
            ['candidate:a', 'candidate:b'],
            'upload_job',
        )).rejects.toThrow('durable_object_record_limit');

        expect(info).toHaveBeenCalledOnce();
        expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({
            event: 'durable_object_storage_observed',
            details: {
                stateKind: 'upload_job',
                persistentRecordCount: 255,
                pendingRecordCount: 2,
                projectedRecordCount: 257,
                maxRecords: 256,
            },
        });
    });
});
