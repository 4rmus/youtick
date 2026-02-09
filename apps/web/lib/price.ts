export async function getNearPrice(): Promise<number> {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd'
        );
        const data = await response.json();
        const price = data?.near?.usd;
        if (typeof price !== 'number' || price <= 0) {
            console.warn('Invalid NEAR price from API, using fallback $5.00');
            return 5.00;
        }
        return price;
    } catch (error) {
        console.warn('Failed to fetch NEAR price, using fallback $5.00');
        return 5.00; // Fallback
    }
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
