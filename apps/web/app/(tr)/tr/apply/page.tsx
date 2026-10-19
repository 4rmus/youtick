import type { Metadata } from 'next';
import { ApplyPage } from '@/components/apply/ApplyPage';

export const metadata: Metadata = {
    title: 'Sanatçı olarak başvur',
    description: 'Müzisyenler, yönetmenler ve sahne sanatçıları eserlerini youtick’te göstermek için başvurabilir.',
    alternates: { canonical: '/tr/apply', languages: { en: '/apply', tr: '/tr/apply', 'x-default': '/apply' } },
};

export default function TurkishCreatorApplyPage() {
    return <ApplyPage locale="tr" />;
}
