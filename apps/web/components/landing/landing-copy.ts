import type { LaunchStage } from '@/lib/constants';
import type { OpeningProgrammeMode, OpeningWorkType } from './opening-programme';

export type LandingLocale = 'en' | 'tr';

type Intro = {
    eyebrow: string;
    title: string;
    description: string;
};

type CardCopy = {
    title: string;
    description: string;
};

type ListCard = CardCopy & { items: readonly string[] };

export type RevenueExampleCopy = {
    title: string;
    price: string;
    vat: string;
    card: string;
    youtick: string;
    artist: string;
    note: string;
};

export type LandingCopy = {
    languageName: string;
    nav: {
        /** In-page anchors of the landing navigation, in display order. */
        sections: readonly { hash: string; label: string }[];
        /** Replaces the first link while the opening programme is shown. */
        openingProgramme: string;
        openingArtists: string;
        switchLanguage: string;
        connect: string;
        disconnect: string;
    };
    hero: {
        badge: string;
        title: string;
        subtitle: string;
        description: string;
        imageAlt: string;
        /** The text link under the buttons, by opening-programme state. */
        programmeLink: string;
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
    programme: Intro & { items: readonly CardCopy[] };
    boxOffice: Intro & {
        steps: readonly CardCopy[];
        imageAlt: string;
        preview: {
            label: string;
            title: string;
            tag: string;
            details: readonly { label: string; value: string }[];
        };
    };
    ticket: Intro & {
        cards: readonly [ListCard, ListCard];
        /** Links to the legal pages; `null` on the Turkish page, whose legal texts wait for counsel. */
        links: { terms: string; refund: string } | null;
    };
    artists: Intro & {
        cards: readonly [ListCard, ListCard];
        /** The worked revenue example; `null` on the Turkish page (no figures before counsel, K6). */
        example: RevenueExampleCopy | null;
    };
    apply: Intro & {
        points: readonly string[];
        action: string;
        note: string;
    };
    howItWorks: Intro & {
        items: readonly CardCopy[];
        technologyLabel: string;
    };
    closing: Intro;
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
 * Landing copy (public copy rewrite, 2026-10-19; draft in claudedocs/landing-metin-taslagi-20261019.md).
 *
 * `shared` is the copy every launch stage renders. The stage mechanism stays (`gala` and `vizyon`
 * override only what differs) but both overrides are empty: stages no longer appear in public copy.
 * Public copy never names the card payment provider, a rehearsal, beta, test or invitation phase,
 * USDC or crypto. The Turkish layer is the interim version: it carries no payment, price, refund,
 * card or chain wording until the Turkish counsel opinion (K6, X4).
 */
export const landingCopyLayers = {
    shared: {
        en: {
            languageName: 'Türkçe',
            nav: {
                sections: [
                    { hash: 'programme', label: 'Programme' },
                    { hash: 'box-office', label: 'Box office' },
                    { hash: 'artists', label: 'For artists' },
                    { hash: 'how-it-works', label: 'How it works' },
                ],
                openingProgramme: 'Opening programme',
                openingArtists: 'Opening artists',
                switchLanguage: 'Türkçe',
                connect: 'Connect',
                disconnect: 'Disconnect',
            },
            hero: {
                badge: 'Opening February 2027',
                title: 'Ticketed screenings of concerts, films and recorded performances.',
                subtitle: 'youtick is a digital screening room. Buy a ticket to an artist’s concert, film or performance and watch it in your own time.',
                description: 'We open with work by artists we have been talking to; their names and works will be announced on this page. Artists who want to show their work on youtick can apply now.',
                imageAlt: 'A concert stage facing a live audience',
                programmeLink: 'What you will be able to watch',
                openingProgrammeLink: 'See the opening programme',
                openingArtistsLink: 'See the opening artists',
            },
            openingProgramme: {
                eyebrow: 'February 2027',
                programme: {
                    title: 'Opening programme',
                    description: 'The first works on youtick, and the artists who made them. Each work has its own screening page.',
                },
                artists: {
                    title: 'Opening artists',
                    description: 'youtick opens with work by these artists. The works will be announced here.',
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
            programme: {
                eyebrow: 'Programme',
                title: 'From concert recordings to independent cinema.',
                description: 'Each work has its own screening page and its own ticket. You reach it through the link the artist shares; the opening programme will also be listed here.',
                items: [
                    { title: 'Concert recordings', description: 'Full concerts, live sessions and tour recordings.' },
                    { title: 'Independent films', description: 'Short films, features and documentaries, shown to their own audience.' },
                    { title: 'Festival selections', description: 'Curated programmes, recorded premieres and director talks.' },
                    { title: 'Special editions', description: 'Album films, commentary cuts and backstage footage.' },
                ],
            },
            boxOffice: {
                eyebrow: 'Box office',
                title: 'Buy a ticket. Watch in your own time.',
                description: 'A ticket is your personal right to watch one work. It does not expire: watch as often as you like for as long as the work is on youtick.',
                steps: [
                    { title: 'Open the screening page', description: 'Follow the artist’s link to the screening page. You see the ticket price before you pay.' },
                    { title: 'Sign in', description: 'Your tickets stay with your account and appear on any device you sign in on.' },
                    { title: 'Pay by card', description: 'Pay by credit or debit card. The price includes VAT where it applies.' },
                    { title: 'Press play', description: 'Watch when you are ready, as often as you like. One ticket works on up to three devices at a time.' },
                ],
                imageAlt: 'A packed concert audience watching the stage',
                preview: {
                    label: 'Screening page',
                    title: 'A concert recording',
                    tag: 'Example',
                    details: [
                        { label: 'Payment', value: 'Credit or debit card' },
                        { label: 'Devices', value: 'Up to 3 at a time' },
                        { label: 'Access', value: 'While the work is on youtick' },
                    ],
                },
            },
            ticket: {
                eyebrow: 'Ticket information',
                title: 'Your ticket and your rights, in plain words.',
                description: 'What you buy, what you can do with it, and what happens if something goes wrong. The full rules are in the terms and the refund policy.',
                cards: [
                    {
                        title: 'Your ticket',
                        description: 'A personal right to watch one work.',
                        items: [
                            'Watch as often as you like for as long as the work is on youtick.',
                            'One ticket works on up to three devices at a time.',
                            'The ticket is for you alone: it cannot be resold, lent or transferred, and it gives no right to copy, download or show the work in public.',
                        ],
                    },
                    {
                        title: 'Cancelling and refunds',
                        description: 'Your statutory rights are not affected.',
                        items: [
                            'Until you start playback, you can cancel within 14 days of purchase.',
                            'After playback starts, refunds cover technical problems, such as a video that does not play. There is no refund for a change of mind. If a video is faulty or not as described, you keep your statutory rights.',
                            'If a work is taken down, tickets that were never played are refunded.',
                            'Refunds go back to the card you paid with. Write to contact@youtick.net with your ticket code.',
                        ],
                    },
                ],
                links: { terms: 'Terms', refund: 'Refund policy' },
            },
            artists: {
                eyebrow: 'For artists',
                title: 'Your work, your screening page, your rights.',
                description: 'youtick is for musicians, filmmakers and performers who want to show recorded work to their own audience, by ticket.',
                cards: [
                    {
                        title: 'Why youtick',
                        description: 'One link for your audience.',
                        items: [
                            'Each work gets its own ticketed screening page. You share one link; viewers buy their ticket and watch there.',
                            'You do not need a shop or a checkout of your own: we sell the tickets, take card payments through our card payment provider and answer refund requests.',
                            'Your rights stay with you. You grant YOUTICK LTD a licence to make your work available to ticket holders.',
                        ],
                    },
                    {
                        title: 'How you are paid',
                        description: 'Clear terms before your work goes on sale.',
                        items: [
                            'You set the ticket price for each work.',
                            'From each ticket, VAT, the card payment cost and a 5% youtick fee on the price before VAT are deducted. The rest is your share, paid out monthly.',
                            'The rates for your work are confirmed with you in writing before it goes on sale.',
                        ],
                    },
                ],
                example: {
                    title: 'Example: one ticket',
                    price: 'Ticket price, VAT included',
                    vat: 'VAT (25%)',
                    card: 'Card payment cost (4% + $0.40)',
                    youtick: 'youtick fee (5% of the price before VAT)',
                    artist: 'Your share',
                    note: 'Approximate costs, for illustration. VAT depends on the viewer’s country and the card cost on the card used.',
                },
            },
            apply: {
                eyebrow: 'Artist applications',
                title: 'Apply to show your work on youtick.',
                description: 'Tell us about your work. A person reads every application, and we reply by email within a few working days.',
                points: [
                    'The form asks for your name, country and a link to your work: a channel, portfolio, trailer or press page.',
                    'We read applications for concert recordings, independent films, documentaries, festival selections and special editions.',
                    'If we decide to work together, we open your account for uploads; you upload the work, set the price and share your screening page.',
                    'Applying does not open an account or commit you to anything.',
                ],
                action: 'Apply as an artist',
                note: 'Questions before you apply? Write to contact@youtick.net.',
            },
            howItWorks: {
                eyebrow: 'How it works',
                title: 'What happens when you press play.',
                description: 'youtick runs the screening page, the ticket and the check before playback. Two networks work in the background: Livepeer for the video, NEAR for the ticket record.',
                items: [
                    { title: 'Ticket checked first', description: 'Before playback, youtick checks that the signed-in account holds a ticket, then gives short-lived access to the video.' },
                    { title: 'Ticket record on NEAR', description: 'Screenings and tickets are recorded on the NEAR blockchain, so a ticket’s status can be checked. The ticket record holds no name or email, and it does not make the ticket something you can trade.' },
                    { title: 'Video by Livepeer', description: 'Livepeer processes, stores and delivers the video to your screen.' },
                    { title: 'What we cannot prevent', description: 'A short ticket code is shown on screen while the video plays. Screen recording cannot be blocked.' },
                ],
                technologyLabel: 'Built with Livepeer and NEAR',
            },
            closing: {
                eyebrow: 'Opening February 2027',
                title: 'Come to watch, or bring your work.',
                description: 'Leave your email and we will write to you once, when youtick opens. If you are an artist, you can apply now.',
            },
            footer: {
                description: 'Ticketed digital screenings of concerts, films and recorded performances. youtick is run by YOUTICK LTD, registered in England and Wales (company number 17290900).',
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
                    { hash: 'programme', label: 'Program' },
                    { hash: 'box-office', label: 'Gişe' },
                    { hash: 'artists', label: 'Sanatçılar için' },
                    { hash: 'how-it-works', label: 'Nasıl çalışır' },
                ],
                openingProgramme: 'Açılış programı',
                openingArtists: 'Açılış sanatçıları',
                switchLanguage: 'English',
                connect: 'Bağlan',
                disconnect: 'Bağlantıyı kes',
            },
            hero: {
                badge: 'Şubat 2027’de açılıyor',
                title: 'Konserler, filmler ve performans kayıtları için biletli gösterim.',
                subtitle: 'youtick dijital bir gösterim salonu. Bir sanatçının konserini, filmini ya da performansını kendi biletli gösterim sayfasında, dilediğin zaman izle.',
                description: 'Açılışı, görüştüğümüz sanatçıların eserleriyle yapıyoruz; isimleri ve eserleri bu sayfada duyuracağız. Eserini youtick’te göstermek isteyen sanatçılar şimdiden başvurabilir.',
                imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
                programmeLink: 'Neler izleyebileceksin',
                openingProgrammeLink: 'Açılış programına göz at',
                openingArtistsLink: 'Açılış sanatçılarına göz at',
            },
            openingProgramme: {
                eyebrow: 'Şubat 2027',
                programme: {
                    title: 'Açılış programı',
                    description: 'youtick’teki ilk eserler ve onları yapan sanatçılar. Her eserin kendi gösterim sayfası var.',
                },
                artists: {
                    title: 'Açılış sanatçıları',
                    description: 'youtick bu sanatçıların eserleriyle açılıyor. Eserleri burada duyuracağız.',
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
            programme: {
                eyebrow: 'Program',
                title: 'Konser kayıtlarından bağımsız sinemaya.',
                description: 'Her eserin kendi gösterim sayfası ve kendi bileti var. Ona sanatçının paylaştığı bağlantıyla ulaşırsın; açılış programı burada da yer alacak.',
                items: [
                    { title: 'Konser kayıtları', description: 'Tam konser kayıtları, canlı oturumlar ve turne kayıtları.' },
                    { title: 'Bağımsız filmler', description: 'Kısa filmler, uzun metrajlar ve belgeseller, kendi izleyicileriyle buluşur.' },
                    { title: 'Festival seçkileri', description: 'Seçki programları, gala gösterimi kayıtları ve yönetmen söyleşileri.' },
                    { title: 'Özel sürümler', description: 'Albüm filmleri, yorumlu sürümler ve sahne arkası görüntüleri.' },
                ],
            },
            boxOffice: {
                eyebrow: 'Gişe',
                title: 'Biletinle, dilediğin zaman izle.',
                description: 'Bilet, bir eseri izlemen için sana özel bir haktır. Süresi dolmaz: eser youtick’te kaldıkça istediğin kadar izlersin.',
                steps: [
                    { title: 'Gösterim sayfasını aç', description: 'Sanatçının paylaştığı bağlantıdan gösterim sayfasına git.' },
                    { title: 'Giriş yap', description: 'Biletlerin hesabında durur; giriş yaptığın her cihazda görünür.' },
                    { title: 'Bilet kontrolü', description: 'İzlemeden önce youtick, hesabındaki bileti doğrular.' },
                    { title: 'Oynat', description: 'Hazır olduğunda izle; istediğin kadar tekrar izleyebilirsin. Bir bilet aynı anda en fazla üç cihazda kullanılabilir.' },
                ],
                imageAlt: 'Sahneyi izleyen kalabalık bir konser seyircisi',
                preview: {
                    label: 'Gösterim sayfası',
                    title: 'Bir konser kaydı',
                    tag: 'Örnek',
                    details: [
                        { label: 'Bilet', value: 'Kişiye özel' },
                        { label: 'Cihaz', value: 'Aynı anda en fazla 3' },
                        { label: 'Erişim', value: 'Eser youtick’te kaldıkça' },
                    ],
                },
            },
            ticket: {
                eyebrow: 'Bilet bilgileri',
                title: 'Biletin ve hakların, sade bir dille.',
                description: 'Biletinle neler yapabileceğini burada bulabilirsin.',
                cards: [
                    {
                        title: 'Biletin',
                        description: 'Bir eseri izlemek için sana özel bir hak.',
                        items: [
                            'Eser youtick’te kaldıkça istediğin kadar izle.',
                            'Bir bileti aynı anda en fazla üç cihazda kullanabilirsin.',
                            'Bilet yalnız senindir: satılamaz, ödünç verilemez, devredilemez; eseri kopyalama, indirme ya da herkese açık gösterme hakkı vermez.',
                        ],
                    },
                    {
                        title: 'Bize ulaş',
                        description: 'Biletin ya da bir gösterim hakkında sorun varsa bize yaz.',
                        items: [
                            'Biletinle ya da bir gösterimle ilgili soruların için contact@youtick.net adresine yaz.',
                            'Bir eserle ilgili bildirim için “İçerik bildir” sayfasını kullan.',
                        ],
                    },
                ],
                links: null,
            },
            artists: {
                eyebrow: 'Sanatçılar için',
                title: 'Eserin, gösterim sayfan, hakların.',
                description: 'youtick, eserlerinin kayıtlarını kendi izleyicilerine biletle göstermek isteyen müzisyenler, yönetmenler ve sahne sanatçıları için.',
                cards: [
                    {
                        title: 'Neden youtick',
                        description: 'İzleyicin için tek bir bağlantı.',
                        items: [
                            'Her eserin kendi biletli gösterim sayfası olur. Sen tek bir bağlantı paylaşırsın; izleyicin eseri orada, biletle izler.',
                            'Ayrı bir site ya da mağaza kurmana gerek yok; izleyicin eserine doğrudan gösterim sayfandan ulaşır.',
                            'Eserinin hakları sende kalır. Eserini bilet sahiplerine sunması için YOUTICK LTD şirketine lisans verirsin.',
                        ],
                    },
                    {
                        title: 'Koşullar',
                        description: 'Önce konuşuruz.',
                        items: [
                            'Her eserin koşullarını seninle birlikte netleştiririz.',
                            'Çalışma koşullarının ayrıntıları, eserin yayına girmeden önce yazılı olarak paylaşılır.',
                        ],
                    },
                ],
                example: null,
            },
            apply: {
                eyebrow: 'Sanatçı başvuruları',
                title: 'Eserini youtick’te göstermek için başvur.',
                description: 'Bize eserinden bahset. Her başvuruyu bir kişi okur; birkaç iş günü içinde e-postayla dönüş yaparız.',
                points: [
                    'Formda adını, ülkeni ve eserine bir bağlantı isteriz: kanal, portfolyo, fragman ya da basın sayfası.',
                    'Konser kayıtları, bağımsız filmler, belgeseller, festival seçkileri ve özel sürümler için başvuruları okuyoruz.',
                    'Birlikte çalışmaya karar verirsek hesabını yüklemeye açarız; eserini yükler ve gösterim sayfanı paylaşırsın.',
                    'Başvuru hesap açmaz ve seni hiçbir şeye bağlamaz.',
                ],
                action: 'Sanatçı olarak başvur',
                note: 'Başvurmadan önce sormak istediğin bir şey varsa contact@youtick.net adresine yaz.',
            },
            howItWorks: {
                eyebrow: 'Nasıl çalışır',
                title: 'Oynat’a bastığında ne olur?',
                description: 'Gösterim sayfasını, bileti ve izleme öncesi kontrolü youtick yürütür; videoyu Livepeer işler.',
                items: [
                    { title: 'Önce bilet kontrolü', description: 'İzleme başlamadan önce youtick, giriş yapan hesabın biletini doğrular ve videoya kısa süreli erişim verir.' },
                    { title: 'Kayıtlı bilet', description: 'Her bilet kayıt altındadır; böylece durumu doğrulanabilir.' },
                    { title: 'Video Livepeer ile', description: 'Videoyu Livepeer işler, saklar ve ekranına ulaştırır.' },
                    { title: 'Engelleyemediğimiz şey', description: 'Video oynarken ekranda kısa bir bilet kodu görünür. Ekran kaydı engellenemez.' },
                ],
                technologyLabel: 'Livepeer ile geliştirildi',
            },
            closing: {
                eyebrow: 'Şubat 2027’de açılıyor',
                title: 'İzlemeye gel ya da eserini getir.',
                description: 'E-posta adresini bırak, youtick açıldığında sana bir kez yazalım. Sanatçıysan şimdiden başvurabilirsin.',
            },
            footer: {
                description: 'Konserler, filmler ve performans kayıtları için biletli dijital gösterimler. youtick’i İngiltere ve Galler’de kayıtlı YOUTICK LTD (şirket numarası 17290900) işletir.',
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

/** The navigation links: the first one follows the opening-programme state. */
export function landingNavSections(copy: LandingCopy, mode: OpeningProgrammeMode): readonly { hash: string; label: string }[] {
    if (mode === 'hidden') return copy.nav.sections;
    const label = mode === 'programme' ? copy.nav.openingProgramme : copy.nav.openingArtists;
    return [{ hash: 'opening-programme', label }, ...copy.nav.sections.slice(1)];
}

/** The hero text link under the buttons, by opening-programme state. */
export function heroProgrammeLink(copy: LandingCopy, mode: OpeningProgrammeMode): { label: string; hash: string } {
    if (mode === 'programme') return { label: copy.hero.openingProgrammeLink, hash: 'opening-programme' };
    if (mode === 'artists') return { label: copy.hero.openingArtistsLink, hash: 'opening-programme' };
    return { label: copy.hero.programmeLink, hash: 'programme' };
}
