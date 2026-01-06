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
import { getKeypomManager } from '@/lib/keypom';
import { Copy, Check, AlertTriangle, Wallet, ArrowRight } from 'lucide-react';

interface TrialUpgradeDialogProps {
    accountId: string;
    onUpgradeComplete?: () => void;
}

export function TrialUpgradeDialog({ accountId, onUpgradeComplete }: TrialUpgradeDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'intro' | 'processing' | 'seedPhrase' | 'complete' | 'error'>('intro');
    const [seedPhrase, setSeedPhrase] = useState<string>('');
    const [publicKey, setPublicKey] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const handleUpgrade = async () => {
        setStep('processing');
        setError('');

        try {
            const manager = getKeypomManager();
            const result = await manager.upgradeTrialAccount(accountId);

            if (result.success) {
                setSeedPhrase(result.seedPhrase);
                setPublicKey(result.publicKey);
                setStep('seedPhrase');
            } else {
                setError(result.error || 'Yükseltme başarısız oldu');
                setStep('error');
            }
        } catch (err: any) {
            setError(err.message || 'Beklenmeyen bir hata oluştu');
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
            setPublicKey('');
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
                    Hesabı Yükselt
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
                                Trial Hesabı Yükselt
                            </DialogTitle>
                            <DialogDescription>
                                Trial hesabınızı kalıcı bir NEAR hesabına dönüştürün
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                                    Bu işlem ne yapar?
                                </h4>
                                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                                    <li>• 12 kelimelik güvenli bir seed phrase oluşturur</li>
                                    <li>• Hesabınıza Full Access Key ekler</li>
                                    <li>• MyNearWallet'a import edebilirsiniz</li>
                                    <li>• Trial kısıtlamaları kaldırılır</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                                <div className="flex gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-amber-800 dark:text-amber-200">
                                            Önemli
                                        </h4>
                                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                            Seed phrase'inizi güvenli bir yerde saklayın.
                                            Kaybolursa hesabınıza erişemezsiniz!
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                İptal
                            </Button>
                            <Button onClick={handleUpgrade} className="bg-purple-600 hover:bg-purple-700">
                                Yükseltmeyi Başlat
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'processing' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>İşleniyor...</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4" />
                            <p className="text-muted-foreground">
                                Hesabınız yükseltiliyor, lütfen bekleyin...
                            </p>
                        </div>
                    </>
                )}

                {step === 'seedPhrase' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-green-600">
                                ✓ Hesap Yükseltildi!
                            </DialogTitle>
                            <DialogDescription>
                                Seed phrase'inizi güvenli bir yere kaydedin
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
                                        Kopyalandı!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Seed Phrase'i Kopyala
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
                                    Seed phrase'imi güvenli bir yere kaydettim.
                                    Kaybolursa hesabıma erişemeyeceğimi anlıyorum.
                                </span>
                            </label>
                        </div>

                        <DialogFooter>
                            <Button
                                onClick={handleComplete}
                                disabled={!confirmed}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                Tamamla
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'complete' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-green-600">
                                🎉 Tebrikler!
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 py-4 text-center">
                            <p className="text-muted-foreground">
                                Hesabınız başarıyla yükseltildi.
                                Artık seed phrase'inizi kullanarak herhangi bir NEAR wallet'a import edebilirsiniz.
                            </p>

                            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                                <p className="text-xs text-muted-foreground mb-1">Hesap ID</p>
                                <p className="font-mono text-sm">{accountId}</p>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => window.open('https://wallet.testnet.near.org/recover-seed-phrase', '_blank')}
                            >
                                MyNearWallet'a Import Et
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleClose} className="w-full">
                                Kapat
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'error' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-red-600">
                                Hata Oluştu
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
                                Kapat
                            </Button>
                            <Button onClick={() => setStep('intro')}>
                                Tekrar Dene
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
