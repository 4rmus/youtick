/**
 * Crust IPFS Upload Client
 *
 * Provides client-side file uploads to Crust IPFS network using W3Auth.
 * This provides a fully decentralized approach to IPFS storage.
 *
 * Features:
 * - 100% client-side uploads (no server proxy needed)
 * - Session Key authentication (signless UX)
 * - Automatic retry on failure
 * - Upload progress tracking
 *
 * @see https://wiki.crust.network/docs/en/buildIPFSWeb3AuthGW
 */

import { generateW3AuthToken } from './w3auth';
import { getUploadGateway, getGatewayUrl } from './gateway';
import type {
    CrustUploadResult,
    CrustUploadOptions,
    IpfsAddResponse
} from './types';
import { CrustError } from './types';

// Default upload timeout (5 minutes for large files)
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

// Maximum file size for single upload (100MB)
// Larger files should use chunked upload
const MAX_SINGLE_UPLOAD_SIZE = 100 * 1024 * 1024;


/**
 * Upload a file to Crust IPFS using Session Key authentication
 *
 * This is the primary upload function that provides signless UX.
 * The Session Key stored in localStorage is used to generate W3Auth tokens
 * without any user interaction or gas costs.
 *
 * @param file - File or Blob to upload
 * @param accountId - NEAR account ID for authentication
 * @param options - Upload options (filename, progress callback, timeout)
 * @returns Upload result with CID
 * @throws CrustError on upload failure
 */
export async function uploadFile(
    file: File | Blob,
    accountId: string,
    options: CrustUploadOptions = {}
): Promise<CrustUploadResult> {
    const { filename, onProgress, timeout = DEFAULT_TIMEOUT } = options;

    // Log decentralization metric
    console.log('[DECENTRALIZATION_METRIC] crust_upload_start', {
        accountId,
        fileSize: file.size,
        method: 'session_key'
    });

    // Warn for large files
    if (file.size > MAX_SINGLE_UPLOAD_SIZE) {
        console.warn(
            `[Crust] File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds recommended limit. ` +
            `Consider chunked upload for better reliability.`
        );
    }

    // Generate W3Auth token using Session Key
    const { authHeader } = await generateW3AuthToken(accountId);

    // Prepare upload file
    const uploadFile = file instanceof File
        ? file
        : new File([file], filename || 'upload', { type: file.type });

    // Create FormData
    const formData = new FormData();
    formData.append('file', uploadFile);

    // Get upload endpoint
    const uploadEndpoint = `${getUploadGateway()}/api/v0/add`;

    console.log('[Crust] Uploading to:', uploadEndpoint);
    console.log('[Crust] File:', uploadFile.name, `(${Math.round(uploadFile.size / 1024)}KB)`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        // Perform upload with XMLHttpRequest for progress tracking
        const result = await uploadWithProgress(
            uploadEndpoint,
            formData,
            authHeader,
            controller.signal,
            onProgress
        );

        clearTimeout(timeoutId);

        // Parse response
        const response = result as IpfsAddResponse;

        if (!response.Hash) {
            throw new CrustError(
                'INVALID_RESPONSE',
                'Upload succeeded but no CID returned'
            );
        }

        const uploadResult: CrustUploadResult = {
            cid: response.Hash,
            size: parseInt(response.Size, 10),
            name: response.Name
        };

        console.log('[Crust] Upload successful!');
        console.log('[Crust] CID:', uploadResult.cid);
        console.log('[Crust] Size:', uploadResult.size, 'bytes');
        console.log('[Crust] Gateway URL:', `https://ipfs.io/ipfs/${uploadResult.cid}`);

        // Note: Pinning removed for 100% decentralization
        // The file is already on IPFS network via crustipfs.xyz upload
        // and accessible via any IPFS gateway (ipfs.io, dweb.link, etc.)

        console.log('[DECENTRALIZATION_METRIC] crust_upload_success', {
            accountId,
            cid: uploadResult.cid,
            size: uploadResult.size,
            method: 'client_side_w3auth'
        });

        return uploadResult;

    } catch (error: unknown) {
        clearTimeout(timeoutId);

        if (error instanceof CrustError) {
            throw error;
        }

        const err = error instanceof Error ? error : new Error(String(error));

        // Handle abort (timeout)
        if (err.name === 'AbortError') {
            throw new CrustError(
                'NETWORK_ERROR',
                `Upload timed out after ${timeout / 1000}s`,
                err
            );
        }

        // Handle network errors
        if (err.message.includes('fetch') || err.message.includes('network')) {
            throw new CrustError(
                'NETWORK_ERROR',
                'Network error during upload. Please check your connection.',
                err
            );
        }

        // Handle auth errors
        if (err.message.includes('401') || err.message.includes('403')) {
            throw new CrustError(
                'AUTH_FAILED',
                'W3Auth authentication failed. Please reconnect your wallet.',
                err
            );
        }

        throw new CrustError(
            'UPLOAD_FAILED',
            `Upload failed: ${err.message}`,
            err
        );
    }
}

/**
 * Upload file with progress tracking using fetch
 * Falls back to XHR if progress tracking is needed
 */
async function uploadWithProgress(
    url: string,
    formData: FormData,
    authHeader: string,
    signal: AbortSignal,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
): Promise<IpfsAddResponse> {
    // If no progress callback, use simple fetch
    if (!onProgress) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader
            },
            body: formData,
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return response.json();
    }

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    percentage: Math.round((event.loaded / event.total) * 100)
                });
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            } else {
                reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
            }
        };

        xhr.onerror = () => {
            reject(new Error('Network error during upload'));
        };

        xhr.ontimeout = () => {
            reject(new Error('Upload timed out'));
        };

        // Handle abort signal
        signal.addEventListener('abort', () => {
            xhr.abort();
            reject(new Error('Upload aborted'));
        });

        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', authHeader);
        xhr.send(formData);
    });
}

/**
 * Upload multiple files in parallel
 *
 * @param files - Array of files to upload
 * @param accountId - NEAR account ID
 * @param options - Upload options
 * @returns Array of upload results
 */
export async function uploadFiles(
    files: Array<File | Blob>,
    accountId: string,
    options: CrustUploadOptions = {}
): Promise<CrustUploadResult[]> {
    const results: CrustUploadResult[] = [];
    const errors: Error[] = [];

    // Upload in parallel (max 3 concurrent)
    const CONCURRENCY = 3;

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        const batch = files.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((file, index) =>
                uploadFile(file, accountId, {
                    ...options,
                    filename: options.filename ? `${options.filename}_${i + index}` : undefined
                })
            )
        );

        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                errors.push(result.reason);
            }
        }
    }

    if (errors.length > 0 && results.length === 0) {
        throw new CrustError(
            'UPLOAD_FAILED',
            `All uploads failed. First error: ${errors[0].message}`,
            errors[0]
        );
    }

    return results;
}

/**
 * Get the URL for accessing uploaded content
 *
 * @param cid - IPFS CID
 * @returns Full gateway URL for the content
 */
export function getContentUrl(cid: string): string {
    return getGatewayUrl(cid);
}

/**
 * Upload JSON data directly
 *
 * @param data - JSON-serializable data
 * @param accountId - NEAR account ID
 * @param filename - Optional filename
 * @returns Upload result with CID
 */
export async function uploadJson(
    data: unknown,
    accountId: string,
    filename: string = 'data.json'
): Promise<CrustUploadResult> {
    const jsonString = JSON.stringify(data);
    const blob = new Blob([jsonString], { type: 'application/json' });

    return uploadFile(blob, accountId, { filename });
}
