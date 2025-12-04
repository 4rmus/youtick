import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork } from "@lit-protocol/constants";
import { createSiweMessageWithRecaps, LitAccessControlConditionResource, LitActionResource } from "@lit-protocol/auth-helpers";

const client = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true
});

async function main() {
    await client.connect();

    const expiration = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const uri = "https://localhost/login";
    const walletAddress = "0x1234567890123456789012345678901234567890"; // Dummy address

    console.log("--- TEST 1: Standard Decryption Ability ---");
    const toSign1 = await createSiweMessageWithRecaps({
        uri,
        expiration,
        resources: [
            {
                resource: new LitAccessControlConditionResource('*'),
                ability: 'access-control-condition-decryption' as any,
            }
        ],
        walletAddress,
        nonce: await client.getLatestBlockhash(),
        litNodeClient: client,
    });
    console.log(toSign1);

    console.log("\n--- TEST 2: Lit Action Execution Ability ---");
    const toSign2 = await createSiweMessageWithRecaps({
        uri,
        expiration,
        resources: [
            {
                resource: new LitActionResource('*'),
                ability: 'lit-action-execution' as any,
            }
        ],
        walletAddress,
        nonce: await client.getLatestBlockhash(),
        litNodeClient: client,
    });
    console.log(toSign2);
    console.log("\n--- TEST 3: Hybrid (Execution on ACC Resource) ---");
    // We create a custom resource object that mimics LitAccessControlConditionResource
    // but allows 'lit-action-execution' ability.
    const customResource = {
        resource: '*',
        resourcePrefix: 'lit-accesscontrolcondition',
        getResourceKey: () => 'lit-accesscontrolcondition://*',
        isValidLitAbility: (ability: any) => true, // Allow everything
    };

    const toSign3 = await createSiweMessageWithRecaps({
        uri,
        expiration,
        resources: [
            {
                resource: customResource as any,
                ability: 'lit-action-execution' as any,
            }
        ],
        walletAddress,
        nonce: await client.getLatestBlockhash(),
        litNodeClient: client,
    });
    console.log(toSign3);
}


main().catch(console.error);
