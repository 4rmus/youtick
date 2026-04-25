"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Wallet, ArrowRight, CheckCircle2, AlertCircle, Gift } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { KeyPair, type KeyPairString } from "near-api-js";
import { claimGiftAndCreateAccount, claimTrialInviteWithImplicitAccount, validateGiftLink, validateTrialInviteLink, getGiftEventInfo } from "@/lib/gift-service";
import { bootstrapGuestAccount, getOrCreateGuestIdentity } from "@/lib/guest-account";
import { NEAR_CONFIG } from "@/lib/constants";
import { persistManagedKeyPair } from "@/lib/managed-near-account";

interface TrialOnboardingProps {
    onAccountCreated?: (accountId: string, kind: 'guest' | 'trial') => void;
    onConnectWallet?: () => void;
}

type OnboardingStep = "choice" | "username" | "creating" | "success" | "error" | "no-link";

export function TrialOnboarding({ onAccountCreated, onConnectWallet }: TrialOnboardingProps) {
    const { t } = useLanguage();
    const trialPageCopy = t.trial_page as Record<string, string> | undefined;
    const [step, setStep] = useState<OnboardingStep>("choice");
    const [username, setUsername] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
    const [giftInfo, setGiftInfo] = useState<{ secretKey: string; publicKey: string; eventTitle?: string } | null>(null);
    const [trialInviteInfo, setTrialInviteInfo] = useState<{ secretKey: string; publicKey: string } | null>(null);
    const [isValidating, setIsValidating] = useState(true);

    // Translations with fallbacks
    const tr = {
        welcome_title: trialPageCopy?.welcome_title || "Welcome to YouTick!",
        welcome_desc: trialPageCopy?.welcome_desc || "Discover content on the Web3 video platform",
        connect_wallet: trialPageCopy?.connect_wallet || "Connect Wallet",
        create_guest_account: trialPageCopy?.create_guest_account || "Create Test Account",
        create_trial: trialPageCopy?.create_trial || "Create Test Account",
        start_trial: trialPageCopy?.start_trial || "Start Trial",
        or: trialPageCopy?.or || "or",
        try_free: trialPageCopy?.try_free || "Claim Gift Ticket",
        no_wallet_required: trialPageCopy?.no_wallet_required || "No wallet required",
        free_content_access: trialPageCopy?.free_content_access || "Access free content",
        upgrade_anytime: trialPageCopy?.upgrade_anytime || "Upgrade to full wallet anytime",
        validating_link: trialPageCopy?.validating_link || "Validating link...",
        trial_invite_title: trialPageCopy?.trial_invite_title || "Trial Invite",
        gift_ticket_title: trialPageCopy?.gift_ticket_title || "Gift Ticket",
        test_account_required: trialPageCopy?.test_account_required || "To watch free videos, create a test account first or claim your existing access.",
        choose_username: trialPageCopy?.choose_username || "Choose Username",
        username_desc: trialPageCopy?.username_desc || "This will be your NEAR account address",
        username_placeholder: trialPageCopy?.username_placeholder || "username",
        username_validation: trialPageCopy?.username_validation || "At least 2 characters, only letters, numbers, _ and -",
        username_taken: trialPageCopy?.username_taken || "This username is already taken. Please choose another.",
        create_account: trialPageCopy?.create_account || "Create Account",
        back: trialPageCopy?.back || "Back",
        creating_account: trialPageCopy?.creating_account || "Creating your account...",
        creating_wait: trialPageCopy?.creating_wait || "This may take a few seconds",
        welcome_success: trialPageCopy?.welcome_success || "Welcome!",
        account_ready: trialPageCopy?.account_ready || "Your account is ready:",
        trial_duration: trialPageCopy?.trial_duration || "Your gift ticket has been claimed!",
        ticket_ready: trialPageCopy?.ticket_ready || "Your ticket is now accessible",
        go_to_ticket: trialPageCopy?.go_to_ticket || "Go to Ticket",
        start_exploring: trialPageCopy?.start_exploring || "Start Exploring",
        error_title: trialPageCopy?.error_title || "Something went wrong",
        try_again: trialPageCopy?.try_again || "Try Again",
        no_gift_link: trialPageCopy?.no_gift_link || "No gift link found. Please use a valid gift link or connect your wallet.",
        invite_required: trialPageCopy?.invite_required || "Trial account creation now requires an invite link.",
        gift_for: trialPageCopy?.gift_for || "Gift ticket for:",
        invalid_gift_link: trialPageCopy?.invalid_gift_link || "Invalid or expired gift link",
        invalid_gift_format: trialPageCopy?.invalid_gift_format || "Invalid gift link format",
        trial_account_failed: trialPageCopy?.trial_account_failed || "Failed to create implicit trial account",
        account_creation_failed: trialPageCopy?.account_creation_failed || "Account creation failed",
        error_occurred: trialPageCopy?.error_occurred || "An error occurred",
        guest_creation_failed: trialPageCopy?.guest_creation_failed || "Guest account creation failed",
        unknown_error: trialPageCopy?.unknown_error || "Unknown error",
    };

    // Parse URL params on mount
    useEffect(() => {
        const parseUrlParams = async () => {
            if (typeof window === "undefined") return;

            const hash = window.location.hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            const hashKey = hashParams.get("key");

            const urlParams = new URLSearchParams(window.location.search);
            const queryKey = urlParams.get("secret") || urlParams.get("key");

            const secretKey = hashKey || queryKey;

            if (secretKey) {
                window.history.replaceState(null, "", window.location.pathname);
            }

            if (!secretKey) {
                // No gift link - allow direct trial creation
                setStep("no-link");
                setIsValidating(false);
                return;
            }

            try {
                // Derive public key from secret key
                const keyString = secretKey.startsWith("ed25519:") ? secretKey : `ed25519:${secretKey}`;
                const keyPair = KeyPair.fromString(keyString as KeyPairString);
                const publicKey = keyPair.getPublicKey().toString();

                const trialInvite = await validateTrialInviteLink(publicKey);
                if (trialInvite) {
                    setTrialInviteInfo({
                        secretKey: secretKey.startsWith("ed25519:") ? secretKey : `ed25519:${secretKey}`,
                        publicKey,
                    });
                    setStep("choice");
                    setIsValidating(false);
                    return;
                }

                // Validate the gift link
                const isValid = await validateGiftLink(publicKey);

                if (!isValid) {
                    setError(tr.invalid_gift_link);
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
            } catch (e: unknown) {
                console.error("Error parsing gift link:", e);
                setError(tr.invalid_gift_format);
                setStep("error");
                setIsValidating(false);
            }
        };

        parseUrlParams();
    }, []);

    const handleStartClaim = async () => {
        if (trialInviteInfo) {
            setError(null);
            setStep("creating");

            const result = await claimTrialInviteWithImplicitAccount(trialInviteInfo.secretKey);
            if (result.success) {
                setCreatedAccountId(result.accountId || null);
                setStep("success");
                onAccountCreated?.(result.accountId || "", 'trial');
                return;
            }

            setError(result.error || tr.trial_account_failed);
            setStep("error");
            return;
        }

        setStep("username");
    };

    const getReturnStep = (): OnboardingStep => ((giftInfo || trialInviteInfo) ? "choice" : "no-link");

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
                const accountId = `${sanitizedUsername}.${NEAR_CONFIG.contractId}`;
                const userKeyPair = KeyPair.fromRandom("ed25519");
                const userPublicKey = userKeyPair.getPublicKey().toString();

                result = await claimGiftAndCreateAccount(
                    giftInfo.secretKey,
                    accountId,
                    userPublicKey
                );
                finalAccountId = accountId;

                if (result.success) {
                    await persistManagedKeyPair(accountId, userKeyPair.toString());
                }
            } else {
                setError(tr.invite_required);
                setStep("error");
                return;
            }

            if (result.success) {
                setCreatedAccountId(finalAccountId);
                setStep("success");
                onAccountCreated?.(finalAccountId, 'trial');
            } else {
                setError(result.error || tr.account_creation_failed);
                setStep("username");
            }
        } catch (err: unknown) {
            console.error("Account creation error:", err);
            setError(err instanceof Error ? err.message : tr.error_occurred);
            setStep("username");
        }
    };

    const handleCreateGuestAccount = async () => {
        setError(null);
        setStep("creating");

        try {
            const identity = await getOrCreateGuestIdentity();
            const result = await bootstrapGuestAccount(identity);
            setCreatedAccountId(result.accountId);
            setStep("success");
            onAccountCreated?.(result.accountId, 'guest');
        } catch (err: unknown) {
            console.error("Guest account creation error:", err);
            setError(err instanceof Error ? err.message : tr.guest_creation_failed);
            setStep("error");
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
                    <p className="text-white text-lg">{tr.validating_link}</p>
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
                        onClick={handleCreateGuestAccount}
                        className="w-full h-14 text-lg bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        {tr.create_guest_account}
                    </Button>

                    <Button
                        onClick={onConnectWallet}
                        variant="outline"
                        className="w-full h-12 border-gray-600 text-gray-300"
                    >
                        <Wallet className="w-5 h-5 mr-2" />
                        {tr.connect_wallet}
                    </Button>
                    <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-lg">
                        <p className="text-zinc-300 text-sm text-center">
                            {tr.test_account_required}
                        </p>
                    </div>
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
                        {trialInviteInfo
                            ? `⚡ ${tr.trial_invite_title}`
                            : giftInfo?.eventTitle ? `🎁 ${giftInfo.eventTitle}` : `🎁 ${tr.gift_ticket_title}`}
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        {trialInviteInfo ? tr.no_wallet_required : (t.trial_page?.gift_for || tr.gift_for)}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Claim Gift Option */}
                    <Button
                        onClick={handleStartClaim}
                        className="w-full h-14 text-lg bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        {trialInviteInfo ? tr.start_trial : tr.try_free}
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
                            .{NEAR_CONFIG.contractId}
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
                        onClick={() => setStep(getReturnStep())}
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
                    <p className="text-gray-400">{error || tr.unknown_error}</p>
                    <div className="space-y-2">
                        <Button
                            onClick={() => {
                                setError(null);
                                setStep(getReturnStep());
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
