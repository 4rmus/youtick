// Private Web -> Bridge service contract. Never accept this DTO directly from HTTP.
export type MpcCommand = {
    network: 'testnet'; market: string; accountId: string; purpose: 'ticket' | 'upload' | 'device';
    resourceId: string; attemptId: string; payloadBase64: string; payloadHash: string;
    amountUsdc: string; approvalToken: string; approvalExpiresAtMs: number;
};
export type MpcStatus = {
    network: 'testnet'; market: string; amountUsdc: string; payloadBase64: string;
    operationId: string; accountId: string; purpose: 'ticket' | 'upload' | 'device'; resourceId: string;
    state: 'RESERVED' | 'SUBMITTED' | 'MPC_VERIFIED' | 'TICKET_SUBMITTED' | 'TICKET_SETTLED' | 'UPLOAD_SETTLED' | 'DEVICE_SUBMITTED' | 'DEVICE_SETTLED'; payloadHash: string;
    upload?: MpcUploadResult;
    settledBlockHash?: string;
    innerHash?: string; innerBurntYocto?: string; outerHash?: string; signatureBase64?: string; reservedYocto: string; burntYocto?: string;
};
export type MpcSponsorBinding = {
    submit(command: MpcCommand): Promise<MpcStatus>;
    executeTicket?(accountId: string, operationId: string): Promise<MpcStatus | null>;
    executeDevice?(accountId: string, operationId: string): Promise<MpcStatus | null>;
    status(accountId: string, operationId?: string): Promise<MpcStatus | null>;
};

export type MpcUploadResult = {
    request: Record<string, string>;
    playbackSession: { session_public_key: string; certificate_sha256: string; authorization_duration_ms: string };
    signedDelegateBase64: string;
};
export const isMpcSettled = (payment: MpcStatus | null | undefined): boolean =>
    payment?.state === 'TICKET_SETTLED' || payment?.state === 'UPLOAD_SETTLED' || payment?.state === 'DEVICE_SETTLED';
