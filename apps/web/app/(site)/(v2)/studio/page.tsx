import { PageShell } from '@/components/PageShell';
import { UploadForm } from '@/components/v2/UploadForm';

export const metadata = { title: 'Upload a screening', robots: { index: false, follow: false } };

// V2 creator upload through NEAR Auth (roadmap E5b.4). `/upload` stays the V1 wallet page.
export default function StudioPage() {
    return <PageShell><UploadForm /></PageShell>;
}
