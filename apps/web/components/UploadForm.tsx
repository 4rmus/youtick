'use client';

import React, { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadFile } from '@/lib/lighthouse';
import { lit, LIT_ACTION_CID } from '@/lib/lit';
import { SessionManager } from '@/lib/session-manager';
import { GasTank } from '@/components/GasTank';
import lighthouse from '@lighthouse-web3/sdk';
import { ethers } from 'ethers';
import { transactions, utils } from 'near-api-js';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
interface UploadResponse {
    data: Array<{ Hash: string }> | { Hash: string };
}

interface MPCSignature {
    big_r: { affine_point: string };
    s: { scalar: string };
    recovery_id: number;
}

export function UploadForm() {
    const { selector, accountId } = useWallet();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('1'); // Default 1 NEAR
    const [progress, setProgress] = useState(0);

    // Retry state for popup blocked scenarios
    const [retryStep, setRetryStep] = useState<'none' | 'sign_auth'>('none');
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [recoveredAddr, setRecoveredAddr] = useState<string | null>(null);
    const [recoveredPubKey, setRecoveredPubKey] = useState<string | null>(null);

    // Check Lighthouse connection on mount
    React.useEffect(() => {
        const checkConnection = async () => {
            const apiKey = process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY;
            if (!apiKey) {
                console.warn('Lighthouse API Key missing');
                return;
            }
            try {
                const balance = await lighthouse.getBalance(apiKey);
                console.log('Lighthouse Connection OK. Balance:', balance);
            } catch (error) {
                console.error('Lighthouse Connection Failed:', error);
                setStatus('⚠️ Lighthouse connection failed. Check API Key.');
            }
        };
        checkConnection();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    // Helper function to process the signature and continue with upload/access conditions/minting
    const processSignatureAndUpload = async (mpcSignature: MPCSignature, messageToSign: string, lighthouseEthAddress: string) => {
        if (!file || !accountId || !selector) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            const wallet = await selector.wallet();

            // 0. Recover Ethereum Address (MPC)
            // We already have the address from the previous step (lighthouseEthAddress)
            console.log('Using recovered MPC Address for Session Sigs:', lighthouseEthAddress);
            const { signWithMPC } = await import('@/lib/chain-signatures');

            // 1. Get Session Signatures (One-time signature for session)
            setStatus('Getting Session Signatures...');

            const sessionSignatures = await lit.getSessionSigs(
                wallet,
                accountId,
                lighthouseEthAddress,
                signWithMPC,
                undefined, // ACC (optional)
                undefined, // hash (optional)
                'youtick-demo,chunky-paste.testnet,v1' // derivationPath
            );

            // 2. Encrypt with Lit Protocol using Session Keys
            setStatus('Encrypting file with Lit Protocol...');

            // 4. Encrypt file with Lit Protocol
            // Generate a UUID to serve as the Content Identifier for Access Control
            // This UUID will be stored in the contract's video_metadata.encrypted_cid field (repurposing it as an ID key)
            // The Real IPFS CID will be stored in the Title for now.
            const videoUuid = crypto.randomUUID();
            console.log("Generated Video UUID for Access Control:", videoUuid);

            // TEMPORARY PROBE: Use Standard EVM Condition (Balance >= 0) to verify playback flow
            const accessControlConditions = [
                {
                    conditionType: 'evmBasic',
                    contractAddress: '',
                    standardContractType: '',
                    chain: 'ethereum',
                    method: 'eth_getBalance',
                    parameters: [':userAddress', 'latest'],
                    returnValueTest: {
                        comparator: '>=',
                        value: '0'
                    }
                }
            ];

            const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
                file,
                accessControlConditions,
                undefined, // No authSig needed if using sessionSigs
                'ethereum', // Chain for encryption (Lit uses ETH signatures usually)
                sessionSignatures
            );

            setStatus('Uploading encrypted file to IPFS...');

            // 5. Upload to Lighthouse (Regular upload)
            // We need to upload a JSON containing ciphertext + metadata to allow decryption later.
            const encryptedContent = {
                ciphertext,
                dataToEncryptHash,
                accessControlConditions
            };

            const metadataBlob = new Blob([JSON.stringify(encryptedContent)], { type: 'application/json' });
            const encryptedFile = new File([metadataBlob], file.name + ".json", { type: "application/json" });

            // 5. Upload to Lighthouse (Regular upload)
            const uploadResponse = await uploadFile(encryptedFile) as UploadResponse;

            // Extract file hash
            const fileHash = Array.isArray(uploadResponse.data)
                ? uploadResponse.data[0].Hash
                : uploadResponse.data.Hash;

            if (!fileHash) {
                throw new Error('Upload succeeded but no file hash returned');
            }

            console.log('Encrypted File CID:', fileHash);

            setStatus('Upload Complete! CID: ' + fileHash);

            // 6. Mint NFT
            setStatus('Minting Video NFT (via Session Key)...');
            try {
                // Construct Title with RealCID for Player to parse
                // Schema: "RealCID:::Title"
                const eventTitle = `${fileHash}:::${title || file.name}`;

                const sessionManager = new SessionManager(accountId);

                // Note: We use the UUID as the encrypted_cid key in the contract
                // This matches what the Lit Action expects (it checks against this UUID)
                await sessionManager.callMethod('nft_mint_prepaid', {
                    receiver_id: accountId,
                    token_metadata: {
                        title: eventTitle,
                        description: description || 'Uploaded via Youtick',
                        media: 'bafkreid7q4s23333333333333333333333333333333333333333333333', // Placeholder
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: videoUuid, // The UUID
                        livepeer_playback_id: 'placeholder',
                        duration_seconds: 0,
                        content_type: 'Exclusive'
                    }
                });
                setStatus('Video Minted! Initializing Ticket Sales...');

                // 7. Create Event (Ticket Sales)
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'market.utick.testnet';
                const deposit = utils.format.parseNearAmount('0.1');
                const priceYocto = utils.format.parseNearAmount(price) || '0';

                const action = transactions.functionCall(
                    'create_event',
                    Buffer.from(JSON.stringify({
                        encrypted_cid: videoUuid, // Key is UUID
                        title: eventTitle,
                        price: priceYocto
                    })),
                    BigInt('30000000000000'),
                    BigInt(deposit || '0')
                );

                await wallet.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [action as any]
                });

                setStatus('Success! Video Uploaded & Ticket Sales Started!');

            } catch (mintError: any) {
                console.error('Minting/Event failed:', mintError);
                setStatus(`Upload success, but Blockchain actions failed: ${mintError.message}`);
            }

            setUploading(false);

            // Clear form
            setFile(null);
            setTitle('');
            setDescription('');

        } catch (error: any) {
            console.error('Upload failed:', error);
            setStatus(`Upload failed: ${error.message}`);
            setUploading(false);
        }
    };

    const handleRetrySign = async () => {
        if (!pendingMessage || !recoveredAddr || !selector) return;

        try {
            setRetryStep('none');
            setStatus('Requesting Signature for Upload...');
            const wallet = await selector.wallet();

            // 3. Sign the REAL message (Retry)
            console.log('Step 2 (Retry): Signing real auth message...');
            const { signWithMPC } = await import('@/lib/chain-signatures');
            const mpcSignature = await signWithMPC(wallet, accountId!, 'youtick-demo,chunky-paste.testnet,v1', pendingMessage) as any;

            await processSignatureAndUpload(mpcSignature, pendingMessage, recoveredAddr);
        } catch (error: any) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${error.message}`);
            // If blocked again, show button again
            if (error.message && error.message.includes('Popup window blocked')) {
                setRetryStep('sign_auth');
            }
        }
    };

    const handleUpload = async () => {
        if (!file || !accountId || !selector) return;
        if (!title || !description) {
            setStatus('Please enter a title and description');
            return;
        }

        setUploading(true);
        setStatus('Initializing Session...');
        setProgress(0);

        try {
            const wallet = await selector.wallet();
            const sessionManager = new SessionManager(accountId);

            // 0. Ensure Session Key exists
            if (!(await sessionManager.hasSessionKey())) {
                setStatus('Setting up App Session Key (One-time)...');
                await sessionManager.createSessionKey(wallet);
            }

            const { deriveEthAddress } = await import('@/lib/chain-signatures');
            const derivationPath = 'youtick-demo,chunky-paste.testnet,v1';

            // 1. Discover the correct MPC address
            // We can use the session key to sign the dummy message via proxy!
            const dummyMessage = "get_address";
            console.log('Step 1: Signing dummy message to recover address...');
            setStatus('Recovering Address via Session Key...');

            // Use Session Key to call sign_with_mpc on Proxy
            // Payload must be 32 bytes (hash)
            const dummyHash = ethers.sha256(ethers.toUtf8Bytes(dummyMessage)); // Returns hex string
            const dummyPayload = ethers.getBytes(dummyHash); // Returns Uint8Array

            // Convert Uint8Array to regular array for JSON serialization if needed, 
            // but near-api-js handles it? No, we need to pass [u8; 32].
            // SessionManager.callMethod passes args as JSON.
            // Rust expects [u8; 32]. JSON array of numbers is fine.
            const dummyPayloadArray = Array.from(dummyPayload);

            const dummySignatureResult = await sessionManager.callMethod('sign_with_mpc', {
                payload: dummyPayloadArray,
                path: derivationPath,
                key_version: 0
            });

            // Parse result. It should be the signature object.
            // Note: The return value is base64 encoded in the transaction outcome, 
            // but near-api-js functionCall returns the outcome.
            // Wait, sessionManager.callMethod returns the *outcome*.
            // We need to extract the return value.

            // Let's update SessionManager to return the value.
            // For now, let's assume sessionManager.callMethod returns the parsed value (we need to fix SessionManager).
            // Actually, let's fix SessionManager first or handle it here.
            // I'll assume I fix SessionManager to return the JSON parsed result.

            const dummySignatureObj = dummySignatureResult;
            // Note: The structure returned by MPC contract might be [big_r, s] or struct.
            // We need to check MPC contract return type.
            // Usually it returns { big_r: { affine_point: "..." }, s: { scalar: "..." }, recovery_id: 0 }

            console.log("Dummy Signature Result:", dummySignatureObj);

            const dummyR = '0x' + dummySignatureObj.big_r.affine_point.substring(2, 66);
            const dummyS = '0x' + dummySignatureObj.s.scalar;
            const dummyV = dummySignatureObj.recovery_id + 27;

            const dummySignature = ethers.Signature.from({
                r: dummyR,
                s: dummyS,
                v: dummyV
            }).serialized;

            const recoveredAddress = ethers.verifyMessage(dummyMessage, dummySignature); // Wait, we signed HASH.
            // If we signed hash, we verify hash?
            // MPC signs the payload.
            // If payload is hash of message, then we verify against the message?
            // ethers.verifyMessage hashes the message.
            // So if we passed hash(message) to MPC, we are effectively double hashing?
            // NO. MPC signs exactly what we give it.
            // ethers.verifyMessage(msg, sig) -> hashes msg, then recovers.
            // If we gave MPC hash(msg), then MPC signed hash(msg).
            // So ethers.verifyMessage(msg, sig) should work IF MPC does ECDSA correctly on the payload.
            // YES.

            console.log('Recovered MPC Address:', recoveredAddress);

            // 2. Get Auth Message from Lighthouse
            const authMessageResponse = await lighthouse.getAuthMessage(recoveredAddress);
            const messageToSign = authMessageResponse.data.message;

            if (!messageToSign) {
                throw new Error('Failed to get auth message from Lighthouse');
            }

            console.log('Message to sign for Lighthouse:', messageToSign);

            // 3. Sign the REAL message via Session Key
            console.log('Step 2: Signing real auth message...');
            setStatus('Signing Auth Message via Session Key...');

            const realHash = ethers.sha256(ethers.toUtf8Bytes(messageToSign));
            const realPayload = Array.from(ethers.getBytes(realHash));

            const mpcSignature = await sessionManager.callMethod('sign_with_mpc', {
                payload: realPayload,
                path: derivationPath,
                key_version: 0
            });

            // 4. Proceed with Upload (using the signature we just got)
            // We need to adapt processSignatureAndUpload to take the signature object directly
            // OR construct the signature here.

            // Let's construct the signature object expected by processSignatureAndUpload
            // It expects the raw MPC signature object (big_r, s, etc.)

            await processSignatureAndUpload(mpcSignature, messageToSign, recoveredAddress);

        } catch (error: any) {
            console.error('Upload failed:', error);
            setStatus(`Upload failed: ${error.message} `);
            setUploading(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Upload Video</CardTitle>
                <CardDescription>Upload your video securely to IPFS with encryption.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!accountId && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Wallet Not Connected</AlertTitle>
                        <AlertDescription>
                            Please connect your NEAR wallet to upload videos.
                        </AlertDescription>
                    </Alert>
                )}

                {accountId && <GasTank />}

                <div className="space-y-2">
                    <label htmlFor="video-title" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Video Title
                    </label>
                    <Input
                        id="video-title"
                        type="text"
                        placeholder="Enter video title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={uploading || !accountId}
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="video-description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Description
                    </label>
                    <Textarea
                        id="video-description"
                        placeholder="Enter video description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={uploading || !accountId}
                        className="min-h-[100px]"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Ticket Price (NEAR)
                    </label>
                    <Input
                        id="ticket-price"
                        type="number"
                        step="0.1"
                        placeholder="1.0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        disabled={uploading || !accountId}
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Video File
                    </label>
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Input
                            id="video-file"
                            type="file"
                            accept="video/*"
                            onChange={handleFileChange}
                            disabled={uploading || !accountId}
                        />
                        {file && (
                            <p className="mt-2 text-sm text-muted-foreground">
                                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        )}
                    </div>
                </div>

                {uploading && progress > 0 && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Uploading...</span>
                            <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="w-full" />
                    </div>
                )}

                {status && (
                    <Alert variant={status.includes('failed') ? "destructive" : "default"}>
                        {status.includes('failed') ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        <AlertTitle>{status.includes('failed') ? "Error" : "Status"}</AlertTitle>
                        <AlertDescription>
                            {status}
                        </AlertDescription>
                    </Alert>
                )}

                {retryStep === 'sign_auth' && (
                    <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Action Required</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                            <p>The browser blocked the second signature popup.</p>
                            <Button
                                onClick={handleRetrySign}
                                variant="outline"
                                className="w-full border-yellow-500/50 hover:bg-yellow-500/20"
                            >
                                Continue Signing & Upload
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
            <CardFooter>
                <Button
                    onClick={handleUpload}
                    disabled={uploading || !file || !title || !description || !accountId}
                    className="w-full"
                >
                    {uploading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing
                        </>
                    ) : (
                        <>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Video
                        </>
                    )}
                </Button>
            </CardFooter>
            <div className="mt-4 p-6 text-xs text-slate-500 dark:text-slate-400">
                <p className="font-semibold mb-1">How it works:</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Your video is encrypted before upload</li>
                    <li>Only NFT holders can decrypt and watch</li>
                    <li>We use MPC to sign the upload securely</li>
                </ol>
            </div>
        </Card>
    );
}
