"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Wallet, ArrowRight, CheckCircle2, AlertCircle, Gift } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { KeyPair } from "near-api-js";
import { claimGiftAndCreateAccount, validateGiftLink, getGiftEventInfo, createSponsoredTrial } from "@/lib/gift-service";

interface TrialOnboardingProps {
    onTrialCreated?: (accountId: string) => void;
    onConnectWallet?: () => void;
}

type OnboardingStep = "choice" | "username" | "creating" | "success" | "error" | "no-link";

export function TrialOnboarding({ onTrialCreated, onConnectWallet }: TrialOnboardingProps) {
    const { t } = useLanguage();
    const [step, setStep] = useState<OnboardingStep>("choice");
    const [username, setUsername] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
    const [giftInfo, setGiftInfo] = useState<{ secretKey: string; publicKey: string; eventTitle?: string } | null>(null);
    const [isValidating, setIsValidating] = useState(true);

    // Translations with fallbacks
    const tr = {
        welcome_title: t.trial_page?.welcome_title || "Welcome to YouTick!",
        welcome_desc: t.trial_page?.welcome_desc || "Discover content on the Web3 video platform",
        connect_wallet: t.trial_page?.connect_wallet || "Connect Wallet",
        or: t.trial_page?.or || "or",
        try_free: t.trial_page?.try_free || "Claim Gift Ticket",
        no_wallet_required: t.trial_page?.no_wallet_required || "No wallet required",
        free_content_access: t.trial_page?.free_content_access || "Access free content",
        upgrade_anytime: t.trial_page?.upgrade_anytime || "Upgrade to full wallet anytime",
        choose_username: t.trial_page?.choose_username || "Choose Username",
        username_desc: t.trial_page?.username_desc || "This will be your NEAR account address",
        username_placeholder: t.trial_page?.username_placeholder || "username",
        username_validation: t.trial_page?.username_validation || "At least 2 characters, only letters, numbers, _ and -",
        username_taken: t.trial_page?.username_taken || "This username is already taken. Please choose another.",
        create_account: t.trial_page?.create_account || "Create Account",
        back: t.trial_page?.back || "Back",
        creating_account: t.trial_page?.creating_account || "Creating your account...",
        creating_wait: t.trial_page?.creating_wait || "This may take a few seconds",
        welcome_success: t.trial_page?.welcome_success || "Welcome!",
        account_ready: t.trial_page?.account_ready || "Your account is ready:",
        trial_duration: t.trial_page?.trial_duration || "Your gift ticket has been claimed!",
        ticket_ready: t.trial_page?.ticket_ready || "Your ticket is now accessible",
        go_to_ticket: t.trial_page?.go_to_ticket || "Go to Ticket",
        start_exploring: t.trial_page?.start_exploring || "Start Exploring",
        error_title: t.trial_page?.error_title || "Something went wrong",
        try_again: t.trial_page?.try_again || "Try Again",
        no_gift_link: "No gift link found. Please use a valid gift link or connect your wallet.",
        no_gift_link_tr: "Hediye linki bulunamadı. Lütfen geçerli bir hediye linki kullanın veya cüzdanınızı bağlayın.",
        gift_for: "Gift ticket for:",
        gift_for_tr: "Hediye bilet:",
    };

    // Parse URL params on mount
    useEffect(() => {
        const parseUrlParams = async () => {
            if (typeof window === "undefined") return;

            const urlParams = new URLSearchParams(window.location.search);
            const secretKey = urlParams.get("secret") || urlParams.get("key");

            if (!secretKey) {
                // No gift link - allow direct trial creation
                setIsValidating(false);
                // Don't show error, just show the trial creation option
                return;
            }

            try {
                // Derive public key from secret key
                const keyString = secretKey.startsWith("ed25519:") ? secretKey : `ed25519:${secretKey}`;
                const keyPair = KeyPair.fromString(keyString as any);
                const publicKey = keyPair.getPublicKey().toString();

                // Validate the gift link
                const isValid = await validateGiftLink(publicKey);

                if (!isValid) {
                    setError("Invalid or expired gift link");
                    setStep("error");
                    setIsValidating(false);
                    return;
                }

                // Get event info for display
                const eventInfo = await getGiftEventInfo(publicKey);

                setGiftInfo({
                    secretKey: secretKey.startsWith("ed25519:") ? secretKey : `ed25519:${secretKey}`,
                    publicKey,
                    eventTitle: eventInfo?.title,
                });
                setIsValidating(false);
            } catch (e: any) {
                console.error("Error parsing gift link:", e);
                setError("Invalid gift link format");
                setStep("error");
                setIsValidating(false);
            }
        };

        parseUrlParams();
    }, []);

    const handleStartClaim = () => {
        // Works with or without gift link - user just needs to enter username
        setStep("username");
    };

    const handleCreateAccount = async () => {
        if (!username.trim()) return;

        setError(null);
        setStep("creating");

        try {
            // Validate username
            const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");

            let result;
            let finalAccountId: string;

            if (giftInfo) {
                // Has gift link - use claim_gift_and_create_account
                // Gift links still use full .testnet account format
                const accountId = `${sanitizedUsername}.testnet`;
                const userKeyPair = KeyPair.fromRandom("ed25519");
                const userPublicKey = userKeyPair.getPublicKey().toString();

                result = await claimGiftAndCreateAccount(
                    giftInfo.secretKey,
                    accountId,
                    userPublicKey
                );
                finalAccountId = accountId;

                if (result.success && typeof window !== "undefined") {
                    localStorage.setItem(`near-api-js:keystore:${accountId}:testnet`, userKeyPair.toString());
                }
            } else {
                // No gift link - use sponsored trial (contract creates subaccount)
                // Pass just the username - API will create e.g. "alice.contract.testnet"
                result = await createSponsoredTrial(sanitizedUsername);
                finalAccountId = result.accountId || sanitizedUsername;
            }

            if (result.success) {
                if (typeof window !== "undefined") {
                    localStorage.setItem("trialAccountId", finalAccountId);
                }

                setCreatedAccountId(finalAccountId);
                setStep("success");
                onTrialCreated?.(finalAccountId);
            } else {
                setError(result.error || "Account creation failed");
                setStep("username");
            }
        } catch (err: any) {
            console.error("Account creation error:", err);
            setError(err.message || "An error occurred");
            setStep("username");
        }
    };

    const isValidUsername = (name: string) => {
        const sanitized = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        return sanitized.length >= 2 && sanitized.length <= 32;
    };

    // Loading state
    if (isValidating) {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardContent className="py-12 text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto" />
                    <p className="text-white text-lg">Validating gift link...</p>
                </CardContent>
            </Card>
        );
    }

    // No gift link - show options
    if (step === "no-link") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-white">{tr.welcome_title}</CardTitle>
                    <CardDescription className="text-gray-400">
                        {tr.welcome_desc}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-yellow-300 text-sm text-center">
                            {t.trial_page?.no_gift_link || tr.no_gift_link}
                        </p>
                    </div>

                    <Button
                        onClick={onConnectWallet}
                        className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                    >
                        <Wallet className="w-5 h-5 mr-2" />
                        {tr.connect_wallet}
                    </Button>

                    <Button
                        onClick={() => window.location.href = "/discover"}
                        variant="outline"
                        className="w-full h-12 border-gray-600 text-gray-300"
                    >
                        Browse Free Content
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Choice Step - has gift link
    if (step === "choice") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center mb-4">
                        <Gift className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-white">
                        {giftInfo?.eventTitle ? `🎁 ${giftInfo.eventTitle}` : "🎁 Gift Ticket"}
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        {t.trial_page?.gift_for || tr.gift_for}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Claim Gift Option */}
                    <Button
                        onClick={handleStartClaim}
                        className="w-full h-14 text-lg bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        {tr.try_free}
                    </Button>

                    <div className="flex items-center gap-4 text-gray-500">
                        <div className="flex-1 h-px bg-gray-700" />
                        <span className="text-sm">{tr.or}</span>
                        <div className="flex-1 h-px bg-gray-700" />
                    </div>

                    {/* Connect Wallet Option */}
                    <Button
                        onClick={onConnectWallet}
                        variant="outline"
                        className="w-full h-14 text-lg border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                    >
                        <Wallet className="w-5 h-5 mr-2" />
                        {tr.connect_wallet}
                    </Button>

                    <div className="pt-4 space-y-2 text-sm text-gray-500">
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            {tr.no_wallet_required}
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            {tr.free_content_access}
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            {tr.upgrade_anytime}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Username Step
    if (step === "username") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardHeader className="text-center">
                    <CardTitle className="text-xl text-white">{tr.choose_username}</CardTitle>
                    <CardDescription className="text-gray-400">
                        {tr.username_desc}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative">
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={tr.username_placeholder}
                            className="pr-24 bg-gray-800 border-gray-700 text-white"
                            maxLength={32}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                            {giftInfo ? ".testnet" : ".utick.testnet"}
                        </span>
                    </div>

                    {username && !isValidUsername(username) && (
                        <p className="text-red-400 text-sm">
                            {tr.username_validation}
                        </p>
                    )}

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <Button
                        onClick={handleCreateAccount}
                        disabled={!isValidUsername(username)}
                        className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
                    >
                        {tr.create_account}
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>

                    <Button
                        onClick={() => setStep("choice")}
                        variant="ghost"
                        className="w-full text-gray-400"
                    >
                        {tr.back}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Creating Step
    if (step === "creating") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardContent className="py-12 text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto" />
                    <p className="text-white text-lg">{tr.creating_account}</p>
                    <p className="text-gray-400 text-sm">{tr.creating_wait}</p>
                </CardContent>
            </Card>
        );
    }

    // Error Step
    if (step === "error") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardContent className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="text-xl text-white font-semibold">{tr.error_title}</h3>
                    <p className="text-gray-400">{error || "Unknown error"}</p>
                    <div className="space-y-2">
                        <Button
                            onClick={() => {
                                setError(null);
                                setStep("choice");
                            }}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
                        >
                            {tr.try_again}
                        </Button>
                        <Button
                            onClick={onConnectWallet}
                            variant="outline"
                            className="w-full border-gray-600"
                        >
                            {tr.connect_wallet}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Success Step
    if (step === "success") {
        const getRedirectUrl = () => {
            if (typeof window === "undefined") return null;
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get("redirect");
        };

        const redirectUrl = getRedirectUrl();

        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardContent className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-xl text-white font-semibold">{tr.welcome_success}</h3>
                    <p className="text-gray-400">
                        {tr.account_ready} <span className="text-purple-400 font-mono">{createdAccountId}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                        {redirectUrl ? tr.ticket_ready : tr.trial_duration}
                    </p>
                    <Button
                        onClick={() => window.location.href = redirectUrl || "/discover"}
                        className="w-full bg-gradient-to-r from-cyan-600 to-purple-600"
                    >
                        {redirectUrl ? (
                            <>
                                {tr.go_to_ticket}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        ) : (
                            <>
                                {tr.start_exploring}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return null;
}
