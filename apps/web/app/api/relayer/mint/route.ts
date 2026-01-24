import { NextRequest, NextResponse } from 'next/server';
import { PKPManager } from '@/lib/pkp';
import { pkpMintLimiter } from '@/lib/rate-limiter';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

export async function POST(req: NextRequest) {
    // CORS check
    const corsBlock = checkCors(req);
    if (corsBlock) return corsBlock;

    try {
        const body = await req.json();
        const { nearAccountId } = body;

        if (!nearAccountId) {
            const errorRes = NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
            return addCorsHeaders(errorRes, req);
        }

        // Rate limiting - use nearAccountId as identifier
        const identifier = nearAccountId;
        if (!pkpMintLimiter.checkLimit(identifier)) {
            const resetTime = pkpMintLimiter.getResetTime(identifier);
            console.log(`[RATE_LIMIT] PKP mint blocked for ${nearAccountId} - retry after ${Math.ceil(resetTime / 1000)}s`);
            const errorRes = NextResponse.json(
                {
                    error: 'Rate limit exceeded. Too many PKP mint requests.',
                    code: 'RATE_LIMITED',
                    retryAfter: Math.ceil(resetTime / 1000)
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': Math.ceil(resetTime / 1000).toString()
                    }
                }
            );
            return addCorsHeaders(errorRes, req);
        }

        // Audit logging
        console.log(`[AUDIT] PKP Mint Request: account=${nearAccountId} time=${new Date().toISOString()} remaining=${pkpMintLimiter.getRemainingRequests(identifier)}`);


        // 1. Initialize Relayer Wallet (The "Contract Account" / App Sponsor)
        // PKP minting requires Ethereum-format key (0x...), not NEAR key
        const relayerKey = process.env.LIT_DELEGATION_WALLET_PRIVATE_KEY;
        if (!relayerKey) {
            console.error("LIT_DELEGATION_WALLET_PRIVATE_KEY is not set in environment variables.");
            return NextResponse.json({
                error: 'Lit Relayer not configured. Please set LIT_DELEGATION_WALLET_PRIVATE_KEY in .env.local (Ethereum format: 0x...).',
                code: 'MISSING_RELAYER_KEY'
            }, { status: 501 }); // Not Implemented / Not Configured
        }

        const ethers5 = await import('ethers5');

        // --- GLOBAL FETCH INTERCEPTOR (Next.js/Turbopack "client" referrer fix) ---
        // This is a surgical fix for the "Referrer 'client' is not a valid URL" error.
        // It intercepts all global fetch calls and strips the invalid "client" referrer.
        const originalFetch = global.fetch;
        global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
            if (options && 'referrer' in options && options.referrer === 'client') {
                // console.log("Intercepted 'client' referrer, removing...");
                delete (options as RequestInit & { referrer?: string }).referrer;
            }
            return originalFetch(url, options);
        };
        // --------------------------------------------------------------------------

        const rpcUrl = process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com';
        console.log("Using RPC URL:", rpcUrl);

        // ConnectionInfo type - ethers5 is dynamically imported so we define the shape inline
        const connectionInfo: { url: string; referrer?: string } = { url: rpcUrl, referrer: 'about:blank' };
        const provider = new ethers5.providers.StaticJsonRpcProvider(
            connectionInfo,
            {
                name: 'chronicle-yellowstone',
                chainId: 175188
            }
        );
        let wallet;
        try {
            wallet = new ethers5.Wallet(relayerKey, provider);
        } catch (e) {
            console.error("Invalid LIT_DELEGATION_WALLET_PRIVATE_KEY format:", e);
            return NextResponse.json({
                error: 'Invalid Lit Relayer Key format. LIT_DELEGATION_WALLET_PRIVATE_KEY must be a 64-character hex string (Ethereum-style, e.g. 0xabc...).',
                code: 'INVALID_RELAYER_KEY'
            }, { status: 400 });
        }

        console.log(`Relayer [${wallet.address}] sponsoring PKP mint for ${nearAccountId}`);

        // 2. Use PKPManager to mint
        // PKPManager constructor requires LitNodeClient, but mintPKPDirect doesn't use it
        // Using null assertion as the client isn't needed for direct minting path
        const pkpManager = new PKPManager(null!);

        // 3. Check Sponsor Balance
        const balance = await provider.getBalance(wallet.address);
        console.log(`Relayer [${wallet.address}] balance: ${ethers5.utils.formatEther(balance)} tokens`);

        if (balance.lt(ethers5.utils.parseEther('0.001'))) {
            throw new Error(`Sponsor wallet [${wallet.address}] has insufficient funds (${ethers5.utils.formatEther(balance)} tokens). Please fund it on Chronicle Yellowstone.`);
        }

        // 4. Execute Minting
        // This will pay gas from 'wallet' (Relayer)
        // It will permit the Lit Action specified in NEXT_PUBLIC_LIT_ACTION_IPFS_CID
        const mintedPkp = await pkpManager.mintPKPDirect(wallet);

        console.log(`Successfully minted PKP for ${nearAccountId}:`, mintedPkp.ethAddress);

        const successRes = NextResponse.json({
            success: true,
            pkp: mintedPkp
        });
        return addCorsHeaders(successRes, req);

    } catch (error: unknown) {
        console.error('Relayer Error [Full]:', error);

        let errorMessage = 'Failed to sponsor PKP minting';
        let errorCode = 'MINTING_FAILED';
        const errorString = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        if (errorString.includes('insufficient funds')) {
            errorMessage = errorString;
            errorCode = 'INSUFFICIENT_SPONSOR_FUNDS';
        } else if (errorString.includes('user rejected')) {
            errorMessage = 'Transaction was rejected by the network provider.';
        } else if (errorString.includes('pkpHelperContract')) {
            errorMessage = 'Communication failure with Lit PKP Contracts on Chronicle Yellowstone.';
        }

        const errorRes = NextResponse.json({
            error: errorMessage,
            code: errorCode,
            details: errorString,
            stack: errorStack
        }, { status: 500 });
        return addCorsHeaders(errorRes, req);
    }
}

// Handle CORS preflight requests
export async function OPTIONS(req: NextRequest) {
    return handleCorsPreflightRequest(req);
}
