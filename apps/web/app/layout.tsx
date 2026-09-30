import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { WalletProvider } from '@/components/providers/WalletProvider';
import { PublicTestnetBetaBanner } from '@/components/PublicTestnetBetaBanner';
import { FEATURE_FLAGS } from '@/lib/constants';
import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { resolveLocale } from '@/lib/i18n/locale';

const archivo = Archivo({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--font-archivo' });

export const metadata: Metadata = {
    title: { default: 'YouTick', template: '%s | YouTick' },
    description: 'Ticketed digital screenings for independent film and music.',
    metadataBase: new URL('https://youtick.net'),
    robots: FEATURE_FLAGS.publicTestnetBeta ? { index: false, follow: false } : undefined,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    await connection();
    const cspNonce = (await headers()).get('x-nonce') ?? undefined;
    const locale = resolveLocale((await headers()).get('accept-language'));
    return (
        <html lang={locale} className={archivo.variable} data-scroll-behavior="smooth">
            <body className="min-h-screen bg-black text-white antialiased">
                <I18nProvider initialLocale={locale}>
                <QueryProvider>
                    {(FEATURE_FLAGS.publicTestnetBeta || FEATURE_FLAGS.publicTestnetVideoV1) && <PublicTestnetBetaBanner />}
                    <WalletProvider cspNonce={cspNonce}>
                        <Navbar />
                        <main>{children}</main>
                    </WalletProvider>
                </QueryProvider>
                </I18nProvider>
            </body>
        </html>
    );
}
