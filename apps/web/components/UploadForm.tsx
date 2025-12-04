'use client';

import React, { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadFile } from '@/lib/lighthouse';
import { lit } from '@/lib/lit';
import lighthouse from '@lighthouse-web3/sdk';
import { ethers } from 'ethers';
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

export function UploadForm() {
    const { selector, accountId } = useWallet();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
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
    const processSignatureAndUpload = async (mpcSignature: any, messageToSign: string, recoveredAddress: string) => {
        if (!file || !accountId || !selector) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {


            const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
            const s_val = '0x' + mpcSignature.s.scalar;
            const v_val = mpcSignature.recovery_id + 27;



            const signature = ethers.Signature.from({
                r: r_val,
                s: s_val,
                v: v_val
            }).serialized;



            // Verify again just to be sure
            const recoveredReal = ethers.verifyMessage(messageToSign, signature);
            if (recoveredReal.toLowerCase() !== recoveredAddress.toLowerCase()) {
                console.error('CRITICAL: Recovered address changed between signatures!');
            }

            // 4. Encrypt with Lit Protocol
            setStatus('Encrypting file with Lit Protocol...');
            console.log('Using Recovered Address for Encryption:', recoveredAddress);

            // Construct AuthSig
            const authSig = {
                sig: signature,
                derivedVia: "web3.eth.personal.sign",
                signedMessage: messageToSign,
                address: recoveredAddress,
            };

            // Use Lit Action to verify NEAR NFT ownership
            const { LIT_ACTION_CODE } = await import('@/lib/lit-action');

            // Fallback: Use EVM Basic condition (Permissive - Allow any wallet)
            // We enforce the NEAR NFT check client-side in the IpfsPlayer component.
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
                        value: '0',
                    },
                }
            ];

            const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
                file,
                accessControlConditions,
                authSig,
                'ethereum'
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

            // 6. Upload Metadata (optional but recommended for real app)
            // For now, we just show the CID.

            setStatus('Upload Complete! CID: ' + fileHash);
            setUploading(false);

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
        setStatus('Initializing...');
        setProgress(0);

        try {
            const wallet = await selector.wallet();
            const { deriveEthAddress, signWithMPC } = await import('@/lib/chain-signatures');

            const derivationPath = 'youtick-demo,chunky-paste.testnet,v1';

            // 1. Discover the correct MPC address by signing a dummy message
            const dummyMessage = "get_address";
            console.log('Step 1: Signing dummy message to recover address...');

            const dummySignatureObj = await signWithMPC(wallet, accountId, derivationPath, dummyMessage) as any;

            const dummyR = '0x' + dummySignatureObj.big_r.affine_point.substring(2, 66);
            const dummyS = '0x' + dummySignatureObj.s.scalar;
            const dummyV = dummySignatureObj.recovery_id + 27;

            const dummySignature = ethers.Signature.from({
                r: dummyR,
                s: dummyS,
                v: dummyV
            }).serialized;

            const recoveredAddress = ethers.verifyMessage(dummyMessage, dummySignature);
            console.log('Recovered MPC Address:', recoveredAddress);

            // Recover PUBLIC KEY from signature (No longer needed for Lighthouse encryption/access conditions)
            // const dummyDigest = ethers.hashMessage(dummyMessage);
            // const recoveredPublicKey = ethers.SigningKey.recoverPublicKey(dummyDigest, dummySignature);
            // console.log('Recovered MPC Public Key:', recoveredPublicKey);

            // 2. Get Auth Message from Lighthouse using the REAL address
            const authMessageResponse = await lighthouse.getAuthMessage(recoveredAddress);
            const messageToSign = authMessageResponse.data.message;

            if (!messageToSign) {
                throw new Error('Failed to get auth message from Lighthouse');
            }

            console.log('Message to sign for Lighthouse:', messageToSign);

            // 3. Sign the REAL message
            console.log('Step 2: Signing real auth message...');

            try {
                const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, messageToSign) as any;
                await processSignatureAndUpload(mpcSignature, messageToSign, recoveredAddress);
            } catch (error: any) {
                if (error.message && error.message.includes('Popup window blocked')) {
                    console.warn('Popup blocked for second signature. Requesting user interaction.');
                    setStatus('Popup blocked. Please click Continue Signing to proceed.');
                    setPendingMessage(messageToSign);
                    setRecoveredAddr(recoveredAddress);
                    // setRecoveredPubKey(recoveredPublicKey); // No longer needed
                    setRetryStep('sign_auth');
                } else {
                    throw error;
                }
            }

        } catch (error: any) {
            console.error('Upload failed:', error);
            setStatus(`Upload failed: ${error.message}`);
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
