import { Separator } from "@/components/ui/separator";
import { Loader2, Fuel, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { useLanguage } from '@/components/providers/LanguageContext';

interface CostReceiptProps {
    storageFee: string;
    currentBalance: string;
    payAmount: string;
    loading?: boolean;
    hasPKP?: boolean;
    gasBalance?: number;
    requiredGas?: number;
    needsTopUp?: boolean;
    isFirstUpload?: boolean;
}

export function CostReceipt({
    storageFee,
    loading,
    hasPKP = false,
    gasBalance = 0,
    needsTopUp = false,
    isFirstUpload = false
}: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;

    // Cost calculation based on PKP availability
    const mpcCost = hasPKP ? 0 : 0.25;
    const nftMintCost = 0.10;
    const eventCost = 0.10;
    const onChainCost = nftMintCost + eventCost;

    // Session Key Deposit (first upload only)
    // PKP: 0.5 NEAR (includes safety margin)
    // No PKP: 1.0 NEAR (MPC + operations + refund margin)
    const sessionDeposit = isFirstUpload ? (hasPKP ? 0.30 : 1.0) : 0;

    // Top-up calculation
    const minRequired = hasPKP ? 0.20 : 0.50;
    const topUpAmount = needsTopUp && !isFirstUpload
        ? Math.ceil((minRequired - gasBalance + 0.1) * 10) / 10
        : 0;

    // Display total
    let displayTotal = storageFeeFloat;

    if (isFirstUpload) {
        displayTotal += sessionDeposit;
    } else if (topUpAmount > 0) {
        displayTotal += topUpAmount;
    }

    // Estimated refund for MPC scenario
    const estimatedRefund = !hasPKP && isFirstUpload
        ? (1.0 - onChainCost - mpcCost - 0.1).toFixed(2)
        : null;

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            {/* Header with PKP status */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t.upload_page.cost_receipt.title}
                </h4>
                {hasPKP ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30">
                        <Sparkles className="h-3 w-3 text-green-400" />
                        <span className="text-[10px] font-medium text-green-400">
                            {t.upload_page.cost_receipt.signless_upload}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle className="h-3 w-3 text-amber-400" />
                        <span className="text-[10px] font-medium text-amber-400">MPC Mode</span>
                    </div>
                )}
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
                                {hasPKP ? t.upload_page.cost_receipt.first_upload_deposit : t.upload_page.mpc_fallback.mpc_deposit}
                            </span>
                            <span className="font-mono">{sessionDeposit.toFixed(2)} NEAR</span>
                        </div>
                        <div className="pl-4 text-[10px] text-zinc-500 space-y-0.5">
                            {hasPKP ? (
                                <>
                                    <div className="flex items-center gap-1 text-green-500">
                                        <CheckCircle2 className="h-3 w-3" />
                                        <span>{t.upload_page.cost_receipt.pkp_sign}: 0 NEAR</span>
                                    </div>
                                    <div>• {t.upload_page.cost_receipt.nft_mint}: 0.10 NEAR</div>
                                    <div>• {t.upload_page.cost_receipt.event_creation}: 0.10 NEAR</div>
                                    <div>• {t.upload_page.cost_receipt.security_margin}: 0.10 NEAR</div>
                                </>
                            ) : (
                                <>
                                    <div className="text-amber-500">• MPC {t.upload_page.cost_receipt.pkp_sign}: ~0.25 NEAR</div>
                                    <div>• {t.upload_page.cost_receipt.nft_mint}: 0.10 NEAR</div>
                                    <div>• {t.upload_page.cost_receipt.event_creation}: 0.10 NEAR</div>
                                    <div className="text-green-500">• {t.upload_page.mpc_fallback.estimated_refund}: ~{estimatedRefund} NEAR</div>
                                </>
                            )}
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

                <Separator className="bg-white/10" />

                {/* Used from Balance */}
                {!isFirstUpload && gasBalance > 0 && (
                    <div className="flex justify-between items-center text-zinc-400 text-xs">
                        <span>{t.upload_page.cost_receipt.from_balance}</span>
                        <span className="font-mono">~{(onChainCost + mpcCost).toFixed(2)} NEAR</span>
                    </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>
                        {isFirstUpload || topUpAmount > 0
                            ? t.upload_page.cost_receipt.total
                            : t.upload_page.cost_receipt.additional_payment}
                    </span>
                    <span className={`font-mono ${hasPKP ? 'text-green-400' : 'text-amber-400'}`}>
                        {loading ? "..." : displayTotal > 0 ? `${displayTotal.toFixed(4)} NEAR` : "0 NEAR ✓"}
                    </span>
                </div>
            </div>

            {/* Status message */}
            <div className="pt-1">
                {isFirstUpload ? (
                    hasPKP ? (
                        <p className="text-[10px] text-green-500/80 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {t.upload_page.cost_receipt.pkp_auto}
                        </p>
                    ) : (
                        <p className="text-[10px] text-amber-500/80">
                            ⚠️ PKP unavailable - MPC will be used, excess balance will be refunded
                        </p>
                    )
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
