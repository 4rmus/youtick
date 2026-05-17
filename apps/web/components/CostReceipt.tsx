import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles } from "lucide-react";
import { useLanguage } from '@/components/providers/LanguageContext';

export type StorageOrderStatus = 'pending' | 'success' | 'partial' | 'failed' | null;

interface CostReceiptProps {
    storageFee: string;
    loading?: boolean;
    gasBalance?: number;
    storageOrderStatus?: StorageOrderStatus;
}

interface CostItem {
    label: string;
    amount: number;
    muted?: boolean;
    badge?: { text: string; className: string } | null;
}

function getStorageBadge(
    status: StorageOrderStatus | undefined,
    t: ReturnType<typeof useLanguage>['t'],
): CostItem['badge'] {
    switch (status) {
        case 'success':
            return { text: t.upload_page.cost_receipt.persistence_status_success, className: 'bg-near-green/10 text-near-green border-near-green/30' };
        case 'partial':
            return { text: t.upload_page.cost_receipt.persistence_status_partial, className: 'bg-near-purple/10 text-near-purple border-near-purple/30' };
        case 'failed':
            return { text: t.upload_page.cost_receipt.persistence_status_failed, className: 'bg-near-red/10 text-near-red border-near-red/30' };
        default:
            return null;
    }
}

export function CostReceipt({
    storageFee,
    loading,
    gasBalance = 0,
    storageOrderStatus,
}: CostReceiptProps) {
    const { t } = useLanguage();

    const storageFeeFloat = parseFloat(storageFee) || 0;

    const storageBadge = getStorageBadge(storageOrderStatus, t);

    const costItems: CostItem[] = [
        { label: t.upload_page.cost_receipt.storage_fee, amount: storageFeeFloat },
        { label: t.upload_page.cost_receipt.nft_mint, amount: 0.10 },
        { label: t.upload_page.cost_receipt.event_creation, amount: 0.10 },
        { label: t.upload_page.cost_receipt.ipfs_persistence, amount: 0, muted: true, badge: storageBadge },
    ];

    const totalCost = costItems.reduce((sum, item) => sum + item.amount, 0);

    const balanceCredit = Math.min(gasBalance, totalCost);
    const walletCharge = Math.max(0, totalCost - balanceCredit);

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3 mb-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t.upload_page.cost_receipt.title}
                </h4>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-near-green/10 border border-near-green/30">
                    <Sparkles className="h-3 w-3 text-near-green" />
                    <span className="text-[10px] font-medium text-near-green">
                        {t.upload_page.cost_receipt.signless_upload}
                    </span>
                </div>
            </div>

            <div className="space-y-2 text-sm">
                {costItems.map((item) => (
                    <div key={item.label} className="flex justify-between items-center text-zinc-300">
                        <span className={item.muted ? 'text-zinc-500' : ''}>
                            {item.label}
                        </span>
                        <span className="font-mono flex items-center gap-2">
                            {item.badge && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${item.badge.className}`}>
                                    {item.badge.text}
                                </span>
                            )}
                            {loading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : item.muted && item.amount === 0
                                    ? <span className="text-zinc-500">{t.upload_page.cost_receipt.persistence_free}</span>
                                    : `${item.amount.toFixed(item.amount < 0.01 && item.amount > 0 ? 4 : 2)} NEAR`
                            }
                        </span>
                    </div>
                ))}

                {balanceCredit > 0 && (
                    <div className="flex justify-between items-center text-near-green">
                        <span>{t.upload_page.cost_receipt.from_balance}</span>
                        <span className="font-mono">-{balanceCredit.toFixed(2)} NEAR</span>
                    </div>
                )}

                <Separator className="bg-white/10" />

                <div className="flex justify-between items-center font-bold text-white">
                    <span>{t.upload_page.cost_receipt.total}</span>
                    <span className="font-mono text-near-green">
                        {loading ? "..." : walletCharge > 0 ? `${walletCharge.toFixed(4)} NEAR` : "0 NEAR"}
                    </span>
                </div>
            </div>

            <p className="text-[10px] text-zinc-500 pt-1">
                {walletCharge > 0
                    ? t.upload_page.cost_receipt.balance_low
                    : t.upload_page.cost_receipt.balance_sufficient
                }
            </p>
            <p className="text-[10px] leading-relaxed text-zinc-500">
                {t.upload_page.cost_receipt.revenue_split_note}
            </p>
        </div>
    );
}
