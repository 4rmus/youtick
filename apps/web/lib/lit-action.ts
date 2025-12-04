export const LIT_ACTION_CODE = `
(async () => {
  const checkNearNFT = async (accountId) => {
    const rpcUrl = "https://rpc.testnet.near.org";
    const contractId = "contract.utick.testnet";
    
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: "dontcare",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_supply_for_owner",
        args_base64: btoa(JSON.stringify({ account_id: accountId }))
      }
    });

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      const data = await response.json();

      if (data.error) {
        console.error("RPC Error:", data.error);
        return false;
      }

      const resultBytes = data.result.result;
      const resultString = String.fromCharCode(...resultBytes);
      const supply = JSON.parse(resultString);

      return Number(supply) > 0;
    } catch (e) {
      console.error("Check NFT Error:", e);
      return false;
    }
  };

  // Parse the SIWE message to find the NEAR Account ID
  // We expect a line like "NearAccount: <accountId>" in the message.
  let nearAccountId = null;
  try {
    // authSig is a global variable injected by Lit
    const message = authSig.signedMessage;
    const match = message.match(/NearAccount: (.+)/);
    if (match && match[1]) {
      nearAccountId = match[1].trim();
    }
  } catch (e) {
    console.error("Error parsing authSig:", e);
  }

  if (!nearAccountId) {
    console.error("No NearAccount found in SIWE message");
    LitActions.setResponse({ responses: JSON.stringify({ error: "Missing NearAccount in message" }) });
    LitActions.setCondition({ token: "true", value: "false", rationale: "Missing NearAccount" });
    return;
  }

  // TODO: Verify that authSig.address corresponds to nearAccountId.
  // This requires deriving the MPC address from nearAccountId and comparing it with authSig.address.
  // For this demo, we assume the mapping is valid if the signature is valid (weak check).

  const hasAccess = await checkNearNFT(nearAccountId);
  
  LitActions.setResponse({ responses: JSON.stringify({ hasAccess }) });
  LitActions.setCondition({ token: "true", value: hasAccess.toString(), rationale: "User owns NFT" });
})();
`;
