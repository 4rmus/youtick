import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
    title: 'Bağımsız filmler, belgeseller ve konser kayıtları, biletle',
    description: 'youtick, konser, film ve performans kayıtlarını biletle izlediğin dijital bir gösterim salonu. Şubat 2027’de açılıyor. Sanatçılar şimdiden başvurabilir.',
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
        description: 'Şubat 2027’de açılıyor. Bağımsız filmler, belgeseller ve konser kayıtları, biletle.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'Canlı izleyiciye bakan bir konser sahnesi' }],
    },
};

export default function TurkishHome() {
    return <LandingPage locale="tr" />;
}
