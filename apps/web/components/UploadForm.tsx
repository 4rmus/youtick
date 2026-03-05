'use client';

import React, { useState, useReducer } from 'react';
import Image from 'next/image';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadToCrust } from '@/lib/crust';
import { generateAESKey, encryptFileChunked, type VideoManifest } from '@/lib/kms/encryption';
import { storeEncryptionKey } from '@/lib/kms/client';
import { SessionManager } from '@/lib/session-manager';
import { batchUploadActionsSignless } from '@/lib/batch-transactions';
import { generateVideoThumbnail } from '@/lib/video-utils';
import { actions, nearToYocto } from 'near-api-js';
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useSessionState, useAccountBalance } from '@/lib/hooks/useSessionState';
import { NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { getNearPrice, usdToNear } from '@/lib/price';

const CONTRACT_ID = NEAR_CONFIG.contractId;

// ── Upload state reducer ──

import type { UploadStep } from '@/lib/types';

type StepStatus = UploadStep['status'];

const INITIAL_STEPS: UploadStep[] = [
    { id: 'session', label: 'Wallet & Balance', status: 'pending' },
    { id: 'thumbnail', label: 'Cover Image', status: 'pending' },
    { id: 'encrypt', label: 'Encrypting Video', status: 'pending' },
    { id: 'upload', label: 'Uploading to IPFS', status: 'pending' },
    { id: 'kms', label: 'Storing Encryption Key', status: 'pending' },
    { id: 'mint', label: 'Minting NFT Ticket', status: 'pending' },
];

// File size limits (KMS-based flow)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for paid
const MAX_FREE_FILE_SIZE = 100 * 1024 * 1024; // 100MB for free

interface UploadState {
    uploading: boolean;
    status: string;
    progress: number;
    steps: UploadStep[];
    retryStep: 'none' | 'sign_auth';
    verifiedStorageFee: string;
    estimatedStorageFee: string;
    payAmount: string;
}

const initialUploadState: UploadState = {
    uploading: false,
    status: '',
    progress: 0,
    steps: INITIAL_STEPS,
    retryStep: 'none',
    verifiedStorageFee: '0',
    estimatedStorageFee: '0',
    payAmount: '0',
};

type UploadAction =
    | { type: 'SET_UPLOADING'; payload: boolean }
    | { type: 'SET_STATUS'; payload: string }
    | { type: 'SET_PROGRESS'; payload: number }
    | { type: 'UPDATE_STEP'; payload: { id: string; status: StepStatus } }
    | { type: 'RESET_STEPS' }
    | { type: 'SET_RETRY_STEP'; payload: 'none' | 'sign_auth' }
    | { type: 'SET_VERIFIED_STORAGE_FEE'; payload: string }
    | { type: 'SET_ESTIMATED_STORAGE_FEE'; payload: string }
    | { type: 'SET_PAY_AMOUNT'; payload: string }
    | { type: 'RESET' };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
    switch (action.type) {
        case 'SET_UPLOADING':
            return { ...state, uploading: action.payload };
        case 'SET_STATUS':
            return { ...state, status: action.payload };
        case 'SET_PROGRESS':
            return { ...state, progress: action.payload };
        case 'UPDATE_STEP':
            return {
                ...state,
                steps: state.steps.map(step =>
                    step.id === action.payload.id ? { ...step, status: action.payload.status } : step
                ),
            };
        case 'RESET_STEPS':
            return { ...state, steps: INITIAL_STEPS.map(s => ({ ...s })) };
        case 'SET_RETRY_STEP':
            return { ...state, retryStep: action.payload };
        case 'SET_VERIFIED_STORAGE_FEE':
            return { ...state, verifiedStorageFee: action.payload };
        case 'SET_ESTIMATED_STORAGE_FEE':
            return { ...state, estimatedStorageFee: action.payload };
        case 'SET_PAY_AMOUNT':
            return { ...state, payAmount: action.payload };
        case 'RESET':
            return initialUploadState;
        default:
            return state;
    }
}

