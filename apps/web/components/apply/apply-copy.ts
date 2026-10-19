import type { CreatorApplicationError, CreatorWorkType } from '@/lib/creator-application';

export type ApplyLocale = 'en' | 'tr';

export const CREATOR_APPLICATION_CONTACT = 'contact@youtick.net';

export type ApplyCopy = {
    eyebrow: string;
    title: string;
    intro: string;
    fields: {
        name: string;
        email: string;
        country: string;
        workLink: string;
        workLinkHint: string;
        workType: string;
        plannedRelease: string;
        plannedReleaseHint: string;
        message: string;
        messageHint: string;
        optional: string;
    };
    workTypes: Record<CreatorWorkType, string>;
    consent: string;
    privacyLink: string;
    submit: string;
    sending: string;
    sent: { title: string; body: string };
    unavailable: string;
    errors: Record<CreatorApplicationError, string> & { verification_pending: string };
    back: string;
};

export const applyCopy = {
    en: {
        eyebrow: 'Artist applications',
        title: 'Apply to show your work on youtick',
        intro: 'youtick opens to everyone in February 2027, and we are reading applications from artists who want to show recorded work by ticket. Tell us about your work; a person reads every application and we reply by email within a few working days. Applying does not open an account or commit you to anything.',
        fields: {
            name: 'Name or artist name',
            email: 'Email',
            country: 'Country',
            workLink: 'Link to your work',
            workLinkHint: 'An https link to a channel, portfolio, trailer or press page.',
            workType: 'What would you show?',
            plannedRelease: 'Planned first screening',
            plannedReleaseHint: 'For example: a concert film this winter.',
            message: 'Anything else we should know',
            messageHint: 'Up to 2,000 characters.',
            optional: 'optional',
        },
        workTypes: {
            concert: 'Concert recording',
            film: 'Independent film',
            festival: 'Festival selection',
            other: 'Something else',
        },
        consent: 'youtick may email me about this application. My details are handled as described in the privacy notice.',
        privacyLink: 'Privacy notice',
        submit: 'Send application',
        sending: 'Sending…',
        sent: {
            title: 'Application received',
            body: 'Thank you. We read every application and reply by email; please allow a few working days.',
        },
        unavailable: 'The application form is not available at the moment. Instead, email your name, country and a link to your work to',
        errors: {
            invalid_request: 'Please check the fields: every required field must be filled in, and the link must start with https://.',
            consent_required: 'Please tick the box so we can reply to you.',
            verification_failed: 'The security check did not pass. Please try again.',
            verification_pending: 'Please wait for the security check to finish.',
            rate_limited: 'Too many attempts. Please wait a minute and try again.',
            unavailable: `The application could not be sent. Please try again later or email ${CREATOR_APPLICATION_CONTACT}.`,
        },
        back: 'Back home',
    },
    tr: {
        eyebrow: 'Sanatçı başvuruları',
        title: 'Eserini youtick’te göstermek için başvur',
        intro: 'youtick Şubat 2027’de herkese açılıyor; eserlerinin kayıtlarını biletle göstermek isteyen sanatçılardan başvuru alıyoruz. Bize eserinden bahset; her başvuruyu bir kişi okur ve birkaç iş günü içinde e-postayla dönüş yaparız. Başvuru hesap açmaz ve seni hiçbir şeye bağlamaz.',
        fields: {
            name: 'Ad veya sanatçı adı',
            email: 'E-posta',
            country: 'Ülke',
            workLink: 'Eserine bağlantı',
            workLinkHint: 'Kanal, portfolyo, fragman veya basın sayfası için https bağlantısı.',
            workType: 'Ne göstermek istiyorsun?',
            plannedRelease: 'Planladığın ilk gösterim',
            plannedReleaseHint: 'Örneğin: bu kış bir konser filmi.',
            message: 'Eklemek istediğin başka bir şey',
            messageHint: 'En fazla 2.000 karakter.',
            optional: 'isteğe bağlı',
        },
        workTypes: {
            concert: 'Konser kaydı',
            film: 'Bağımsız film',
            festival: 'Festival seçkisi',
            other: 'Başka bir şey',
        },
        consent: 'youtick bu başvuruyla ilgili bana e-posta gönderebilir. Bilgilerim gizlilik bildiriminde anlatıldığı şekilde işlenir.',
        privacyLink: 'Gizlilik bildirimi',
        submit: 'Başvuruyu gönder',
        sending: 'Gönderiliyor…',
        sent: {
            title: 'Başvurun alındı',
            body: 'Teşekkürler. Her başvuruyu okuyup e-postayla dönüş yapıyoruz; birkaç iş günü sürebilir.',
        },
        unavailable: 'Başvuru formu şu anda kullanılamıyor. Bunun yerine adını, ülkeni ve eserine bir bağlantıyı şu adrese gönder:',
        errors: {
            invalid_request: 'Lütfen alanları kontrol et: zorunlu alanların hepsi dolu olmalı ve bağlantı https:// ile başlamalı.',
            consent_required: 'Sana dönebilmemiz için lütfen kutuyu işaretle.',
            verification_failed: 'Güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
            verification_pending: 'Lütfen güvenlik kontrolünün bitmesini bekle.',
            rate_limited: 'Çok fazla deneme yapıldı. Bir dakika bekleyip tekrar dene.',
            unavailable: `Başvuru gönderilemedi. Lütfen daha sonra tekrar dene veya ${CREATOR_APPLICATION_CONTACT} adresine yaz.`,
        },
        back: 'Ana sayfaya dön',
    },
} as const satisfies Record<ApplyLocale, ApplyCopy>;
