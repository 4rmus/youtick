# Livepeer paid-media D6 yürütme paketi v1

Durum: `PREPARED / SOURCE_PINNED / EXECUTION_NOT_AUTHORIZED /
RUNTIME_DISABLED` — 2026-08-04.

Bu paket, kalan D6 testnet çalışmasını tek, sınırlı ve temizlenebilir bir akışa
indirger. Bir deploy, funding, anahtar oluşturma, USDC, Livepeer veya NEAR
mutation izni değildir. Sırlar ve ham provider kimlikleri repoya yazılmaz.

## 1. Kaynak ve CI kilidi

| Alan | Kilitli değer |
|---|---|
| Kaynak commit | `5301d15a5225a86991fce247d001c8c2c145f41f` |
| Git tree | `d188d56cfbed5e42a0aa70d3f2c53013f3edd5b7` |
| Merge | PR #71, squash merge |
| PR head / eşdeğer tree | `86bb06031618d2e1bc76c132983076c8ef2021e1`; aynı git tree |
| PR CI | run `30856878502`, terminal başarılı |
| Main CI | run `30857598523`, `headSha` kaynak commit, terminal başarılı |

Yalnız kaynak committeki Worker, web ve contract kaynakları deploy edilebilir.
Bu paket veya sonraki docs commitleri deploy SHA'sını değiştirmez. Build
başlamadan önce temiz worktree, `HEAD`, `origin/main`, CI `headSha` ve yukarıdaki
SHA eşit okunur; aksi durumda paket geçersizdir.

## 2. Testnet kimlikleri

Sponsor yalnız aşağıdaki fresh alt hesapları oluşturabilir:

| Rol | Hedef hesap |
|---|---|
| Sponsor/funding kaynağı | `youtick-dev-v3.testnet` |
| Market contract | `lp-d6-market-5301d15.youtick-dev-v3.testnet` |
| Access contract | `lp-d6-access-5301d15.youtick-dev-v3.testnet` |
| Bridge operator | `lp-d6-bridge-5301d15.youtick-dev-v3.testnet` |
| Creator ve withdrawal receiver | `lp-d6-creator-5301d15.youtick-dev-v3.testnet` |
| Buyer | `lp-d6-buyer-5301d15.youtick-dev-v3.testnet` |
| Platform withdrawal authority | `lp-d6-platform-5301d15.youtick-dev-v3.testnet` |
| Takedown authority hedefi | `lp-d6-governance-5301d15.youtick-dev-v3.testnet` |
| Testnet USDC | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |

Sponsor hariç her hedef için başlangıç preflight'ı `account does not exist`
olmalıdır. Var olan, farklı code hash taşıyan veya başka key içeren hesap
yeniden kullanılmaz.
Creator ile buyer ayrı kimliktir. Creator withdrawal doğrudan creator hesabına
gider; başka receiver tahmin edilmez.

Takedown authority ancak ayrıca incelenmiş bir 2/3 multisig artefaktı, üç ayrı
signer envanteri ve 24 saatlik timelock kanıtı bu pakete eklenirse kurulabilir.
Repo bugün böyle bir deploy artefaktı içermediği için D6 akışı takedown çağrısı
yapmaz ve D3'ü kapatmaz. Tek anahtarlı governance hesabı 2/3 diye sunulamaz.

Contract initializer bindingleri değişmez:

| Contract | Initializer |
|---|---|
| Market | `new(platform_account_id=platform, bridge_account_id=bridge, takedown_authority_id=governance hedefi)` |
| Access | `new(owner_id=platform, market_contract_id=market, registry_contract_id=market)` |

Governance hedefi oluşturulmasa da geçerli AccountId olarak markete yazılır;
bu, onaylı 2/3 artefaktı gelene kadar takedown'u fail-closed bırakır. Access
contract için ayrı registry deploy edilmez; bu bounded akışta registry rolü
yalnız market hesabına eşitlenir. Primary RPC `https://test.rpc.fastnear.com`,
bağımsız final-state doğrulaması `https://near-testnet.drpc.org` üzerinden
yapılır.

## 3. NEAR key, method ve funding sınırı

Toplam sponsor funding tavanı `8 NEAR` testnet'tir. Hesap başına üst sınırlar:
market `3`, access `2`, bridge `0.5`, creator `0.5`, buyer `0.25`, platform
`0.5` ve governance hazırlığı `0.5 NEAR`; kullanılmayan pay transfer edilmez.

