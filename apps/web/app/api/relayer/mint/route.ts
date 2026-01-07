import { NextRequest, NextResponse } from 'next/server';
import { PKPManager } from '@/lib/pkp';
import { ethers } from 'ethers';
import { pkpMintLimiter } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { nearAccountId } = body;

        if (!nearAccountId) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Rate limiting - use nearAccountId as identifier
        const identifier = nearAccountId;
        if (!pkpMintLimiter.checkLimit(identifier)) {
            const resetTime = pkpMintLimiter.getResetTime(identifier);
            console.log(`[RATE_LIMIT] PKP mint blocked for ${nearAccountId} - retry after ${Math.ceil(resetTime / 1000)}s`);
            return NextResponse.json(
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
        // @ts-ignore
        global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
            if (options && (options as any).referrer === 'client') {
                // console.log("Intercepted 'client' referrer, removing...");
                delete (options as any).referrer;
            }
            return originalFetch(url, options);
        };
        // --------------------------------------------------------------------------

        const rpcUrl = process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com';
        console.log("Using RPC URL:", rpcUrl);

        const provider = new ethers5.providers.StaticJsonRpcProvider(
            {
                url: rpcUrl,
                referrer: 'about:blank'
            } as any,
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
        const pkpManager = new PKPManager({} as any);

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

        return NextResponse.json({
            success: true,
            pkp: mintedPkp
        });

    } catch (error: any) {
        console.error('Relayer Error [Full]:', error);

        let errorMessage = 'Failed to sponsor PKP minting';
        let errorCode = 'MINTING_FAILED';

        if (error.message && error.message.includes('insufficient funds')) {
            errorMessage = error.message;
            errorCode = 'INSUFFICIENT_SPONSOR_FUNDS';
        } else if (error.message && error.message.includes('user rejected')) {
            errorMessage = 'Transaction was rejected by the network provider.';
        } else if (error.toString().includes('pkpHelperContract')) {
            errorMessage = 'Communication failure with Lit PKP Contracts on Chronicle Yellowstone.';
        }

        return NextResponse.json({
            error: errorMessage,
            code: errorCode,
            details: error.toString(),
            stack: error.stack
        }, { status: 500 });
    }
}
