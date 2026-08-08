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

export type LandingCopy = {
    languageName: string;
    nav: {
        audience: string;
        howItWorks: string;
        calculator: string;
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
        previewLabel: string;
        previewTitle: string;
        previewPrice: string;
        previewDetails: readonly { label: string; value: string }[];
    };
    useCases: Intro & { items: readonly CardCopy[] };
    roi: Intro & {
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
    trust: Intro & {
        items: readonly CardCopy[];
        technologyLabel: string;
    };
    cta: Intro;
    footer: {
        description: string;
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

export const landingCopy = {
    en: {
        languageName: 'Türkçe',
        nav: {
            audience: 'For creators and viewers',
            howItWorks: 'How it works',
            calculator: 'Fee model',
            switchLanguage: 'Türkçe',
            connect: 'Connect',
            disconnect: 'Disconnect',
        },
        hero: {
            badge: 'Ticketed digital screenings for film and music',
            title: 'Sell your film or concert recording with a ticket.',
            subtitle: 'Upload the work, set the ticket price, and sell directly to your audience.',
            description: 'YouTick brings the screening page, digital ticket, and ticket-gated viewing into one simple flow.',
            imageAlt: 'A concert stage facing a live audience',
        },
        audience: {
            eyebrow: 'Direct ticketed sales',
            title: 'A clear experience for both sides of the screen.',
            description: 'Creators control the release and price. Viewers know what their ticket opens before they pay.',
            creator: {
                title: 'For creators',
                description: 'Publish a film, concert recording, or special video as a paid screening.',
                benefits: [
                    'Upload video content and publish when processing is complete.',
                    'Set the ticket price.',
                    'Keep 98% of each paid ticket sale.',
                ],
            },
            viewer: {
                title: 'For viewers',
                description: 'Buy access to the exact work you want to watch and support its creator directly.',
                benefits: [
                    'See the creator and ticket price before buying.',
                    'Pay with USDC from a connected NEAR wallet.',
                    'Start playback after ticket access is confirmed.',
                ],
            },
        },
        howItWorks: {
            eyebrow: 'One simple flow',
            title: 'From upload to playback in four steps.',
            description: 'YouTick handles the release and ticket flow while Livepeer prepares the video for reliable playback.',
            steps: [
                { title: 'Prepare the screening', description: 'Name the work, set its USDC ticket price, and confirm that you own the rights required to publish it.' },
                { title: 'Approve once and upload', description: 'Approve the creator fee once with your wallet, then send a supported video file of up to 20 GB.' },
                { title: 'Publish after processing', description: 'When Livepeer finishes processing, the screening is recorded on NEAR and can be listed.' },
                { title: 'Sell tickets and play', description: 'A viewer buys a USDC ticket, YouTick confirms access, and Livepeer playback adapts to the viewer’s connection.' },
            ],
            imageAlt: 'A full concert audience watching a stage',
            previewLabel: 'Screening preview',
            previewTitle: 'Independent concert premiere',
            previewPrice: '12 USDC',
            previewDetails: [
                { label: 'Video', value: 'Livepeer playback' },
                { label: 'Ticket split', value: '98% / 2%' },
                { label: 'Access', value: 'Confirmed before play' },
            ],
        },
        useCases: {
            eyebrow: 'Film and music releases',
            title: 'For work that deserves more than another video link.',
            description: 'Create a focused paid screening for the release your audience is waiting for.',
            items: [
                { title: 'Concert recordings', description: 'Offer a full show, acoustic session, rehearsal, or tour recording.' },
                { title: 'Independent films', description: 'Release a short film, documentary, or feature to your own audience.' },
                { title: 'Festival selections', description: 'Share a curated film selection, director talk, or recorded premiere.' },
                { title: 'Special editions', description: 'Publish album films, commentary cuts, backstage footage, or supporter extras.' },
            ],
        },
        roi: {
            eyebrow: 'Fee model',
            title: 'See the paid-ticket split before you publish.',
            description: 'YouTick records 98% as creator share and 2% as platform fee for each paid ticket.',
            presets: [
                { label: 'Short film', price: '6', sales: 250 },
                { label: 'Concert recording', price: '12', sales: 800 },
                { label: 'Festival selection', price: '18', sales: 1200 },
                { label: 'Documentary', price: '10', sales: 600 },
            ],
            ticketPrice: 'Ticket price',
            invalidTicketPrice: 'Enter a ticket price of at least 2 USDC with up to six decimal places.',
            estimatedSales: 'Estimated sales',
            totalSales: 'Total ticket sales',
            creatorShare: 'Estimated creator share',
            platformFee: '2% platform fee',
            creatorShareDescription: 'The creator share after the platform fee.',
            estimateNote: 'Estimate only. Taxes, refunds, wallet fees, and publishing costs are not included.',
            uploadFeeTitle: 'YouTick upload fee',
            uploadFeeDescription: 'A one-time fee is calculated from the source file size and shown before payment.',
        },
        trust: {
            eyebrow: 'Why YouTick',
            title: 'Release, tickets, and viewing in one place.',
            description: 'YouTick keeps the audience experience simple while Livepeer handles video processing and streaming, and NEAR records publication, payment, and access.',
            items: [
                { title: 'One release flow', description: 'Create the screening, set the ticket price, and publish without piecing together separate tools.' },
                { title: 'Direct audience sales', description: 'Bring viewers to your own ticketed screening instead of another generic video page.' },
                { title: 'Ticket-checked viewing', description: 'YouTick confirms the connected account’s ticket before issuing short-lived playback access.' },
                { title: 'Clear revenue model', description: 'See the USDC price and the 98% / 2% ticket split before publishing.' },
            ],
            technologyLabel: 'Built with Livepeer, NEAR, and USDC',
        },
        cta: {
            eyebrow: 'Your next screening',
            title: 'Put your film, concert recording, or special release in front of its audience.',
            description: 'Upload the work, choose the ticket price, and bring release, payment, and playback together.',
        },
        footer: {
            description: 'Ticketed digital screenings for independent film and music.',
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
                secondary: 'Why YouTick',
                status: 'Publishing opens soon',
            },
        },
    },
    tr: {
        languageName: 'English',
        nav: {
            audience: 'Üretici ve izleyiciler için',
            howItWorks: 'Nasıl çalışır',
            calculator: 'Ücret modeli',
            switchLanguage: 'English',
            connect: 'Bağlan',
            disconnect: 'Bağlantıyı kes',
        },
        hero: {
            badge: 'Film ve müzik için biletli dijital gösterim',
            title: 'Filmini veya konser kaydını biletle satışa sun.',
            subtitle: 'Eseri yükle, bilet fiyatını belirle ve kendi izleyicine doğrudan sat.',
            description: 'YouTick; gösterim sayfasını, dijital bileti ve biletle açılan izlemeyi tek sade akışta toplar.',
            imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
        },
        audience: {
            eyebrow: 'Doğrudan biletli satış',
            title: 'Ekranın iki tarafı için de açık bir deneyim.',
            description: 'Üretici yayını ve fiyatı yönetir. İzleyici, ödeme yapmadan önce biletin neyi açtığını bilir.',
            creator: {
                title: 'Üreticiler için',
                description: 'Film, konser kaydı veya özel videonu ücretli gösterim olarak yayınla.',
                benefits: [
                    'Video içeriği yükle, işleme tamamlanınca yayınla.',
                    'Bilet fiyatını belirle.',
                    'Her ücretli bilet satışının %98’ini al.',
                ],
            },
            viewer: {
                title: 'İzleyiciler için',
                description: 'İzlemek istediğin esere erişim al ve üreticisini doğrudan destekle.',
                benefits: [
                    'Satın almadan önce üreticiyi ve bilet fiyatını gör.',
                    'Bağlı NEAR cüzdanından USDC ile öde.',
                    'Bilet erişimi doğrulandıktan sonra izlemeye başla.',
                ],
            },
        },
        howItWorks: {
            eyebrow: 'Tek sade akış',
            title: 'Yüklemeden izlemeye dört adım.',
            description: 'YouTick yayın ve bilet akışını yönetirken Livepeer videoyu güvenilir izleme için hazırlar.',
            steps: [
                { title: 'Gösterimi hazırla', description: 'Esere ad ver, USDC bilet fiyatını belirle ve yayınlamak için gereken haklara sahip olduğunu onayla.' },
                { title: 'Bir kez onayla ve yükle', description: 'Üretici ücretini cüzdanınla bir kez onayla, ardından 20 GB’a kadar desteklenen bir video dosyası gönder.' },
                { title: 'İşleme sonrası yayınla', description: 'Livepeer işlemeyi bitirdiğinde gösterim NEAR üzerinde kaydedilir ve listelenebilir.' },
                { title: 'Bilet sat ve izlet', description: 'İzleyici USDC ile bilet alır, YouTick erişimi doğrular ve Livepeer izleme kalitesini bağlantıya uyarlar.' },
            ],
            imageAlt: 'Sahneyi izleyen kalabalık bir konser seyircisi',
            previewLabel: 'Gösterim önizlemesi',
            previewTitle: 'Bağımsız konser galası',
            previewPrice: '12 USDC',
            previewDetails: [
                { label: 'Video', value: 'Livepeer ile izleme' },
                { label: 'Bilet payı', value: '%98 / %2' },
                { label: 'Erişim', value: 'İzleme öncesi doğrulama' },
            ],
        },
        useCases: {
            eyebrow: 'Film ve müzik yayınları',
            title: 'Sıradan bir video bağlantısından fazlasını hak eden işler için.',
            description: 'İzleyicinin beklediği eser için odaklı, ücretli bir gösterim oluştur.',
            items: [
                { title: 'Konser kayıtları', description: 'Tam konseri, akustik oturumu, prova veya turne kaydını sun.' },
                { title: 'Bağımsız filmler', description: 'Kısa film, belgesel veya uzun metrajını kendi izleyicine ulaştır.' },
                { title: 'Festival seçkileri', description: 'Film seçkisi, yönetmen söyleşisi veya kayıtlı gala paylaş.' },
                { title: 'Özel sürümler', description: 'Albüm filmi, yorumlu kurgu, sahne arkası veya destekçi ekstraları yayınla.' },
            ],
        },
        roi: {
            eyebrow: 'Ücret modeli',
            title: 'Yayınlamadan önce ücretli bilet paylaşımını gör.',
            description: 'YouTick her ücretli bilette %98’i üretici payı, %2’yi platform ücreti olarak kaydeder.',
            presets: [
                { label: 'Kısa film', price: '6', sales: 250 },
                { label: 'Konser kaydı', price: '12', sales: 800 },
                { label: 'Festival seçkisi', price: '18', sales: 1200 },
                { label: 'Belgesel', price: '10', sales: 600 },
            ],
            ticketPrice: 'Bilet fiyatı',
            invalidTicketPrice: 'En az 2 USDC olan ve en fazla altı ondalık basamak içeren bir fiyat gir.',
            estimatedSales: 'Tahmini satış',
            totalSales: 'Toplam bilet satışı',
            creatorShare: 'Tahmini üretici payı',
            platformFee: '%2 platform ücreti',
            creatorShareDescription: 'Platform ücreti sonrasında üreticiye kalan pay.',
            estimateNote: 'Yalnızca tahmindir. Vergiler, iadeler, cüzdan ücretleri ve yayın maliyetleri dahil değildir.',
            uploadFeeTitle: 'YouTick yükleme ücreti',
            uploadFeeDescription: 'Kaynak dosya boyutuna göre tek seferlik bir ücret hesaplanır ve ödeme öncesi gösterilir.',
        },
        trust: {
            eyebrow: 'Neden YouTick',
            title: 'Yayın, bilet ve izleme tek yerde.',
            description: 'YouTick izleyici deneyimini sade tutar; Livepeer video işleme ve aktarımını yönetirken NEAR yayın, ödeme ve erişimi kaydeder.',
            items: [
                { title: 'Tek yayın akışı', description: 'Gösterimi oluştur, bilet fiyatını belirle ve ayrı araçları birleştirmeden yayınla.' },
                { title: 'Doğrudan izleyiciye satış', description: 'İzleyicini genel bir video sayfası yerine kendi biletli gösterimine getir.' },
                { title: 'Bilet kontrollü izleme', description: 'YouTick, kısa süreli izleme erişimi vermeden önce bağlı hesabın biletini doğrular.' },
                { title: 'Açık gelir modeli', description: 'Yayınlamadan önce USDC fiyatını ve %98 / %2 bilet paylaşımını gör.' },
            ],
            technologyLabel: 'Livepeer, NEAR ve USDC ile geliştirildi',
        },
        cta: {
            eyebrow: 'Sıradaki gösterimin',
            title: 'Filmini, konser kaydını veya özel yayınını izleyicisiyle buluştur.',
            description: 'Eseri yükle, bilet fiyatını seç; yayını, ödemeyi ve izlemeyi bir araya getir.',
        },
        footer: {
            description: 'Bağımsız film ve müzik için biletli dijital gösterimler.',
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
                primary: 'Nasıl çalıştığını gör',
                secondary: 'Neden YouTick',
                status: 'Yayın yakında açılacak',
            },
        },
    },
} as const satisfies Record<LandingLocale, LandingCopy>;

export type LandingCtas = {
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
    status?: string;
};

export function getLandingCtas(locale: LandingLocale, enabled: boolean): LandingCtas {
    const copy = landingCopy[locale].ctas;
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
