import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { ReconcileRecord } from './types';
import { RECONCILE_KEY } from './constants';

export async function ensureReconcileScheduled(state: DurableObjectState): Promise<void> {
    await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<ReconcileRecord>(RECONCILE_KEY);
        if (existing) return;
        const now = Date.now();
        await assertDurableObjectRecordCapacity(transaction, [RECONCILE_KEY], 'upload_job');
        await transaction.put(RECONCILE_KEY, {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
        } satisfies ReconcileRecord);
    });
    await scheduleReconcile(state, Date.now());
}

export async function scheduleReconcile(state: DurableObjectState, atMs: number): Promise<void> {
    await scheduleAlarmNoLaterThan(state, atMs);
}

export async function scheduleAlarmNoLaterThan(state: DurableObjectState, atMs: number): Promise<void> {
    const setAlarm = state.storage.setAlarm;
    if (typeof setAlarm !== 'function') return;
    const getAlarm = state.storage.getAlarm;
    const existing = typeof getAlarm === 'function'
        ? await getAlarm.call(state.storage)
        : null;
    if (existing === null || existing > atMs) await setAlarm.call(state.storage, atMs);
}
