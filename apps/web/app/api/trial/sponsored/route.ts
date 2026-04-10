import { NextResponse, NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Account, KeyPair, KeyPairSigner, actions, type KeyPairString } from "near-api-js";
import { trialAccountLimiter, trialDailyGlobalLimiter } from "@/lib/rate-limiter";
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from "@/lib/cors";
import { NEAR_CONFIG, GAS_CONSTANTS } from "@/lib/constants";
import { getProvider, viewContract } from "@/lib/near";
import { getCurrentRpcUrl } from "@/lib/rpc-failover";

interface RegistryRelayerRecord {
    account_id: string;
    endpoint: string;
    transport_public_key: string;
    kind: "Relayer";
    active: boolean;
}

interface RelayerCredentials {
    accountId: string;
    privateKey: string;
}

interface RelayerConfigFile {
    relayers?: Array<{
        accountId?: string;
    }>;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function getWorkspaceRoots(): string[] {
    const cwd = process.cwd();
    return [cwd, path.resolve(cwd, ".."), path.resolve(cwd, "..", "..")];
}

async function resolveConfiguredRelayerAccountId(networkId: 'mainnet' | 'testnet'): Promise<string | null> {
    if (process.env.RELAYER_ACCOUNT_ID) {
        return process.env.RELAYER_ACCOUNT_ID;
    }

    for (const root of getWorkspaceRoots()) {
        const configPath = path.join(root, "scripts", "config", `${networkId}-kms-operators.json`);
        const config = await readJsonFile<RelayerConfigFile>(configPath);
        const accountId = config?.relayers?.[0]?.accountId;
        if (accountId) {
            return accountId;
        }
    }

    return null;
}

async function resolveRelayerPrivateKey(networkId: 'mainnet' | 'testnet', accountId: string): Promise<string | null> {
    if (process.env.RELAYER_PRIVATE_KEY) {
        return process.env.RELAYER_PRIVATE_KEY;
    }

    // SECURITY: In production (mainnet), only accept the environment variable.
    // Filesystem credential loading is restricted to testnet for development convenience.
    if (networkId === 'mainnet') {
        console.error('[SECURITY] RELAYER_PRIVATE_KEY env var is required on mainnet');
        return null;
    }

    const candidatePaths = [
        ...getWorkspaceRoots().map((root) => path.join(root, ".near-credentials", networkId, `${accountId}.json`)),
        path.join(homedir(), ".near-credentials", networkId, `${accountId}.json`),
    ];

    for (const candidatePath of candidatePaths) {
        const credential = await readJsonFile<Record<string, unknown>>(candidatePath);
        const privateKey = credential?.secret_key || credential?.private_key;
        if (typeof privateKey === "string" && privateKey.startsWith("ed25519:")) {
            return privateKey;
        }
    }

    return null;
}

async function resolveRelayerCredentials(networkId: 'mainnet' | 'testnet'): Promise<RelayerCredentials | null> {
    const accountId = await resolveConfiguredRelayerAccountId(networkId);
    if (!accountId) {
        return null;
    }

    const privateKey = await resolveRelayerPrivateKey(networkId, accountId);
    if (!privateKey) {
        return null;
    }

    return { accountId, privateKey };
}

async function verifyActiveRelayer(
    relayerAccountId: string,
    networkId: 'mainnet' | 'testnet',
): Promise<RegistryRelayerRecord | null> {
    const registryContractId = NEAR_CONFIG.registryContractId;
    if (!registryContractId) {
        return null;
    }

    try {
        const provider = getProvider();
        const record = await viewContract<RegistryRelayerRecord | null>(
            provider,
            registryContractId,
            'get_relayer',
            { account_id: relayerAccountId },
        );

        if (!record?.active) {
            return null;
        }

        const expectedEndpoint = `near:${networkId}:${relayerAccountId}`;
        if (record.endpoint !== expectedEndpoint) {
            return null;
        }

        return record;
    } catch (error) {
        console.error('[REGISTRY] Failed to verify relayer:', error);
        return null;
    }
}

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

    let ipLimitReserved = false;
    let globalLimitReserved = false;
    let clientIp = 'unknown';

    try {
        // Get client IP for rate limiting
        // Use platform-provided IP (trusted proxy) over client-controlled x-forwarded-for header
        // Vercel/Next.js populates request.ip from the trusted edge proxy layer
        // IP-1 fix: prefer request.ip when available (Vercel edge), fallback to x-forwarded-for
        clientIp = (request as unknown as { ip?: string }).ip
            || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || 'unknown';

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

        const networkId = NEAR_CONFIG.networkId;
        const resolvedRelayer = await resolveRelayerCredentials(networkId);
        if (!resolvedRelayer) {
            console.error("[SECURITY] Missing relayer credentials for sponsored trial flow");
            return addCorsHeaders(
                NextResponse.json(
                    {
                        error: "Trial service is not configured.",
                        code: "RELAYER_CREDENTIALS_MISSING",
                    },
                    { status: 503 }
                ),
                request
            );
        }

        const { accountId: relayerAccountId, privateKey: relayerPrivateKey } = resolvedRelayer;

        if (!relayerPrivateKey.startsWith('ed25519:')) {
            console.error("[SECURITY] Invalid relayer key format - expected ed25519: prefix");
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        const contractId = NEAR_CONFIG.contractId;

        const activeRelayer = await verifyActiveRelayer(
            relayerAccountId,
            networkId,
        );
        if (!activeRelayer) {
            return addCorsHeaders(
                NextResponse.json(
                    { error: "Relayer is not active in the registry.", code: "RELAYER_INACTIVE" },
                    { status: 503 },
                ),
                request,
            );
        }

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
        ipLimitReserved = true;

        if (!trialDailyGlobalLimiter.checkAndIncrement()) {
            if (ipLimitReserved) {
                trialAccountLimiter.rollback(clientIp);
                ipLimitReserved = false;
            }
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
        globalLimitReserved = true;

        // The new account will be: {username}.{contractId}
        const newAccountId = `${username}.${contractId}`;

        // v7: Create Account with signer directly
        const keyPair = KeyPair.fromString(relayerPrivateKey as KeyPairString);
        const signer = new KeyPairSigner(keyPair);
        const relayerAccount = new Account(relayerAccountId, getCurrentRpcUrl(), signer);

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
        if (globalLimitReserved) {
            trialDailyGlobalLimiter.rollback();
        }
        if (ipLimitReserved) {
            trialAccountLimiter.rollback(clientIp);
        }

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
        } else if (errorMessage.includes("RELAYER_CREDENTIALS_MISSING")) {
            errorRes = NextResponse.json(
                {
                    error: "Trial service is not configured.",
                    code: "RELAYER_CREDENTIALS_MISSING"
                },
                { status: 503 }
            );
        } else if (errorMessage.includes("already exists")) {
            errorRes = NextResponse.json(
                { error: "This username is already taken. Please choose another.", code: "USERNAME_TAKEN" },
                { status: 409 }
            );
        } else if (errorMessage.includes("authorized relayer")) {
            errorRes = NextResponse.json(
                { error: "Trial relayer is not authorized on the contract.", code: "RELAYER_UNAUTHORIZED" },
                { status: 503 }
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
