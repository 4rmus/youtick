
import { PKPManager } from '../lib/pkp';
import * as dotenv from 'dotenv';
import path from 'path';

// Load ENV
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testRelayer() {
    console.log("--- Relayer Compatibility Test ---");

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
        console.error("RELAYER_PRIVATE_KEY missing");
        return;
    }

    try {
        const ethers5 = await import('ethers5');
        const provider = new ethers5.providers.JsonRpcProvider(process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com');
        const wallet = new ethers5.Wallet(relayerKey, provider);

        console.log("Relayer Address:", wallet.address);
        const balance = await provider.getBalance(wallet.address);
        console.log("Balance:", ethers5.utils.formatEther(balance), "LIT");

        const pkpManager = new PKPManager({} as any);

        console.log("Attempting to initialize LitContracts with Ethers5 Signer...");
        // We don't want to actually mint and spend money, but we want to see if .connect() works
        // Connect() is where it usually fails with "invalid signer or provider"

        const { LitContracts } = await import('@lit-protocol/contracts-sdk');
        const { LitNetwork } = await import('@lit-protocol/constants');

        const litContracts = new LitContracts({
            signer: wallet,
            network: LitNetwork.DatilTest,
            debug: true
        }) as any;

        await litContracts.connect();
        console.log("✅ Success: LitContracts connected with Ethers5 Signer!");

    } catch (e) {
        console.error("❌ Test Failed:", e);
    }
}

testRelayer();
