import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Eserini Yayına Al',
    description: 'Eserini YouTick üzerinde yayına al ve dijital biletle doğrudan izleyicine sun.',
    openGraph: {
        title: 'Eserini Yayına Al | YouTick',
        description: 'Eserini YouTick üzerinde yayına al ve dijital biletle doğrudan izleyicine sun.',
    },
    twitter: {
        title: 'Eserini Yayına Al | YouTick',
        description: 'Eserini YouTick üzerinde yayına al ve dijital biletle doğrudan izleyicine sun.',
    },
};

export default function UploadLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
