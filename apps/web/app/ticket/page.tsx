'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { connect, keyStores, utils } from 'near-api-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MintButton } from '@/components/MintButton';
import { Loader2, Play, Ticket, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TicketPage() {
    return (
        <div className="container mx-auto px-4 py-24 min-h-screen flex items-center justify-center">
            <Suspense fallback={<div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                <TicketContent />
            </Suspense>
        </div>
    );
}

function TicketContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const cid = searchParams.get('cid');
    const { selector, modal, accountId } = useWallet();

    const [loading, setLoading] = useState(true);
    const [event, setEvent] = useState<any>(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(false);

    useEffect(() => {
        if (!cid) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0-0.utick.testnet';
                const rpcUrl = typeof window !== 'undefined' ? window.location.origin + '/api/near-rpc' : 'https://test.rpc.fastnear.com';

                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: rpcUrl,
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(contractId);

                // 1. Fetch Event Details
                try {
                    const eventData = await account.viewFunction({
                        contractId,
                        methodName: 'get_event',
                        args: { encrypted_cid: cid }
                    });
                    setEvent(eventData);
                } catch (e) {
                    console.warn("Event not found (might be legacy video):", e);
                }

                // 2. Check Ownership (if wallet connected)
                if (accountId) {
                    setCheckingAccess(true);
                    try {
                        const ownedTokens: any[] = await account.viewFunction({
                            contractId,
                            methodName: 'get_tokens_with_video',
                            args: { account_id: accountId, limit: 100 }
                        });

                        if (accountId && ownedTokens.length > 0 && cid) {
                            const isOwner = ownedTokens.some(t => {
                                const metadata = t[1];
                                const match = metadata && metadata.encrypted_cid === cid;
                                return match;
                            });
                            setHasAccess(isOwner);
                        } else {
                            setHasAccess(false);
                        }
                    } catch (e) {
                        console.error("Ownership check failed:", e);
                    } finally {
                        setCheckingAccess(false);
                    }
                }

            } catch (err) {
                console.error("Error loading ticket page:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [cid, accountId]);

    if (!cid) {
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold">Invalid Ticket Link</h1>
                <Link href="/discover">
                    <Button variant="link">Return to Discover</Button>
                </Link>
            </div>
        );
    }

    return (
        <Card className="w-full max-w-lg shadow-2xl bg-zinc-950 border-zinc-800">
            <CardHeader className="text-center space-y-4">
                {(() => {
                    const parts = event?.title ? event.title.split(':::') : [];
                    const realTitle = parts.length >= 3 ? parts[2] : (event?.title || "Exclusive Event");
                    const thumbnailCid = parts.length >= 3 ? parts[1] : null;
                    const thumbnailUrl = thumbnailCid ? `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}` : null;

                    return (
                        <>
                            {thumbnailUrl ? (
                                <div className="mx-auto w-full aspect-video rounded-lg overflow-hidden border border-zinc-800 relative group">
                                    <img
                                        src={thumbnailUrl}
                                        alt={realTitle}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                        <div className="bg-white/10 backdrop-blur-md p-3 rounded-full border border-white/20">
                                            <Ticket className="w-8 h-8 text-white relative z-10" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
                                    <Ticket className="w-12 h-12 text-primary" />
                                </div>
                            )}
                            <CardTitle className="text-3xl font-bold text-white mt-4">
                                {realTitle}
                            </CardTitle>
                        </>
                    );
                })()}
                <CardDescription className="text-lg">
                    {hasAccess ? "You have a ticket!" : "Ticket Required"}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {loading ? (
                    <div className="flex flex-col items-center py-8 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p>Loading event details...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-2">
                            <div className="flex justify-between items-center text-sm text-muted-foreground">
                                <span>Event Price</span>
                                <span className="font-mono text-zinc-300">
                                    {event?.price
                                        ? `${utils.format.formatNearAmount(event.price)} NEAR`
                                        : "Free / Legacy"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-muted-foreground">
                                <span>Status</span>
                                <span className={event?.active ? "text-green-500" : "text-yellow-500"}>
                                    {event?.active ? "Active" : "Past Event"}
                                </span>
                            </div>
                        </div>

                        {/* Ownership Status */}
                        {accountId ? (
                            checkingAccess ? (
                                <p className="text-center text-sm animate-pulse text-muted-foreground">Checking your wallet...</p>
                            ) : hasAccess ? (
                                <div className="text-center p-2 bg-green-500/10 text-green-500 rounded border border-green-500/20">
                                    ✓ Ticket Verified
                                </div>
                            ) : (
                                <div className="text-center p-2 bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">
                                    Ticket Needed
                                </div>
                            )
                        ) : (
                            <Button
                                className="w-full bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20"
                                variant="outline"
                                onClick={() => modal?.show()}
                            >
                                Connect Wallet to Check Access
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
                {hasAccess ? (
                    <Button
                        className="w-full h-12 text-lg gap-2"
                        onClick={() => router.push(`/watch?cid=${cid}`)}
                    >
                        <Play className="h-5 w-5 fill-current" />
                        Watch Now
                    </Button>
                ) : (
                    <div className="w-full">
                        <MintButton cid={cid} />
                    </div>
                )}

                <Link href="/discover" className="w-full">
                    <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Discover
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
