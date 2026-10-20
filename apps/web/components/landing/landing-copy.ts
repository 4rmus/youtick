import type { LaunchStage } from '@/lib/constants';
import type { OpeningProgrammeMode, OpeningWorkType } from './opening-programme';

export type LandingLocale = 'en' | 'tr';

export type LandingCopy = {
    languageName: string;
    nav: {
        /** In-page anchors of the landing navigation, in display order. */
        sections: readonly { hash: string; label: string }[];
        /** Added in front of the sections while the opening programme is shown. */
        openingProgramme: string;
        openingArtists: string;
        switchLanguage: string;
        connect: string;
        disconnect: string;
    };
    hero: {
        badge: string;
        /** One sentence: what is shown here, in the viewer's words. */
        title: string;
        /** One line: one ticket, one work, no subscription. */
        subtitle: string;
        imageAlt: string;
        /** The text link under the buttons while the opening programme is shown. */
        openingProgrammeLink: string;
        openingArtistsLink: string;
    };
    openingProgramme: {
        eyebrow: string;
        programme: { title: string; description: string };
        artists: { title: string; description: string };
        workTypes: Record<OpeningWorkType, string>;
        screeningPage: string;
    };
    /** The viewer block: how a ticket works. */
    ticket: { title: string; items: readonly string[] };
    /** The artist block: the situation and the difference in `lead`, then what the artist does and what we take over. */
    artists: { title: string; lead: string; items: readonly string[] };
    /** The line that links the full rules; `refund` is `null` on the Turkish page, whose refund wording waits for counsel. */
    rules: { label: string; terms: string; refund: string | null; faq: string };
    footer: {
        description: string;
        privacy: string;
        terms: string;
        /** `null` on the Turkish page until the Turkish refund wording clears counsel. */
        refund: string | null;
        report: string;
        support: string;
    };
    ctas: {
        /** Hero, primary: the opening notice (viewers). */
        notify: string;
        /** Hero, secondary: the artist application, in the artist's words. */
        show: string;
        /** The artist block button: the artist application. */
        apply: string;
    };
};

/**
 * Landing copy (two-audience rewrite, 2026-10-20; the analysis is in claudedocs/landing-konumlandirma-analizi-20261020.md).
 *
 * The page speaks to both audiences, one block each, from that audience's own situation: viewers come
 * back to the root page after seeing a work through an artist's link, artists come to check the site
 * before applying. The hero gives the common ground (one ticket, one work, no subscription), the
 * opening programme lists the works once there are any, "How a ticket works" answers the viewer and
 * "For artists" answers the artist. Every line states a decision the reader makes or a job they are
 * spared, never the mechanism behind it. Ticket rights, refund rules, the networks behind playback and
 * the worked revenue example live on the FAQ, the terms and the refund policy. `shared` is the copy
 * every launch stage renders; the stage overrides stay available but empty. Public copy never names the
 * card payment provider, a rehearsal, beta, test or invitation phase, USDC or crypto, Livepeer or NEAR.
 * The Turkish layer is the interim version: no payment, price, refund, card or chain wording and no
 * purchase call until the Turkish counsel opinion (K6, X4); what cannot be said is left out, not paraphrased.
 */
