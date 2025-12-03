// app/api/video/access/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signAccessJwt } from '@livepeer/core/crypto';
import { verifyNftOwnership } from '@/lib/near';
import { verifyUserJwt, createUnauthorizedResponse, createForbiddenResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { validateVideoAccessRequest, ValidationError, checkRateLimit } from '@/lib/validation';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
    try {
        // SECURITY: Rate limiting (100 requests per minute per IP)
        const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

        if (!checkRateLimit(clientIp, 100, 60000)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // SECURITY: Verify user JWT (no more fallback authentication!)
        const authHeader = req.headers.get('Authorization');
        const userPayload = await verifyUserJwt(authHeader);

        if (!userPayload) {
            return NextResponse.json(
                createUnauthorizedResponse(),
                { status: 401 }
            );
        }

        // SECURITY: Validate and sanitize request body
        let requestData;
        try {
            const body = await req.json();
            requestData = validateVideoAccessRequest(body);
        } catch (error) {
            if (error instanceof ValidationError) {
                return NextResponse.json(
                    { error: error.message, code: 'INVALID_INPUT' },
                    { status: 400 }
                );
            }
            throw error;
        }

        const { tokenId, playbackId } = requestData;

        // SECURITY: VERIFY NFT OWNERSHIP ON-CHAIN (CRITICAL!)
        const ownershipResult = await verifyNftOwnership(
            userPayload.wallet,
            tokenId
        );

        // Check if verification failed due to network error
        if ('error' in ownershipResult && ownershipResult.error) {
            console.error('NFT ownership verification failed:', ownershipResult.error);
            return NextResponse.json(
                {
                    error: 'Unable to verify NFT ownership at this time. Please try again.',
                    code: 'VERIFICATION_FAILED'
                },
                { status: 503 }
            );
        }

        if (!ownershipResult.isOwner) {
            return NextResponse.json(
                createForbiddenResponse('NFT ownership required to access this content'),
                { status: 403 }
            );
        }

        // SECURITY: Generate Livepeer access JWT (short-lived - 15 minutes)
        const videoJwt = await signAccessJwt({
            privateKey: env.livepeerPrivateKey,
            publicKey: env.livepeerPublicKey,
            issuer: 'https://youtick.app',
            playbackId,
            expiration: 900, // 15 minutes (reduced from 1 hour for better security)
            custom: {
                nftTokenId: tokenId,
                wallet: userPayload.wallet,
                timestamp: Date.now(),
            },
        });

        // Update watch history (Supabase - UX data)
        try {
            // First, ensure NFT cache entry exists
            const { data: nftCache, error: cacheError } = await supabaseAdmin
                .from('nft_cache')
                .select('id')
                .eq('token_id', tokenId)
                .maybeSingle();

            let nftCacheId: string;

            if (cacheError || !nftCache) {
                // Insert new cache entry
                const { data: newCache, error: insertError } = await supabaseAdmin
                    .from('nft_cache')
                    .insert({
                        token_id: tokenId,
                        wallet_address: userPayload.wallet,
                        playback_id: playbackId,
                    })
                    .select('id')
                    .single();

                if (insertError || !newCache) {
                    console.error('Failed to create NFT cache entry:', insertError);
                    // Don't fail the request, just log it
                } else {
                    nftCacheId = newCache.id;
                }
            } else {
                nftCacheId = nftCache.id;
            }

            // Insert watch history if we have a cache ID
            if (nftCacheId!) {
                await supabaseAdmin
                    .from('watch_history')
                    .upsert(
                        {
                            profile_id: userPayload.sub,
                            nft_cache_id: nftCacheId,
                            last_watched_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'profile_id,nft_cache_id',
                        }
                    );
            }
        } catch (historyError) {
            // Log but don't fail the request
            console.error('Watch history update failed:', historyError);
        }

        // SECURITY: Log successful access for audit trail
        console.log(`[AUDIT] Video access granted: wallet=${userPayload.wallet}, tokenId=${tokenId}, playbackId=${playbackId}`);

        return NextResponse.json({ jwt: videoJwt });

    } catch (error) {
        console.error('[ERROR] Video access error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            },
            { status: 500 }
        );
    }
}
