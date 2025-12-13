import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

interface CostReceiptProps {
    storageFee: string;
    currentBalance: string;
    payAmount: string;
    loading?: boolean;
}

export function CostReceipt({ storageFee, currentBalance, payAmount, loading }: CostReceiptProps) {
    const payAmountFloat = parseFloat(payAmount);
    const isPayable = payAmountFloat > 0;

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cost Breakdown</h4>

            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-zinc-300">
                    <span>Storage Fee (IPFS)</span>
                    <span className="font-mono">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : `${storageFee} NEAR`}</span>
                </div>

                <div className="flex justify-between items-center text-zinc-300">
                    <span>Processing Fee</span>
                    <span className="font-mono">1.00 NEAR</span>
                </div>

                <Separator className="bg-white/10" />

                <div className="flex justify-between items-center font-bold text-white">
                    <span>Total Payable</span>
                    <span className={`font-mono ${isPayable ? "text-yellow-500" : "text-green-500"}`}>
                        {loading ? "..." : (isPayable ? `${payAmount} NEAR` : "0.0000 NEAR")}
                    </span>
                </div>
            </div>

            {isPayable && (
                <p className="text-[10px] text-zinc-500 italic">
                    * Unused processing fees will be retained for future uploads.
                </p>
            )}
        </div>
    );
}
