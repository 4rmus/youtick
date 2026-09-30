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
            badge: 'V1 controlled testnet pilot',
            title: 'Try ticketed screenings with your NEAR wallet.',
            subtitle: 'Test publishing and ticket access with test tokens that have no real value.',
            description: 'Connect a NEAR wallet to try publishing, test-USDC tickets and viewing. Google / passkey sign-in, card payments and bank payouts are planned for a later phase; they are not available in V1.',
            imageAlt: 'A concert stage facing a live audience',
        },
        audience: {
            eyebrow: 'Testnet screenings',
            title: 'A clear experience for both sides of the screen.',
            description: 'Creators and viewers test the release and access flow. This pilot is not a real-money commercial launch.',
            creator: {
                title: 'For creators',
                description: 'Try publishing a film, concert recording or special video in the controlled pilot.',
                benefits: [
                    'Upload video content and publish when processing is complete.',
                    'Set the ticket price.',
                    'The illustrative pilot split records 95% in the creator balance; withdrawals go to your own NEAR wallet, not a bank.',
                ],
            },
            viewer: {
                title: 'For viewers',
                description: 'Try access to a specific work using test tokens.',
                benefits: [
                    'See the creator and ticket price before buying.',
                    'Use test USDC from your NEAR testnet wallet; test NEAR covers network fees.',
                    'Start playback after ticket access is confirmed.',
                ],
            },
        },
        howItWorks: {
            eyebrow: 'One simple flow',
            title: 'From upload to playback in four steps.',
            description: 'YouTick handles the release and ticket flow while Livepeer prepares the video for reliable playback.',
            steps: [
                { title: 'Prepare the screening', description: 'Name the work, set a ticket price of at least 2 test USDC, and confirm your publishing rights.' },
                { title: 'Check fees and upload', description: 'Review the separate upload fee and any sponsor fee before wallet approval. Pilot source-file limit: 5 GB.' },
                { title: 'Publish after processing', description: 'When Livepeer finishes processing, the screening is recorded on NEAR and can be listed.' },
                { title: 'Test tickets and playback', description: 'A viewer uses test USDC for a ticket. Access is confirmed before playback; continued availability is not guaranteed.' },
            ],
            imageAlt: 'A full concert audience watching a stage',
            previewLabel: 'Screening preview',
            previewTitle: 'Independent concert premiere',
            previewPrice: '12 test USDC',
            previewDetails: [
                { label: 'Video', value: 'Livepeer playback' },
                { label: 'Illustrative pilot split', value: '95% / 5%' },
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
            title: 'Explore the test-token ticket split.',
            description: 'This simulation uses the illustrative pilot split: 95% creator balance and 5% YouTick fee. It is not a promise of earnings.',
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
            platformFee: '5% illustrative pilot fee',
            creatorShareDescription: 'Test-token balance after the illustrative pilot fee; not a bank payout.',
            estimateNote: 'Simulation only; test tokens have no real value. Actual earnings, tax, seller and refund responsibilities are not established. Upload, sponsor and network fees are separate.',
            uploadFeeTitle: 'YouTick upload fee',
            uploadFeeDescription: 'The separate upload quote depends on source size. Any sponsor fee is shown before approval; network fees may also apply.',
        },
        trust: {
            eyebrow: 'Why YouTick',
            title: 'Release, tickets, and viewing in one place.',
            description: 'YouTick keeps the audience experience simple while Livepeer handles video processing and streaming, and NEAR records publication, payment, and access.',
            items: [
                { title: 'One release flow', description: 'Create the screening, set the ticket price, and publish without piecing together separate tools.' },
                { title: 'Direct audience sales', description: 'Bring viewers to your own ticketed screening instead of another generic video page.' },
                { title: 'Ticket-checked viewing', description: 'YouTick confirms the connected account’s ticket before issuing short-lived playback access.' },
                { title: 'Visible test fee model', description: 'See the test-USDC price and illustrative pilot split; no earnings or bank payout promise.' },
            ],
            technologyLabel: 'Built with Livepeer, NEAR, and USDC',
        },
        cta: {
            eyebrow: 'Your next screening',
            title: 'Put your film, concert recording, or special release in front of its audience.',
            description: 'Try the controlled wallet pilot. Real-money launch, social sign-in and card payments are separate future phases.',
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
                status: 'Pilot publishing is currently closed',
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
            badge: 'V1 kontrollü testnet pilotu',
            title: 'NEAR cüzdanınla biletli gösterimi dene.',
            subtitle: 'Gerçek değeri olmayan test tokenlarıyla yayın ve bilet erişimini dene.',
            description: 'NEAR cüzdanınla yayın, test USDC bileti ve izlemeyi dene. Google / passkey girişi, kartla ödeme ve banka ödemesi sonraki faz için planlanıyor; V1’de sunulmuyor.',
            imageAlt: 'Canlı izleyiciye bakan bir konser sahnesi',
        },
        audience: {
            eyebrow: 'Testnet gösterimleri',
            title: 'Ekranın iki tarafı için de açık bir deneyim.',
            description: 'Üretici ve izleyici yayın ve erişim akışını dener. Bu pilot gerçek para ile ticari açılış değildir.',
            creator: {
                title: 'Üreticiler için',
                description: 'Film, konser kaydı veya özel videonu kontrollü pilotta yayınlamayı dene.',
                benefits: [
                    'Video içeriği yükle, işleme tamamlanınca yayınla.',
                    'Bilet fiyatını belirle.',
                    'Örnek pilot paylaşımında %95 üretici bakiyesine kaydedilir; çekim kendi NEAR cüzdanına yapılır, bankaya değil.',
                ],
            },
            viewer: {
                title: 'İzleyiciler için',
                description: 'Seçtiğin esere erişimi test tokenlarıyla dene.',
                benefits: [
                    'Satın almadan önce üreticiyi ve bilet fiyatını gör.',
                    'NEAR testnet cüzdanından test USDC kullan; ağ ücreti için test NEAR gerekebilir.',
                    'Bilet erişimi doğrulandıktan sonra izlemeye başla.',
                ],
            },
        },
        howItWorks: {
            eyebrow: 'Tek sade akış',
            title: 'Yüklemeden izlemeye dört adım.',
            description: 'YouTick yayın ve bilet akışını yönetirken Livepeer videoyu güvenilir izleme için hazırlar.',
            steps: [
                { title: 'Gösterimi hazırla', description: 'Esere ad ver, en az 2 test USDC bilet fiyatı seç ve yayın için gereken haklarını onayla.' },
                { title: 'Ücreti kontrol et ve yükle', description: 'Cüzdan onayından önce ayrı yükleme ücretini ve varsa sponsor ücretini kontrol et. Pilot kaynak dosya sınırı: 5 GB.' },
                { title: 'İşleme sonrası yayınla', description: 'Livepeer işlemeyi bitirdiğinde gösterim NEAR üzerinde kaydedilir ve listelenebilir.' },
                { title: 'Bileti ve izlemeyi dene', description: 'İzleyici test USDC ile bilet alır. İzleme öncesi erişim doğrulanır; sürekli erişilebilirlik garantisi verilmez.' },
            ],
            imageAlt: 'Sahneyi izleyen kalabalık bir konser seyircisi',
            previewLabel: 'Gösterim önizlemesi',
            previewTitle: 'Bağımsız konser galası',
            previewPrice: '12 test USDC',
            previewDetails: [
                { label: 'Video', value: 'Livepeer ile izleme' },
                { label: 'Örnek pilot paylaşımı', value: '%95 / %5' },
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
            title: 'Test tokenlarıyla bilet paylaşımını hesapla.',
            description: 'Bu simülasyon örnek pilot paylaşımını kullanır: %95 üretici bakiyesi, %5 YouTick ücreti. Kazanç vaadi değildir.',
            presets: [
                { label: 'Kısa film', price: '6', sales: 250 },
                { label: 'Konser kaydı', price: '12', sales: 800 },
                { label: 'Festival seçkisi', price: '18', sales: 1200 },
                { label: 'Belgesel', price: '10', sales: 600 },
            ],
            ticketPrice: 'Bilet fiyatı (test USDC)',
            invalidTicketPrice: 'En az 2 test USDC ve en fazla altı ondalık basamak içeren bir fiyat gir.',
            estimatedSales: 'Simüle edilen bilet sayısı',
            totalSales: 'Simüle toplam (test tokenı)',
            creatorShare: 'Simüle üretici bakiyesi',
            platformFee: '%5 örnek pilot ücreti',
            creatorShareDescription: 'Örnek pilot ücretinden sonraki test tokenı bakiyesi; banka ödemesi değildir.',
            estimateNote: 'Yalnızca simülasyondur; test tokenlarının gerçek değeri yoktur. Kazanç, vergi, satıcı ve iade sorumlulukları kesinleşmemiştir. Yükleme, sponsor ve ağ ücretleri ayrıdır.',
            uploadFeeTitle: 'YouTick yükleme ücreti',
            uploadFeeDescription: 'Ayrı yükleme teklifi dosya boyutuna bağlıdır. Varsa sponsor ücreti onaydan önce gösterilir; ağ ücreti de uygulanabilir.',
        },
        trust: {
            eyebrow: 'Neden YouTick',
            title: 'Yayın, bilet ve izleme tek yerde.',
            description: 'YouTick izleyici deneyimini sade tutar; Livepeer video işleme ve aktarımını yönetirken NEAR yayın, ödeme ve erişimi kaydeder.',
            items: [
                { title: 'Tek yayın akışı', description: 'Gösterimi oluştur, bilet fiyatını belirle ve ayrı araçları birleştirmeden yayınla.' },
                { title: 'Doğrudan izleyiciye satış', description: 'İzleyicini genel bir video sayfası yerine kendi biletli gösterimine getir.' },
                { title: 'Bilet kontrollü izleme', description: 'YouTick, kısa süreli izleme erişimi vermeden önce bağlı hesabın biletini doğrular.' },
                { title: 'Görünen test ücret modeli', description: 'Test USDC fiyatını ve örnek pilot paylaşımını gör; kazanç veya banka ödemesi vaadi yoktur.' },
            ],
            technologyLabel: 'Livepeer, NEAR ve USDC ile geliştirildi',
        },
        cta: {
            eyebrow: 'Sıradaki gösterimin',
            title: 'Filmini, konser kaydını veya özel yayınını izleyicisiyle buluştur.',
            description: 'Kontrollü cüzdan pilotunu dene. Gerçek para açılışı, sosyal giriş ve kartla ödeme sonraki ayrı fazlardır.',
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
                status: 'Pilot yayını şu anda kapalı',
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
