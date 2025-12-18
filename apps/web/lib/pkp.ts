import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { AuthMethod } from "@lit-protocol/types";
import { AuthMethodType, LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";

// We will use this Lit Action code for the Custom Auth Method
// Ideally this is imported from the file we just created, but for strict typing 
// and bundling/loading issues in frontend, defining it here or fetching it is common.
export const VERIFY_NEAR_LIT_ACTION_CODE = `
const verifyNearSignature = async () => {
  try {
    const { publicKey, sig, message } = jsParams;
    if (!publicKey || !sig || !message) {
      throw new Error("Missing params: publicKey, sig, message");
    }

    // Import TweetNaCl from an ESM CDN supported by Lit
    const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
    const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");
    
    console.log("Verifying for:", publicKey);

    let pubKeyBytes;
    if (publicKey.startsWith("ed25519:")) {
        pubKeyBytes = bs58.default.decode(publicKey.split(":")[1]);
    } else if (publicKey.length === 64 || publicKey.length === 66) {
        // Hex string
        const cleanHex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
        pubKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    } else {
        // Assume raw base58
        pubKeyBytes = bs58.default.decode(publicKey);
    }

    const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
    const sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    const msgBytes = new TextEncoder().encode(message);

    const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

    console.log("Verification Result:", verified);

    Lit.Actions.setResponse({ 
      response: JSON.stringify({ 
        verified: verified, 
        uid: publicKey 
      })
    });
  } catch (e) {
    console.log("Verification Error:", e);
    Lit.Actions.setResponse({ response: JSON.stringify({ verified: false, error: e.toString() }) });
  }
};

verifyNearSignature();
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
     * Mint a PKP directly via contracts (no Relay API key needed).
     * Requires Chronicle Yellowstone testnet tokens (tstLPX) for gas.
     * 
     * @param signer - ethers.Signer with tstLPX balance on Chronicle Yellowstone
     * @returns PKP info { tokenId, publicKey, ethAddress }
     */
    async mintPKPDirect(signer: any) {
        try {
            const { LitContracts } = await import('@lit-protocol/contracts-sdk');
            const { LitNetwork } = await import('@lit-protocol/constants');

            console.log("Initializing LitContracts for Datil-Dev...");

            const litContracts = new LitContracts({
                signer,
                network: LitNetwork.DatilDev, // Centralized testnet - no capacity credits needed
                debug: true
            });

            await litContracts.connect();
            console.log("Connected to Lit Contracts on Datil-Dev");

            // Mint PKP NFT
            console.log("Minting PKP NFT...");
            const mintResult = await litContracts.pkpNftContractUtils.write.mint();

            console.log("PKP Minted!", mintResult);

            return {
                tokenId: mintResult.pkp.tokenId,
                publicKey: mintResult.pkp.publicKey,
                ethAddress: mintResult.pkp.ethAddress,
                txHash: mintResult.tx.hash
            };
        } catch (e) {
            console.error("Direct minting failed:", e);
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
