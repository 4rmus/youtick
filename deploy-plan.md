 Layout kesinleşti — deployed WASM eski build                                                                                          
                                                                                                                                        
  Deployed WASM sha256 (b58): B6od7dzRsnKwJ3eipryozQLqr7SxtLf3vYLJGmdH2n4u ✓ zincirdeki code_hash ile aynı.                             
                                                                                                                                        
  Boyut: 561,927 bayt · 94 export.                                                                                                      
                                                                                                                                        
  Deployed vs. güncel lib.rs farkı (trait-generated fn'ler hariç):                                                                      
                  
  Deployed'da olmayıp HEAD'de olanlar → yani zincirdeki kod eski:                                                                       
  - sponsor_implicit_guest_direct (commit 312a14f'de eklenmişti)                                                                        
  - check_trial_access, grant_free_access_direct, revoke_trial_access (NFT-less free access için)                                       
                                                                                                                                        
  ⇒ Zincirdeki WASM ~312a14f'den eski, büyük ihtimalle 99f07bd/afd4231 civarı. Yeni active_event_count alanı ve güncel VideoMetadata    
  layout'u (event_date / nova_group_id) zincirde mevcut.                                                                                
                                                                                                                                        
  Contract borsh layout'unda zincir ile mevcut source temelde aynı — state read'i sıkıntısız, yani "Index out of bounds" paniği         
  state/layout uyumsuzluğundan değil, NonFungibleToken iç yapısındaki tarihi tutarsızlıktan (nft_total_supply = 0 vs. 33 trie girdisi;  
  tokens_per_owner[novilusio] = [0,1,20,30]).                                                                                           
                                                                                                                                        
  Temiz başlangıç için seçenekler                                                                                                       
                                                                                                                                        
  Mainnet'te "tüm NFT'leri sil" aksiyonu için 3 yol var. Hepsinin tradeoff'u farklı; seçimi sen yapacaksın:                             
                                                                                                                                        
  A) DeleteAccount + CreateAccount (en temiz ama riskli)                                                                                
  - Trie komple silinir, orfan girdiler dahil.                                                                                          
  - youtick.near top-level .near adı. Silersen yeniden yaratma near registrar'a bağlı — kısa .near adlarının geri alınması garanti değil
   (front-run riski, registrar kuralları). Üzerinde 7,357 Ⓝ var.                                                                        
  - Önerim: kullanma.                                                                                                                   
                                                                                                                                        
  B) StorageKey prefix rotation + #[init(ignore_state)] reset (güvenli, pragmatik)                                                      
  - StorageKey::NFT = b"n8" → b"n9", ve tüm prefixleri aynı şekilde döndür.                                                             
  - Yeni bir owner-only #[init(ignore_state)] pub fn reset_v11() ekle: yeni prefixlerle boş bir Contract döner, owner_id korunur.       
  - Deploy + reset → effective clean slate. Eski trie girdileri orfan kalır ama hiçbir koleksiyon onlara referans vermez; storage 607 KB
   civarında takılı kalır (maliyetsiz değil ama bloklayıcı değil).                                                                      
  - Avantaj: tek deploy + tek çağrı, hiç iteration yok.                                                                                 
  - Dezavantaj: storage_usage yüksek kalır.                                                                                             
                                                                                                                                        
  C) Explicit wipe admin fn (temiz ama gas-maliyetli)                                                                                   
  - wipe_all_state() admin fonksiyonu: UnorderedMap / TreeMap / UnorderedSet olan her şeyi iterate edip sil; LookupMap'ler için         
  (LookupMap kendi kendine iterate edemez) bilinen anahtar setleri üzerinden tek tek kaldır.                                            
  - Dezavantaj: çok sayıda trie girdisi varsa birden fazla tx gerektirebilir (batched delete).                                          
                                                                                                                                        
  Önerim                                                                                                                                
                                                                                                                                        
  B yolunu öneririm. Gerekçe: tek deploy, tek çağrı, deterministik, mainnet re-register riski yok. Orfan trie girdileri ürün işleyişini 
  etkilemez; ileride istersen C ile temizlersin.                                                                                        
                                                                                                                                        
  Onaylarsan şu değişikliği hazırlayayım:                                                                                               
   
  1. contracts/nft-ticket/src/lib.rs:                                                                                                   
    - StorageKey prefixlerinin hepsini *8 → *9 (veya *8b) olarak rotasyonla.
    - reset_v11() admin fn ekle: #[private] yerine owner_id == env::predecessor_account_id() require'lı, #[init(ignore_state)] ile fresh
   Contract döndür.                                                                                                                     
  2. contracts/nft-ticket/src/migrate.rs: dokunmam — reset zaten state'i sıfırlıyor, migrate'e gerek kalmaz.                            
  3. Sandbox test: reset çağrısı sonrası nft_total_supply, get_events_count, get_upload_session hepsi temiz başlıyor mu?                
  4. Build + hash doğrula. Deploy ve reset_v11 çağrısını sen mainnet'te yapacaksın (owner key'i sende); ben sadece kod + local test     
  hazırlarım.                                                                                                                           
                                                                                                                                        
  İlerleyeyim mi? (Prefixler için önerim: n8→n9, m8→m9, e8→e9, a8→a9, c8→c9, v8→v9, d8→d9, x8→x9, g8→g9, o8→o9, t8→t9, tr8→tr9, p8→p9,  
  pu8→pu9, am8→am9, be8→be9, us8→us9, ti8→ti9, ta8→ta9.)
                                                                                                                                        