| Key | Receiver | Exact methods | Allowance |
|---|---|---|---|
| Creator job key | market hesabı | `create_paid_job` | `8_000_000_000_000_000_000_000` yoctoNEAR (`0.008 NEAR`) |
| Bridge operator epoch 1 | market hesabı | `finalize_livepeer_publication`, `suspend_livepeer_sales` | en fazla `20_000_000_000_000_000_000_000` yoctoNEAR (`0.02 NEAR`) |

İki key de FunctionCall key'dir; FullAccess yasaktır. Creator job key'i kabul
edilmiş upload intentinden sonra silinir. Wallet çoklu işlem sonucu belirsizse
yerel secret silinmeden zincir key envanteri iki bağımsız RPC'den okunur;
stranded key kapanmadan provider çağrısı yapılmaz. Bridge key rotasyonunda yeni
key aynı receiver/method listesiyle eklenir; eski epoch outbox'ı `CONFIRMED` ve
24 saat rollback süresi dolmadan eski key silinmez.

Play grant, access contracttaki `issue_session_grant` çağrısıdır; deposit `0`,
scope `Play`, resource tek job ID ve TTL en fazla `600_000 ms` olur. Grant key'i
account access key değildir ve secret yalnız browser memory'sinde tutulur.

## 4. Livepeer Sandbox sınırı

- Yalnız daha önce kullanılan izole Sandbox project kullanılabilir; private
  packet project ID hash'ini ve API token adını `d6-5301d15-primary` olarak
  kaydeder. Başlangıç envanteri `0 asset / 0 signing key` değilse durulur.
- En fazla bir asset create, bir opaque TUS resource ve tam `83_886_080` byte
  MP4 kabul edilir. Akış `32 + 32 + 16 MiB`, sequential ve aynı TUS URL'dir.
- Exact 20 GB, ikinci asset, paralel PATCH ve otomatik create retry yasaktır.
- JWT rotasyonunda aynı anda en fazla iki signing key bulunabilir; başlangıç ve
  rotasyon için toplam en fazla iki key create ve iki key delete yapılır. Eski
  ve yeni key doğrulandıktan sonra ikisi de kapanışta silinir.
- Webhook secret için yalnız current/previous 24 saat overlap ve bir rollback
  uygulanabilir. Raw token, secret, asset ID, playback ID veya TUS bearer URL
  log, git, CI artifact ya da ekran kaydına girmez.
- Cleanup sahibi GitHub actor `4rmus`, operasyon rolü `paid-media operator`dır.
  Asset/TUS/key cleanup kanıtı terminal olmadan çalışma tamamlanmış sayılmaz.

## 5. Admission bütçesi

| Worker değişkeni | D6 değeri |
|---|---|
| `LIVEPEER_CREATOR_ALLOWLIST` | yalnız D6 creator hesabı |
| `LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS` | `100000000` (`$100`) |
| `LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS` | `100000000` (`$100`) |

Fresh admission Durable Object'te bu değerler tam bir rezervasyondan sonra
ikinci job'u kapatır. `$100`, Growth minimumunu bütçe girdisi olarak kapsayan
yerel rezervasyondur; provider hard-cap veya gerçek fatura kanıtı değildir.
Global/creator active-job tavanı `1`, UTC günlük create tavanı kodda `2` kalsa
da bu paketin provider mutation tavanı yalnız bir asset create'tir.

## 6. USDC ve withdrawal sınırı

- Creator upload fee: exact `25_166` micro-USDC.
- Ticket price ve buyer transfer tavanı: exact `2_000_001` micro-USDC.
- Creator withdrawal beklenen ve azami tutarı: `1_960_001` micro-USDC.
- Test funding tavanı: creator `1_000_000`, buyer `3_000_000` micro-USDC.
- Platform withdrawal, ikinci purchase, refund ve otomatik refund yasaktır.
- Purchase öncesi/sonrası buyer, creator ledger, platform ledger, market token
  bakiyesi ve withdrawal sonrası creator bakiyesi final block'tan kaydedilir.

## 7. Tek gerçek akış ve tatbikat matrisi

