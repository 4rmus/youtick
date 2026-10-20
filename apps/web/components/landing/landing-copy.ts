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
        /** One sentence: what youtick is. */
        title: string;
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
    /** Three sentences on how a screening works. */
    about: { description: string };
    artists: { title: string; items: readonly string[] };
    viewers: { title: string; items: readonly string[] };
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
        notify: string;
        apply: string;
    };
};

/**
 * Landing copy (short-copy rewrite, 2026-10-20; the earlier draft of 2026-10-19 was rejected as too long).
 *
 * One sentence of what youtick is, three sentences of how it works, four lines for artists, three for
 * viewers, one line to the full rules. Ticket rights, refunds, playback and the worked revenue example
 * live on the FAQ, the terms and the refund policy. `shared` is the copy every launch stage renders; the
 * stage overrides stay available but empty. Public copy never names the card payment provider, a rehearsal,
 * beta, test or invitation phase, USDC or crypto, Livepeer or NEAR. The Turkish layer is the interim
 * version: no payment, price, refund, card or chain wording until the Turkish counsel opinion (K6, X4).
 */
export const landingCopyLayers = {
    shared: {
        en: {
            languageName: 'Türkçe',
            nav: {
                sections: [
                    { hash: 'artists', label: 'For artists' },
                    { hash: 'viewers', label: 'For viewers' },
                ],
                openingProgramme: 'Opening programme',
                openingArtists: 'Opening artists',
                switchLanguage: 'Türkçe',
                connect: 'Connect',
                disconnect: 'Disconnect',
            },
            hero: {
                badge: 'Opening February 2027',
                title: 'youtick is a ticketed screening room for recorded concerts, films and performances.',
                imageAlt: 'A concert stage facing a live audience',
                openingProgrammeLink: 'See the opening programme',
                openingArtistsLink: 'See the opening artists',
            },
            openingProgramme: {
                eyebrow: 'February 2027',
                programme: {
                    title: 'Opening programme',
                    description: 'The first works on youtick. Each has its own screening page.',
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
            about: {
                description: 'Each work has its own screening page and its own ticket. Artists send their audience to that page. With a ticket you watch the work as often as you like while it stays on youtick.',
            },
            artists: {
                title: 'For artists',
                items: [
                    'Upload a recording, set the ticket price and share one link.',
                    'You keep the rights to your work.',
                    'VAT, the card cost and a 5% youtick fee on the pre-VAT price are deducted from each ticket. The rest is paid to you monthly.',
                    'Apply with a link to your work. A person reads every application and replies by email.',
                ],
            },
            viewers: {
                title: 'For viewers',
                items: [
                    'Pay by credit or debit card. The price shown includes VAT where it applies.',
                    'Watch on up to three devices at a time, signed in to your account.',
                    'There is no fixed showtime. Press play whenever you like.',
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
                apply: 'Apply as an artist',
            },
        },
        tr: {
            languageName: 'English',
            nav: {
                sections: [
                    { hash: 'artists', label: 'Sanatçılar için' },
                    { hash: 'viewers', label: 'İzleyiciler için' },
                ],
                openingProgramme: 'Açılış programı',
                openingArtists: 'Açılış sanatçıları',
                switchLanguage: 'English',
                connect: 'Bağlan',
                disconnect: 'Bağlantıyı kes',
            },
            hero: {
                badge: 'Şubat 2027’de açılıyor',
                title: 'youtick, konser, film ve performans kayıtlarını biletle izlediğin dijital bir gösterim salonu.',
                imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
                openingProgrammeLink: 'Açılış programına göz at',
                openingArtistsLink: 'Açılış sanatçılarına göz at',
            },
            openingProgramme: {
                eyebrow: 'Şubat 2027',
                programme: {
                    title: 'Açılış programı',
                    description: 'youtick’teki ilk eserler. Her birinin kendi gösterim sayfası var.',
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
            about: {
                description: 'Her eserin kendi gösterim sayfası ve kendi bileti var. Sanatçı, izleyicisini bu sayfaya yönlendirir. Eser youtick’te kaldığı sürece biletinle istediğin kadar izlersin.',
            },
            artists: {
                title: 'Sanatçılar için',
                items: [
                    'Kaydını yükler, gösterim sayfanın bağlantısını paylaşırsın.',
                    'Eserinin hakları sende kalır.',
                    'Çalışma koşullarını eserin yayına girmeden önce yazılı olarak netleştiririz.',
                    'Eserinin bağlantısıyla başvur. Her başvuruyu bir kişi okur ve e-postayla yanıt verir.',
                ],
            },
            viewers: {
                title: 'İzleyiciler için',
                items: [
                    'Bir biletle aynı anda en fazla üç cihazda izleyebilirsin.',
                    'Sabit seans saati yok. Dilediğin zaman izlersin.',
                    'Bilet sana özeldir, başkasına devredilemez.',
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

/** Viewer and artist calls to action: the opening notice and the artist application. */
export function getLandingCtas(locale: LandingLocale, stage: LaunchStage = 'prova'): LandingCtas {
    const copy = getLandingCopy(locale, stage).ctas;
    return {
        primary: { label: copy.notify, href: openingNoticeHref(locale) },
        secondary: { label: copy.apply, href: creatorApplyHref(locale) },
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
