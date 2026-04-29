import { actions } from 'near-api-js';
import type {
    EstimateSwapView,
    TokenMetadata,
    Transaction as RheaTransaction,
} from '@ref-finance/ref-sdk';
import { GAS_CONSTANTS, NEAR_CONFIG } from '@/lib/constants';
import { nearAmountToYocto } from '@/lib/near-amount';
import { getNearPrice } from '@/lib/price';

export const RHEA_USDC_CONTRACT_ID = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
export const RHEA_DEFAULT_SLIPPAGE_BPS = 100;

const RHEA_REFERRAL_ID = process.env.NEXT_PUBLIC_RHEA_REFERRAL_ID || undefined;
const YOCTO_PER_NEAR = 10n ** 24n;

type WalletTransaction = {
    receiverId: string;
    actions: ReturnType<typeof actions.functionCall>[];
};

export type RheaNearQuote = {
    amountInNear: string;
    amountOutUsdc: string;
    amountOutUsdcUnits: number;
    minAmountOutUsdcUnits: number;
    priceUsdc: number;
    slippageBps: number;
    tokenIn: TokenMetadata;
    tokenOut: TokenMetadata;
    swapTodos: EstimateSwapView[];
};

type RheaSdk = typeof import('@ref-finance/ref-sdk');

function rheaEnv(): 'mainnet' | 'testnet' {
    return NEAR_CONFIG.networkId === 'testnet' ? 'testnet' : 'mainnet';
}

async function loadRheaSdk(): Promise<RheaSdk> {
    const sdk = await import('@ref-finance/ref-sdk');
    sdk.init_env(rheaEnv());
    return sdk;
}

function formatNearAmount(value: number): string {
    return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function yoctoToNear(yocto: bigint): string {
    const whole = yocto / YOCTO_PER_NEAR;
    const fraction = (yocto % YOCTO_PER_NEAR).toString().padStart(24, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

function tokenDisplayToUnits(amount: string, decimals: number): number {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed * (10 ** decimals));
}

function minOutAfterSlippage(amountUnits: number, slippageBps: number): number {
    return Math.floor(amountUnits * (10_000 - slippageBps) / 10_000);
}

function getEstimatedOut(swapTodos: EstimateSwapView[]): string {
    const total = swapTodos.reduce((sum, todo) => sum + Number(todo.estimate || 0), 0);
    return Number.isFinite(total) ? total.toString() : '0';
}

function toWalletTransactions(transactions: RheaTransaction[]): WalletTransaction[] {
    return transactions.map((transaction) => ({
        receiverId: transaction.receiverId,
        actions: transaction.functionCalls.map((call) => actions.functionCall(
            call.methodName,
            call.args ?? {},
            typeof call.gas === 'bigint' ? call.gas : BigInt(call.gas ?? GAS_CONSTANTS.mediumGas),
            nearAmountToYocto(call.amount ?? '0'),
        )),
    }));
}

export async function quoteNearToUsdc(
    priceUsdc: number,
    slippageBps = RHEA_DEFAULT_SLIPPAGE_BPS,
): Promise<RheaNearQuote> {
    if (!priceUsdc || priceUsdc <= 0) {
        throw new Error('USDC price is required for Rhea quote');
    }

    const sdk = await loadRheaSdk();
    const env = sdk.init_env(rheaEnv());
    const tokenIn: TokenMetadata = {
        id: env.WRAP_NEAR_CONTRACT_ID,
        name: 'Wrapped NEAR',
        symbol: 'wNEAR',
        decimals: 24,
        icon: '',
    };
    const tokenOut = await sdk.ftGetTokenMetadata(RHEA_USDC_CONTRACT_ID).catch(() => ({
        id: RHEA_USDC_CONTRACT_ID,
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
        icon: '',
    } satisfies TokenMetadata));

    const pools = await sdk.fetchAllPools();
    const stablePools = [...(pools.unRatedPools ?? []), ...(pools.ratedPools ?? [])];
    const stablePoolsDetail = stablePools.length > 0 ? await sdk.getStablePools(stablePools) : [];
    const nearUsdPrice = await getNearPrice();

    if (!nearUsdPrice || nearUsdPrice <= 0) {
        throw new Error('NEAR price unavailable for Rhea quote');
    }

    let nearIn = Math.max((priceUsdc / 1_000_000) / nearUsdPrice * 1.03, 0.001);
    let swapTodos: EstimateSwapView[] = [];
    let outUnits = 0;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const amountIn = formatNearAmount(nearIn);
        swapTodos = await sdk.estimateSwap({
            tokenIn,
            tokenOut,
            amountIn,
            simplePools: pools.simplePools ?? [],
            options: {
                enableSmartRouting: true,
                stablePools,
                stablePoolsDetail,
            },
        });

        if (!swapTodos.length) {
            throw new Error('Rhea route unavailable');
        }

        outUnits = tokenDisplayToUnits(getEstimatedOut(swapTodos), tokenOut.decimals);
        if (minOutAfterSlippage(outUnits, slippageBps) >= priceUsdc) {
            return {
                amountInNear: amountIn,
                amountOutUsdc: getEstimatedOut(swapTodos),
                amountOutUsdcUnits: outUnits,
                minAmountOutUsdcUnits: minOutAfterSlippage(outUnits, slippageBps),
                priceUsdc,
                slippageBps,
                tokenIn,
                tokenOut,
                swapTodos,
            };
        }

        if (outUnits <= 0) {
            throw new Error('Rhea quote returned zero output');
        }

        nearIn *= (priceUsdc / outUnits) * 1.02;
    }

    throw new Error('Rhea quote cannot cover ticket price after slippage');
}

export async function ensureRheaStorageTransactions(accountId: string): Promise<WalletTransaction[]> {
    const sdk = await loadRheaSdk();
    const storageBalance = await sdk.ftGetStorageBalance(RHEA_USDC_CONTRACT_ID, accountId);

    if (storageBalance !== null) {
        return [];
    }

    const minStorageBalance = await sdk.getMinStorageBalance(RHEA_USDC_CONTRACT_ID);
    return [{
        receiverId: RHEA_USDC_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'storage_deposit',
                { account_id: accountId, registration_only: true },
                GAS_CONSTANTS.smallGas,
                BigInt(minStorageBalance),
            ),
        ],
    }];
}

