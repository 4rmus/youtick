/**
 * Upload Service Module
 * Handles video upload operations including encryption, IPFS storage, and NFT minting
 *
 * Extracted from UploadForm.tsx to reduce complexity and enable reuse
 *
 * Storage Provider: Crust Network (W3Auth)
 * - 100% client-side uploads via Session Key authentication
 * - No server proxy required (fully decentralized)
 */

import { uploadFile as crustUploadFile } from './crust';
import { lit } from './lit';
import { SessionManager } from './session-manager';
import { batchUploadActionsSignless } from './batch-transactions';
import { createAccessControlConditions } from './access-conditions';
import { ethers } from 'ethers';
import { nearToYocto } from 'near-api-js';
import { IPFS_CONFIG } from './constants';
import { encodeTitleMetadata } from './metadata-parser';
import type { LitSessionSigs, LitAccessControlCondition } from './types';

// ============================================================================
// Types
// ============================================================================

export interface PKPData {
    publicKey: string;
    ethAddress: string;
    tokenId?: string;
}

export interface UploadResult {
    encryptedCid: string;
    thumbnailCid: string;
    videoUuid: string;
}

export interface MintResult {
    tokenId?: string;
    transactionHash?: string;
}

export interface UploadMetadata {
    title: string;
    description: string;
    price: string; // In NEAR
}

/**
 * Wallet interface for upload operations
 */
export interface UploadWallet {
    signAndSendTransaction: (params: {
        receiverId: string;
        actions: unknown[];
    }) => Promise<{ transaction: { hash: string } }>;
    signAndSendTransactions: (params: {
        transactions: Array<{
            receiverId: string;
            actions: unknown[];
        }>;
    }) => Promise<Array<{ transaction: { hash: string } }>>;
}

export interface UploadContext {
    accountId: string;
    wallet: UploadWallet;
    sessionManager: SessionManager;
    pkpData?: PKPData | null;
    onStatusUpdate?: (status: string) => void;
}

// ============================================================================
// Thumbnail Upload
// ============================================================================

/**
 * Upload thumbnail to IPFS (public, unencrypted)
 * Uses Crust W3Auth with Session Key for signless upload
 *
 * @param thumbnail - Thumbnail blob
 * @param accountId - NEAR account ID for W3Auth
 * @returns IPFS CID of the uploaded thumbnail
 */
export async function uploadThumbnail(thumbnail: Blob, accountId: string): Promise<string> {
    console.log('[Upload] Uploading thumbnail via Crust W3Auth...');

    const result = await crustUploadFile(thumbnail, accountId, {
        filename: 'thumbnail.jpg'
    });

    if (!result.cid) {
        throw new Error('Thumbnail upload succeeded but no CID returned');
    }

    console.log('[Upload] Thumbnail CID:', result.cid);
    return result.cid;
}

// ============================================================================
// Session Signatures
// ============================================================================

/**
 * Get Lit Protocol session signatures
 * Tries PKP first (signless), falls back to MPC
 *
 * @param context - Upload context with wallet and account info
 * @param mpcEthAddress - MPC-derived Ethereum address for Lit session (optional with PKP)
 * @returns Session signatures for Lit Protocol
 */
export async function getSessionSignatures(
    context: UploadContext,
    mpcEthAddress: string = ''
): Promise<LitSessionSigs> {
    const { accountId, wallet, sessionManager, pkpData, onStatusUpdate } = context;

    // Check for cached PKP
    let pkp = pkpData;
    if (!pkp) {
        const cachedPkp = typeof localStorage !== 'undefined'
            ? localStorage.getItem(`lit_pkp_${accountId}`)
            : null;
        if (cachedPkp) {
            try {
                pkp = JSON.parse(cachedPkp);
            } catch (e) {
                console.warn("Error parsing cached PKP:", e);
            }
        }
    }

    // Try PKP-based signless session (no MPC cost)
    if (pkp) {
        onStatusUpdate?.('Using PKP for signless authentication...');
        try {
            const sessionSigs = await lit.getSessionSigsWithPKP(
                pkp.publicKey,
                pkp.ethAddress,
                accountId
            );
            console.log("✅ PKP session sigs obtained!");
            return sessionSigs;
        } catch (pkpError: unknown) {
            const errorMessage = pkpError instanceof Error ? pkpError.message : 'Unknown error';
            console.warn("PKP session failed, falling back to MPC:", errorMessage);
        }
    }

    // MPC Fallback - requires gas for MPC signature
    onStatusUpdate?.('Signing with Session Key (MPC)...');

    const signWithSessionKey = async (_w: unknown, _accId: string, path: string, msg: string) => {
        const messageHash = ethers.hashMessage(msg);
        const payload = Array.from(ethers.getBytes(messageHash));

        return await sessionManager.callMethod('sign_with_mpc', {
            payload,
            path,
            key_version: 0
        });
    };

    const sessionSigs = await lit.getSessionSigs(
        wallet,
        accountId,
        mpcEthAddress,
        signWithSessionKey,
        undefined,
        undefined,
        'lit/pkp-minting'
    );

    return sessionSigs;
}

