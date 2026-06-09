"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScreenState } from "@/components/ScreenState";
import { Loader2, CheckCircle2, AlertCircle, Ticket, ExternalLink, Wallet, Play, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { parseTitleMetadata } from "@/lib/metadata-parser";
import { NEAR_CONFIG, GAS_CONSTANTS } from "@/lib/constants";
import { getCurrentRpcUrl } from "@/lib/rpc-failover";
import { IPFSThumbnail } from "@/components/IPFSThumbnail";
import { CreatorAvatar } from "@/components/CreatorAvatar";
import { TrialUpgradeDialog } from "@/components/TrialUpgradeDialog";
import { useWallet } from "@/components/providers/WalletProvider";
import { claimGiftWithImplicitAccount } from "@/lib/gift-service";

const NETWORK_ID = NEAR_CONFIG.networkId;
const NFT_CONTRACT = NEAR_CONFIG.contractId;

interface GiftInfo {
    eventTitle?: string;
    creator?: string;
    eventCid?: string;
    media?: string;
    description?: string;
}

function ClaimContent() {
    const { t } = useLanguage();
    const { setManagedAccount } = useWallet();
    const searchParams = useSearchParams();
    // Read key from hash fragment (secure) or query params (backward compat)
    const [secretKey, setSecretKey] = useState<string | null>(null);

    useEffect(() => {
        // Priority 1: Hash fragment (new secure format)
        const hash = window.location.hash.substring(1); // remove #
        const hashParams = new URLSearchParams(hash);
        const hashKey = hashParams.get("key");

        // Priority 2: Query params (legacy links)
        const queryKey = searchParams.get("secret") || searchParams.get("key");

        const key = hashKey || queryKey;
        setSecretKey(key);

        // Clear sensitive data from URL
        if (key) {
            window.history.replaceState(null, "", window.location.pathname);
        }
    }, [searchParams]);

    const [step, setStep] = useState<"loading" | "preview" | "claim-options" | "claiming" | "success" | "error">("loading");
    const [giftInfo, setGiftInfo] = useState<GiftInfo | null>(null);
    const [existingAccountId, setExistingAccountId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [claimedAccountId, setClaimedAccountId] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [claimMode, setClaimMode] = useState<"guest" | "wallet" | null>(null);

    // Validate secret key and fetch gift info
    useEffect(() => {
        const validateGift = async () => {
            if (!secretKey) {
                setStep("error");
                setError(t.claim_page?.invalid_link || "Invalid link. Claim key not found.");
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
                    setError(t.claim_page?.invalid_or_used || "This link is invalid or has already been used.");
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
                    t.claim_page?.exclusive_content || "Gifted YouTick Release"
                );

                setGiftInfo({
                    eventTitle: parsed.title,
                    creator: giftData.creator_id,
                    eventCid: giftData.event_cid,
                    media: parsed.thumbnailUrl,
                    description: t.claim_page?.ticket_for_content || "Digital ticket for this release"
                });
                setStep("preview");
            } catch (err: unknown) {
                console.error("Gift validation error:", err);
                setError(t.claim_page?.gift_info_failed || "Failed to fetch gift info. Link may be invalid.");
                setStep("error");
            }
        };

        validateGift();
    }, [secretKey, t]);

    const handleClaimToExisting = async () => {
        if (!existingAccountId.trim()) return;

        setClaimMode("wallet");
        setStep("claiming");

        try {
            const { Account, KeyPair, KeyPairSigner, actions } = await import("near-api-js");

            const formattedKey = secretKey!.includes(":") ? secretKey! : `ed25519:${secretKey}`;
            const giftKeyPair = KeyPair.fromString(formattedKey as `ed25519:${string}`);

            // v7: Create Account with signer directly
            const rpcUrl = getCurrentRpcUrl();
            const signer = new KeyPairSigner(giftKeyPair);
            const contractAccount = new Account(NFT_CONTRACT, rpcUrl, signer);

            // v7: Use signAndSendTransaction with actions
            const result = await contractAccount.signAndSendTransaction({
                receiverId: NFT_CONTRACT,
                actions: [
                    actions.functionCall(
                        "claim_gift",
                        { receiver_id: existingAccountId.trim() },
                        GAS_CONSTANTS.mediumGas,
                        BigInt(0)
                    )
                ]
            });

            setClaimedAccountId(existingAccountId.trim());
            setTxHash(result.transaction.hash);
            setStep("success");
        } catch (err: unknown) {
            console.error("Claim to existing error:", err);
            const errMsg = err instanceof Error ? err.message : '';
            let errorMsg = t.claim_page?.transfer_failed || "Failed to transfer ticket.";
            if (errMsg.includes("already claimed")) {
                errorMsg = t.claim_page?.invalid_or_used || "This gift link has already been used.";
            } else if (errMsg.includes("Invalid")) {
                errorMsg = t.claim_page?.invalid_link || "Invalid gift link.";
            }
            setError(errorMsg);
            setStep("error");
        }
    };

    const handleClaimAsGuest = async () => {
        if (!secretKey) return;

        setClaimMode("guest");
        setStep("claiming");

        const formattedKey = secretKey.includes(":") ? secretKey : `ed25519:${secretKey}`;
        const result = await claimGiftWithImplicitAccount(formattedKey);

        if (result.success) {
            setClaimedAccountId(result.accountId || null);
            setTxHash(result.txHash || null);
            if (result.accountId) {
                setManagedAccount(result.accountId, "guest");
            }
            setStep("success");
            return;
        }

        const errMsg = result.error || "";
        let errorMsg = t.claim_page?.account_create_failed || "Failed to create account.";
        if (errMsg.includes("already claimed")) {
            errorMsg = t.claim_page?.invalid_or_used || "This gift link has already been used.";
        } else if (errMsg.includes("Invalid")) {
            errorMsg = t.claim_page?.invalid_link || "Invalid gift link.";
        }
        setError(errorMsg);
        setStep("error");
    };

    // Loading
    if (step === "loading") {
        return (
            <div className="w-full max-w-md mx-auto">
                <Card className="p-8 text-center bg-zinc-900/90 backdrop-blur-xl">
                    <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto" />
                    <p className="text-zinc-300 mt-4 text-sm">{t.claim_page?.loading_gift || "Loading gift info..."}</p>
                </Card>
            </div>
        );
    }

    // Preview - Modern Ticket UI
    if (step === "preview") {
        return (
            <div className="w-full max-w-md mx-auto">
                <Card className="overflow-hidden bg-zinc-900/90 backdrop-blur-xl">
                    {/* Ticket Image/Thumbnail */}
                    <div className="relative aspect-video w-full overflow-hidden">
                        <IPFSThumbnail
                            url={giftInfo?.media}
                            alt={giftInfo?.eventTitle}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />

                        {/* Gift Badge */}
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-near-green text-near-black text-xs font-bold shadow-lg">
                            <Sparkles className="w-3.5 h-3.5" />
                            {t.claim_page?.gift_ticket_badge || "Gift Ticket"}
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
                            <CreatorAvatar name={giftInfo?.creator} size="lg" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.claim_page?.sent_by || "Sent by"}</p>
                                <p className="text-sm text-white font-medium truncate">
                                    {giftInfo?.creator}
                                </p>
                            </div>
                        </div>

                        {/* Ticket Badge */}
                        <div className="flex items-center justify-center gap-2 text-xs text-near-green">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.claim_page?.secured_by_blockchain || "Secured by digital ticket"}</span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-zinc-400 text-center">
                            {t.claim_page?.gift_received_msg || "A digital ticket was shared with you. Continue to claim it."}
                        </p>

                        {/* CTA Button */}
                        <Button
                            onClick={() => setStep("claim-options")}
                            variant="near"
                            className="w-full h-12 rounded-xl"
                        >
                            <Ticket className="w-5 h-5 mr-2" />
                            {t.claim_page?.claim_gift_button || "Claim Ticket"}
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // Claim Options
    if (step === "claim-options") {
        return (
            <div className="w-full max-w-md mx-auto">
                <Card className="overflow-hidden bg-zinc-900/90 backdrop-blur-xl">
                    {/* Mini Preview Header */}
                    <div className="flex gap-3 p-4 bg-zinc-800/50 border-b border-zinc-700/50">
                        <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                            <IPFSThumbnail url={giftInfo?.media} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-white truncate">{giftInfo?.eventTitle}</h3>
                            <p className="text-xs text-zinc-500 truncate">
                                {t.claim_page?.sent_by || "Sent by"}: {giftInfo?.creator}
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        <h2 className="text-lg font-semibold text-white text-center">{t.claim_page?.choose_claim_method || "How would you like to claim?"}</h2>

                        <div className="space-y-3 rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-4">
                            <div>
                                <h3 className="text-sm font-semibold text-white">{t.claim_page?.new_account || "Guest Account"}</h3>
                                <p className="mt-1 text-sm text-zinc-400">
                                    {t.claim_page?.create_account_desc || "Create a guest account and claim the ticket"}
                                </p>
                            </div>
                            <Button
                                onClick={handleClaimAsGuest}
                                variant="near"
                                className="w-full h-12 rounded-xl"
                            >
                                <Sparkles className="w-4 h-4 mr-2" />
                                {t.claim_page?.create_and_claim_button || "Create Guest Account and Claim"}
                            </Button>
                        </div>

                        <div className="space-y-4 rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-4">
                            <h3 className="text-sm font-semibold text-white">{t.claim_page?.existing_wallet || "Existing Wallet"}</h3>
                            <p className="text-sm text-zinc-400">
                                {t.claim_page?.existing_wallet_desc || "Enter the wallet account that will receive the ticket"}
                            </p>
                            <Input
                                aria-label={t.claim_page?.existing_wallet || "Existing Wallet"}
                                value={existingAccountId}
                                onChange={(e) => setExistingAccountId(e.target.value)}
                                placeholder={t.claim_page?.existing_placeholder || "account.near"}
                                className="h-12 rounded-xl bg-zinc-800/50"
                            />
                            <Button
                                onClick={handleClaimToExisting}
                                disabled={!existingAccountId.trim()}
                                variant="near"
                                className="w-full h-12 rounded-xl"
                            >
                                <Wallet className="w-4 h-4 mr-2" />
                                {t.claim_page?.transfer_to_wallet || "Transfer to Wallet"}
                            </Button>
                        </div>

                        <Button
                            onClick={() => setStep("preview")}
                            variant="ghost"
                            className="w-full text-zinc-400 hover:text-white"
                        >
                            {t.claim_page?.back_button || "Back"}
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // Creating/Claiming
    if (step === "claiming") {
        return (
            <div className="w-full max-w-md mx-auto">
                <Card className="p-8 text-center space-y-4 bg-zinc-900/90 backdrop-blur-xl">
                    <Loader2 className="w-10 h-10 animate-spin text-near-green mx-auto" />
                    <p className="text-white text-lg font-medium">
                        {claimMode === "guest"
                            ? (t.claim_page?.creating_account_loading || "Creating guest account...")
                            : (t.claim_page?.claiming_ticket_loading || "Claiming ticket...")}
                    </p>
                    <p className="text-zinc-500 text-sm">{t.claim_page?.please_wait || "This may take a few seconds"}</p>
                    <p className="text-xs text-near-green flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t.claim_page?.processing_on_blockchain || "Processing ticket transfer"}
                    </p>
                </Card>
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
                <Card className="overflow-hidden bg-zinc-900/90 backdrop-blur-xl">
                    {/* Success Header */}
                    <div className="relative aspect-video w-full overflow-hidden">
                        <IPFSThumbnail
                            url={giftInfo?.media}
                            alt={giftInfo?.eventTitle}
                            className="w-full h-full object-cover opacity-50"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-zinc-900/40" />

                        {/* Success Icon */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-near-green/10 backdrop-blur-xl border border-near-green/30 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-10 h-10 text-near-green" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">{t.claim_page?.success_title || "Ticket Received"}</h2>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.claim_page?.account_label || "Account"}</p>
                            <p className="text-zinc-300 font-mono text-sm break-all">{claimedAccountId}</p>
                        </div>

                        {txHash && (
                            <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
                            >
                                {t.claim_page?.view_transaction || "View transaction"} <ExternalLink className="w-3 h-3" />
                            </a>
                        )}

                        <div className="space-y-3 pt-2">
                            {claimMode === "guest" && claimedAccountId ? (
                                <>
                                    <p className="rounded-xl border border-near-green/20 bg-near-green/10 p-3 text-center text-sm text-near-green">
                                        {t.claim_page?.trial_active_msg || "Guest account active. Automatically signed in."}
                                    </p>
                                    <Button
                                        onClick={() => window.location.href = `/watch?cid=${giftInfo?.eventCid}`}
                                        variant="near"
                                        className="w-full h-12 rounded-xl"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        {t.claim_page?.watch_now || "Watch Now"}
                                    </Button>
                                    <TrialUpgradeDialog accountId={claimedAccountId} />
                                </>
                            ) : (
                                <Button
                                    onClick={() => window.location.href = `/watch?cid=${giftInfo?.eventCid}`}
                                    variant="near"
                                    className="w-full h-12 rounded-xl"
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    {t.claim_page?.watch_now || "Watch Now"}
                                </Button>
                            )}

                            <Button
                                onClick={() => window.location.href = claimMode === "guest" ? "/trial" : "/discover"}
                                variant="outline"
                                className="w-full h-12 rounded-xl"
                            >
                                {claimMode === "guest"
                                    ? (t.claim_page?.go_to_guest_account || "Go to Guest Account")
                                    : (t.claim_page?.explore_more || "Explore More")}
                            </Button>

                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // Error
    if (step === "error") {
        return (
            <div className="w-full max-w-md mx-auto">
                <ScreenState
                    tone="danger"
                    className="bg-zinc-900/90 backdrop-blur-xl"
                    icon={<AlertCircle className="h-8 w-8" />}
                    title={t.claim_page?.error_title || "An Error Occurred"}
                    description={error || undefined}
                    actions={giftInfo ? (
                        <Button
                            onClick={() => {
                                setError(null);
                                setStep("preview");
                            }}
                            variant="outline"
                            className="rounded-xl"
                        >
                            {t.claim_page?.try_again || "Try Again"}
                        </Button>
                    ) : (
                        <>
                            <Button
                                onClick={() => { window.location.href = "/trial"; }}
                                variant="near"
                                className="rounded-xl"
                            >
                                {t.landing.nav_extra?.try_free || "Guest access"}
                            </Button>
                            <Button
                                onClick={() => { window.location.href = "/discover"; }}
                                variant="outline"
                                className="rounded-xl"
                            >
                                {t.watch_page.browse_new}
                            </Button>
                        </>
                    )}
                />
            </div>
        );
    }

    return null;
}

export default function ClaimPage() {
    return (
        <main className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="w-full max-w-md mx-auto">
                    <Card className="p-8 text-center bg-zinc-900/90 backdrop-blur-xl">
                        <Loader2 className="w-10 h-10 animate-spin text-near-green mx-auto" />
                    </Card>
                </div>
            }>
                <ClaimContent />
            </Suspense>
        </main>
    );
}
