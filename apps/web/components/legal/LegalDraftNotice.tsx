import { LEGAL_DRAFT_NOTICE } from './legal-facts';

/** A visible, neutral line marking a legal page as a draft pending counsel review. */
export function LegalDraftNotice() {
    return <p role="note" className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-300">{LEGAL_DRAFT_NOTICE}</p>;
}
