import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { Navbar } from "@/components/Navbar";
import { LanguageProvider } from "@/components/providers/LanguageContext";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: 'youtick - Decentralized Video Streaming',
    description: 'Experience the future of video streaming on NEAR Protocol.',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                    <LanguageProvider>
                        <WalletProvider>
                            <div className="min-h-screen bg-background text-foreground">
                                <Navbar />
                                <main className="flex-grow">
                                    {children}
                                </main>
                            </div>
                            <div id="wallet-modal-container" />
                        </WalletProvider>
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
