import lighthouse from '@lighthouse-web3/sdk';
import { env } from './env';

/**
 * Upload file to Lighthouse (IPFS) without encryption
 * SECURITY: Requires server-side API key
 */
export async function uploadFile(file: File) {
    const output = await lighthouse.upload(
        [file],
        env.lighthouseApiKey
    );
    return output;
}

/**
 * Upload encrypted file to Lighthouse (IPFS)
 * SECURITY: File is encrypted before upload, only accessible with proper signature
 */
export async function uploadEncryptedFile(
    file: File,
    publicKey: string,
    signedMessage: string,
    uploadProgressCallback?: (data: any) => void,
    dealParams?: any
) {
    // SDK Signature: (path: any, apiKey: string, publicKey: string, signedMessage: string, cidVersion?: number, uploadProgressCallback?: ((data: any) => void) | undefined)
    // Note: dealParams is not supported in uploadEncrypted according to types, but we keep the argument in wrapper for future compatibility or if we switch methods.

    try {
        const apiKey = env.lighthouseApiKey.trim();
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
