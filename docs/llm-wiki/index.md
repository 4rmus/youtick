---
title: YouTick LLM Wiki
status: live
area: index
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki.md
  - docs/llm-wiki/agent-router.md
  - docs/README.md
  - docs/overview.md
---

# YouTick LLM Wiki

Bu klasor, YouTick icin LLM/AI agent tarafindan bakimi yapilacak sade ve kanitli bilgi tabanidir.

Amaci sohbet gecmisini saklamak degil; repo, dokuman, test, log ve canli checklerden cikan bilgiyi agentlar icin hizli okunabilir hale getirmektir.

## Ilk okuma sirasi

1. [[overview|Genel ozet]]
2. [[agent-router|Agent router]]
3. [[source-map|Kaynak haritasi]]
4. Ilgili module card:
   - [[module-cards/frontend|Frontend]]
   - [[module-cards/contracts|Contracts]]
   - [[module-cards/kms|KMS]]
   - [[module-cards/storage|Storage]]
   - [[module-cards/wallet-playback|Wallet playback]]
   - [[module-cards/payments|Payments]]
   - [[module-cards/devops-release|Devops release]]
   - [[module-cards/security|Security]]
5. Ilgili flow:
   - [[flows/upload|Upload akisi]]
   - [[flows/purchase-and-watch|Satin alma ve izleme]]
   - [[flows/gift-and-trial|Gift ve trial]]
   - [[flows/release|Release]]
6. Urun baglami:
   - [[product/positioning|Konumlandirma]]
   - [[product/target-users|Hedef kullanicilar]]
   - [[product/pricing-and-payments|Fiyatlandirma ve odeme]]
7. Riskli iddialar icin [[claims|Claim register]]

## Cevap verirken kural

- Once bu index'i oku.
- Sonra [[agent-router|agent-router.md]] ile ilgili module card'i sec.
- Sadece gerekli kaynak dosyalara in; tum repoyu ilk pass'te okuma.
- Canli durum, deploy, para, security veya launch sorusu varsa repo veya live check ile yeniden dogrula.
- Canli check yapilmadiysa bunu cevapta acik soyle.

## Durum notu

Bu ilk kurulumda repo dokumanlari ve ana kaynak dosyalari okundu. Canli RPC, Worker health veya browser smoke calistirilmadi; bu yuzden canli drift riski olan iddialar [[claims|claims.md]] icinde riskli isaretlendi.

## Bakim sayfalari

- [[schema|Wiki schema ve kurallar]]
- [[agent-router|Agent router]]
- [[obsidian-setup|Obsidian setup]]
- [[log|Append-only ingest log]]
- [[decisions/index|Kararlar]]
- [[audits/open-items|Acik audit maddeleri]]
- [[audits/ui-ux|UI/UX audit]]
- [[audits/security|Security audit]]
- [[operations/freshness|Tazelik raporu]] (`node scripts/wiki-freshness.mjs --write` ile uretilir)
