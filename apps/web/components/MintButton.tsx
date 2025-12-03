import { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Coins } from "lucide-react";
import { transactions, utils } from 'near-api-js';

export function MintButton() {
    const { selector, accountId } = useWallet();
    const [minting, setMinting] = useState(false);

    const handleMint = async () => {
        if (!selector || !accountId) return;
        setMinting(true);
        try {
            const wallet = await selector.wallet();
            const contractId = 'contract.utick.testnet';

            // Use near-api-js to create the action object directly
            // This avoids serialization issues with the Wallet Selector's simplified format
            const action = transactions.functionCall(
                'nft_mint',
                Buffer.from(JSON.stringify({
                    token_id: `access - ${Date.now()} `,
                    metadata: {
                        title: "YouTick Access Token",
                        description: "Grants access to encrypted content",
                        media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png"
                    },
                    receiver_id: accountId,
                })),
                BigInt('300000000000000'), // 300 Tgas
                BigInt('100000000000000000000000') // 0.1 NEAR
            );

            await wallet.signAndSendTransaction({
                receiverId: contractId,
                actions: [action as any],
            });
        } catch (e) {
            console.error("Minting failed:", e);
        } finally {
            setMinting(false);
        }
    };

    if (!accountId) return null;

    return (
        <Button
            onClick={handleMint}
            disabled={minting}
            variant="secondary"
            className="gap-2"
        >
            {minting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Coins className="h-4 w-4" />
            )}
            {minting ? "Minting..." : "Mint Test NFT"}
        </Button>
    );
}
