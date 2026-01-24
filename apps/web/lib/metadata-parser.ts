/**
 * Metadata Parser Module
 * Centralized parsing of YouTick's title metadata encoding
 *
 * Schema: RealCID:::ThumbnailCID:::Title (v2)
 * Legacy:  RealCID:::Title (v1)
 *
 * This eliminates ~80 lines of duplicate parsing logic across:
 * - useAllVideos.ts
 * - useOwnedTokens.ts
 * - TicketPurchaseCard.tsx
 * - IpfsPlayer.tsx
 */

import { IPFS_CONFIG, METADATA_SCHEMA } from './constants';

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
 * Parsed metadata from encoded title string
 */
export interface ParsedMetadata {
    /** Display title for UI */
    title: string;
    /** Thumbnail CID (if present in v2 format) */
    thumbnailCid: string | null;
    /** Full thumbnail URL */
    thumbnailUrl: string;
    /** Real encrypted CID (first part) */
    realCid: string | null;
    /** Original raw title (for debugging) */
    rawTitle: string;
    /** Schema version detected (1 or 2) */
    schemaVersion: 1 | 2;
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

    if (parts.length >= 3) {
        // v2 Format: RealCID:::ThumbnailCID:::Title
        const realCid = parts[0];
        const thumbnailCid = parts[1];
        const title = parts.slice(2).join(delimiter); // Handle titles with ::: in them

        // Validate thumbnail CID
        const hasValidThumbnail = isValidThumbnailCid(thumbnailCid);

        return {
            title: title || fallbackTitle,
            thumbnailCid: hasValidThumbnail ? thumbnailCid : null,
            thumbnailUrl: hasValidThumbnail ? `${gatewayUrl}/${thumbnailCid}` : placeholderImage,
            realCid,
            rawTitle,
            schemaVersion: 2,
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
 * Build thumbnail URL from CID
 */
export function buildThumbnailUrl(thumbnailCid: string | null): string {
    if (!isValidThumbnailCid(thumbnailCid)) {
        return IPFS_CONFIG.placeholderImage;
    }
    return `${IPFS_CONFIG.gatewayUrl}/${thumbnailCid}`;
}
