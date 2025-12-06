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
        },
        landing: {
            branding: {
                name: "youtick"
            },
            hero: {
                badge: "Blockchain-Powered Content Ownership",
                title_line1: "Content Ownership",
                title_line2: "Is Now Yours",
                description_creators: "Creators",
                description_creators_text: "You own your content, keep 100% of revenue.",
                description_viewers: "Viewers",
                description_viewers_text: "Your purchased content is forever yours, even if the platform closes.",
                badge_no_censorship: "No Censorship",
                badge_ownership: "True Ownership",
                badge_instant_revenue: "Instant Revenue",
                cta_discover: "Discover",
                cta_create_event: "Create Event"
            },
            nav: {
                home: "Home",
                discover: "Discover",
                upload: "Upload",
                start: "Get Started",
                features: "Features",
                comparison: "Comparison",
                use_cases: "Use Cases"
            },
            stats: {
                ticket_capacity: "Ticket Capacity",
                potential_events: "Potential Events",
                fraud_rate: "Fraud Rate"
            },
            features: {
                title: "Why YouTick?",
                subtitle: "Solving all problems of traditional ticketing systems with blockchain technology.",
                fraud_proof_title: "Fraud Impossible",
                fraud_proof_desc: "Every ticket is verifiable on blockchain. Copying and counterfeiting are technically impossible.",
                secure_transfer_title: "Secure Transfer",
                secure_transfer_desc: "Transfer your ticket to anyone instantly and securely. Smart contract guaranteed.",
                instant_payment_title: "Instant Payment",
                instant_payment_desc: "Organizers receive revenue instantly. No bank transfer waiting time.",
                community_control_title: "Community Control",
                community_control_desc: "Price control in secondary market. Prevent speculative black markets."
            },
            comparison: {
                title: "Traditional Systems vs YouTick",
                subtitle: "Comparison with Ticketmaster, Eventbrite and similar systems",
                feature: "Feature",
                traditional: "Traditional",
                youtick: "YouTick",
                fake_risk: "Fake Ticket Risk",
                transparent_pricing: "Transparent Pricing",
                instant_transfer: "Instant Revenue Transfer",
                secondary_control: "Secondary Market Control",
                low_commission: "Low Commission",
                global_access: "Global Access",
                proof_of_ownership: "Proof of Ownership"
            },
            use_cases: {
                title: "For Every Event",
                subtitle: "From concerts to cinema, sports to theater. YouTick everywhere.",
                concerts_title: "Concerts",
                concerts_desc: "Buy festival and concert tickets as NFTs. Goodbye black market, guaranteed entry.",
                cinema_title: "Cinema",
                cinema_desc: "VIP access to exclusive screenings and gala nights. Collectible movie tickets.",
                sports_title: "Sports",
                sports_desc: "Secure tickets for derbies and championship matches. Fan collection NFTs."
            },
            how_it_works: {
                title: "How It Works?",
                subtitle: "Get or create your ticket in 3 simple steps.",
                step1_title: "Connect Wallet",
                step1_desc: "Connect your NEAR wallet or create a new one. Just a few seconds.",
                step2_title: "Choose Event",
                step2_desc: "Discover the event you want or create your own event.",
                step3_title: "Buy/Create Ticket",
                step3_desc: "Get your NFT ticket and prove your ownership on blockchain."
            },
            cta: {
                title_line1: "Join the",
                title_line2: "Future of Ticketing",
                subtitle: "Create your first event or discover existing events. Experience blockchain-based ticketing.",
                start_exploring: "Start Exploring"
            },
            footer: {
                built_on: "Built on NEAR Protocol.",
                privacy: "Privacy",
                terms: "Terms",
                support: "Support"
            },
            discover: {
                scanning_blockchain: "Scanning Blockchain...",
                failed_to_load: "Failed to load videos",
                no_videos_found: "No Videos Found",
                be_first: "Be the first to upload content!",
                upload_now: "Upload Now",
                recently_uploaded: "Recently Uploaded",
                no_description: "No description.",
                owner: "Owner",
                access_pass: "Access Pass"
            }
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
        },
        landing: {
            branding: {
                name: "YOUTICK"
            },
            hero: {
                badge: "Blockchain Destekli İçerik Sahipliği",
                title_line1: "İçerik Sahipliği",
                title_line2: "Artık Sizde",
                description_creators: "Üreticiler",
                description_creators_text: "İçeriğinizin tek sahibi siz olun, gelirin %100'ünü alın.",
                description_viewers: "İzleyiciler",
                description_viewers_text: "Satın aldığınız içerik sonsuza dek sizin, platform kapansa bile.",
                badge_no_censorship: "Sansür Yok",
                badge_ownership: "Gerçek Sahiplik",
                badge_instant_revenue: "Anlık Gelir",
                cta_discover: "Keşfet",
                cta_create_event: "Etkinlik Oluştur"
            },
            nav: {
                home: "Ana Sayfa",
                discover: "Keşfet",
                upload: "Yükle",
                start: "Başla",
                features: "Özellikler",
                comparison: "Karşılaştırma",
                use_cases: "Kullanım Alanları"
            },
            stats: {
                ticket_capacity: "Bilet Kapasitesi",
                potential_events: "Potansiyel Etkinlik",
                fraud_rate: "Sahtecilik Oranı"
            },
            features: {
                title: "Neden YouTick?",
                subtitle: "Geleneksel biletleme sistemlerinin tüm sorunlarını blockchain teknolojisiyle çözüyoruz.",
                fraud_proof_title: "Sahtecilik İmkansız",
                fraud_proof_desc: "Her bilet blockchain üzerinde doğrulanabilir. Kopya ve sahte bilet üretmek teknik olarak imkansız.",
                secure_transfer_title: "Güvenli Transfer",
                secure_transfer_desc: "Biletinizi istediğiniz kişiye anında ve güvenle transfer edin. Akıllı kontrat garantisi.",
                instant_payment_title: "Anlık Ödeme",
                instant_payment_desc: "Organizatörler gelirlerini anında alır. Banka transferi bekleme süresi yok.",
                community_control_title: "Topluluk Kontrolü",
                community_control_desc: "İkinci el piyasasında fiyat kontrolü. Spekülatif karaborsayı engelleyin."
            },
            comparison: {
                title: "Geleneksel Sistemler vs YouTick",
                subtitle: "Biletix, Passo ve benzeri sistemlerle karşılaştırma",
                feature: "Özellik",
                traditional: "Geleneksel",
                youtick: "YouTick",
                fake_risk: "Sahte Bilet Riski",
                transparent_pricing: "Şeffaf Fiyatlandırma",
                instant_transfer: "Anlık Gelir Transferi",
                secondary_control: "İkinci El Kontrolü",
                low_commission: "Düşük Komisyon",
                global_access: "Global Erişim",
                proof_of_ownership: "Bilet Sahipliği Kanıtı"
            },
            use_cases: {
                title: "Her Etkinlik İçin",
                subtitle: "Konserlerden sinemaya, spordan tiyatroya. YouTick her yerde.",
                concerts_title: "Konserler",
                concerts_desc: "Festival ve konser biletlerinizi NFT olarak satın alın. Karaborsaya elveda, garantili giriş.",
                cinema_title: "Sinema",
                cinema_desc: "Özel gösterimler ve gala gecelerine VIP erişim. Koleksiyonluk film biletleri.",
                sports_title: "Spor",
                sports_desc: "Derbi ve şampiyonluk maçlarına güvenli bilet. Taraftar koleksiyon NFT'leri."
            },
            how_it_works: {
                title: "Nasıl Çalışır?",
                subtitle: "3 basit adımda biletinizi alın veya oluşturun.",
                step1_title: "Cüzdan Bağla",
                step1_desc: "NEAR cüzdanınızı bağlayın veya yeni bir cüzdan oluşturun. Sadece birkaç saniye.",
                step2_title: "Etkinlik Seç",
                step2_desc: "İstediğiniz etkinliği keşfedin veya kendi etkinliğinizi oluşturun.",
                step3_title: "Bilet Al/Oluştur",
                step3_desc: "NFT biletinizi alın ve blockchain üzerinde sahipliğinizi kanıtlayın."
            },
            cta: {
                title_line1: "Biletlemenin",
                title_line2: "Geleceğine Katılın",
                subtitle: "İlk etkinliğinizi oluşturun veya mevcut etkinlikleri keşfedin. Blockchain tabanlı biletleme deneyimini yaşayın.",
                start_exploring: "Keşfetmeye Başla"
            },
            footer: {
                built_on: "NEAR Protocol üzerinde inşa edildi.",
                privacy: "Gizlilik",
                terms: "Şartlar",
                support: "Destek"
            },
            discover: {
                scanning_blockchain: "Blockchain Taranıyor...",
                failed_to_load: "Videolar yüklenemedi",
                no_videos_found: "Video Bulunamadı",
                be_first: "İlk içeriği yükleyen siz olun!",
                upload_now: "Şimdi Yükle",
                recently_uploaded: "Son Yüklenenler",
                no_description: "Açıklama yok.",
                owner: "Sahip",
                access_pass: "Erişim Kartı"
            }
        }
    }
};
