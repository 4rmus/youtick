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
                badge: "The Digital Salon Experience",
                title_line1: "Web2 Ease",
                title_line2: "Web3 Ownership",
                subtitle: "Next generation video streaming & NFT ticketing platform for concerts, cinema, and workshops",
                description: "Where creators and viewers meet directly. 98% creator revenue. True content ownership. Decentralized monetization.",
                badge_no_censorship: "Censorship Resistant",
                badge_ownership: "True Ownership",
                badge_instant_revenue: "98% Revenue Share",
                cta_discover: "Explore Events",
                cta_create_event: "Start Creating"
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
                users: "Users (2026 Target)",
                users_value: "200,000+",
                creators: "Active Creators",
                creators_value: "5,000+",
                revenue: "Creator Revenue",
                revenue_value: "98%",
                volume: "Transaction Volume",
                volume_value: "$10M+"
            },
            features: {
                title: "Why YouTick?",
                subtitle: "Revolutionary features that make YouTick the future of event streaming.",
                nft_gated_title: "NFT-Gated Access",
                nft_gated_desc: "Client-side encryption ensures only NFT holders can view content. 100% fraud-proof.",
                revenue_share_title: "98% Revenue Share",
                revenue_share_desc: "Lowest fees in the industry. Keep almost everything you earn compared to 45-55% on Web2 platforms.",
                near_speed_title: "Lightning Fast",
                near_speed_desc: "Built on NEAR Protocol with 100,000 TPS capacity. Instant transactions, minimal fees.",
                true_ownership_title: "True Ownership",
                true_ownership_desc: "Content stored on IPFS. Your NFTs remain valid even if the platform closes. Forever yours.",
                instant_payment_title: "Instant Payment",
                instant_payment_desc: "Revenue goes directly to your wallet. No delays, no middlemen, no waiting.",
                global_access_title: "Global Access",
                global_access_desc: "No geo-restrictions. Cross-platform access. Available anywhere, anytime."
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
                title: "Digital Salon Experience",
                subtitle: "Physical events meet digital excellence. The best of both worlds.",
                concerts_title: "Concert Experience",
                concerts_physical: "Physical: Ticket ($50) → Attend → Photos → Souvenir",
                concerts_digital: "Digital: NFT Ticket (0.5 NEAR) → 4K Stream → Backstage Content → Token-Gated Chat → Permanent Collectible → Potential Value Increase",
                cinema_title: "Cinema Premiere",
                cinema_physical: "Physical: Ticket ($30) → Theater → Q&A → Poster",
                cinema_digital: "Digital: Limited NFT (0.3 NEAR) → Premium Stream → Live Q&A (NFT Holders) → Digital Poster → Making-Of Content → Resale Market",
                workshop_title: "Workshop/Masterclass",
                workshop_physical: "Physical: Registration ($200) → Attend → Notes → Certificate",
                workshop_digital: "Digital: NFT Pass (2 NEAR) → Live Stream + Q&A → Exclusive Materials → Blockchain Certificate → Lifetime Access → On-Chain Credential"
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
            },
            value_proposition: {
                title: "Creators Keep",
                percentage: "98%",
                subtitle: "The Highest Revenue Share in the Industry",
                description: "While YouTube and Vimeo take 45-55%, we only charge 2% platform fee. Your content, your revenue, your control.",
                instant: "Instant Payment",
                instant_desc: "Direct to wallet",
                no_middlemen: "No Middlemen",
                no_middlemen_desc: "You own everything",
                full_control: "Full Control",
                full_control_desc: "Set your own prices"
            },
            digital_salon: {
                title: "The Digital Salon",
                subtitle: "Replicating the magic of physical events in the digital world",
                physical: "Physical Event",
                digital: "YouTick Digital Salon",
                ticket: "Ticket Purchase",
                ticket_physical: "Paper/PDF Ticket",
                ticket_digital: "NFT Ticket",
                experience: "Event Experience",
                experience_physical: "Attend in Person",
                experience_digital: "Premium Video Stream",
                social: "Social Interaction",
                social_physical: "Talk to Attendees",
                social_digital: "Token-Gated Chat",
                memorabilia: "Souvenirs",
                memorabilia_physical: "Physical Keepsake",
                memorabilia_digital: "Digital Collectible + Value Growth"
            },
            competitive_advantages: {
                title: "Why YouTick Wins",
                subtitle: "Our unique position in the market",
                end_to_end: "End-to-End Solution",
                end_to_end_desc: "Ticketing + Video Streaming + NFT all in one platform. Competitors only do one.",
                event_centric: "Event-Centric Design",
                event_centric_desc: "Optimized UI/UX specifically for concerts, cinema, and workshops.",
                hybrid: "Hybrid Approach",
                hybrid_desc: "Web2 ease of use combined with Web3 ownership benefits.",
                creator_first: "Creator First",
                creator_first_desc: "98% revenue share and complete control over your content.",
                near_ecosystem: "NEAR Ecosystem",
                near_ecosystem_desc: "Low fees, high performance, and seamless user experience.",
                comparison_web2: "vs Web2 Platforms",
                comparison_web2_desc: "We give creators ownership and 2x more revenue",
                comparison_web3: "vs Web3 Platforms",
                comparison_web3_desc: "We provide complete event experience, not just one piece"
            },
            web3_bridge: {
                title: "Web3 Made Simple",
                subtitle: "No blockchain knowledge required. We handle the complexity.",
                fast_auth: "Easy Login",
                fast_auth_desc: "Email, Google, or Apple sign-in. NEAR wallet created automatically in the background.",
                gift_links: "Gift Links",
                gift_links_desc: "Share events via simple links. Recipients get wallet + ticket instantly with one click.",
                trial_accounts: "Free Trial",
                trial_accounts_desc: "Start with free trial account. Platform covers your first transactions. Upgrade when ready.",
                progressive: "Learn Gradually",
                progressive_desc: "Week 1-2: Basic features. Week 3-4: Smart contracts. Month 2+: Full Web3 power."
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
                badge: "Dijital Salon Deneyimi",
                title_line1: "Web2 Kolaylığı",
                title_line2: "Web3 Sahipliği",
                subtitle: "Konserler, sinema ve workshop'lar için yeni nesil video streaming ve NFT ticketing platformu",
                description: "İçerik oluşturucuların ve izleyicilerin doğrudan buluştuğu platform. %98 üretici geliri. Gerçek içerik sahipliği. Merkezi olmayan monetizasyon.",
                badge_no_censorship: "Sansür Dirençli",
                badge_ownership: "Gerçek Sahiplik",
                badge_instant_revenue: "%98 Gelir Payı",
                cta_discover: "Etkinlikleri Keşfet",
                cta_create_event: "Oluşturmaya Başla"
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
                users: "Kullanıcı (2026 Hedef)",
                users_value: "200,000+",
                creators: "Aktif Üretici",
                creators_value: "5,000+",
                revenue: "Üretici Geliri",
                revenue_value: "%98",
                volume: "İşlem Hacmi",
                volume_value: "$10M+"
            },
            features: {
                title: "Neden YouTick?",
                subtitle: "Etkinlik streaming'in geleceğini oluşturan devrimci özellikler.",
                nft_gated_title: "NFT-Korumalı Erişim",
                nft_gated_desc: "Client-side şifreleme ile sadece NFT sahipleri içeriği görebilir. %100 sahteciliğe karşı koruma.",
                revenue_share_title: "%98 Gelir Payı",
                revenue_share_desc: "Sektördeki en düşük ücret. Web2 platformların %45-55'ine kıyasla kazancınızın neredeyse tamamı sizde.",
                near_speed_title: "Yıldırım Hızı",
                near_speed_desc: "100,000 TPS kapasiteli NEAR Protocol üzerinde. Anında işlemler, minimum ücretler.",
                true_ownership_title: "Gerçek Sahiplik",
                true_ownership_desc: "İçerik IPFS'de saklanır. Platform kapansa bile NFT'leriniz geçerli. Sonsuza dek sizin.",
                instant_payment_title: "Anlık Ödeme",
                instant_payment_desc: "Gelir doğrudan cüzdanınıza. Gecikme yok, aracı yok, bekleme yok.",
                global_access_title: "Global Erişim",
                global_access_desc: "Coğrafi kısıtlama yok. Çapraz platform erişimi. Her zaman, her yerde."
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
                title: "Dijital Salon Deneyimi",
                subtitle: "Fiziksel etkinlikler dijital mükemmellikle buluşuyor. İki dünyanın en iyisi.",
                concerts_title: "Konser Deneyimi",
                concerts_physical: "Fiziksel: Bilet ($50) → Konsere Git → Fotoğraf → Hatıra",
                concerts_digital: "Dijital: NFT Bilet (0.5 NEAR) → 4K Stream → Backstage İçerik → Token-Korumalı Chat → Kalıcı Koleksiyon → Değer Artışı Potansiyeli",
                cinema_title: "Sinema İlk Gösterimi",
                cinema_physical: "Fiziksel: Bilet ($30) → Sinema → Soru-Cevap → Poster",
                cinema_digital: "Dijital: Limitli NFT (0.3 NEAR) → Premium Stream → Canlı Soru-Cevap (NFT Sahipleri) → Dijital Poster → Yapım İçeriği → Resale Market",
                workshop_title: "Workshop/Masterclass",
                workshop_physical: "Fiziksel: Kayıt ($200) → Katılım → Notlar → Sertifika",
                workshop_digital: "Dijital: NFT Kartı (2 NEAR) → Canlı Stream + Soru-Cevap → Özel Materyaller → Blockchain Sertifikası → Ömür Boyu Erişim → On-Chain Referans"
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
            },
            value_proposition: {
                title: "Üreticiler Alır",
                percentage: "%98",
                subtitle: "Sektördeki En Yüksek Gelir Payı",
                description: "YouTube ve Vimeo %45-55 alırken, biz sadece %2 platform ücreti alıyoruz. İçeriğiniz, geliriniz, kontrolünüz.",
                instant: "Anlık Ödeme",
                instant_desc: "Doğrudan cüzdana",
                no_middlemen: "Aracı Yok",
                no_middlemen_desc: "Her şey size ait",
                full_control: "Tam Kontrol",
                full_control_desc: "Kendi fiyatınızı belirleyin"
            },
            digital_salon: {
                title: "Dijital Salon",
                subtitle: "Fiziksel etkinliklerin büyüsünü dijital dünyada yeniden yaratıyoruz",
                physical: "Fiziksel Etkinlik",
                digital: "YouTick Dijital Salon",
                ticket: "Bilet Satın Alma",
                ticket_physical: "Kağıt/PDF Bilet",
                ticket_digital: "NFT Bilet",
                experience: "Etkinlik Deneyimi",
                experience_physical: "Fiziksel Katılım",
                experience_digital: "Premium Video Stream",
                social: "Sosyal Etkileşim",
                social_physical: "Katılımcılarla Sohbet",
                social_digital: "Token-Korumalı Chat",
                memorabilia: "Hatıra",
                memorabilia_physical: "Fiziksel Hatıra",
                memorabilia_digital: "Dijital Koleksiyon + Değer Artışı"
            },
            competitive_advantages: {
                title: "Neden YouTick Kazanır",
                subtitle: "Pazardaki benzersiz konumumuz",
                end_to_end: "Uçtan Uca Çözüm",
                end_to_end_desc: "Ticketing + Video Streaming + NFT tek platformda. Rakipler sadece birini yapıyor.",
                event_centric: "Etkinlik-Merkezli Tasarım",
                event_centric_desc: "Konserler, sinema ve workshop'lar için özel optimize edilmiş UI/UX.",
                hybrid: "Hibrit Yaklaşım",
                hybrid_desc: "Web2 kullanım kolaylığı ile Web3 sahiplik avantajları birlikte.",
                creator_first: "Üretici Öncelikli",
                creator_first_desc: "%98 gelir payı ve içeriğiniz üzerinde tam kontrol.",
                near_ecosystem: "NEAR Ekosistemi",
                near_ecosystem_desc: "Düşük ücretler, yüksek performans ve kusursuz kullanıcı deneyimi.",
                comparison_web2: "vs Web2 Platformları",
                comparison_web2_desc: "Üreticilere sahiplik ve 2x daha fazla gelir veriyoruz",
                comparison_web3: "vs Web3 Platformları",
                comparison_web3_desc: "Tam etkinlik deneyimi sunuyoruz, sadece bir parça değil"
            },
            web3_bridge: {
                title: "Web3 Basitleştirildi",
                subtitle: "Blockchain bilgisi gerekmez. Karmaşıklığı biz hallederiz.",
                fast_auth: "Kolay Giriş",
                fast_auth_desc: "Email, Google veya Apple ile giriş. NEAR cüzdanı arka planda otomatik oluşturulur.",
                gift_links: "Hediye Linkleri",
                gift_links_desc: "Etkinlikleri basit linklerle paylaşın. Alıcılar tek tıkla cüzdan + bilet alır.",
                trial_accounts: "Ücretsiz Deneme",
                trial_accounts_desc: "Ücretsiz deneme hesabıyla başlayın. Platform ilk işlemlerinizi karşılar. Hazır olunca yükseltin.",
                progressive: "Kademeli Öğrenme",
                progressive_desc: "Hafta 1-2: Temel özellikler. Hafta 3-4: Akıllı kontratlar. Ay 2+: Tam Web3 gücü."
            }
        }
    }
};
