import lighthouse from '@lighthouse-web3/sdk';
import { env } from './env';

/**
 * Upload file to Lighthouse (IPFS) via Server Proxy
 * SECURITY: No Client-side API Key required.
 */
export async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/lighthouse/upload', {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
    }

    const data = await res.json();
    // Maintain interface compatibility for calling code
    // SDK returns { data: { Hash... } }, our proxy returns just the inner object.
    // Let's wrap it to match { data: ... } expectation if needed, or adjust caller.
    // Existing caller expects: UploadResponse { data: Array<{Hash}> | {Hash} }
    return { data: data };
}

/**
 * Upload encrypted file to Lighthouse (IPFS)
 * SECURITY: File is encrypted before upload, only accessible with proper signature
 */
export async function uploadEncryptedFile(
    file: File,
    apiKey: string,
    publicKey: string,
    signedMessage: string,
    uploadProgressCallback?: (data: any) => void,
    dealParams?: any
) {
    // SDK Signature: (path: any, apiKey: string, publicKey: string, signedMessage: string, cidVersion?: number, uploadProgressCallback?: ((data: any) => void) | undefined)
    // Note: dealParams is not supported in uploadEncrypted according to types, but we keep the argument in wrapper for future compatibility or if we switch methods.

    try {
        const response = await lighthouse.uploadEncrypted(
            [file], // Wrap file in array as SDK expects a list
            apiKey,
            publicKey,
            signedMessage,
            1, // cidVersion (default 1)
            uploadProgressCallback
        );

        // Lighthouse SDK returns error message as string if it catches an error
        if (typeof response === 'string') {
            throw new Error(response);
        }

        return response;
    } catch (error: any) {
        console.error('Lighthouse Upload Error:', error);
        if (error.response) {
            try {
                const errorText = await error.response.text();
                console.error('Lighthouse Error Response:', errorText);
            } catch (e) {
                console.error('Could not read error response text');
            }
        }
        throw error;
    }
}

/**
 * Apply access conditions to encrypted file on Lighthouse
 * SECURITY: Defines who can decrypt and access the file
 */
export async function applyAccessConditions(
    cid: string,
    conditions: any[],
    aggregator: string = '([1])',
    publicKey: string,
    signedMessage: string,
    chainType: string = 'EVM'
) {
    const response = await lighthouse.applyAccessCondition(
        publicKey,
        cid,
        signedMessage,
        conditions,
        aggregator,
        chainType as any
    );

    return response;
}
