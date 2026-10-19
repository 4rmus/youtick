import type { Metadata } from 'next';
import { NotifyPage } from '@/components/notify/NotifyPage';

export const metadata: Metadata = {
    title: 'Opening notice',
    description: 'youtick opens in February 2027. Leave your email and we will write to you once, when it opens.',
    alternates: { canonical: '/notify', languages: { en: '/notify', tr: '/tr/notify', 'x-default': '/notify' } },
};

export default function OpeningNoticePage() {
    return <NotifyPage locale="en" />;
}
