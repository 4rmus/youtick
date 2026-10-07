import { headers } from 'next/headers';
import { connection } from 'next/server';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { WalletProvider } from '@/components/providers/WalletProvider';
import { PublicTestnetBetaBanner } from '@/components/PublicTestnetBetaBanner';
import { FEATURE_FLAGS } from '@/lib/constants';

/**
 * The document shell shared by the root layouts. Each root layout sets the document language
 * (`app/(site)` English, `app/(tr)` Turkish), so screen readers and CSS case mapping (i → İ) use it,
 * and passes its own font classes, so only Turkish pages preload the latin-ext subset.
 */
export async function RootShell({ lang, fontClassName, children }: {
    lang: 'en' | 'tr'; fontClassName: string; children: React.ReactNode;
}) {
    await connection();
    const cspNonce = (await headers()).get('x-nonce') ?? undefined;
    return (
        <html lang={lang} data-scroll-behavior="smooth">
            <body className={`${fontClassName} min-h-screen bg-black text-white antialiased`}>
                <QueryProvider>
                    {(FEATURE_FLAGS.publicTestnetBeta || FEATURE_FLAGS.publicTestnetVideoV1) && <PublicTestnetBetaBanner />}
                    <WalletProvider cspNonce={cspNonce}>
                        <Navbar />
                        <main>{children}</main>
                    </WalletProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
