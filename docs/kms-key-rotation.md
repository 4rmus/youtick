# KMS Operator Share Secret Rotation

> `workers/youtick-kms` için `OPERATOR_SHARE_SECRET` rotation prosedürü.
> Sıfır-downtime, 5 operatör bağımsız döndürülebilir.

## Ne Zaman Rotation Yapılır?

| Tetik | Aciliyet | Pencere |
|---|---|---|
| Şüpheli sızıntı (wrangler log'larda secret görülme, CI/CD leak) | 🔴 P0 | 1 saat |
| Operatör çıkışı / anahtar sahibi değişimi | 🟡 P1 | 24 saat |
| Rutin (quarterly best practice) | 🟢 P2 | 1 hafta |

## Güvenlik Modeli Hatırlatma

- Her operatör (a, b, c, d, e) **izole** `OPERATOR_SHARE_SECRET`'a sahip
- Bu secret sadece o operatörün KV'sinde saklanan Shamir share'ini AES-GCM ile şifreler
- Shamir threshold 3 → bir operatör secret rotation'u sırasında offline olsa bile playback çalışır (threshold üstünde 2 yedek)
- Tek bir operatörün secret'ı leak olsa bile saldırgan **threshold'dan az share** görür → video anahtarı rekonstrükte edilemez

**Sonuç:** Rotation'u operatör-operatör, sırayla yapabilirsin. Threshold'u hiç bozmadan.

## Kavram: Dual-Key Window

Worker `decryptShareRecord` fonksiyonu:
1. Önce `OPERATOR_SHARE_SECRET` (yeni) ile dener
2. Başarısızsa ve `OPERATOR_SHARE_SECRET_PREVIOUS` set ise → previous ile dener
3. Başarılı olursa `console.warn('[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS')` log'u basar

Bu log, rotation window'un kapatılabileceği zamanı belirler: log **N gün kaybolursa** (aşağıda Grace Period), PREVIOUS silinebilir.

## Prosedür (Tek Operatör İçin)

Örnek: operator_a için rotation. Diğer 4 operatör için aynı adımlar tekrarlanır (eş zamanlı değil — sıralı).

### Faz 1: Hazırlık

1. **Yeni secret üret** (32+ karakter, yüksek entropi):
   ```bash
   openssl rand -base64 48 | tr -d '\n' > /tmp/new_secret_a.txt
   wc -c /tmp/new_secret_a.txt   # >= 32
   ```
2. **Mevcut secret'ı yedekle** (başarısızlık durumunda geri dönüş için):
   ```bash
   # Mevcut secret listesi (değer gösterilmez, isim kontrolü)
   npx wrangler secret list --env operator_a
   ```
   ⚠️ Mevcut değeri **güvenli bir password manager'a** kaydet (1Password, Bitwarden). Clipboard'da bırakma.

### Faz 2: PREVIOUS'u Set Et (mevcut secret'ı taşı)

```bash
cd workers/youtick-kms

# Mevcut secret'ın değerini PREVIOUS olarak yükle
# (password manager'dan alınan mevcut değer stdin'e pipe ile)
cat /tmp/current_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

Worker bu aşamada her request'te iki secret'a da sahip. Mevcut davranış değişmez — bütün KV entry'leri hâlâ mevcut secret ile şifreli, hepsi ilk denemede çözülür.

### Faz 3: Yeni Secret'ı Deploy Et

```bash
cat /tmp/new_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
```

Bu noktada:
- Worker artık **yeni secret** ile şifreleyip yazıyor (yeni upload'lar için)
- Eski KV entry'leri **eski secret** ile şifreli → yeni ile çözülmüyor → PREVIOUS fallback devreye giriyor
- Log'larda `[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS` görünmeye başlar

### Faz 4: Doğrulama (ilk 10 dakika)

```bash
# Log stream
npx wrangler tail --env operator_a

# Health check
curl -s https://youtick-kms-a.<subdomain>.workers.dev/health
# Beklenen: {"status":"ok"}
```

Browser'dan bir mevcut video oynat → fallback log'u görmelisin, video oynamalı. **Video oynamıyorsa rollback (aşağıda).**

Yeni bir video upload et → fallback log'u görmemelisin (yeni secret ile yazıldı, yeni secret ile okundu). Video oynamalı.

### Faz 5: Grace Period — Fallback Log'unu İzle

Yeni secret'ın tüm KV entry'lerini kapsaması zaman alır. İki strateji:

**Strateji A (pasif, önerilen):** Zamanla organik olarak yeni secret'a geçer.
- Yeni upload'lar → yeni secret
- Eski video'lar → kullanıcı oynatınca fallback devreye girer (log'lanır), ama re-encrypt **edilmez** (worker sadece okur)
- Sonuç: PREVIOUS silemezsin — eski share'ler PREVIOUS olmadan çözülemez hale gelir

⚠️ Strateji A'nın problemi: Eski video'lar hiçbir zaman re-encrypt edilmediği için PREVIOUS silmek mümkün değil.

**Strateji B (aktif re-encrypt, doğru yol):** Explicit re-encrypt job çalıştır.
1. Bir kere çalıştırılacak bir script yaz (`scripts/reencrypt-operator-shares.mjs`)
2. Script tüm KV entry'lerini listeler, her birini okur (fallback ile), yeni secret ile yeniden yazar
3. Çalışma bittikten sonra `wrangler tail`'da fallback log'u 0 olmalı

> ⚠️ **Not:** `scripts/reencrypt-operator-shares.mjs` henüz mevcut değil.
> Strateji B'ye geçmeden önce bu scriptin yazılması ve test edilmesi gerekir.
> Şu an için Strateji A (pasif) veya Strateji C (TTL + hybrid) önerilir.

**Strateji C (hybrid, en pratik):** TTL + aktif re-encrypt.
- Share'lerin KV TTL'i kontrol et: `workers/youtick-kms/src/index.ts` içinde KV put çağrılarına `expirationTtl` verilmişse, doğal çürüme var
- TTL yoksa Strateji B zorunlu

**Grace Period Önerisi:**
- Strateji B kullanılırsa: re-encrypt job bittikten 7 gün sonra + 0 fallback log → PREVIOUS sil
- Strateji C (TTL tabanlı): TTL süresi × 1.1 bekle → PREVIOUS sil
- Hiçbir strateji uygulanmazsa: **PREVIOUS'u asla silme** (dual-key kalıcı)

### Faz 6: PREVIOUS'u Sil (grace period bittiğinde)

```bash
npx wrangler tail --env operator_a --format pretty | grep "OPERATOR_SHARE_SECRET_PREVIOUS"
# Boş çıktı 24 saat → güvenli

npx wrangler secret delete OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

Doğrulama:
```bash
# Startup validasyonu geçmeli
curl -s https://youtick-kms-a.<subdomain>.workers.dev/health
# Log'da "OPERATOR_SHARE_SECRET_PREVIOUS must be at least 32 characters when set" gibi hata OLMAMALI
```

## Rollback

### Faz 3 sonrası (yeni secret deploy edildi, problem çıktı)

```bash
# Mevcut secret'ı (yeni) geri al, previous (eski) secret'ı asıl olarak restore et
cat /tmp/current_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
npx wrangler secret delete OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

Tüm KV entry'leri yine eski secret ile çözülür. Sıfır data loss.

### Faz 6 sonrası (PREVIOUS silindi, eski share çözülemiyor)

Bu senaryo olmamalı — grace period doğru beklendiyse. Ama olursa:
1. PREVIOUS'u yeniden yükle (backup password manager'dan)
2. Faz 5 Strateji B ile re-encrypt çalıştır
3. PREVIOUS'u tekrar sil

## 5 Operatör İçin Tam Akış

```
operator_a: Faz 1-4 → Faz 5 (monitor) → Faz 6
  ↓ (a tamamlandıktan sonra)
operator_b: Faz 1-4 → Faz 5 → Faz 6
  ↓
operator_c: ...
  ↓
operator_d: ...
  ↓
operator_e: ...
```

Paralel yapılmaz. Her operatörün kendi Faz 4 doğrulaması geçmeden sonrakine geçilmez. Tüm rotation 1-2 hafta sürebilir (grace period dahil).

**Neden sıralı?** Shamir threshold 3. Aynı anda 3 operatörde rotation hatası olursa quorum bozulur. Sıralı + tek tek doğrulama → maksimum 1 operatör aynı anda risk altında.

## Monitoring

Rotation sırasında 3 sinyale bak:

| Sinyal | Nerede | Anlam |
|---|---|---|
| `[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS` | `wrangler tail` | Rotation window hâlâ aktif, grace period bitmedi |
| Playback 5xx artışı | Cloudflare Analytics | Rotation hatalı — rollback |
| `/health` 500 | Herhangi bir operatör | Validation failed — secret format problemi |

## Checklist (Her Operatör İçin Kopyala)

```
Operator: operator_X (X = a/b/c/d/e)
- [ ] Yeni secret üretildi (32+ char, openssl rand)
- [ ] Mevcut secret password manager'a yedeklendi
- [ ] Faz 2: PREVIOUS set edildi (mevcut değer)
- [ ] Faz 3: OPERATOR_SHARE_SECRET yeni değer ile güncellendi
- [ ] Faz 4: Health check OK, mevcut video oynuyor, yeni upload/playback OK
- [ ] Faz 5: wrangler tail'da fallback log görülüyor (beklenen)
- [ ] Grace period başlangıç tarihi: ____
- [ ] Re-encrypt stratejisi seçildi: [ ] Pasif / [ ] Aktif B / [ ] Hybrid C
- [ ] Grace period bitişi (Strateji B: 7 gün / Strateji C: TTL×1.1): ____
- [ ] Faz 6: PREVIOUS silindi
- [ ] Rotation log güncellendi: docs/operations/rotation-log.md
```

## Referanslar

- `workers/youtick-kms/src/index.ts` — `decryptShareRecord` (satır ~1090), startup validation (`getWorkerReadiness`, satır ~242-265)
- `workers/youtick-kms/wrangler.toml` — 5 operatör environment tanımları
- `docs/release-runbook.md` §9 — genel secret management
- NIST SP 800-57 Part 1 Rev. 5 — cryptographic key lifecycle (harici referans)
