'use client';

import { UploadForm } from '@/components/UploadForm';
import { useLanguage } from '@/components/providers/LanguageContext';

export default function UploadPage() {
    const { t } = useLanguage();

    return (
        <div className="container mx-auto px-4 py-20 min-h-screen">
            <UploadForm />
        </div>
    );
}
