export async function getNearPrice(): Promise<number> {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd'
        );
        const data = await response.json();
        return data.near.usd;
    } catch (error) {
        console.warn('Failed to fetch NEAR price, using fallback $5.00');
        return 5.00; // Fallback
    }
}

export const LIGHTHOUSE_STORAGE_COST_PER_GB = 4.00; // $4 per GB

export function calculateStorageFee(fileSizeInBytes: number, nearPrice: number): string {
    const fileSizeInGB = fileSizeInBytes / (1024 * 1024 * 1024);
    const costInUSD = fileSizeInGB * LIGHTHOUSE_STORAGE_COST_PER_GB;

    // Add small buffer (e.g. 5%) to cover fluctuation
    const costWithBuffer = costInUSD * 1.05;

    const costInNear = costWithBuffer / nearPrice;

    // Return formatted string with 4 decimals safely
    return costInNear.toFixed(4);
}
