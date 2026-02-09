import { Separator } from "@/components/ui/separator";
import { Loader2, Fuel, CheckCircle2, Sparkles } from "lucide-react";
import { useLanguage } from '@/components/providers/LanguageContext';

interface CostReceiptProps {
    storageFee: string;
    currentBalance: string;
    payAmount: string;
    loading?: boolean;
    gasBalance?: number;
    requiredGas?: number;
    needsTopUp?: boolean;
    isFirstUpload?: boolean;
    isFreeVideo?: boolean;
    novaGroupFee?: number;
}

export function CostReceipt({
    storageFee,
    loading,
    gasBalance = 0,
    needsTopUp = false,
    isFirstUpload = false,
    isFreeVideo = true,
    novaGroupFee = 0
}: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;

    // NOVA-based cost calculation
    // NFT Mint: 0.10 NEAR
    // Event Creation: 0.10 NEAR
    // Nova Group Registration: ~0.67 NEAR (paid videos only, dynamic)
    const nftMintCost = 0.10;
    const eventCost = 0.10;
    const novaGroupCost = isFreeVideo ? 0 : (novaGroupFee || 0.70);
    const bufferCost = 0.05;
    const onChainCost = nftMintCost + eventCost + novaGroupCost;

    // Session Key Deposit (first upload only): 0.30 NEAR base
    // For paid videos, add Nova group registration fee
    const baseSessionDeposit = 0.30;
    const sessionDeposit = isFirstUpload ? baseSessionDeposit + (isFreeVideo ? 0 : novaGroupCost) : 0;

    // Top-up calculation - minimum required is 0.25 NEAR
    const minRequired = 0.25;
    const topUpAmount = needsTopUp && !isFirstUpload
        ? Math.ceil((minRequired - gasBalance + 0.1) * 10) / 10
        : 0;

    // Display total
    let displayTotal = storageFeeFloat;

    if (isFirstUpload) {
        displayTotal += sessionDeposit;
    } else {
        if (topUpAmount > 0) {
            displayTotal += topUpAmount;
        }
        // For paid videos (returning users), Nova group fee is charged via wallet
        if (!isFreeVideo) {
            displayTotal += novaGroupCost;
        }
    }

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            {/* Header with NOVA status */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t.upload_page.cost_receipt.title}
                </h4>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30">
                    <Sparkles className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-medium text-green-400">
                        {t.upload_page.cost_receipt.signless_upload}
                    </span>
                </div>
            </div>

            <div className="space-y-2 text-sm">
                {/* Storage Fee */}
                <div className="flex justify-between items-center text-zinc-300">
                    <span>{t.upload_page.cost_receipt.storage_fee}</span>
                    <span className="font-mono">
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : `${storageFeeFloat.toFixed(4)} NEAR`}
                    </span>
                </div>

                {/* First Upload: Session Deposit with details */}
                {isFirstUpload && (
                    <>
                        <div className="flex justify-between items-center text-zinc-400">
                            <span className="flex items-center gap-1.5">
                                <Fuel className="h-3 w-3" />
                                {t.upload_page.cost_receipt.first_upload_deposit}
                            </span>
                            <span className="font-mono">{sessionDeposit.toFixed(2)} NEAR</span>
                        </div>
                        <div className="pl-4 text-[10px] text-zinc-500 space-y-0.5">
                            <div>• {t.upload_page.cost_receipt.nft_mint}: {nftMintCost.toFixed(2)} NEAR</div>
                            <div>• {t.upload_page.cost_receipt.event_creation}: {eventCost.toFixed(2)} NEAR</div>
                            {!isFreeVideo && (
                                <div>• Nova Group Setup: {novaGroupCost.toFixed(2)} NEAR</div>
                            )}
                            <div>• {t.upload_page.cost_receipt.security_margin}: {bufferCost.toFixed(2)} NEAR</div>
                        </div>
                    </>
                )}

                {/* Returning User: Prepaid Balance */}
                {!isFirstUpload && (
                    <div className="flex justify-between items-center text-zinc-400">
                        <span className="flex items-center gap-1.5">
                            <Fuel className="h-3 w-3" />
                            {t.upload_page.cost_receipt.prepaid_balance}
                        </span>
                        <span className={`font-mono ${gasBalance >= minRequired ? 'text-green-400' : 'text-amber-400'}`}>
                            {gasBalance.toFixed(2)} NEAR
                        </span>
                    </div>
                )}

                {/* Top-up needed */}
                {!isFirstUpload && topUpAmount > 0 && (
                    <div className="flex justify-between items-center text-amber-400">
                        <span className="flex items-center gap-1.5">
                            <Fuel className="h-3 w-3" />
                            {t.upload_page.cost_receipt.balance_topup}
                        </span>
                        <span className="font-mono">+{topUpAmount.toFixed(2)} NEAR</span>
                    </div>
                )}

                {/* Nova Group Registration Fee (paid videos, returning users) */}
                {!isFirstUpload && !isFreeVideo && (
                    <div className="flex justify-between items-center text-zinc-300">
                        <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-purple-400" />
                            Nova Group Setup
                        </span>
                        <span className="font-mono">{novaGroupCost.toFixed(2)} NEAR</span>
                    </div>
                )}

                <Separator className="bg-white/10" />

                {/* Used from Balance - with breakdown */}
                {!isFirstUpload && gasBalance > 0 && (
                    <>
                        <div className="flex justify-between items-center text-zinc-400 text-xs">
                            <span>{t.upload_page.cost_receipt.from_balance}</span>
                            <span className="font-mono">~{(nftMintCost + eventCost).toFixed(2)} NEAR</span>
                        </div>
                        <div className="pl-4 text-[10px] text-zinc-500 space-y-0.5">
                            <div>• {t.upload_page.cost_receipt.nft_mint}: {nftMintCost.toFixed(2)} NEAR</div>
                            <div>• {t.upload_page.cost_receipt.event_creation}: {eventCost.toFixed(2)} NEAR</div>
                        </div>
                    </>
                )}

                {/* Total */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>
                        {isFirstUpload || topUpAmount > 0
                            ? t.upload_page.cost_receipt.total
                            : t.upload_page.cost_receipt.additional_payment}
                    </span>
                    <span className="font-mono text-green-400">
                        {loading ? "..." : displayTotal > 0 ? `${displayTotal.toFixed(4)} NEAR` : "0 NEAR ✓"}
                    </span>
                </div>
            </div>

            {/* Status message */}
            <div className="pt-1">
                {isFirstUpload ? (
                    <p className="text-[10px] text-green-500/80 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        NOVA TEE encryption enabled - Signless uploads active
                    </p>
                ) : gasBalance >= minRequired ? (
                    <p className="text-[10px] text-green-500/80 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t.upload_page.cost_receipt.balance_sufficient}
                    </p>
                ) : (
                    <p className="text-[10px] text-amber-500/80">
                        ⚠️ {t.upload_page.cost_receipt.balance_low}
                    </p>
                )}
            </div>
        </div>
    );
}
