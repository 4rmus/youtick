import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";

import { NEAR_AUTH_LIT_ACTION_CODE } from './near-auth-lit-action';
export const VERIFY_NEAR_LIT_ACTION_CODE = NEAR_AUTH_LIT_ACTION_CODE;

// Error types for PKP operations
export type PKPErrorCode = 'NETWORK_ERROR' | 'CONTRACT_ERROR';

export class PKPMintError extends Error {
    constructor(
        message: string,
        public readonly code: PKPErrorCode,
        public readonly retryable: boolean
    ) {
        super(message);
        this.name = 'PKPMintError';
    }
}

export class PKPManager {
    private litNodeClient: LitNodeClient;

    constructor(litNodeClient: LitNodeClient) {
        this.litNodeClient = litNodeClient;
    }

    /**
     * PKP minting - Relay tabanlı (gas-free for users)
     *
     * Relay API üzerinden PKP mint eder.
     * Kullanıcılar için gas ücreti yok (Lit Relay karşılıyor).
     *
     * @param nearAccountId - NEAR account ID
     */
    async mintPKPSmart(nearAccountId: string): Promise<{
        tokenId: string;
        publicKey: string;
        ethAddress: string;
        method: 'relay';
    }> {
        console.log(`[PKP] Minting PKP for ${nearAccountId} via relay`);
        const result = await this.mintViaRelayAPI(nearAccountId);
        console.log('[PKP] ✅ PKP minted via relay:', result.ethAddress);
        return { ...result, method: 'relay' };
    }

    /**
     * Mint PKP directly via contracts (BACKEND ONLY)
     * Requires tstLPX balance on Chronicle Yellowstone.
     * Used by /api/relayer/mint endpoint.
     *
     * @param signer - ethers.Signer with tstLPX balance
     */
    async mintPKPDirect(signer: any): Promise<{
        tokenId: string;
        publicKey: string;
        ethAddress: string;
        txHash: string;
    }> {
        const { LitContracts } = await import('@lit-protocol/contracts-sdk');
        const { LitNetwork } = await import('@lit-protocol/constants');
        const ethers5 = await import('ethers5');

        const rpcUrl = process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com';

        console.log('[PKP] Initializing LitContracts for direct mint...');
        const litContracts = new LitContracts({
            signer,
            network: LitNetwork.DatilTest,
            rpc: rpcUrl,
            debug: false
        }) as any;

        await litContracts.connect();
        console.log('[PKP] ✅ Lit Contracts Connected.');

        const mintCost = await litContracts.pkpNftContract.read.mintCost();
        console.log('[PKP] Mint cost:', ethers5.utils.formatEther(mintCost), 'tstLPX');

        const litActionIpfsCid = process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID ||
            'Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe';

        const authMethodType = 2;
        const authMethodId = litContracts.utils.getBytesFromMultihash(litActionIpfsCid);
        const authMethodPubkey = '0x';

        const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
            2,
            [authMethodType],
            [authMethodId],
            [authMethodPubkey],
            [[1, 2, 17]],
            true,
            true,
            { value: mintCost }
        );

        const receipt = await tx.wait();
        console.log('[PKP] ✅ Mint confirmed! Status:', receipt.status);

        let tokenId = '';
        const nftInterface = new ethers5.utils.Interface([
            'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
        ]);

        for (const log of receipt.logs) {
            try {
                const parsed = nftInterface.parseLog(log as any);
                if (parsed?.name === 'Transfer' && parsed.args.from === ethers5.constants.AddressZero) {
                    tokenId = parsed.args.tokenId.toString();
                    break;
                }
            } catch { /* ignore */ }
        }

        if (!tokenId) {
            throw new PKPMintError('Could not find PKP TokenId in logs', 'CONTRACT_ERROR', false);
        }

        const publicKey = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
        const ethAddress = ethers5.utils.computeAddress(publicKey);

        console.log('[PKP] ✅ PKP Minted:', { tokenId, ethAddress });

        return { tokenId, publicKey, ethAddress, txHash: receipt.transactionHash };
    }

    /**
     * Mint PKP via backend relay API (CLIENT-SIDE)
     * Gas-free for users - backend pays tstLPX.
     */
    private async mintViaRelayAPI(nearAccountId: string): Promise<{
        tokenId: string;
        publicKey: string;
        ethAddress: string;
    }> {
        const response = await fetch('/api/relayer/mint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nearAccountId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Relay mint failed' }));
            throw new PKPMintError(error.error || 'Relay mint failed', 'NETWORK_ERROR', true);
        }

        const data = await response.json();

        if (!data.pkp) {
            throw new PKPMintError('Invalid relay response', 'CONTRACT_ERROR', false);
        }

        return {
            tokenId: data.pkp.tokenId,
            publicKey: data.pkp.publicKey,
            ethAddress: data.pkp.ethAddress
        };
    }

    /**
     * Get session signatures for the PKP using the NEAR Auth Method.
     */
    async getPKPSessionSigs(pkpPublicKey: string, nearSignCallback: () => Promise<{ sig: string, msg: string, pk: string }>) {
        // This involves:
        // 1. Triggering the Lit Action to verify the NEAR signature
        // 2. Generating Session Sigs for the PKP Resource

        const { sig, msg, pk } = await nearSignCallback();

        return this.litNodeClient.getPkpSessionSigs({
            pkpPublicKey,
            authMethods: [
                {
                    authMethodType: 99999, // Custom Auth Type ID (hypothetical)
                    accessToken: JSON.stringify({ sig, msg, pk }), // Passing data via token field
                }
            ],
            resourceAbilityRequests: [
                {
                    resource: new LitPKPResource('*'),
                    ability: LitAbility.PKPSigning
                }
            ],
            litActionCode: VERIFY_NEAR_LIT_ACTION_CODE,
            jsParams: {
                publicKey: pk,
                sig: sig,
                message: msg
            }
        });
    }
}
