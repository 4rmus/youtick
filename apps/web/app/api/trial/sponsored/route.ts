import { NextResponse, NextRequest } from "next/server";
import { Account, KeyPair, KeyPairSigner, actions, type KeyPairString } from "near-api-js";
import { trialAccountLimiter, trialDailyGlobalLimiter } from "@/lib/rate-limiter";
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from "@/lib/cors";
import { NEAR_CONFIG, GAS_CONSTANTS } from "@/lib/constants";

/**
 * Sponsored Trial API - Creates trial accounts as subaccounts of the contract
 *
 * POST /api/trial/sponsored
 * Body: { username: string, new_public_key: string }
 *
 * Creates: {username}.{contract_id} (e.g. "alice.youtick.near")
 *
 * SECURITY: Rate limited to prevent spam account creation
 * - Per IP: 3 accounts per day
 * - Global: 100 accounts per day
 */
export async function POST(request: NextRequest) {
    // CORS check
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    try {
        // Get client IP for rate limiting
        const forwardedFor = request.headers.get('x-forwarded-for');
        const clientIp = forwardedFor?.split(',')[0]?.trim() || 'unknown';

        // Rate limit check - per IP (3/day)
        if (!trialAccountLimiter.checkLimit(clientIp)) {
            const resetTime = trialAccountLimiter.getResetTime(clientIp);
            console.log(`[RATE_LIMIT] Trial account blocked for IP ${clientIp} - retry after ${Math.ceil(resetTime / 1000)}s`);
            const errorRes = NextResponse.json(
                {
                    error: "Rate limit exceeded. Maximum 3 trial accounts per day per IP.",
                    code: "RATE_LIMITED",
                    retryAfter: Math.ceil(resetTime / 1000)
                },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetTime / 1000).toString() }
                }
            );
            return addCorsHeaders(errorRes, request);
        }

        // Global daily limit check (100/day)
        if (!trialDailyGlobalLimiter.checkAndIncrement()) {
            console.log(`[RATE_LIMIT] Global trial limit reached (${trialDailyGlobalLimiter.getCount()}/day)`);
            const errorRes = NextResponse.json(
                {
                    error: "Daily trial account limit reached. Please try again tomorrow.",
                    code: "DAILY_LIMIT_REACHED"
                },
                { status: 503 }
            );
            return addCorsHeaders(errorRes, request);
        }

        const body = await request.json();
        const { username, new_public_key } = body;

        if (!username || !new_public_key) {
            const errorRes = NextResponse.json(
                { error: "Missing username or new_public_key" },
                { status: 400 }
            );
            return addCorsHeaders(errorRes, request);
        }

        // Validate username format (contract will also validate)
        const usernamePattern = /^[a-z0-9_-]{2,32}$/;
        if (!usernamePattern.test(username)) {
            const errorRes = NextResponse.json(
                { error: "Username must be 2-32 characters, lowercase letters, numbers, - and _ only" },
                { status: 400 }
            );
            return addCorsHeaders(errorRes, request);
        }

        // Validate public key format (NEAR ed25519 keys: "ed25519:" + 43-44 base58 chars)
        const publicKeyPattern = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
        if (!publicKeyPattern.test(new_public_key)) {
            return addCorsHeaders(
                NextResponse.json(
                    { error: "Invalid public key format. Expected ed25519:..." },
                    { status: 400 }
                ),
                request
            );
        }

        // Audit logging (never log credentials or full key material)
        console.log(`[AUDIT] Trial Account Request: username=${username} ip=${clientIp} time=${new Date().toISOString()} daily_remaining=${trialDailyGlobalLimiter.getRemaining()}`);

        // Get relayer credentials from environment
        // SECURITY: These should be migrated to a secret manager (e.g. Vercel encrypted env vars,
        // AWS Secrets Manager, or HashiCorp Vault) for production deployments.
        // Current mitigation: server-side only (not prefixed with NEXT_PUBLIC_), rate-limited endpoint.
        const relayerAccountId = process.env.RELAYER_ACCOUNT_ID;
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

        if (!relayerAccountId || !relayerPrivateKey) {
            // Log presence/absence only - never log actual key values
            console.error("[SECURITY] Missing relayer credentials:", {
                hasAccountId: !!relayerAccountId,
                hasPrivateKey: !!relayerPrivateKey,
            });
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        // Validate key format before use
        if (!relayerPrivateKey.startsWith('ed25519:')) {
            console.error("[SECURITY] Invalid relayer key format - expected ed25519: prefix");
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        const contractId = NEAR_CONFIG.contractId;
        const networkId = NEAR_CONFIG.networkId;

        // The new account will be: {username}.{contractId}
        const newAccountId = `${username}.${contractId}`;

        // v7: Create Account with signer directly
        const keyPair = KeyPair.fromString(relayerPrivateKey as KeyPairString);
        const signer = new KeyPairSigner(keyPair);
        const rpcUrl = networkId === "mainnet"
            ? "https://rpc.fastnear.com"
            : "https://test.rpc.fastnear.com";

        const relayerAccount = new Account(relayerAccountId, rpcUrl, signer);

        // Call contract's create_sponsored_trial with username using v7 actions
        const result = await relayerAccount.signAndSendTransaction({
            receiverId: contractId,
            actions: [
                actions.functionCall(
                    "create_sponsored_trial",
                    { username, new_public_key },
                    GAS_CONSTANTS.highGas, // 200 TGas
                    BigInt(0) // No deposit
                )
            ]
        });

        const successRes = NextResponse.json({
            success: true,
            account_id: newAccountId,
            transaction_hash: result.transaction.hash,
        });
        return addCorsHeaders(successRes, request);

    } catch (error: unknown) {
        // Log full error server-side for debugging, but never expose to client
        console.error("[SECURITY] Sponsored trial error:", error);

        let errorRes: NextResponse;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Return safe, user-facing error messages only
        if (errorMessage.includes("Trial pool empty")) {
            errorRes = NextResponse.json(
                { error: "Trial pool is empty. Please try again later.", code: "TRIAL_POOL_EMPTY" },
                { status: 503 }
            );
        } else if (errorMessage.includes("already exists")) {
            errorRes = NextResponse.json(
                { error: "This username is already taken. Please choose another.", code: "USERNAME_TAKEN" },
                { status: 409 }
            );
        } else {
            // Never leak internal error messages to clients
            errorRes = NextResponse.json(
                { error: "Failed to create trial account. Please try again.", code: "TRIAL_CREATE_FAILED" },
                { status: 500 }
            );
        }

        return addCorsHeaders(errorRes, request);
    }
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
