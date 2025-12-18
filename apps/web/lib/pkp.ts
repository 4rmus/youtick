import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { AuthMethod } from "@lit-protocol/types";
import { AuthMethodType, LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";

// We will use this Lit Action code for the Custom Auth Method
// Ideally this is imported from the file we just created, but for strict typing 
// and bundling/loading issues in frontend, defining it here or fetching it is common.
export const VERIFY_NEAR_LIT_ACTION_CODE = `
(async () => {
  try {
    const params = typeof jsParams !== 'undefined' ? jsParams : {};
    const { publicKey, sig, message } = params;
    
    if (!publicKey || !sig || !message) {
      throw new Error("Missing params: publicKey, sig, message in jsParams");
    }

    const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
    const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");
    
    console.log("Verifying NEAR signature for:", publicKey);

    let pubKeyBytes;
    if (publicKey.startsWith("ed25519:")) {
        pubKeyBytes = bs58.default.decode(publicKey.split(":")[1]);
    } else {
        pubKeyBytes = bs58.default.decode(publicKey);
    }

    let sigBytes;
    const isBase64 = (sig.length % 4 === 0) && (/[A-Za-z0-9+/=]/.test(sig));
    if (isBase64) {
        try {
            const binaryString = atob(sig);
            sigBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                sigBytes[i] = binaryString.charCodeAt(i);
            }
        } catch (e) {
            const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
            sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        }
    } else {
        const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
        sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    }

    const msgBytes = new TextEncoder().encode(message);
    const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

    if (!verified) {
      throw new Error("NEAR Signature Verification Failed");
    }

    Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, uid: publicKey }) });
  } catch (e) {
    console.log("Lit Action Error:", e.toString());
    throw e;
  }
})();
`;


export class PKPManager {
    private litNodeClient: LitNodeClient;

    constructor(litNodeClient: LitNodeClient) {
        this.litNodeClient = litNodeClient;
    }

    /**
     * Mint a new PKP for the user using their NEAR account + MPC-derived ETH wallet as Auth Method.
     * Uses Lit Relay Server for gas-free minting.
     * 
     * @param nearAccountId - NEAR account ID
     * @param signer - ethers.Signer from MPC (e.g., via signWithMPC converted to signer)
     * @param useMock - If true, returns mock data (for testing without relay key)
     */
    async mintPKPWithNear(
        nearAccountId: string,
        nearPublicKey: string,
        signature: string,
        message: string,
        signer?: any, // Optional ethers.Signer for real minting
        useMock: boolean = true
    ) {
        console.log(`Minting PKP for NEAR Account: ${nearAccountId}`);

        // If no signer or useMock, return mock data
        if (useMock || !signer) {
            console.log("Using mock minting (no relay key or signer provided)");
            await new Promise(resolve => setTimeout(resolve, 2000));
            return {
                tokenId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                publicKey: "0x0430591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c4cc31d87ee96c5685718df2894b5f884a44b937080b0bb183e2da025686008ab",
                ethAddress: "0x7bd19343d242253818e6922261a861611029c7d4",
                nearImplicitAccount: "30591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c"
            };
        }

        // Real minting with EthWalletProvider + LitRelay
        try {
            const { EthWalletProvider, LitRelay } = await import('@lit-protocol/lit-auth-client');
            const { LitNetwork } = await import('@lit-protocol/constants');

            // 1. Create auth method using the MPC-derived signer
            const authMethod = await EthWalletProvider.authenticate({
                signer,
                litNodeClient: this.litNodeClient,
            });

            console.log("Auth method created:", authMethod.authMethodType);

            // 2. Initialize Relay
            const relayApiKey = process.env.NEXT_PUBLIC_LIT_RELAY_API_KEY;
            if (!relayApiKey) {
                throw new Error("NEXT_PUBLIC_LIT_RELAY_API_KEY is not set. Get one from Lit Dashboard.");
            }

            const relay = new LitRelay({
                relayApiKey,
                relayUrl: LitRelay.getRelayUrl(LitNetwork.DatilTest),
            });

            // 3. Mint PKP with auth method via Relay
            console.log("Minting PKP via Relay...");
            const pkpResult = await relay.mintPKPWithAuthMethods([authMethod], {
                addPkpEthAddressAsPermittedAddress: true,
                sendPkpToitself: true,
            });

            console.log("PKP Minted Successfully:", pkpResult);

            return {
                tokenId: pkpResult.pkpTokenId || "",
                publicKey: pkpResult.pkpPublicKey || "",
                ethAddress: pkpResult.pkpEthAddress || "",
                nearImplicitAccount: nearAccountId
            };
        } catch (e) {
            console.error("Real minting failed:", e);
            throw e;
        }
    }

    /**
     * Mint a PKP directly via contracts with permitted Lit Action using a single transaction.
     * Uses PKPHelper to bundle Mint + Permit Action.
     * 
     * @param signer - ethers.Signer with tstLPX balance on Chronicle Yellowstone
     * @param litActionIpfsCid - Optional IPFS CID of Lit Action to permit (defaults to env var)
     * @returns PKP info { tokenId, publicKey, ethAddress, litActionCid }
     */
    async mintPKPDirect(signer: any, litActionIpfsCid?: string) {
        try {
            const { LitContracts } = await import('@lit-protocol/contracts-sdk');
            const { LitNetwork } = await import('@lit-protocol/constants');
            const { ethers } = await import('ethers');
            const { CID } = await import('multiformats/cid');

            console.log("Initializing LitContracts for Datil-Dev...");
            const litContracts = new LitContracts({
                signer,
                network: LitNetwork.DatilDev,
                debug: true
            }) as any;

            await litContracts.connect();

            const ipfsCid = litActionIpfsCid || process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID;
            if (!ipfsCid) throw new Error("No Lit Action CID provided or found in ENV");

            console.log("Batching Mint + Permit Action for CID:", ipfsCid);

            // Using mintNextAndAddAuthMethodsWithTypes via utility
            // This method handles the complex encoding for the PKPHelper contract
            const mintCost = await litContracts.pkpNftContract.read.mintCost();

            // We need to convert the CIDv0 to bytes for the contract
            // The Lit SDK helper requires the multiformats CID object
            const sdkUtils = await import('@lit-protocol/contracts-sdk');
            const { getBytes32FromMultihash } = sdkUtils as any;
            const cidBytes = getBytes32FromMultihash(ipfsCid, CID);

            const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethodsWithTypes(
                2, // KeyType: ECDSA
                [cidBytes.digest], // permittedIpfsCIDs (expecting bytes32 digest)
                [[]], // permittedIpfsCIDScopes (empty = full access)
                [], // permittedAddresses
                [], // permittedAddressScopes
                [], // permittedAuthMethodTypes
                [], // permittedAuthMethodIds
                [], // permittedAuthMethodPubkeys
                [[]], // permittedAuthMethodScopes
                true, // addPkpEthAddressAsPermittedAddress
                true, // sendPkpToItself
                { value: mintCost }
            );

            console.log("Batch transaction sent:", tx.hash);
            const receipt = await tx.wait();
            console.log("Batch transaction confirmed!");

            // Parse logs to find PKP info
            let tokenId = "";
            let publicKey = "";
            let ethAddress = "";

            // Use explicit interface for parsing
            const nftInterface = new ethers.Interface(litContracts.pkpNftContract.abi || []);

            for (const log of receipt.logs) {
                try {
                    const parsed = nftInterface.parseLog(log as any);
                    if (parsed && parsed.name === 'Transfer' && parsed.args.from === ethers.ZeroAddress) {
                        tokenId = parsed.args.tokenId.toString();
                        console.log("Found TokenId from logs:", tokenId);
                    }
                } catch (e) { /* ignore other logs */ }
            }

            if (!tokenId) {
                // Fallback: try to find the minted event
                throw new Error("Could not find PKP TokenId in transaction logs");
            }

            // Get the full PKP info from the registry
            const pkpInfo = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
            publicKey = pkpInfo;
            ethAddress = ethers.computeAddress(publicKey);

            console.log("PKP Fully Initialized:", { tokenId, ethAddress });

            return {
                tokenId: tokenId,
                publicKey: publicKey,
                ethAddress: ethAddress,
                txHash: receipt.transactionHash,
                litActionCid: ipfsCid
            };
        } catch (e) {
            console.error("Batch minting failed:", e);
            throw e;
        }
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
