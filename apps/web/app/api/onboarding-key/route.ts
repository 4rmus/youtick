import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
    Account,
    KeyPair,
    KeyPairSigner,
    actions,
    type KeyPairString,
} from 'near-api-js';
import { RateLimiter } from '@/lib/rate-limiter';

type RelayAction =
    | 'create_sponsored_trial_direct'
    | 'sponsor_implicit_guest_direct'
    | 'claim_free_ticket_direct';

type RelayBody = {
    action?: RelayAction;
    args?: Record<string, unknown>;
    turnstileToken?: string;
};

const relayLimiter = new RateLimiter(
    { windowMs: 60 * 60 * 1000, maxRequests: 10 },
    'onboarding-relay-per-ip',
);
let signerQueue: Promise<void> = Promise.resolve();

async function getClientIp(): Promise<string> {
    const values = await headers();
    return values.get('x-forwarded-for')?.split(',')[0].trim()
        || values.get('x-real-ip')?.trim()
        || 'unknown';
}

async function verifyTurnstile(token: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return false;
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, response: token }),
        });
        const data = await response.json() as { success?: boolean };
        return data.success === true;
    } catch {
        return false;
    }
}

function validateRelayRequest(body: RelayBody): body is Required<Pick<RelayBody, 'action' | 'args'>> & RelayBody {
    if (!body.action || !body.args || typeof body.args !== 'object') return false;
    const publicKey = body.args.new_public_key;
    const receiverId = body.args.receiver_id;
    const cid = body.args.encrypted_cid;
    const username = body.args.username;

    if (body.action === 'sponsor_implicit_guest_direct') {
        return typeof publicKey === 'string' && /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(publicKey);
    }
    if (body.action === 'create_sponsored_trial_direct') {
        return typeof username === 'string'
            && /^[a-z0-9_-]{2,32}$/.test(username)
            && typeof publicKey === 'string'
            && /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(publicKey);
    }
    return body.action === 'claim_free_ticket_direct'
        && typeof receiverId === 'string'
        && /^[a-z0-9._-]{2,64}$/.test(receiverId)
        && typeof cid === 'string'
        && cid.length > 0
        && cid.length <= 256;
}

function readOnboardingKeys(): string[] {
    return (process.env.ONBOARDING_KEYS || process.env.ONBOARDING_KEY || '')
        .split(',')
        .map((key) => key.trim())
        .filter((key) => key.startsWith('ed25519:'));
}

async function withSignerQueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = signerQueue;
    let release!: () => void;
    signerQueue = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        return await operation();
    } finally {
        release();
    }
}

export async function GET(): Promise<NextResponse> {
    return NextResponse.json(
        { error: 'Private onboarding keys are not distributed. Use POST relay.' },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
}

export async function POST(request: Request): Promise<NextResponse> {
    const ip = await getClientIp();
    if (!relayLimiter.checkLimit(ip)) {
        return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null) as RelayBody | null;
    if (!body || !validateRelayRequest(body)) {
        return NextResponse.json({ error: 'Invalid onboarding action.' }, { status: 400 });
    }

    if (process.env.NODE_ENV !== 'development') {
        if (!process.env.TURNSTILE_SECRET_KEY || !body.turnstileToken) {
            relayLimiter.rollback(ip);
            return NextResponse.json({ error: 'Challenge token required.' }, { status: 403 });
        }
        if (!await verifyTurnstile(body.turnstileToken)) {
            relayLimiter.rollback(ip);
            return NextResponse.json({ error: 'Challenge verification failed.' }, { status: 403 });
        }
    }

    const keys = readOnboardingKeys();
    if (keys.length === 0) {
        return NextResponse.json({ error: 'Onboarding signer is not configured.' }, { status: 503 });
    }

    const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'youtick.near';
    const rpcUrl = process.env.NEAR_RPC_URL || 'https://free.rpc.fastnear.com';
    try {
        const result = await withSignerQueue(async () => {
            const keyPair = KeyPair.fromString(
                keys[Math.floor(Math.random() * keys.length)] as KeyPairString,
            );
            const account = new Account(contractId, rpcUrl, new KeyPairSigner(keyPair));
            return account.signAndSendTransaction({
                receiverId: contractId,
                actions: [actions.functionCall(body.action, body.args, BigInt('100000000000000'), 0n)],
            });
        });
        return NextResponse.json(
            { ok: true, transactionHash: result.transaction.hash },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('[ONBOARDING_RELAY] transaction failed', error);
        return NextResponse.json({ error: 'Onboarding transaction failed.' }, { status: 502 });
    }
}
