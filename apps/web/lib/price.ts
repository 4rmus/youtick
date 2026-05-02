const PRICE_CACHE_KEY = 'near_usd_price';
const PRICE_CACHE_TS_KEY = 'near_usd_price_ts';
/** Max age for cached price before it's considered too stale (15 minutes) */
const PRICE_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function getCachedPrice(): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const cached = localStorage.getItem(PRICE_CACHE_KEY);
        const ts = localStorage.getItem(PRICE_CACHE_TS_KEY);
        if (!cached || !ts) return null;
        const age = Date.now() - parseInt(ts, 10);
        if (age > PRICE_CACHE_MAX_AGE_MS) return null;
        const price = parseFloat(cached);
        return price > 0 ? price : null;
    } catch {
        return null;
    }
}

function setCachedPrice(price: number): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(PRICE_CACHE_KEY, price.toString());
        localStorage.setItem(PRICE_CACHE_TS_KEY, Date.now().toString());
    } catch { /* ignore storage errors */ }
}

import { getProvider, viewContract } from './near';

const PYTH_CONTRACT_ID = 'pyth-oracle.near';
const PYTH_NEAR_USD_PRICE_ID = 'c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750';
/** Max staleness for Pyth price (seconds) */
const PYTH_MAX_STALENESS_S = 60;

interface PythPrice {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
}

/**
 * Fetch NEAR/USD price from Pyth oracle (primary), with CEX fallback chain.
 * Tries: Pyth on-chain → Binance → CoinGecko → CryptoCompare → cached price → hardcoded fallback.
 */
export async function getNearPrice(): Promise<number> {
    // Source 1: Pyth on-chain oracle (most trustworthy, on-chain attestable)
    try {
        const provider = getProvider();
        const pythPrice = await viewContract<PythPrice>(
            provider,
            PYTH_CONTRACT_ID,
            'get_price',
            { price_identifier: PYTH_NEAR_USD_PRICE_ID }
        );
        if (pythPrice?.price && typeof pythPrice.expo === 'number') {
            const price = parseInt(pythPrice.price, 10) * Math.pow(10, pythPrice.expo);
            const ageSec = Math.floor(Date.now() / 1000) - pythPrice.publish_time;
            if (price > 0 && ageSec <= PYTH_MAX_STALENESS_S) {
                setCachedPrice(price);
                return price;
            }
            if (ageSec > PYTH_MAX_STALENESS_S) {
                console.warn(`[Price] Pyth price stale by ${ageSec}s, falling back`);
            }
        }
    } catch (e) {
        console.warn('[Price] Pyth oracle failed:', e);
    }

    // Source 2: Binance (no API key needed, generous rate limits)
    try {
        const res = await fetch(
            'https://api.binance.com/api/v3/ticker/price?symbol=NEARUSDT',
            { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
            const data = await res.json();
            const price = parseFloat(data?.price);
            if (price > 0) {
                setCachedPrice(price);
                return price;
            }
        }
    } catch { /* try next source */ }

    // Source 2: CoinGecko (free tier, often rate-limited)
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd',
            { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
            const data = await res.json();
            const price = data?.near?.usd;
            if (typeof price === 'number' && price > 0) {
                setCachedPrice(price);
                return price;
            }
        }
    } catch { /* try next source */ }

    // Source 3: CryptoCompare (no API key needed)
    try {
        const res = await fetch(
            'https://min-api.cryptocompare.com/data/price?fsym=NEAR&tsyms=USD',
            { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
            const data = await res.json();
            const price = data?.USD;
            if (typeof price === 'number' && price > 0) {
                setCachedPrice(price);
                return price;
            }
        }
    } catch { /* try cache */ }

    // Source 4: localStorage cache (last known good price)
    const cached = getCachedPrice();
    if (cached) {
        console.warn('[Price] All APIs failed, using cached price:', cached);
        return cached;
    }

    // Last resort: hardcoded fallback
    console.warn('[Price] All APIs failed and no cache, using fallback $5.00');
    return 5.00;
}

// IPFS storage is free for pinning via W3Auth
// We only charge gas costs for NEAR transactions
export const STORAGE_COST_PER_GB = 0; // IPFS W3Auth is free

export function calculateStorageFee(fileSizeInBytes: number, nearPrice: number): string {
    // IPFS storage is free - only NEAR gas costs apply
    const fileSizeInGB = fileSizeInBytes / (1024 * 1024 * 1024);
    const costInUSD = fileSizeInGB * STORAGE_COST_PER_GB;

    // Add small buffer (e.g. 5%) to cover fluctuation
    const costWithBuffer = costInUSD * 1.05;

    const costInNear = costWithBuffer / nearPrice;

    // Return formatted string with 4 decimals safely
    return costInNear.toFixed(4);
}

/**
 * Convert NEAR amount to USD
 */
export function nearToUsd(nearAmount: number, nearPrice: number): number {
    return nearAmount * nearPrice;
}

/**
 * Convert USD amount to NEAR
 */
export function usdToNear(usdAmount: number, nearPrice: number): number {
    if (nearPrice <= 0) return 0;
    return usdAmount / nearPrice;
}

/**
 * Format USD amount (cents to display string)
 */
export function formatUsdCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Convert NEAR price (yoctoNEAR string) to USD cents using NEAR/USD price
 */
export function nearYoctoToUsdCents(yoctoNear: string, nearPrice: number): number {
    const nearAmount = parseFloat(yoctoNear) / 1e24;
    return Math.round(nearAmount * nearPrice * 100);
}