1. Rust `1.86.0` ve `cargo-near 0.17.0` ile exact-SHA market/access build
   hashleri kaydedilir; iki contract test paketi, Livepeer ABI checker, Worker
   test/typecheck ve web lint/test/build geçmeden deploy yapılmaz. Sonra fresh
   contractlar deploy ve initialize edilir. Worker/web flagleri hâlâ kapalıdır.
2. Worker ayrı `youtick-livepeer-bridge-d6-5301d15` adıyla, production route
   olmadan deploy edilir. Önce `LIVEPEER_BRIDGE_ENABLED=false` health ve binding
   kontrolleri geçer.
3. Web tek immutable HTTPS preview olarak aynı SHA'dan build edilir. Preview
   origin Worker allowlist'ine tek değer olarak yazılır; URL evidence dizinine
   kaydedilir. Production `youtick.net` deploy'u yapılmaz.
4. Worker açılır, sonra web flag açılır. Creator tek job oluşturur ve aynı
   TUS resource'a 80 MiB yükler; ready/finalize exact tuple ile doğrulanır.
5. Buyer `2.000001 USDC` öder. Chrome ve Edge ayrı Play grant üretir; anonim,
   malformed, wrong-key, wrong-subject ve expired JWT reddi ile doğru/refresh
   playback aynı asset üzerinde geçer. Token persistent storage'a girmez.
6. Aynı akışta completed TUS `DELETE` sonrası bearer URL süreç bitene kadar
   tutulur; HEAD `404/410` ve PATCH'in başarılı olmaması kaydedilir. Bu terminal
   postcondition yoksa asset silinse bile TUS termination PASS yazılmaz.
7. Provider API, webhook, JWT ve NEAR key rotation overlap/rollback adımları
   runbook sırasıyla uygulanır. Kontrollü provider API ve NEAR RPC outage'ında
   yeni intent/JWT fail-closed olmalı; sağlıklı dönüşte kör mutation olmamalıdır.
8. Creator yalnız beklenen ledger tutarını withdraw eder. Ardından satış
   askıya alınır; takedown, platform withdrawal ve refund çalıştırılmaz.

Her adım tek başına durdurulabilir. Herhangi bir browser/JWT, byte binding,
entitlement, grant, budget, outage veya cleanup hatasında yeni provider/NEAR
mutation durur ve rollback başlar.

## 8. Deploy, rollback ve kapanış kanıtı

Deploy sahibi ve rollback sahibi GitHub actor `4rmus`tur. Private evidence
dizini çalışma başında oluşturulur; izinleri directory `0700`, dosyalar `0600`
olur. Repo/CI yalnız redakte SHA, status, count, amount ve transaction hash
alabilir.

Rollback sırası:

1. web feature flag `false` ve preview erişimi kapalı;
2. Worker `LIVEPEER_BRIDGE_ENABLED=false`;
3. Worker/web önceki disabled deployment sürümüne dönüş;
4. yeni provider mutation yok; mevcut tek resource evidence-bound cleanup;
5. creator ve bridge FunctionCall key envanteri ve outbox kapanışı;
6. contractlar isolated testnet hesaplarında bırakılır; contract rollback veya
   state reset yapılmaz.

Terminal kapanış envanteri şunların tümünü içerir:

- `0 asset / 0 signing key` ve terminal TUS capability;
- creator job key yok; eski/yeni bridge key durumu ve outbox `CONFIRMED`;
- Worker/web deployed version ID, source SHA ve build/artifact hashleri;
- market/access code hashleri ve iki RPC'den final state;
- buyer/creator/platform/market USDC bakiyeleri ve NEAR hesap bakiyeleri;
- Durable Object closure/budget özeti; raw secret veya bearer URL yok.

## Yürütme kapısı

Yürütme ancak main CI run `30857598523` terminal başarılı, private secret ve
account preflight'ları tam, 2/3 kapsamının bu koşuda hariç tutulduğu kabul
edilmiş ve kullanıcı aşağıdaki sınırlı izni açıkça vermişse başlayabilir:

> D6 paket v1'i yalnız belirtilen testnet hesapları, 80 MiB tek asset, $100
> tek-job rezervasyonu, toplam 8 testnet NEAR ve belirtilen USDC tavanlarıyla
> yürütmeyi; exact-SHA Worker/web preview deploy'unu, runtime grant/playback,
> withdrawal, bounded rotation/outage tatbikatlarını ve zorunlu cleanup'ı
> onaylıyorum. Production/public activation, takedown, refund ve 20 GB hariçtir.
