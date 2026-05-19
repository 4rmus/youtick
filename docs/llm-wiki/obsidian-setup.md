---
title: Obsidian Setup
status: live
area: maintenance
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki/index.md
  - docs/llm-wiki/agent-router.md
  - scripts/check-llm-wiki.mjs
  - .githooks/pre-commit
  - .gitignore
---

# Obsidian Setup

## Kisa ozet

Tek source-of-truth ve tek Obsidian vault `docs/llm-wiki/` klasorudur. Repo
disinda ayri bir vault tutulmaz.

## Kural

1. Obsidian'da **sadece** repo icindeki `docs/llm-wiki` klasorunu vault olarak
   ac. Bu klasor hem Obsidian vault'u hem de agent source-of-truth'tur; ikisi
   ayni dosyalardir.
2. AI agentlar ilk olarak [[index|index.md]] ve [[agent-router|agent-router.md]]
   okusun.
3. Is bitince ilgili module card, [[claims|claims.md]] ve [[log|log.md]]
   guncellensin.
4. Wiki sagligi otomatik dogrulanir; manuel calistirmak icin
   `node scripts/check-llm-wiki.mjs`.

## Otomatik dogrulama

Wiki butunlugu iki kapida otomatik kontrol edilir:

- **pre-commit hook**: `docs/llm-wiki/**` veya `scripts/check-llm-wiki.mjs`
  degisen her commit'te `check-llm-wiki.mjs` calisir. Bir kez kurmak icin:
  `sh scripts/setup-hooks.sh`.
- **CI**: `.github/workflows/ci.yml` icindeki `llm-wiki` job'u her PR'da ayni
  kontrolu calistirir; yerel hook atlanirsa CI yakalar.

Kontrol sunlari dogrular: frontmatter alanlari ve degerleri, `sources`
dosyalarinin varligi, `[[wikilink]]` butunlugu, orphan sayfalar, `claims.md`
tablo semasi ve yasakli ifadeler.

## Dis vault neden yok?

- Repo disindaki vault kod degisiklikleriyle birlikte review edilemez.
- Git status/PR icinde gorunmez.
- Agentlar temiz checkout'ta onu bulamaz.
- Ayni bilginin iki yerde tutulmasi drift uretir.

Eski `/Users/arair/obsidian/youtick` dis vault'u emekliye ayrildi. Yeniden bir
dis vault acma; cift kopya = drift.

## Sonraki check

- Yeni bir makinede calismaya baslarken `sh scripts/setup-hooks.sh` calistirildi
  mi kontrol et; aksi halde pre-commit dogrulamasi devrede olmaz.
