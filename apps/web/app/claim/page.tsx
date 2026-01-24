"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, AlertCircle, Ticket, ExternalLink, Wallet, User, Play, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { parseTitleMetadata } from "@/lib/metadata-parser";

const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "v1.utick.testnet";

interface GiftInfo {
    eventTitle?: string;
    creator?: string;
    eventCid?: string;
    media?: string;
    description?: string;
}

function ClaimContent() {
    const { t } = useLanguage();
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
                // v7: Use Account directly to check existence
                const { Account } = await import("near-api-js");
                const rpcUrl = NETWORK_ID === "mainnet"
                    ? "https://rpc.mainnet.near.org"
                    : "https://test.rpc.fastnear.com";

                try {
                    // v7: Use JsonRpcProvider to check account existence
                    const { JsonRpcProvider } = await import("near-api-js");
                    const provider = new JsonRpcProvider({ url: rpcUrl });
                    await provider.query({
                        request_type: 'view_account',
                        account_id: fullAccountId,
                        finality: 'final'
                    });
                    setAccountCheckStatus("taken");
                } catch (err: any) {
                    // Account doesn't exist = available
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
                setError(t.claim_page?.invalid_link || "Geçersiz link. Claim key bulunamadı.");
                return;
            }

            try {
                const { KeyPair } = await import("near-api-js");
                const { getProvider, viewContract } = await import("@/lib/near");

                const formattedKey = secretKey.includes(":") ? secretKey : `ed25519:${secretKey}`;
                const keyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);
                const publicKey = keyPair.getPublicKey().toString();

                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                const giftData = await viewContract<{ event_cid: string; creator_id: string } | null>(
                    provider,
                    NFT_CONTRACT,
                    "get_gift_info_full",
                    { public_key: publicKey }
                );

                if (!giftData) {
                    setError(t.claim_page?.invalid_or_used || "Bu link geçersiz veya daha önce kullanılmış.");
                    setStep("error");
                    return;
                }

                // Fetch event details
                const eventData = await viewContract<{ title?: string } | null>(
                    provider,
                    NFT_CONTRACT,
                    "get_event",
                    { encrypted_cid: giftData.event_cid }
                );

                // Parse title and media from event using centralized parser
                const parsed = parseTitleMetadata(
                    eventData?.title,
                    t.claim_page?.exclusive_content || "YouTick Exclusive Content"
                );

                console.log('[ClaimPage] Parsed metadata:', {
                    rawTitle: eventData?.title,
                    thumbnailCid: parsed.thumbnailCid,
                    thumbnailUrl: parsed.thumbnailUrl,
                    schemaVersion: parsed.schemaVersion
                });

                setGiftInfo({
                    eventTitle: parsed.title,
                    creator: giftData.creator_id,
                    eventCid: giftData.event_cid,
                    media: parsed.thumbnailUrl,
                    description: t.claim_page?.ticket_for_content || "Özel içeriğe erişim bileti"
                });
                setStep("preview");
            } catch (err: any) {
                console.error("Gift validation error:", err);
                if (eventCidParam) {
                    setGiftInfo({
                        eventTitle: t.claim_page?.exclusive_content || "YouTick Exclusive Content",
                        creator: "Creator",
                        eventCid: decodeURIComponent(eventCidParam),
                        media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png"
                    });
                    setStep("preview");
                } else {
                    setError(t.claim_page?.gift_info_failed || "Hediye bilgisi alınamadı. Link geçersiz olabilir.");
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
            const { Account, KeyPair, KeyPairSigner, actions } = await import("near-api-js");
            const { BrowserKeyStore } = await import("@/lib/keystore-v7");

            const formattedKey = secretKey!.includes(":") ? secretKey! : `ed25519:${secretKey}`;
            const giftKeyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);

            // v7: Create Account with signer directly
            const rpcUrl = NETWORK_ID === "mainnet"
                ? "https://rpc.mainnet.near.org"
                : "https://test.rpc.fastnear.com";
            const signer = new KeyPairSigner(giftKeyPair);
            const contractAccount = new Account(NFT_CONTRACT, rpcUrl, signer);

            const newAccountKeyPair = KeyPair.fromRandom("ed25519");
            const newAccountPublicKey = newAccountKeyPair.getPublicKey().toString();

            const fullAccountId = `${newUsername.toLowerCase()}.${NFT_CONTRACT}`;

            // v7: Use signAndSendTransaction with actions
            const result = await contractAccount.signAndSendTransaction({
                receiverId: NFT_CONTRACT,
                actions: [
                    actions.functionCall(
                        "claim_gift_and_create_account",
                        {
                            new_account_id: fullAccountId,
                            new_public_key: newAccountPublicKey,
                        },
                        BigInt("200000000000000"),
                        BigInt(0)
                    )
                ]
            });

            // Store keys using v7 BrowserKeyStore
            const browserKeyStore = new BrowserKeyStore();
            await browserKeyStore.setKey(NETWORK_ID, fullAccountId, newAccountKeyPair);

            localStorage.setItem("trialAccountId", fullAccountId);
            localStorage.setItem("trialAccountNetwork", NETWORK_ID);

            setClaimedAccountId(fullAccountId);
            setTxHash(result.transaction.hash);
            setStep("success");
        } catch (err: any) {
            console.error("Create account error:", err);
            let errorMsg = t.claim_page?.account_create_failed || "Hesap oluşturulamadı.";
            if (err.message?.includes("already claimed")) {
                errorMsg = t.claim_page?.invalid_or_used || "Bu hediye linki daha önce kullanılmış.";
            } else if (err.message?.includes("account already exists")) {
                errorMsg = t.claim_page?.username_taken || "Bu hesap adı zaten kullanılıyor.";
            }
            setError(errorMsg);
            setStep("error");
        }
    };

    const handleClaimToExisting = async () => {
        if (!existingAccountId.trim()) return;

        setStep("claiming");

        try {
            const { Account, KeyPair, KeyPairSigner, actions } = await import("near-api-js");

            const formattedKey = secretKey!.includes(":") ? secretKey! : `ed25519:${secretKey}`;
            const giftKeyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);

            // v7: Create Account with signer directly
            const rpcUrl = NETWORK_ID === "mainnet"
                ? "https://rpc.mainnet.near.org"
                : "https://test.rpc.fastnear.com";
            const signer = new KeyPairSigner(giftKeyPair);
            const contractAccount = new Account(NFT_CONTRACT, rpcUrl, signer);

            // v7: Use signAndSendTransaction with actions
            const result = await contractAccount.signAndSendTransaction({
                receiverId: NFT_CONTRACT,
                actions: [
                    actions.functionCall(
                        "claim_gift",
                        { receiver_id: existingAccountId.trim() },
                        BigInt("100000000000000"),
                        BigInt("10000000000000000000000")
                    )
                ]
            });

            setClaimedAccountId(existingAccountId.trim());
            setTxHash(result.transaction.hash);
            setStep("success");
        } catch (err: any) {
            console.error("Claim to existing error:", err);
            let errorMsg = t.claim_page?.transfer_failed || "Bilet aktarılamadı.";
            if (err.message?.includes("already claimed")) {
                errorMsg = t.claim_page?.invalid_or_used || "Bu hediye linki daha önce kullanılmış.";
            } else if (err.message?.includes("Invalid")) {
                errorMsg = t.claim_page?.invalid_link || "Geçersiz hediye linki.";
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
                    <p className="text-zinc-300 mt-4 text-sm">{t.claim_page?.loading_gift || "Hediye bilgisi yükleniyor..."}</p>
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
                            {t.claim_page?.gift_ticket_badge || "Hediye Bilet"}
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
                                <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.claim_page?.sent_by || "Gönderen"}</p>
                                <p className="text-sm text-white font-medium truncate">
                                    {giftInfo?.creator}
                                </p>
                            </div>
                        </div>

                        {/* Blockchain Badge */}
                        <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.claim_page?.secured_by_blockchain || "Blockchain ile güvence altında"}</span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-zinc-400 text-center">
                            {t.claim_page?.gift_received_msg || "Bu bilet size hediye edildi! Almak için devam edin."}
                        </p>

                        {/* CTA Button */}
                        <Button
                            onClick={() => setStep("claim-options")}
                            className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                        >
                            <Ticket className="w-5 h-5 mr-2" />
                            {t.claim_page?.claim_gift_button || "Hediyeyi Al"}
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
                                {t.claim_page?.sent_by || "Gönderen"}: {giftInfo?.creator}
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        <h2 className="text-lg font-semibold text-white text-center">{t.claim_page?.choose_claim_method || "Nasıl almak istersin?"}</h2>

                        {/* Option Tabs */}
                        <div className="flex gap-2 p-1 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                            <button
                                onClick={() => setAccountOption("new")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${accountOption === "new"
                                    ? "bg-near-green text-near-black shadow-lg"
                                    : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                {t.claim_page?.new_account || "Yeni Hesap"}
                            </button>
                            <button
                                onClick={() => setAccountOption("existing")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${accountOption === "existing"
                                    ? "bg-near-green text-near-black shadow-lg"
                                    : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                {t.claim_page?.existing_wallet || "Mevcut Cüzdan"}
                            </button>
                        </div>

                        {/* New Account Form */}
                        {accountOption === "new" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    {t.claim_page?.create_account_desc || "Hemen bir hesap oluştur ve biletini al"}
                                </p>
                                <div className="relative">
                                    <Input
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        placeholder={t.claim_page?.username_placeholder || "kullaniciadi"}
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
                                        {t.claim_page?.invalid_username_msg || "En az 2 karakter, sadece harf, rakam, _ ve - kullanabilirsin"}
                                    </p>
                                )}
                                {accountCheckStatus === "checking" && (
                                    <p className="text-yellow-400 text-xs flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" /> {t.claim_page?.checking_username || "Kontrol ediliyor..."}
                                    </p>
                                )}
                                {accountCheckStatus === "available" && (
                                    <p className="text-emerald-400 text-xs flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3" /> {t.claim_page?.username_available || "Bu isim kullanılabilir!"}
                                    </p>
                                )}
                                {accountCheckStatus === "taken" && (
                                    <p className="text-red-400 text-xs flex items-center gap-2">
                                        <AlertCircle className="w-3 h-3" /> {t.claim_page?.username_taken || "Bu hesap zaten mevcut"}
                                    </p>
                                )}
                                <Button
                                    onClick={handleClaimWithNewAccount}
                                    disabled={!isValidUsername(newUsername) || accountCheckStatus !== "available"}
                                    className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 disabled:opacity-50 font-semibold rounded-xl"
                                >
                                    <User className="w-4 h-4 mr-2" />
                                    {accountCheckStatus === "checking" ? (t.claim_page?.check_account_button || "Kontrol ediliyor...") : (t.claim_page?.create_and_claim_button || "Hesap Oluştur ve Al")}
                                </Button>
                            </div>
                        )}

                        {/* Existing Wallet Form */}
                        {accountOption === "existing" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    {t.claim_page?.existing_wallet_desc || "NEAR hesap adresini gir"}
                                </p>
                                <Input
                                    value={existingAccountId}
                                    onChange={(e) => setExistingAccountId(e.target.value)}
                                    placeholder={t.claim_page?.existing_placeholder || "hesap.testnet veya hesap.near"}
                                    className="bg-zinc-800/50 border-zinc-700 text-white rounded-xl h-12"
                                />
                                <Button
                                    onClick={handleClaimToExisting}
                                    disabled={!existingAccountId.trim()}
                                    className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 disabled:opacity-50 font-semibold rounded-xl"
                                >
                                    <Wallet className="w-4 h-4 mr-2" />
                                    {t.claim_page?.transfer_to_wallet || "Cüzdana Aktar"}
                                </Button>
                            </div>
                        )}

                        <Button
                            onClick={() => setStep("preview")}
                            variant="ghost"
                            className="w-full text-zinc-400 hover:text-white"
                        >
                            {t.claim_page?.back_button || "Geri"}
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
                        {step === "creating-account" ? (t.claim_page?.creating_account_loading || "Hesap oluşturuluyor...") : (t.claim_page?.claiming_ticket_loading || "Bilet aktarılıyor...")}
                    </p>
                    <p className="text-zinc-500 text-sm">{t.claim_page?.please_wait || "Bu birkaç saniye sürebilir"}</p>
                    <p className="text-xs text-emerald-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t.claim_page?.processing_on_blockchain || "Blockchain üzerinde işleniyor"}
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
                            <h2 className="text-2xl font-bold text-white">{t.claim_page?.success_title || "Bilet Alındı! 🎉"}</h2>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.claim_page?.account_label || "Hesap"}</p>
                            <p className="text-zinc-300 font-mono text-sm break-all">{claimedAccountId}</p>
                        </div>

                        {txHash && (
                            <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
                            >
                                {t.claim_page?.view_transaction || "İşlemi görüntüle"} <ExternalLink className="w-3 h-3" />
                            </a>
                        )}

                        <div className="space-y-3 pt-2">
                            <Button
                                onClick={() => window.location.href = `/watch?cid=${giftInfo?.eventCid}`}
                                className="w-full h-12 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                            >
                                <Play className="w-4 h-4 mr-2" />
                                {t.claim_page?.watch_now || "Watch Now"}
                            </Button>

                            <Button
                                onClick={() => window.location.href = "/discover"}
                                variant="outline"
                                className="w-full h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl"
                            >
                                {t.claim_page?.explore_more || "Daha Fazla Keşfet"}
                            </Button>

                            <p className="text-xs text-zinc-500 text-center">
                                ✅ {t.claim_page?.trial_active_msg || "Trial hesabınız aktif! Otomatik giriş yaptınız."}
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
                    <h3 className="text-xl text-white font-semibold">{t.claim_page?.error_title || "Bir Hata Oluştu"}</h3>
                    <p className="text-zinc-400">{error}</p>
                    <Button
                        onClick={() => {
                            setError(null);
                            setStep("preview");
                        }}
                        variant="outline"
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl"
                    >
                        {t.claim_page?.try_again || "Tekrar Dene"}
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
