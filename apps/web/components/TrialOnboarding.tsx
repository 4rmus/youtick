"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, ArrowRight, CheckCircle2, AlertCircle, Gift } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { KeyPair, type KeyPairString } from "near-api-js";
import { claimGiftWithImplicitAccount, claimTrialInviteWithImplicitAccount, validateGiftLink, validateTrialInviteLink, getGiftEventInfo } from "@/lib/gift-service";
import { bootstrapGuestAccount, getOrCreateGuestIdentity } from "@/lib/guest-account";

interface TrialOnboardingProps {
    onAccountCreated?: (accountId: string, kind: 'guest' | 'trial') => void;
}

type OnboardingStep = "choice" | "creating" | "success" | "error" | "no-link";

export function TrialOnboarding({ onAccountCreated }: TrialOnboardingProps) {
    const { t } = useLanguage();
    const trialPageCopy = t.trial_page as Record<string, string> | undefined;
    const [step, setStep] = useState<OnboardingStep>("choice");
    const [error, setError] = useState<string | null>(null);
    const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
    const [giftInfo, setGiftInfo] = useState<{ secretKey: string; publicKey: string; eventTitle?: string } | null>(null);
    const [trialInviteInfo, setTrialInviteInfo] = useState<{ secretKey: string; publicKey: string } | null>(null);
    const [isValidating, setIsValidating] = useState(true);

    // Translations with fallbacks
    const tr = {
        welcome_title: trialPageCopy?.welcome_title || "Start with a Guest Account",
        welcome_desc: trialPageCopy?.welcome_desc || "Discover films, concert recordings and special screenings with a digital ticket.",
        create_guest_account: trialPageCopy?.create_guest_account || "Create Guest Account",
        create_trial: trialPageCopy?.create_trial || "Create Guest Account",
        start_trial: trialPageCopy?.start_trial || "Start Guest Access",
        try_free: trialPageCopy?.try_free || "Claim Gift Ticket",
        no_wallet_required: trialPageCopy?.no_wallet_required || "No wallet required",
        free_content_access: trialPageCopy?.free_content_access || "Claim free-ticket releases",
        upgrade_anytime: trialPageCopy?.upgrade_anytime || "Upgrade to a permanent wallet anytime",
        validating_link: trialPageCopy?.validating_link || "Validating link...",
        trial_invite_title: trialPageCopy?.trial_invite_title || "Guest Invite",
        gift_ticket_title: trialPageCopy?.gift_ticket_title || "Gift Ticket",
        test_account_required: trialPageCopy?.test_account_required || "To keep access to free-ticket releases, create a guest account or claim your existing access.",
        choose_username: trialPageCopy?.choose_username || "Choose Username",
        username_desc: trialPageCopy?.username_desc || "This becomes your guest account name",
        username_placeholder: trialPageCopy?.username_placeholder || "username",
        username_validation: trialPageCopy?.username_validation || "At least 2 characters, only letters, numbers, _ and -",
        username_taken: trialPageCopy?.username_taken || "This username is already taken. Please choose another.",
        create_account: trialPageCopy?.create_account || "Create Account",
        back: trialPageCopy?.back || "Back",
        creating_account: trialPageCopy?.creating_account || "Creating your account...",
        creating_wait: trialPageCopy?.creating_wait || "This may take a few seconds",
        welcome_success: trialPageCopy?.welcome_success || "Welcome!",
        account_ready: trialPageCopy?.account_ready || "Your account is ready:",
        trial_duration: trialPageCopy?.trial_duration || "Your guest access is ready.",
        start_exploring: trialPageCopy?.start_exploring || "Start Exploring",
        error_title: trialPageCopy?.error_title || "Something went wrong",
        try_again: trialPageCopy?.try_again || "Try Again",
        no_gift_link: trialPageCopy?.no_gift_link || "Start with a guest account. Gift links also open here when someone shares one with you.",
        invite_required: trialPageCopy?.invite_required || "Guest account creation now requires an invite link.",
        gift_for: trialPageCopy?.gift_for || "Gift ticket for:",
        invalid_gift_link: trialPageCopy?.invalid_gift_link || "Invalid or expired gift link",
        invalid_gift_format: trialPageCopy?.invalid_gift_format || "Invalid gift link format",
        trial_account_failed: trialPageCopy?.trial_account_failed || "Failed to create guest account",
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
    }, [tr.invalid_gift_format, tr.invalid_gift_link]);

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

        if (giftInfo) {
            setError(null);
            setStep("creating");

            const result = await claimGiftWithImplicitAccount(giftInfo.secretKey);
            if (result.success) {
                setCreatedAccountId(result.accountId || null);
                setStep("success");
                onAccountCreated?.(result.accountId || "", 'guest');
                return;
            }

            setError(result.error || tr.account_creation_failed);
            setStep("error");
            return;
        }

        setStep("no-link");
    };

    const getReturnStep = (): OnboardingStep => ((giftInfo || trialInviteInfo) ? "choice" : "no-link");

    const handleCreateGuestAccount = async () => {
        setError(null);
        setStep("creating");

        try {
            const identity = await getOrCreateGuestIdentity();
            const result = await bootstrapGuestAccount(identity);
            if (!result.ok) {
                throw new Error(result.error || tr.guest_creation_failed);
            }
            setCreatedAccountId(result.accountId);
            setStep("success");
            onAccountCreated?.(result.accountId, 'guest');
        } catch (err: unknown) {
            console.error("Guest account creation error:", err);
            setError(err instanceof Error ? err.message : tr.guest_creation_failed);
            setStep("error");
        }
    };

    // Loading state
    if (isValidating) {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardContent className="py-12 text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-near-green mx-auto" />
                    <p className="text-white text-lg">{tr.validating_link}</p>
                </CardContent>
            </Card>
        );
    }

    // No gift link - show options
    if (step === "no-link") {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-near-green/10 border border-near-green/30 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-near-green" />
                    </div>
                    <CardTitle className="text-2xl text-white">{tr.welcome_title}</CardTitle>
                    <CardDescription className="text-zinc-400">
                        {tr.welcome_desc}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-lg">
                        <p className="text-zinc-300 text-sm text-center">
                            {tr.no_gift_link}
                        </p>
                    </div>

                    <Button
                        onClick={handleCreateGuestAccount}
                        variant="near"
                        className="w-full h-14 text-lg"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        {tr.create_guest_account}
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
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-near-green/10 border border-near-green/30 rounded-full flex items-center justify-center mb-4">
                        <Gift className="w-8 h-8 text-near-green" />
                    </div>
                    <CardTitle className="text-2xl text-white">
                        {trialInviteInfo
                            ? tr.trial_invite_title
                            : giftInfo?.eventTitle ? giftInfo.eventTitle : tr.gift_ticket_title}
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                        {trialInviteInfo ? tr.no_wallet_required : (t.trial_page?.gift_for || tr.gift_for)}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Claim Gift Option */}
                    <Button
                        onClick={handleStartClaim}
                        variant="near"
                        className="w-full h-14 text-lg"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        {trialInviteInfo ? tr.start_trial : tr.try_free}
                    </Button>

                    <div className="pt-4 space-y-2 text-sm text-zinc-400">
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-near-green" />
                            {tr.no_wallet_required}
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-near-green" />
                            {tr.free_content_access}
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-near-green" />
                            {tr.upgrade_anytime}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Creating Step
    if (step === "creating") {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardContent className="py-12 text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-near-green mx-auto" />
                    <p className="text-white text-lg">{tr.creating_account}</p>
                    <p className="text-zinc-400 text-sm">{tr.creating_wait}</p>
                </CardContent>
            </Card>
        );
    }

    // Error Step
    if (step === "error") {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardContent className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-near-red/10 border border-near-red/30 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-near-red" />
                    </div>
                    <h3 className="text-xl text-white font-semibold">{tr.error_title}</h3>
                    <p className="text-zinc-400">{error || tr.unknown_error}</p>
                    <div className="space-y-2">
                        <Button
                            onClick={() => {
                                setError(null);
                                setStep(getReturnStep());
                            }}
                            variant="near"
                            className="w-full"
                        >
                            {tr.try_again}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Success Step
    if (step === "success") {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-950 border-zinc-800 text-white">
                <CardContent className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-near-green/10 border border-near-green/30 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8 text-near-green" />
                    </div>
                    <h3 className="text-xl text-white font-semibold">{tr.welcome_success}</h3>
                    <p className="text-zinc-400">
                        {tr.account_ready} <span className="text-near-green font-mono">{createdAccountId}</span>
                    </p>
                    <p className="text-sm text-zinc-500">
                        {tr.trial_duration}
                    </p>
                    <Button
                        onClick={() => window.location.href = "/discover"}
                        variant="near"
                        className="w-full"
                    >
                        {tr.start_exploring}
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return null;
}
