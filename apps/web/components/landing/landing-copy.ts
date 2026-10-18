import type { LaunchStage } from '@/lib/constants';

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

export type RoiCopy = Intro & {
    presets: readonly { label: string; price: string; sales: number }[];
    ticketPrice: string;
    invalidTicketPrice: string;
    estimatedSales: string;
    totalSales: string;
    creatorShare: string;
    platformFee: string;
    creatorShareDescription: string;
    estimateNote: string;
    uploadFeeTitle: string;
    uploadFeeDescription: string;
};

export type LandingCopy = {
    languageName: string;
    nav: {
        /** In-page anchors of the landing navigation, in display order. */
        sections: readonly { hash: string; label: string }[];
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
    };
    audience: Intro & {
        creator: CardCopy & { benefits: readonly string[] };
        viewer: CardCopy & { benefits: readonly string[] };
    };
    howItWorks: Intro & {
        steps: readonly CardCopy[];
        imageAlt: string;
        /** The screening card over the image; `null` leaves the image alone. */
        preview: {
            label: string;
            title: string;
            tag: string;
            details: readonly { label: string; value: string }[];
        } | null;
    };
    useCases: Intro & { items: readonly CardCopy[] };
    /** The ticket-split simulator; `null` hides the section (the Turkish layer carries no payment copy, K6). */
    roi: RoiCopy | null;
    trust: Intro & {
        items: readonly CardCopy[];
        technologyLabel: string;
    };
    creators: Intro & {
        points: readonly string[];
        action: string;
        note: string;
        heroLink: string;
    };
    cta: Intro;
    footer: {
        description: string;
        /** External project links; the Turkish layer names no chain. */
        links: readonly { label: string; href: string }[];
        privacy: string;
        terms: string;
        support: string;
    };
    ctas: {
        enabled: {
            primary: string;
            secondary: string;
        };
        disabled: {
            primary: string;
            secondary: string;
            status: string;
        };
    };
};

/**
 * Launch-stage copy layers (design-language plan §4.3).
 *
 * `shared` is the Prova layer and the base every stage inherits. `gala` and
 * `vizyon` override only what differs; their text is a placeholder carrying
 * the plan's §4.5 lines and is never rendered while `LAUNCH_STAGE` is `prova`.
 *
 * Prova describes today's V2 testnet rehearsal and nothing beyond it: no
 * payment, payout, refund, device, fan or review promises (claim register
 * 2–16), no dates and no "soon". The Turkish layer stays neutral (K6): who we
 * are, the invitation and how to apply, with no payment, card, USDC or crypto
 * wording and no chain named.
 */
