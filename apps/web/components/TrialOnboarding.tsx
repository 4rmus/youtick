"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Wallet, ArrowRight, CheckCircle2 } from "lucide-react";
import { getKeypomManager } from "@/lib/keypom";

interface TrialOnboardingProps {
    onTrialCreated?: (accountId: string) => void;
    onConnectWallet?: () => void;
}

type OnboardingStep = "choice" | "username" | "creating" | "success";

export function TrialOnboarding({ onTrialCreated, onConnectWallet }: TrialOnboardingProps) {
    const [step, setStep] = useState<OnboardingStep>("choice");
    const [username, setUsername] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);

    // Get secret key from URL if present
    const getSecretKeyFromUrl = () => {
        if (typeof window === "undefined") return null;
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("key");
    };

    const handleStartTrial = () => {
        const secretKey = getSecretKeyFromUrl();
        if (secretKey) {
            setStep("username");
        } else {
            setError("Geçersiz trial link. Lütfen doğru linki kullanın.");
        }
    };

    // Get URL params for hybrid gift claim
    const getUrlParams = () => {
        if (typeof window === "undefined") return { key: null, hybrid: false, eventCid: null, creatorId: null };
        const urlParams = new URLSearchParams(window.location.search);
        return {
            key: urlParams.get("key"),
            hybrid: urlParams.get("hybrid") === "true",
            eventCid: urlParams.get("eventCid"),
            creatorId: urlParams.get("creatorId"),
        };
    };

    const handleCreateAccount = async () => {
        const { key: secretKey, hybrid, eventCid, creatorId } = getUrlParams();
        if (!secretKey || !username.trim()) return;

        setError(null);
        setStep("creating");

        try {
            // Validate username
            const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
            const accountId = `${sanitizedUsername}.testnet`;

            const manager = getKeypomManager();
            await manager.init();

            // Check if account already exists
            try {
                const near = manager.getNear();
                if (near) {
                    await near.connection.provider.query({
                        request_type: "view_account",
                        finality: "final",
                        account_id: accountId,
                    });
                    // If query succeeds, account exists
                    setError("Bu kullanıcı adı zaten alınmış. Lütfen başka bir tane seçin.");
                    setStep("username");
                    return;
                }
            } catch (e: any) {
                // If query fails with "account does not exist", that's good!
                if (!e.message.includes("does not exist")) {
                    console.warn("Error checking account:", e);
                }
            }

            const result = await manager.activateTrialAccount(secretKey, accountId);

            if (result.success) {
                // Note: Gift ticket minting now happens via the decentralized /claim page
                // Trial account creation and gift claiming are separate flows

                setCreatedAccountId(result.accountId);
                setStep("success");
                onTrialCreated?.(result.accountId);
            } else {
                setError(result.error || "Hesap oluşturulamadı");
                setStep("username");
            }
        } catch (err: any) {
            setError(err.message || "Bir hata oluştu");
            setStep("username");
        }
    };

    const isValidUsername = (name: string) => {
        const sanitized = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        return sanitized.length >= 2 && sanitized.length <= 32;
    };

    // Choice Step
    if (step === "choice") {
        return (
            <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-white">YouTick'e Hoş Geldin!</CardTitle>
                    <CardDescription className="text-gray-400">
                        Web3 video platformunda içerikleri keşfet
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Connect Wallet Option */}
                    <Button
                        onClick={onConnectWallet}
                        className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                    >
                        <Wallet className="w-5 h-5 mr-2" />
                        Cüzdan Bağla
                    </Button>

                    <div className="flex items-center gap-4 text-gray-500">
                        <div className="flex-1 h-px bg-gray-700" />
                        <span className="text-sm">veya</span>
                        <div className="flex-1 h-px bg-gray-700" />
                    </div>

                    {/* Trial Option */}
                    <Button
                        onClick={handleStartTrial}
                        variant="outline"
                        className="w-full h-14 text-lg border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        Ücretsiz Dene (7 Gün)
                    </Button>

                    {error && (
                        <p className="text-red-400 text-sm text-center">{error}</p>
                    )}

                    <div className="pt-4 space-y-2 text-sm text-gray-500">
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Cüzdan gerektirmez
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Ücretsiz içeriklere eriş
                        </p>
                        <p className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            İstediğin zaman tam cüzdana geç
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
                    <CardTitle className="text-xl text-white">Kullanıcı Adı Seç</CardTitle>
                    <CardDescription className="text-gray-400">
                        Bu, senin NEAR hesap adresinin olacak
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative">
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="kullaniciadi"
                            className="pr-24 bg-gray-800 border-gray-700 text-white"
                            maxLength={32}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                            .testnet
                        </span>
                    </div>

                    {username && !isValidUsername(username) && (
                        <p className="text-red-400 text-sm">
                            En az 2 karakter, sadece harf, rakam, _ ve - kullanabilirsin
                        </p>
                    )}

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <Button
                        onClick={handleCreateAccount}
                        disabled={!isValidUsername(username)}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                        Hesap Oluştur
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>

                    <Button
                        onClick={() => setStep("choice")}
                        variant="ghost"
                        className="w-full text-gray-400"
                    >
                        Geri
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
                    <p className="text-white text-lg">Hesabın oluşturuluyor...</p>
                    <p className="text-gray-400 text-sm">Bu birkaç saniye sürebilir</p>
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
                    <h3 className="text-xl text-white font-semibold">Hoş Geldin!</h3>
                    <p className="text-gray-400">
                        Hesabın hazır: <span className="text-purple-400 font-mono">{createdAccountId}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                        {redirectUrl ? "Biletine şimdi erişebilirsin" : "7 gün boyunca ücretsiz içeriklere erişebilirsin"}
                    </p>
                    <Button
                        onClick={() => window.location.href = redirectUrl || "/discover"}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
                    >
                        {redirectUrl ? (
                            <>
                                Bilete Git
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        ) : (
                            <>
                                Keşfetmeye Başla
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
