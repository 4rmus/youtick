import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useLanguage } from '@/components/providers/LanguageContext';

interface CostReceiptProps {
    storageFee: string;
    currentBalance: string;
    payAmount: string;
    loading?: boolean;
}

export function CostReceipt({ storageFee, currentBalance, payAmount, loading }: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;
    const processingFee = 1.00; // Fixed processing fee
    const totalCost = storageFeeFloat + processingFee;
    const currentBalanceFloat = parseFloat(currentBalance) || 0;
    const payAmountFloat = parseFloat(payAmount) || 0;

    const isPayable = payAmountFloat > 0;

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t.upload_page.cost_receipt.title}</h4>

            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-zinc-300">
                    <span>{t.upload_page.cost_receipt.storage_fee}</span>
                    <span className="font-mono">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : `${storageFeeFloat.toFixed(4)} NEAR`}</span>
                </div>

                <div className="flex justify-between items-center text-zinc-300">
                    <span>{t.upload_page.cost_receipt.processing_fee}</span>
                    <span className="font-mono">{processingFee.toFixed(2)} NEAR</span>
                </div>

                <Separator className="bg-white/10" />

                {/* Total Cost - Always show real total */}
                <div className="flex justify-between items-center text-zinc-400">
                    <span>Total Cost</span>
                    <span className="font-mono">
                        {loading ? "..." : `${totalCost.toFixed(4)} NEAR`}
                    </span>
                </div>

                {/* Current Balance */}
                {currentBalanceFloat > 0 && (
                    <div className="flex justify-between items-center text-zinc-500">
                        <span>Your Balance</span>
                        <span className="font-mono text-green-500">-{Math.min(currentBalanceFloat, totalCost).toFixed(4)} NEAR</span>
                    </div>
                )}

                <Separator className="bg-white/10" />

                {/* Amount to Pay */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>{t.upload_page.cost_receipt.total}</span>
                    <span className={`font-mono ${isPayable ? "text-yellow-500" : "text-green-500"}`}>
                        {loading ? "..." : (isPayable ? `${payAmountFloat.toFixed(4)} NEAR` : "0.0000 NEAR ✓")}
                    </span>
                </div>
            </div>

            {isPayable && (
                <p className="text-[10px] text-zinc-500 italic">
                    {t.upload_page.cost_receipt.unused_warning}
                </p>
            )}

            {!isPayable && currentBalanceFloat > 0 && (
                <p className="text-[10px] text-green-500/70 italic">
                    ✓ Covered by your existing balance
                </p>
            )}
        </div>
    );
}
