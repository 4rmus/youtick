import type { LandingLocale } from '@/components/landing/landing-copy';

export type FaqLocale = LandingLocale;

export type FaqEntry = {
    id: string;
    question: string;
    /** One paragraph per string. */
    answers: readonly string[];
    /** An optional link under the answer. */
    link?: { href: string; label: string };
};

export type RevenueExampleCopy = {
    title: string;
    price: string;
    vat: string;
    card: string;
    youtick: string;
    artist: string;
    note: string;
};

export type FaqCopy = {
    title: string;
    intro: string;
    entries: readonly FaqEntry[];
    /** The worked revenue example, rendered under the entry `artist-share`; `null` on the Turkish page (no figures before counsel, K6). */
    revenue: RevenueExampleCopy | null;
    back: string;
};

export const FAQ_CONTACT = 'contact@youtick.net';

/**
 * The FAQ takes what the landing no longer says (short-copy rewrite, 2026-10-20): the programme, the
 * ticket and its limits, cancelling and refunds, what happens at playback, the artist share and the
 * application. The English page is the full version. The Turkish page is the interim version: no
 * payment, price, refund, card or chain wording until the Turkish counsel opinion (K6, X4), so it has
 * no refund, payment or artist-share entry and names no card or chain.
 */
export const faqCopy: Record<FaqLocale, FaqCopy> = {
    en: {
        title: 'FAQ',
        intro: 'Short answers on tickets, playback and artist applications. The terms and the refund policy are the full rules.',
        entries: [
            {
                id: 'programme',
                question: 'What can I watch?',
                answers: [
                    'Concert recordings, independent films, documentaries, festival selections and special editions. Each work has its own screening page, reached through the link the artist shares. The opening programme will be listed on the home page.',
                ],
            },
            {
                id: 'buying',
                question: 'How do I buy a ticket?',
                answers: [
                    'Open the screening page, sign in, and pay by credit or debit card. You see the ticket price before you pay; it includes VAT where it applies. Then press play.',
                ],
            },
            {
                id: 'ticket',
                question: 'What does a ticket let me do?',
                answers: [
                    'Watch the work as often as you like for as long as it is on youtick. The ticket does not expire. One ticket works on up to three devices at a time; your tickets stay with your account and appear on any device you sign in on.',
                    'The ticket is for you alone. It cannot be resold, lent or transferred, and it gives no right to copy, download or show the work in public.',
                ],
                link: { href: '/terms', label: 'Terms' },
            },
            {
                id: 'refunds',
                question: 'Can I cancel or get a refund?',
                answers: [
                    'Until you start playback, you can cancel within 14 days of purchase. After playback starts, refunds cover technical problems, such as a video that does not play. There is no refund for a change of mind; your statutory rights are not affected.',
                    'If a work is taken down, tickets that were never played are refunded. Refunds go back to the card you paid with. Write to contact@youtick.net with your ticket code.',
                ],
                link: { href: '/refund-policy', label: 'Refund policy' },
            },
            {
                id: 'playback',
                question: 'What happens when I press play?',
                answers: [
                    'youtick checks that the signed-in account holds a ticket, then gives short-lived access to the video. Livepeer processes, stores and delivers the video to your screen.',
                    'Screenings and tickets are recorded on the NEAR blockchain, so a ticket’s status can be checked. The record holds no name or email, and it does not make the ticket something you can trade.',
                    'A short ticket code is shown on screen while the video plays. Screen recording cannot be blocked.',
                ],
            },
            {
                id: 'artist-share',
                question: 'How much does an artist receive?',
                answers: [
                    'You set the ticket price for each work. From each ticket, VAT, the card payment cost and a 5% youtick fee on the price before VAT are deducted. The rest is your share, paid out monthly. The rates for your work are confirmed with you in writing before it goes on sale.',
                ],
            },
            {
                id: 'rights',
                question: 'Who holds the rights to a work?',
                answers: [
                    'The artist. You grant YOUTICK LTD a licence to make your work available to ticket holders; the terms describe the licence. We sell the tickets, take card payments through our card payment provider and answer refund requests.',
                ],
                link: { href: '/terms', label: 'Terms' },
            },
            {
                id: 'applying',
                question: 'How do I apply as an artist?',
                answers: [
                    'The form asks for your name, country and a link to your work: a channel, portfolio, trailer or press page. A person reads every application and replies by email within a few working days.',
                    'If we decide to work together, we open your account for uploads; you upload the work, set the price and share your screening page. Applying does not open an account or commit you to anything.',
                ],
                link: { href: '/apply', label: 'Apply as an artist' },
            },
            {
                id: 'contact',
                question: 'How do I reach you?',
                answers: [
                    'Write to contact@youtick.net. To report a work, use the report page.',
                ],
                link: { href: '/report', label: 'Report content' },
            },
        ],
        revenue: {
            title: 'Example: one ticket',
            price: 'Ticket price, VAT included',
            vat: 'VAT (25%)',
            card: 'Card payment cost (4% + $0.40)',
            youtick: 'youtick fee (5% of the price before VAT)',
            artist: 'Your share',
            note: 'Approximate costs, for illustration. VAT depends on the viewer’s country and the card cost on the card used.',
        },
        back: 'Back home',
    },
    tr: {
        title: 'Sık sorulan sorular',
        intro: 'Bilet, izleme ve sanatçı başvurusu hakkında kısa yanıtlar.',
        entries: [
            {
                id: 'programme',
                question: 'Neler izleyebilirim?',
                answers: [
                    'Konser kayıtları, bağımsız filmler, belgeseller, festival seçkileri ve özel sürümler. Her eserin kendi gösterim sayfası var; ona sanatçının paylaştığı bağlantıyla ulaşırsın. Açılış programı ana sayfada duyurulacak.',
                ],
            },
            {
                id: 'watching',
                question: 'Nasıl izlerim?',
                answers: [
                    'Gösterim sayfasını aç ve giriş yap. youtick hesabındaki bileti doğrular; sonra Oynat’a basarsın.',
                ],
            },
            {
                id: 'ticket',
                question: 'Biletimle neler yapabilirim?',
                answers: [
                    'Eser youtick’te kaldıkça istediğin kadar izlersin; biletin süresi dolmaz. Bir bilet aynı anda en fazla üç cihazda kullanılabilir; biletlerin hesabında durur ve giriş yaptığın her cihazda görünür.',
                    'Bilet yalnız senindir. Başkasına devredilemez; eseri kopyalama, indirme ya da herkese açık gösterme hakkı vermez.',
                ],
            },
            {
                id: 'playback',
                question: 'Oynat’a bastığımda ne olur?',
                answers: [
                    'youtick, giriş yapan hesabın biletini doğrular ve videoya kısa süreli erişim verir. Videoyu Livepeer işler, saklar ve ekranına ulaştırır.',
                    'Her bilet kayıt altındadır; böylece durumu doğrulanabilir. Kayıtta ad ya da e-posta yer almaz.',
                    'Video oynarken ekranda kısa bir bilet kodu görünür. Ekran kaydı engellenemez.',
                ],
            },
            {
                id: 'rights',
                question: 'Eserimin hakları kimde kalır?',
                answers: [
                    'Sende. Eserini bilet sahiplerine sunması için YOUTICK LTD şirketine lisans verirsin.',
                ],
            },
            {
                id: 'applying',
                question: 'Sanatçı olarak nasıl başvururum?',
                answers: [
                    'Formda adını, ülkeni ve eserine bir bağlantı isteriz: kanal, portfolyo, fragman ya da basın sayfası. Her başvuruyu bir kişi okur; birkaç iş günü içinde e-postayla dönüş yaparız.',
                    'Birlikte çalışmaya karar verirsek hesabını yüklemeye açarız; eserini yükler ve gösterim sayfanı paylaşırsın. Başvuru hesap açmaz ve seni hiçbir şeye bağlamaz.',
                ],
                link: { href: '/tr/apply', label: 'Sanatçı olarak başvur' },
            },
            {
                id: 'contact',
                question: 'Size nasıl ulaşırım?',
                answers: [
                    'contact@youtick.net adresine yaz. Bir eserle ilgili bildirim için “İçerik bildir” sayfasını kullan.',
                ],
                link: { href: '/report', label: 'İçerik bildir' },
            },
        ],
        revenue: null,
        back: 'Ana sayfaya dön',
    },
};
