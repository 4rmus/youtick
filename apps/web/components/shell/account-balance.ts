import { NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';

export type AccountBalance = { usdcBalance: string; nearBalanceYocto: string };

/** Wallet USDC and NEAR balances; kept small so the shell does not load the upload client. */
export async function readAccountBalance(accountId: string): Promise<AccountBalance> {
    const provider = getProvider();
    const [usdcBalance, account] = await Promise.all([
        viewContract<string>(provider, NEAR_CONFIG.usdcContractId, 'ft_balance_of', { account_id: accountId }),
        provider.query({ request_type: 'view_account', finality: 'final', account_id: accountId }) as Promise<{ amount: string }>,
    ]);
    return { usdcBalance, nearBalanceYocto: account.amount };
}
