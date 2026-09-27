# YOUTICK LTD — provider fit and tax-role enquiry

26 September 2026. **DRAFT — NOT SENT.** Non-binding request for assessment;
not an application, signed declaration, agreed legal model or launch commitment.

Owner-facing decision and evidence:
[Türkçe ön kontrol](./youtick-card-provider-tax-role-preflight.md).
This English packet is prepared for potential provider review. Confirmed public
facts, owner declarations and outstanding information are distinguished below.

## Business brief

YOUTICK LTD is a UK private limited company, company number **17290900**.
The [Companies House record](https://find-and-update.company-information.service.gov.uk/company/17290900)
was checked on 26 September 2026: Active, incorporated on 20 June 2026.
Its registered office is Suite 10956, 5 Brayford Square, London, United Kingdom,
E1 0SG. The founder is a solo developer, manages the business from Türkiye,
and states that there are no employees. The registered address is not being
represented as an operating office: the founder is unsure whether there is
any physical office arrangement. Tax establishment has not been determined.

YouTick is developing a platform where independent creators publish videos
and viewers purchase access. The initial customer markets are Türkiye, the
UK and European countries to be specified. Initial creators are expected in
Türkiye and some European countries; their exact countries and legal types
are not yet specified. UK-based creators are not assumed at launch.
The owner specifies a **minimum ticket price of USD 2** and expects low sales
in the first months; no numerical volume forecast is available. Whether the
USD 2 floor is tax-inclusive or tax-exclusive remains to be confirmed.
Please assess both products separately:

- **P1 — paid video access:** one-off access to a creator's recorded video.
  Access duration and final licence terms are to be confirmed.
- **P2 — creator upload service:** a separately priced video upload,
  processing and publishing service. Please distinguish business customers
  from creators who may legally be consumers.

Google and passkey sign-in have been added to the application. The desired
card experience is sign-in, a tax-inclusive price, payment and access, without
requiring the customer to acquire cryptocurrency or operate a crypto wallet.
Card checkout and creator bank payouts are not yet implemented or approved.

The existing application code includes USDC payments on NEAR, account-bound
viewing entitlements and Livepeer media delivery. The proposed card route
would collect fiat and pay creator proceeds to bank accounts, with a separate
order-linked access record on NEAR and platform-funded network costs. We do
not propose converting the customer's card payment into a crypto purchase or
crediting card proceeds to existing USDC creator balances. Please assess the
whole business, including the separate USDC route and blockchain infrastructure;
we are not claiming that these are irrelevant to your acceptance policies.

Preferred model A is a genuine MoR/reseller arrangement with an appropriate
creator-to-platform licensing chain. Alternative B is a marketplace PSP with
creator verification and payouts, plus separate tax operations. Neither model
has been legally finalised. Please identify which you can support and what
changes, contracts or licences you require.

Stripe is excluded from our provider selection. Please identify any mandatory
Stripe dependency in your proposed processing or payout route and whether a
non-Stripe route can be contracted. We are requesting a transparent assessment,
not a route that conceals the nature of our business.

## Confirmed facts and outstanding information

| Field | Current state |
| --- | --- |
| Company registration | YOUTICK LTD / 17290900; active UK private limited company, incorporated 20 June 2026; public register checked |
| Website, contact and signatory | To be confirmed |
| Actual management and staff | Owner declaration: solo developer, managed from Türkiye, no employees |
| Physical premises and tax establishment | Physical office arrangements unknown; London registered office is not evidence of an operating office; UK/TR tax assessment outstanding |
| Existing VAT registrations and company settlement bank/currencies | To be confirmed |
| Initial creator countries | Türkiye and some European countries; exact European list pending; assess buyer and creator coverage independently |
| Creator legal types | To be confirmed; state individual, sole trader and company eligibility separately |
| Ticket/upload minimum, average and maximum price | Ticket minimum USD 2 (tax basis pending); average/maximum and upload pricing not supplied |
| Monthly transaction count, gross volume and country mix | Owner expects low initial sales; numerical forecast not supplied; do not treat expectation as actual trading history |
| Actual processing history, refund and dispute rates | Not supplied; do not assume zero |
| Content categories, rights checks, moderation and age policy | To be confirmed and reviewed before acceptance |

## Requested written response

Please answer **Supported / Conditional / Not supported**, separately for P1
and P2, with the contracting legal entity, conditions and a link or attachment
to the applicable contract. Please distinguish product capability from an
assessment or approval of YOUTICK LTD's disclosed model.

1. **Model acceptance:** Do you support independent creators selling recorded
   video access through this platform? Assess an open marketplace and a genuine
   licensed-distribution/reseller arrangement separately. Is P2 also eligible?
2. **Seller and tax roles:** Who contracts with the customer, appears on the
   receipt and card statement, calculates tax, files returns and remits tax?
   Please explicitly cover Türkiye B2C VAT, UK VAT and EU destination-country
   VAT. Tax calculation alone is not the requested MoR service. State exclusions
   and responsibilities retained by YouTick and creators.
3. **Creator onboarding:** Which creator countries/legal types are accepted?
   Who performs identity, business, beneficial-owner and bank verification?
   What additional due diligence applies to Turkish creators?
4. **Payouts:** Can you pay each creator directly, or only YOUTICK LTD? Specify
   Turkish bank eligibility, supported currencies and rails, conversion,
   minimums, schedule, reserves, payout failures and account-name matching.
   Does splitting a payment include paying the resulting balance to that bank?
5. **Funds and permissions:** Which regulated entity holds and moves funds?
   What role and payment-services obligations would YouTick have? Can your
   proposed contract avoid YouTick holding third-party customer funds in its
   ordinary operating bank account?
6. **Payments and fees:** Quote the full table below, including startup/minimum
   commitments and the economics of USD 2 tickets at low initial volume.
   Is a no-monthly-minimum/no-volume-commitment arrangement available, and what
   is charged in a month with zero sales? State accepted buyer card countries, billing currencies,
   Apple Pay/Google Pay eligibility and any limitations for Turkish-issued cards.
7. **Refunds and disputes:** Identify who decides, processes and funds refunds,
   chargebacks, negative balances and reserve shortfalls. What happens when the
   creator has already been paid? Are original processing fees returned? How
   are tax adjustments and payout reversals handled and reported?
8. **Digital-content withdrawal:** Can the agreed policy end change-of-mind
   withdrawal after valid prior consent, durable confirmation and actual
   streaming begins, while preserving mandatory remedies? Identify any provider
   policy overriding this. Assess the upload service separately.
9. **Integration evidence:** Provide authenticated payment/refund/dispute/payout
   notifications, authoritative status queries, duplicate-event handling and
   reconciliation reports. Can one order be traced through gross payment, tax,
   fees, access fulfilment, refund and creator payout?
10. **Content and blockchain disclosure:** Confirm acceptance or restrictions
    for the disclosed NEAR/USDC architecture, required licences and moderation.
    Identify the non-Stripe contracting/processing route and acceptance conditions.

## Country and product response sheet

EU countries and creator legal types must be enumerated where coverage differs.
Buyer acceptance, tax responsibility and creator payout are separate answers.
Markets below refer to buyers. Creators may reside in a different country;
list the supported creator-to-bank corridors independently rather than assuming
the buyer and creator share a country.

| Product / market | Buyer/card acceptance | Customer seller and tax entity | Creator onboarding | Creator bank payout/currency | Conditions / evidence |
| --- | --- | --- | --- | --- | --- |
| P1 / Türkiye | Pending | Pending | Pending | Pending | Pending |
| P1 / UK | Pending | Pending | Pending | Pending | Pending |
| P1 / EU countries | Pending | Pending | Pending | Pending | Pending |
| P2 / Türkiye | Pending | Pending | Not a creator-proceeds sale | Settlement to YouTick: pending | Pending |
| P2 / UK | Pending | Pending | Not a creator-proceeds sale | Settlement to YouTick: pending | Pending |
| P2 / EU countries | Pending | Pending | Not a creator-proceeds sale | Settlement to YouTick: pending | Pending |

## Comparable quotation sheet

| Item | Please specify |
| --- | --- |
| Percentage and fixed processing fee | Amount, currency, tax-inclusive/exclusive base, per authorisation or successful capture |
| MoR / tax / platform fee | Included or additional; covered territories and products |
| Card origin and method | Domestic/international, consumer/commercial, Apple Pay/Google Pay differences |
| FX | Exchange-rate source, spread, conversion points and settlement currencies |
| Creator onboarding and accounts | Verification, recurring account and inactive-account charges |
| Payout | Per payout, percentage, minimum, cross-border and failed/returned payment charges |
| Refund / dispute | Original fee treatment, refund fee, dispute fee, liability and recovery costs |
| Reserves | Percentage/fixed amount, holding period, release criteria and negative-balance liability |
| Fixed commitments | Setup, monthly minimum/invoice, minimum volume, contract length and termination costs; distinguish an additional monthly charge from a minimum credited against transaction fees |
| Example orders | Full breakdown for USD 2 as (a) the final customer total and (b) the pre-tax content price, including the buyer country's tax and creator net proceeds; optional USD 10/20 comparisons and available GBP/EUR/TRY equivalents. These are quote scenarios, not volume forecasts. |

Please return: (a) written model/territory assessment, (b) applicable contracts
and entity names, (c) fee schedule and worked examples, (d) required company
and creator documents, and (e) outstanding approval conditions. A preliminary
sales response is not treated as final underwriting or legal acceptance.

## Provider-specific additions

- **Reach:** Can technology-partner onboarding cover each creator, or is
  YouTick the sole Supplier? Clarify the licence chain and whether creator
  payouts and Türkiye B2C tax handling are included in the proposed agreement.
- **Zotlo:** Please distinguish MoR from connect-your-own-PSP service. Does the
  product support third-party creator onboarding/splits/payouts, rather than
  settlement only to the contracted business? Can this platform use the public
  standard rate, or does it require a custom agreement?
- **Mangopay:** We understand PSP service does not transfer our VAT management
  responsibility. Please assess digital-video and blockchain-related business
  acceptance, Turkish creator/bank eligibility and the complete quoted cost.
- **Nuvei:** Identify the exact Platforms product and contracting entity. Which
  additional checks apply to Turkish creators, which bank corridors/currencies
  are available, and are you acting as PSP or offering a distinct reseller model?

## Internal dispatch and response record

| Recipient candidate | Dispatch | Model acceptance | Quote | Tax-role evidence |
| --- | --- | --- | --- | --- |
| Reach | NOT SENT | None | None | None for YouTick |
| Zotlo | NOT SENT | None | None | None for YouTick |
| Mangopay | NOT SENT | None | None | General PSP limitation only |
| Nuvei | NOT SENT | None | None | None for YouTick |

No recipient email, sender identity or submission channel has been selected.
No private identity documents or financial credentials belong in this repository.
Any later submission needs owner-confirmed facts and explicit dispatch scope.