// ============================================================================
// Video Encryption & Upload
// ============================================================================

export interface EncryptionResult {
    ciphertext: string;
    dataToEncryptHash: string;
    accessControlConditions: LitAccessControlCondition[];
    videoUuid: string;
    encryptedFileCid: string;
}

/**
 * Encrypt video file with Lit Protocol and upload to IPFS
 *
 * @param file - Video file to encrypt
 * @param sessionSigs - Lit Protocol session signatures
 * @param accountId - NEAR account ID of the uploader
 * @param onStatusUpdate - Optional status callback
 * @returns Encryption result with CIDs
 */
export async function encryptAndUpload(
    file: File,
    sessionSigs: LitSessionSigs,
    accountId: string,
    onStatusUpdate?: (status: string) => void
): Promise<EncryptionResult> {
    onStatusUpdate?.('Encrypting file with Lit Protocol...');

    // Generate UUID for Access Control
    const videoUuid = crypto.randomUUID();
    console.log("Generated Video UUID for Access Control:", videoUuid);

    // Create access control conditions using NEAR NFT verification
    const accessControlConditions = createAccessControlConditions({
        videoUuid,
        uploaderAccountId: accountId,
        useSecureNearCheck: true
    });

    // Encrypt file
    const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
        file,
        accessControlConditions,
        undefined,
        'ethereum',
        sessionSigs
    );

    onStatusUpdate?.('Uploading encrypted video to Crust IPFS...');

    // Create metadata blob with encryption info
    const encryptedContent = {
        ciphertext,
        dataToEncryptHash,
        accessControlConditions
    };

    const metadataBlob = new Blob([JSON.stringify(encryptedContent)], { type: 'application/json' });

    // Upload to Crust IPFS via W3Auth (signless, client-side)
    console.log('[Upload] Uploading encrypted content via Crust W3Auth...');
    const uploadResult = await crustUploadFile(metadataBlob, accountId, {
        filename: `${file.name}.encrypted.json`
    });

    if (!uploadResult.cid) {
        throw new Error('Upload succeeded but no CID returned');
    }

    console.log('[Upload] Encrypted File CID:', uploadResult.cid);
    const fileHash = uploadResult.cid;

    return {
        ciphertext,
        dataToEncryptHash,
        accessControlConditions,
        videoUuid,
        encryptedFileCid: fileHash
    };
}

// ============================================================================
// NFT Minting & Event Creation
// ============================================================================

export interface MintAndCreateEventParams {
    sessionManager: SessionManager;
    accountId: string;
    encryptedFileCid: string;
    thumbnailCid: string | null;
    videoUuid: string;
    metadata: UploadMetadata;
    onStatusUpdate?: (status: string) => void;
}

/**
 * Mint NFT ticket and create event on NEAR blockchain
 * Uses signless batch transaction via session key
 *
 * @param params - Minting parameters
 * @returns Minting result
 */
