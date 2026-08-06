export interface WalletInstance {
    signAndSendTransaction(params: {
        receiverId: string;
        actions: unknown[];
    }): Promise<object>;
    signAndSendTransactions(params: {
        transactions: Array<{ receiverId: string; actions: unknown[] }>;
    }): Promise<object[] | void>;
    getAccounts?(): Promise<Array<{ accountId: string }>>;
    signMessage?(params: {
        message: string;
        recipient: string;
        nonce: Uint8Array;
        state?: string;
    }): Promise<object>;
}
