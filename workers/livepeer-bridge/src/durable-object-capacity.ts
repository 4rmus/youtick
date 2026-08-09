export const DURABLE_OBJECT_MAX_PERSISTENT_RECORDS = 256;

export async function assertDurableObjectRecordCapacity(
    storage: DurableObjectStorage | DurableObjectTransaction,
    keys: string[],
): Promise<void> {
    const missing = [];
    for (const key of new Set(keys)) {
        if (await storage.get(key) === undefined) missing.push(key);
    }
    if (missing.length === 0) return;
    const records = await storage.list({ limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS });
    if (records.size + missing.length > DURABLE_OBJECT_MAX_PERSISTENT_RECORDS) {
        throw new Error('durable_object_record_limit');
    }
}
