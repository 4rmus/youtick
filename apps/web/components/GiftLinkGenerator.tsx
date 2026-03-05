"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Check, Download, Link2 } from "lucide-react";
import { useWallet } from "@/components/providers/WalletProvider";
import { useLanguage } from "@/components/providers/LanguageContext";
import { actions as nearActions } from "near-api-js";
import { NEAR_CONFIG, GAS_CONSTANTS, DEPOSIT_CONSTANTS } from "@/lib/constants";

interface GiftLinkGeneratorProps {
    eventCid: string;
    onLinksGenerated?: (links: string[]) => void;
}

export function GiftLinkGenerator({
    eventCid,
    onLinksGenerated,
}: GiftLinkGeneratorProps) {
    const { t } = useLanguage();
    const g = t.gift_generator;
    const [ticketCount, setTicketCount] = useState(5);
    const [generating, setGenerating] = useState(false);
    const [links, setLinks] = useState<string[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [eventPrice, setEventPrice] = useState<string>("0");
    const { getWallet, accountId } = useWallet();

    useEffect(() => {
        const fetchEventDetails = async () => {
            try {
                // v7: Use JsonRpcProvider directly for view calls
                const { getProvider, viewContract } = await import("@/lib/near");
                const provider = getProvider();
                const contractId = NEAR_CONFIG.contractId;

                const event = await viewContract<{ price: string }>(
                    provider,
                    contractId,
                    "get_event",
                    { encrypted_cid: eventCid }
                );

                if (event && event.price) {
                    setEventPrice(event.price);
                }
            } catch (e) {
                console.error("Failed to fetch event details:", e);
            }
        };
        fetchEventDetails();
    }, [eventCid]);

    const GIFT_COST_PER_TICKET = 0.12;
    const displayPrice = eventPrice === "0" ? 0 : (Number(eventPrice) / 1e24);
    const estimatedCost = (ticketCount * (displayPrice + GIFT_COST_PER_TICKET)).toFixed(2);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);

        try {
            const wallet = await getWallet();
            if (!wallet || !accountId) {
                throw new Error("Wallet not connected");
            }

            const { KeyPair } = await import("near-api-js");

            const keyPairs = Array.from({ length: ticketCount }, () =>
                KeyPair.fromRandom("ed25519")
            );

            const publicKeys = keyPairs.map(kp => kp.getPublicKey().toString());
            const secretKeys = keyPairs.map(kp => kp.toString().replace("ed25519:", ""));

            const NFT_CONTRACT = NEAR_CONFIG.contractId;
            const totalDeposit = (DEPOSIT_CONSTANTS.giftDepositPerLink * BigInt(ticketCount)).toString();

            await wallet.signAndSendTransaction({
                receiverId: NFT_CONTRACT,
                actions: [
                    nearActions.functionCall(
                        "create_gift_drop",
                        { event_cid: eventCid, public_keys: publicKeys },
                        GAS_CONSTANTS.highGas,
                        BigInt(totalDeposit)
                    )
                ]
            });

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const claimLinks = secretKeys.map((secret: string) =>
                `${baseUrl}/claim?secret=${encodeURIComponent(secret)}&eventCid=${encodeURIComponent(eventCid)}`
            );

            setLinks(claimLinks);
            onLinksGenerated?.(claimLinks);
        } catch (err: unknown) {
            console.error("Failed to generate gift links:", err);
            setError(err instanceof Error ? err.message : (g?.create_failed || "Failed to create link"));
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = async (link: string, index: number) => {
        await navigator.clipboard.writeText(link);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleCopyAll = async () => {
        await navigator.clipboard.writeText(links.join("\n"));
        setCopiedIndex(-1);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleDownloadCSV = () => {
        const csv = links.map((link, i) => `${i + 1},${link}`).join("\n");
        const blob = new Blob([`No,Link\n${csv}`], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gift-tickets-${eventCid.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-4">
            {links.length === 0 ? (
                <>
                    {/* Ticket Count */}
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400">{g?.how_many || "How many tickets?"}</label>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            value={ticketCount}
                            onChange={(e) => setTicketCount(parseInt(e.target.value) || 1)}
                            className="bg-zinc-900 border-zinc-600 text-white h-11 rounded-xl"
                        />
                    </div>

                    {/* Cost Estimate */}
                    <div className="p-3 bg-zinc-900/50 border border-zinc-600/50 rounded-lg">
                        <p className="text-sm text-zinc-300">
                            💰 {g?.estimated_cost || "Estimated Cost"}: <span className="font-bold text-white">{estimatedCost} NEAR</span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                            {ticketCount} {g?.tickets_storage || "tickets × 0.12 NEAR storage"}
                        </p>
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    {/* Generate Button */}
                    <Button
                        onClick={handleGenerate}
                        disabled={generating || ticketCount < 1}
                        className="w-full h-11 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {g?.generating || "Generating..."}
                            </>
                        ) : (
                            <>
                                <Link2 className="w-4 h-4 mr-2" />
                                {ticketCount} {g?.generate_links || "Generate Links"}
                            </>
                        )}
                    </Button>
                </>
            ) : (
                <>
                    {/* Success Header */}
                    <div className="flex items-center gap-2 text-near-green text-sm">
                        <Check className="w-4 h-4" />
                        <span>{links.length} {g?.links_created || "gift links created!"}</span>
                    </div>

                    {/* Generated Links */}
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {links.map((link, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 p-2.5 bg-zinc-900/50 rounded-lg border border-zinc-600/50"
                            >
                                <span className="text-zinc-500 text-sm w-6">{index + 1}.</span>
                                <code className="flex-1 text-xs text-zinc-400 truncate">
                                    {link}
                                </code>
                                <button
                                    onClick={() => handleCopy(link, index)}
                                    className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                                >
                                    {copiedIndex === index ? (
                                        <Check className="w-4 h-4 text-near-green" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-zinc-400" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Bulk Actions */}
                    <div className="flex gap-2">
                        <Button
                            onClick={handleCopyAll}
                            variant="outline"
                            className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-xl"
                        >
                            {copiedIndex === -1 ? (
                                <Check className="w-4 h-4 mr-2 text-emerald-400" />
                            ) : (
                                <Copy className="w-4 h-4 mr-2" />
                            )}
                            {g?.copy_all || "Copy All"}
                        </Button>
                        <Button
                            onClick={handleDownloadCSV}
                            variant="outline"
                            className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-xl"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {g?.download_csv || "Download CSV"}
                        </Button>
                    </div>

                    {/* Create More */}
                    <Button
                        onClick={() => setLinks([])}
                        variant="ghost"
                        className="w-full text-zinc-400 hover:text-white"
                    >
                        {g?.create_more || "Create More"}
                    </Button>
                </>
            )}
        </div>
    );
}
