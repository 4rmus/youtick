'use client';

import { useWallet } from '@/components/providers/WalletProvider';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { useState, useEffect } from 'react';
import { connect, keyStores } from 'near-api-js';
import { User, Wallet, Ticket, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useLanguage } from '@/components/providers/LanguageContext';

export default function ProfilePage() {
    const { t } = useLanguage();
    const { accountId } = useWallet();
    const { tokens, loading: tokensLoading } = useOwnedTokens();
    const [walletBalance, setWalletBalance] = useState<string | null>(null);
    const [loadingBalances, setLoadingBalances] = useState(false);

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

                // Fetch wallet balance
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
            <div className="max-w-6xl mx-auto space-y-8">
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
                </div>

                {/* Account Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Account Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <User className="w-5 h-5 text-purple-500" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.account}</h3>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.profile_page.account_id}</p>
                            <p className="text-sm font-mono text-white break-all">{accountId}</p>
                        </div>
                    </div>

                    {/* Wallet Balance Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <Wallet className="w-5 h-5 text-green-500" />
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

                {/* Purchased Tickets Section */}
                <div className="space-y-6 pt-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-2xl text-white">{t.profile_page.my_tickets}</h2>
                        <span className="text-xs text-zinc-500 uppercase tracking-widest">{tokens.length} Total</span>
                    </div>

                    {tokensLoading && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                        </div>
                    )}

                    {!tokensLoading && tokens.length === 0 && (
                        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
                            <Ticket className="w-12 h-12 mx-auto text-zinc-700 mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">{t.profile_page.no_tickets}</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                {t.profile_page.no_tickets_desc}
                            </p>
                            <Link href="/discover">
                                <Button variant="outline">{t.profile_page.browse}</Button>
                            </Link>
                        </div>
                    )}

                    {!tokensLoading && tokens.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {tokens.map((token: TokenWithVideo) => {
                                const isVideo = !!token.video_metadata;
                                const videoCid = token.video_metadata?.encrypted_cid;
                                const isAccessPass = videoCid === 'ACCESS_PASS';

                                const title = token.metadata?.title || token.token_id;
                                const media = token.metadata?.media;

                                return (
                                    <Link
                                        key={token.token_id}
                                        href={isVideo && !isAccessPass && videoCid ? `/watch?cid=${videoCid}` : '/watch'}
                                        className="group"
                                    >
                                        <div className={`
                                            relative overflow-hidden rounded-2xl border transition-all duration-300
                                            ${isAccessPass
                                                ? 'bg-gradient-to-br from-green-950/20 to-zinc-900 border-green-800/30'
                                                : 'bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1'}
                                        `}>
                                            {/* Decorative Corner Glow */}
                                            <div className="absolute -top-16 -right-16 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-700" />

                                            {/* Thumbnail Area */}
                                            <div className="aspect-video relative overflow-hidden">
                                                {media && !media.includes('token.png') ? (
                                                    <img
                                                        src={media}
                                                        alt={title}
                                                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50">
                                                        <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center">
                                                            <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Gradient Overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />

                                                {/* Play Button on Hover */}
                                                {isVideo && !isAccessPass && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-300">
                                                            <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                                                                <svg className="w-4 h-4 text-white fill-current ml-0.5" viewBox="0 0 24 24">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {isAccessPass && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-green-900/30">
                                                        <Ticket className="w-10 h-10 text-green-500/70" />
                                                    </div>
                                                )}

                                                {/* Top Badge */}
                                                {isAccessPass && (
                                                    <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-green-500/90 backdrop-blur-sm border border-green-400/30 shadow-lg">
                                                        <span className="text-[9px] font-bold text-white tracking-wider uppercase">PASS</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content Area */}
                                            <div className="p-3 relative">
                                                <h4 className="font-medium text-sm line-clamp-1 mb-1 text-zinc-200 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200 transition-all duration-300">
                                                    {title}
                                                </h4>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                                                        <span className="text-[10px] text-zinc-500 font-medium">
                                                            {isAccessPass ? 'Global Pass' : 'NFT Ticket'}
                                                        </span>
                                                    </div>

                                                    {isVideo && !isAccessPass && (
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold text-white bg-gradient-to-r from-purple-600/80 to-blue-600/80 px-2 py-0.5 rounded">
                                                            {t.profile_page.watch_btn}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Bottom Shine Effect */}
                                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
