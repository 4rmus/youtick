/**
 * NOVA Cost Estimation Module
 *
 * Dynamic fee queries for Nova group registration costs.
 * Uses sdk.estimateFee('register_group') and sdk.getBalance()
 * with a 10-minute cache to avoid excessive RPC calls.
 */

import { hasApiKey, getNovaSdk } from './config';

/** Fallback fee if estimateFee fails (conservative estimate in NEAR) */
const FALLBACK_REGISTER_GROUP_FEE = 0.70;

/** Cache TTL in milliseconds (10 minutes) */
const CACHE_TTL = 10 * 60 * 1000;

/** Cached fee data */
interface FeeCache {
  feeYocto: bigint;
  feeNear: number;
  timestamp: number;
}

/** Cached balance data */
interface BalanceCache {
  balanceYocto: string;
  balanceNear: number;
  timestamp: number;
}

let feeCache: FeeCache | null = null;
let balanceCache: BalanceCache | null = null;

/** Reuse the shared SDK singleton from config */
const getCostsSdk = getNovaSdk;

/** Summary of Nova fee information */
export interface NovaFeeSummary {
  registerGroupFee: number;
  platformBalance: number;
  canRegister: boolean;
  deficit: number;
}

/**
 * Convert yoctoNEAR string/bigint to NEAR number
 */
function yoctoToNear(yocto: string | bigint): number {
  const str = typeof yocto === 'bigint' ? yocto.toString() : yocto;
  // 1 NEAR = 1e24 yoctoNEAR
  if (str.length <= 24) {
    return parseFloat(`0.${'0'.repeat(24 - str.length)}${str}`);
  }
  const intPart = str.slice(0, str.length - 24);
  const decPart = str.slice(str.length - 24);
  return parseFloat(`${intPart}.${decPart}`);
}

/**
 * Get the register_group fee from Nova SDK (cached for 10 minutes)
 *
 * @returns Fee in NEAR
 */
export async function getRegisterGroupFee(): Promise<number> {
  // Return cached value if still valid
  if (feeCache && Date.now() - feeCache.timestamp < CACHE_TTL) {
    return feeCache.feeNear;
  }

  if (!hasApiKey()) {
    return FALLBACK_REGISTER_GROUP_FEE;
  }

  try {
    const sdk = getCostsSdk();

    const feeYocto: bigint = await sdk.estimateFee('register_group');
    const feeNear = yoctoToNear(feeYocto);

    feeCache = {
      feeYocto,
      feeNear,
      timestamp: Date.now(),
    };

    return feeNear;
  } catch (error: unknown) {
    console.warn('[NOVA Costs] estimateFee failed, using fallback:', error);
    return FALLBACK_REGISTER_GROUP_FEE;
  }
}

/**
 * Get the Nova platform account balance
 *
 * @returns Balance in NEAR
 */
export async function getNovaPlatformBalance(): Promise<number> {
  // Return cached value if still valid
  if (balanceCache && Date.now() - balanceCache.timestamp < CACHE_TTL) {
    return balanceCache.balanceNear;
  }

  if (!hasApiKey()) {
    return 0;
  }

  try {
    const sdk = getCostsSdk();

    const balanceYocto: string = await sdk.getBalance();
    const balanceNear = yoctoToNear(balanceYocto);

    balanceCache = {
      balanceYocto,
      balanceNear,
      timestamp: Date.now(),
    };

    return balanceNear;
  } catch (error: unknown) {
    console.warn('[NOVA Costs] getBalance failed:', error);
    return 0;
  }
}

/**
 * Invalidate the balance cache so next call fetches fresh data from chain.
 * Call this after funding the Nova platform account.
 */
export function invalidateBalanceCache(): void {
  balanceCache = null;
}

/**
 * Check if the Nova platform can register a new group
 *
 * @returns true if balance >= fee * 1.05 (5% safety margin)
 */
export async function canRegisterNewGroup(): Promise<boolean> {
  const [fee, balance] = await Promise.all([
    getRegisterGroupFee(),
    getNovaPlatformBalance(),
  ]);

  const required = fee * 1.05;
  const canRegister = balance >= required;
  return canRegister;
}

/**
 * Get a combined summary of Nova fees and platform balance
 */
export async function getNovaFeeSummary(): Promise<NovaFeeSummary> {
  const [fee, balance] = await Promise.all([
    getRegisterGroupFee(),
    getNovaPlatformBalance(),
  ]);

  const canRegister = balance >= fee * 1.05;
  const deficit = canRegister ? 0 : fee * 1.05 - balance;

  return {
    registerGroupFee: fee,
    platformBalance: balance,
    canRegister,
    deficit,
  };
}
