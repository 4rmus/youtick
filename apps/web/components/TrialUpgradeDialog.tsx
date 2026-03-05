'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Copy, Check, AlertTriangle, Wallet, ArrowRight, ExternalLink } from 'lucide-react';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { generateSeedPhrase } from 'near-seed-phrase';
import { useLanguage } from '@/components/providers/LanguageContext';

interface TrialUpgradeDialogProps {
    accountId: string;
    onUpgradeComplete?: () => void;
}

export function TrialUpgradeDialog({ accountId, onUpgradeComplete }: TrialUpgradeDialogProps) {
    const { t } = useLanguage();
    const u = t.upgrade_dialog;

    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'intro' | 'processing' | 'seedPhrase' | 'complete' | 'error'>('intro');
    const [seedPhrase, setSeedPhrase] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const handleUpgrade = async () => {
        setStep('processing');
        setError('');

        try {
            // Generate a new seed phrase and derive keypair
            const { seedPhrase: phrase, publicKey: pk } = generateSeedPhrase();

            // Get stored trial key from localStorage
            const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet';
            const storedKey = localStorage.getItem(`near-api-js:keystore:${accountId}:${networkId}`);

            if (!storedKey) {
                throw new Error(u?.key_not_found || 'Trial account key not found. Please sign in again.');
            }

            // Use current trial key to add new Full Access Key
            const trialKeyPair = KeyPair.fromString(storedKey as KeyPairString);

            // v7: Import Account, KeyPairSigner, PublicKey, and actions
            const { Account, KeyPairSigner, PublicKey, actions } = await import('near-api-js');

            const rpcUrl = networkId === 'mainnet'
                ? 'https://rpc.fastnear.com'
                : 'https://test.rpc.fastnear.com';

            // v7: Create Account with signer
            const signer = new KeyPairSigner(trialKeyPair);
            const account = new Account(accountId, rpcUrl, signer);

            // Add the new Full Access Key derived from seed phrase
            // v7: Use actions.addFullAccessKey with signAndSendTransaction
            await account.signAndSendTransaction({
                receiverId: accountId,
                actions: [
                    actions.addFullAccessKey(PublicKey.fromString(pk))
                ]
            });
            // Now the seed phrase can be used to recover this account
            setSeedPhrase(phrase);
            setStep('seedPhrase');

        } catch (err: unknown) {
            console.error('Upgrade error:', err);
            setError(err instanceof Error ? err.message : (u?.unexpected_error || 'An unexpected error occurred'));
            setStep('error');
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(seedPhrase);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleComplete = () => {
        setStep('complete');
        if (onUpgradeComplete) {
            onUpgradeComplete();
        }
    };

    const handleClose = () => {
        if (step === 'seedPhrase') {
            // Don't allow closing without confirming
            return;
        }
        setIsOpen(false);
        // Reset state after close animation
        setTimeout(() => {
            setStep('intro');
            setSeedPhrase('');
            setError('');
            setCopied(false);
            setConfirmed(false);
        }, 200);
    };

    const seedWords = seedPhrase.split(' ');

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open && step === 'seedPhrase') return;
            setIsOpen(open);
        }}>
            <DialogTrigger asChild>
                <Button
                    variant="default"
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                    <Wallet className="w-4 h-4 mr-2" />
                    {u?.upgrade_button || "Upgrade Account"}
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => {
                if (step === 'seedPhrase') e.preventDefault();
            }}>
                {step === 'intro' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-purple-500" />
                                {u?.title || "Upgrade to Full Wallet"}
                            </DialogTitle>
                            <DialogDescription>
                                {u?.description || "Convert your trial account to a permanent NEAR wallet"}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                                    {u?.how_it_works || "How does it work?"}
                                </h4>
                                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                                    <li>• {u?.step1 || "A secure 12-word seed phrase is generated"}</li>
                                    <li>• {u?.step2 || "You can create an account on MyNearWallet with this seed"}</li>
                                    <li>• {u?.step3 || "You can transfer your NFTs to your new account"}</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                                <div className="flex gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-amber-800 dark:text-amber-200">
                                            {u?.important || "Important"}
                                        </h4>
                                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                            {u?.important_desc || "Store your seed phrase in a safe place. If you lose it, you won't be able to access your account!"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {u?.cancel || "Cancel"}
                            </Button>
                            <Button onClick={handleUpgrade} className="bg-purple-600 hover:bg-purple-700">
                                {u?.generate_seed || "Generate Seed Phrase"}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'processing' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{u?.processing || "Processing..."}</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4" />
                            <p className="text-muted-foreground">
                                {u?.generating_seed || "Generating seed phrase..."}
                            </p>
                        </div>
                    </>
                )}

                {step === 'seedPhrase' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-green-600">
                                {u?.seed_ready || "✓ Seed Phrase Ready!"}
                            </DialogTitle>
                            <DialogDescription>
                                {u?.save_words || "Save these words in a safe place"}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                                <div className="grid grid-cols-3 gap-2">
                                    {seedWords.map((word, index) => (
                                        <div
                                            key={index}
                                            className="bg-white dark:bg-gray-700 rounded px-2 py-1.5 text-sm font-mono"
                                        >
                                            <span className="text-gray-400 mr-1">{index + 1}.</span>
                                            {word}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleCopy}
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-2 text-green-500" />
                                        {u?.copied || "Copied!"}
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 mr-2" />
                                        {u?.copy_seed || "Copy Seed Phrase"}
                                    </>
                                )}
                            </Button>

                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="mt-1"
                                />
                                <span className="text-sm text-muted-foreground">
                                    {u?.confirm_saved || "I have saved my seed phrase in a safe place. I understand I cannot access my account if I lose it."}
                                </span>
                            </label>
                        </div>

                        <DialogFooter>
                            <Button
                                onClick={handleComplete}
                                disabled={!confirmed}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                {u?.continue || "Continue"}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'complete' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-green-600">
                                {u?.next_step || "🎉 Next Step"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 py-4 text-center">
                            <p className="text-muted-foreground">
                                {u?.next_step_desc || "Create an account on MyNearWallet using your seed phrase. Then you can transfer your NFTs to your new account."}
                            </p>

                            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                                <p className="text-xs text-muted-foreground mb-1">{u?.current_account || "Current Account"}</p>
                                <p className="font-mono text-sm">{accountId}</p>
                            </div>

                            <Button
                                className="w-full bg-purple-600 hover:bg-purple-700"
                                onClick={() => {
                                    const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet';
                                    window.open(networkId === 'mainnet'
                                        ? 'https://app.mynearwallet.com/create'
                                        : 'https://testnet.mynearwallet.com/create', '_blank');
                                }}
                            >
                                {u?.create_on_mynear || "Create Account on MyNearWallet"}
                                <ExternalLink className="w-4 h-4 ml-2" />
                            </Button>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose} className="w-full">
                                {u?.close || "Close"}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'error' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-red-600">
                                {u?.error_title || "Error Occurred"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="py-4">
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                                <p className="text-red-700 dark:text-red-300">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {u?.close || "Close"}
                            </Button>
                            <Button onClick={() => setStep('intro')}>
                                {u?.try_again || "Try Again"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
