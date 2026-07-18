import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { OptionalEvmProvider } from "@/components/providers/OptionalEvmProvider";
import { Navbar } from "@/components/Navbar";
import { LanguageProvider } from "@/components/providers/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { GoogleAnalytics } from "@next/third-parties/google";

const geistSans = Geist({
    subsets: ["latin"],
    variable: "--font-geist-sans",
    display: "swap",
});

const geistMono = Geist_Mono({
    subsets: ["latin"],
    variable: "--font-geist-mono",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: 'YouTick - Ticketed Screenings for Film and Music',
        template: '%s | YouTick',
    },
    description: 'YouTick helps filmmakers, musicians and creative teams sell ticketed screenings for films, concert recordings and special videos with protected playback.',
    keywords: [
        'ticketed video releases',
        'ticketed video access',
        'digital tickets for film',
        'independent film ticketing',
        'documentary streaming tickets',
        'concert recording tickets',
        'concert video tickets',
        'film creator platform',
        'music creator platform',
        'digital ticketed screenings',
        'festival screening',
        'special screening platform',
        'fan access platform',
        'protected playback',
        'digital tickets',
        'independent cinema',
        'music video screening',
    ],
    authors: [{ name: 'YouTick' }],
    creator: 'YouTick',
    publisher: 'YouTick',
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    openGraph: {
        type: 'website',
        locale: 'en_US',
        alternateLocale: 'tr_TR',
        url: 'https://youtick.net',
        siteName: 'YouTick',
        title: 'YouTick - Ticketed Screenings for Film and Music',
        description: 'Sell a film, concert recording or special video as a ticketed screening with protected playback.',
        images: [
            {
                url: 'https://youtick.net/hero_concert.png',
                width: 1024,
                height: 1024,
                alt: 'YouTick digital ticketed screening preview',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'YouTick - Ticketed Screenings for Film and Music',
        description: 'Films, concert recordings and special videos offered as ticketed screenings.',
        images: ['https://youtick.net/hero_concert.png'],
        creator: '@youtick_net',
    },
    category: 'technology',
    metadataBase: new URL('https://youtick.net'),
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="dns-prefetch" href="https://ipfs.io" />
                <link rel="dns-prefetch" href="https://dweb.link" />
                <link rel="dns-prefetch" href="https://4everland.io" />
                <link rel="dns-prefetch" href="https://gateway.lighthouse.storage" />
                <link rel="preconnect" href="https://gateway.lighthouse.storage" crossOrigin="" />
            </head>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
                    <QueryProvider>
                        <OptionalEvmProvider>
                            <LanguageProvider>
                                <WalletProvider>
                                    <div className="min-h-screen bg-background text-foreground">
                                        <Navbar />
                                        <main className="flex-grow">
                                            {children}
                                        </main>
                                    </div>
                                    <LanguageSwitcher />
                                </WalletProvider>
                            </LanguageProvider>
                        </OptionalEvmProvider>
                    </QueryProvider>
                </ThemeProvider>
            </body>
            <GoogleAnalytics gaId="G-4J9W05MW6W" />
        </html>
    );
}
