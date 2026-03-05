/**
 * Metadata Parser Module
 * Centralized parsing of YouTick's title metadata encoding
 *
 * Schema v4: RealCID:::ThumbnailURL:::KeyCID:::Title (Paid videos with encryption key)
 * Schema v3: RealCID:::ThumbnailURL:::Title (Legacy/External URLs)
 * Schema v2: RealCID:::ThumbnailCID:::Title (Legacy IPFS)
 * Schema v1: RealCID:::Title (Legacy)
 *
 * ThumbnailURL can be:
 * - ipfs://{cid} - Protocol URLs
 * - https://... - Direct gateway URL
 * - Qm... or ba... - Legacy IPFS CID (converted to gateway URL)
 *
 * This eliminates ~80 lines of duplicate parsing logic across:
 * - useAllVideos.ts
 * - useOwnedTokens.ts
 * - TicketPurchaseCard.tsx
 * - IpfsPlayer.tsx
 */

import { IPFS_CONFIG, METADATA_SCHEMA } from './constants';

/**
 * Check if a string is an ipfs:// protocol URL
 */
function isIpfsUrl(str: string | null | undefined): boolean {
    return typeof str === 'string' && str.startsWith('ipfs://');
}

/**
 * Check if a string is a direct URL (http/https)
 */
function isDirectUrl(str: string | null | undefined): boolean {
    return typeof str === 'string' && (str.startsWith('http://') || str.startsWith('https://'));
}

/**
 * Check if a string looks like a CID (starts with Qm/ba and has reasonable length)
 * Used to detect keyCid in the 4-segment title format
 */
function isValidCidLike(str: string | null | undefined): boolean {
    if (!str || str.trim() === '') return false;
    return (str.startsWith('Qm') || str.startsWith('ba')) && str.length >= 20;
}

/**
 * Check if a CID looks valid (basic validation)
 * Returns false for empty, null, or obviously invalid CIDs
 */
function isValidThumbnailCid(cid: string | null | undefined): boolean {
    if (!cid || cid.trim() === '') return false;
    // Basic CID validation: should start with 'Qm' (CIDv0) or 'ba' (CIDv1) and have reasonable length
    return (cid.startsWith('Qm') || cid.startsWith('ba')) && cid.length >= 46;
}

/**
 * Check if a thumbnail reference is valid (ipfs:// URL, direct URL, or valid CID)
 */
function isValidThumbnailRef(ref: string | null | undefined): boolean {
    if (!ref || ref.trim() === '') return false;
    return isIpfsUrl(ref) || isDirectUrl(ref) || isValidThumbnailCid(ref);
}

/**
 * Build thumbnail URL from reference (ipfs:// URL, direct URL, or CID)
 */
function resolveThumbnailUrl(ref: string | null | undefined, gatewayUrl: string, placeholderImage: string): string {
    if (!ref || ref.trim() === '') return placeholderImage;

    // Special Protocol URL - use as-is (IPFSThumbnail component will handle resolution)
    if (isIpfsUrl(ref)) {
        return ref;
    }

    // Direct URL - use as-is
    if (isDirectUrl(ref)) {
        return ref;
    }

    // Legacy IPFS CID - construct gateway URL
    if (isValidThumbnailCid(ref)) {
        return `${gatewayUrl}/${ref}`;
    }

    return placeholderImage;
}

/**
 * Parsed metadata from encoded title string
 */
export interface ParsedMetadata {
    /** Display title for UI */
    title: string;
    /** Thumbnail reference (CID or ipfs:// URL) */
    thumbnailCid: string | null;
    /** Full thumbnail URL (ipfs:// or gateway URL) */
    thumbnailUrl: string;
    /** Real encrypted CID (first part) */
    realCid: string | null;
    /** Original raw title (for debugging) */
    rawTitle: string;
    /** Schema version detected (1=legacy, 2=IPFS CID, 3=External URL) */
    schemaVersion: 1 | 2 | 3;
}

/**
 * Parse encoded title metadata
 *
 * @param rawTitle - Raw title string from contract (e.g., "Qm123:::Qm456:::My Video")
 * @param fallbackTitle - Fallback title if parsing fails
 * @returns Parsed metadata object
 *
 * @example
 * // v2 format with thumbnail
 * parseTitleMetadata("QmReal:::QmThumb:::My Video Title")
 * // => { title: "My Video Title", thumbnailCid: "QmThumb", thumbnailUrl: "https://...", ... }
 *
 * @example
 * // v1 format (legacy)
 * parseTitleMetadata("QmReal:::My Video Title")
 * // => { title: "My Video Title", thumbnailCid: null, thumbnailUrl: placeholder, ... }
 *
 * @example
 * // Plain title (no encoding)
 * parseTitleMetadata("My Video Title")
 * // => { title: "My Video Title", thumbnailCid: null, thumbnailUrl: placeholder, ... }
 */
