import '../globals.css';
import { Geist, Inter } from 'next/font/google';
import { RootShell } from '@/components/RootShell';
import { siteMetadata } from '@/lib/site-metadata';

// Turkish needs latin-ext (ğ, ş, ı, İ); only these pages preload it.
const geist = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-sans' });
const brand = Inter({ subsets: ['latin', 'latin-ext'], weight: '700', variable: '--font-brand-inter' });

export const metadata = siteMetadata;

/** Turkish pages get their own root layout so the document itself is `lang="tr"`. */
export default function TurkishRootLayout({ children }: { children: React.ReactNode }) {
    return <RootShell lang="tr" fontClassName={`${geist.variable} ${brand.variable}`}>{children}</RootShell>;
}
