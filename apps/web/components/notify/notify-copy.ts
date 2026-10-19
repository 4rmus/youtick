import type { OpeningNoticeError } from '@/lib/opening-notice';

export type NotifyLocale = 'en' | 'tr';

export const OPENING_NOTICE_CONTACT = 'contact@youtick.net';

export type NotifyCopy = {
    eyebrow: string;
    title: string;
    intro: string;
    email: string;
    consent: string;
    privacyLink: string;
    submit: string;
    sending: string;
    sent: { title: string; body: string };
    unavailable: string;
    errors: Record<OpeningNoticeError, string> & { verification_pending: string };
    back: string;
};

export const notifyCopy = {
    en: {
        eyebrow: 'Opening notice',
        title: 'Hear when youtick opens',
        intro: 'youtick opens to everyone in February 2027. Leave your email address and we will write to you once, when it opens. We will not use your address for anything else, and we delete it 30 days after the opening.',
        email: 'Email',
        consent: 'Email me once when youtick opens. I can withdraw this at any time by writing to contact@youtick.net.',
        privacyLink: 'Privacy notice',
        submit: 'Notify me',
        sending: 'Sending…',
        sent: {
            title: 'Thank you',
            body: 'We will write to you once, when youtick opens.',
        },
        unavailable: 'The sign-up form is not available at the moment. You can write to us instead, and we will tell you when youtick opens:',
        errors: {
            invalid_request: 'Please enter a valid email address.',
            consent_required: 'Please tick the box so we can write to you.',
            verification_failed: 'The security check did not pass. Please try again.',
            verification_pending: 'Please wait for the security check to finish.',
            rate_limited: 'Too many attempts. Please wait a minute and try again.',
            unavailable: `The request could not be sent. Please try again later or email ${OPENING_NOTICE_CONTACT}.`,
        },
        back: 'Back home',
    },
    tr: {
        eyebrow: 'Açılış bildirimi',
        title: 'youtick açıldığında haber al',
        intro: 'youtick Şubat 2027’de herkese açılıyor. E-posta adresini bırak; açıldığında sana bir kez yazalım. Adresini başka hiçbir amaçla kullanmayız ve açılıştan 30 gün sonra sileriz.',
        email: 'E-posta',
        consent: 'youtick açıldığında bana bir kez e-posta gönderilsin. Bu onayı contact@youtick.net adresine yazarak istediğim zaman geri alabilirim.',
        privacyLink: 'Gizlilik bildirimi',
        submit: 'Bana haber ver',
        sending: 'Gönderiliyor…',
        sent: {
            title: 'Teşekkürler',
            body: 'youtick açıldığında sana bir kez yazacağız.',
        },
        unavailable: 'Kayıt formu şu anda kullanılamıyor. Bunun yerine bize yazabilirsin; youtick açıldığında haber veririz:',
        errors: {
            invalid_request: 'Lütfen geçerli bir e-posta adresi gir.',
            consent_required: 'Sana yazabilmemiz için lütfen kutuyu işaretle.',
            verification_failed: 'Güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
            verification_pending: 'Lütfen güvenlik kontrolünün bitmesini bekle.',
            rate_limited: 'Çok fazla deneme yapıldı. Bir dakika bekleyip tekrar dene.',
            unavailable: `İstek gönderilemedi. Lütfen daha sonra tekrar dene veya ${OPENING_NOTICE_CONTACT} adresine yaz.`,
        },
        back: 'Ana sayfaya dön',
    },
} as const satisfies Record<NotifyLocale, NotifyCopy>;
