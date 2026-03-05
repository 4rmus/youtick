import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles } from "lucide-react";
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
}

interface CostItem {
    label: string;
    amount: number;
    muted?: boolean;
}

export function CostReceipt({
    storageFee,
    loading,
    gasBalance = 0,
}: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;

    // Build dynamic cost items — matches handleUpload's exactPrepaidNeeded
    const costItems: CostItem[] = [
        { label: t.upload_page.cost_receipt.storage_fee, amount: storageFeeFloat },
        { label: t.upload_page.cost_receipt.nft_mint, amount: 0.10 },
        { label: t.upload_page.cost_receipt.event_creation, amount: 0.10 },
    ];

    const totalCost = costItems.reduce((sum, item) => sum + item.amount, 0);

    // Existing prepaid balance is used as credit — upload flow auto-handles top-up
    const balanceCredit = Math.min(gasBalance, totalCost);
    const walletCharge = Math.max(0, totalCost - balanceCredit);

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            {/* Header */}
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
                {/* Dynamic cost items */}
                {costItems.map((item) => (
                    <div key={item.label} className="flex justify-between items-center text-zinc-300">
                        <span className={item.muted ? 'text-zinc-500' : ''}>
                            {item.label}
                        </span>
                        <span className="font-mono">
                            {loading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : `${item.amount.toFixed(item.amount < 0.01 && item.amount > 0 ? 4 : 2)} NEAR`
                            }
                        </span>
                    </div>
                ))}

                {/* Existing balance credit */}
                {balanceCredit > 0 && (
                    <div className="flex justify-between items-center text-green-400">
                        <span>{t.upload_page.cost_receipt.from_balance}</span>
                        <span className="font-mono">-{balanceCredit.toFixed(2)} NEAR</span>
                    </div>
                )}

                <Separator className="bg-white/10" />

                {/* Total — what user actually pays from wallet */}
                <div className="flex justify-between items-center font-bold text-white">
                    <span>{t.upload_page.cost_receipt.total}</span>
                    <span className="font-mono text-green-400">
                        {loading ? "..." : walletCharge > 0 ? `${walletCharge.toFixed(4)} NEAR` : "0 NEAR"}
                    </span>
                </div>
            </div>

            {/* Status — signless info, no scary top-up warnings */}
            <p className="text-[10px] text-zinc-500 pt-1">
                {walletCharge > 0
                    ? t.upload_page.cost_receipt.balance_low
                    : t.upload_page.cost_receipt.balance_sufficient
                }
            </p>
        </div>
    );
}
