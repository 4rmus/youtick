/**
 * Unified Signing Module
 *
 * Provides a single interface for message signing with:
 * - PKP-first approach (gas-free, signless)
 * - Silent MPC fallback (no dialog, user doesn't know)
 *
 * This module consolidates the signing logic from UploadForm and IpfsPlayer.
 */

import { lit } from './lit';
import { SessionManager, getCurrentRpcUrl } from './session-manager';

export interface PKPData {
    publicKey: string;
    ethAddress: string;
    tokenId: string;
}

export interface SigningResult {
    signature: string;
    address: string;
    method: 'pkp' | 'mpc';
}

/**
 * Check if user has sufficient balance for MPC signing
 */
async function hasSufficientMPCBalance(accountId: string): Promise<boolean> {
    const sessionManager = new SessionManager(accountId);
    const balance = await sessionManager.getAccountBalance(getCurrentRpcUrl());
    // MPC signing costs ~0.25 NEAR
    return balance >= 0.25;
}

/**
 * Sign a message using PKP (preferred) or MPC (fallback)
 *
 * This function implements silent fallback - if PKP fails,
 * it automatically falls back to MPC without showing any dialog.
 *
 * @param message - Message to sign
 * @param accountId - NEAR account ID
 * @param pkpData - PKP data (optional, will check localStorage if not provided)
 * @param wallet - Wallet for MPC signing (optional, required for MPC fallback)
 * @returns SigningResult with signature, address, and method used
 */
export async function signMessage(
    message: string,
    accountId: string,
    pkpData?: PKPData | null,
    wallet?: any
): Promise<SigningResult> {
    // Try to get PKP from localStorage if not provided
    const effectivePkpData = pkpData ?? getPKPFromStorage(accountId);

    // 1. Try PKP signing first (gas-free)
    if (effectivePkpData) {
        try {
            console.log('[Signing] Attempting PKP signing for:', accountId);

            const result = await lit.signWithPKP(
                effectivePkpData.publicKey,
                effectivePkpData.ethAddress,
                message,
                accountId
            );

            console.log('[Signing] PKP signing successful!');
            return {
                signature: result.signature,
                address: result.address,
                method: 'pkp'
            };
        } catch (error: any) {
            // Silent fallback - just log and continue to MPC
            console.warn('[Signing] PKP signing failed, falling back to MPC silently:', error.message);
        }
    }

    // 2. Fallback to MPC signing (requires gas)
    console.log('[Signing] Using MPC signing for:', accountId);

    if (!wallet) {
        throw new Error('MPC signing requires wallet but none provided');
    }

    // Check balance before MPC call
    const hasBalance = await hasSufficientMPCBalance(accountId);
    if (!hasBalance) {
        throw new Error('Insufficient prepaid balance for MPC signing (requires ~0.25 NEAR)');
    }

    // Import chain signatures for MPC
    const { deriveEthAddress, signWithMPC } = await import('./chain-signatures');

    // Derive ETH address for MPC
    const ethAddress = await deriveEthAddress(accountId, 'lit/pkp-minting');

    // Sign with MPC
    const mpcResult = await signWithMPC(wallet, accountId, 'lit/pkp-minting', message);

    // Reconstruct signature from MPC result
    const { ethers } = await import('ethers');
    const r_val = '0x' + mpcResult.big_r.affine_point.substring(2, 66);
    const s_val = '0x' + mpcResult.s.scalar;
    let v_val = 27;
    if (typeof mpcResult.recovery_id === 'number') {
        v_val = mpcResult.recovery_id + 27;
    }

    // Try both v values to find correct one
    let signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;
    let recoveredAddr = ethers.verifyMessage(message, signature);

    if (recoveredAddr.toLowerCase() !== ethAddress.toLowerCase()) {
        // Try flipped v
        const flippedV = v_val === 27 ? 28 : 27;
        signature = ethers.Signature.from({ r: r_val, s: s_val, v: flippedV }).serialized;
        recoveredAddr = ethers.verifyMessage(message, signature);
    }

    console.log('[Signing] MPC signing successful!');
    return {
        signature,
        address: ethAddress,
        method: 'mpc'
    };
}

/**
 * Helper: Get PKP from localStorage
 */
function getPKPFromStorage(accountId: string): PKPData | null {
    if (typeof window === 'undefined') return null;

    const cached = localStorage.getItem(`lit_pkp_${accountId}`);
    if (cached) {
        try {
            return JSON.parse(cached) as PKPData;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Check if PKP is available for an account
 */
export function hasPKP(accountId: string): boolean {
    return getPKPFromStorage(accountId) !== null;
}

/**
 * Get signing method that will be used
 */
export function getPreferredSigningMethod(accountId: string): 'pkp' | 'mpc' {
    return hasPKP(accountId) ? 'pkp' : 'mpc';
}
