import { Separator } from "@/components/ui/separator";
import { Loader2, Zap, AlertTriangle, Fuel } from "lucide-react";
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
}

export function CostReceipt({
    storageFee,
    payAmount,
    loading,
    gasBalance = 0,
    requiredGas = 0.5,
    needsTopUp = false
}: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;
    // Session costs: MPC (0.25) + NFT (0.1) + Event (0.1) = 0.45, round to 0.5
    const processingFee = 0.50;
    const payAmountFloat = parseFloat(payAmount) || 0;

    // Calculate gas deficit
    const gasDeficit = needsTopUp ? Math.max(0, requiredGas - gasBalance) : 0;
    const topUpAmount = gasDeficit > 0 ? Math.ceil(gasDeficit * 10) / 10 : 0; // Round up to 0.1

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            {/* Header with PKP badge */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t.upload_page.cost_receipt.title}</h4>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30">
                    <Zap className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-medium text-green-400">PKP Direct</span>
                </div>
            </div>

            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-zinc-300">
                    <span>{t.upload_page.cost_receipt.storage_fee}</span>
                    <span className="font-mono">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : `${storageFeeFloat.toFixed(4)} NEAR`}</span>
                </div>

                <div className="flex justify-between items-center text-zinc-300">
                    <span>Network Fee</span>
                    <span className="font-mono text-green-400">{processingFee.toFixed(2)} NEAR</span>
                </div>

                {/* Gas Balance Status */}
                {needsTopUp && (
                    <>
                        <Separator className="bg-white/10" />
                        <div className="flex justify-between items-center text-zinc-400">
                            <span className="flex items-center gap-1.5">
                                <Fuel className="h-3 w-3" />
                                Prepaid Gas Balance
                            </span>
                            <span className="font-mono">{gasBalance.toFixed(2)} NEAR</span>
                        </div>
                        <div className="flex justify-between items-center text-amber-400">
                            <span className="flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3" />
                                Gas Top-Up Required
                            </span>
                            <span className="font-mono">+{topUpAmount.toFixed(1)} NEAR</span>
                        </div>
                    </>
                )}

                <Separator className="bg-white/10" />

                {/* Total to Pay */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>{t.upload_page.cost_receipt.total}</span>
                    <span className="font-mono text-green-400">
                        {loading ? "..." : `${(payAmountFloat + topUpAmount).toFixed(4)} NEAR`}
                    </span>
                </div>
            </div>

            {/* Status message */}
            {needsTopUp ? (
                <p className="text-[10px] text-amber-500/70 italic">
                    ⚠️ One signature required for gas top-up
                </p>
            ) : (
                <p className="text-[10px] text-green-500/70 italic">
                    ✓ Direct payment - no prepaid gas required
                </p>
            )}
        </div>
    );
}
