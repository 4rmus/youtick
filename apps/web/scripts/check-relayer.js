const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });

async function checkRelayer() {
    const rpc = process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com';
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;

    if (!relayerKey) {
        console.log("Error: RELAYER_PRIVATE_KEY not found in .env.local");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(relayerKey, provider);

    console.log("Relayer Address:", wallet.address);
    console.log("RPC URL:", rpc);

    try {
        const balance = await provider.getBalance(wallet.address);
        console.log("Balance:", ethers.formatEther(balance), "tstLPX");

        const network = await provider.getNetwork();
        console.log("Network ID:", network.chainId.toString());
    } catch (e) {
        console.log("Error connecting to network:", e.message);
    }
}

checkRelayer();
