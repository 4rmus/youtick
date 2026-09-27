// Node-only unit-test stand-in. Runtime bundling is checked separately by Wrangler.
export class WorkerEntrypoint<E> {
    constructor(readonly ctx: unknown, readonly env: E) {}
}
