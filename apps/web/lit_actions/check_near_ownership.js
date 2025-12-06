/**
 * Lit Action to check if a user owns a ticket for a specific video CID.
 */
const checkAccess = async (userAddress, targetCid) => {
    console.log("Checking access for:", userAddress, targetCid);

    // 1. Resolve NEAR Account ID from SIWE
    let nearAccountId = null;
    try {
        const message = Lit.Auth.authSig.signedMessage;
        const match = message.match(/NearAccount: ([a-zA-Z0-9._-]+)/);
        if (match && match[1]) {
            nearAccountId = match[1];
        }
    } catch (e) {
        console.log("Error parsing SIWE:", e);
    }

    if (!nearAccountId) {
        console.log("Could not find NearAccount in SIWE message.");
        return false;
    }

    // 2. Query Smart Contract
    const rpcUrl = "https://rpc.testnet.near.org";
    const contractId = "dev-market-v2.testnet";

    try {
        const args = JSON.stringify({
            account_id: nearAccountId,
            limit: 100
        });
        const argsBase64 = Buffer.from(args).toString('base64');

        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
                request_type: "call_function",
                finality: "final",
                account_id: contractId,
                method_name: "get_tokens_with_video",
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
            console.log("RPC Error:", JSON.stringify(data.error));
            return false;
        }

        const resultBytes = data.result.result;
        const resultStr = String.fromCharCode(...resultBytes);
        const tokensWithVideo = JSON.parse(resultStr);

        // 3. Filter for target CID
        // We check if any token's encrypted_cid matches the targetCid (UUID)
        const hasTicket = tokensWithVideo.some(([token, metadata]) => {
            // metadata is Option<VideoMetadata>
            return metadata && metadata.encrypted_cid === targetCid;
        });

        console.log(`User ${nearAccountId} access to ${targetCid}: ${hasTicket}`);
        return hasTicket;

    } catch (e) {
        console.log("Contract Call Error:", e);
        return false;
    }
};

(async () => {
    let targetCid;
    // Read from Access Control Conditions global
    // Structure: parameters: [":userAddress", "UUID"]
    if (typeof accessControlConditions !== 'undefined' && accessControlConditions.length > 0) {
        const acc = accessControlConditions[0];
        // Check `parameters` (litAction type) OR `functionParams` (evmContract type)
        const params = acc.parameters || acc.functionParams;
        if (params && params.length > 1) {
            targetCid = params[1];
        }
    }

    // Fallback
    if (!targetCid && typeof jsParams !== 'undefined' && jsParams.targetCid) {
        targetCid = jsParams.targetCid;
    }

    if (!targetCid) {
        console.log("Error: targetCid not found in ACC parameters or jsParams");
        // Fail closed
        LitActions.setCondition({ value: "false", rationale: "Missing targetCid" });
        return;
    }

    const isOwner = await checkAccess(null, targetCid);
    LitActions.setCondition({ value: isOwner.toString(), rationale: "User owns ticket" });
})();
