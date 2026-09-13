import { getDeviceSessionRevision, onDeviceSessionCleared, openStore } from './device-session';
import type { LivepeerPlaybackInput } from './livepeer-playback';

export type WatchPosition = { position: number; duration: number; updatedAt: number };

export function resumablePosition(value: unknown): WatchPosition | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as WatchPosition;
    return Number.isFinite(record.position) && Number.isFinite(record.duration)
        && Number.isFinite(record.updatedAt) && record.updatedAt > 0
        && record.position >= 10 && record.duration - record.position > 15
        ? { position: record.position, duration: record.duration, updatedAt: record.updatedAt } : null;
}

// Reuse the device store: logout clears positions and advances its revision atomically.
export async function openWatchProgress(input: LivepeerPlaybackInput, signal: AbortSignal) {
    const expectedRevision = getDeviceSessionRevision();
    if (expectedRevision === undefined || signal.aborted) return null;
    const key = `watch-progress:${JSON.stringify([input.accountId, input.jobId, input.generation, input.playbackId])}`;
    let stopped: boolean = false;
    const stop = () => { stopped = true; };
    const unsubscribe = onDeviceSessionCleared(stop);
    signal.addEventListener('abort', stop, { once: true });
    const destroy = () => {
        stop();
        unsubscribe();
        signal.removeEventListener('abort', stop);
    };
    try {
        const db = await openStore();
        const initial = await new Promise<{ revision: number; deviceKey?: string; position: unknown }>((resolve, reject) => {
            const tx = db.transaction('sessions', 'readonly');
            const store = tx.objectStore('sessions');
            const revision = store.get('revision');
            const device = store.get(`account:${input.accountId}`);
            const position = store.get(key);
            tx.oncomplete = () => {
                db.close();
                resolve({ revision: revision.result ?? 0, deviceKey: device.result?.certificate?.session_public_key, position: position.result });
            };
            tx.onerror = tx.onabort = () => { db.close(); reject(new Error('progress_unavailable')); };
        });
        if (stopped || initial.revision !== expectedRevision || !initial.deviceKey) { destroy(); return null; }
        let lastWrite = 0;
        return {
            position: resumablePosition(initial.position),
            destroy,
            async save(position: number, duration: number, force = false): Promise<void> {
                if (stopped || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
                const now = Date.now();
                if (!force && now - lastWrite < 5_000) return;
                lastWrite = now;
                try {
                    const database = await openStore();
                    await new Promise<void>((resolve) => {
                        const tx = database.transaction('sessions', 'readwrite');
                        const store = tx.objectStore('sessions');
                        const revision = store.get('revision');
                        revision.onsuccess = () => {
                            if (stopped || (revision.result ?? 0) !== initial.revision) return;
                            const device = store.get(`account:${input.accountId}`);
                            device.onsuccess = () => {
                                if (stopped || device.result?.certificate?.session_public_key !== initial.deviceKey) return;
                                const record = resumablePosition({ position, duration, updatedAt: now });
                                if (record) store.put(record, key);
                                else store.delete(key);
                            };
                        };
                        tx.oncomplete = tx.onerror = tx.onabort = () => { database.close(); resolve(); };
                    });
                } catch { /* Progress is optional; storage failure must not interrupt playback. */ }
            },
        };
    } catch { destroy(); return null; }
}
