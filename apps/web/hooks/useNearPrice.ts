import { useQuery } from '@tanstack/react-query';
import { getNearPrice } from '@/lib/price';

/**
 * Cached NEAR/USD price hook.
 * Refreshes every 60 seconds, stale after 30s.
 */
export function useNearPrice() {
    const { data: nearPrice = 0 } = useQuery({
        queryKey: ['nearPrice'],
        queryFn: getNearPrice,
        staleTime: 2 * 60_000,      // fresh for 2 min
        gcTime: 10 * 60_000,         // keep in cache 10 min
        refetchInterval: 3 * 60_000, // refetch every 3 min
    });

    /** Convert yoctoNEAR string to USD display string */
    const yoctoToUsd = (yoctoNear: string): string => {
        if (!yoctoNear || yoctoNear === '0' || nearPrice <= 0) return '$0.00';
        const near = parseFloat(yoctoNear) / 1e24;
        return `$${(near * nearPrice).toFixed(2)}`;
    };

    /** Convert NEAR number to USD display string */
    const nearToUsdStr = (near: number): string => {
        if (near <= 0 || nearPrice <= 0) return '$0.00';
        return `$${(near * nearPrice).toFixed(2)}`;
    };

    return { nearPrice, yoctoToUsd, nearToUsdStr };
}
