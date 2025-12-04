import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_NETWORK } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";

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

    async encryptFile(file: File, accessControlConditions: any[], authSig: any, chain: string) {
        await this.connect();

        // 1. Encrypt file and save key
        // We pass accessControlConditions and authSig to encryptFile so it provisions the key.
        const { ciphertext, dataToEncryptHash } = await encryptFile(
            {
                file,
                chain,
                authSig,
                unifiedAccessControlConditions: accessControlConditions
            },
            client
        );

        return { ciphertext, dataToEncryptHash };
    }

    async decryptFile(
        ciphertext: string,
        dataToEncryptHash: string,
        accessControlConditions: any[],
        authSig: any,
        chain: string
    ): Promise<Uint8Array> {
        await this.connect();

        const decryptedFile = await decryptToFile(
            {
                ciphertext,
                dataToEncryptHash,
                authSig,
                chain,
                unifiedAccessControlConditions: accessControlConditions
            },
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
