// The single card operator (roadmap E8). One Durable Object instance sends every card ticket
// transaction, so the payment operator key's nonce is never raced. It runs when woken by a
// webhook or a signature, and again from an alarm while orders still wait.
import { runCardOperator, nearSigner } from './card-operator';
import { cardConfig, paymentConfig, type Env } from './env';
import { rpcView } from './market';

const RETRY_MS = 30_000;
export const CARD_OPERATOR_NAME = 'card-operator';

export class CardOperator {
    constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

    async fetch(): Promise<Response> {
        if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now());
        return new Response(null, { status: 202 });
    }

    async alarm(): Promise<void> {
        const config = paymentConfig(this.env);
        const card = cardConfig(this.env);
        if (!config || !card || !this.env.REFUNDS) return;
        const { sign, txStatus } = nearSigner({ rpcUrl: config.rpcUrl, operatorId: card.operatorId, privateKey: card.operatorPrivateKey, contractId: config.marketContractId });
        // Orders with an unknown outcome are not counted here; the cron (every 5 minutes) re-reads them.
        const { waiting } = await runCardOperator({
            db: this.env.REFUNDS, view: rpcView(config.rpcUrl), contractId: config.marketContractId, now: Date.now, sign, txStatus,
        });
        if (waiting > 0) await this.state.storage.setAlarm(Date.now() + RETRY_MS);
    }
}

export async function wakeCardOperator(env: Env): Promise<void> {
    if (!env.CARD_OPERATOR) return;
    await env.CARD_OPERATOR.get(env.CARD_OPERATOR.idFromName(CARD_OPERATOR_NAME)).fetch('https://card-operator/run', { method: 'POST' });
}
