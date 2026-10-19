import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
    title: 'Ticketed screenings of concerts, films and performances',
    description: 'youtick opens in February 2027. Buy a ticket to an artist’s concert, film or recorded performance and watch it in your own time. Artists can apply now.',
    alternates: {
        canonical: '/',
        languages: { en: '/', tr: '/tr', 'x-default': '/' },
    },
    openGraph: {
        type: 'website',
        url: '/',
        locale: 'en_US',
        alternateLocale: ['tr_TR'],
        title: 'youtick — Ticketed digital screenings',
        description: 'Opening February 2027. Concerts, films and recorded performances, by ticket.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'A concert stage facing a live audience' }],
    },
};

export default function Home() {
    return <LandingPage locale="en" />;
}
