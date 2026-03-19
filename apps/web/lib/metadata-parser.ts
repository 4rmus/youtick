import { IPFS_CONFIG, METADATA_SCHEMA } from './constants';

function isIpfsUrl(str: string | null | undefined): boolean {
    return typeof str === 'string' && str.startsWith('ipfs://');
}

function isDirectUrl(str: string | null | undefined): boolean {
    return typeof str === 'string' && (str.startsWith('http://') || str.startsWith('https://'));
}

function isValidCidLike(str: string | null | undefined): boolean {
    if (!str || str.trim() === '') {
        return false;
    }

    return (str.startsWith('Qm') || str.startsWith('ba')) && str.length >= 20;
}

function isValidThumbnailCid(cid: string | null | undefined): boolean {
    if (!cid || cid.trim() === '') {
        return false;
    }

    return (cid.startsWith('Qm') || cid.startsWith('ba')) && cid.length >= 46;
}

function isValidThumbnailRef(ref: string | null | undefined): boolean {
    if (!ref || ref.trim() === '') {
        return false;
    }

    return isIpfsUrl(ref) || isDirectUrl(ref) || isValidThumbnailCid(ref);
}

function resolveThumbnailUrl(ref: string | null | undefined, placeholderImage: string): string {
    if (!ref || ref.trim() === '') {
        return placeholderImage;
    }

    if (isIpfsUrl(ref) || isDirectUrl(ref)) {
        return ref;
    }

    if (isValidThumbnailCid(ref)) {
        return `ipfs://${ref}`;
    }

    return placeholderImage;
}

export interface ParsedMetadata {
    title: string;
    thumbnailCid: string | null;
    thumbnailUrl: string;
    manifestCid: string | null;
}

export function parseTitleMetadata(
    rawTitle: string | undefined | null,
    fallbackTitle: string = 'Untitled',
): ParsedMetadata {
    const { delimiter } = METADATA_SCHEMA;
    const { placeholderImage } = IPFS_CONFIG;

    if (!rawTitle || rawTitle.trim() === '') {
        return {
            title: fallbackTitle,
            thumbnailCid: null,
            thumbnailUrl: placeholderImage,
            manifestCid: null,
        };
    }

    if (!rawTitle.includes(delimiter)) {
        return {
            title: rawTitle,
            thumbnailCid: null,
            thumbnailUrl: placeholderImage,
            manifestCid: null,
        };
    }

    const parts = rawTitle.split(delimiter);

    if (parts.length >= 4 && isValidCidLike(parts[2])) {
        const manifestCid = parts[2];
        const thumbnailRef = parts[1];
        const title = parts.slice(3).join(delimiter);
        const hasValidThumbnail = isValidThumbnailRef(thumbnailRef);

        return {
            title: title || fallbackTitle,
            thumbnailCid: hasValidThumbnail ? thumbnailRef : null,
            thumbnailUrl: resolveThumbnailUrl(thumbnailRef, placeholderImage),
            manifestCid,
        };
    }

    if (parts.length >= 3 && isValidCidLike(parts[0])) {
        const manifestCid = parts[0];
        const thumbnailRef = parts[1];
        const title = parts.slice(2).join(delimiter);
        const hasValidThumbnail = isValidThumbnailRef(thumbnailRef);

        return {
            title: title || fallbackTitle,
            thumbnailCid: hasValidThumbnail ? thumbnailRef : null,
            thumbnailUrl: resolveThumbnailUrl(thumbnailRef, placeholderImage),
            manifestCid,
        };
    }

    return {
        title: rawTitle,
        thumbnailCid: null,
        thumbnailUrl: placeholderImage,
        manifestCid: null,
    };
}
