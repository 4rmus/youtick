# Proposal: YouTick - Serverless Video Infrastructure on NEAR

## Organization

### Primary person’s contact information
[Your Name / Contact Info]
[Email Address]
[Telegram/Discord Handle]

### Size of the whole team
[Number of members, e.g., 2]

### Size of the engineering team
[Number of engineers, e.g., 2]

### Team location
[Location, e.g., Global / Remote]

### Team background and bios
**[Your Name/Role]:** Experienced Full-Stack & Blockchain Developer specializing in NEAR Protocol and React/Next.js. Creator of YouTick, demonstrating deep expertise in Chain Signatures, MPC, and serverless architectures.
[Add other team members if applicable]

### Any affiliations with other NEAR ecosystem partners?
Affiliated with NEAR DevHub / Build DAO communities through active participation and previous submissions.

## Professional Experience

### Examples of relevant experience with NEAR blockchain
*   **YouTick (Current Project):** A fully functional VOD platform on NEAR Testnet implementing Chain Signatures, MPC (Multi-Party Computation), and Lit Protocol for encryption.
*   **Smart Contract Development:** Engineered complex Rust contracts (NEP-171) with embedded "Prepaid Proxy" logic for gas-abstracted user experiences.
*   **Frontend Integration:** Built custom `ethers.js` compatible signers (`MPCSigner`) for NEAR, enabling cross-chain interactions directly from the client.

### Non-technical capabilities:
*   **Product Design:** Focused on "Invisible Web3" UX, reducing crypto-friction for mainstream users.
*   **Documentation:** Created comprehensive technical documentation and implementation plans (`PROPOSAL_DRAFT.md`, `README.md`) to guide other developers.

### In-House Resources;
*   **Design/UX:** Internal capability to design clean, responsive interfaces (Tailwind CSS).
*   **Project Management:** Agile workflow using GitHub Projects for tracking milestones and shipping features.

