"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, AlertCircle, Ticket, ExternalLink, Wallet, User, Play, Sparkles } from "lucide-react";

const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "dev-gift-1767641243.testnet";

interface GiftInfo {
    eventTitle?: string;
    creator?: string;
    eventCid?: string;
    media?: string;
    description?: string;
}

function ClaimContent() {
    const searchParams = useSearchParams();
    const secretKey = searchParams.get("secret") || searchParams.get("key");
    const eventCidParam = searchParams.get("eventCid");

    const [step, setStep] = useState<"loading" | "preview" | "claim-options" | "creating-account" | "claiming" | "success" | "error">("loading");
    const [giftInfo, setGiftInfo] = useState<GiftInfo | null>(null);
    const [accountOption, setAccountOption] = useState<"new" | "existing">("new");
    const [newUsername, setNewUsername] = useState("");
    const [existingAccountId, setExistingAccountId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [claimedAccountId, setClaimedAccountId] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    // Account existence check
    const [accountCheckStatus, setAccountCheckStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

    // Auto-check account availability when username changes
    useEffect(() => {
        if (!newUsername || !isValidUsername(newUsername)) {
            setAccountCheckStatus("idle");
            return;
        }

        const checkAccount = async () => {
            setAccountCheckStatus("checking");
            const fullAccountId = `${newUsername}.${NFT_CONTRACT}`;

            try {
                const { connect, keyStores } = await import("near-api-js");
                const near = await connect({
                    networkId: NETWORK_ID,
                    nodeUrl: NETWORK_ID === "mainnet"
                        ? "https://rpc.mainnet.near.org"
                        : "https://test.rpc.fastnear.com",
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                try {
                    const account = await near.account(fullAccountId);
                    await account.state();
                    setAccountCheckStatus("taken");
                } catch (err: any) {
                    setAccountCheckStatus("available");
                }
            } catch (err) {
                console.error("Account check error:", err);
                setAccountCheckStatus("idle");
            }
        };

        const timer = setTimeout(checkAccount, 500);
        return () => clearTimeout(timer);
    }, [newUsername]);

    // Validate secret key and fetch gift info
    useEffect(() => {
        const validateGift = async () => {
            if (!secretKey) {
                setStep("error");
                setError("Geçersiz link. Claim key bulunamadı.");
                return;
            }

            try {
                const { connect, keyStores, KeyPair } = await import("near-api-js");

                const formattedKey = secretKey.includes(":") ? secretKey : `ed25519:${secretKey}`;
                const keyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);
                const publicKey = keyPair.getPublicKey().toString();

                const keyStore = new keyStores.InMemoryKeyStore();
                const near = await connect({
                    networkId: NETWORK_ID,
                    nodeUrl: NETWORK_ID === "mainnet"
                        ? "https://rpc.mainnet.near.org"
                        : "https://test.rpc.fastnear.com",
                    keyStore,
                });

                const account = await near.account(NFT_CONTRACT);
                const giftData: any = await account.viewFunction({
                    contractId: NFT_CONTRACT,
                    methodName: "get_gift_info_full",
                    args: { public_key: publicKey }
                });

                if (!giftData) {
                    setError("Bu link geçersiz veya daha önce kullanılmış.");
                    setStep("error");
                    return;
                }

                // Fetch event details
                const eventData: any = await account.viewFunction({
                    contractId: NFT_CONTRACT,
                    methodName: "get_event",
                    args: { encrypted_cid: giftData.event_cid }
                });

                // Parse title and media from event
                let title = eventData?.title || "YouTick Exclusive Content";
                let media = "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png";

                if (title && title.includes(':::')) {
                    const parts = title.split(':::');
                    if (parts.length >= 3) {
                        const thumbnailCid = parts[1];
                        title = parts.slice(2).join(':::');
                        media = `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`;
                    } else if (parts.length === 2) {
                        title = parts[1];
                    }
                }

                setGiftInfo({
                    eventTitle: title,
                    creator: giftData.creator_id,
                    eventCid: giftData.event_cid,
                    media: media,
                    description: "Özel içeriğe erişim bileti"
                });
                setStep("preview");
            } catch (err: any) {
                console.error("Gift validation error:", err);
                if (eventCidParam) {
                    setGiftInfo({
                        eventTitle: "YouTick Exclusive Content",
                        creator: "Creator",
                        eventCid: decodeURIComponent(eventCidParam),
                        media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png"
                    });
                    setStep("preview");
                } else {
                    setError("Hediye bilgisi alınamadı. Link geçersiz olabilir.");
                    setStep("error");
                }
            }
        };

        validateGift();
    }, [secretKey, eventCidParam]);

    const handleClaimWithNewAccount = async () => {
        if (!isValidUsername(newUsername)) return;

        setStep("creating-account");

        try {
            const { connect, keyStores, KeyPair, utils } = await import("near-api-js");

            const formattedKey = secretKey!.includes(":") ? secretKey! : `ed25519:${secretKey}`;
            const giftKeyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);

            const keyStore = new keyStores.InMemoryKeyStore();
            await keyStore.setKey(NETWORK_ID, NFT_CONTRACT, giftKeyPair);

            const near = await connect({
                networkId: NETWORK_ID,
                nodeUrl: NETWORK_ID === "mainnet"
                    ? "https://rpc.mainnet.near.org"
                    : "https://test.rpc.fastnear.com",
                keyStore,
            });

            const contractAccount = await near.account(NFT_CONTRACT);

            const newAccountKeyPair = KeyPair.fromRandom("ed25519");
            const newAccountPublicKey = newAccountKeyPair.getPublicKey().toString();

            const fullAccountId = `${newUsername.toLowerCase()}.${NFT_CONTRACT}`;

            const result = await contractAccount.functionCall({
                contractId: NFT_CONTRACT,
                methodName: "claim_gift_and_create_account",
                args: {
                    new_account_id: fullAccountId,
                    new_public_key: newAccountPublicKey,
                },
                gas: BigInt("200000000000000"),
            });

            // Store keys
            const browserKeyStore = new keyStores.BrowserLocalStorageKeyStore();
            await browserKeyStore.setKey(NETWORK_ID, fullAccountId, newAccountKeyPair);

            localStorage.setItem("trialAccountId", fullAccountId);
            localStorage.setItem("trialAccountNetwork", NETWORK_ID);

            setClaimedAccountId(fullAccountId);
            setTxHash(result.transaction.hash);
            setStep("success");
        } catch (err: any) {
            console.error("Create account error:", err);
            let errorMsg = "Hesap oluşturulamadı.";
            if (err.message?.includes("already claimed")) {
                errorMsg = "Bu hediye linki daha önce kullanılmış.";
            } else if (err.message?.includes("account already exists")) {
                errorMsg = "Bu hesap adı zaten kullanılıyor.";
            }
            setError(errorMsg);
            setStep("error");
        }
    };

    const handleClaimToExisting = async () => {
        if (!existingAccountId.trim()) return;

        setStep("claiming");

        try {
            const { connect, keyStores, KeyPair } = await import("near-api-js");

            const formattedKey = secretKey!.includes(":") ? secretKey! : `ed25519:${secretKey}`;
            const giftKeyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);

            const keyStore = new keyStores.InMemoryKeyStore();
            await keyStore.setKey(NETWORK_ID, NFT_CONTRACT, giftKeyPair);

            const near = await connect({
                networkId: NETWORK_ID,
                nodeUrl: NETWORK_ID === "mainnet"
                    ? "https://rpc.mainnet.near.org"
                    : "https://test.rpc.fastnear.com",
                keyStore,
            });

            const contractAccount = await near.account(NFT_CONTRACT);

            const result = await contractAccount.functionCall({
                contractId: NFT_CONTRACT,
                methodName: "claim_gift",
                args: {
                    receiver_id: existingAccountId.trim(),
                },
                gas: BigInt("100000000000000"),
                attachedDeposit: BigInt("10000000000000000000000"),
            });

            setClaimedAccountId(existingAccountId.trim());
            setTxHash(result.transaction.hash);
            setStep("success");
        } catch (err: any) {
            console.error("Claim to existing error:", err);
            let errorMsg = "Bilet aktarılamadı.";
            if (err.message?.includes("already claimed")) {
                errorMsg = "Bu hediye linki daha önce kullanılmış.";
            } else if (err.message?.includes("Invalid")) {
                errorMsg = "Geçersiz hediye linki.";
            }
            setError(errorMsg);
            setStep("error");
        }
    };

    const isValidUsername = (name: string) => {
        const sanitized = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        return sanitized.length >= 2 && sanitized.length <= 32;
    };

    // Loading
    if (step === "loading") {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto" />
                    <p className="text-zinc-300 mt-4 text-sm">Hediye bilgisi yükleniyor...</p>
                </div>
            </div>
        );
    }

    // Preview - Modern Ticket UI
    if (step === "preview") {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Ticket Image/Thumbnail */}
                    <div className="relative aspect-video w-full overflow-hidden">
                        <img
                            src={giftInfo?.media}
                            alt={giftInfo?.eventTitle}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />

                        {/* Gift Badge */}
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-near-green text-near-black text-xs font-bold shadow-lg">
                            <Sparkles className="w-3.5 h-3.5" />
                            Hediye Bilet
                        </div>

                        {/* Play indicator */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center">
                                <Play className="w-7 h-7 text-white ml-1" />
                            </div>
                        </div>
                    </div>

                    {/* Ticket Info */}
                    <div className="p-6 space-y-4">
                        {/* Title */}
                        <h1 className="text-xl font-bold text-white leading-tight">
                            {giftInfo?.eventTitle}
                        </h1>

                        {/* Sender Info */}
                        <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                            <div className="w-10 h-10 rounded-xl bg-zinc-700 p-0.5">
                                <div className="w-full h-full rounded-[10px] bg-zinc-900 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">
                                        {giftInfo?.creator?.substring(0, 2).toUpperCase() || "??"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider">Gönderen</p>
                                <p className="text-sm text-white font-medium truncate">
                                    {giftInfo?.creator}
                                </p>
                            </div>
                        </div>

                        {/* Blockchain Badge */}
                        <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Blockchain ile güvence altında</span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-zinc-400 text-center">
                            Bu bilet size hediye edildi! Almak için devam edin.
                        </p>

                        {/* CTA Button */}
                        <Button
                            onClick={() => setStep("claim-options")}
                            className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                        >
                            <Ticket className="w-5 h-5 mr-2" />
                            Hediyeyi Al
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Claim Options
    if (step === "claim-options") {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Mini Preview Header */}
                    <div className="flex gap-3 p-4 bg-zinc-800/50 border-b border-zinc-700/50">
                        <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                            <img src={giftInfo?.media} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-white truncate">{giftInfo?.eventTitle}</h3>
                            <p className="text-xs text-zinc-500 truncate">
                                {giftInfo?.creator} tarafından
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        <h2 className="text-lg font-semibold text-white text-center">Nasıl almak istersin?</h2>

                        {/* Option Tabs */}
                        <div className="flex gap-2 p-1 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                            <button
                                onClick={() => setAccountOption("new")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${accountOption === "new"
                                    ? "bg-near-green text-near-black shadow-lg"
                                    : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                Yeni Hesap
                            </button>
                            <button
                                onClick={() => setAccountOption("existing")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${accountOption === "existing"
                                    ? "bg-near-green text-near-black shadow-lg"
                                    : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                Mevcut Cüzdan
                            </button>
                        </div>

                        {/* New Account Form */}
                        {accountOption === "new" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    Hemen bir hesap oluştur ve biletini al
                                </p>
                                <div className="relative">
                                    <Input
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        placeholder="kullaniciadi"
                                        className={`pr-24 bg-zinc-800/50 border-zinc-700 text-white rounded-xl h-12 ${accountCheckStatus === "taken" ? "border-red-500 focus:ring-red-500" :
                                            accountCheckStatus === "available" ? "border-emerald-500 focus:ring-emerald-500" : ""
                                            }`}
                                        maxLength={32}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                                        .testnet
                                    </span>
                                </div>
                                {newUsername && !isValidUsername(newUsername) && (
                                    <p className="text-red-400 text-xs">
                                        En az 2 karakter, sadece harf, rakam, _ ve - kullanabilirsin
                                    </p>
                                )}
                                {accountCheckStatus === "checking" && (
                                    <p className="text-yellow-400 text-xs flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Kontrol ediliyor...
                                    </p>
                                )}
                                {accountCheckStatus === "available" && (
                                    <p className="text-emerald-400 text-xs flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3" /> Bu isim kullanılabilir!
                                    </p>
                                )}
                                {accountCheckStatus === "taken" && (
                                    <p className="text-red-400 text-xs flex items-center gap-2">
                                        <AlertCircle className="w-3 h-3" /> Bu hesap zaten mevcut
                                    </p>
                                )}
                                <Button
                                    onClick={handleClaimWithNewAccount}
                                    disabled={!isValidUsername(newUsername) || accountCheckStatus !== "available"}
                                    className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 disabled:opacity-50 font-semibold rounded-xl"
                                >
                                    <User className="w-4 h-4 mr-2" />
                                    {accountCheckStatus === "checking" ? "Kontrol ediliyor..." : "Hesap Oluştur ve Al"}
                                </Button>
                            </div>
                        )}

                        {/* Existing Wallet Form */}
                        {accountOption === "existing" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    NEAR hesap adresini gir
                                </p>
                                <Input
                                    value={existingAccountId}
                                    onChange={(e) => setExistingAccountId(e.target.value)}
                                    placeholder="hesap.testnet veya hesap.near"
                                    className="bg-zinc-800/50 border-zinc-700 text-white rounded-xl h-12"
                                />
                                <Button
                                    onClick={handleClaimToExisting}
                                    disabled={!existingAccountId.trim()}
                                    className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 disabled:opacity-50 font-semibold rounded-xl"
                                >
                                    <Wallet className="w-4 h-4 mr-2" />
                                    Cüzdana Aktar
                                </Button>
                            </div>
                        )}

                        <Button
                            onClick={() => setStep("preview")}
                            variant="ghost"
                            className="w-full text-zinc-400 hover:text-white"
                        >
                            Geri
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Creating/Claiming
    if (step === "creating-account" || step === "claiming") {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto" />
                    <p className="text-white text-lg font-medium">
                        {step === "creating-account" ? "Hesap oluşturuluyor..." : "Bilet aktarılıyor..."}
                    </p>
                    <p className="text-zinc-500 text-sm">Bu birkaç saniye sürebilir</p>
                    <p className="text-xs text-emerald-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Blockchain üzerinde işleniyor
                    </p>
                </div>
            </div>
        );
    }

    // Success
    if (step === "success") {
        const explorerUrl = NETWORK_ID === "mainnet"
            ? `https://nearblocks.io/txns/${txHash}`
            : `https://testnet.nearblocks.io/txns/${txHash}`;

        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Success Header */}
                    <div className="relative aspect-video w-full overflow-hidden">
                        <img
                            src={giftInfo?.media}
                            alt={giftInfo?.eventTitle}
                            className="w-full h-full object-cover opacity-50"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-zinc-900/40" />

                        {/* Success Icon */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/30 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">Bilet Alındı! 🎉</h2>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Hesap</p>
                            <p className="text-zinc-300 font-mono text-sm break-all">{claimedAccountId}</p>
                        </div>

                        {txHash && (
                            <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
                            >
                                İşlemi görüntüle <ExternalLink className="w-3 h-3" />
                            </a>
                        )}

                        <div className="space-y-3 pt-2">
                            <Button
                                onClick={() => window.location.href = "/watch"}
                                className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                            >
                                <Play className="w-4 h-4 mr-2" />
                                Hemen İzle
                            </Button>

                            <Button
                                onClick={() => window.location.href = "/discover"}
                                variant="outline"
                                className="w-full h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl"
                            >
                                Daha Fazla Keşfet
                            </Button>

                            <p className="text-xs text-zinc-500 text-center">
                                ✅ Trial hesabınız aktif! Otomatik giriş yaptınız.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Error
    if (step === "error") {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h3 className="text-xl text-white font-semibold">Bir Hata Oluştu</h3>
                    <p className="text-zinc-400">{error}</p>
                    <Button
                        onClick={() => {
                            setError(null);
                            setStep("preview");
                        }}
                        variant="outline"
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl"
                    >
                        Tekrar Dene
                    </Button>
                </div>
            </div>
        );
    }

    return null;
}

export default function ClaimPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="w-full max-w-md mx-auto">
                    <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto" />
                    </div>
                </div>
            }>
                <ClaimContent />
            </Suspense>
        </main>
    );
}
