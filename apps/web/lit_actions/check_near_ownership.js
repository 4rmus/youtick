/**
 * Lit Action to check if a user owns a specific NFT on NEAR.
 * 
 * Params:
 * - contractId: The NEAR NFT contract ID
 * - tokenId: The ID of the token to check
 * - userId: The NEAR account ID of the viewer (claimer)
 */

const checkOwnership = async () => {
    try {
        const rpcUrl = "https://rpc.testnet.near.org";

        // Args for nft_token must be base64 encoded
        const args = JSON.stringify({ token_id: tokenId });
        const argsBase64 = Buffer.from(args).toString('base64');

        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
                request_type: "call_function",
                finality: "final",
                account_id: contractId,
                method_name: "nft_token",
                args_base64: argsBase64
            }
        });

        const resp = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body
        });

        const data = await resp.json();

        if (data.error) {
            console.error("RPC Error:", JSON.stringify(data.error));
            return false;
        }

        // data.result.result is an array of bytes (ASCII codes of the JSON string)
        // We need to decode it.
        const resultBytes = data.result.result;
        const resultStr = String.fromCharCode(...resultBytes);
        const tokenData = JSON.parse(resultStr);

        console.log("Token Owner:", tokenData.owner_id);
        console.log("User ID:", userId);

        return tokenData.owner_id === userId;

    } catch (e) {
        console.error("Error checking ownership:", e);
        return false;
    }
};

// Execute and set the result
checkOwnership().then(isOwner => {
    Lit.Actions.setResponse({ response: JSON.stringify({ isOwner }) });
    Lit.Actions.setCondition({ token: "evmContractCondition", value: isOwner });
});
