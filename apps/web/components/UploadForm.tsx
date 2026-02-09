'use client';

import React, { useState } from 'react';
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
import { NEAR_CONFIG } from '@/lib/constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

export function UploadForm() {
    const { t } = useLanguage();
    const { selector, accountId, getWallet } = useWallet();

    // React Query hooks for session state (cached, deduplicated)
    const { hasSessionKey, isSessionKeyLoading, refetchSessionKey } = useSessionState(accountId);
    const { data: balanceData, isLoading: isBalanceLoading, refetch: refetchBalance } = useAccountBalance(accountId);

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
        { id: 'session', label: 'Preparing Identity', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'thumbnail', label: 'Uploading Cover', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'encrypt', label: 'Securing Video', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'upload', label: 'Finalizing Storage', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'mint', label: 'Minting Ticket', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' },
        { id: 'event', label: 'Event Created', status: 'pending' as 'pending' | 'loading' | 'complete' | 'error' }
    ]);

    // Retry state for popup blocked scenarios
    const [retryStep, setRetryStep] = useState<'none' | 'sign_auth'>('none');
    const [verifiedStorageFee, setVerifiedStorageFee] = useState<string>('0');

    // Cost Receipt State
    const [estimatedStorageFee, setEstimatedStorageFee] = useState('0');
    const [payAmount, setPayAmount] = useState('0');

    // Nova group fee state (dynamic, fetched when file is selected)
    const [novaGroupFee, setNovaGroupFee] = useState<number>(0);

    // Gas Top-Up State (derived from React Query)
    const gasBalance = parseFloat(balanceData || '0');
    const REQUIRED_GAS = 0.25; // NFT (0.1) + Event (0.1) + buffer (0.05)

    // Calculate if top-up is needed based on cached data
    const minRequired = REQUIRED_GAS;
    const needsTopUp = hasSessionKey === true && gasBalance < minRequired;

    // Track the generated UUID for gifting
    const [generatedVideoUuid, setGeneratedVideoUuid] = useState<string | null>(null);
    const [lastUploadedTitle, setLastUploadedTitle] = useState<string>('');

    // Helper function to update step status
    const updateStep = (stepId: string, status: 'pending' | 'loading' | 'complete' | 'error') => {
        setUploadSteps(prev => prev.map(step =>
            step.id === stepId ? { ...step, status } : step
        ));
    };

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

    // Recalculate pay amount when storage fee, balance, or nova fee changes
    React.useEffect(() => {
        const fee = parseFloat(estimatedStorageFee) || 0;
        const isFree = parseFloat(price) === 0 || price === '';
        // Session key costs: NFT mint (0.1) + Event (0.1) + buffer = 0.3 NEAR
        // For paid videos, add Nova group registration fee
        const novaFee = isFree ? 0 : novaGroupFee;
        const totalNeeded = fee + 0.3 + novaFee;
        setPayAmount(totalNeeded > 0 ? totalNeeded.toFixed(4) : '0');
    }, [estimatedStorageFee, gasBalance, price, novaGroupFee]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];

            setFile(selectedFile);

            // Calculate storage fee
            try {
                const { getNearPrice, calculateStorageFee } = await import('@/lib/price');
                const nearPrice = await getNearPrice();
                const fee = calculateStorageFee(selectedFile.size, nearPrice);
                setEstimatedStorageFee(fee);
                console.log('[UploadForm] Storage fee:', fee, 'NEAR');
            } catch (err) {
                console.error('[UploadForm] Error calculating storage fee:', err);
            }

            // Fetch Nova group registration fee (independent of storage fee)
            try {
                console.log('[UploadForm] Fetching Nova group fee...');
                const { getRegisterGroupFee } = await import('@/lib/nova/costs');
                const novaFee = await getRegisterGroupFee();
                setNovaGroupFee(novaFee);
                console.log('[UploadForm] Nova group fee:', novaFee, 'NEAR');
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
                        console.log('[Thumbnail] Nova URL:', thumbnailUrl);
                        console.log('[Thumbnail] CID:', thumbResult.cid);
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
            console.log("Generated Video UUID for Access Control:", videoUuid);
            setGeneratedVideoUuid(videoUuid);
            setLastUploadedTitle(title || file.name);

            // Upload to NOVA (handles encryption via TEE automatically)
            updateStep('upload', 'loading');
            setStatus('Uploading to NOVA decentralized storage...');

            const isFreeVideo = parseFloat(price) === 0 || price === '';
            let novaCid: string;
            let novaGroupId: string;

            if (isFreeVideo) {
                // Free video: reuse creator's public group (saves ~0.64 NEAR)
                console.log('[NOVA] Uploading free video to public group (no new group cost)...');
                const result = await uploadFreeVideo(file, accountId, { filename: file.name });
                novaCid = result.cid;
                novaGroupId = result.groupId;
            } else {
                // Paid video: create new per-video group for granular access control
                console.log('[NOVA] Uploading paid video with TEE encryption (new group)...');
                const result = await novaUploadFile(file, accountId, { filename: file.name });
                novaCid = result.cid;
                novaGroupId = result.groupId;
            }

            console.log('[NOVA] Upload complete - CID:', novaCid, 'GroupID:', novaGroupId);

            updateStep('encrypt', 'complete');
            updateStep('upload', 'complete');
            setStatus('NOVA Upload Complete! CID: ' + novaCid);


            // 6. Mint Ticket + Create Event (BATCH - Signless!)
            updateStep('mint', 'loading');
            setStatus(`Paying Fee (${storageFee} NEAR) & Minting Ticket...`);
            try {
                // Construct Title with NovaCID for Player to parse
                // Schema: "NovaCID:::ThumbnailURL:::Title" (with thumbnail)
                // or "NovaCID:::Title" (without thumbnail)
                // ThumbnailURL can be nova:// URL or legacy IPFS URL
                const eventTitle = thumbnailUrl
                    ? `${novaCid}:::${thumbnailUrl}:::${title || file.name}`
                    : `${novaCid}:::${title || file.name}`;

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
                        storage_type: 'Nova' as const // Using NOVA TEE encryption
                    }
                };

                console.log('📝 Video metadata being sent to contract:', videoMetadata);

                const eventMetadata = {
                    encrypted_cid: videoUuid, // UUID key
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto.toString()
                };

                // Use signless batch transaction
                setStatus('Minting Ticket...');
                console.log("Using Session Key for signless publication...");

                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                updateStep('mint', 'complete');

                // NOVA group ID is already included in video_metadata
                // No separate set_nova_group call needed - contract stores it during nft_mint
                console.log(`[NOVA] Group ID ${novaGroupId} stored with NFT via video_metadata`);

                // Event complete
                await new Promise(resolve => setTimeout(resolve, 500));
                updateStep('event', 'loading');
                await new Promise(resolve => setTimeout(resolve, 500));
                updateStep('event', 'complete');
                setStatus('Success! Video Uploaded & Ticket Sales Started!');

            } catch (mintError: any) {
                console.error('Minting/Event failed:', mintError);
                updateStep('mint', 'error');
                setStatus(`Upload success, but Blockchain actions failed: ${mintError.message}`);
            }

            // Final success message
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

    // Retry handler - simplified for NOVA
    // NOVA handles auth and encryption automatically
    const handleRetrySign = async () => {
        try {
            setRetryStep('none');
            setStatus('Retrying NOVA upload...');

            const sessionManager = new SessionManager(accountId!);
            await processSignatureAndUpload(verifiedStorageFee, sessionManager);
        } catch (error: any) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${error.message}`);
        }
    };



    const handleUpload = async () => {
        if (!file || !accountId) return;
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
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);

            // Check Session Key Status
            const sessionKeyExists = hasSessionKey === true;
            console.log("Session key status:", sessionKeyExists ? "EXISTS" : "NEEDS CREATION");

            // Calculate Storage Fee
            const storageFee = estimatedStorageFee;
            setVerifiedStorageFee(storageFee);

            console.log(`Video Size: ${file.size} bytes. Fee: ${storageFee} NEAR`);

            // Check Gas Balance
            updateStep('session', 'loading');
            setStatus('Checking gas balance...');

            // Minimum prepaid balance for session key operations:
            // NFT (0.1) + Event (0.1) + buffer (0.05) = 0.25 NEAR
            // Nova group registration is a separate platform cost for paid videos
            const currentMinRequired = 0.25;

            console.log(`📊 Gas Check: Balance=${gasBalance}, Required=${currentMinRequired}`);

            // --- Determine Nova funding need for paid videos ---
            const isFreeVideo = parseFloat(price) === 0 || price === '';
            console.log(`[UploadForm] Video type: ${isFreeVideo ? 'FREE' : 'PAID'}, price=${price}`);

            let novaFundAmount = 0;
            let novaAccountIdForFunding = '';

            if (!isFreeVideo) {
                console.log('[UploadForm] Checking Nova platform balance for group registration...');
                const { canRegisterNewGroup: canRegister, getRegisterGroupFee: getFee } = await import('@/lib/nova/costs');
                const novaCanRegister = await canRegister();
                console.log('[UploadForm] Nova can register new group:', novaCanRegister);

                if (!novaCanRegister) {
                    const fee = await getFee();
                    novaFundAmount = Math.round((fee + 0.05) * 100) / 100; // fee + buffer, rounded
                    novaAccountIdForFunding = process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID || '';

                    if (!novaAccountIdForFunding) {
                        throw new Error('Nova account ID not configured. Set NEXT_PUBLIC_NOVA_ACCOUNT_ID.');
                    }
                    console.log(`[UploadForm] Nova funding needed: ${novaFundAmount} NEAR → ${novaAccountIdForFunding}`);
                }
            }

            // --- Build and send ALL wallet transactions in one batch (single popup) ---
            if (!sessionKeyExists) {
                // First time user: session key + gas deposit + (optional) Nova funding
                setStatus('Setting up Session Key...');
                const depositAmount = 0.3;

                console.log(`Creating session key (depositing ${depositAmount} NEAR)...`);

                // Build transaction list
                const sessionPublicKey = await sessionManager.generateSessionKeyPair();
                const { batchInitialSetupWithNovaFunding } = await import('@/lib/batch-transactions');
                await batchInitialSetupWithNovaFunding(
                    wallet, accountId, CONTRACT_ID,
                    sessionPublicKey,
                    depositAmount.toString(),
                    novaFundAmount > 0 ? { receiverId: novaAccountIdForFunding, amount: novaFundAmount } : undefined
                );

                refetchSessionKey();
                console.log("Session key created!" + (novaFundAmount > 0 ? ` + Nova funded (${novaFundAmount} NEAR)` : ''));

            } else if (gasBalance < currentMinRequired || novaFundAmount > 0) {
                // Returning user: gas top-up and/or Nova funding in one batch
                const topUpAmount = gasBalance < currentMinRequired
                    ? Math.ceil((currentMinRequired - gasBalance + 0.1) * 10) / 10
                    : 0;

                if (topUpAmount > 0) {
                    setStatus(`Gas balance low (${gasBalance.toFixed(2)} NEAR). Topping up...`);
                    console.log(`⛽ Topping up gas: Current=${gasBalance}, Required=${currentMinRequired}, TopUp=${topUpAmount}`);
                }
                if (novaFundAmount > 0) {
                    setStatus(topUpAmount > 0 ? 'Topping up gas + funding Nova...' : 'Funding Nova group registration...');
                    console.log(`[NOVA] Funding platform account (${novaAccountIdForFunding}) with ${novaFundAmount} NEAR`);
                }

                // Build transactions list
                const txList: Array<{ receiverId: string; actions: any[] }> = [];

                if (topUpAmount > 0) {
                    txList.push({
                        receiverId: CONTRACT_ID,
                        actions: [
                            actions.functionCall(
                                'deposit_funds', {},
                                BigInt('30000000000000'),
                                nearToYocto(topUpAmount)
                            )
                        ]
                    });
                }

                if (novaFundAmount > 0) {
                    txList.push({
                        receiverId: novaAccountIdForFunding,
                        actions: [actions.transfer(nearToYocto(novaFundAmount))]
                    });
                }

                if (txList.length > 0) {
                    await wallet.signAndSendTransactions({ transactions: txList });
                }

                if (topUpAmount > 0) refetchBalance();
                console.log(`✅ Wallet batch complete (${txList.length} tx)`);

            } else {
                console.log(`✅ Gas balance sufficient: ${gasBalance} >= ${currentMinRequired}`);
            }

            // Invalidate Nova balance cache if we just funded the platform
            if (novaFundAmount > 0) {
                const { invalidateBalanceCache } = await import('@/lib/nova/costs');
                invalidateBalanceCache();
            }

            setStatus('Session ready for NOVA upload...');
            updateStep('session', 'complete');

            // --- STEP 3: NOVA Upload (TEE-based encryption) ---
            setStatus('Ready for NOVA decentralized upload...');
            console.log('[NOVA] Starting TEE-encrypted upload...');

            // Continue with NOVA upload
            await processSignatureAndUpload(storageFee, sessionManager);

        } catch (error: any) {
            console.error('Upload failed:', error);
            setStatus(`Upload failed: ${error.message} `);
            setUploading(false);
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
                            />
                        </div>

                        {/* Price and File in same row */}
                        <div className="grid grid-cols-2 gap-4">
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
                                requiredGas={REQUIRED_GAS}
                                needsTopUp={needsTopUp}
                                isFirstUpload={!hasSessionKey}
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
                                    <div className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${parseFloat(price) === 0 || price === ''
                                        ? 'bg-emerald-500/90 border-emerald-400/30'
                                        : 'bg-black/60 border-white/10'
                                        }`}>
                                        {parseFloat(price) === 0 || price === '' ? (
                                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">✨ Free Ticket</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-white tracking-wider">{price} NEAR</span>
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
                                            {(t.upload_page.steps as any)[step.id] || step.label}
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
