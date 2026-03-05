'use client';

import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Hex, createPublicClient, http } from 'viem';
import { arbitrum, base, type Chain } from 'wagmi/chains';
import { metaMaskConnector } from './config';
import { useCallback, useEffect, useState } from 'react';
import { ERC20_ABI, EVM_TOKEN_ADDRESSES, ONE_CLICK_TO_EVM_CHAIN } from './constants';
import type { ChainId } from '@/lib/intents';

const EVM_CHAINS: Record<number, Chain> = {
    42161: arbitrum,
    8453: base,
};

interface UseEvmPaymentOptions {
    onSuccess?: (txHash: string) => void;
    onError?: (error: string) => void;
}

interface UseEvmPaymentReturn {
    /** Connect MetaMask */
    connect: () => void;
    /** Send ERC-20 token to deposit address */
    sendToken: (params: {
        tokenSymbol: string;
        depositAddress: string;
        /** Raw amount in smallest token units (e.g. "5670000" for 5.67 USDC) */
        rawAmount: string;
        targetChainId: ChainId;
    }) => Promise<void>;
    /** Whether MetaMask is connected */
    isConnected: boolean;
    /** Connected EVM address */
    evmAddress: string | undefined;
    /** Current chain ID */
    chainId: number | undefined;
    /** Whether a tx is pending */
    isSending: boolean;
    /** Disconnect MetaMask */
    disconnect: () => void;
}

export function useEvmPayment({ onSuccess, onError }: UseEvmPaymentOptions = {}): UseEvmPaymentReturn {
    const { address, isConnected, chainId } = useAccount();
    const { connectAsync } = useConnect();
    const { disconnect } = useDisconnect();
    const { switchChainAsync } = useSwitchChain();
    const { writeContractAsync, data: txHash } = useWriteContract();
    const [isSending, setIsSending] = useState(false);

    const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    useEffect(() => {
        if (isTxConfirmed && txHash) {
            const timer = setTimeout(() => {
                setIsSending(false);
                onSuccess?.(txHash);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isTxConfirmed, txHash, onSuccess]);

    const connect = useCallback(async () => {
        try {
            await connectAsync({ connector: metaMaskConnector });
        } catch (err) {
            onError?.(err instanceof Error ? err.message : 'Failed to connect MetaMask');
        }
    }, [connectAsync, onError]);

    const sendToken = useCallback(async ({
        tokenSymbol,
        depositAddress,
        rawAmount,
        targetChainId,
    }: {
        tokenSymbol: string;
        depositAddress: string;
        rawAmount: string;
        targetChainId: ChainId;
    }) => {
        if (!isConnected || !address) {
            onError?.('MetaMask not connected');
            return;
        }

        const evmChainId = ONE_CLICK_TO_EVM_CHAIN[targetChainId];
        if (!evmChainId) {
            onError?.(`Unsupported chain: ${targetChainId}`);
            return;
        }

        const tokenAddress = EVM_TOKEN_ADDRESSES[tokenSymbol]?.[evmChainId];
        if (!tokenAddress) {
            onError?.(`${tokenSymbol} not available on this chain`);
            return;
        }

        // Use raw amount directly (already in smallest token units from 1Click API)
        const amountBigInt = BigInt(rawAmount);
        const humanReadable = Number(amountBigInt) / 1e6; // USDC/USDT = 6 decimals

        console.log('[EVM sendToken]', {
            tokenSymbol,
            depositAddress,
            rawAmount,
            amountBigInt: amountBigInt.toString(),
            humanReadable: `${humanReadable} ${tokenSymbol}`,
            chain: targetChainId,
            evmChainId,
            tokenAddress,
        });

        // Sanity check: reject absurd amounts (>$100k)
        if (humanReadable > 100_000) {
            onError?.(`Amount too large: ${humanReadable} ${tokenSymbol}. Please check the ticket price.`);
            return;
        }

        setIsSending(true);

        try {
            // Switch chain if needed
            if (chainId !== evmChainId) {
                await switchChainAsync({ chainId: evmChainId });
            }

            // Check ERC-20 balance before sending to show a clear error
            // instead of MetaMask displaying a $15M gas fee on revert
            const chain = EVM_CHAINS[evmChainId];
            if (chain) {
                const publicClient = createPublicClient({ chain, transport: http() });
                const balance = await publicClient.readContract({
                    address: tokenAddress,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                }) as bigint;

                const balanceHuman = Number(balance) / 1e6;
                console.log('[EVM sendToken] Balance check:', {
                    balance: balance.toString(),
                    balanceHuman: `${balanceHuman} ${tokenSymbol}`,
                    required: `${humanReadable} ${tokenSymbol}`,
                    sufficient: balance >= amountBigInt,
                });

                if (balance < amountBigInt) {
                    setIsSending(false);
                    onError?.(
                        `Insufficient ${tokenSymbol} balance on ${chain.name}. ` +
                        `You have ${balanceHuman.toFixed(2)} ${tokenSymbol} but need ${humanReadable.toFixed(2)} ${tokenSymbol}.`
                    );
                    return;
                }
            }

            // Send ERC-20 transfer using raw amount (no parseUnits — avoids double-scaling)
            await writeContractAsync({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [depositAddress as Hex, amountBigInt],
                chainId: evmChainId,
            });
            // txHash will be set via useWriteContract, and useWaitForTransactionReceipt
            // will trigger onSuccess when confirmed
        } catch (err) {
            setIsSending(false);
            const msg = err instanceof Error ? err.message : 'ERC-20 transfer failed';
            onError?.(msg);
        }
    }, [isConnected, address, chainId, switchChainAsync, writeContractAsync, onError]);

    return {
        connect,
        sendToken,
        isConnected,
        evmAddress: address,
        chainId,
        isSending,
        disconnect,
    };
}
