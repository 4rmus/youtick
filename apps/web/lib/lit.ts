import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork, LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { createSiweMessageWithRecaps, generateAuthSig, LitAccessControlConditionResource } from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";

const client = new LitNodeClient({
    litNetwork: "datil-dev",
    debug: true
});

class Lit {
    private litNodeClient: LitNodeClient;

    constructor() {
        this.litNodeClient = client;
    }

    async connect() {
        if (!this.litNodeClient.ready) {
            await this.litNodeClient.connect();
        }
    }

    async getSessionSigs(
        wallet: any,
        accountId: string,
        ethAddress: string,
        signWithMPC: (wallet: any, accountId: string, path: string, message: string) => Promise<any>,
        accessControlConditions?: any[],
        dataToEncryptHash?: string
    ) {
        await this.connect();
        console.log("getSessionSigs called with accountId:", accountId);

        // Revert to wildcard for simplicity and add Signing ability
        const resource = new LitAccessControlConditionResource('*');

        return this.litNodeClient.getSessionSigs({
            chain: 'ethereum',
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
            resourceAbilityRequests: [
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionDecryption,
                },
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionSigning,
                },
            ],
            authNeededCallback: async ({ resourceAbilityRequests, expiration, uri }) => {
                console.log("authNeededCallback resourceAbilityRequests:", JSON.stringify(resourceAbilityRequests, null, 2));
                if (!uri || !expiration || !resourceAbilityRequests) {
                    throw new Error("Missing required fields in authNeededCallback");
                }
                const toSign = await createSiweMessageWithRecaps({
                    uri,
                    expiration,
                    resources: resourceAbilityRequests,
                    walletAddress: ethAddress, // Hardcoded MPC address for now, ideally passed in
                    nonce: await this.litNodeClient.getLatestBlockhash(),
                    litNodeClient: this.litNodeClient,
                });

                console.log("Signing SIWE with MPC:", toSign);

                // Sign with MPC
                // We use a fixed path for the session key to ensure consistent address
                const derivationPath = "test";
                const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, toSign);

                const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
                const s_val = '0x' + mpcSignature.s.scalar;

                // Use the recovery ID from the MPC signature if available, otherwise try 27
                // Note: We already verified the address in deriveEthAddress, so we trust this signature
                // corresponds to that address.
                let v_val = 27;
                if (typeof mpcSignature.recovery_id === 'number') {
                    v_val = mpcSignature.recovery_id + 27;
                }

                // Construct signature
                let signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;

                // Verify just to be safe and log
                let recoveredAddr = ethers.verifyMessage(toSign, signature);

                // If mismatch (e.g. recovery_id was wrong), try the other v value
                if (recoveredAddr.toLowerCase() !== ethAddress.toLowerCase()) {
                    console.warn(`Address mismatch with v=${v_val}, trying alternative...`);
                    v_val = v_val === 27 ? 28 : 27;
                    signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;
                    recoveredAddr = ethers.verifyMessage(toSign, signature);
                }

                console.log("Final Session Sig Address:", recoveredAddr);

                if (recoveredAddr.toLowerCase() !== ethAddress.toLowerCase()) {
                    console.error("CRITICAL: Session signature address mismatch! Expected:", ethAddress, "Got:", recoveredAddr);
                }



                return {
                    sig: signature,
                    derivedVia: "web3.eth.personal.sign",
                    signedMessage: toSign,
                    address: ethAddress,
                };
            },
        });
    }

    async encryptFile(
        file: File,
        accessControlConditions: any[],
        authSig: any,
        chain: string,
        sessionSigs?: any
    ) {
        await this.connect();

        const params: any = {
            file,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        const { ciphertext, dataToEncryptHash } = await encryptFile(
            params,
            client
        );

        return { ciphertext, dataToEncryptHash };
    }

    async decryptFile(
        ciphertext: string,
        dataToEncryptHash: string,
        accessControlConditions: any[],
        authSig: any,
        chain: string,
        sessionSigs?: any
    ): Promise<Uint8Array> {
        await this.connect();

        const params: any = {
            ciphertext,
            dataToEncryptHash,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        const decryptedFile = await decryptToFile(
            params,
            client
        );

        return decryptedFile;
    }

    async getLatestBlockhash() {
        await this.connect();
        return this.litNodeClient.getLatestBlockhash();
    }
}

export const lit = new Lit();
