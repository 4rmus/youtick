'use client';

import { useWallet } from '@/components/providers/WalletProvider';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { useState, useEffect } from 'react';
import { connect, keyStores } from 'near-api-js';
import { User, Wallet, Ticket, Loader2, ArrowLeft, Gift, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GiftLinkGenerator } from "@/components/GiftLinkGenerator";
import { TrialUpgradeDialog } from "@/components/TrialUpgradeDialog";

export default function ProfilePage() {
    const { t } = useLanguage();
    const { accountId, isTrial } = useWallet();
    const { tokens, loading: tokensLoading } = useOwnedTokens();
    const [walletBalance, setWalletBalance] = useState<string | null>(null);
    const [loadingBalances, setLoadingBalances] = useState(false);

    // Created Events State
    const [createdEvents, setCreatedEvents] = useState<any[]>([]);
    const [loadingCreated, setLoadingCreated] = useState(false);

    // Gift Modal State
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [selectedEventForGift, setSelectedEventForGift] = useState<any | null>(null);

    // Fetch wallet balance
    useEffect(() => {
        if (!accountId) return;

        const fetchBalances = async () => {
            setLoadingBalances(true);
            try {
                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
                        ? 'https://rpc.mainnet.near.org'
                        : 'https://test.rpc.fastnear.com',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(accountId);
                const balance = await account.getAccountBalance();
                const balanceInNear = (BigInt(balance.available) / BigInt(10 ** 24)).toString();
                const decimals = (Number(BigInt(balance.available) % BigInt(10 ** 24)) / 10 ** 24).toFixed(2).substring(2);
                setWalletBalance(`${balanceInNear}.${decimals}`);
            } catch (error) {
                console.error('Error fetching balances:', error);
            } finally {
                setLoadingBalances(false);
            }
        };

        fetchBalances();
    }, [accountId]);

    // Fetch created events
    useEffect(() => {
        if (!accountId) return;

        const fetchCreatedEvents = async () => {
            setLoadingCreated(true);
            try {
                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
                        ? 'https://rpc.mainnet.near.org'
                        : 'https://test.rpc.fastnear.com',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '';
                const account = await near.account(contractId);

                const events: [string, any][] = await account.viewFunction({
                    contractId,
                    methodName: 'get_events',
                    args: { limit: 100 }
                });

                const myEvents = events
                    .filter(([_, event]) => event.creator_id === accountId)
                    .map(([cid, event]) => ({
                        cid,
                        ...event,
                        media: event.title.includes(':::') && event.title.split(':::').length >= 2
                            ? `https://gateway.lighthouse.storage/ipfs/${event.title.split(':::')[1]}`
                            : "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png",
                        title: event.title.includes(':::') ? event.title.split(':::').pop() : event.title
                    }));

                setCreatedEvents(myEvents);
            } catch (error) {
                console.error('Error fetching created events:', error);
            } finally {
                setLoadingCreated(false);
            }
        };

        fetchCreatedEvents();
    }, [accountId]);

    if (!accountId) {
        return (
            <div className="container mx-auto px-4 py-24 min-h-screen">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <User className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
                        <h2 className="text-2xl font-bold mb-2">{t.profile_page.wallet_not_connected}</h2>
                        <p className="text-zinc-400 mb-6">{t.profile_page.connect_prompt}</p>
                        <Link href="/">
                            <Button variant="outline">{t.profile_page.go_home}</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/watch">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight">{t.profile_page.title}</h1>
                            <p className="text-muted-foreground mt-1">{t.profile_page.subtitle}</p>
                        </div>
                    </div>

                    {/* Gift Button */}
                    {createdEvents.length > 0 && (
                        <Button
                            onClick={() => setShowGiftModal(true)}
                            className="bg-white text-black hover:bg-zinc-200 font-semibold gap-2"
                        >
                            <Gift className="w-4 h-4" />
                            Hediye Et
                        </Button>
                    )}
                </div>

                {/* Account Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-zinc-800 rounded-lg">
                                <User className="w-5 h-5 text-zinc-400" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.account}</h3>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.profile_page.account_id}</p>
                            <p className="text-sm font-mono text-white break-all">{accountId}</p>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-zinc-800 rounded-lg">
                                <Wallet className="w-5 h-5 text-zinc-400" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.wallet_balance}</h3>
                        </div>
                        <div className="space-y-2">
                            {loadingBalances ? (
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        {walletBalance || '0.00'} <span className="text-sm font-normal text-zinc-400">NEAR</span>
                                    </p>
                                    <p className="text-xs text-zinc-500">{t.profile_page.available}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Trial Account Upgrade Banner */}
                {isTrial && accountId && (
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <span className="text-yellow-400">⚡</span>
                                    Trial Hesabınızı Yükseltin
                                </h3>
                                <p className="text-sm text-zinc-300 mt-1">
                                    Kalıcı bir NEAR hesabı oluşturun ve tüm özelliklere erişin.
                                </p>
                            </div>
                            <TrialUpgradeDialog
                                accountId={accountId}
                                onUpgradeComplete={() => window.location.reload()}
                            />
                        </div>
                    </div>
                )}

                {/* Dual Column Layout - Tickets & Events */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-0">
                    {/* Tickets Column */}
                    <div className="lg:pr-8 lg:border-r border-zinc-800">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    <Ticket className="w-5 h-5 text-zinc-400" />
                                </div>
                                <h2 className="font-bold text-xl text-white">Tickets</h2>
                            </div>
                            <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                                {tokens.length}
                            </span>
                        </div>

                        {tokensLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                            </div>
                        ) : tokens.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
                                <Ticket className="w-10 h-10 mx-auto text-zinc-700 mb-3" />
                                <h3 className="text-sm font-medium text-white mb-1">{t.profile_page.no_tickets}</h3>
                                <p className="text-xs text-zinc-500 mb-4">{t.profile_page.no_tickets_desc}</p>
                                <Link href="/discover">
                                    <Button variant="outline" size="sm">{t.profile_page.browse}</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {tokens.map((token: TokenWithVideo) => {
                                    const videoCid = token.video_metadata?.encrypted_cid;
                                    const isAccessPass = videoCid === 'ACCESS_PASS';
                                    const title = token.metadata?.title || token.token_id;
                                    const media = token.metadata?.media;

                                    return (
                                        <Link
                                            key={token.token_id}
                                            href={!isAccessPass && videoCid ? `/watch?cid=${videoCid}` : '/watch'}
                                            className="block group"
                                        >
                                            <div className="flex gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                                                <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                                                    {media && !media.includes('token.png') ? (
                                                        <img src={media} alt={title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Video className="w-5 h-5 text-zinc-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-medium text-white truncate">{title}</h4>
                                                    <p className="text-xs text-zinc-500 mt-0.5">
                                                        {isAccessPass ? 'Access Pass' : 'NFT Ticket'}
                                                    </p>
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                                    <span className="text-[10px] font-bold text-black bg-white px-2 py-1 rounded">
                                                        Watch
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Events Column */}
                    <div className="lg:pl-8">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    <Video className="w-5 h-5 text-zinc-400" />
                                </div>
                                <h2 className="font-bold text-xl text-white">Events</h2>
                            </div>
                            <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                                {createdEvents.length}
                            </span>
                        </div>

                        {loadingCreated ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                            </div>
                        ) : createdEvents.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
                                <Video className="w-10 h-10 mx-auto text-zinc-700 mb-3" />
                                <h3 className="text-sm font-medium text-white mb-1">No Events Created</h3>
                                <p className="text-xs text-zinc-500 mb-4">Upload your first video to get started</p>
                                <Link href="/upload">
                                    <Button variant="outline" size="sm">Upload Video</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {createdEvents.map((event) => (
                                    <div key={event.cid} className="group relative">
                                        <Link href={`/watch?cid=${event.cid}`} className="block">
                                            <div className="flex gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                                                <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                                                    <img src={event.media} alt={event.title} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-medium text-white truncate">{event.title}</h4>
                                                    <p className="text-xs text-zinc-500 mt-0.5">
                                                        {event.price === "0" ? "Free" : `${Number(BigInt(event.price) / BigInt(10 ** 24)).toFixed(2)} NEAR`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-bold text-black bg-white px-1.5 py-0.5 rounded uppercase">
                                                        Creator
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>
                                        {/* Quick Gift Button */}
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedEventForGift(event);
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-white hover:bg-zinc-200 text-black"
                                        >
                                            <Gift className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Gift Video Selection Modal */}
            <Dialog open={showGiftModal} onOpenChange={setShowGiftModal}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-zinc-400" />
                            Hediye Et
                        </DialogTitle>
                        <DialogDescription>
                            Hediye etmek istediğiniz videoyu seçin
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                        {createdEvents.map((event) => (
                            <button
                                key={event.cid}
                                onClick={() => {
                                    setSelectedEventForGift(event);
                                    setShowGiftModal(false);
                                }}
                                className="w-full flex gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 transition-all text-left"
                            >
                                <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                                    <img src={event.media} alt={event.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white truncate">{event.title}</h4>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {event.price === "0" ? "Free" : `${Number(BigInt(event.price) / BigInt(10 ** 24)).toFixed(2)} NEAR`}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Gift Link Generator Modal */}
            <Dialog open={!!selectedEventForGift} onOpenChange={(open) => !open && setSelectedEventForGift(null)}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[550px] max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-zinc-400" />
                            Hediye Linki Oluştur
                        </DialogTitle>
                        <DialogDescription>
                            "{selectedEventForGift?.title}" için paylaşılabilir hediye linkleri oluşturun
                        </DialogDescription>
                    </DialogHeader>

                    {/* Event Preview */}
                    {selectedEventForGift && (
                        <div className="mt-4 w-full flex gap-4 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                            <div className="w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                                <img src={selectedEventForGift.media} alt={selectedEventForGift.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white truncate">{selectedEventForGift.title}</h4>
                                <p className="text-xs text-zinc-400 mt-1">
                                    Creator: <span className="text-zinc-300">{accountId}</span>
                                </p>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    {selectedEventForGift.price === "0" ? "Free Event" : `${Number(BigInt(selectedEventForGift.price) / BigInt(10 ** 24)).toFixed(2)} NEAR`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Gift Link Generator */}
                    {selectedEventForGift && (
                        <div className="mt-4 w-full">
                            <GiftLinkGenerator
                                eventCid={selectedEventForGift.cid}
                                eventTitle={selectedEventForGift.title}
                                creatorAccountId={accountId || ''}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
