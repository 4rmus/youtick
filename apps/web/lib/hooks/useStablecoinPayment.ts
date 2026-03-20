import { useState, useCallback, useRef, useEffect } from 'react';
import {
    type PaymentMethod,
    type ChainId,
    type SwapQuote,
    type SwapStatus,
    getSwapQuote,
    getSwapStatus,
    submitDeposit,
    ONE_CLICK_CONFIG,
} from '@/lib/intents';
import { GetExecutionStatusResponse } from '@defuse-protocol/one-click-sdk-typescript';

/** Maximum time to poll before timing out (5 minutes) */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
/** Number of consecutive API errors before failing */
const MAX_CONSECUTIVE_ERRORS = 10;

interface UseStablecoinPaymentOptions {
    /** Buyer's NEAR account ID */
    accountId: string;
    /** Callback when NEAR arrives in the user's account (swap complete) */
    onSwapComplete?: (nearAmount: string) => void;
    /** Callback on swap failure */
    onSwapFailed?: (error: string) => void;
}

interface UseStablecoinPaymentReturn {
    /** Current swap status */
    status: SwapStatus;
    /** Active quote (if any) */
    quote: SwapQuote | null;
    /** Deposit address to send stablecoins to */
    depositAddress: string | null;
    /** Error message */
    error: string | null;
    /** Start the swap: get a real quote with deposit address */
    initiateSwap: (
        token: PaymentMethod,
        chain: ChainId,
        amountUsdCents: number,
        refundAddress: string,
        refundAddressOverride?: string,
        recipientOverride?: string,
    ) => Promise<SwapQuote | null>;
    /** Notify 1Click of deposit tx hash (optional, speeds up processing) */
    notifyDeposit: (txHash: string) => Promise<void>;
    /** Reset to idle state */
    reset: () => void;
}

