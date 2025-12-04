'use client';

import { UploadForm } from '@/components/UploadForm';

export default function UploadPage() {
    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Upload Content</h1>
                    <p className="text-muted-foreground">
                        Encrypt, upload to IPFS, and monetize your content with NFT gating.
                    </p>
                </div>

                <UploadForm />
            </div>
        </div>
    );
}
