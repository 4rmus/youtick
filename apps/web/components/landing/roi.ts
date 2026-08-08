import type { LandingLocale } from './landing-copy';
import { parseLivepeerPriceUsdc } from '@/lib/usdc';

const MICRO_USDC = 1_000_000n;

export function calculateTicketSplit(ticketPrice: string, ticketCount: bigint) {
    const ticketPriceMicroUsdc = BigInt(parseLivepeerPriceUsdc(ticketPrice));
    const platformPerTicketMicroUsdc = ticketPriceMicroUsdc / 50n;
    const grossMicroUsdc = ticketPriceMicroUsdc * ticketCount;
    const platformMicroUsdc = platformPerTicketMicroUsdc * ticketCount;

    return {
        grossMicroUsdc,
        platformMicroUsdc,
        creatorMicroUsdc: grossMicroUsdc - platformMicroUsdc,
    };
}

export function formatMicroUsdc(value: bigint, locale: LandingLocale): string {
    const whole = value / MICRO_USDC;
    const fraction = (value % MICRO_USDC).toString().padStart(6, '0').replace(/0+$/, '');
    const separator = locale === 'tr' ? ',' : '.';

    return `${whole.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}${fraction ? `${separator}${fraction}` : ''} USDC`;
}