export const landingCopyLayers = {
    shared: {
        en: {
            languageName: 'Türkçe',
            nav: {
                sections: [
                    { hash: 'ticket', label: 'How a ticket works' },
                    { hash: 'artists', label: 'For artists' },
                ],
                openingProgramme: 'Opening programme',
                openingArtists: 'Opening artists',
                switchLanguage: 'Türkçe',
                connect: 'Connect',
                disconnect: 'Disconnect',
            },
            hero: {
                badge: 'Opening February 2027',
                title: 'Independent films, documentaries and concert recordings, by ticket.',
                subtitle: 'One ticket, one work. Watch when you like. No subscription.',
                imageAlt: 'A concert stage facing a live audience',
                openingProgrammeLink: 'See the opening programme',
                openingArtistsLink: 'See the opening artists',
            },
            openingProgramme: {
                eyebrow: 'February 2027',
                programme: {
                    title: 'Opening programme',
                    description: 'youtick opens in February 2027 with these works.',
                },
                artists: {
                    title: 'Opening artists',
                    description: 'youtick opens with work by these artists.',
                },
                workTypes: {
                    concert: 'Concert recording',
                    film: 'Film',
                    documentary: 'Documentary',
                    festival: 'Festival selection',
                    special: 'Special edition',
                },
                screeningPage: 'Screening page',
            },
            ticket: {
                title: 'How a ticket works',
                items: [
                    'Pay by credit or debit card on the work’s screening page. The price includes VAT where it applies.',
                    'Watch when you like, on up to three devices at a time. The ticket stays valid while the work is on youtick.',
                    'Cancel within 14 days if you have not pressed play. Technical problems are refunded.',
                ],
            },
            artists: {
                title: 'For artists',
                lead: 'Made a film or recorded a concert? Release it here as a ticketed screening. No channel, no subscription, no shop to build.',
                items: [
                    'Upload the recording and set the ticket price.',
                    'Share the screening page with your audience.',
                    'We take the card payment, handle VAT and answer refund requests.',
                    'Your share is paid monthly. From each ticket we deduct VAT, the card cost and a 5% youtick fee on the pre-VAT price.',
                ],
            },
            rules: { label: 'Full rules', terms: 'Terms', refund: 'Refund policy', faq: 'FAQ' },
            footer: {
                description: 'youtick is run by YOUTICK LTD, registered in England and Wales, company number 17290900.',
                privacy: 'Privacy',
                terms: 'Terms',
                refund: 'Refund policy',
                report: 'Report content',
                support: 'Support',
            },
            ctas: {
                notify: 'Notify me when it opens',
                show: 'Show your work on youtick',
                apply: 'Apply as an artist',
            },
        },
        tr: {
            languageName: 'English',
            nav: {
                sections: [
                    { hash: 'ticket', label: 'Bilet nasıl işler' },
                    { hash: 'artists', label: 'Sanatçılar için' },
                ],
                openingProgramme: 'Açılış programı',
                openingArtists: 'Açılış sanatçıları',
                switchLanguage: 'English',
                connect: 'Bağlan',
                disconnect: 'Bağlantıyı kes',
            },
            hero: {
                badge: 'Şubat 2027’de açılıyor',
                title: 'Bağımsız filmler, belgeseller ve konser kayıtları, biletle.',
                subtitle: 'Tek bilet, tek eser. Dilediğin zaman izle. Abonelik yok.',
                imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
                openingProgrammeLink: 'Açılış programına göz at',
                openingArtistsLink: 'Açılış sanatçılarına göz at',
            },
            openingProgramme: {
                eyebrow: 'Şubat 2027',
                programme: {
                    title: 'Açılış programı',
                    description: 'youtick Şubat 2027’de bu eserlerle açılıyor.',
                },
                artists: {
                    title: 'Açılış sanatçıları',
                    description: 'youtick bu sanatçıların eserleriyle açılıyor.',
                },
                workTypes: {
                    concert: 'Konser kaydı',
                    film: 'Film',
                    documentary: 'Belgesel',
                    festival: 'Festival seçkisi',
                    special: 'Özel sürüm',
                },
                screeningPage: 'Gösterim sayfası',
            },
            ticket: {
                title: 'Bilet nasıl işler',
                items: [
                    'Biletin, eserin gösterim sayfasında hesabına bağlanır.',
                    'Dilediğin zaman, aynı anda üç cihaza kadar izlersin. Bilet, eser youtick’te kaldığı sürece geçerlidir.',
                    'Bilet sana özeldir; başkasına devredilemez.',
                ],
            },
            artists: {
                title: 'Sanatçılar için',
                lead: 'Film çektin ya da konser kaydettin mi? Burada biletli bir gösterim olarak yayınla. Kanal yok, abonelik yok, kurulacak mağaza yok.',
                items: [
                    'Kaydını yükle, gösterim sayfanı kitlenle paylaş.',
                    'Eserinin hakları sende kalır.',
                ],
            },
            rules: { label: 'Ayrıntılar', terms: 'Koşullar', refund: null, faq: 'Sık sorulan sorular' },
            footer: {
                description: 'youtick’i İngiltere ve Galler’de kayıtlı YOUTICK LTD işletir (şirket numarası 17290900).',
                privacy: 'Gizlilik',
                terms: 'Koşullar',
                refund: null,
                report: 'İçerik bildir',
                support: 'Destek',
            },
            ctas: {
                notify: 'Açılıştan haberdar ol',
                show: 'Eserini youtick’te göster',
                apply: 'Sanatçı olarak başvur',
            },
        },
    } as const satisfies Record<LandingLocale, LandingCopy>,
    // Stage overrides stay available but empty: no stage wording or stage-specific claim is public.
    gala: { en: {}, tr: {} } as const satisfies Record<LandingLocale, LandingCopyOverride>,
    vizyon: { en: {}, tr: {} } as const satisfies Record<LandingLocale, LandingCopyOverride>,
};

