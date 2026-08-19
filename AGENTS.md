# YouTick LP Codex Sözleşmesi

## Gate ve kapsam

- Her görevde yalnız bir aktif gate seç.
- Başlamadan amaç, değiştirilebilecek dosyalar, yasak dosyalar, kabul kriterleri ve hedef doğrulamalar yaz.
- Gate tamamlanınca raporla ve dur; sonraki gate'e otomatik geçme.

## Sorumluluk ve katılımcılar

- Main agent scope, entegrasyon, conflict resolution ve final doğrulamadan sorumludur.
- Aynı gate'te yalnız bir write-capable katılımcı olabilir.
- Aynı gate'te toplam en fazla üç subagent kullanılabilir; bunlardan biri write-capable ise en fazla iki salt-okunur subagent daha kullanılabilir.

## Güvenli çalışma

- Dirty çalışma alanını ve mevcut kullanıcı değişikliklerini koru; broad reset/restore/clean/stash ve geniş staging kullanma.
- Yalnız explicit-path değişiklik yap.
- Commit, push, PR, merge, CI tekrar çalıştırma ve deploy; ayrıca provider, secret/config, NEAR, D1 ve canlı veri işlemleri açık kullanıcı onayı ister.
- Gerçek deploy yalnız korumalı GitHub workflow'larından yürür.
- Touched-path testlerini `docs/testing.md` içindeki mevcut komutlardan seç.

## Mimari ve kanıt

- NEAR ekonomik/entitlement otoritesidir; Livepeer medya katmanıdır; Bridge kontrol katmanıdır. Bu sınırları bozma.
- Feature flag'lerin kapalı varsayımını değiştirme.
- Yerel test, CI, Preview ve Production kanıtlarını birbirine karıştırma; local/mock/CI sonucu provider, Preview, Production veya canlı runtime kanıtı sayma.
- Kanıt sınıfları: LOCAL_STATIC, LOCAL_TEST, CI, PROVIDER, PREVIEW, PRODUCTION, EXTERNAL_NOT_RUN, UNPROVEN.

## Sonuç

- Final sonuç: PASS / COMPLETED_WITH_WARNINGS / BLOCKED / FAILED.
- Finalde değişen dosyalar, doğrulananlar, çalıştırılmayanlar, blocker ve tek sonraki gate verilir.