✻ Baked for 2m 38s                   
                                                                                          
❯ Planı check etmeni istiyorum                                                                                                          
                                                                                                                                        
⏺ Planı kendi önerdiğim formda yeniden denetledim. Kısaca: yapı sağlam, ama yola çıkmadan netleşmesi gereken 5 nokta var.               
                                                                                                                                        
  Doğrulanan varsayımlar                                                                                                                
                                                                                                                                        
  - #[private] #[init(ignore_state)] pattern'i zincirde zaten kanıtlı — migrate() aynı desen. Yeni reset_v11 için aynısını kullanmak    
  doğru tercih.                                                                                                                         
  - LookupMap::new(prefix), UnorderedMap::new(prefix), TreeMap::new(prefix), UnorderedSet::new(prefix) hiçbiri yaratma anında trie'ye   
  yazmıyor — sadece prefix'i tutuyor. Yani prefix rotasyonu + taze init = boş koleksiyon garantisi. ✓                                   
  - NonFungibleToken::new(...) ve LazyOption::new(key, Some(&metadata)) overwrite güvenli. LazyOption yeni prefix'te, CONTRACT_METADATA
  taze yazılıyor. ✓                                                                                                                     
  - #[init(ignore_state)] VM tarafında state_exists kontrolünü atlar; mevcut state'in üstüne yeniden init eder. ✓
                                                                                                                                        
  Sorun/riskler — her biri için kararını istiyorum                                                                                      
                                                                                                                                        
  1) Orfan trie + kilitli storage stake (~6 Ⓝ)                                                                                          
  storage_usage = 607,502 B. Prefix rotasyonundan sonra eski girdiler referanssız kalır ama trie'de durur. NEAR stake olarak ~6 Ⓝ
  kilitlenmiş halde kalır. Bu, toplam 7,357 Ⓝ balance'ının küçük bir dilimi, ama "tam temiz" değil.                                     
  - A. Kabul et, orfan girdiler kalsın. (en hızlı yol)
  - B. Reset'ten sonra owner-only drain_orphan_prefix(prefix: String, max_keys: u32) ekleyip batched temizlik yap. (+1 PR iş)           
                                                                                                                             
  2) Kontratta kilitli olmuş "unutulan" bakiyeler                                                                                       
  trial_pool, commission_pool, user_deposits, aktif upload_sessions (her biri 0.1 Ⓝ), aktif gift_drops (0.15 Ⓝ/link). Reset bu sayaçları
   0'lar — NEAR kaybolmaz, contract balance'ında kalır; ama state'te "kime ait" bilgisi kaybolur. Pre-launch test için probably OK. Yine
   de reset'ten önce withdraw_trial_pool, withdraw_commission_pool çağrılarını çalıştırman daha temiz — böylece o fonlar bilerek owner'a
   dönmüş olur.                                                                                                                         
                  
  3) Hesapta asılı kalan Function-Call Access Key'ler                                                                                   
  Upload session, gift drop, trial invite, onboarding akışları sırasında youtick.near hesabına eklenen FCAK'ler var. Reset bunları
  temizlemez (account-level, state değil). Tehlikesizler (allowance sınırlı + çağırdıkları method'lar state'siz kaldığı için "Upload    
  session not found" vb. hata verip dönerler). Ama kozmetik olarak çirkin ve storage_usage'a eklenti yapıyorlar.
  - Öneri: reset çağrısından hemen sonra near account list-keys youtick.near → FCAK'leri topluca DeleteKey ile kaldır. Tek seferlik     
  işlem.                                                                                                                                
   
  4) web4_static_url ve owner_id                                                                                                        
  Reset taze Contract kuruyor, bu iki alan da sıfırlanır:
  - tokens.owner_id → yeniden set edeceğiz (reset arg'ı olarak owner_id: AccountId alalım).                                             
  - web4_static_url → None olur. Eğer mevcutta custom domain/web4 kullanımı varsa, reset sonrası set_web4_static_url tekrar çağrılmalı. 
  Mainnet'te şu an kullanılıyor mu?                                                                                                     
                                                                                                                                        
  5) Frontend / KMS side-effect'leri
  - Frontend: NEXT_PUBLIC_MARKET_CONTRACT_ID aynı kaldığı için kod değişikliği yok.                                                     
  - KMS: eski encrypted_cid'lere karşılık AES shares hâlâ KV'de. Kontrat state'iyle mantıksal bağı kesildi; erişim verebilecek ticket   
  kalmadığı için pratik risk yok, ama "tam temiz" istiyorsan KV'leri de wipe etmek gerek (ayrı script).                                 
  - Crust/IPFS: eski şifreli segmentler IPFS'te kalır. Zararsız.                                                                        
                                                                
  Kök neden teşhisine dair ek kontrol                                                                                                   
                                                                                                                                        
  Planın doğru sorunu çözdüğünü teyit için nft_total_supply = 0 vs nft_supply_for_owner(novilusio) = 4 durumunu (impossible invariant)  
  tek başına yeterli sinyal kabul ediyorum. "Index out of bounds" bu tutarsızlıktan çıkmasa bile, reset iki koleksiyonu da taze         
  başlattığı için sorun tanım gereği ortadan kalkar. Yani plan, kök neden tam olarak başka bir şey olsa bile ileri doğru sağlam — teşhis
   riskini absorb ediyor.

  Revize edilmiş kesin plan

  1. Kod değişikliği (tek commit):                                                                                                      
     - contracts/nft-ticket/src/lib.rs:
       · StorageKey prefix'leri *8 → *9 rotasyonu (19 tane)                                                                             
       · reset_v11(owner_id: AccountId) -> Self                                                                                         
         #[private] #[init(ignore_state)]                                                                                               
         Body: migrate()'in birebir benzeri ama OldContract.state_read() YOK,                                                           
         tüm alanlar taze default.                                                                                                      
     - contracts/nft-ticket/tests/sandbox.rs:                                                                                           
       · Yeni test: var olan state üstüne deploy + reset → total_supply 0,                                                              
         supply_for_owner 0, sonra mint ettiğinde tutarlı olduğunu doğrula.                                                             
     - Migrate fn'i koru (dokunma), harmless.                                                                                           
                                                                                                                                        
  2. Lokal doğrulama:                                                                                                                   
     - cargo build --release --target wasm32-unknown-unknown                                                                            
     - cargo test (sandbox)                                                                                                             
     - WASM hash'i not al.
                                                                                                                                        
  3. Mainnet execution (SEN — owner key'i sende):                                                                                       
     a. (opsiyonel) withdraw_trial_pool + withdraw_commission_pool                                                                      
     b. scripts/deploy-nft-mainnet.mjs → yeni WASM deploy                                                                               
     c. near call youtick.near reset_v11 '{"owner_id":"youtick.near"}' \                                                                
          --accountId youtick.near --gas 300000000000000                                                                                
     d. (opsiyonel) youtick.near üzerindeki FCAK'leri list-keys + delete-key ile temizle                                                
     e. Smoke test: UploadForm ile 1 free + 1 paid video yükle → mint, event, playback end-to-end.                                      
                                                                                                                                        
  4. Frontend: değişiklik gerekmez.                                                                                                     
                                                                                                                                        
  Onay için sorular                                                                                                                     
   
  Başlamadan kararını istediğim üç şey:                                                                                                 
                  
  1. Orfan storage — A (kabul) mu, B (drain fn ekle) mi?                                                                                
  2. Kilitli bakiye — reset'ten önce withdraw_trial_pool/withdraw_commission_pool çağırayım mı, yoksa atla mı?
  3. Web4 static URL — şu an mainnet'te set edilmiş mi? Öyleyse reset sonrası tekrar set edeceksin, değilse önemsiz.                    
                                                                                                                                        
  Cevapları verdiğinde kod değişikliğine başlıyorum. Bunlardan birini değiştirmek istemiyorsan default'um: 1A, 2 evet (withdraw çağır), 
  3 atla (set edilmemiş varsayımı).                                                                                                     