type DeepPartial<T> = T extends readonly (infer U)[]
    ? readonly U[]
    : T extends object
        ? { [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/** A stage layer: any subset of the copy; arrays replace the shared value whole. */
export type LandingCopyOverride = DeepPartial<LandingCopy>;

function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
    if (override === undefined) return base;
    if (override === null || typeof override !== 'object' || Array.isArray(override)) return override as T;
    if (base === null || typeof base !== 'object' || Array.isArray(base)) return override as T;
    const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
        merged[key] = mergeCopy((base as Record<string, unknown>)[key], value as never);
    }
    return merged as T;
}

/** The complete copy of one locale at one launch stage; `prova` is the shared layer itself. */
export function getLandingCopy(locale: LandingLocale, stage: LaunchStage = 'prova'): LandingCopy {
    const shared: LandingCopy = landingCopyLayers.shared[locale];
    if (stage === 'prova') return shared;
    return mergeCopy(shared, landingCopyLayers[stage][locale]);
}

/** The shared layer. Stage-aware callers use `getLandingCopy` with `LAUNCH_STAGE`. */
export const landingCopy: Record<LandingLocale, LandingCopy> = landingCopyLayers.shared;

/** The creator application page for each landing locale. */
export function creatorApplyHref(locale: LandingLocale): string {
    return locale === 'tr' ? '/tr/apply' : '/apply';
}

/** The opening-notice sign-up page for each landing locale. */
export function openingNoticeHref(locale: LandingLocale): string {
    return locale === 'tr' ? '/tr/notify' : '/notify';
}

/** The FAQ page for each landing locale. */
export function faqHref(locale: LandingLocale): string {
    return locale === 'tr' ? '/tr/faq' : '/faq';
}

export function landingHomeHref(locale: LandingLocale): string {
    return locale === 'tr' ? '/tr' : '/';
}

export type LandingCtas = {
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
};

/** The hero calls to action: the opening notice for viewers, the application for artists. */
export function getLandingCtas(locale: LandingLocale, stage: LaunchStage = 'prova'): LandingCtas {
    const copy = getLandingCopy(locale, stage).ctas;
    return {
        primary: { label: copy.notify, href: openingNoticeHref(locale) },
        secondary: { label: copy.show, href: creatorApplyHref(locale) },
    };
}

/** The navigation links: the opening programme comes first while it is shown. */
export function landingNavSections(copy: LandingCopy, mode: OpeningProgrammeMode): readonly { hash: string; label: string }[] {
    if (mode === 'hidden') return copy.nav.sections;
    const label = mode === 'programme' ? copy.nav.openingProgramme : copy.nav.openingArtists;
    return [{ hash: 'opening-programme', label }, ...copy.nav.sections];
}

/** The hero text link under the buttons; `null` while the opening programme is hidden. */
export function heroProgrammeLink(copy: LandingCopy, mode: OpeningProgrammeMode): { label: string; hash: string } | null {
    if (mode === 'programme') return { label: copy.hero.openingProgrammeLink, hash: 'opening-programme' };
    if (mode === 'artists') return { label: copy.hero.openingArtistsLink, hash: 'opening-programme' };
    return null;
}
