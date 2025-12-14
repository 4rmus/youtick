'use client';

import { useWallet } from '@/components/providers/WalletProvider';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { useState, useEffect } from 'react';
import { connect, keyStores } from 'near-api-js';
import { User, Wallet, Ticket, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useLanguage } from '@/components/providers/LanguageContext';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';

export default function ProfilePage() {
    const { t } = useLanguage();
    const { accountId } = useWallet();
    const { tokens, loading: tokensLoading } = useOwnedTokens();
    const [walletBalance, setWalletBalance] = useState<string | null>(null);
    const [gasTankBalance, setGasTankBalance] = useState<string | null>(null);
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

                // Fetch GasTank balance
                const contractAccount = await near.account(NFT_CONTRACT_ID);
                const gasTankBalanceResult: any = await contractAccount.viewFunction({
                    contractId: NFT_CONTRACT_ID,
                    methodName: 'get_user_balance',
                    args: { account_id: accountId }
                });

                const gasTankInNear = (BigInt(gasTankBalanceResult) / BigInt(10 ** 24)).toString();
                const gasTankDecimals = (Number(BigInt(gasTankBalanceResult) % BigInt(10 ** 24)) / 10 ** 24).toFixed(2).substring(2);
                setGasTankBalance(`${gasTankInNear}.${gasTankDecimals}`);

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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                    {/* GasTank Balance Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Ticket className="w-5 h-5 text-blue-500" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.gastank}</h3>
                        </div>
                        <div className="space-y-2">
                            {loadingBalances ? (
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        {gasTankBalance || '0.00'} <span className="text-sm font-normal text-zinc-400">NEAR</span>
                                    </p>
                                    <p className="text-xs text-zinc-500">{t.profile_page.prepaid}</p>
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
                                const subtitle = isAccessPass ? "Global Pass" : (isVideo ? "Video NFT" : "Asset");
                                const media = token.metadata?.media;

                                return (
                                    <Link
                                        key={token.token_id}
                                        href={isVideo && !isAccessPass && videoCid ? `/watch?cid=${videoCid}` : '/watch'}
                                        className="group"
                                    >
                                        <div className={`
                                            relative overflow-hidden rounded-xl border transition-all duration-300
                                            ${isAccessPass ? 'bg-green-950/10 border-green-800/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/50 hover:-translate-y-1'}
                                        `}>
                                            {/* Thumbnail Area */}
                                            <div className="aspect-video bg-zinc-950 relative overflow-hidden">
                                                {media && !media.includes('token.png') && (
                                                    <img src={media} alt={title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                                )}
                                                {isAccessPass && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-green-900/20">
                                                        <Ticket className="w-12 h-12 text-green-500/50" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content Area */}
                                            <div className="p-4">
                                                <div className="flex justify-between items-start gap-2 mb-2">
                                                    <h4 className="font-medium text-sm line-clamp-1 text-zinc-200">
                                                        {title}
                                                    </h4>
                                                    {isAccessPass && <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">PASS</span>}
                                                </div>

                                                <div className="flex justify-between items-end">
                                                    <p className="text-xs text-zinc-500">{subtitle}</p>
                                                    {isVideo && !isAccessPass && (
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-white bg-white/10 px-2 py-1 rounded">
                                                            {t.profile_page.watch_btn}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
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
