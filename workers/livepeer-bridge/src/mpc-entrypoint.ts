import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './index';
import type { MpcCommand, MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { mpcConfig } from './mpc-sponsor';

// Bound explicitly by a future Web Service binding; the public fetch handler has no MPC route.
export class NearAuthMpcSponsor extends WorkerEntrypoint<Env> {
    async submit(command: MpcCommand): Promise<MpcStatus> {
        return this.#call('submit', command, true);
    }
    async status(accountId: string, operationId = ''): Promise<MpcStatus | null> {
        return this.#call('status', { accountId, operationId }, false);
    }
    async executeTicket(accountId: string, operationId: string): Promise<MpcStatus | null> {
        return this.#call('ticket', { accountId, operationId }, true);
    }
    async executeDevice(accountId: string, operationId: string): Promise<MpcStatus | null> {
        return this.#call('device', { accountId, operationId }, true);
    }
    async #call<T>(method: 'submit' | 'status' | 'ticket' | 'device', value: unknown, sending: boolean): Promise<T> {
        const config = await mpcConfig(this.env, sending);
        if (!this.env.LIVEPEER_CONTROL) throw new Error('mpc_not_configured');
        const object = this.env.LIVEPEER_CONTROL.get(this.env.LIVEPEER_CONTROL.idFromName(config.objectName));
        const response = await object.fetch(new Request(`https://object/internal/mpc/${method}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
        }));
        if (!response.ok) throw new Error('mpc_request_rejected');
        return response.json() as Promise<T>;
    }
}
