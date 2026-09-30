import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { FEATURE_FLAGS } from '@/lib/constants';

export const metadata: Metadata = {
    title: 'Bağımsız film ve müzik için biletli gösterimler',
    description: 'Filmini veya konser kaydını dijital bilet ve Livepeer video deneyimiyle doğrudan kendi izleyicine sat.',
    alternates: {
        canonical: '/tr',
        languages: { en: '/', tr: '/tr', 'x-default': '/' },
    },
    openGraph: {
        type: 'website',
        url: '/tr',
        locale: 'tr_TR',
        alternateLocale: ['en_US'],
        title: 'YouTick — Biletli dijital gösterimler',
        description: 'Eseri yükle, bilet fiyatını belirle ve kendi izleyicine doğrudan sat.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'Canlı izleyiciye bakan bir konser sahnesi' }],
    },
};

export default function TurkishHome() {
    return <LandingPage locale="tr" enabled={FEATURE_FLAGS.enablePaidMediaLivepeerV1} />;
}
