import { Separator } from "@/components/ui/separator";
import { Loader2, Zap } from "lucide-react";
import { useLanguage } from '@/components/providers/LanguageContext';

interface CostReceiptProps {
    storageFee: string;
    currentBalance: string;
    payAmount: string;
    loading?: boolean;
    hasPKP?: boolean;
}

export function CostReceipt({ storageFee, payAmount, loading }: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;
    // Session costs: MPC (0.25) + NFT (0.1) + Event (0.1) = 0.45, round to 0.5
    const processingFee = 0.50;
    const payAmountFloat = parseFloat(payAmount) || 0;

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

                <Separator className="bg-white/10" />

                {/* Total to Pay */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>{t.upload_page.cost_receipt.total}</span>
                    <span className="font-mono text-green-400">
                        {loading ? "..." : `${payAmountFloat.toFixed(4)} NEAR`}
                    </span>
                </div>
            </div>

            {/* No prepaid gas message */}
            <p className="text-[10px] text-green-500/70 italic">
                ✓ Direct payment - no prepaid gas required
            </p>
        </div>
    );
}
