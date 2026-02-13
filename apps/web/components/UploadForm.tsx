'use client';

import React, { useState, useReducer } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadFile as novaUploadFile, uploadPublicThumbnail, uploadFreeVideo } from '@/lib/nova';
import { SessionManager } from '@/lib/session-manager';
import { batchUploadActionsSignless } from '@/lib/batch-transactions';
import { generateVideoThumbnail } from '@/lib/video-utils';
import { actions, nearToYocto } from 'near-api-js';
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { useLanguage } from '@/components/providers/LanguageContext';
import { GiftLinkGenerator } from './GiftLinkGenerator';
import { useSessionState, useAccountBalance } from '@/lib/hooks/useSessionState';
import { NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { getNearPrice, usdToNear, formatUsdCents } from '@/lib/price';

const CONTRACT_ID = NEAR_CONFIG.contractId;

// ── Upload state reducer ──

import type { UploadStep } from '@/lib/types';

type StepStatus = UploadStep['status'];

const INITIAL_STEPS: UploadStep[] = [
    { id: 'session', label: 'Preparing Identity', status: 'pending' },
    { id: 'thumbnail', label: 'Uploading Cover', status: 'pending' },
    { id: 'encrypt', label: 'Securing Video', status: 'pending' },
    { id: 'upload', label: 'Finalizing Storage', status: 'pending' },
    { id: 'mint', label: 'Minting Ticket', status: 'pending' },
    { id: 'event', label: 'Event Created', status: 'pending' },
];

interface UploadState {
    uploading: boolean;
    status: string;
    progress: number;
    steps: UploadStep[];
    retryStep: 'none' | 'sign_auth';
    verifiedStorageFee: string;
    estimatedStorageFee: string;
    payAmount: string;
    novaGroupFee: number;
    generatedVideoUuid: string | null;
    lastUploadedTitle: string;
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
    novaGroupFee: 0,
    generatedVideoUuid: null,
    lastUploadedTitle: '',
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
    | { type: 'SET_NOVA_GROUP_FEE'; payload: number }
    | { type: 'SET_VIDEO_UUID'; payload: { uuid: string; title: string } }
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
        case 'SET_NOVA_GROUP_FEE':
            return { ...state, novaGroupFee: action.payload };
        case 'SET_VIDEO_UUID':
            return { ...state, generatedVideoUuid: action.payload.uuid, lastUploadedTitle: action.payload.title };
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
    const { hasSessionKey, isSessionKeyLoading, refetchSessionKey } = useSessionState(accountId);
    const { data: balanceData, isLoading: isBalanceLoading, refetch: refetchBalance } = useAccountBalance(accountId);

    // Form fields
    const [file, setFile] = useState<File | null>(null);
    const [thumbnail, setThumbnail] = useState<Blob | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priceUsd, setPriceUsd] = useState(''); // USD amount (e.g. "5.00"), empty = free
    const [nearPrice, setNearPrice] = useState<number>(0); // NEAR/USD rate

    // Derived NEAR price from USD input
    const priceUsdNum = parseFloat(priceUsd) || 0;
    const priceNearDerived = nearPrice > 0 ? usdToNear(priceUsdNum, nearPrice) : 0;
    // Keep 'price' as NEAR string for backward compat with CostReceipt etc.
    const price = priceUsdNum > 0 ? priceNearDerived.toFixed(6) : '0';

    // Fetch NEAR/USD price on mount
    React.useEffect(() => {
        getNearPrice().then(setNearPrice);
    }, []);

    // Upload state (consolidated)
    const [us, dispatch] = useReducer(uploadReducer, initialUploadState);

    // Convenience aliases for template readability
    const uploading = us.uploading;
    const status = us.status;
    const progress = us.progress;
    const uploadSteps = us.steps;
    const retryStep = us.retryStep;
    const estimatedStorageFee = us.estimatedStorageFee;
    const payAmount = us.payAmount;
    const novaGroupFee = us.novaGroupFee;
    const generatedVideoUuid = us.generatedVideoUuid;
    const lastUploadedTitle = us.lastUploadedTitle;
    const verifiedStorageFee = us.verifiedStorageFee;

    // Gas Top-Up State (derived from React Query)
    const gasBalance = parseFloat(balanceData || '0');
    const REQUIRED_GAS = 0.20; // NFT (0.1) + Event (0.1) — exact cost, no buffer

    // Calculate if top-up is needed based on cached data
    const isFreeForTopUp = parseFloat(price) === 0 || price === '';
    const minRequired = REQUIRED_GAS + (isFreeForTopUp ? 0 : novaGroupFee);
    const needsTopUp = hasSessionKey === true && gasBalance < minRequired;

    // Helper functions that dispatch to reducer
    const updateStep = (stepId: string, stepStatus: StepStatus) => {
        dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, status: stepStatus } });
    };
    const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS', payload: msg });
    const setUploading = (val: boolean) => dispatch({ type: 'SET_UPLOADING', payload: val });
    const setProgress = (val: number) => dispatch({ type: 'SET_PROGRESS', payload: val });

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

    // Recalculate pay amount when storage fee or nova fee changes
    React.useEffect(() => {
        const fee = parseFloat(estimatedStorageFee) || 0;
        const isFree = parseFloat(price) === 0 || price === '';
        // Exact prepaid costs: NFT mint (0.1) + Event (0.1) + Nova group fee (paid only)
        const novaFee = isFree ? 0 : novaGroupFee;
        const totalNeeded = fee + 0.20 + novaFee;
        dispatch({ type: 'SET_PAY_AMOUNT', payload: totalNeeded > 0 ? totalNeeded.toFixed(4) : '0' });
    }, [estimatedStorageFee, price, novaGroupFee]);

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

            // Fetch Nova group registration fee (independent of storage fee)
            try {
                const { getRegisterGroupFee } = await import('@/lib/nova/costs');
                const novaFee = await getRegisterGroupFee();
                dispatch({ type: 'SET_NOVA_GROUP_FEE', payload: novaFee });
            } catch (err) {
                console.error('[UploadForm] Error fetching Nova group fee:', err);
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

    // Helper function to process the upload with NOVA
    // NOVA handles TEE-based encryption automatically
    const processSignatureAndUpload = async (storageFee: string, sessionManager: SessionManager) => {
        if (!file || !accountId) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            const wallet = await getWallet();
            console.log('[DECENTRALIZATION_METRIC] upload_process_start', {
                accountId,
                storage: 'nova_tee_encryption'
            });

            // 0. Upload Thumbnail (Public) via Nova Public Groups
            let thumbnailUrl: string | null = null;
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading thumbnail to Nova...');

                try {
                    const thumbResult = await uploadPublicThumbnail(
                        thumbnail,
                        accountId
                    );

                    if (thumbResult.novaUrl) {
                        thumbnailUrl = thumbResult.novaUrl;
                        updateStep('thumbnail', 'complete');
                    } else {
                        updateStep('thumbnail', 'complete');
                    }
                } catch (thumbError) {
                    console.error('[Thumbnail] Upload failed:', thumbError);
                    // Continue without thumbnail
                    updateStep('thumbnail', 'complete');
                }
            } else {
                updateStep('thumbnail', 'complete');
            }

            // 1. Encrypt & Upload with NOVA (TEE-based encryption)
            updateStep('encrypt', 'loading');
            setStatus('Encrypting video with NOVA TEE...');

            // Generate a UUID to serve as the Access Control identifier
            // This UUID will be used as the key in the contract
            const videoUuid = crypto.randomUUID();
            dispatch({ type: 'SET_VIDEO_UUID', payload: { uuid: videoUuid, title: title || file.name } });

            // Upload to NOVA (handles encryption via TEE automatically)
            updateStep('upload', 'loading');
            setStatus('Uploading to NOVA decentralized storage...');

            const isFreeVideo = parseFloat(price) === 0 || price === '';
            let novaCid: string;
            let novaGroupId: string;
            let keyCid: string | undefined;

            if (isFreeVideo) {
                // Free video: upload directly to Crust (no encryption, no Nova group fee)
                const result = await uploadFreeVideo(file, accountId, { filename: file.name });
                novaCid = result.cid;
                novaGroupId = result.groupId;
            } else {
                // Paid video: client-side AES encrypt → Crust storage → Nova key store
                const result = await novaUploadFile(file, accountId, { filename: file.name });
                novaCid = result.cid;
                novaGroupId = result.groupId;
                keyCid = result.keyCid;
            }

            updateStep('encrypt', 'complete');
            updateStep('upload', 'complete');
            setStatus('NOVA Upload Complete! CID: ' + novaCid);


            // 6. Mint Ticket + Create Event (BATCH - Signless!)
            updateStep('mint', 'loading');
            setStatus(`Paying Fee (${storageFee} NEAR) & Minting Ticket...`);
            try {
                // Construct Title with CID for Player to parse
                // Schema (paid):  "CID:::ThumbnailURL:::KeyCID:::Title" (4 segments)
                // Schema (free):  "CID:::ThumbnailURL:::Title"          (3 segments)
                // Schema (legacy): "NovaCID:::Title"                    (2 segments)
                // Title encoding:
                //   Paid:  "CID:::Thumbnail:::KeyCID:::Title"  (always 4 segments)
                //   Free:  "CID:::Thumbnail:::Title"           (3 segments)
                //   Legacy:"CID:::Title"                       (2 segments)
                // Paid videos MUST always use 4 segments so IpfsPlayer can
                // distinguish keyCid from thumbnailCid (empty string = no thumbnail).
                let eventTitle: string;
                if (keyCid) {
                    eventTitle = `${novaCid}:::${thumbnailUrl || ''}:::${keyCid}:::${title || file.name}`;
                } else if (thumbnailUrl) {
                    eventTitle = `${novaCid}:::${thumbnailUrl}:::${title || file.name}`;
                } else {
                    eventTitle = `${novaCid}:::${title || file.name}`;
                }

                // Use nova:// URL for media (empty string if no thumbnail)
                const mediaUrl = thumbnailUrl || '';

                const contractId = NEAR_CONFIG.contractId;
                const priceYocto = nearToYocto(parseFloat(price) || 0);

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
                        encrypted_cid: videoUuid, // UUID (access control key)
                        duration_seconds: 0,
                        content_type: 'Exclusive',
                        nova_group_id: novaGroupId, // NOVA group for access control
                        storage_type: 'Nova' as const // Contract enum only accepts 'Nova'; actual storage detection via title segment count
                    }
                };

                // price_usd in cents (e.g. $5.00 → 500), null if free
                const priceUsdCents = priceUsdNum > 0 ? Math.round(priceUsdNum * 100) : null;

                const eventMetadata = {
                    encrypted_cid: videoUuid, // UUID key
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto.toString(),
                    price_usd: priceUsdCents,
                };

                setStatus('Minting Ticket...');

                // Signless batch transaction (session key)
                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                updateStep('mint', 'complete');

                // Event complete
                await new Promise(resolve => setTimeout(resolve, 500));
                updateStep('event', 'loading');
                await new Promise(resolve => setTimeout(resolve, 500));
                updateStep('event', 'complete');
                setStatus('Success! Video Uploaded & Ticket Sales Started!');

            } catch (mintError: unknown) {
                console.error('Minting/Event failed:', mintError);
                updateStep('mint', 'error');
                setStatus(`Upload success, but Blockchain actions failed: ${mintError instanceof Error ? mintError.message : String(mintError)}`);
                refetchBalance();
            }

            // Final success message
            setStatus('Success! Video Uploaded & Ticket Sales Started!');

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
            // Mark current loading step as error
            const currentStep = us.steps.find(s => s.status === 'loading');
            if (currentStep) {
                updateStep(currentStep.id, 'error');
            }
            setStatus(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
            setUploading(false);
        }
    };

    // Retry handler - simplified for NOVA
    // NOVA handles auth and encryption automatically
    const handleRetrySign = async () => {
        try {
            dispatch({ type: 'SET_RETRY_STEP', payload: 'none' });
            setStatus('Retrying NOVA upload...');

            const sessionManager = new SessionManager(accountId!);
            await processSignatureAndUpload(verifiedStorageFee, sessionManager);
        } catch (error: unknown) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };



    const handleUpload = async () => {
        if (!file || !accountId) return;
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
        setStatus('Initializing Upload...');
        setProgress(0);

        // Reset all steps to pending
        dispatch({ type: 'RESET_STEPS' });

        try {
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);

            const sessionKeyExists = hasSessionKey === true;
            const storageFee = estimatedStorageFee;
            dispatch({ type: 'SET_VERIFIED_STORAGE_FEE', payload: storageFee });

            updateStep('session', 'loading');

            // --- Fetch fresh on-chain balance (React Query cache may be stale) ---
            const freshBalanceResult = await refetchBalance();
            let freshBalance = parseFloat(freshBalanceResult.data || '0');

            // --- Calculate exact required deposit ---
            const isFreeVideo = parseFloat(price) === 0 || price === '';
            const mintCost = 0.10;   // nft_mint_prepaid charge
            const eventCost = 0.10;  // create_event_prepaid charge

            let novaFee = 0;
            if (!isFreeVideo) {
                const { getRegisterGroupFee } = await import('@/lib/nova/costs');
                novaFee = await getRegisterGroupFee();
            }

            // Exact deposit: only what the contract methods will deduct
            const exactPrepaidNeeded = novaFee + mintCost + eventCost;

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

            // --- Fund Nova platform (signless, from prepaid balance) ---
            if (novaFee > 0) {
                setStatus('Funding Nova group registration...');
                const amountYocto = nearToYocto(novaFee);
                await sessionManager.callMethod('fund_nova_platform', {
                    amount: amountYocto.toString()
                }, GAS_CONSTANTS.mediumGas.toString());
            }

            setStatus('Session ready for NOVA upload...');
            updateStep('session', 'complete');

            // --- NOVA Upload (TEE-based encryption) ---
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

                    {/* Cost Receipt Section - shown when file is selected */}
                    {file && (
                        <div className="px-6 pb-2">
                            <CostReceipt
                                storageFee={estimatedStorageFee}
                                currentBalance={balanceData || '0'}
                                payAmount={payAmount}
                                loading={isBalanceLoading}
                                gasBalance={gasBalance}
                                isFreeVideo={parseFloat(price) === 0 || price === ''}
                                novaGroupFee={novaGroupFee}
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
                                    <img
                                        src={thumbnailPreview}
                                        alt="Ticket Preview"
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
                        <div className="mt-4 p-4 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 rounded-xl border border-white/10 backdrop-blur-sm shadow-lg">
                            <h3 className="text-xs font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                                {t.upload_page.progress_title}
                            </h3>

                            {/* Vertical Progress Steps */}
                            <div className="relative space-y-3">
                                {uploadSteps.map((step, index) => (
                                    <div key={step.id} className="flex items-center gap-3 relative">
                                        {/* Vertical Line */}
                                        {index < uploadSteps.length - 1 && (
                                            <div className={`absolute left-3 top-6 w-0.5 h-6 transition-all duration-300 ${step.status === 'complete' ? 'bg-emerald-500' : 'bg-zinc-700'
                                                }`} />
                                        )}

                                        {/* Step Circle */}
                                        <div className="relative z-10 flex-shrink-0">
                                            {step.status === 'pending' && (
                                                <div className="w-6 h-6 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                                                    <span className="text-[8px] font-bold text-zinc-500">{index + 1}</span>
                                                </div>
                                            )}
                                            {step.status === 'loading' && (
                                                <div className="w-6 h-6 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center animate-pulse shadow-md shadow-blue-500/30">
                                                    <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                                </div>
                                            )}
                                            {step.status === 'complete' && (
                                                <div className="w-6 h-6 rounded-full bg-emerald-500 border-2 border-emerald-400 flex items-center justify-center shadow-md shadow-emerald-500/30">
                                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                                </div>
                                            )}
                                            {step.status === 'error' && (
                                                <div className="w-6 h-6 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center shadow-md shadow-red-500/30">
                                                    <AlertCircle className="w-3 h-3 text-red-400" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Step Label */}
                                        <span className={`text-xs font-medium transition-all duration-300 ${step.status === 'complete' ? 'text-emerald-400' :
                                            step.status === 'loading' ? 'text-blue-400' :
                                                step.status === 'error' ? 'text-red-400' :
                                                    'text-zinc-500'
                                            }`}>
                                            {(t.upload_page.steps as Record<string, string>)[step.id] || step.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* GIFT LINK GENERATOR - DISABLED (moved to separate page)
                {(generatedVideoUuid || uploading) && (
                    <div className="lg:col-span-3 space-y-4">
                        <GiftLinkGenerator
                            eventCid={generatedVideoUuid || 'pending'}
                            eventTitle={lastUploadedTitle || title}
                            creatorAccountId={accountId || ''}
                        />
                    </div>
                )}
                */}
            </div>
        </div >
    );
}
