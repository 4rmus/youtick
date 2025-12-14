'use client';

import { UploadForm } from '@/components/UploadForm';
import { useLanguage } from '@/components/providers/LanguageContext';

export default function UploadPage() {
    const { t } = useLanguage();

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="w-full space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">{t.upload_page.title}</h1>
                    <p className="text-muted-foreground">
                        {t.upload_page.description}
                    </p>
                </div>

                <UploadForm />
            </div>
        </div>
    );
}
