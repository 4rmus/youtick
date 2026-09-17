'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createNearAuthLab, nearAuthJobHref, nearAuthJobId } from '@/lib/near-auth-lab';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { NearAuthFunding } from '@/components/NearAuthFunding';
import { NearAuthSigning } from '@/components/NearAuthSigning';
import { NearAuthUpload } from '@/components/NearAuthUpload';
import { readFundingReview, type FundingReview } from '@/lib/near-auth-funding';
import type { nearAuthMediaPreflight } from '@/lib/near-auth-media-preflight';
import { readLivepeerPublication, type LivepeerPublication } from '@/lib/livepeer-publication';
import { getDeviceSession, onDeviceSessionCleared, suspendDeviceSession } from '@/lib/device-session';
import { FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import { LivepeerPlayerContent } from './LivepeerPlayer';

export function NearAuthLab({ clientId }: { clientId: string | null }) {
    const [auth] = useState(() => clientId ? createNearAuthLab(clientId) : null);
    const [signedIn, setSignedIn] = useState(false);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [accountCheck, setAccountCheck] = useState<{ accounts: string[]; publicKey: string; blockHeight: number } | null>(null);
    const [fundingReview, setFundingReview] = useState<FundingReview | null>(null);
    const [publicationId, setPublicationId] = useState('');
    const [mediaCheck, setMediaCheck] = useState<Awaited<ReturnType<typeof nearAuthMediaPreflight>> | null>(null);
    const [playback, setPlayback] = useState<{ accountId: string; publication: LivepeerPublication } | null>(null);
    const job = nearAuthJobId(useSearchParams().get('job'));
    const router = useRouter();
    const generation = useRef(0);
    const working = useRef(true);
    const operation = useRef<AbortController | null>(null);
    const checkedAccount = useRef<string | null>(null);
    const autoCheckedJob = useRef<string | null>(null);

    useEffect(() => onDeviceSessionCleared(() => {
        operation.current?.abort();
        checkedAccount.current = null;
        setPlayback(null); setMediaCheck(null); setAccountCheck(null); setFundingReview(null);
        setError('Oturum veya cihaz durumu değişti. Oynatmadan önce yeniden kontrol edin.');
    }), []);

    useEffect(() => {
        if (!auth) return;
        const current = ++generation.current;
        auth.restore().then((value) => {
            if (current === generation.current) { setSignedIn(value); setError(null); }
        }).catch(() => {
            if (current === generation.current) setError('Giriş doğrulanamadı. Lütfen yeniden deneyin.');
        }).finally(() => {
            if (current === generation.current) {
                working.current = false;
                setBusy(false);
            }
        });
        return () => { generation.current += 1; operation.current?.abort(); };
    }, [auth]);

    const run = useCallback(async (action: 'login' | 'redirect' | 'logout' | 'account' | 'funding' | 'media', requestedJob?: string) => {
        if (!auth || working.current) return;
        working.current = true;
        const current = ++generation.current;
        const controller = new AbortController();
        operation.current?.abort();
        operation.current = ['account', 'funding', 'media'].includes(action) ? controller : null;
        setBusy(true);
        setError(null);
        setAccountCheck(null);
        setFundingReview(null);
        setMediaCheck(null);
        setPlayback(null);
        try {
            if (action === 'funding') {
                const result = await readFundingReview();
                if (current === generation.current && !controller.signal.aborted) { setFundingReview(result); setAccountCheck(result); }
                return;
            }
            if (action === 'account' || action === 'media') {
                const publicationId = nearAuthJobId(requestedJob);
                if (action === 'media' && !publicationId) throw new Error('invalid_publication');
                const query = action === 'media' ? `?publication=${encodeURIComponent(publicationId!)}` : '';
                const response = await fetch(`/api/auth-lab/account${query}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
                if (response.status === 401) {
                    if (current === generation.current) setSignedIn(false);
                    throw new Error('session_expired');
                }
                if (!response.ok) throw new Error('account_check_failed');
                const result = await response.json();
                controller.signal.throwIfAborted();
                const accountId = action === 'media' ? result.accountId : result.implicitAccount;
                if (typeof accountId !== 'string' || !/^[a-f0-9]{64}$/.test(accountId)) throw new Error('account_check_failed');
                if (checkedAccount.current && checkedAccount.current !== accountId) {
                    await suspendDeviceSession();
                    return;
                }
                checkedAccount.current = accountId;
                if (current === generation.current) {
                    if (action === 'media') {
                        if (result.publicationId !== publicationId || result.marketContractId !== NEAR_CONFIG.marketContractId) throw new Error('media_changed');
                        setMediaCheck(result);
                        if (result.reason !== 'entitled' || result.entitled !== true) return;
                        if (!FEATURE_FLAGS.publicTestnetVideoV1 || !FEATURE_FLAGS.enablePlaybackAuthorizerV2) throw new Error('playback_disabled');
                        const publication = await readLivepeerPublication(publicationId!);
                        controller.signal.throwIfAborted();
                        if (!publication || publication.publication_id !== publicationId || publication.creator_id !== accountId
                            || publication.generation !== 1 || !['ACTIVE', 'SALES_SUSPENDED'].includes(publication.availability)
                            || result.availability !== publication.availability) throw new Error('creator_playback_unavailable');
                        const device = await getDeviceSession(accountId);
                        controller.signal.throwIfAborted();
                        if (device?.certificate.version !== '3') throw new Error('device_session_required');
                        if (current === generation.current) setPlayback({ accountId, publication });
                    }
                    else setAccountCheck(result);
                }
                return;
            }
            const result = action === 'logout' ? (await auth.logout(), false) : await auth.login(action === 'redirect');
            if (current === generation.current) { setSignedIn(result); setError(null); }
        } catch (reason) {
            if (current !== generation.current) return;
            if (reason instanceof Error && reason.message === 'session_expired') {
                await suspendDeviceSession();
                setSignedIn(false);
            } else if (controller.signal.aborted) return;
            if (current === generation.current && reason instanceof Error && reason.message === 'near_auth_local_logout_complete') {
                setSignedIn(false);
                setError('YouTick deneme oturumundan çıkıldı; sağlayıcının çıkış sayfası açılamadı.');
                return;
            }
            if (current === generation.current && reason instanceof Error && reason.message === 'session_expired') setSignedIn(false);
            if (current === generation.current) setError(action === 'account' || action === 'funding' || action === 'media'
                ? reason instanceof Error && reason.message === 'session_expired'
                    ? 'Deneme oturumu sona erdi. Yeniden giriş yapın.'
                    : action === 'media'
                        ? reason instanceof Error && reason.message === 'device_session_required'
                            ? 'Bu cihazın mevcut yetkisi doğrulanamadı. Yeni cihaz kaydı yapılmadı; aynı cihazla yeniden kontrol edin.'
                            : 'Google hesabının video sahipliği, yayın veya cihaz yetkisi doğrulanamadı. Oynatma başlatılmadı.'
                        : 'Hesap kontrolü tamamlanamadı. Bu, hesabınızın olmadığı anlamına gelmez. Yeniden deneyebilirsiniz.'
                : action === 'logout'
                ? 'Çıkış tamamlanamadı. Lütfen yeniden deneyin.'
                : reason instanceof Error && reason.message === 'near_auth_login_timeout'
                    ? 'Giriş penceresinin süresi doldu. Hazır olduğunuzda yeniden deneyin.'
                : 'Giriş tamamlanamadı. Yeniden deneyin veya yönlendirmeyle devam edin.');
        } finally {
            if (operation.current === controller) operation.current = null;
            if (current === generation.current) {
                working.current = false;
                setBusy(false);
            }
        }
    }, [auth]);

    useEffect(() => {
        operation.current?.abort();
        autoCheckedJob.current = null;
        setPlayback(null); setMediaCheck(null);
        if (job) setPublicationId(job);
    }, [job]);

    useEffect(() => {
        if (!signedIn) { autoCheckedJob.current = null; return; }
        if (!job || busy || autoCheckedJob.current === job) return;
        autoCheckedJob.current = job;
        void run('media', job);
    }, [job, signedIn, busy, run]);

    return (
        <PageShell className="max-w-xl" >
            <section lang="tr" className="space-y-6 rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8 [&_button]:whitespace-normal">
                <div className="space-y-2">
                    <p className="text-sm text-emerald-300">YouTick · Giriş denemesi</p>
                    <h1 className="text-2xl font-bold text-white">Hesabınla devam et</h1>
                    <p className="text-sm leading-6 text-zinc-400">Giriş seçenekleri NEAR Auth ekranında gösterilir. Burada test hesabıyla ilerlersiniz. Ana uygulamanın giriş yöntemi henüz değişmedi.</p>
                </div>
                {!auth ? (
                    <p role="status" className="text-sm text-zinc-300">Giriş denemesi için uygulama ayarı henüz eklenmedi.</p>
                ) : (
                    <div className="space-y-4" aria-busy={busy}>
                        <p role="status" aria-live="polite" className="text-sm text-zinc-300">
                            {busy ? 'Lütfen bekleyin…' : signedIn ? 'Deneme girişi başarılı.' : 'Devam etmek için giriş yapın.'}
                        </p>
                        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
                        {signedIn ? (
                            <>
                                <p className="text-xs leading-5 text-zinc-400">Hesap kontrolü, kimlik referansınızı NEAR testnet sorgu servisine; türetilen açık anahtarı da FastNear hesap aramasına gönderir. E-posta ve giriş tokenı gönderilmez. İmza veya ödeme istenmez.</p>
                                <Button variant="near" className="min-h-11 w-full" disabled={busy} onClick={() => void run('account')}>NEAR hesabını kontrol et</Button>
                                <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => void run('funding')}>Test hesabı hazırlığını göster</Button>
                                {accountCheck && <div role="status" className="space-y-2 break-all text-sm text-zinc-300">
                                    <p>{accountCheck.accounts.length === 0
                                        ? 'Kontrol edilen adreslerde bu anahtara bağlı bir hesap doğrulanamadı. Hesap arama servisi eksik sonuç verebilir.'
                                        : accountCheck.accounts.length === 1
                                            ? 'Bir hesabın anahtarı eşleşti.'
                                            : 'Birden fazla hesabın anahtarı eşleşti. Otomatik hesap seçilmedi.'}</p>
                                    {accountCheck.accounts.map((id) => <p key={id}>{id}</p>)}
                                    <details><summary>Kontrol ayrıntıları</summary><p>{accountCheck.publicKey}</p><p>NEAR blok: {accountCheck.blockHeight}</p></details>
                                    <p className="text-xs">Bu kontrol yalnız hesap ve anahtar eşleşmesini gösterir; imza, izleme veya yükleme testi yapmaz.</p>
                                </div>}
                                {fundingReview && <fieldset disabled={busy}><NearAuthFunding key={fundingReview.publicKey} review={fundingReview}
                                    disabled={busy} onBusyChange={(value) => { working.current = value; setBusy(value); }} /></fieldset>}
                                <NearAuthSigning auth={auth} disabled={busy} onBusyChange={(value) => { working.current = value; setBusy(value); }} />
                                <NearAuthUpload auth={auth} disabled={busy} onBusyChange={(value) => { working.current = value; setBusy(value); }} />
                                <section className="space-y-3 rounded-xl border border-white/15 p-4">
                                    <h2 className="font-semibold">Video hakkını kontrol et</h2>
                                    <p className="text-sm">Google hesabınızın video hakkı kontrol edilir. Kendi videonuzu mevcut cihaz yetkisiyle oynatabilirsiniz; Google veya sponsor cüzdan onayı istenmez.</p>
                                    <label htmlFor="auth-lab-publication" className="block text-sm">Video yayın kimliği</label>
                                    <input id="auth-lab-publication" value={publicationId} maxLength={128} disabled={busy}
                                        className="w-full rounded border border-white/20 bg-transparent p-2"
                                        onChange={(event) => { operation.current?.abort(); setPublicationId(event.target.value); setMediaCheck(null); setPlayback(null); }} />
                                    <Button variant="outline" disabled={busy || !/^[A-Za-z0-9._:-]{1,128}$/.test(publicationId.trim())}
                                        onClick={() => {
                                            const selected = nearAuthJobId(publicationId.trim());
                                            if (!selected) return;
                                            if (job !== selected) router.replace(nearAuthJobHref(selected), { scroll: false });
                                            else void run('media', selected);
                                        }}>Bu video için hakkımı kontrol et</Button>
                                    {mediaCheck && <div role="status" aria-live="polite" className="space-y-2 text-sm">
                                        <p>{{ entitled: 'İzleme hakkı doğrulandı. Oynatma için video sahipliği ve mevcut cihaz yetkisi ayrıca kontrol edilir.',
                                            entitlement_required: 'Son ön kontrolde bu Google hesabının bu video için izleme hakkı bulunmadı. Satın alma sonucu aşağıdaki bölümde ayrıca gösterilir.',
                                            publication_missing: 'Bu sözleşmede video bulunamadı.', takedown: 'Video erişime kapatılmış.',
                                            bridge_frozen: 'Video hizmeti geçici olarak durdurulmuş.' }[mediaCheck.reason]}</p>
                                        <details className="break-all"><summary>Kontrol ayrıntıları</summary>
                                            <p>Hesap: {mediaCheck.accountId}</p><p>Sözleşme: {mediaCheck.marketContractId}</p>
                                            <p>Video: {mediaCheck.publicationId}</p><p>NEAR blok: {mediaCheck.blockHeight}</p>
                                        </details>
                                    </div>}
                                    {playback && <LivepeerPlayerContent accountId={playback.accountId}
                                        jobId={playback.publication.publication_id} generation={playback.publication.generation}
                                        playbackId={playback.publication.playback_id} title={playback.publication.title}
                                        onRetry={() => void run('media', playback.publication.publication_id)} />}
                                </section>
                                {mediaCheck?.reason === 'entitlement_required' && <NearAuthSigning
                                    key={`${mediaCheck.accountId}:${mediaCheck.publicationId}`} auth={auth} publicationId={mediaCheck.publicationId}
                                    disabled={busy} onBusyChange={(value) => { working.current = value; setBusy(value); }} />}
                                <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => void run('logout')}>Deneme oturumundan çık</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="near" className="min-h-11 w-full" disabled={busy} onClick={() => void run('login')}>NEAR Auth ile giriş yap</Button>
                                <Button variant="ghost" className="min-h-11 w-full whitespace-normal" disabled={busy} onClick={() => void run('redirect')}>Pencere açılmıyorsa yönlendirmeyle devam et</Button>
                            </>
                        )}
                        <p className="text-xs leading-5 text-zinc-500">Deneme oturumu en fazla bir saat sürer. Bu süre içinde sayfayı yenileyebilirsiniz.</p>
                    </div>
                )}
            </section>
        </PageShell>
    );
}
