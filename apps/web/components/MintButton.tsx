import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Ticket } from "lucide-react";
import { actions, yoctoToNear, nearToYocto } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG, GAS_CONSTANTS, DEPOSIT_CONSTANTS } from '@/lib/constants';
import { useNearPrice } from '@/hooks/useNearPrice';

interface MintButtonProps {
    cid?: string;
}

export function MintButton({ cid }: MintButtonProps) {
    const { accountId, getWallet } = useWallet();
    const { nearToUsdStr } = useNearPrice();
    const [minting, setMinting] = useState(false);
    const [price, setPrice] = useState<string | null>(null);
    const [priceUsdCents, setPriceUsdCents] = useState<number | null>(null);
    const [loadingPrice, setLoadingPrice] = useState(false);

    useEffect(() => {
        if (!cid) return;

        const fetchPrice = async () => {
            setLoadingPrice(true);
            try {
                const contractId = NEAR_CONFIG.contractId;
                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                const event = await viewContract<{ price: string; price_usd?: number | null }>(
                    provider,
                    contractId,
                    'get_event',
                    { encrypted_cid: cid }
                );

                if (event && event.price) {
                    // v7: yoctoToNear expects bigint, convert string from contract
                    setPrice(yoctoToNear(BigInt(event.price)));
                    setPriceUsdCents(event.price_usd ?? null);
                }
            } catch (e) {
                console.error("Error fetching ticket price:", e);
            } finally {
                setLoadingPrice(false);
            }
        };

        fetchPrice();
    }, [cid]);

    const handleMint = async () => {
        if (!accountId) return;
        setMinting(true);
        try {
            const wallet = await getWallet();
            const contractId = NEAR_CONFIG.contractId;

            // SALES FLOW: Buy Ticket
            if (cid && price) {
                // v7: Use nearToYocto for conversion
                const depositYocto = nearToYocto(parseFloat(price));
                // v7: Use actions.functionCall instead of transactions.functionCall
                const action = actions.functionCall(
                    'buy_ticket',
                    {
                        receiver_id: accountId,
                        encrypted_cid: cid
                    },
                    GAS_CONSTANTS.smallGas, // 30 Tgas
                    BigInt(depositYocto) + BigInt('12000000000000000000000') // Price + 0.012 NEAR (Storage + commission buffer)
                );

                await wallet.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [action],
                });
            }
            // LEGACY FLOW: Mint Generic Access Pass
            else {
                const args = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: "youtick Access Pass",
                        description: "Global access pass for youtick exclusive content",
                        media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png",
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: "ACCESS_PASS",
                        duration_seconds: 0,
                        content_type: "Exclusive"
                    }
                };

                // v7: Use actions.functionCall
                const action = actions.functionCall(
                    'nft_mint',
                    args,
                    GAS_CONSTANTS.standardGas, // 300 Tgas
                    DEPOSIT_CONSTANTS.storageDeposit // 0.1 NEAR
                );

                await wallet.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [action],
                });
            }

        } catch (e) {
            console.error("Minting failed:", e);
        } finally {
            setMinting(false);
        }
    };

    if (!accountId) return null;

    if (loadingPrice) {
        return <Button disabled variant="outline" size="sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading price...</Button>;
    }

    return (
        <Button
            onClick={handleMint}
            disabled={minting}
            variant={price ? "default" : "secondary"}
            className="gap-2"
        >
            {minting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : price ? (
                <Ticket className="h-4 w-4" />
            ) : (
                <Coins className="h-4 w-4" />
            )}
            {minting ? "Processing..." : price ? (priceUsdCents ? `Buy Ticket ($${(priceUsdCents / 100).toFixed(2)})` : `Buy Ticket (${nearToUsdStr(parseFloat(price))})`) : "Mint Global Access Pass"}
        </Button>
    );
}
