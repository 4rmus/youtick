'use client';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusLine } from '@/components/ui/status-line';
import type { Messages } from '@/lib/i18n/messages';

type WithdrawDialogProps = {
    open: boolean;
    amount: string;
    recipient: string;
    busy: boolean;
    t: Messages['studio'];
    onConfirm(): void;
    onClose(): void;
};

/** Summary before withdraw_creator_balance: amount, recipient and who pays the network fee. */
export function WithdrawDialog({ open, amount, recipient, busy, t, onConfirm, onClose }: WithdrawDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} title={t.confirmTitle} closeLabel={t.cancel}>
            <div className="flex flex-col gap-5">
                <dl className="flex flex-col border-t border-line text-sm">
                    <div className="flex justify-between gap-4 border-b border-line py-3"><dt className="text-light-3">{t.confirmAmount}</dt><dd className="tabular text-lg">{amount} USDC</dd></div>
                    <div className="flex justify-between gap-4 border-b border-line py-3"><dt className="text-light-3">{t.confirmRecipient}</dt><dd className="break-all text-right">{recipient}</dd></div>
                    <div className="flex flex-col gap-1 border-b border-line py-3"><dt className="text-light-3">{t.confirmFee}</dt><dd className="text-light-2">{t.confirmFeeValue}</dd></div>
                </dl>
                <p className="text-[13px] text-light-3">{t.confirmNote}</p>
                {busy && <StatusLine tone="progress">{t.withdrawing}</StatusLine>}
                <div className="flex flex-wrap gap-3">
                    <Button disabled={busy} onClick={onConfirm}>{t.confirm}</Button>
                    <Button variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button>
                </div>
            </div>
        </Dialog>
    );
}
