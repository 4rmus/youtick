import lighthouse from '@lighthouse-web3/sdk';
import { env } from './env';

/**
 * Upload file to Lighthouse (IPFS) without encryption
 * SECURITY: Requires an API key (User's own key or App's key)
 */
export async function uploadFile(file: File, apiKey?: string) {
    const keyToUse = apiKey || env.lighthouseApiKey;
    if (!keyToUse) throw new Error("No API Key provided for Lighthouse upload");

    const output = await lighthouse.upload(
        [file],
        keyToUse
    );
    return output;
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
