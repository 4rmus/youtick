"use client";

import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { utils, providers, transactions } from 'near-api-js';

export function GasTank() {
    const { selector, accountId } = useWallet();
    const [balance, setBalance] = useState<string>('0');
    const [loading, setLoading] = useState(false);

    const fetchBalance = async () => {
        if (!selector || !accountId) return;
        try {
            const provider = new providers.JsonRpcProvider({ url: selector.options.network.nodeUrl });
            const res = await provider.query({
                request_type: 'call_function',
                account_id: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!,
                method_name: 'get_user_balance',
                args_base64: Buffer.from(JSON.stringify({ account_id: accountId })).toString('base64'),
                finality: 'final',
            }) as any;

            const bal = JSON.parse(Buffer.from(res.result).toString());
            setBalance(utils.format.formatNearAmount(bal, 2));
        } catch (e) {
            console.error("Failed to fetch gas tank balance:", e);
        }
    };

    useEffect(() => {
        fetchBalance();
    }, [selector, accountId]);

    const handleDeposit = async () => {
        if (!selector) return;
        setLoading(true);
        try {
            const wallet = await selector.wallet();

            const depositAmount = utils.format.parseNearAmount('1')!;

            // Use raw action object to avoid "Enum key" error with MyNearWallet
            const action = {
                functionCall: {
                    methodName: 'deposit_funds',
                    args: [], // Empty args
                    gas: BigInt('30000000000000'), // 30 TGas
                    deposit: BigInt(depositAmount)
                }
            };

            // Deposit 1 NEAR
            await wallet.signAndSendTransaction({
                receiverId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!,
                actions: [action as any]
            });
            await fetchBalance();
        } catch (e) {
            console.error("Deposit failed:", e);
        } finally {
            setLoading(false);
        }
    };

    if (!accountId) return null;

    return (
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 mb-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-medium text-zinc-400">Prepaid Gas Tank</h3>
                    <p className="text-2xl font-bold text-white">{balance} NEAR</p>
                </div>
                <button
                    onClick={handleDeposit}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {loading ? 'Depositing...' : 'Top Up (1 NEAR)'}
                </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
                Funds in this tank are used for automatic transactions (like minting) without popups.
            </p>
        </div>
    );
}
