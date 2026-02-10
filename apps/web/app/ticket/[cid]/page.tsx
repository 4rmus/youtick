'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { TicketPurchaseCard } from '@/components/TicketPurchaseCard';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Loader2, ArrowLeft, Play, Share2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NovaThumbnail } from '@/components/NovaThumbnail';

interface EventDetails {
    title: string;
    description: string;
    media: string;
    price: string;
    owner_id: string;
}

export default function TicketPage() {
    const params = useParams();
    const router = useRouter();
    const { cid } = params as { cid: string };
    const { accountId } = useWallet();
    const { t } = useLanguage();

    const [event, setEvent] = useState<EventDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [verifyingAccess, setVerifyingAccess] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);

    // 1. Fetch Event Details (direct RPC, no server proxy)
    useEffect(() => {
        const fetchEvent = async () => {
            if (!cid) return;
            try {
                const contractId = NEAR_CONFIG.contractId;
                const provider = getProvider();

                const eventData = await viewContract<{
                    title: string;
                    description: string;
                    media?: string;
                    price: string;
                    owner_id: string;
                }>(provider, contractId, 'get_event', { encrypted_cid: cid });

                if (eventData) {
                    const parsed = parseTitleMetadata(eventData.title, 'Untitled Event');
                    setEvent({
                        title: parsed.title,
                        description: eventData.description || 'No description available',
                        media: parsed.thumbnailUrl || eventData.media || '',
                        price: eventData.price || '0',
                        owner_id: eventData.owner_id
                    });
                } else {
                    console.error("Event not found");
                }
            } catch (err) {
                console.error("Failed to fetch event:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchEvent();
    }, [cid]);

    // 2. Check Ownership (Redirect if owned) - direct RPC
    useEffect(() => {
        const checkAccess = async () => {
            if (!accountId || !cid) return;
            setVerifyingAccess(true);
            try {
                const contractId = NEAR_CONFIG.contractId;
                const provider = getProvider();

                const tokens = await viewContract<
                    Array<[any, { encrypted_cid: string } | null]>
                >(provider, contractId, 'get_tokens_with_video', {
                    account_id: accountId,
                    limit: 50
                });

                if (tokens) {
                    const owns = tokens.some(([_, meta]) =>
                        meta && (meta.encrypted_cid === cid || meta.encrypted_cid === 'ACCESS_PASS')
                    );

                    if (owns) {
                        setHasAccess(true);
                    }
                }
            } catch (e) {
                console.error("Check access failed", e);
            } finally {
                setVerifyingAccess(false);
            }
        };

        checkAccess();
    }, [accountId, cid]);

    const handleSuccess = () => {
        setHasAccess(true);
        router.push(`/watch?cid=${cid}`);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <Loader2 className="animate-spin w-10 h-10 text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white relative isolate overflow-hidden flex flex-col">
            {/* Background Image Layer */}
            {event?.media && (
                <div className="absolute inset-0 z-[-1]">
                    <NovaThumbnail url={event.media} alt="" className="w-full h-full object-cover opacity-40 blur-3xl scale-125 transform" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
                </div>
            )}

            {/* Navbar Placeholder */}
            <div className="container mx-auto px-4 py-6 w-full max-w-7xl flex-shrink-0 z-20">
                <Button
                    variant="ghost"
                    className="hover:bg-white/10 text-white font-medium"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="mr-2 h-5 w-5" /> Back to Discover
                </Button>
            </div>

            {/* Main Content - Centered */}
            <div className="flex-grow flex flex-col items-center justify-center p-4 z-10 w-full">

                {/* Card Container */}
                <div className="w-full max-w-md animate-in fade-in scale-in-95 duration-500 delay-150">
                    {hasAccess ? (
                        <div className="bg-zinc-900/60 backdrop-blur-md border border-green-500/30 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto text-4xl mb-6 shadow-inner ring-1 ring-green-500/50">
                                🎉
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">You're In!</h2>
                            <p className="text-zinc-400 mb-8">You already own a ticket for this event.</p>
                            <Button
                                size="lg"
                                className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/50 rounded-xl transition-all hover:scale-105"
                                onClick={() => window.location.href = `/watch?cid=${cid}`}
                            >
                                <Play className="fill-current w-5 h-5 mr-2" /> Watch Now
                            </Button>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Glow container */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 rounded-[24px] blur-xl opacity-50 animate-pulse" />
                            <TicketPurchaseCard
                                cid={cid}
                                onPurchaseSuccess={handleSuccess}
                                className="relative bg-zinc-950/80 backdrop-blur-xl border border-white/10 !shadow-2xl"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Info */}
            <div className="py-6 text-center text-zinc-600 text-sm z-10 w-full">
                Powered by YouTick & NEAR Intents
            </div>
        </div>
    );
}