export async function mintTicketAndCreateEvent(params: MintAndCreateEventParams): Promise<MintResult> {
    const {
        sessionManager,
        accountId,
        encryptedFileCid,
        thumbnailCid,
        videoUuid,
        metadata,
        onStatusUpdate
    } = params;

    onStatusUpdate?.('Minting Ticket...');

    // Build title with metadata encoding
    // v2 format: RealCID:::ThumbnailCID:::Title (with thumbnail)
    // v1 format: RealCID:::Title (without thumbnail)
    const eventTitle = thumbnailCid
        ? encodeTitleMetadata(encryptedFileCid, metadata.title, thumbnailCid)
        : `${encryptedFileCid}:::${metadata.title}`;

    // Build media URL (empty if no thumbnail)
    const mediaUrl = thumbnailCid ? `${IPFS_CONFIG.gatewayUrl}/${thumbnailCid}` : '';

    // Convert price to yoctoNEAR
    const priceYocto = nearToYocto(parseFloat(metadata.price) || 0);

    // Prepare video metadata for NFT
    const videoMetadata = {
        receiver_id: accountId,
        token_metadata: {
            title: eventTitle,
            description: metadata.description || 'Uploaded via Youtick',
            media: mediaUrl,
            copies: 1
        },
        video_metadata: {
            encrypted_cid: videoUuid,
            duration_seconds: 0,
            content_type: 'Exclusive'
        }
    };

    // Prepare event metadata
    const eventMetadata = {
        encrypted_cid: videoUuid,
        title: eventTitle,
        description: metadata.description || 'No description provided',
        price: priceYocto.toString()
    };

    console.log('📝 Video metadata being sent to contract:', videoMetadata);

    // Execute batch transaction (signless via session key)
    await batchUploadActionsSignless(
        sessionManager,
        videoMetadata,
        eventMetadata
    );

    return {};
}

// ============================================================================
// Full Upload Flow
// ============================================================================

export interface FullUploadParams {
    file: File;
    thumbnail: Blob | null;
    metadata: UploadMetadata;
    context: UploadContext;
    /** MPC-derived ETH address for Lit Protocol (optional - PKP is preferred) */
    mpcEthAddress?: string;
    onStepComplete?: (step: string) => void;
    onStatusUpdate?: (status: string) => void;
}

export interface FullUploadResult {
    encryptedFileCid: string;
    thumbnailCid: string | null;
    videoUuid: string;
}

/**
 * Execute full upload flow
 * Coordinates all steps: thumbnail, session, encrypt, upload, mint
 *
 * Storage: Crust Network (W3Auth with Session Key)
 * - 100% client-side, signless uploads
 * - No server proxy required
 *
 * @param params - Upload parameters
 * @returns Upload result with all CIDs
 */
export async function executeFullUpload(params: FullUploadParams): Promise<FullUploadResult> {
    const {
        file,
        thumbnail,
        metadata,
        context,
        mpcEthAddress,
        onStepComplete,
        onStatusUpdate
    } = params;

    console.log('[DECENTRALIZATION_METRIC] upload_flow_start', {
        accountId: context.accountId,
        storage: 'crust_w3auth'
    });

    // Step 1: Upload thumbnail via Crust W3Auth (signless)
    let thumbnailCid: string | null = null;
    if (thumbnail) {
        onStatusUpdate?.('Uploading thumbnail to Crust IPFS...');
        thumbnailCid = await uploadThumbnail(thumbnail, context.accountId);
        console.log('[Upload] Thumbnail uploaded CID:', thumbnailCid);
    }
    onStepComplete?.('thumbnail');

    // Step 2: Get Lit Protocol session signatures
    onStatusUpdate?.('Getting Lit session signatures...');
    const sessionSigs = await getSessionSignatures(context, mpcEthAddress);
    onStepComplete?.('session');

    // Step 3: Encrypt and upload video
    const encryptResult = await encryptAndUpload(
        file,
        sessionSigs,
        context.accountId,
        onStatusUpdate
    );
    onStepComplete?.('encrypt');
    onStepComplete?.('upload');

    // Step 4: Mint NFT and create event
    await mintTicketAndCreateEvent({
        sessionManager: context.sessionManager,
        accountId: context.accountId,
        encryptedFileCid: encryptResult.encryptedFileCid,
        thumbnailCid,
        videoUuid: encryptResult.videoUuid,
        metadata,
        onStatusUpdate
    });
    onStepComplete?.('mint');
    onStepComplete?.('event');

    return {
        encryptedFileCid: encryptResult.encryptedFileCid,
        thumbnailCid,
        videoUuid: encryptResult.videoUuid
    };
}
