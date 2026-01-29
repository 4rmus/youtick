'use client';

import React, { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadFile } from '@/lib/crust';
import { lit, LIT_ACTION_CID } from '@/lib/lit';
import { SessionManager } from '@/lib/session-manager';
import { batchUploadActionsSignless } from '@/lib/batch-transactions';
import { generateVideoThumbnail } from '@/lib/video-utils';
import { ethers } from 'ethers';
import { nearToYocto } from 'near-api-js';
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
import { IPFS_CONFIG } from '@/lib/constants';


const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';

// Crust upload result interface
interface CrustUploadResult {
    cid: string;
    size: number;
    name?: string;
}

export function UploadForm() {
    const { t } = useLanguage();
    const { selector, accountId, getWallet, pkpData, isPKPMinting } = useWallet();

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
    const [retryStep, setRetryStep] = useState<'none' | 'sign_auth' | 'pkp_link'>('none');
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [recoveredAddr, setRecoveredAddr] = useState<string | null>(null);
    const [verifiedStorageFee, setVerifiedStorageFee] = useState<string>('0');

    // Cost Receipt State
    const [estimatedStorageFee, setEstimatedStorageFee] = useState('0');
    const [payAmount, setPayAmount] = useState('0');

    // Gas Top-Up State (derived from React Query)
    const gasBalance = parseFloat(balanceData || '0');
    const REQUIRED_GAS = 0.5; // MPC (0.25) + NFT (0.1) + Event (0.1)

    // Calculate if top-up is needed based on cached data
    const hasPkp = !!pkpData;
    const minRequired = hasPkp ? 0.2 : REQUIRED_GAS;
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

    // Recalculate pay amount when storage fee or balance changes
    React.useEffect(() => {
        const fee = parseFloat(estimatedStorageFee) || 0;
        // Session key costs: MPC (0.25) + NFT mint (0.1) + Event (0.1) = 0.45 NEAR
        // Using 0.5 NEAR for safety margin
        const totalNeeded = fee + 0.5;
        setPayAmount(totalNeeded > 0 ? totalNeeded.toFixed(4) : '0');
    }, [estimatedStorageFee, gasBalance]);

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
                // PKP minting now happens automatically in WalletProvider on connect
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

    // Helper function to process the upload with Crust W3Auth
    // Crust handles auth via Session Key automatically (signless)
    const processSignatureAndUpload = async (storageFee: string, sessionManager: SessionManager, mpcAddress: string) => {
        if (!file || !accountId) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            const wallet = await getWallet();
            console.log('[DECENTRALIZATION_METRIC] upload_process_start', {
                accountId,
                storage: 'crust_w3auth',
                mpcAddress
            });

            // 0. Upload Thumbnail first (Public) via Crust W3Auth
            let thumbnailCid: string | null = null; // No default placeholder - will use v1 format if no thumbnail
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading thumbnail to Crust IPFS...');

                // Upload via Crust W3Auth (signless, client-side)
                const thumbResult = await uploadFile(thumbnail, accountId, {
                    filename: 'thumbnail.jpg'
                }) as CrustUploadResult;

                if (thumbResult.cid) {
                    thumbnailCid = thumbResult.cid;
                    console.log('[Crust] Thumbnail uploaded CID:', thumbnailCid);
                    updateStep('thumbnail', 'complete');
                } else {
                    updateStep('thumbnail', 'complete');
                }
            } else {
                updateStep('thumbnail', 'complete');
            }

            // 1. Get Session Signatures
            // Try PKP first (signless), fallback to MPC if unavailable
            setStatus('Getting Session Signatures...');

            let sessionSignatures: any;

            // Check if we have PKP for signless experience
            const cachedPkp = localStorage.getItem(`lit_pkp_${accountId}`);
            let pkp: { publicKey: string; ethAddress: string } | null = null;

            if (cachedPkp) {
                try {
                    pkp = JSON.parse(cachedPkp);
                    console.log("Found PKP for signless upload:", pkp?.ethAddress);
                } catch (e) {
                    console.warn("Error parsing cached PKP:", e);
                }
            }

            if (pkp) {
                // ⚡ PKP-based signless session sigs (no MPC cost!)
                try {
                    console.log("🔐 Using PKP for signless upload session...");
                    setStatus('Using PKP for signless authentication...');

                    sessionSignatures = await lit.getSessionSigsWithPKP(
                        pkp.publicKey,
                        pkp.ethAddress,
                        accountId,
                        undefined // capacityDelegationAuthSig (optional, will be fetched)
                    );

                    console.log("✅ PKP session sigs obtained for upload!");
                } catch (pkpError: any) {
                    console.warn("PKP session failed, falling back to MPC:", pkpError.message);
                    pkp = null; // Force MPC fallback
                }
            }

            if (!pkp || !sessionSignatures) {
                // MPC FALLBACK (uses Session Key) - requires gas for MPC signature
                console.log("Using Session Key + MPC for upload (fallback)...");
                setStatus('Signing with Session Key (MPC)...');

                const signWithSessionKey = async (w: any, accId: string, path: string, msg: string) => {
                    console.log("Using Session Key for MPC signature...");
                    const messageHash = ethers.hashMessage(msg);
                    const payload = Array.from(ethers.getBytes(messageHash));

                    return await sessionManager.callMethod('sign_with_mpc', {
                        payload,
                        path,
                        key_version: 0
                    });
                };

                sessionSignatures = await lit.getSessionSigs(
                    wallet,
                    accountId,
                    mpcAddress, // MPC-derived ETH address for Lit Protocol
                    signWithSessionKey,
                    undefined, // ACC (optional)
                    undefined, // hash (optional)
                    'lit/pkp-minting' // derivationPath
                );
            }

            // 2. Encrypt with Lit Protocol using Session Keys
            updateStep('encrypt', 'loading');
            setStatus('Encrypting file with Lit Protocol...');

            // 4. Encrypt file with Lit Protocol
            // Generate a UUID to serve as the Content Identifier for Access Control
            // This UUID will be stored in the contract's video_metadata.encrypted_cid field (repurposing it as an ID key)
            // The Real IPFS CID will be stored in the Title for now.
            const videoUuid = crypto.randomUUID();
            console.log("Generated Video UUID for Access Control:", videoUuid);
            setGeneratedVideoUuid(videoUuid);
            setLastUploadedTitle(title || file.name);

            // Use Lit Action to check NEAR NFT ownership on-chain
            // Import the secure ACC helper
            const { createAccessControlConditions } = await import('@/lib/access-conditions');

            const accessControlConditions = createAccessControlConditions({
                videoUuid,
                uploaderAccountId: accountId,
                useSecureNearCheck: true // Enable NEAR NFT verification
            });

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
            setStatus('Uploading encrypted content to Crust IPFS...');

            // 5. Upload to Crust IPFS via W3Auth (signless, client-side)
            // We need to upload a JSON containing ciphertext + metadata to allow decryption later.
            const encryptedContent = {
                ciphertext,
                dataToEncryptHash,
                accessControlConditions
            };

            const metadataBlob = new Blob([JSON.stringify(encryptedContent)], { type: 'application/json' });

            // Upload via Crust W3Auth (signless, client-side)
            console.log('[Crust] Uploading encrypted content...');
            const uploadResult = await uploadFile(metadataBlob, accountId, {
                filename: `${file.name}.encrypted.json`
            }) as CrustUploadResult;

            if (!uploadResult.cid) {
                throw new Error('Upload succeeded but no CID returned');
            }

            const fileHash = uploadResult.cid;
            console.log('[Crust] Encrypted File CID:', fileHash);

            updateStep('upload', 'complete');
            setStatus('Upload Complete! CID: ' + fileHash);


            // 6. Mint Ticket + Refund + Create Event (BATCH - Signless!)
            updateStep('mint', 'loading');
            setStatus(`Paying Fee (${storageFee} NEAR) & Minting Ticket...`);
            try {
                // Construct Title with RealCID for Player to parse
                // Schema v2: "RealCID:::ThumbnailCID:::Title" (with thumbnail)
                // Schema v1: "RealCID:::Title" (without thumbnail)
                const eventTitle = thumbnailCid
                    ? `${fileHash}:::${thumbnailCid}:::${title || file.name}`
                    : `${fileHash}:::${title || file.name}`;

                // Construct full IPFS Gateway URL for media (empty string if no thumbnail)
                // Uses Crust gateway from IPFS_CONFIG
                const mediaUrl = thumbnailCid
                    ? `${IPFS_CONFIG.gatewayUrl}/${thumbnailCid}`
                    : '';

                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';
                // v7: Use nearToYocto
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
                        encrypted_cid: videoUuid, // The UUID
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
                    // v7: nearToYocto returns bigint, contract expects string
                    price: priceYocto.toString()
                };

                // Use signless batch transaction
                setStatus('Minting Ticket...');
                console.log("Using Session Key for signless final publication...");

                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                // Step 1: Mint complete
                updateStep('mint', 'complete');

                // Step 2: Event complete (with small delay for visual feedback)
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

    // Retry handler - simplified for Crust W3Auth
    // With Crust W3Auth, auth is signless via Session Key, so retry is simpler
    const handleRetrySign = async () => {
        if (!recoveredAddr) return;

        try {
            setRetryStep('none');
            setStatus('Retrying upload with Crust W3Auth...');

            const sessionManager = new SessionManager(accountId!);
            // Crust W3Auth handles auth automatically via Session Key
            await processSignatureAndUpload(verifiedStorageFee, sessionManager, recoveredAddr);
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

            // --- PRE-CHECK: Session Key Status (from React Query cache) ---
            const sessionKeyExists = hasSessionKey === true;
            console.log("Session key status:", sessionKeyExists ? "EXISTS" : "NEEDS CREATION");

            // --- STEP 1: CALCULATE STORAGE FEE (Use pre-calculated state) ---
            const storageFee = estimatedStorageFee;
            setVerifiedStorageFee(storageFee);

            console.log(`Video Size: ${file.size} bytes. Fee: ${storageFee} NEAR`);

            // --- STEP 2: DYNAMIC GAS CHECK (Every upload) ---
            const { deriveEthAddress } = await import('@/lib/chain-signatures');
            const derivationPath = 'lit/pkp-minting';

            updateStep('session', 'loading');
            setStatus('Checking gas balance...');

            // PKP is now minted automatically on wallet connect (WalletProvider)
            // We just use the cached pkpData from context
            const hasPkpNow = !!pkpData;
            console.log(`📊 PKP Status: ${hasPkpNow ? 'Available' : 'Pending/None'} (minting: ${isPKPMinting})`);

            // Calculate minimum required:
            // With PKP: NFT (0.1) + Event (0.1) = 0.2 NEAR
            // Without PKP (MPC fallback): MPC (0.25) + NFT (0.1) + Event (0.1) = 0.45 NEAR
            const currentMinRequired = hasPkpNow ? 0.2 : 0.5;

            console.log(`📊 Gas Check: Balance=${gasBalance}, Required=${currentMinRequired}, HasPKP=${hasPkpNow}`);

            if (!sessionKeyExists) {
                // First time user - create session key with appropriate deposit
                setStatus('Setting up Session Key...');

                // Deposit amount based on PKP status:
                // - PKP available: 0.3 NEAR (NFT + Event + buffer)
                // - PKP unavailable: 1.0 NEAR (MPC + NFT + Event + safety margin)
                const depositAmount = hasPkpNow ? '0.3' : '1.0';

                if (!hasPkpNow) {
                    console.log(`⚠️ PKP unavailable - using silent MPC fallback with ${depositAmount} NEAR deposit`);
                } else {
                    console.log(`Creating session key (PKP available - depositing ${depositAmount} NEAR)...`);
                }

                await sessionManager.createSessionKey(wallet, depositAmount);
                // Refetch session key status in React Query cache
                refetchSessionKey();
                console.log("Session key created!");
            } else if (gasBalance < currentMinRequired) {
                // Returning user with insufficient balance - top up
                const topUpAmount = hasPkpNow
                    ? Math.ceil((currentMinRequired - gasBalance + 0.1) * 10) / 10
                    : 1.0; // 1 NEAR for MPC fallback

                setStatus(`Gas balance low (${gasBalance.toFixed(2)} NEAR). Topping up ${topUpAmount} NEAR...`);
                console.log(`⛽ Topping up gas: Current=${gasBalance}, Required=${currentMinRequired}, TopUp=${topUpAmount}`);

                await sessionManager.topUpGas(wallet, topUpAmount.toString());
                // Refetch balance in React Query cache
                refetchBalance();
                console.log(`✅ Gas topped up by ${topUpAmount} NEAR`);
            } else {
                console.log(`✅ Gas balance sufficient: ${gasBalance} >= ${currentMinRequired}`);
            }

            setStatus('Verifying Identity & Preparing Session...');

            // Derive MPC address (mathematical derivation - no gas cost)
            // Still needed for Lit Protocol session signatures
            const recoveredAddress = await deriveEthAddress(CONTRACT_ID, derivationPath);
            console.log('Identity Verified. MPC Address:', recoveredAddress);
            updateStep('session', 'complete');

            // --- STEP 3: Crust W3Auth (Signless) ---
            // With Crust W3Auth, authentication happens automatically during upload
            // using the Session Key stored in localStorage. No separate auth step needed!
            setStatus('Ready for decentralized upload via Crust W3Auth...');
            console.log('[Crust] W3Auth will use Session Key for signless authentication');

            // Continue with upload - Crust W3Auth handles auth automatically
            await processSignatureAndUpload(storageFee, sessionManager, recoveredAddress);

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
                <div className={`lg:col-span-2 px-4 py-2 rounded-xl border flex items-center gap-3 ${pkpData
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : hasSessionKey
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-zinc-900/50 border-white/5'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${pkpData
                        ? 'bg-amber-500/20 border border-amber-500/50'
                        : hasSessionKey
                            ? 'bg-blue-500/20 border border-blue-500/50'
                            : 'bg-zinc-800 border border-zinc-700'}`}>
                        {pkpData ? (
                            <CheckCircle2 className="w-4 h-4 text-amber-400" />
                        ) : hasSessionKey ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        ) : isPKPMinting ? (
                            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                        ) : (
                            <div className="w-3 h-3 rounded-full border-2 border-zinc-500 border-dashed animate-pulse" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${pkpData ? 'text-amber-300' : hasSessionKey ? 'text-blue-300' : 'text-zinc-300'}`}>
                            {pkpData ? '⚡ PKP Verified' : hasSessionKey ? '✓ Session Key Active' : isPKPMinting ? 'Setting up PKP...' : 'Pending Verification'}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                            {pkpData ? 'Signless uploads & playback' : hasSessionKey ? 'Session key enabled' : isPKPMinting ? 'Background setup in progress' : 'Complete first upload'}
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

                        {retryStep === 'pkp_link' && (
                            <Alert className="border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>One-Click Setup Blocked</AlertTitle>
                                <AlertDescription className="flex flex-col gap-2">
                                    <p>Your browser blocked the setup popup. Click below to enable faster future uploads.</p>
                                    <Button
                                        onClick={handleUpload}
                                        variant="outline"
                                        className="w-full border-blue-500/50 hover:bg-blue-500/20"
                                    >
                                        Try Setup Again
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
                                hasPKP={!!pkpData}
                                gasBalance={gasBalance}
                                requiredGas={REQUIRED_GAS}
                                needsTopUp={needsTopUp}
                                isFirstUpload={!hasSessionKey}
                            />
                        </div>
                    )}

                    {/* Loading indicator while PKP is being minted in background */}
                    {file && isPKPMinting && !pkpData && (
                        <div className="px-6 pb-2">
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4 flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-green-400" />
                                <span className="text-sm text-zinc-400">Setting up PKP for signless upload...</span>
                            </div>
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
