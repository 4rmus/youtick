// Facts the English legal pages (terms, refund policy, content reports) share, so they cannot drift.
// Draft texts: corrected by counsel later (launch brief 2026-10-18, X4). No Turkish legal text here.

export const LEGAL_DRAFT_DATE = '18 October 2026';

/** The visible line on every draft legal page. */
export const LEGAL_DRAFT_NOTICE = `Draft of ${LEGAL_DRAFT_DATE}, pending review by our legal counsel. It may change before tickets are sold for real money.`;

export const COMPANY = {
    name: 'YOUTICK LTD',
    jurisdiction: 'England and Wales',
    companyNumber: '17290900',
    icoReference: 'ZC276359',
    contactEmail: 'contact@youtick.net',
    reportsEmail: 'abuse@youtick.net',
} as const;

/** How many devices one ticket can be linked to at a time (Market V2 `add_device`). */
export const TICKET_DEVICE_LIMIT = 3;

/** The statutory cancellation period for distance contracts (Consumer Contracts Regulations 2013). */
export const CANCELLATION_DAYS = 14;

/** Market V2 refund window for crypto tickets, from purchase (contract README, "Refund window"). */
export const USDC_REFUND_WINDOW_DAYS = 30;

/** youtick's answer time for a refund request (payment service `ANSWER_WITHIN_MS`). */
export const REFUND_ANSWER_HOURS = 72;