export const landingCopyLayers = {
    shared: {
        en: {
            languageName: 'Türkçe',
            nav: {
                sections: [
                    { hash: 'audience', label: 'For creators and viewers' },
                    { hash: 'how-it-works', label: 'How it works' },
                    { hash: 'roi-calculator', label: 'Fee model' },
                ],
                switchLanguage: 'Türkçe',
                connect: 'Connect',
                disconnect: 'Disconnect',
            },
            hero: {
                badge: 'Invite-only rehearsal on the NEAR testnet',
                title: 'Ticketed screenings for independent film and music.',
                subtitle: 'youtick is a ticketed-screening platform. Today it runs as an invite-only rehearsal on the NEAR testnet, with test tickets that have no real value.',
                description: 'Invited creators sign in with Google or a passkey, upload with an invite credit and open a test screening for their viewers. Card checkout exists in a sandbox and is not public. Film and music creators can apply for an invite.',
                imageAlt: 'A concert stage facing a live audience',
            },
            audience: {
                eyebrow: 'The rehearsal',
                title: 'A clear experience for both sides of the screen.',
                description: 'Invited creators and their viewers try the release and ticket flow on the testnet. The rehearsal is not a commercial launch: nothing here is sold for real money.',
                creator: {
                    title: 'For creators',
                    description: 'Try releasing a film, concert recording or special video in the invite-only rehearsal.',
                    benefits: [
                        'Sign in with Google or a passkey.',
                        'Upload with an invite credit and publish when processing is complete.',
                        'Set a test ticket price and publish from your studio page.',
                    ],
                },
                viewer: {
                    title: 'For viewers',
                    description: 'Try access to a specific work with a test ticket.',
                    benefits: [
                        'See the creator and the test ticket price before you decide.',
                        'Sign in with Google or a passkey; test tickets use test tokens that have no real value.',
                        'Start playback once your ticket is confirmed.',
                    ],
                },
            },
            howItWorks: {
                eyebrow: 'How it works today',
                title: 'From sign-in to playback in four steps.',
                description: 'youtick handles sign-in, upload and the ticket flow while Livepeer prepares the video for reliable playback.',
                steps: [
                    { title: 'Sign in', description: 'Creators and viewers sign in with Google or a passkey. Publishing is open to invited creators only.' },
                    { title: 'Upload with an invite credit', description: 'An invite credit covers the upload of your source file (rehearsal limit: 5 GB). Confirm your publishing rights before the upload starts.' },
                    { title: 'Publish after processing', description: 'When Livepeer finishes processing, the screening is recorded on the NEAR testnet and gets its own page.' },
                    { title: 'Test ticket and playback', description: 'Viewers buy a test ticket with test tokens that have no real value and watch once the ticket is confirmed. Card checkout runs in a sandbox and is not public.' },
                ],
                imageAlt: 'A packed concert audience watching the stage',
                preview: {
                    label: 'Screening preview',
                    title: 'Independent concert premiere',
                    tag: 'Test ticket',
                    details: [
                        { label: 'Video', value: 'Playback with Livepeer' },
                        { label: 'Sign-in', value: 'Google or passkey' },
                        { label: 'Access', value: 'Ticket check before playback' },
                    ],
                },
            },
            useCases: {
                eyebrow: 'Film and music releases',
                title: 'For work that deserves more than another video link.',
                description: 'Create a focused ticketed screening for the release your audience is waiting for.',
                items: [
                    { title: 'Concert recordings', description: 'Offer a full show, acoustic session, rehearsal, or tour recording.' },
                    { title: 'Independent films', description: 'Release a short film, documentary, or feature to your own audience.' },
                    { title: 'Festival selections', description: 'Share a curated film selection, director talk, or recorded premiere.' },
                    { title: 'Special editions', description: 'Publish album films, commentary cuts, backstage footage, or supporter extras.' },
                ],
            },
            roi: {
                eyebrow: 'Fee model in the rehearsal',
                title: 'Explore the test-ticket split.',
                description: 'This simulation uses the illustrative rehearsal split: 95% creator balance and 5% youtick fee, in test tokens that have no real value. It is not a promise of earnings, and the launch fee model is not final.',
                presets: [
                    { label: 'Short film', price: '6', sales: 250 },
                    { label: 'Concert recording', price: '12', sales: 800 },
                    { label: 'Festival selection', price: '18', sales: 1200 },
                    { label: 'Documentary', price: '10', sales: 600 },
                ],
                ticketPrice: 'Ticket price (test USDC)',
                invalidTicketPrice: 'Enter at least 2 test USDC with up to six decimal places.',
                estimatedSales: 'Simulated ticket count',
                totalSales: 'Simulated total (test tokens)',
                creatorShare: 'Simulated creator balance',
                platformFee: '5% illustrative rehearsal fee',
                creatorShareDescription: 'Test-token balance after the illustrative fee; not a payout.',
                estimateNote: 'Simulation only; test tokens have no real value. Earnings, tax and seller responsibilities for a launch are not established.',
                uploadFeeTitle: 'Upload in the rehearsal',
                uploadFeeDescription: 'In the rehearsal an invite credit covers the upload fee shown in the studio. Upload fees for a launch are not final.',
            },
            trust: {
                eyebrow: 'Why youtick',
                title: 'Release, tickets, and viewing in one place.',
                description: 'youtick keeps the audience experience simple while Livepeer handles video processing and streaming, and the NEAR testnet records publication, tickets and access during the rehearsal.',
                items: [
                    { title: 'One release flow', description: 'Create the screening, set the ticket price, and publish without piecing together separate tools.' },
                    { title: 'Your own screening page', description: 'Bring viewers to your own ticketed screening instead of another generic video page.' },
                    { title: 'Ticket-checked viewing', description: 'youtick confirms the signed-in account’s ticket before issuing short-lived playback access.' },
                    { title: 'Honest about the stage', description: 'What you see is a rehearsal on the testnet: test tickets have no real value and no launch terms are final.' },
                ],
                technologyLabel: 'Built with Livepeer and NEAR',
            },
            creators: {
                eyebrow: 'Creator invitations',
                title: 'Apply to release your work with youtick.',
                description: 'We are preparing a paid launch with a small group of invited film and music creators. Tell us about your work and we will reply by email.',
                points: [
                    'Concert recordings, independent films, festival selections and special editions.',
                    'Every application is read by a person; there is no automatic approval.',
                    'Applying does not open an account or commit you to anything.',
                ],
                action: 'Apply for an invite',
                note: 'Launch timing, fees and payment methods are confirmed with invited creators before any release.',
                heroLink: 'Creator? Apply for an invite',
            },
            cta: {
                eyebrow: 'Your next screening',
                title: 'Put your film, concert recording, or special release in front of its audience.',
                description: 'Join the rehearsal as an invited creator, or apply and tell us about your work. Nothing in the rehearsal is sold for real money.',
            },
            footer: {
                description: 'Ticketed digital screenings for independent film and music.',
                links: [
                    { label: 'Livepeer', href: 'https://livepeer.org' },
                    { label: 'NEAR', href: 'https://near.org' },
                ],
                privacy: 'Privacy',
                terms: 'Terms',
                support: 'Support',
            },
            ctas: {
                enabled: {
                    primary: 'Open a screening',
                    secondary: 'Discover screenings',
                },
                disabled: {
                    primary: 'See how it works',
                    secondary: 'Why youtick',
                    status: 'Publishing is open to invited creators only',
                },
            },
        },
        tr: {
            languageName: 'English',
            nav: {
                sections: [
                    { hash: 'audience', label: 'Üretici ve izleyiciler için' },
                    { hash: 'how-it-works', label: 'Nasıl başvurulur' },
                    { hash: 'use-cases', label: 'Film ve müzik' },
                ],
                switchLanguage: 'English',
                connect: 'Bağlan',
                disconnect: 'Bağlantıyı kes',
            },
            hero: {
                badge: 'Davetli prova dönemi',
                title: 'Bağımsız film ve müzik için biletli gösterimler.',
                subtitle: 'youtick, biletli dijital gösterim platformudur. Şu anda az sayıda davetli üreticiyle kapalı bir prova yürütüyoruz.',
                description: 'Prova herkese açık değildir ve ticari bir açılış değildir. Film ve müzik üreticileri davet için başvurabilir; her başvuruyu bir kişi okur ve e-postayla dönüş yaparız.',
                imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
            },
            audience: {
                eyebrow: 'Prova dönemi',
                title: 'Ekranın iki tarafı için de açık bir deneyim.',
                description: 'Davetli üreticiler ve izleyicileri yayın ve izleme akışını kapalı provada dener. Prova ticari bir açılış değildir.',
                creator: {
                    title: 'Üreticiler için',
                    description: 'Film, konser kaydı veya özel videonu kapalı provada yayınlamayı dene.',
                    benefits: [
                        'Google ya da passkey ile giriş yap.',
                        'Davetle video yükle, işleme tamamlanınca yayınla.',
                        'Gösterimin kendi sayfası olur; izleyicini oraya yönlendirirsin.',
                    ],
                },
                viewer: {
                    title: 'İzleyiciler için',
                    description: 'Seçtiğin esere kendi gösterim sayfasından ulaş.',
                    benefits: [
                        'İzlemeden önce üreticiyi ve eseri gör.',
                        'Google ya da passkey ile giriş yap.',
                        'Erişimin doğrulandıktan sonra izlemeye başla.',
                    ],
                },
            },
            howItWorks: {
                eyebrow: 'Nasıl başvurulur',
                title: 'Başvurudan provaya dört adım.',
                description: 'Prova davetlidir. Başvurular e-postayla yürür; otomatik onay yoktur.',
                steps: [
                    { title: 'Eserinden bahset', description: 'Başvuru formunda adını, ülkeni ve eserine bir bağlantıyı bırak. Form açık değilse e-postayla yazabilirsin.' },
                    { title: 'Bir kişi okur', description: 'Her başvuruyu bir kişi okur. Birkaç iş günü içinde e-postayla dönüş yaparız.' },
                    { title: 'Davet ve giriş', description: 'Davet alan üretici Google ya da passkey ile giriş yapar ve kaynak dosyasını yükler (prova sınırı: 5 GB).' },
                    { title: 'Gösterim ve izleme', description: 'Livepeer işlemeyi bitirdiğinde gösterim kendi sayfasına çıkar; izleyici erişimi doğrulandıktan sonra izler.' },
                ],
                imageAlt: 'Sahneyi izleyen kalabalık bir konser seyircisi',
                preview: {
                    label: 'Gösterim önizlemesi',
                    title: 'Bağımsız konser galası',
                    tag: 'Davetli prova',
                    details: [
                        { label: 'Video', value: 'Livepeer ile izleme' },
                        { label: 'Giriş', value: 'Google ya da passkey' },
                        { label: 'Erişim', value: 'İzleme öncesi doğrulama' },
                    ],
                },
            },
            useCases: {
                eyebrow: 'Film ve müzik yayınları',
                title: 'Sıradan bir video bağlantısından fazlasını hak eden işler için.',
                description: 'İzleyicinin beklediği eser için odaklı, biletli bir gösterim oluştur.',
                items: [
                    { title: 'Konser kayıtları', description: 'Tam konseri, akustik oturumu, prova veya turne kaydını sun.' },
                    { title: 'Bağımsız filmler', description: 'Kısa film, belgesel veya uzun metrajını kendi izleyicine ulaştır.' },
                    { title: 'Festival seçkileri', description: 'Film seçkisi, yönetmen söyleşisi veya kayıtlı gala paylaş.' },
                    { title: 'Özel sürümler', description: 'Albüm filmi, yorumlu kurgu, sahne arkası veya destekçi ekstraları yayınla.' },
                ],
            },
            roi: null,
            trust: {
                eyebrow: 'Neden youtick',
                title: 'Yayın, bilet ve izleme tek yerde.',
                description: 'youtick izleyici deneyimini sade tutar; Livepeer video işleme ve aktarımını yönetir.',
                items: [
                    { title: 'Tek yayın akışı', description: 'Gösterimi oluştur ve ayrı araçları birleştirmeden yayınla.' },
                    { title: 'Kendi gösterim sayfan', description: 'İzleyicini genel bir video sayfası yerine kendi biletli gösterimine getir.' },
                    { title: 'Bilet kontrollü izleme', description: 'youtick, kısa süreli izleme erişimi vermeden önce giriş yapan hesabın biletini doğrular.' },
                    { title: 'Dönem hakkında açık', description: 'Bugün gördüğün kapalı bir provadır; açılış koşulları henüz kesinleşmemiştir.' },
                ],
                technologyLabel: 'Livepeer ile geliştirildi',
            },
            creators: {
                eyebrow: 'Üretici davetleri',
                title: 'Eserini youtick ile yayınlamak için başvur.',
                description: 'Az sayıda davetli film ve müzik üreticisiyle biletli bir açılış hazırlıyoruz. Bize eserinden bahset; e-postayla dönüş yapacağız.',
                points: [
                    'Konser kayıtları, bağımsız filmler, festival seçkileri ve özel sürümler.',
                    'Her başvuruyu bir kişi okur; otomatik onay yoktur.',
                    'Başvuru hesap açmaz ve seni hiçbir şeye bağlamaz.',
                ],
                action: 'Davet için başvur',
                note: 'Açılış zamanı ve koşulları, herhangi bir yayından önce davetli üreticilerle netleştirilir.',
                heroLink: 'Üretici misin? Davet için başvur',
            },
            cta: {
                eyebrow: 'Sıradaki gösterimin',
                title: 'Filmini, konser kaydını veya özel yayınını izleyicisiyle buluştur.',
                description: 'Davetli üretici olarak provaya katıl ya da başvurup eserinden bahset.',
            },
            footer: {
                description: 'Bağımsız film ve müzik için biletli dijital gösterimler.',
                links: [
                    { label: 'Livepeer', href: 'https://livepeer.org' },
                ],
                privacy: 'Gizlilik',
                terms: 'Koşullar',
                support: 'Destek',
            },
            ctas: {
                enabled: {
                    primary: 'Gösterim aç',
                    secondary: 'Gösterimleri keşfet',
                },
                disabled: {
                    primary: 'Nasıl başvurulur',
                    secondary: 'Neden youtick',
                    status: 'Yayın şu anda yalnız davetli üreticilere açık',
                },
            },
        },
    } as const satisfies Record<LandingLocale, LandingCopy>,
    // Placeholders from the design-language plan §4.5. Not rendered in Prova.
    gala: {
        en: {
            hero: {
                badge: 'Open to everyone',
                title: 'Your stage is a link.',
                subtitle: 'Sell your video to the world with one link. Ticket, payment and playback on the same page; tax, collection and refunds are on us.',
                description: 'Viewers sign in with Google or a passkey and pay by card, Apple Pay, Google Pay or in USDC. No wallet app, no seed phrase, no gas fees.',
            },
            audience: {
                creator: {
                    benefits: [
                        'Sign in with Google or a passkey.',
                        'Upload and publish when processing is complete.',
                        'USDC sales reach you the moment they are played; card sales land in your bank account every month.',
                    ],
                },
            },
            cta: { title: 'Let’s open your first screening.' },
        },
        tr: {
            hero: {
                badge: 'Herkese açık',
                title: 'Sahnen bir link.',
                subtitle: 'Videonu bir linkle dünyaya sat. Bilet, ödeme ve izleme aynı sayfada; vergi, tahsilat ve iade bizde.',
                description: 'İzleyici Google ya da passkey ile girer; kartla, Apple Pay ya da Google Pay ile öder. İkinci şifre yok.',
            },
            audience: {
                creator: {
                    benefits: [
                        'Google ya da passkey ile giriş yap.',
                        'Yükle, işleme tamamlanınca yayınla.',
                        'Kartla satılan biletlerin payı her ay banka hesabına TL olarak yatar.',
                    ],
                },
            },
            cta: { title: 'İlk gösterimini birlikte açalım.' },
        },
    } as const satisfies Record<LandingLocale, LandingCopyOverride>,
    vizyon: {
        en: {
            hero: {
                badge: 'Open to everyone',
                title: 'When the curtain rises, the artist gets paid.',
                subtitle: 'Sell your video to the world with one link. Ticket, payment and playback on the same page; tax, collection and refunds are on us.',
            },
            trust: {
                items: [
                    { title: 'Your stage is a link.', description: 'Create the screening, set the ticket price, and publish without piecing together separate tools.' },
                    { title: 'To the last cent.', description: 'Every ticket is accounted for on the same page as the screening.' },
                    { title: 'Reach your fans without an algorithm.', description: 'Bring viewers to your own ticketed screening instead of another generic video page.' },
                    { title: 'Share the link, not the ticket.', description: 'youtick confirms the signed-in account’s ticket before issuing short-lived playback access.' },
                ],
            },
        },
        tr: {
            hero: {
                badge: 'Herkese açık',
                title: 'Perde açılınca bilet kopar.',
                subtitle: 'Videonu bir linkle dünyaya sat. Bilet, ödeme ve izleme aynı sayfada; vergi, tahsilat ve iade bizde.',
            },
            trust: {
                items: [
                    { title: 'Sahnen bir link.', description: 'Gösterimi oluştur ve ayrı araçları birleştirmeden yayınla.' },
                    { title: 'Kuruşu kuruşuna.', description: 'Her bilet gösterimle aynı sayfada hesaplanır.' },
                    { title: 'Hayranına algoritmasız ulaş.', description: 'İzleyicini genel bir video sayfası yerine kendi biletli gösterimine getir.' },
                    { title: 'Link paylaşılır, bilet paylaşılmaz.', description: 'youtick, kısa süreli izleme erişimi vermeden önce giriş yapan hesabın biletini doğrular.' },
                ],
            },
        },
    } as const satisfies Record<LandingLocale, LandingCopyOverride>,
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

/** The Prova (shared) layer. Stage-aware callers use `getLandingCopy` with `LAUNCH_STAGE`. */
export const landingCopy: Record<LandingLocale, LandingCopy> = landingCopyLayers.shared;

/** The creator application page for each landing locale. */
export function creatorApplyHref(locale: LandingLocale): string {
    return locale === 'tr' ? '/tr/apply' : '/apply';
}

export type LandingCtas = {
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
    status?: string;
};

export function getLandingCtas(locale: LandingLocale, enabled: boolean, stage: LaunchStage = 'prova'): LandingCtas {
    const copy = getLandingCopy(locale, stage).ctas;
    return enabled
        ? {
            primary: { label: copy.enabled.primary, href: '/upload' },
            secondary: { label: copy.enabled.secondary, href: '/discover' },
        }
        : {
            primary: { label: copy.disabled.primary, href: '#how-it-works' },
            secondary: { label: copy.disabled.secondary, href: '#trust' },
            status: copy.disabled.status,
        };
}
