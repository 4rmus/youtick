import type { CreatorSale } from '@/lib/market-read-model';

export type SaleTotals = { saleCount: number; creatorAmount: bigint };

/** USDC sale totals per publication (NEAR-denominated rows are not shown as USDC earnings). */
export function usdcSalesByPublication(sales: readonly CreatorSale[]): Map<string, SaleTotals> {
    const totals = new Map<string, SaleTotals>();
    for (const sale of sales) {
        if (sale.asset !== 'USDC') continue;
        const current = totals.get(sale.publicationId) ?? { saleCount: 0, creatorAmount: 0n };
        totals.set(sale.publicationId, { saleCount: current.saleCount + sale.saleCount, creatorAmount: current.creatorAmount + BigInt(sale.creatorAmount) });
    }
    return totals;
}

export function canWithdraw(balance: string | undefined): boolean {
    return Boolean(balance && /^[0-9]+$/.test(balance) && BigInt(balance) > 0n);
}
