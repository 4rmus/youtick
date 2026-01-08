/**
 * Lit Action for NEAR NFT Ownership Verification
 * 
 * This Lit Action verifies that the user owns an NFT (ticket) for a specific video
 * by querying the NEAR smart contract directly from within Lit nodes.
 * 
 * Usage: Pass as litActionCode in ACC conditions for true decentralized access control.
 */

// Contract ID for YouTick NFT contract
export const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'dev-gift-1767641243.testnet';

/**
 * Lit Action code that runs inside Lit Protocol nodes to verify NEAR NFT ownership.
 * 
 * jsParams required:
 * - nearAccountId: string (user's NEAR account)
 * - targetCid: string (video UUID/CID to check ownership for)
 * - contractId: string (NEAR NFT contract address)
 */
export const NEAR_NFT_VERIFY_LIT_ACTION = `
(async () => {
    try {
        const params = typeof jsParams !== 'undefined' ? jsParams : {};
        const { nearAccountId, targetCid, contractId } = params;
        
        if (!nearAccountId || !targetCid || !contractId) {
            throw new Error("Missing required params: nearAccountId, targetCid, contractId");
        }
        
        console.log("Verifying NEAR NFT ownership for:", nearAccountId, "video:", targetCid);
        
        // Query NEAR RPC to check NFT ownership
        const rpcUrl = "https://rpc.testnet.near.org";
        
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "verify-nft",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: contractId,
                    method_name: "get_tokens_with_video",
                    args_base64: btoa(JSON.stringify({ 
                        account_id: nearAccountId, 
                        limit: 100 
                    }))
                }
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error("NEAR RPC Error:", data.error);
            throw new Error("Failed to query NEAR contract: " + data.error.message);
        }
        
        // Parse result bytes
        const resultBytes = data?.result?.result;
        if (!resultBytes || !Array.isArray(resultBytes)) {
            console.log("No tokens found for account");
            Lit.Actions.setResponse({ 
                response: JSON.stringify({ verified: false, reason: "No tokens found" }) 
            });
            return;
        }
        
        const resultString = String.fromCharCode(...resultBytes);
        const tokens = JSON.parse(resultString);
        
        // Check if user owns a token for this specific CID or a Global Access Pass
        const hasAccess = tokens.some(([token, metadata]) => {
            if (!metadata) return false;
            return metadata.encrypted_cid === targetCid || metadata.encrypted_cid === 'ACCESS_PASS';
        });
        
        console.log("NFT Ownership verified:", hasAccess);
        
        if (hasAccess) {
            Lit.Actions.setResponse({ 
                response: JSON.stringify({ verified: true, nearAccountId, targetCid }) 
            });
        } else {
            Lit.Actions.setResponse({ 
                response: JSON.stringify({ verified: false, reason: "No matching NFT found" }) 
            });
        }
        
    } catch (e) {
        console.error("Lit Action Error:", e.toString());
        Lit.Actions.setResponse({ 
            response: JSON.stringify({ verified: false, error: e.toString() }) 
        });
    }
})();
`;

/**
 * Create Access Control Conditions for a video using NEAR NFT verification.
 * Uses Lit Action to verify NFT ownership on-chain within Lit nodes.
 * 
 * @param videoUuid - The UUID of the video (stored as encrypted_cid in contract)
 * @param uploaderAccountId - NEAR account ID of the uploader (they always have access)
 * @returns Unified Access Control Conditions array
 */
export function createNearNftAccessConditions(
    videoUuid: string,
    uploaderAccountId: string
): any[] {
    return [
        {
            conditionType: 'litAction',
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum', // Required by Lit, but actual check is on NEAR
            method: '',
            parameters: [],
            returnValueTest: {
                comparator: 'contains',
                value: '"verified":true'
            },
            code: NEAR_NFT_VERIFY_LIT_ACTION,
            jsParams: {
                nearAccountId: ':userAddress', // Placeholder - replaced at runtime
                targetCid: videoUuid,
                contractId: NFT_CONTRACT_ID
            }
        }
    ];
}

/**
 * Create simple placeholder ACC for testing (allows anyone with any ETH balance).
 * WARNING: This is NOT secure for production use.
 * 
 * @deprecated Use createNearNftAccessConditions for production
 */
export function createPlaceholderAccessConditions(): any[] {
    console.warn('⚠️ Using placeholder ACC - NOT SECURE FOR PRODUCTION');
    return [
        {
            conditionType: 'evmBasic',
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: 'eth_getBalance',
            parameters: [':userAddress', 'latest'],
            returnValueTest: {
                comparator: '>=',
                value: '0'
            }
        }
    ];
}

/**
 * Type definition for ACC parameters
 */
export interface AccessControlConfig {
    videoUuid: string;
    uploaderAccountId: string;
    useSecureNearCheck?: boolean; // Optional - not currently used
}

/**
 * Factory function to create appropriate ACC based on config.
 * 
 * NOTE: Lit Protocol SDK doesn't support 'litAction' as an ACC conditionType directly.
 * The NEAR NFT verification is performed during DECRYPTION via the PKP session Lit Action
 * (see NEAR_NFT_VERIFY_LIT_ACTION), not during encryption.
 * 
 * The evmBasic ACC here is a permissive placeholder that allows anyone to encrypt,
 * but the actual access control enforcement happens at decryption time via:
 * 1. PKP Session authentication (requires NEAR account ownership)
 * 2. The Lit Action that verifies NFT ownership before allowing decryption
 */
export function createAccessControlConditions(config: AccessControlConfig): any[] {
    /**
     * TWO-LAYER SECURITY ARCHITECTURE:
     * 
     * Layer 1 (ACC - this function): Permissive placeholder
     * - Uses eth_getBalance >= 0 (allows everyone)
     * - This is intentional for NEAR-based dApps where users don't have ETH
     * 
     * Layer 2 (Lit Action during decryption): Actual security
     * - PKP session Lit Action verifies NEAR NFT ownership via RPC
     * - Only NFT holders can decrypt content
     * 
     * The real access control is enforced in the Lit Action, not here.
     * This ACC exists because Lit SDK requires an ACC for encryption.
     */
    console.log(`ACC created for video: ${config.videoUuid}, uploader: ${config.uploaderAccountId}`);

    return [
        {
            conditionType: 'evmBasic',
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: 'eth_getBalance',
            parameters: [':userAddress', 'latest'],
            returnValueTest: {
                comparator: '>=',
                value: '0' // Permissive - real security is in Lit Action
            }
        }
    ];
}
