'use client';

import React, { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadFile } from '@/lib/lighthouse';
import { lit, LIT_ACTION_CID } from '@/lib/lit';
import { SessionManager } from '@/lib/session-manager';
import { batchUploadActions } from '@/lib/batch-transactions';
import { generateVideoThumbnail } from '@/lib/video-utils';
import lighthouse from '@lighthouse-web3/sdk';
import { ethers } from 'ethers';
import { transactions, utils } from 'near-api-js';
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { useLanguage } from '@/components/providers/LanguageContext';

interface UploadResponse {
    data: Array<{ Hash: string }> | { Hash: string };
}

interface MPCSignature {
    big_r: { affine_point: string };
    s: { scalar: string };
    recovery_id: number;
}

export function UploadForm() {
    const { t } = useLanguage();
    const { selector, accountId } = useWallet();
    const [file, setFile] = useState<File | null>(null);
    const [thumbnail, setThumbnail] = useState<Blob | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('0'); // Default 0 NEAR
    const [progress, setProgress] = useState(0);

    // Upload steps tracking
    const [uploadSteps, setUploadSteps] = useState([
        { id: 'session', label: 'Session & Gas Setup', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'address', label: 'Address Recovery', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'thumbnail', label: 'Thumbnail Upload', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'encrypt', label: 'File Encryption', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'upload', label: 'IPFS Upload (Lighthouse)', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },

        { id: 'mint', label: 'Payment & Blockchain Mint', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' }
    ]);

    // Retry state for popup blocked scenarios
    const [retryStep, setRetryStep] = useState<'none' | 'sign_auth'>('none');
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [recoveredAddr, setRecoveredAddr] = useState<string | null>(null);
    const [recoveredPubKey, setRecoveredPubKey] = useState<string | null>(null);
    const [verifiedStorageFee, setVerifiedStorageFee] = useState<string>('0');

    // Cost Receipt State
    const [estimatedStorageFee, setEstimatedStorageFee] = useState('0');
    const [currentBalance, setCurrentBalance] = useState('0');
    const [payAmount, setPayAmount] = useState('0');
    const [isCalculatingCosts, setIsCalculatingCosts] = useState(false);

    // Helper function to update step status
    const updateStep = (stepId: string, status: 'pending' | 'loading' | 'complete' | 'error') => {
        setUploadSteps(prev => prev.map(step =>
            step.id === stepId ? { ...step, status } : step
        ));
    };

    // Check Lighthouse connection on mount
    // Check gas status on mount/account change
    React.useEffect(() => {
        // Cleanup thumbnail preview URL on unmount
        return () => {
            if (thumbnailPreview) {
                URL.revokeObjectURL(thumbnailPreview);
            }
        };
    }, []);

    React.useEffect(() => {
        if (accountId && selector) {
            checkGasStatus();
        }
    }, [accountId, selector]);

    const checkGasStatus = async () => {
        if (!accountId) return;
        setIsCalculatingCosts(true);
        try {
            const sessionManager = new SessionManager(accountId);
            if (!selector) return;

            const nodeUrl = selector.options.network.nodeUrl;
            const balanceVal = await sessionManager.getAccountBalance(nodeUrl);
            setCurrentBalance(balanceVal.toString());

            recalculatePayAmount(estimatedStorageFee, balanceVal);

        } catch (e) {
            console.error("Error checking gas:", e);
        } finally {
            setIsCalculatingCosts(false);
        }
    };

    const recalculatePayAmount = (feeStr: string, balance: number) => {
        const fee = parseFloat(feeStr) || 0;
        // Total needed = Storage Fee + 0.3 NEAR Buffer (enough for 1 MPC signature)
        const totalNeeded = fee + 0.3;

        let toPay = totalNeeded - balance;
        if (toPay < 0) toPay = 0;

        // Format to 4 decimals to avoid weird floats
        setPayAmount(toPay > 0 ? toPay.toFixed(4) : '0');
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];

            setFile(selectedFile);

            // Calculate estimated storage fee immediately
            try {
                const { getNearPrice, calculateStorageFee } = await import('@/lib/price');
                const nearPrice = await getNearPrice();
                const fee = calculateStorageFee(selectedFile.size, nearPrice);
                setEstimatedStorageFee(fee);

                // Recalculate pay amount with new fee
                recalculatePayAmount(fee, parseFloat(currentBalance));

            } catch (err) {
                console.error("Error calculating fee:", err);
            }

            // Generate thumbnail
            if (selectedFile.type.startsWith('video/')) {
                try {
                    setStatus('Generating thumbnail...');
                    const thumbBlob = await generateVideoThumbnail(selectedFile);
                    setThumbnail(thumbBlob);

                    const previewUrl = URL.createObjectURL(thumbBlob);
                    setThumbnailPreview(previewUrl);
                    setStatus('');
                } catch (error) {
                    console.error('Thumbnail generation failed:', error);
                    setStatus('⚠️ Could not generate thumbnail');
                }
            }
        }
    };

    // Helper function to process the signature and continue with upload/access conditions/minting
    const processSignatureAndUpload = async (mpcSignature: MPCSignature, messageToSign: string, lighthouseEthAddress: string, storageFee: string) => {
        if (!file || !accountId || !selector) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            const wallet = await selector.wallet();

            // 0. Upload Thumbnail first (Public)
            let thumbnailCid = 'bafkreid7q4s23333333333333333333333333333333333333333333333'; // Default placeholder
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading thumbnail...');
                const thumbFile = new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" });
                const thumbUpload = await uploadFile(thumbFile) as UploadResponse;

                const thumbHash = Array.isArray(thumbUpload.data)
                    ? thumbUpload.data[0].Hash
                    : thumbUpload.data.Hash;

                if (thumbHash) {
                    thumbnailCid = thumbHash;
                    console.log('Thumbnail uploaded CID:', thumbnailCid);
                    updateStep('thumbnail', 'complete');
                } else {
                    updateStep('thumbnail', 'complete');
                }
            } else {
                updateStep('thumbnail', 'complete');
            }

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
            updateStep('encrypt', 'loading');
            setStatus('Encrypting file with Lit Protocol...');

            // 4. Encrypt file with Lit Protocol
            // Generate a UUID to serve as the Content Identifier for Access Control
            // This UUID will be stored in the contract's video_metadata.encrypted_cid field (repurposing it as an ID key)
            // The Real IPFS CID will be stored in the Title for now.
            const videoUuid = crypto.randomUUID();
            console.log("Generated Video UUID for Access Control:", videoUuid);

            // Use Lit Action to check NEAR NFT ownership on-chain
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

            // Store nearAccountId and targetCid for later use in decryption
            // These will be passed as jsParams to the Lit Action
            const litActionParams = {
                targetCid: videoUuid,
                nearAccountId: accountId
            };
            console.log("Lit Action params for decryption:", litActionParams);

            const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
                file,
                accessControlConditions,
                undefined, // No authSig needed if using sessionSigs
                'ethereum', // Chain for encryption (Lit uses ETH signatures usually)
                sessionSignatures
            );

            updateStep('encrypt', 'complete');
            updateStep('upload', 'loading');
            setStatus('Uploading encrypted backup to IPFS...');

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

            updateStep('upload', 'complete');
            setStatus('Upload Complete! CID: ' + fileHash);


            // 6. Mint NFT + Create Event + Pay Fee (BATCH - Single Signature!)
            updateStep('mint', 'loading');
            setStatus(`Paying Fee (${storageFee} NEAR) & Minting NFT...`);
            try {
                // Construct Title with RealCID for Player to parse
                // Schema: "RealCID:::ThumbnailCID:::Title"
                // This allows us to retrieve the thumbnail in get_events lookup without finding the NFT
                const eventTitle = `${fileHash}:::${thumbnailCid}:::${title || file.name}`;

                // Construct full IPFS Gateway URL for media
                const mediaUrl = `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`;

                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';
                const priceYocto = utils.format.parseNearAmount(price) || '0';

                // Prepare metadata for batch transaction
                const videoMetadata = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: eventTitle,
                        description: description || 'Uploaded via Youtick',
                        media: mediaUrl,
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: videoUuid, // The UUID
                        livepeer_playback_id: '', // Not used - kept for contract compatibility
                        duration_seconds: 0,
                        content_type: 'Exclusive'
                    }
                };

                // Debug: Log what we're sending to contract
                console.log('📝 Video metadata being sent to contract:', videoMetadata);

                const eventMetadata = {
                    encrypted_cid: videoUuid, // Key is UUID
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto,
                    livepeer_playback_id: '' // Not used - kept for contract compatibility
                };

                // Use batch transaction - ONE SIGNATURE for both mint and create_event!
                setStatus('Sign to Mint NFT & Create Event (1 signature)...');

                await batchUploadActions(
                    wallet,
                    contractId,
                    accountId,
                    videoMetadata,
                    eventMetadata
                );

                updateStep('mint', 'complete');
                setStatus('Success! Video Uploaded & Ticket Sales Started!');

            } catch (mintError: any) {
                console.error('Minting/Event failed:', mintError);
                updateStep('mint', 'error');
                setStatus(`Upload success, but Blockchain actions failed: ${mintError.message}`);
            }

            // 7. Auto-Refund Excess Gas - DISABLED
            // Excess gas remains in contract as per user request.
            setStatus('Success! Video Uploaded & Ticket Sales Started!');

            setUploading(false);

            // Clear form
            setFile(null);
            setTitle('');
            setDescription('');
            setThumbnail(null);
            setThumbnailPreview(null);

        } catch (error: any) {
            console.error('Upload failed:', error);
            // Mark current loading step as error
            const currentStep = uploadSteps.find(s => s.status === 'loading');
            if (currentStep) {
                updateStep(currentStep.id, 'error');
            }
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

            await processSignatureAndUpload(mpcSignature, pendingMessage, recoveredAddr, verifiedStorageFee);
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
        setStatus('Initializing Upload...');
        setProgress(0);

        // Reset all steps to pending
        setUploadSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));

        try {
            const wallet = await selector.wallet();

            // --- STEP 1: CALCULATE STORAGE FEE (Deferred Payment) ---
            setStatus('Calculating Storage Fee...');

            const { getNearPrice, calculateStorageFee } = await import('@/lib/price');
            const nearPrice = await getNearPrice();
            const storageFee = calculateStorageFee(file.size, nearPrice);
            setVerifiedStorageFee(storageFee);

            console.log(`Video Size: ${file.size} bytes. Price: $${nearPrice}/NEAR. Fee: ${storageFee} NEAR`);



            // 0. CHECK Session & PAY UPFRONT (Consolidated)
            const sessionManager = new SessionManager(accountId);
            updateStep('session', 'loading');
            setStatus('Checking Session & Fees...');

            const hasKey = await sessionManager.hasSessionKey();
            const toPayVal = parseFloat(payAmount);

            if (!hasKey) {
                // Case 1: No Session Key.
                // We must creating a key. We can bundle the deposit (Storage Fee + Buffer) with this.
                // If payAmount is 0 (unlikely if no key, but possible if contract has balance but key was lost), default to '1' for safety.
                const depositAmount = toPayVal > 0 ? payAmount : '1';

                setStatus(`Setting up Session Key & Depositing ${depositAmount} NEAR...`);
                console.log(`Creating Session Key + Deposit: ${depositAmount} NEAR`);
                await sessionManager.createSessionKey(wallet, depositAmount);

                // If successful, update local balance
                if (toPayVal > 0) {
                    setCurrentBalance((parseFloat(currentBalance) + parseFloat(depositAmount)).toString());
                    setPayAmount('0');
                }

            } else {
                // Case 2: Session Key Exists.
                // Just check if we need to top up.
                if (toPayVal > 0) {
                    setStatus(`Funding Prepaid Storage & Gas (${payAmount} NEAR)...`);
                    console.log(`TopUp Gas: ${payAmount} NEAR`);
                    await sessionManager.topUpGas(wallet, payAmount);

                    // Update local balance
                    setCurrentBalance((parseFloat(currentBalance) + toPayVal).toString());
                    setPayAmount('0');
                }
            }
            updateStep('session', 'complete');

            const { deriveEthAddress } = await import('@/lib/chain-signatures');
            const derivationPath = 'youtick-demo,chunky-paste.testnet,v1';

            // 1. Get MPC address using mathematical derivation (no MPC call needed!)
            updateStep('address', 'loading');
            setStatus('Deriving MPC Address...');

            const recoveredAddress = await deriveEthAddress(accountId, derivationPath);
            console.log('Derived MPC Address (mathematical):', recoveredAddress);
            updateStep('address', 'complete');

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

            await processSignatureAndUpload(mpcSignature, messageToSign, recoveredAddress, storageFee);

        } catch (error: any) {
            console.error('Upload failed:', error);
            setStatus(`Upload failed: ${error.message} `);
            setUploading(false);
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

                {/* LEFT COLUMN: FORM INPUTS */}
                <Card className="lg:col-span-3 order-2 lg:order-1">
                    <CardHeader>
                        <CardTitle>{t.upload_page.form_title}</CardTitle>
                        <CardDescription>{t.upload_page.form_desc}</CardDescription>
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
                                {t.upload_page.video_title}
                            </label>
                            <Input
                                id="video-title"
                                type="text"
                                placeholder={t.upload_page.video_title}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                disabled={uploading || !accountId}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="video-description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t.upload_page.video_desc}
                            </label>
                            <Textarea
                                id="video-description"
                                placeholder={t.upload_page.video_desc}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={uploading || !accountId}
                                className="min-h-[100px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t.upload_page.price}
                            </label>
                            <Input
                                id="ticket-price"
                                type="number"
                                step="0.1"
                                placeholder="0"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                disabled={uploading || !accountId}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t.upload_page.file}
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

                    {/* Cost Receipt Section */}
                    {file && (
                        <div className="px-6 pb-2">
                            <CostReceipt
                                storageFee={estimatedStorageFee}
                                currentBalance={currentBalance}
                                payAmount={payAmount}
                                loading={isCalculatingCosts}
                            />
                        </div>
                    )}

                    <CardFooter>
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || !file || !title || !description || !accountId}
                            className="w-full"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.upload_page.processing}
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {parseFloat(payAmount) > 0 ? t.upload_page.pay_and_upload : t.upload_page.upload_btn}
                                </>
                            )}
                        </Button>

                        {/* Manual Refund Button for Success State */}

                    </CardFooter>
                </Card>

                {/* RIGHT COLUMN: PREVIEW & INFO */}
                <div className="lg:col-span-2 space-y-6 sticky top-24 order-1 lg:order-2">
                    <div>
                        <h3 className="text-sm font-medium mb-3 text-muted-foreground">{t.upload_page.preview_title}</h3>
                        <div className="relative group overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl transition-all hover:border-zinc-600">
                            {/* Image Container */}
                            <div className="aspect-video relative bg-zinc-950">
                                {thumbnailPreview ? (
                                    <img
                                        src={thumbnailPreview}
                                        alt="Ticket Preview"
                                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
                                        <div className="text-zinc-700 font-mono text-xs">{t.upload_page.no_media}</div>
                                    </div>
                                )}

                                {/* Overlay Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-90" />

                                {/* Play Button Icon */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-full border border-white/20">
                                        <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                                    </div>
                                </div>

                                {/* Badge */}
                                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">{t.upload_page.exclusive}</span>
                                </div>
                            </div>

                            {/* Content Details */}
                            <div className="p-5 relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-white text-lg leading-tight line-clamp-1">
                                        {title || t.upload_page.untitled}
                                    </h4>
                                </div>

                                <p className="text-xs text-zinc-400 line-clamp-2 mb-4 min-h-[2.5em]">
                                    {description || t.upload_page.no_desc}
                                </p>

                                {/* Footer Info */}
                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                                            {accountId ? accountId.substring(0, 2).toUpperCase() : "??"}
                                        </div>
                                        <span className="text-xs text-zinc-400 font-medium truncate max-w-[100px]">
                                            {accountId || t.upload_page.connect_wallet}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{t.upload_page.price_label}</span>
                                        <span className="text-sm font-bold text-white">{price} NEAR</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* Upload Progress Steps - Only show when uploading */}
                    {uploading && (
                        <div className="p-5 bg-zinc-900/50 rounded-xl border border-white/5">
                            <h3 className="text-sm font-semibold mb-4 text-zinc-300">{t.upload_page.progress_title}</h3>
                            <div className="space-y-3">
                                {uploadSteps.map((step, index) => (
                                    <div key={step.id} className="flex items-center gap-3">
                                        {/* Status Icon */}
                                        <div className="flex-shrink-0">
                                            {step.status === 'pending' && (
                                                <div className="w-6 h-6 rounded-full border-2 border-zinc-700 flex items-center justify-center">
                                                    <span className="text-[10px] text-zinc-600">{index + 1}</span>
                                                </div>
                                            )}
                                            {step.status === 'loading' && (
                                                <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center animate-spin">
                                                    <Loader2 className="w-3 h-3 text-blue-500" />
                                                </div>
                                            )}
                                            {step.status === 'complete' && (
                                                <div className="w-6 h-6 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                                </div>
                                            )}
                                            {step.status === 'error' && (
                                                <div className="w-6 h-6 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                                                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Step Label */}
                                        <div className="flex-1">
                                            <p className={`text-sm font-medium ${step.status === 'complete' ? 'text-green-400' :
                                                step.status === 'loading' ? 'text-blue-400' :
                                                    step.status === 'error' ? 'text-red-400' :
                                                        'text-zinc-500'
                                                }`}>
                                                {(t.upload_page.steps as any)[step.id]}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-white/5 text-xs text-slate-500 dark:text-slate-400">
                        <p className="font-semibold mb-2 text-zinc-300">{t.upload_page.how_it_works_title}</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>{t.upload_page.how_it_works_step1}</li>
                            <li>{t.upload_page.how_it_works_step2}</li>
                            <li>{t.upload_page.how_it_works_step3}</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
