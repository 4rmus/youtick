export const DURABLE_OBJECT_MAX_PERSISTENT_RECORDS = 256;
export type DurableObjectStateKind = 'upload_job' | 'admission' | 'operator' | 'rate_limit';

export async function assertDurableObjectRecordCapacity(
    storage: DurableObjectStorage | DurableObjectTransaction,
    keys: string[],
    stateKind: DurableObjectStateKind,
): Promise<void> {
    const missing = [];
    for (const key of new Set(keys)) {
        if (await storage.get(key) === undefined) missing.push(key);
    }
    if (missing.length === 0) return;
    const records = await storage.list({ limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS });
    const projectedRecordCount = records.size + missing.length;
    console.info(JSON.stringify({
        event: 'durable_object_storage_observed',
        details: {
            stateKind,
            persistentRecordCount: records.size,
            pendingRecordCount: missing.length,
            projectedRecordCount,
            maxRecords: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
        },
    }));
    if (projectedRecordCount > DURABLE_OBJECT_MAX_PERSISTENT_RECORDS) {
        throw new Error('durable_object_record_limit');
    }
}
