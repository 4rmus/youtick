'use client';

import React, { useEffect, useState, useRef } from 'react';
import { lit } from '@/lib/lit';
import { useWallet } from '@/components/providers/WalletProvider';
import { ethers } from 'ethers';
import { Loader2, Play, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
}

export function IpfsPlayer({ cid, filename }: IpfsPlayerProps) {
    const { selector, accountId } = useWallet();
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    const handlePlay = async () => {
        if (!accountId || !selector) {
            setError("Please connect your wallet to watch.");
            return;
        }

        setLoading(true);
        setError(null);
        setStatus('Initializing...');

        try {
            const wallet = await selector.wallet();
            const { signWithMPC } = await import('@/lib/chain-signatures');

            // 0. Client-Side Access Control Check
            // Fallback: We rely on this client-side check because Lit Action is not currently supported.
            setStatus('Verifying NFT ownership...');
            const hasAccess = await checkNearNFT(accountId);
            if (!hasAccess) {
                throw new Error("You do not own the required NFT to watch this video.");
            }

            // 1. Fetch Encrypted File from IPFS
            setStatus('Fetching video from IPFS...');
            const response = await fetch(`https://gateway.lighthouse.storage/ipfs/${cid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
            }
            const blob = await response.blob();
            const file = new File([blob], filename || "video.mp4");

            // 2. Get Auth Message (Challenge)
            // We must construct a valid SIWE message for Lit to accept the AuthSig.
            const latestBlockhash = await lit.getLatestBlockhash();
            const nonce = latestBlockhash;

            // We need the recovered address first to put in the message.
            // But we need the message to sign to recover the address!
            // MPC address is deterministic from accountId + path.
            // So we can sign a dummy message first to get the address, OR use the one we might have stored?
            // Let's sign a dummy message first to get the address, then sign the real SIWE message.
            // This is double signing, but necessary if we don't know the ETH address yet.

            setStatus('Recovering ETH address...');
            const derivationPath = 'youtick-demo,chunky-paste.testnet,v1';
            const dummyMessage = "get_address";
            const dummySignatureObj = await signWithMPC(wallet, accountId, derivationPath, dummyMessage) as any;

            const dummyR = '0x' + dummySignatureObj.big_r.affine_point.substring(2, 66);
            const dummyS = '0x' + dummySignatureObj.s.scalar;
            const dummyV = dummySignatureObj.recovery_id + 27;
            const dummySig = ethers.Signature.from({ r: dummyR, s: dummyS, v: dummyV }).serialized;
            const recoveredAddress = ethers.verifyMessage(dummyMessage, dummySig);
            console.log('Recovered MPC Address:', recoveredAddress);

            // Construct SIWE Message
            const domain = window.location.host;
            const origin = window.location.origin;
            const statement = "I am signing this message to prove ownership of this account for Lit Protocol decryption.";
            const issuedAt = new Date().toISOString();
            const expirationTime = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(); // 24 hours from now

            const messageToSign = `${domain} wants you to sign in with your Ethereum account:
${recoveredAddress}

${statement}

URI: ${origin}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;

            setStatus('Signing SIWE message...');
            const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, messageToSign) as any;

            // Construct AuthSig
            const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
            const s_val = '0x' + mpcSignature.s.scalar;
            const v_val = mpcSignature.recovery_id + 27;

            const signature = ethers.Signature.from({
                r: r_val,
                s: s_val,
                v: v_val
            }).serialized;

            const authSig = {
                sig: signature,
                derivedVia: "web3.eth.personal.sign",
                signedMessage: messageToSign,
                address: recoveredAddress,
            };

            // 3. Decrypt
            setStatus('Decrypting video...');

            // We need to parse the metadata (accessControlConditions) from the file?
            // Usually `encryptFile` returns a zip with metadata.
            // BUT in `UploadForm`, we uploaded the *ciphertext* directly as a file.
            // We LOST the `accessControlConditions` and `dataToEncryptHash` unless we stored them!

            // CRITICAL ISSUE: `encryptFile` returns { ciphertext, dataToEncryptHash }.
            // We only uploaded `ciphertext`.
            // We NEED `dataToEncryptHash` and `accessControlConditions` to decrypt.

            // FIX (Temporary for Demo):
            // We will RECONSTRUCT the accessControlConditions (since they are hardcoded in UploadForm).
            // We still need `dataToEncryptHash`.
            // Wait, `encryptFile` (the helper) usually returns a zip if we use `encryptToZip`.
            // But we used `encryptFile` which returns raw parts.

            // Did we upload the hash?
            // In `UploadForm.tsx`:
            // `const blob = await (await fetch(data:application/octet-stream;base64,${ciphertext})).blob();`
            // We only uploaded ciphertext.

            // WITHOUT `dataToEncryptHash`, WE CANNOT DECRYPT.
            // Lit needs it to verify integrity.

            // STOPGAP:
            // We can't decrypt the *previously* uploaded videos.
            // We need to update `UploadForm` to upload a ZIP or store metadata.
            // OR, for this specific task, we might be stuck unless we change the upload format.

            // Let's assume for this step we will fix UploadForm to upload a JSON containing everything,
            // OR we use `encryptToZip` which handles this standardly.

            // Let's check `UploadForm` again.
            // It uploads `encryptedFile`.

            // I will implement `IpfsPlayer` assuming we have the metadata.
            // Since I can't change the past, I will update `UploadForm` to upload a ZIP in the next step.
            // For now, `IpfsPlayer` will fail for old videos.

            // Wait, `encryptFile` in `lib/lit.ts` returns `{ ciphertext, dataToEncryptHash }`.
            // If I change `UploadForm` to use `zipAndEncryptString` or similar, it's better.

            // Let's stick to the plan:
            // I will assume the file at `cid` is a JSON containing { ciphertext, dataToEncryptHash, accessControlConditions }.
            // This is the cleanest way.

            // So, `IpfsPlayer` expects a JSON file.
            // I will update `UploadForm` later to upload this JSON.

            const metadataResponse = await fetch(`https://gateway.lighthouse.storage/ipfs/${cid}`);
            const metadata = await metadataResponse.json();

            const { ciphertext, dataToEncryptHash, accessControlConditions: storedConditions } = metadata;

            const decryptedBytes = await lit.decryptFile(
                ciphertext,
                dataToEncryptHash,
                storedConditions,
                authSig,
                'ethereum'
            );

            const decryptedBlob = new Blob([decryptedBytes as any], { type: 'video/mp4' });
            const url = URL.createObjectURL(decryptedBlob);
            setVideoUrl(url);
            setStatus('Ready to play!');
            setLoading(false);

        } catch (err: any) {
            console.error('Decryption failed:', err);
            setError(err.message || 'Failed to decrypt video');
            setLoading(false);
        }
    };

    const checkNearNFT = async (viewerId: string) => {
        const contractId = 'contract.utick.testnet'; // Hardcoded for demo
        // Use local proxy to avoid CORS issues
        const rpcUrl = "/api/near-rpc";
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
                request_type: "call_function",
                finality: "final",
                account_id: contractId,
                method_name: "nft_supply_for_owner",
                args_base64: btoa(JSON.stringify({ account_id: viewerId }))
            }
        });

        try {
            const response = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body
            });
            const data = await response.json();

            if (data.error) {
                console.error("RPC Error:", data.error);
                return false;
            }

            const resultBytes = data.result.result;
            const resultString = String.fromCharCode(...resultBytes);
            const supply = JSON.parse(resultString);

            return Number(supply) > 0;
        } catch (e) {
            console.error("Check NFT Error:", e);
            return false;
        }
    };

    return (
        <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden relative group">
            {!videoUrl ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                    {loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>
                    ) : error ? (
                        <div className="text-center max-w-md">
                            <Lock className="h-12 w-12 mx-auto mb-4 text-red-500" />
                            <p className="text-red-400 font-semibold mb-2">Access Restricted</p>
                            <p className="text-sm text-slate-400 mb-4">{error}</p>
                            <Button onClick={handlePlay} variant="outline" className="border-red-500/50 hover:bg-red-500/10">
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <Lock className="h-12 w-12 mx-auto mb-4 text-primary" />
                            <h3 className="text-xl font-bold mb-2">Encrypted Content</h3>
                            <p className="text-sm text-slate-400 mb-6">
                                This video is encrypted. You need to sign in and own the NFT to watch.
                            </p>
                            <Button onClick={handlePlay} size="lg" className="gap-2">
                                <Play className="h-5 w-5" />
                                Decrypt & Play
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full h-full"
                    autoPlay
                />
            )}
        </div>
    );
}
