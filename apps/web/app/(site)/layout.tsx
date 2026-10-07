import '../globals.css';
import { Geist, Inter } from 'next/font/google';
import { RootShell } from '@/components/RootShell';
import { siteMetadata } from '@/lib/site-metadata';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const brand = Inter({ subsets: ['latin'], weight: '700', variable: '--font-brand-inter' });

export const metadata = siteMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return <RootShell lang="en" fontClassName={`${geist.variable} ${brand.variable}`}>{children}</RootShell>;
}
