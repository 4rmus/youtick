import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Publish Your Work',
    description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    openGraph: {
        title: 'Publish Your Work | YouTick',
        description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    },
    twitter: {
        title: 'Publish Your Work | YouTick',
        description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    },
};

export default function UploadLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