export function useStablecoinPayment({
    accountId,
    onSwapComplete,
    onSwapFailed,
}: UseStablecoinPaymentOptions): UseStablecoinPaymentReturn {
    const [status, setStatus] = useState<SwapStatus>('idle');
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [depositAddress, setDepositAddress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);
    const pollStartTimeRef = useRef<number>(0);
    const consecutiveErrorsRef = useRef<number>(0);

    // Store callbacks in refs to avoid stale closures in setInterval.
    // Without this, the interval captures the callback from the render
    // when startPolling was called, missing later state updates.
    const onSwapCompleteRef = useRef(onSwapComplete);
    const onSwapFailedRef = useRef(onSwapFailed);
    useEffect(() => { onSwapCompleteRef.current = onSwapComplete; }, [onSwapComplete]);
    useEffect(() => { onSwapFailedRef.current = onSwapFailed; }, [onSwapFailed]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        consecutiveErrorsRef.current = 0;
    }, []);

    const startPolling = useCallback((address: string, depositMemo?: string) => {
        stopPolling();
        pollStartTimeRef.current = Date.now();
        consecutiveErrorsRef.current = 0;
        console.log('[Swap Polling] Started polling for deposit address:', address);

        pollingRef.current = setInterval(async () => {
            if (!mountedRef.current) {
                stopPolling();
                return;
            }

            // Timeout check
            const elapsed = Date.now() - pollStartTimeRef.current;
            if (elapsed > MAX_POLL_DURATION_MS) {
                console.warn('[Swap Polling] Timed out after', Math.round(elapsed / 1000), 'seconds');
                setStatus('failed');
                setError('Swap timed out. Please check your account balance — if NEAR arrived, try purchasing with NEAR directly.');
                stopPolling();
                onSwapFailedRef.current?.('Swap polling timed out');
                return;
            }

            try {
                const result = await getSwapStatus(address, depositMemo);
                if (!mountedRef.current) return;

                // Reset consecutive error counter on success
                consecutiveErrorsRef.current = 0;

                const elapsedSec = Math.round((Date.now() - pollStartTimeRef.current) / 1000);
                console.log('[Swap Polling]', result.status, '| elapsed:', elapsedSec + 's', '| address:', address.slice(0, 12) + '...');

                switch (result.status) {
                    case GetExecutionStatusResponse.status.SUCCESS: {
                        const amountOut = result.swapDetails?.amountOut;
                        console.log('[Swap Polling] SUCCESS — amountOut:', amountOut, '| formatted:', result.swapDetails?.amountOutFormatted);

                        if (!amountOut || amountOut === '0') {
                            console.warn('[Swap Polling] amountOut missing/zero — caller will poll wNEAR balance');
                        }

                        setStatus('success');
                        stopPolling();
                        // Pass empty string when amountOut unavailable so caller knows to poll balance
                        onSwapCompleteRef.current?.(amountOut || '');
                        break;
                    }
                    case GetExecutionStatusResponse.status.PROCESSING:
                    case GetExecutionStatusResponse.status.KNOWN_DEPOSIT_TX:
                        setStatus('processing');
                        break;
                    case GetExecutionStatusResponse.status.FAILED:
                        setStatus('failed');
                        setError('Swap failed. Your funds will be refunded.');
                        stopPolling();
                        onSwapFailedRef.current?.('Swap execution failed');
                        break;
                    case GetExecutionStatusResponse.status.REFUNDED:
                        setStatus('refunded');
                        setError('Swap was refunded to your address.');
                        stopPolling();
                        onSwapFailedRef.current?.('Swap refunded');
                        break;
                    case GetExecutionStatusResponse.status.INCOMPLETE_DEPOSIT:
                        setError('Incomplete deposit detected. Please send the full amount.');
                        break;
                    // PENDING_DEPOSIT - keep waiting
                }
            } catch (err) {
                consecutiveErrorsRef.current += 1;
                console.error('[Swap Polling] Status check failed (attempt', consecutiveErrorsRef.current + '):', err);

                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    console.error('[Swap Polling] Too many consecutive errors, stopping');
                    if (mountedRef.current) {
                        setStatus('failed');
                        setError('Lost connection to swap service. Please check your account — if NEAR arrived, try purchasing with NEAR directly.');
                        stopPolling();
                        onSwapFailedRef.current?.('Swap status polling failed repeatedly');
                    }
                }
            }
        }, ONE_CLICK_CONFIG.statusPollInterval);
    }, [stopPolling]);

    const initiateSwap = useCallback(async (
        token: PaymentMethod,
        chain: ChainId,
        amountUsdCents: number,
        refundAddress: string,
        refundAddressOverride?: string,
        recipientOverride?: string,
    ): Promise<SwapQuote | null> => {
        setStatus('quoting');
        setError(null);

        try {
            const recipient = recipientOverride || accountId;
            const swapQuote = await getSwapQuote(
                token,
                chain,
                amountUsdCents,
                recipient,
                refundAddress,
                false, // real quote, not dry
                refundAddressOverride,
            );

            if (!mountedRef.current) return null;

            setQuote(swapQuote);
            setDepositAddress(swapQuote.depositAddress);
            setStatus('awaiting_deposit');

            // Start polling for deposit status
            if (swapQuote.depositAddress) {
                startPolling(swapQuote.depositAddress, swapQuote.depositMemo);
            }

            return swapQuote;
        } catch (err) {
            if (!mountedRef.current) return null;
            const msg = err instanceof Error ? err.message : 'Failed to get swap quote';
            setError(msg);
            setStatus('failed');
            return null;
        }
    }, [accountId, startPolling]);

    const notifyDeposit = useCallback(async (txHash: string) => {
        if (!depositAddress) return;

        try {
            await submitDeposit(txHash, depositAddress, accountId, quote?.depositMemo);
            setStatus('processing');
        } catch {
            // Non-critical: swap will still be detected automatically
        }
    }, [depositAddress, accountId, quote]);

    const reset = useCallback(() => {
        stopPolling();
        setStatus('idle');
        setQuote(null);
        setDepositAddress(null);
        setError(null);
    }, [stopPolling]);

    return {
        status,
        quote,
        depositAddress,
        error,
        initiateSwap,
        notifyDeposit,
        reset,
    };
}
