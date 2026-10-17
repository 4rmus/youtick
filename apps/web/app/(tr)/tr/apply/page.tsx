import type { Metadata } from 'next';
import { ApplyPage } from '@/components/apply/ApplyPage';

export const metadata: Metadata = {
    title: 'Üretici daveti için başvur',
    description: 'Film ve müzik üreticileri eserlerini youtick ile yayınlamak için başvurabilir.',
    alternates: { canonical: '/tr/apply', languages: { en: '/apply', tr: '/tr/apply', 'x-default': '/apply' } },
};

export default function TurkishCreatorApplyPage() {
    return <ApplyPage locale="tr" />;
}
