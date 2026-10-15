// Test helper: the subset of D1 the refund inbox and card path use, over in-memory SQLite (Node 24) with the real
// migrations. Plain JavaScript because the Worker's tsconfig has no Node types.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function sqliteD1() {
    const sqlite = new DatabaseSync(':memory:');
    const migrations = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
        sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
    }
    return {
        prepare(sql) {
            let values = [];
            const statement = {
                bind: (...next) => { values = next; return statement; },
                first: async () => sqlite.prepare(sql).get(...values) ?? null,
                all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
                run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
            };
            return statement;
        },
    };
}
