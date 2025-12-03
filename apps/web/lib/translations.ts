export type Language = 'en' | 'tr';

export const translations = {
    en: {
        nav: {
            connect: "Connect Wallet",
            disconnect: "Sign Out",
        },
        hero: {
            title: "youtick",
            subtitle: "The Future of Premium Video Content",
            tagline: "NFT-GATED DECENTRALIZED VIDEO STREAMING PLATFORM",
            cta_watch: "Start Watching",
            cta_upload: "Upload Video",
            stats: {
                market: "Global Market",
                cost: "Cost Reduction",
                revenue: "Creator Revenue",
            }
        },
        features: {
            title: "The youtick Solution",
            subtitle: "Transforming premium video distribution through Web3-native architecture.",
            items: [
                { title: "NFT Tickets", desc: "Verifiable ownership, transferable access, and secondary market enabled. Fans own their access." },
                { title: "Encrypted Storage", desc: "Content is protected with threshold encryption. Only NFT holders can decrypt and view." },
                { title: "Decentralized CDN", desc: "Global delivery via Livepeer network ensures no single point of failure and high performance." },
                { title: "Creator Control", desc: "Set prices, royalties, and access rules directly on-chain. You own the platform." },
                { title: "Perpetual Storage", desc: "Content stored on Filecoin with cryptographic proofs of preservation. Never lost." },
                { title: "97.5% Revenue", desc: "Keep almost everything you earn. We only take a minimal 2.5% protocol fee." },
            ]
        },
        useCases: {
            title: "Use Cases",
            subtitle: "Empowering creators across every industry.",
            items: [
                { title: "Concert Recordings", desc: "Artists release exclusive concert recordings as limited-edition NFT tickets." },
                { title: "Independent Cinema", desc: "Filmmakers distribute movies directly to audiences without studio intermediaries." },
                { title: "Live Events", desc: "Virtual premieres, live-streamed events, and exclusive Q&A sessions." },
                { title: "Education", desc: "Course creators monetize premium video courses with verifiable certificates." },
                { title: "Sports", desc: "Teams offer exclusive behind-the-scenes content and match replays." },
                { title: "Podcasts", desc: "Premium podcast episodes and exclusive interviews with limited-edition access." },
            ]
        },
        techStack: {
            title: "Powered by Web3 Giants",
        },
        upload: {
            title: "Ready to Launch?",
            subtitle: "Upload your first video to the decentralized network today.",
        },
        roadmap: {
            title: "Roadmap",
            subtitle: "Our journey to revolutionizing video streaming.",
            phases: [
                { year: "2026 Q1", title: "Phase 1: MVP", desc: "NEAR wallet authentication, Video upload with Lighthouse encryption, NFT minting, Token-gated streaming via Livepeer, Basic creator dashboard." },
                { year: "2026 Q2", title: "Phase 2: Growth", desc: "Secondary marketplace integration, Royalty distribution system, Analytics dashboard for creators, Multi-language support." },
                { year: "2026 Q3", title: "Phase 3: Scale", desc: "Live streaming support, Cross-chain payment support (ETH, BTC via bridges), DAO governance for platform decisions." },
                { year: "2026 Q4", title: "Phase 3: Ecosystem", desc: "Creator tokenomics (social tokens), Enterprise partnerships (venues, labels), Mobile app (iOS/Android)." },
            ]
        }
    },
    tr: {
        nav: {
            connect: "Cüzdanı Bağla",
            disconnect: "Çıkış Yap",
        },
        hero: {
            title: "youtick",
            subtitle: "Premium Video İçeriğinin Geleceği",
            tagline: "NFT TABANLI MERKEZİYETSİZ VİDEO YAYIN PLATFORMU",
            cta_watch: "İzlemeye Başla",
            cta_upload: "Video Yükle",
            stats: {
                market: "Küresel Pazar",
                cost: "Maliyet Tasarrufu",
                revenue: "Üretici Geliri",
            }
        },
        features: {
            title: "youtick Çözümü",
            subtitle: "Web3 tabanlı mimari ile premium video dağıtımını dönüştürüyoruz.",
            items: [
                { title: "NFT Biletler", desc: "Doğrulanabilir sahiplik, devredilebilir erişim ve ikincil pazar. Hayranlar erişim hakkına sahip olur." },
                { title: "Şifreli Depolama", desc: "İçerik eşik şifreleme ile korunur. Yalnızca NFT sahipleri şifreyi çözüp izleyebilir." },
                { title: "Merkeziyetsiz CDN", desc: "Livepeer ağı üzerinden küresel dağıtım, tek hata noktası olmamasını ve yüksek performans sağlar." },
                { title: "Üretici Kontrolü", desc: "Fiyatları, telif haklarını ve erişim kurallarını doğrudan zincir üzerinde belirleyin. Platformun sahibi sizsiniz." },
                { title: "Kalıcı Depolama", desc: "İçerik Filecoin üzerinde kriptografik koruma kanıtları ile saklanır. Asla kaybolmaz." },
                { title: "97.5% Gelir", desc: "Kazandığınızın neredeyse tamamı sizde kalır. Biz sadece %2.5 protokol ücreti alıyoruz." },
            ]
        },
        useCases: {
            title: "Kullanım Alanları",
            subtitle: "Her sektördeki içerik üreticilerini güçlendiriyoruz.",
            items: [
                { title: "Konser Kayıtları", desc: "Sanatçılar özel konser kayıtlarını sınırlı sayıda NFT bileti olarak yayınlar." },
                { title: "Bağımsız Sinema", desc: "Film yapımcıları filmlerini stüdyo aracıları olmadan doğrudan izleyicilere dağıtır." },
                { title: "Canlı Etkinlikler", desc: "Sanal galalar, canlı yayınlanan etkinlikler ve özel soru-cevap oturumları." },
                { title: "Eğitim", desc: "Kurs oluşturucuları, doğrulanabilir sertifikalarla premium video kurslarını gelire dönüştürür." },
                { title: "Spor", desc: "Takımlar özel kamera arkası içerikleri ve maç tekrarları sunar." },
                { title: "Podcastler", desc: "Premium podcast bölümleri ve sınırlı sayıda erişim NFT'leri ile özel röportajlar." },
            ]
        },
        techStack: {
            title: "Web3 Devleri Tarafından Destekleniyor",
        },
        upload: {
            title: "Başlamaya Hazır mısınız?",
            subtitle: "İlk videonuzu bugün merkeziyetsiz ağa yükleyin.",
        },
        roadmap: {
            title: "Yol Haritası",
            subtitle: "Video yayıncılığında devrim yaratma yolculuğumuz.",
            phases: [
                { year: "2026 Q1", title: "Faz 1: MVP", desc: "NEAR cüzdan kimlik doğrulama, Lighthouse şifreleme ile video yükleme, NFT basımı, Livepeer üzerinden token korumalı yayın, Temel içerik üretici paneli." },
                { year: "2026 Q2", title: "Faz 2: Büyüme", desc: "İkincil pazar entegrasyonu, Telif hakkı dağıtım sistemi, İçerik üreticileri için analiz paneli, Çoklu dil desteği." },
                { year: "2026 Q3", title: "Faz 3: Ölçeklenme", desc: "Canlı yayın desteği, Zincirler arası ödeme desteği (Köprüler ile ETH, BTC), Platform kararları için DAO yönetişimi." },
                { year: "2026 Q4", title: "Faz 3: Ekosistem", desc: "İçerik üretici token ekonomisi (sosyal tokenlar), Kurumsal ortaklıklar (mekanlar, şirketler), Mobil uygulama (iOS/Android)." },
            ]
        }
    }
};
