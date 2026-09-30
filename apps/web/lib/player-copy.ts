export type PlayerLanguage = 'tr' | 'en';
const LANGUAGE_KEY = 'youtick:player-language';
const LANGUAGE_EVENT = 'youtick:player-language-changed';
let selectedLanguage: PlayerLanguage | undefined;

export function playerLanguage(): PlayerLanguage {
    if (selectedLanguage) return selectedLanguage;
    try {
        const value = localStorage.getItem(LANGUAGE_KEY);
        if (value === 'tr' || value === 'en') return value;
    } catch { /* Language selection still works without persistent storage. */ }
    return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
export function setPlayerLanguage(language: PlayerLanguage): void {
    selectedLanguage = language;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Optional preference. */ }
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
}
export function subscribePlayerLanguage(notify: () => void): () => void {
    const changed = (event: StorageEvent) => {
        if (event.key === null || event.key === LANGUAGE_KEY) { selectedLanguage = undefined; notify(); }
    };
    window.addEventListener(LANGUAGE_EVENT, notify);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener(LANGUAGE_EVENT, notify); window.removeEventListener('storage', changed); };
}
export const playerCopy = {
    en: {
        play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute', volume: 'Volume', seek: 'Seek',
        settings: 'Settings', speed: 'Speed', quality: 'Quality', auto: 'Auto', language: 'Language',
        fullscreen: 'Full screen', exitFullscreen: 'Exit full screen', pip: 'Picture in picture',
        loading: 'Loading video', checking: 'Confirming viewing access', retry: 'Try again',
        resume: 'Continue from', restart: 'Start over', back: 'Back 10 seconds', forward: 'Forward 10 seconds',
        verify: 'Verify session', verifying: 'Verifying session…',
        session: 'Verify this device once to watch with your existing ticket.',
        activate: 'Verify this device', checkAgain: 'Check again',
        activationInfo: 'Your ticket is kept. One wallet transaction activates this device for 30 days: 1 yoctoNEAR plus the network fee shown in your wallet. At most 3 devices are active; a fourth replaces the oldest.',
        activationPending: 'The wallet result is not yet confirmed. Check again before sending another transaction.',
        activationUnavailable: 'Device verification is temporarily unavailable. Please try again later.',
        accountChanged: 'The wallet account changed. Reconnect the account that owns this ticket.',
        accessError: 'Your viewing access could not be checked. No purchase is needed to retry this check.',
        legacySession: 'Verify this device to watch your video.', verificationFailed: 'Verification was not completed. Please try again.',
        storage: 'Secure session storage is unavailable. Enable site storage to watch.',
        unsupported: 'This browser cannot play this video. Try an updated browser.',
        denied: 'Your viewing access could not be confirmed. Please try again.',
        network: 'The connection was interrupted. Check your connection and try again.',
        unavailable: 'Playback is temporarily unavailable. Please try again.',
    },
    tr: {
        play: 'Oynat', pause: 'Duraklat', mute: 'Sesi kapat', unmute: 'Sesi aç', volume: 'Ses', seek: 'Videoda ilerle',
        settings: 'Ayarlar', speed: 'Hız', quality: 'Kalite', auto: 'Otomatik', language: 'Dil',
        fullscreen: 'Tam ekran', exitFullscreen: 'Tam ekrandan çık', pip: 'Küçük pencere',
        loading: 'Video yükleniyor', checking: 'İzleme hakkın doğrulanıyor', retry: 'Tekrar dene',
        resume: 'Devam et:', restart: 'Baştan başlat', back: '10 saniye geri', forward: '10 saniye ileri',
        verify: 'Oturumu doğrula', verifying: 'Oturum doğrulanıyor…',
        session: 'Mevcut biletinle izlemek için bu cihazı bir kez doğrula.',
        activate: 'Bu cihazı doğrula', checkAgain: 'Tekrar kontrol et',
        activationInfo: 'Biletin korunur. Tek cüzdan işlemi cihazı 30 gün etkinleştirir: 1 yoctoNEAR ve cüzdanda gösterilen ağ ücreti. En fazla 3 cihaz aktiftir; dördüncü cihaz en eski kaydın yerini alır.',
        activationPending: 'Cüzdan sonucu henüz doğrulanamadı. Yeni işlem göndermeden önce tekrar kontrol et.',
        activationUnavailable: 'Cihaz doğrulaması şu anda kullanılamıyor. Daha sonra tekrar dene.',
        accountChanged: 'Cüzdan hesabı değişti. Bu bilete sahip hesabı yeniden bağla.',
        accessError: 'İzleme hakkın kontrol edilemedi. Bu kontrolü tekrarlamak için satın alma yapman gerekmez.',
        legacySession: 'Videonu izlemek için bu cihazı doğrula.', verificationFailed: 'Doğrulama tamamlanmadı. Tekrar dene.',
        storage: 'Güvenli oturum kaydı kullanılamıyor. İzlemek için site depolamasına izin ver.',
        unsupported: 'Bu tarayıcı videoyu oynatamıyor. Güncel bir tarayıcı dene.',
        denied: 'İzleme hakkın doğrulanamadı. Tekrar dene.',
        network: 'Bağlantı kesildi. İnternet bağlantını kontrol edip tekrar dene.',
        unavailable: 'Video şu anda oynatılamıyor. Tekrar dene.',
    },
};

export function playerTime(seconds: number): string {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(value / 3600);
    return `${hours ? `${hours}:` : ''}${hours ? String(Math.floor(value / 60) % 60).padStart(2, '0') : Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