### Portfolio of relevant work
*   **YouTick Repository:** [https://github.com/4rmus/youtick-mvp](https://github.com/4rmus/youtick-mvp) - Demonstrates usage of NEAR Chain Signatures, Lit Protocol, and Lighthouse Storage.

## Body

YouTick is a decentralized, serverless Video-On-Demand (VOD) platform that leverages **NEAR Chain Signatures**, **MPC (Multi-Party Computation)**, and **Lit Protocol** to eliminate the need for centralized backend infrastructure. This proposal seeks support from the Infrastructure Committee to further develop YouTick as a reference implementation for the **"Zero Streaming and Server cost" Economy** and "Session Key" patterns on NEAR, providing a blueprint for high-performance, complex dApps that run entirely on-chain and client-side.

### Solution & Infrastructure Innovation

YouTick addresses critical ecosystem problems through a novel architecture that acts as "Application-Layer Infrastructure":

#### 1. Zero Streaming and Server cost Economy (Infrastructure-as-Code)
YouTick operates without a traditional backend. All logic is handled by:
*   **NEAR Smart Contracts**: For state, payments, and access rights (NFTs).
*   **Client-Side MPC**: For key derivation and encryption via Lit Protocol.
*   **IPFS/Lighthouse**: For decentralized physical storage.
*   **NEAR Chain Signatures**: For bridging identities and authorizing actions across protocols without a server.
*   **Result:** Eliminates monthly streaming and server costs, replacing them with a pay-per-use model that scales infinitely.

#### 2. Session Keys & Prepaid Proxy Contract
We have implemented a **Prepaid Proxy** pattern in our Rust smart contract (`contracts/nft-ticket`). This allows users to:
*   Deposit funds into a "Gas Tank" on the contract.
*   Grants "Session Keys" limited permissions to spend these funds.
*   **Result:** A "One-Click" upload experience where the browser automatically signs and pays for multiple steps (MPC signing, Storage Deposit, Minting) in the background, without interrupting the user. This is a critical infrastructure pattern for mass adoption.

#### 3. Chain Signatures & MPC Integration
YouTick deeply integrates NEAR's MPC network. We have built a custom `MPCSigner` (compatible with `ethers.js`) that allows the NEAR account to drive EVM-based encryption protocols (Lit Protocol) directly.
*   **Innovation:** We mathematically derive ETH addresses from NEAR accounts client-side, enabling seamless cross-chain identity management without a separate wallet.

## Goals / Milestones

### Milestone 1: Security Audit & Optimization (Month 1)
*   **Goal:** Ensure the "Prepaid Proxy" and MPC logic are secure for Mainnet user funds.
*   **Deliverables:**
    *   Completed internal security audit of `contracts/nft-ticket`.
    *   Gas optimization report for MPC signing functions.
    *   Updated `chain-signatures.ts` for Mainnet MPC endpoints.

### Milestone 2: SDK Extraction & Documentation (Month 2)
*   **Goal:** Lower the barrier for other developers to build "Zero Streaming and Server cost" apps.
*   **Deliverables:**
    *   Extract `MPCSigner` and `SessionKey` logic into a reusable `near-serverless-sdk`.
    *   Publish technical tutorial: "Building Serverless Apps with NEAR Chain Signatures".
    *   Refactored codebase with clear examples for community reuse.

### Milestone 3: Mainnet Launch & Pilot (Month 3)
*   **Goal:** Demonstrate the viability of the infrastructure in production.
*   **Deliverables:**
    *   Deploy YouTick contracts to NEAR Mainnet.
    *   Onboard initial batch of content creators.
    *   Monitor and report on MPC performance and costs under real load.

## Metrics

We will track the following metrics to measure success:
1.  **Code Reuse:** Number of GitHub forks/stars and downloads of the extracted SDK components.
2.  **Infrastructure Usage:** Total number of MPC signatures generated by the application on Mainnet.
3.  **User Adoption:** Number of unique accounts creating "Session Keys" and interacting with the "Prepaid Proxy" contract.
4.  **Cost Efficiency:** Comparison of YouTick's operating costs vs. traditional server-based solutions (AWS/Livepeer), proving the "Zero Streaming and Server cost" model.

## Competitor Comparison

| Feature | YouTick (NEAR) | Traditional Web2 (YouTube/Vimeo) | Other Web3 (Livepeer/Theta) |
| :--- | :--- | :--- | :--- |
| **Server Cost** | **Zero (Client-side)** | High (Centralized servers) | Medium (Requires transcoding nodes) |
| **Streaming Cost** | **Zero (IPFS/Lighthouse)** | High (CDNs) | Variable (Node fees) |
| **User Experience** | **Seamless (Session Keys)** | Seamless | Friction (Multiple signatures) |
| **Ownership** | **NFT-based (Permanent)** | Platform-owned | Token-based |
| **Cross-Chain** | **Native (Chain Signatures)** | None | Bridge-dependent |

### Current Market Size
The target market includes decentralized content creators and developers seeking serverless infrastructure primitives. The potential spans the entire NEAR creator economy and the growing sector of "Chain Abstraction" developers.

## Usage & Examples

*   **Current User Flow:** Users connect their NEAR wallet, deposit funds into the contract's gas tank, and upload videos. The browser handles encryption transparency using MPC signatures derived from their NEAR account.
*   **Ecosystem Relevance:** This architecture is a direct implementation of NEAR's "Chain Abstraction" vision, proving that complex interactions can be hidden behind a simple UI.

## Budget

### Budget Total
$25,000 USD (in NEAR equivalent)

### Budget Breakdown

*   **Engineering & Development ($15,000):**
    *   Contract auditing and hardening.
    *   SDK extraction and documentation.
    *   Frontend optimizations for Mainnet.
*   **Infrastructure & Testing ($5,000):**
    *   MPC signature costs during testing and initial user onboarding (subsidizing gas).
    *   IPFS storage pinning costs for initial content.
*   **Marketing & Community ($5,000):**
    *   Developer tutorials and workshops.
    *   Creator onboarding program.
    *   Demo video production.

---

# (Turkish Translation) Teklif: YouTick - NEAR Üzerinde Sunucusuz Video Altyapısı

## Organizasyon

### Birincil Kişi İletişim Bilgileri
[Adınız / İletişim Bilgisi]
[E-posta Adresi]
[Telegram/Discord Adı]

### Tüm Ekip Büyüklüğü
[Üye sayısı, örn. 2]

### Mühendislik Ekibi Büyüklüğü
[Mühendis sayısı, örn. 2]

### Ekip Konumu
[Konum, örn. Global / Uzaktan]

### Ekip Geçmişi ve Biyografileri
**[Adınız/Rolünüz]:** NEAR Protocol ve React/Next.js konularında uzmanlaşmış Deneyimli Full-Stack & Blockchain Geliştiricisi. Zincir İmzaları, MPC ve sunucusuz mimariler konusunda derin uzmanlık gösteren YouTick'in yaratıcısı.

### Diğer NEAR ekosistemi ortaklarıyla bağlantılar
NEAR DevHub / Build DAO toplulukları ile aktif katılım ve önceki başvurular yoluyla bağlantılı.

## Profesyonel Deneyim

### NEAR blockchain ile ilgili deneyim örnekleri
*   **YouTick (Mevcut Proje):** Zincir İmzaları, MPC (Çok Taraflı Hesaplama) ve şifreleme için Lit Protokolü uygulayan, NEAR Testnet üzerinde çalışan tam fonksiyonel bir VOD platformu.
*   **Akıllı Sözleşme Geliştirme:** Gaz soyutlamalı kullanıcı deneyimleri için yerleşik "Ön Ödemeli Proxy" mantığına sahip karmaşık Rust sözleşmeleri (NEP-171) geliştirdi.
*   **Frontend Entegrasyonu:** NEAR için, istemciden doğrudan zincirler arası etkileşimleri sağlayan özel `ethers.js` uyumlu imzalayıcılar (`MPCSigner`) oluşturdu.

### Teknik olmayan yetkinlikler:
*   **Ürün Tasarımı:** Ana akım kullanıcılar için kripto sürtünmesini azaltan "Görünmez Web3" UX'ine odaklandı.
*   **Dokümantasyon:** Diğer geliştiricilere rehberlik etmek için kapsamlı teknik dokümantasyon ve uygulama planları (`PROPOSAL_DRAFT.md`, `README.md`) oluşturdu.

### Kurum İçi Kaynaklar;
*   **Tasarım/UX:** Temiz, duyarlı arayüzler tasarlama yetkinliği (Tailwind CSS).
*   **Proje Yönetimi:** Kilometre taşlarını takip etmek ve özellikler sunmak için GitHub Projects kullanan Çevik (Agile) iş akışı.

### İlgili çalışma portföyü
*   **YouTick Deposu:** [https://github.com/4rmus/youtick-mvp](https://github.com/4rmus/youtick-mvp) - NEAR Zincir İmzaları, Lit Protokolü ve Lighthouse Depolama kullanımını gösterir.

## Gövde (Teklif İçeriği)

YouTick, merkezi bir arka uç altyapısına ihtiyaç duymadan çalışan; **NEAR Zincir İmzaları (Chain Signatures)**, **MPC (Çok Taraflı Hesaplama)** ve **Lit Protokolü** teknolojilerini kullanan, sunucusuz ve merkeziyetsiz bir İsteğe Bağlı Video (VOD) platformudur. Bu teklif, YouTick'i **"Sıfır Akış ve Sunucu Maliyeti" (Zero Streaming and Server cost) Ekonomisi** ve "Oturum Anahtarı" (Session Key) modelleri için bir referans uygulama olarak geliştirmek ve NEAR Altyapı Komitesi'nden destek almak amacıyla hazırlanmıştır. Amaç, tamamen zincir üzerinde (on-chain) ve istemci tarafında (client-side) çalışan yüksek performanslı ve karmaşık dApp'ler için bir plan sunmaktır.

### Çözüm ve Altyapısal İnovasyon

YouTick, "Uygulama Katmanı Altyapısı" olarak hareket eden özgün bir mimari ile ekosistemin kritik sorunlarını çözer:

#### 1. Sıfır Akış ve Sunucu Maliyeti Ekonomisi (Zero Streaming and Server cost)
YouTick, geleneksel bir arka uç (backend) olmadan çalışır. Tüm mantık şu bileşenlerce yönetilir:
*   **NEAR Akıllı Sözleşmeleri:** Durum (state), ödemeler ve erişim hakları (NFT'ler) için.
*   **İstemci Tarafı MPC:** Lit Protokolü aracılığıyla anahtar türetme ve şifreleme için.
*   **IPFS/Lighthouse:** Merkeziyetsiz fiziksel depolama için.
*   **NEAR Zincir İmzaları:** Sunucu olmadan kimlikleri köprülemek ve protokoller arası işlemleri yetkilendirmek için.
*   **Sonuç:** Aylık akış ve sunucu maliyetlerini ortadan kaldırır, yerine sonsuz ölçeklenebilir, kullandıkça öde modeli getirir.

#### 2. Oturum Anahtarları ve Ön Ödemeli Proxy Sözleşmesi
Rust akıllı sözleşmemizde (`contracts/nft-ticket`) bir **Ön Ödemeli Proxy** modeli uyguladık. Bu sayede kullanıcılar:
*   Sözleşmedeki bir "Gaz Deposu"na fon yatırabilir.
*   "Oturum Anahtarları"na bu fonları kullanması için sınırlı izinler verebilir.
*   **Sonuç:** Tarayıcının, kullanıcıyı rahatsız etmeden arka planda birden fazla adımı (MPC imzalama, Depolama Mevduatı, NFT Basımı) otomatik olarak imzaladığı ve ödediği "Tek Tıkla" yükleme deneyimi. Bu, kitlesel benimseme için kritik bir altyapı modelidir.

#### 3. Zincir İmzaları ve MPC Entegrasyonu
YouTick, NEAR'ın MPC ağını derinlemesine entegre eder. NEAR hesabının EVM tabanlı şifreleme protokollerini (Lit Protokolü) doğrudan yönetmesini sağlayan özel bir `MPCSigner` (ethers.js uyumlu) geliştirdik.
*   **İnovasyon:** ETH adreslerini NEAR hesaplarından istemci tarafında matematiksel olarak türeterek, ayrı bir cüzdana ihtiyaç duymadan sorunsuz zincirler arası kimlik yönetimi sağlıyoruz.

## Hedefler / Kilometre Taşları

### Kilometre Taşı 1: Güvenlik Denetimi ve Optimizasyon (1. Ay)
*   **Hedef:** "Ön Ödemeli Proxy" ve MPC mantığının Mainnet kullanıcı fonları için güvenli olduğundan emin olmak.
*   **Teslim Edilecekler:**
    *   `contracts/nft-ticket` için dahili güvenlik denetiminin tamamlanması.
    *   MPC imzalama fonksiyonları için gaz optimizasyon raporu.
    *   Mainnet MPC uç noktaları için `chain-signatures.ts` güncellenmesi.

### Kilometre Taşı 2: SDK Çıkarımı ve Dokümantasyon (2. Ay)
*   **Hedef:** Diğer geliştiricilerin "Sıfır Akış ve Sunucu Maliyeti" uygulamaları oluşturması için engelleri düşürmek.
*   **Teslim Edilecekler:**
    *   `MPCSigner` ve `SessionKey` mantığının yeniden kullanılabilir bir `near-serverless-sdk` içine çıkarılması.
    *   Teknik eğitici yayınlanması: "NEAR Zincir İmzaları ile Sunucusuz Uygulamalar Oluşturma".
    *   Topluluğun yeniden kullanımı için net örneklerle kod tabanının yeniden düzenlenmesi.

### Kilometre Taşı 3: Mainnet Lansmanı ve Pilot (3. Ay)
*   **Hedef:** Altyapının canlı ortamda uygulanabilirliğini göstermek.
*   **Teslim Edilecekler:**
    *   YouTick sözleşmelerinin NEAR Mainnet'e dağıtılması.
    *   İlk içerik oluşturucu grubunun dahil edilmesi.
    *   Gerçek yük altında MPC performansının ve maliyetlerinin izlenmesi ve raporlanması.

## Metrikler

Başarıyı ölçmek için aşağıdaki metrikleri takip edeceğiz:
1.  **Kod Yeniden Kullanımı:** Çıkarılan SDK bileşenlerinin GitHub fork/yıldız sayısı ve indirilme sayısı.
2.  **Altyapı Kullanımı:** Uygulama tarafından Mainnet üzerinde oluşturulan toplam MPC imzası sayısı.
3.  **Kullanıcı Benimsemesi:** "Oturum Anahtarları" oluşturan ve "Ön Ödemeli Proxy" sözleşmesiyle etkileşime giren benzersiz hesap sayısı.
4.  **Maliyet Verimliliği:** YouTick'in işletme maliyetlerinin geleneksel sunucu tabanlı çözümlerle (AWS/Livepeer) karşılaştırılması ve "Sıfır Akış ve Sunucu Maliyeti" modelinin kanıtlanması.

## Rakip Karşılaştırması

| Özellik | YouTick (NEAR) | Geleneksel Web2 (YouTube/Vimeo) | Diğer Web3 (Livepeer/Theta) |
| :--- | :--- | :--- | :--- |
| **Sunucu Maliyeti** | **Sıfır (İstemci taraflı)** | Yüksek (Merkezi sunucular) | Orta (Dönüştürme düğümleri gerekir) |
| **Akış Maliyeti** | **Sıfır (IPFS/Lighthouse)** | Yüksek (CDN'ler) | Değişken (Düğüm ücretleri) |
| **Kullanıcı Deneyimi** | **Sorunsuz (Oturum Anahtarları)** | Sorunsuz | Sürtünmeli (Çoklu imza) |
| **Sahiplik** | **NFT tabanlı (Kalıcı)** | Platforma ait | Token tabanlı |
| **Çapraz Zincir** | **Yerel (Zincir İmzaları)** | Yok | Köprüye bağımlı |

### Mevcut Pazar Büyüklüğü
Hedef pazar, merkeziyetsiz içerik oluşturucuları ve sunucusuz altyapı yapı taşları arayan geliştiricileri içerir. Potansiyel, tüm NEAR yaratıcı ekonomisini ve büyüyen "Zincir Soyutlama" geliştiricileri sektörünü kapsar.

## Kullanım ve Örnekler

*   **Mevcut Kullanıcı Akışı:** Kullanıcılar NEAR cüzdanlarını bağlar, sözleşmenin gaz deposuna fon yatırır ve video yükler. Tarayıcı, NEAR hesaplarından türetilen MPC imzalarını kullanarak şifreleme şeffaflığını yönetir.
*   **Ekosistem Uygunluğu:** Bu mimari, karmaşık etkileşimlerin basit bir kullanıcı arayüzünün arkasına gizlenebileceğini kanıtlayan NEAR'ın "Zincir Soyutlama" vizyonunun doğrudan bir uygulamasıdır.

## Bütçe

### Bütçe Toplamı
25.000 USD (NEAR eşdeğeri)

### Bütçe Dağılımı

*   **Mühendislik ve Geliştirme (15.000$):**
    *   Sözleşme denetimi ve güçlendirme.
    *   SDK çıkarımı ve dokümantasyon.
    *   Mainnet için frontend optimizasyonları.
*   **Altyapı ve Test (5.000$):**
    *   Test ve ilk kullanıcı katılımı sırasında MPC imza maliyetleri (gaz sübvansiyonu).
    *   İlk içerik için IPFS depolama sabitleme maliyetleri.
*   **Pazarlama ve Topluluk (5.000$):**
    *   Geliştirici eğitimleri ve atölye çalışmaları.
    *   İçerik oluşturucu katılım programı.
    *   Demo video üretimi.
