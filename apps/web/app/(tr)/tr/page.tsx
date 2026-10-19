import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
    title: 'Konserler, filmler ve performanslar için biletli gösterim',
    description: 'youtick Şubat 2027’de açılıyor. Bir sanatçının konserini, filmini ya da performans kaydını kendi biletli gösterim sayfasında, dilediğin zaman izle. Sanatçılar şimdiden başvurabilir.',
    alternates: {
        canonical: '/tr',
        languages: { en: '/', tr: '/tr', 'x-default': '/' },
    },
    openGraph: {
        type: 'website',
        url: '/tr',
        locale: 'tr_TR',
        alternateLocale: ['en_US'],
        title: 'youtick — Biletli dijital gösterimler',
        description: 'Şubat 2027’de açılıyor. Konserler, filmler ve performans kayıtları, biletle.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'Canlı izleyiciye bakan bir konser sahnesi' }],
    },
};

export default function TurkishHome() {
    return <LandingPage locale="tr" />;
}
