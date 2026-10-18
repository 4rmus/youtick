import Link from 'next/link';

/**
 * Legal navigation under every page. English pages link the English legal drafts; Turkish pages carry
 * only the neutral navigation label to the (English) report page, because Turkish legal texts wait for
 * counsel (launch brief 2026-10-18, K14).
 */
export const LEGAL_LINKS = {
    en: [
        { href: '/terms', label: 'Terms' },
        { href: '/refund-policy', label: 'Refund policy' },
        { href: '/privacy', label: 'Privacy' },
        { href: '/report', label: 'Report content' },
    ],
    tr: [
        { href: '/report', label: 'İçerik bildir' },
    ],
} as const;

export function LegalFooter({ lang }: { lang: 'en' | 'tr' }) {
    return <footer className="border-t border-white/10 bg-black">
        <nav aria-label={lang === 'tr' ? 'Yasal' : 'Legal'} className="container mx-auto flex flex-wrap gap-x-5 gap-y-2 px-4 py-4 text-xs text-zinc-500">
            {LEGAL_LINKS[lang].map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center hover:text-zinc-300">{item.label}</Link>)}
        </nav>
    </footer>;
}
