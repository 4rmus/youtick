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
import { Copy, Check, AlertTriangle, Wallet, ArrowRight, ExternalLink, Loader2 } from 'lucide-react';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { generateSeedPhrase } from 'near-seed-phrase';
import { useLanguage } from '@/components/providers/LanguageContext';
import { NEAR_CONFIG } from '@/lib/constants';
import { getCurrentRpcUrl } from '@/lib/rpc-failover';

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

            // Get stored guest key from localStorage
            const networkId = NEAR_CONFIG.networkId;
            const storedKey = localStorage.getItem(`near-api-js:keystore:${accountId}:${networkId}`);

            if (!storedKey) {
                throw new Error(u?.key_not_found || 'Guest account key not found. Please sign in again.');
            }

            // Use current guest key to add new Full Access Key
            const trialKeyPair = KeyPair.fromString(storedKey as KeyPairString);

            // v7: Import Account, KeyPairSigner, PublicKey, and actions
            const { Account, KeyPairSigner, PublicKey, actions } = await import('near-api-js');

            // v7: Create Account with signer
            const signer = new KeyPairSigner(trialKeyPair);
            const account = new Account(accountId, getCurrentRpcUrl(), signer);

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
                    variant="near"
                >
                    <Wallet className="w-4 h-4 mr-2" />
                    {u?.upgrade_button || "Make Account Permanent"}
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => {
                if (step === 'seedPhrase') e.preventDefault();
            }}>
                {step === 'intro' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-near-green" />
                                {u?.title || "Make your guest account permanent"}
                            </DialogTitle>
                            <DialogDescription>
                                {u?.description || "Save a recovery phrase so you can keep access to your tickets outside this device."}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="rounded-lg border border-near-green/20 bg-near-green/10 p-4">
                                <h4 className="font-medium text-near-green mb-2">
                                    {u?.how_it_works || "How does it work?"}
                                </h4>
                                <ul className="text-sm text-zinc-300 space-y-1">
                                    <li>• {u?.step1 || "A secure 12-word recovery phrase is generated"}</li>
                                    <li>• {u?.step2 || "You can use it to recover the account later"}</li>
                                    <li>• {u?.step3 || "You can keep or move your digital tickets from this account"}</li>
                                </ul>
                            </div>

                            <div className="rounded-lg border border-near-red/30 bg-near-red/10 p-4">
                                <div className="flex gap-2">
                                    <AlertTriangle className="w-5 h-5 text-near-red flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-near-red">
                                            {u?.important || "Important"}
                                        </h4>
                                        <p className="text-sm text-zinc-300 mt-1">
                                            {u?.important_desc || "Store your recovery phrase in a safe place. If you lose it, you will not be able to access your account."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {u?.cancel || "Cancel"}
                            </Button>
                            <Button onClick={handleUpgrade} variant="near">
                                {u?.generate_seed || "Generate Recovery Phrase"}
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
                            <Loader2 className="h-12 w-12 animate-spin text-near-green mb-4" />
                            <p className="text-zinc-400">
                                {u?.generating_seed || "Generating recovery phrase..."}
                            </p>
                        </div>
                    </>
                )}

                {step === 'seedPhrase' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-near-green">
                                {u?.seed_ready || "Recovery Phrase Ready"}
                            </DialogTitle>
                            <DialogDescription>
                                {u?.save_words || "Save these words in a safe place"}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                <div className="grid grid-cols-3 gap-2">
                                    {seedWords.map((word, index) => (
                                        <div
                                            key={index}
                                            className="rounded border border-zinc-800 bg-black/60 px-2 py-1.5 text-sm font-mono text-zinc-100"
                                        >
                                            <span className="text-zinc-500 mr-1">{index + 1}.</span>
                                            {word}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full border-zinc-700 text-zinc-200 hover:bg-zinc-900"
                                onClick={handleCopy}
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-2 text-near-green" />
                                        {u?.copied || "Copied!"}
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 mr-2" />
                                        {u?.copy_seed || "Copy Recovery Phrase"}
                                    </>
                                )}
                            </Button>

                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="mt-1 accent-near-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                                />
                                <span className="text-sm text-zinc-400">
                                    {u?.confirm_saved || "I have saved my recovery phrase in a safe place. I understand I cannot access my account if I lose it."}
                                </span>
                            </label>
                        </div>

                        <DialogFooter>
                            <Button
                                onClick={handleComplete}
                                disabled={!confirmed}
                                variant="near"
                                className="w-full"
                            >
                                {u?.continue || "Continue"}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'complete' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-near-green">
                                {u?.next_step || "Next Step"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 py-4 text-center">
                            <p className="text-zinc-400">
                                {u?.next_step_desc || "Create or recover an account with your recovery phrase. Then keep your digital tickets in the new account."}
                            </p>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                                <p className="text-xs text-zinc-500 mb-1">{u?.current_account || "Current Account"}</p>
                                <p className="font-mono text-sm">{accountId}</p>
                            </div>

                            <Button
                                variant="near"
                                className="w-full"
                                onClick={() => {
                                    const networkId = NEAR_CONFIG.networkId;
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
                            <DialogTitle className="text-near-red">
                                {u?.error_title || "Error Occurred"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="py-4">
                            <div className="rounded-lg border border-near-red/30 bg-near-red/10 p-4">
                                <p className="text-near-red">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {u?.close || "Close"}
                            </Button>
                            <Button onClick={() => setStep('intro')} variant="near">
                                {u?.try_again || "Try Again"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
