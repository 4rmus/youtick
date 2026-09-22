export const googleUploadAttemptKey = (market: string, accountId: string, jobId: string): string =>
    `youtick:auth-lab:upload:testnet:${market}:${accountId}:${jobId}`;