export function parseTitleMetadata(
    rawTitle: string | undefined | null,
    fallbackTitle: string = 'Untitled'
): ParsedMetadata {
    const { delimiter } = METADATA_SCHEMA;
    const { gatewayUrl, placeholderImage } = IPFS_CONFIG;

    // Handle null/undefined/empty
    if (!rawTitle || rawTitle.trim() === '') {
        return {
            title: fallbackTitle,
            thumbnailCid: null,
            thumbnailUrl: placeholderImage,
            realCid: null,
            rawTitle: rawTitle || '',
            schemaVersion: 1,
        };
    }

    // Check for encoded format
    if (!rawTitle.includes(delimiter)) {
        // Plain title, no encoding
        return {
            title: rawTitle,
            thumbnailCid: null,
            thumbnailUrl: placeholderImage,
            realCid: null,
            rawTitle,
            schemaVersion: 1,
        };
    }

    const parts = rawTitle.split(delimiter);

    if (parts.length >= 4 && isValidCidLike(parts[2])) {
        // v4 Format: RealCID:::ThumbnailRef:::KeyCID:::Title (paid videos with encryption key)
        const realCid = parts[0];
        const thumbnailRef = parts[1];
        // parts[2] is keyCid (encryption key CID) — not displayed
        const title = parts.slice(3).join(delimiter); // Handle titles with ::: in them

        const hasValidThumbnail = isValidThumbnailRef(thumbnailRef);
        const thumbnailUrl = resolveThumbnailUrl(thumbnailRef, gatewayUrl, placeholderImage);
        const schemaVersion = isIpfsUrl(thumbnailRef) ? 3 : 2;

        return {
            title: title || fallbackTitle,
            thumbnailCid: hasValidThumbnail ? thumbnailRef : null,
            thumbnailUrl,
            realCid,
            rawTitle,
            schemaVersion: schemaVersion as 1 | 2 | 3,
        };
    } else if (parts.length >= 3) {
        // v2/v3 Format: RealCID:::ThumbnailRef:::Title
        // ThumbnailRef can be:
        // - ipfs://... (v3 protocol URL)
        // - Qm.../ba... (v2 legacy IPFS CID)
        // - https://... (direct URL)
        const realCid = parts[0];
        const thumbnailRef = parts[1];
        const title = parts.slice(2).join(delimiter); // Handle titles with ::: in them

        // Validate and resolve thumbnail reference
        const hasValidThumbnail = isValidThumbnailRef(thumbnailRef);
        const thumbnailUrl = resolveThumbnailUrl(thumbnailRef, gatewayUrl, placeholderImage);

        // Determine schema version based on thumbnail type
        const schemaVersion = isIpfsUrl(thumbnailRef) ? 3 : 2;

        return {
            title: title || fallbackTitle,
            thumbnailCid: hasValidThumbnail ? thumbnailRef : null,
            thumbnailUrl,
            realCid,
            rawTitle,
            schemaVersion: schemaVersion as 1 | 2 | 3,
        };
    } else if (parts.length === 2) {
        // v1 Format: RealCID:::Title (legacy)
        const realCid = parts[0];
        const title = parts[1];

        return {
            title: title || fallbackTitle,
            thumbnailCid: null,
            thumbnailUrl: placeholderImage,
            realCid,
            rawTitle,
            schemaVersion: 1,
        };
    }

    // Fallback for unexpected format
    return {
        title: rawTitle,
        thumbnailCid: null,
        thumbnailUrl: placeholderImage,
        realCid: null,
        rawTitle,
        schemaVersion: 1,
    };
}

/**
 * Encode metadata into title string for contract storage
 *
 * @param realCid - The encrypted video CID
 * @param title - Display title
 * @param thumbnailCid - Optional thumbnail CID
 * @returns Encoded title string
 *
 * @example
 * encodeTitleMetadata("QmReal", "My Video", "QmThumb")
 * // => "QmReal:::QmThumb:::My Video"
 */
export function encodeTitleMetadata(
    realCid: string,
    title: string,
    thumbnailCid?: string
): string {
    const { delimiter } = METADATA_SCHEMA;

    if (thumbnailCid) {
        return `${realCid}${delimiter}${thumbnailCid}${delimiter}${title}`;
    }

    return `${realCid}${delimiter}${title}`;
}

/**
 * Extract real CID from title if encoded, otherwise return the input CID
 * Useful for resolving CIDs in watch/ticket pages
 *
 * @param cidOrTitle - Could be a plain CID or encoded title
 * @returns The real CID for IPFS fetch
 */
export function extractRealCid(cidOrTitle: string): string {
    const { delimiter } = METADATA_SCHEMA;

    if (cidOrTitle.includes(delimiter)) {
        const parts = cidOrTitle.split(delimiter);
        return parts[0];
    }

    return cidOrTitle;
}

/**
 * Check if a string looks like an IPFS CID (basic validation)
 */
export function isValidCid(str: string): boolean {
    // Basic check: starts with Qm (CIDv0) or ba (CIDv1)
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57})$/.test(str);
}

/**
 * Build thumbnail URL from reference (CID, ipfs:// URL, or direct URL)
 */
export function buildThumbnailUrl(thumbnailRef: string | null): string {
    return resolveThumbnailUrl(thumbnailRef, IPFS_CONFIG.gatewayUrl, IPFS_CONFIG.placeholderImage);
}
