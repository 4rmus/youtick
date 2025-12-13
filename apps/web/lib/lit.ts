import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork, LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { createSiweMessageWithRecaps, generateAuthSig, LitAccessControlConditionResource } from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";

export const LIT_ACTION_CID = "QmR1n4XYgp6g6EE2vxTkp8XbzZFb5Nv2TkzWcNGgoWKxYf";

// Session cache key prefix
const SESSION_CACHE_KEY = 'lit_session_sigs';
const SESSION_CACHE_EXPIRY = 23 * 60 * 60 * 1000; // 23 hours (slightly less than 24h session expiry)

const client = new LitNodeClient({
    litNetwork: "datil-dev",
    debug: true,
    rpcUrl: "https://175188.rpc.thirdweb.com"
});

// Session cache helpers
function getCachedSessionSigs(accountId: string): any | null {
    if (typeof window === 'undefined') return null;
    try {
        const cached = localStorage.getItem(`${SESSION_CACHE_KEY}_${accountId}`);
        if (!cached) return null;

        const { sessionSigs, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;

        if (age > SESSION_CACHE_EXPIRY) {
            console.log('Lit session cache expired, will create new session');
            localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
            return null;
        }

        console.log('Using cached Lit session signatures (age:', Math.round(age / 60000), 'minutes)');
        return sessionSigs;
    } catch (e) {
        console.warn('Error reading session cache:', e);
        return null;
    }
}

function setCachedSessionSigs(accountId: string, sessionSigs: any): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${SESSION_CACHE_KEY}_${accountId}`, JSON.stringify({
            sessionSigs,
            timestamp: Date.now()
        }));
        console.log('Cached Lit session signatures for', accountId);
    } catch (e) {
        console.warn('Error caching session sigs:', e);
    }
}

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
        dataToEncryptHash?: string,
        derivationPath: string = "test"
    ) {
        await this.connect();
        console.log("getSessionSigs called with accountId:", accountId, "Path:", derivationPath);

        // Check cache first - avoid repeated signatures!
        const cachedSigs = getCachedSessionSigs(accountId);
        if (cachedSigs) {
            return cachedSigs;
        }

        // Revert to wildcard for simplicity and add Signing ability
        const resource = new LitAccessControlConditionResource('*');

        const sessionSigs = await this.litNodeClient.getSessionSigs({
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

                // 1. Probe Address with Dummy Signature (to ensure SIWE matches signer)
                // We ignore the `ethAddress` passed in constructor/arg and trust the key.
                const probeMsg = "probe_address_for_siwe";
                console.log("Probing MPC address with dummy message...");
                const probeSig = await signWithMPC(wallet, accountId, derivationPath, probeMsg);

                // Recover Address from Probe
                const r_probe = '0x' + probeSig.big_r.affine_point.substring(2, 66);
                const s_probe = '0x' + probeSig.s.scalar;
                let v_probe = 27;
                if (typeof probeSig.recovery_id === 'number') {
                    v_probe = probeSig.recovery_id + 27;
                }
                const probeSignature = ethers.Signature.from({ r: r_probe, s: s_probe, v: v_probe }).serialized;
                let derivedAddress = ethers.verifyMessage(probeMsg, probeSignature);

                // Double check recovery if needed (v=27 vs 28) logic could be here, but usually one works. 
                // Since we don't have a "target", we have to trust the `recovery_id` returned by MPC.
                console.log("Probed MPC Address:", derivedAddress);

                // 2. Create SIWE Message with the Correct Address
                const toSign = await createSiweMessageWithRecaps({
                    uri,
                    expiration,
                    resources: resourceAbilityRequests,
                    walletAddress: derivedAddress, // USE PROBED ADDRESS
                    nonce: await this.litNodeClient.getLatestBlockhash(),
                    litNodeClient: this.litNodeClient,
                });

                console.log("Signing SIWE with MPC:", toSign);

                // 3. Sign the Real SIWE Message
                const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, toSign);

                const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
                const s_val = '0x' + mpcSignature.s.scalar;
                let v_val = 27;
                if (typeof mpcSignature.recovery_id === 'number') {
                    v_val = mpcSignature.recovery_id + 27;
                }
                const signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;

                // Verify
                const recoveredAddr = ethers.verifyMessage(toSign, signature);
                console.log("Final Session Sig Address:", recoveredAddr);

                if (recoveredAddr.toLowerCase() !== derivedAddress.toLowerCase()) {
                    console.warn("Address mismatch between Probe and SIWE sign! Retrying verify with v-flip...");
                    // This implies the session key was stable, but maybe `v` is flaky?
                }

                return {
                    sig: signature,
                    derivedVia: "web3.eth.personal.sign",
                    signedMessage: toSign,
                    address: derivedAddress,
                };
            },
        });

        // Cache the session signatures for future use
        setCachedSessionSigs(accountId, sessionSigs);
        return sessionSigs;
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

        console.log("Calling decryptToFile with params:", JSON.stringify(params, null, 2));

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
