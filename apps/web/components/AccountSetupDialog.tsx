'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, User, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { KeyPair, KeyPairSigner, Account, actions, type KeyPairString } from 'near-api-js';
import { NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { BrowserKeyStore } from '@/lib/keystore-v7';
import { getProvider, viewContract } from '@/lib/near';
import { addBuyerToNovaGroup } from '@/lib/nova/post-purchase';
import { pendingAccessQueue } from '@/lib/nova/pending-access-queue';

interface AccountSetupDialogProps {
    /** Implicit account ID that owns the NFT */
    implicitAccountId: string;
    /** Secret key of the implicit account */
    implicitSecretKey: string;
    /** CID of the purchased video */
    cid: string;
    /** Called when account setup is complete or skipped */
    onComplete: () => void;
}

export function AccountSetupDialog({
    implicitAccountId,
    implicitSecretKey,
    cid,
    onComplete,
}: AccountSetupDialogProps) {
    const [username, setUsername] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'input' | 'creating' | 'done'>('input');

    const contractId = NEAR_CONFIG.contractId;
    const fullAccountId = username ? `${username}.${contractId}` : '';

    const validateUsername = (name: string): string | null => {
        if (name.length < 2) return 'Min 2 characters';
        if (name.length > 32) return 'Max 32 characters';
        if (!/^[a-z0-9_-]+$/.test(name)) return 'Only lowercase letters, numbers, - and _';
        return null;
    };

    const validationError = username ? validateUsername(username) : null;

    const handleCreateAccount = async () => {
        if (!username || validationError) return;

        setCreating(true);
        setStep('creating');
        setError(null);

        try {
            // 1. Generate keypair for the new named account
            const newKeyPair = KeyPair.fromRandom('ed25519');
            const newPublicKey = newKeyPair.getPublicKey().toString();

            // 2. Call create_sponsored_trial_direct via onboarding key
            const onboardingKeyStr = localStorage.getItem(`onboarding_key:${contractId}`);
            if (!onboardingKeyStr) {
                throw new Error('Onboarding key not available. Please try again later.');
            }

            const { getCurrentRpcUrl } = await import('@/lib/rpc-failover');
            const rpcUrl = getCurrentRpcUrl();

            const onboardingKeyPair = KeyPair.fromString(onboardingKeyStr as KeyPairString);
            const onboardingSigner = new KeyPairSigner(onboardingKeyPair);
            const contractAccount = new Account(contractId, rpcUrl, onboardingSigner);

            await contractAccount.signAndSendTransaction({
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'create_sponsored_trial_direct',
                        { username, new_public_key: newPublicKey },
                        GAS_CONSTANTS.mediumGas,
                        BigInt(0)
                    ),
                ],
            });

            console.log('[Account Setup] Created account:', fullAccountId);

            // 3. Store new account keypair in BrowserKeyStore
            const keyStore = new BrowserKeyStore();
            const networkId = NEAR_CONFIG.networkId;
            await keyStore.setKey(networkId, fullAccountId, newKeyPair);

            // 4. Find the token_id owned by implicit account
            const provider = getProvider();
            const tokens = await viewContract<[{ token_id: string }, { encrypted_cid: string } | null][]>(
                provider, contractId, 'get_tokens_with_video',
                { account_id: implicitAccountId, limit: 50 }
            );

            const matchingToken = tokens.find(([, videoMeta]) => videoMeta?.encrypted_cid === cid);

            if (matchingToken) {
                const tokenId = matchingToken[0].token_id;

                // 5. Transfer NFT from implicit account to new named account
                const implicitKeyPair = KeyPair.fromString(implicitSecretKey as KeyPairString);
                const implicitSigner = new KeyPairSigner(implicitKeyPair);
                const implicitAccount = new Account(implicitAccountId, rpcUrl, implicitSigner);

                await implicitAccount.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [
                        actions.functionCall(
                            'nft_transfer',
                            {
                                receiver_id: fullAccountId,
                                token_id: tokenId,
                                memo: 'Transfer to named account',
                            },
                            GAS_CONSTANTS.mediumGas,
                            BigInt(1) // 1 yoctoNEAR security deposit
                        ),
                    ],
                });

                console.log('[Account Setup] NFT transferred:', tokenId, '→', fullAccountId);
            }

            // 6. Add new named account to Nova group
            try {
                await addBuyerToNovaGroup(cid, fullAccountId);
                console.log('[Account Setup] Nova group membership added for:', fullAccountId);
            } catch (err) {
                console.warn('[Account Setup] Nova group add failed (non-critical):', err);
                pendingAccessQueue.add(cid, fullAccountId);
            }

            // 7. Update localStorage: switch to named account
            localStorage.setItem('trialAccountId', fullAccountId);
            localStorage.removeItem('evmLinkedNearAccount');

            console.log('[Account Setup] Complete! Active account:', fullAccountId);
            setStep('done');

            // Auto-navigate after a brief pause
            setTimeout(() => onComplete(), 1500);
        } catch (e) {
            console.error('[Account Setup] Failed:', e);
            const msg = e instanceof Error ? e.message : 'Account creation failed';
            // Friendly messages for common errors
            if (msg.includes('Trial pool empty')) {
                setError('Account creation is temporarily unavailable. You can still watch your video.');
            } else if (msg.includes('already exists') || msg.includes('CreateAccountOnlyByRegistrar')) {
                setError('This username is taken. Please try a different one.');
            } else if (msg.includes('Daily trial limit')) {
                setError('Daily limit reached. You can still watch your video and create an account later.');
            } else {
                setError(msg);
            }
            setStep('input');
            setCreating(false);
        }
    };

    return (
        <div className="space-y-4 rounded-xl border border-near-green/30 bg-gradient-to-b from-near-green/5 to-transparent p-5">
            {step === 'done' ? (
                <div className="text-center space-y-3 py-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-near-green/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-near-green" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-near-green">Account Created!</p>
                        <p className="text-xs text-zinc-400 font-mono mt-1">{fullAccountId}</p>
                    </div>
                    <p className="text-[11px] text-zinc-500">Redirecting to your video...</p>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-near-green/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-near-green" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Ticket Purchased!</p>
                            <p className="text-[11px] text-zinc-400">Choose a username for your NEAR account</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 focus-within:border-near-green/50 transition-colors">
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                placeholder="alice"
                                maxLength={32}
                                disabled={creating}
                                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
                                autoFocus
                            />
                            <span className="text-[10px] text-zinc-600 whitespace-nowrap">.{contractId}</span>
                        </div>

                        {validationError && username && (
                            <p className="text-[11px] text-red-400">{validationError}</p>
                        )}

                        {username && !validationError && (
                            <p className="text-[11px] text-zinc-500">
                                Your account: <span className="text-zinc-300 font-mono">{fullAccountId}</span>
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                            <p className="text-[11px] text-red-400">{error}</p>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            onClick={handleCreateAccount}
                            disabled={!username || !!validationError || creating}
                            className="flex-1 h-9 bg-gradient-to-r from-near-green to-emerald-500 hover:from-near-green/90 hover:to-emerald-500/90 text-near-black font-bold text-sm rounded-lg"
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    Create Account
                                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={onComplete}
                            disabled={creating}
                            variant="ghost"
                            className="h-9 text-xs text-zinc-500 hover:text-zinc-300"
                        >
                            Skip
                        </Button>
                    </div>

                    <p className="text-[10px] text-zinc-600 text-center">
                        You can skip this and watch your video immediately.
                    </p>
                </>
            )}
        </div>
    );
}
