import type { Metadata } from 'next';
import { FaqPage } from '@/components/faq/FaqPage';

export const metadata: Metadata = {
    title: 'Sık sorulan sorular',
    description: 'youtick’te bilet, izleme ve sanatçı başvurusu hakkında kısa yanıtlar.',
    alternates: { canonical: '/tr/faq', languages: { en: '/faq', tr: '/tr/faq', 'x-default': '/faq' } },
};

export default function TurkishFaqRoute() {
    return <FaqPage locale="tr" />;
}