export function UploadForm() {
    const { t } = useLanguage();
    const { accountId, getWallet } = useWallet();

    // React Query hooks for session state (cached, deduplicated)
    const { hasSessionKey, refetchSessionKey } = useSessionState(accountId);
    const { data: balanceData, isLoading: isBalanceLoading, refetch: refetchBalance } = useAccountBalance(accountId);

    // Form fields
    const [file, setFile] = useState<File | null>(null);
    const [thumbnail, setThumbnail] = useState<Blob | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priceUsd, setPriceUsd] = useState(''); // USD amount (e.g. "5.00"), empty = free
    const [nearPrice, setNearPrice] = useState<number>(0); // NEAR/USD rate
    const [fileSizeError, setFileSizeError] = useState<string | null>(null);

    // Derived NEAR price from USD input
    const priceUsdNum = parseFloat(priceUsd) || 0;
    const priceNearDerived = nearPrice > 0 ? usdToNear(priceUsdNum, nearPrice) : 0;
    // Keep 'price' as NEAR string for backward compat with CostReceipt etc.
    const price = priceUsdNum > 0 ? priceNearDerived.toFixed(6) : '0';

    // Fetch NEAR/USD price on mount
    React.useEffect(() => {
        getNearPrice().then(setNearPrice);
    }, []);

    // Dynamic file size validation — re-checks when file or price changes
    React.useEffect(() => {
        if (!file) {
            setFileSizeError(null);
            return;
        }
        const isFree = priceUsdNum === 0;
        const limit = isFree ? MAX_FREE_FILE_SIZE : MAX_FILE_SIZE;
        if (file.size > limit) {
            setFileSizeError(isFree ? t.upload_page.file_too_large_free : t.upload_page.file_too_large_paid);
        } else {
            setFileSizeError(null);
        }
    }, [file, priceUsdNum, t]);

    // Upload state (consolidated)
    const [us, dispatch] = useReducer(uploadReducer, initialUploadState);

    // Convenience aliases for template readability
    const uploading = us.uploading;
    const status = us.status;
    const uploadSteps = us.steps;
    const retryStep = us.retryStep;
    const estimatedStorageFee = us.estimatedStorageFee;
    const payAmount = us.payAmount;
    const verifiedStorageFee = us.verifiedStorageFee;

    // Gas Top-Up State (derived from React Query)
    const gasBalance = parseFloat(balanceData || '0');

    // Helper functions that dispatch to reducer
    const updateStep = (stepId: string, stepStatus: StepStatus) => {
        dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, status: stepStatus } });
    };
    const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS', payload: msg });
    const setUploading = (val: boolean) => dispatch({ type: 'SET_UPLOADING', payload: val });

    // Track thumbnail preview for cleanup
    const thumbnailPreviewRef = React.useRef<string | null>(null);

    // Cleanup thumbnail preview URL on unmount
    React.useEffect(() => {
        return () => {
            if (thumbnailPreviewRef.current) {
                URL.revokeObjectURL(thumbnailPreviewRef.current);
            }
        };
    }, []);

    // Recalculate pay amount when storage fee changes
    React.useEffect(() => {
        const fee = parseFloat(estimatedStorageFee) || 0;
        // Exact prepaid costs: NFT mint (0.1) + Event (0.1)
        const totalNeeded = fee + 0.20;
        dispatch({ type: 'SET_PAY_AMOUNT', payload: totalNeeded > 0 ? totalNeeded.toFixed(4) : '0' });
    }, [estimatedStorageFee, price]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];

            setFile(selectedFile);

            // Calculate storage fee
            try {
                const { getNearPrice, calculateStorageFee } = await import('@/lib/price');
                const nearPrice = await getNearPrice();
                const fee = calculateStorageFee(selectedFile.size, nearPrice);
                dispatch({ type: 'SET_ESTIMATED_STORAGE_FEE', payload: fee });
            } catch (err) {
                console.error('[UploadForm] Error calculating storage fee:', err);
            }

            // Generate thumbnail
            if (selectedFile.type.startsWith('video/')) {
                try {
                    setStatus('Generating thumbnail...');
                    const thumbBlob = await generateVideoThumbnail(selectedFile);
                    setThumbnail(thumbBlob);

                    const previewUrl = URL.createObjectURL(thumbBlob);
                    thumbnailPreviewRef.current = previewUrl; // Track for cleanup
                    setThumbnailPreview(previewUrl);
                    setStatus('');
                } catch (error) {
                    console.error('Thumbnail generation failed:', error);
                    setStatus('⚠️ Could not generate thumbnail');
                }
            }
        }
    };

    // Main upload function using KMS + Crust
    const processSignatureAndUpload = async (storageFee: string, sessionManager: SessionManager) => {
        if (!file || !accountId) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            console.log('[DECENTRALIZATION_METRIC] upload_process_start', {
                accountId,
                storage: 'kms_aes_ctr_encryption'
            });

            // 0. Upload Thumbnail (Public) directly to Crust
            let thumbnailUrl: string | null = null;
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading cover image...');

                try {
                    const thumbResult = await uploadToCrust(
                        thumbnail,
                        accountId
                    );
                    // Use Crust gateway URL for thumbnail
                    thumbnailUrl = `https://crustipfs.xyz/ipfs/${thumbResult.cid}`;
                    updateStep('thumbnail', 'complete');
                } catch (thumbError) {
                    console.error('[Thumbnail] Upload failed:', thumbError);
                    // Continue without thumbnail
                    updateStep('thumbnail', 'complete');
                }
            } else {
                updateStep('thumbnail', 'complete');
            }

            // Generate a UUID to serve as the Access Control identifier
            const videoUuid = crypto.randomUUID();

            const isFreeVideo = parseFloat(price) === 0 || price === '';

            let videoCid: string;
            let manifestCid: string | undefined;

            if (isFreeVideo) {
                // Free video: no encryption, upload directly to Crust
                updateStep('encrypt', 'complete');
                updateStep('upload', 'loading');
                updateStep('kms', 'complete'); // No key to store for free videos
                setStatus('Uploading to IPFS...');

                const result = await uploadToCrust(file, accountId);
                videoCid = result.cid;
                updateStep('upload', 'complete');
            } else {
                // Paid video: AES-CTR encrypt → Crust upload → KMS key store
                updateStep('encrypt', 'loading');
                setStatus('Generating encryption key...');

                // 1. Generate AES-256-CTR key
                const aesKeyB64 = await generateAESKey();

                // 2. Encrypt file in chunks and collect results
                setStatus('Encrypting video (AES-256-CTR)...');
                const encryptedChunks: Uint8Array[] = [];
                let manifest: VideoManifest | undefined;

                for await (const { chunk, manifest: m } of encryptFileChunked(file, aesKeyB64)) {
                    encryptedChunks.push(chunk.data);
                    if (m) manifest = m;
                    // Update progress
                    const progress = Math.round(((chunk.index + 1) / Math.ceil(file.size / (1024 * 1024))) * 100);
                    dispatch({ type: 'SET_PROGRESS', payload: progress });
                }

                if (!manifest) throw new Error('Encryption failed: no manifest generated');
                updateStep('encrypt', 'complete');

                // 3. Upload encrypted data to Crust as single blob
                updateStep('upload', 'loading');
                setStatus('Uploading encrypted video to IPFS...');

                // Combine all chunks into a single blob for upload
                const encryptedBlob = new Blob(encryptedChunks as unknown as BlobPart[], { type: 'application/octet-stream' });
                const uploadResult = await uploadToCrust(encryptedBlob, accountId, {
                    onProgress: (p) => dispatch({ type: 'SET_PROGRESS', payload: p.percentage }),
                });
                videoCid = uploadResult.cid;

                // 4. Upload manifest JSON to Crust
                setStatus('Uploading manifest...');
                const manifestBlob = new Blob(
                    [JSON.stringify(manifest)],
                    { type: 'application/json' }
                );
                const manifestResult = await uploadToCrust(manifestBlob, accountId);
                manifestCid = manifestResult.cid;
                updateStep('upload', 'complete');

                // 5. Store AES key in KMS Worker
                updateStep('kms', 'loading');
                setStatus('Storing encryption key on KMS...');

                const { privateKey, publicKeyB58 } = await sessionManager.getKeyForKMS();
                await storeEncryptionKey(
                    videoUuid,
                    aesKeyB64,
                    accountId,
                    privateKey,
                    publicKeyB58
                );
                updateStep('kms', 'complete');
            }

            // 6. Mint Ticket + Create Event (BATCH - Signless!)
            updateStep('mint', 'loading');
            setStatus('Minting NFT ticket on NEAR...');
            try {
                // Title encoding:
                //   Paid:  "CID:::Thumbnail:::ManifestCID:::Title"  (4 segments)
                //   Free:  "CID:::Thumbnail:::Title"                (3 segments)
                //   Legacy:"CID:::Title"                            (2 segments)
                let eventTitle: string;
                if (manifestCid) {
                    eventTitle = `${videoCid}:::${thumbnailUrl || ''}:::${manifestCid}:::${title || file.name}`;
                } else if (thumbnailUrl) {
                    eventTitle = `${videoCid}:::${thumbnailUrl}:::${title || file.name}`;
                } else {
                    eventTitle = `${videoCid}:::${title || file.name}`;
                }

                const mediaUrl = thumbnailUrl || '';

                const priceYocto = nearToYocto(parseFloat(price) || 0);

                const videoMetadata = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: eventTitle,
                        description: description || 'Uploaded via Youtick',
                        media: mediaUrl,
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: videoUuid,
                        duration_seconds: 0,
                        content_type: 'Exclusive',
                        storage_type: 'Kms' as const
                    }
                };

                const priceUsdCents = priceUsdNum > 0 ? Math.round(priceUsdNum * 100) : null;

                const eventMetadata = {
                    encrypted_cid: videoUuid,
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto.toString(),
                    price_usd: priceUsdCents,
                };

                setStatus('Minting NFT ticket & publishing event...');

                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                updateStep('mint', 'complete');
                setStatus('Success! Video uploaded & ticket sales started!');

            } catch (mintError: unknown) {
                console.error('Minting/Event failed:', mintError);
                updateStep('mint', 'error');
                setStatus(`Video uploaded but blockchain actions failed: ${mintError instanceof Error ? mintError.message : String(mintError)}`);
                refetchBalance();
            }

            // Final success message
            setStatus('Success! Video uploaded & ticket sales started!');

            setUploading(false);

            // Clear form
            setFile(null);
            setTitle('');
            setDescription('');
            setPriceUsd('');
            setThumbnail(null);
            setThumbnailPreview(null);

        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const currentStep = us.steps.find(s => s.status === 'loading');
            if (currentStep) {
                updateStep(currentStep.id, 'error');
            }
            setStatus(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
            setUploading(false);
        }
    };

    // Retry handler
    const handleRetrySign = async () => {
        try {
            dispatch({ type: 'SET_RETRY_STEP', payload: 'none' });
            setStatus('Retrying upload...');

            const sessionManager = new SessionManager(accountId!);
            await processSignatureAndUpload(verifiedStorageFee, sessionManager);
        } catch (error: unknown) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };



    const handleUpload = async () => {
        if (!file || !accountId) return;
        if (fileSizeError) return;
        if (!title || !description) {
            setStatus('Please enter a title and description');
            return;
        }

        // Input validation
        if (title.length > 200) {
            setStatus('Title must be 200 characters or less');
            return;
        }
        if (description.length > 2000) {
            setStatus('Description must be 2000 characters or less');
            return;
        }
        if (priceUsdNum < 0) {
            setStatus('Price cannot be negative');
            return;
        }
        if (priceUsdNum > 50000) {
            setStatus('Price cannot exceed $50,000');
            return;
        }

        setUploading(true);
        setStatus('Checking wallet & balance...');
        // Reset all steps to pending
        dispatch({ type: 'RESET_STEPS' });

        try {
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);

            const storageFee = estimatedStorageFee;
            dispatch({ type: 'SET_VERIFIED_STORAGE_FEE', payload: storageFee });

            updateStep('session', 'loading');

            // --- Fetch fresh on-chain balance (React Query cache may be stale) ---
            const freshBalanceResult = await refetchBalance();
            let freshBalance = parseFloat(freshBalanceResult.data || '0');

            // --- Calculate exact required deposit ---
            const mintCost = 0.10;   // nft_mint_prepaid charge
            const eventCost = 0.10;  // create_event_prepaid charge

            // Exact deposit: only what the contract methods will deduct
            const exactPrepaidNeeded = mintCost + eventCost;

            // --- Ensure a valid session key exists (local + on-chain) ---
            // 1. Try importing MyNearWallet's function call key (no-op if key already in keystore)
            await sessionManager.importWalletFunctionCallKey();
            // 2. Verify the local key is also registered on-chain.
            //    hasSessionKey() removes stale local keys that no longer exist on-chain,
            //    preventing AccessKeyDoesNotExistError at callMethod time.
            const hasValidKey = await sessionManager.hasSessionKey();

            if (!hasValidKey) {
                // No valid session key (Meteor wallet, stale/removed key, first use, etc.)
                // Create a fresh key pair + deposit in one wallet popup.
                setStatus('Creating session key...');
                const depositAmount = Math.max(exactPrepaidNeeded, 0.5);
                await sessionManager.createSessionKey(wallet, depositAmount.toFixed(2));
                refetchSessionKey();

                // Re-fetch balance since createSessionKey deposited funds
                const updatedResult = await refetchBalance();
                freshBalance = parseFloat(updatedResult.data || '0');
            }

            if (freshBalance < exactPrepaidNeeded) {
                // Returning user: prepaid balance insufficient → top-up (1 wallet popup)
                const topUpAmount = Math.ceil((exactPrepaidNeeded - freshBalance) * 100) / 100;
                setStatus(`Topping up prepaid balance (${topUpAmount.toFixed(2)} NEAR)...`);

                const txResult = await wallet.signAndSendTransactions({
                    transactions: [{
                        receiverId: CONTRACT_ID,
                        actions: [
                            actions.functionCall(
                                'deposit_funds', {},
                                GAS_CONSTANTS.smallGas,
                                nearToYocto(topUpAmount)
                            )
                        ]
                    }]
                });
                if (!txResult) {
                    throw new Error('Transaction cancelled or wallet returned no result.');
                }
                refetchBalance();
            }

            setStatus('Wallet ready');
            updateStep('session', 'complete');

            // --- KMS Upload (AES-CTR encryption) ---
            await processSignatureAndUpload(storageFee, sessionManager);

        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const msg = error instanceof Error
                ? error.message
                : error ? String(error) : 'Transaction cancelled or wallet returned no result.';
            setStatus(`Upload failed: ${msg}`);
            setUploading(false);
            // Refresh balance so next upload attempt uses fresh on-chain data
            refetchBalance();
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 space-y-4">
            {/* Header Row: Same grid as content for alignment */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Title - Same width as form (3/5) */}
                <div className="lg:col-span-3">
                    <h1 className="text-2xl font-bold tracking-tight">{t.upload_page.title}</h1>
                    <p className="text-muted-foreground text-sm">{t.upload_page.description}</p>
                </div>
                {/* Verified Badge - Same width as preview (2/5) */}
                <div className={`lg:col-span-2 px-4 py-2 rounded-xl border flex items-center gap-3 ${hasSessionKey
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-zinc-900/50 border-white/5'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${hasSessionKey
                        ? 'bg-blue-500/20 border border-blue-500/50'
                        : 'bg-zinc-800 border border-zinc-700'}`}>
                        {hasSessionKey ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        ) : (
                            <div className="w-3 h-3 rounded-full border-2 border-zinc-500 border-dashed animate-pulse" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${hasSessionKey ? 'text-blue-300' : 'text-zinc-300'}`}>
                            {hasSessionKey ? '✓ Session Key Active' : 'Pending Verification'}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                            {hasSessionKey ? 'Session key enabled' : 'Complete first upload'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Grid - Same height columns */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">

                {/* LEFT COLUMN: FORM INPUTS */}
                <Card className="lg:col-span-3 order-2 lg:order-1">
                    <CardHeader>
                        <CardTitle>{t.upload_page.form_title}</CardTitle>
                        <CardDescription>{t.upload_page.form_desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
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
                                maxLength={200}
                                aria-required="true"
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
                                className="min-h-[60px] resize-none"
                                maxLength={2000}
                                aria-required="true"
                            />
                        </div>

                        {/* Price and File in same row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Price (USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                                    <Input
                                        id="ticket-price"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="50000"
                                        placeholder="0.00"
                                        value={priceUsd}
                                        onChange={(e) => setPriceUsd(e.target.value)}
                                        disabled={uploading || !accountId}
                                        aria-label="Ticket price in USD"
                                        className="pl-7"
                                    />
                                </div>
                                {priceUsdNum > 0 && nearPrice > 0 && (
                                    <p className="text-[11px] text-zinc-500">
                                        ≈ {priceNearDerived.toFixed(2)} NEAR
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {t.upload_page.file}
                                </label>
                                <Input
                                    id="video-file"
                                    type="file"
                                    accept="video/*"
                                    onChange={handleFileChange}
                                    disabled={uploading || !accountId}
                                    className="cursor-pointer"
                                />
                            </div>
                        </div>

                        {file && (
                            <p className="text-xs text-muted-foreground">
                                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        )}

                        {fileSizeError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{fileSizeError}</AlertDescription>
                            </Alert>
                        )}

                        {/* Progress bar removed - step indicators provide upload feedback */}

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

                    {/* Cost Receipt Section - shown when file is selected */}
                    {file && (
                        <div className="px-6 pb-2">
                            <CostReceipt
                                storageFee={estimatedStorageFee}
                                currentBalance={balanceData || '0'}
                                payAmount={payAmount}
                                loading={isBalanceLoading}
                                gasBalance={gasBalance}
                            />
                        </div>
                    )}


                    <CardFooter>
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || !file || !title || !description || !accountId || !!fileSizeError}
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

                {/* RIGHT COLUMN: TICKET PREVIEW + UPLOAD STEPS (Vertical) */}
                <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
                    {/* Modern Ticket Preview Card */}
                    <div className="sticky top-20">
                        <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50">
                            {/* Decorative Corner Glow */}
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
                            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

                            {/* Image Container */}
                            <div className="aspect-video relative overflow-hidden">
                                {thumbnailPreview ? (
                                    <Image
                                        src={thumbnailPreview}
                                        alt="Ticket Preview"
                                        fill
                                        sizes="(max-width: 1024px) 100vw, 66vw"
                                        unoptimized
                                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 backdrop-blur-sm">
                                        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-3">
                                            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-zinc-600 text-xs font-medium">{t.upload_page.no_media}</span>
                                    </div>
                                )}

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />

                                {/* Play Button */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-300">
                                        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                                            <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[9px] border-y-transparent ml-1.5" />
                                        </div>
                                    </div>
                                </div>

                                {/* Top Badges Row */}
                                <div className="absolute top-3 left-3 right-3 flex items-center justify-end">
                                    {/* Price Badge */}
                                    <div className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${priceUsdNum === 0
                                        ? 'bg-emerald-500/90 border-emerald-400/30'
                                        : 'bg-black/60 border-white/10'
                                        }`}>
                                        {priceUsdNum === 0 ? (
                                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">✨ Free Ticket</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-white tracking-wider">${parseFloat(priceUsd).toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-5 relative">
                                {/* Title */}
                                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-1.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200 transition-all duration-300">
                                    {title || t.upload_page.untitled}
                                </h4>

                                {/* Description */}
                                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                                    {description || t.upload_page.no_desc}
                                </p>

                                {/* Divider with Gradient */}
                                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                                {/* Creator Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar with Ring */}
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-0.5">
                                                <div className="w-full h-full rounded-[10px] bg-zinc-900 flex items-center justify-center">
                                                    <span className="text-xs font-bold text-white">
                                                        {accountId ? accountId.substring(0, 2).toUpperCase() : "??"}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Online Indicator */}
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-900" />
                                        </div>

                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Creator</span>
                                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px]">
                                                {accountId || t.upload_page.connect_wallet}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Ticket Type Indicator */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                                        <span className="text-[10px] text-zinc-400 font-medium">NFT Ticket</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Shine Effect */}
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>

                        {/* Upload Progress Steps - Vertical Layout Below Preview */}
                        <div className="mt-4 p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 rounded-2xl border border-white/[0.08] backdrop-blur-sm shadow-xl">
                            {/* Header with step counter */}
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-xs font-bold tracking-wide uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                                    {t.upload_page.progress_title}
                                </h3>
                                {uploading && (
                                    <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                                        {uploadSteps.filter(s => s.status === 'complete').length}/{uploadSteps.length}
                                    </span>
                                )}
                            </div>

                            {/* Overall progress bar */}
                            {uploading && (() => {
                                const completed = uploadSteps.filter(s => s.status === 'complete').length;
                                const loading = uploadSteps.filter(s => s.status === 'loading').length;
                                const pct = Math.round(((completed + loading * 0.5) / uploadSteps.length) * 100);
                                return (
                                    <div className="mb-5">
                                        <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-700 ease-out"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Vertical Progress Steps */}
                            <div className="relative">
                                {/* Continuous vertical track */}
                                <div className="absolute left-[13px] top-3 bottom-3 w-[2px] bg-zinc-800 rounded-full" />

                                <div className="space-y-1">
                                    {uploadSteps.map((step, index) => {
                                        const isActive = step.status === 'loading';
                                        const isDone = step.status === 'complete';
                                        const isError = step.status === 'error';

                                        return (
                                            <div key={step.id} className="relative">
                                                {/* Filled track segment */}
                                                {index > 0 && (
                                                    <div
                                                        className={`absolute left-[13px] -top-1 w-[2px] h-[calc(50%+4px)] rounded-full transition-all duration-500 ${isDone || isActive || isError ? 'bg-gradient-to-b from-emerald-500 to-emerald-500/80' : 'bg-transparent'
                                                            }`}
                                                    />
                                                )}

                                                <div className={`flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-500/[0.08] border border-blue-500/20' :
                                                    isError ? 'bg-red-500/[0.06] border border-red-500/15' :
                                                        'border border-transparent'
                                                    }`}>
                                                    {/* Step indicator */}
                                                    <div className="relative z-10 flex-shrink-0">
                                                        {step.status === 'pending' && (
                                                            <div className="w-7 h-7 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center">
                                                                <span className="text-[9px] font-bold text-zinc-600">{index + 1}</span>
                                                            </div>
                                                        )}
                                                        {step.status === 'loading' && (
                                                            <div className="w-7 h-7 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                                            </div>
                                                        )}
                                                        {step.status === 'complete' && (
                                                            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                                            </div>
                                                        )}
                                                        {step.status === 'error' && (
                                                            <div className="w-7 h-7 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center shadow-lg shadow-red-500/25">
                                                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Step content */}
                                                    <div className="flex-1 min-w-0">
                                                        <span className={`text-xs font-medium block transition-colors duration-300 ${isDone ? 'text-emerald-400' :
                                                            isActive ? 'text-blue-300' :
                                                                isError ? 'text-red-400' :
                                                                    'text-zinc-500'
                                                            }`}>
                                                            {(t.upload_page.steps as Record<string, string>)[step.id] || step.label}
                                                        </span>
                                                        {isActive && (
                                                            <span className="text-[10px] text-blue-400/60 mt-0.5 block animate-pulse">
                                                                {t.upload_page.processing}...
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status indicator */}
                                                    {isDone && (
                                                        <span className="text-[9px] font-medium text-emerald-500/60 uppercase tracking-wider flex-shrink-0">
                                                            OK
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* All done message */}
                            {uploadSteps.every(s => s.status === 'complete') && (
                                <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-xs font-semibold">
                                            {status.includes('Success') ? status : 'Upload Complete!'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div >
    );
}