export async function buildNearToUsdcSwapTransactions(
    accountId: string,
    quote: RheaNearQuote,
): Promise<WalletTransaction[]> {
    const sdk = await loadRheaSdk();
    const swapTransactions = await sdk.instantSwap({
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        amountIn: quote.amountInNear,
        slippageTolerance: quote.slippageBps / 100,
        swapTodos: quote.swapTodos,
        AccountId: accountId,
        referralId: RHEA_REFERRAL_ID,
    });

    const transactions = [...swapTransactions];
    if (quote.tokenIn.id === sdk.init_env(rheaEnv()).WRAP_NEAR_CONTRACT_ID) {
        let depositYocto = nearAmountToYocto(quote.amountInNear);
        const storageBalance = await sdk.ftGetStorageBalance(quote.tokenIn.id, accountId);

        if (storageBalance === null) {
            depositYocto += BigInt(await sdk.getMinStorageBalance(quote.tokenIn.id));
        }

        transactions.unshift(sdk.nearDepositTransaction(yoctoToNear(depositYocto)));
    }

    return toWalletTransactions(transactions);
}

export function buildUsdcTicketPaymentTransaction(params: {
    buyerId: string;
    encryptedCid: string;
    amount: string;
    paymentId: string;
}): WalletTransaction {
    const msg = JSON.stringify({
        action: 'buy_ticket',
        buyer_id: params.buyerId,
        encrypted_cid: params.encryptedCid,
        payment_id: params.paymentId,
    });

    return {
        receiverId: RHEA_USDC_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'ft_transfer_call',
                {
                    receiver_id: NEAR_CONFIG.contractId,
                    amount: params.amount,
                    msg,
                    memo: 'Youtick ticket purchase',
                },
                GAS_CONSTANTS.mediumGas,
                BigInt(1),
            ),
        ],
    };
}
