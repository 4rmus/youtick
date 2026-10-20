// Wording rules every public page is tested against (landing, FAQ). Not a test file: vitest collects *.test.ts only.

// Owner brief 2026-10-19: no rehearsal, beta, test or invitation phase, no payment provider name, no
// USDC or crypto, no exact opening day, and the never-used list of the claim register.
export const FORBIDDEN_IN_PUBLIC: readonly RegExp[] = [
    /cleeng/i, /payment partner/i, /merchant of record/i,
    /rehearsal/i, /\bprova/i, /\bbeta\b/i, /testnet/i, /\btest\b/i, /sandbox/i, /pilot/i, /invit/i, /davet/i, /deneme/i,
    /\bsoon\b/i, /yakında/i, /\b\d{1,2}\.? ?(February|Şubat)\b/i, /\b(February|Şubat) \d{1,2}\b/i, /\bNov(ember)?\b/i, /Kasım/,
    /USDC/i, /crypto/i, /kripto/i, /token/i, /wallet/i, /cüzdan/i, /seed phrase/i, /\bgas\b/i, /1Click/i, /\bNFT/i,
    /Apple Pay/i, /Google Pay/i,
    /revolution/i, /devrim/i, /licensed/i, /lisanslı/i, /\bFCA\b/, /MiCA/i, /invest/i, /yatırım/i,
    /audit/i, /external review/i, /dış inceleme/i, /watermark/i, /filigran/i, /founder/i, /kurucu/i,
    /cheaper/i, /ucuz/i, /screen recording is blocked/i, /ekran kaydı engellenir/i, /fan list/i, /hayran/i,
];

// K6 interim Turkish page: no payment, price, refund, card or chain wording until counsel (X4).
// `[iİ]` because a case-insensitive /i does not fold the dotted capital İ ("İade").
export const FORBIDDEN_IN_TURKISH: readonly RegExp[] = [
    /USDC/i, /kripto/i, /crypto/i, /\bNEAR\b/, /token/i, /blockchain/i, /zincir/i, /1Click/i,
    /\bkart/i, /\bcard/i, /öde/i, /ödeme/i, /banka/i, /fiyat/i, /ücret/i, /\bpara\b/i, /satın/i, /satış/i,
    /\bTL\b/, /dolar/i, /\$/, /%/, /Apple Pay/i, /Google Pay/i, /[iİ]ade/i, /vergi/i, /KDV/i,
];
