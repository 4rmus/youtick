export const googleUploadAttemptKey = (market: string, accountId: string, jobId: string): string =>
    `youtick:auth-lab:upload:testnet:${market}:${accountId}:${jobId}`;

export const productUploadAttemptKey = (market: string, accountId: string, jobId: string): string =>
    `youtick:auth-v1:upload:testnet:${market}:${accountId}:${jobId}`;
