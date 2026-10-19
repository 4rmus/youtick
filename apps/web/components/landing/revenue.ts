// The worked revenue example on the landing (owner decision O2, 2026-10-19). Approximate costs for
// illustration only: VAT depends on the viewer's country and the card cost on the card used; the exact
// rates are confirmed with each artist in writing before a work goes on sale. All amounts in cents.

export const REVENUE_EXAMPLE_RATES = {
    /** VAT included in the ticket price. */
    vatPercent: 25,
    /** Card payment cost on the price charged: a percentage plus a fixed amount. */
    cardPercent: 4,
    cardFixedCents: 40,
    /** youtick fee on the price before VAT. */
    youtickPercent: 5,
} as const;

export const REVENUE_EXAMPLE_PRICE_CENTS = 1000;

export type RevenueSplit = {
    priceCents: number;
    vatCents: number;
    cardCents: number;
    youtickCents: number;
    artistCents: number;
};

/** Splits a VAT-inclusive ticket price; the artist share is what remains after VAT, card cost and fee. */
export function revenueSplit(priceCents: number, rates = REVENUE_EXAMPLE_RATES): RevenueSplit {
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new Error('price must be a positive whole number of cents');
    const vatCents = Math.round(priceCents * rates.vatPercent / (100 + rates.vatPercent));
    const cardCents = Math.round(priceCents * rates.cardPercent / 100) + rates.cardFixedCents;
    const youtickCents = Math.round((priceCents - vatCents) * rates.youtickPercent / 100);
    return { priceCents, vatCents, cardCents, youtickCents, artistCents: priceCents - vatCents - cardCents - youtickCents };
}

export function formatDollars(cents: number): string {
    const sign = cents < 0 ? '−' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
