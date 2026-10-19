import type { Metadata } from 'next';
import { NotifyPage } from '@/components/notify/NotifyPage';

export const metadata: Metadata = {
    title: 'Açılış bildirimi',
    description: 'youtick Şubat 2027’de açılıyor. E-posta adresini bırak; açıldığında sana bir kez yazalım.',
    alternates: { canonical: '/tr/notify', languages: { en: '/notify', tr: '/tr/notify', 'x-default': '/notify' } },
};

export default function TurkishOpeningNoticePage() {
    return <NotifyPage locale="tr" />;
}
