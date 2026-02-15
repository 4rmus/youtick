/**
 * NOVA Cost Estimation Module
 *
 * Dynamic fee queries for Nova group registration and member addition costs.
 * Uses sdk.estimateFee() with a 10-minute cache to avoid excessive RPC calls.
 */

import { hasApiKey, getNovaSdk } from './config';

/** Fallback fee if estimateFee fails (conservative estimate in NEAR) */
const FALLBACK_REGISTER_GROUP_FEE = 0.70;

/** Fallback fee for add_member if estimateFee fails (conservative estimate in NEAR) */
const FALLBACK_ADD_MEMBER_FEE = 0.005;

/** Cache TTL in milliseconds (10 minutes) */
const CACHE_TTL = 10 * 60 * 1000;

/** Cached fee data */
interface FeeCache {
  feeYocto: bigint;
  feeNear: number;
  timestamp: number;
}

let feeCache: FeeCache | null = null;
let addMemberFeeCache: FeeCache | null = null;

/** Reuse the shared SDK singleton from config */
const getCostsSdk = getNovaSdk;

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
    const sdk = await getCostsSdk();

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
 * Get the add_member fee from Nova SDK (cached for 10 minutes)
 *
 * @returns Fee in NEAR
 */
export async function getAddMemberFee(): Promise<number> {
  // Return cached value if still valid
  if (addMemberFeeCache && Date.now() - addMemberFeeCache.timestamp < CACHE_TTL) {
    return addMemberFeeCache.feeNear;
  }

  if (!hasApiKey()) {
    return FALLBACK_ADD_MEMBER_FEE;
  }

  try {
    const sdk = await getCostsSdk();

    const feeYocto: bigint = await sdk.estimateFee('add_member');
    const feeNear = yoctoToNear(feeYocto);

    addMemberFeeCache = {
      feeYocto,
      feeNear,
      timestamp: Date.now(),
    };

    return feeNear;
  } catch (error: unknown) {
    console.warn('[NOVA Costs] estimateFee(add_member) failed, using fallback:', error);
    return FALLBACK_ADD_MEMBER_FEE;
  }
}
