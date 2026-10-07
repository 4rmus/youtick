// VAT attestation for protocol/youtick-market-v2 ("VAT attestation"). The ticket price is
// VAT-inclusive; the signer attests the VAT part for one ticket and the contract checks the
// signature, the key version and the 27% inclusive cap.
import { KeyPair } from 'near-api-js';

export const VAT_DOMAIN = 'youtick.market-v2.vat.v1';
export const MAX_VAT_RATE_BPS = 2_700n;
export const MIN_GROSS_USDC_MICRO = 5_000_000n;
/** The contract rejects an expiry more than one hour ahead; leave room for clock skew. */
export const ATTESTATION_TTL_MS = 10 * 60 * 1000;

export interface VatInput {
    network: string;
    contractId: string;
    ticketId: string;
    publicationId: string;
    grossUsdcMicro: bigint;
    rateBps: bigint;
    keyVersion: number;
    nowMs: number;
}

export interface VatAttestation {
    gross_usdc_micro: string;
    vat_usdc_micro: string;
    expires_at_ms: string;
    key_version: string;
    signature: string;
}

/** True when the contract would accept `vat` for `gross` (VAT-inclusive rate at most 27%). */
export function withinCap(gross: bigint, vat: bigint): boolean {
    return vat >= 0n && vat * (10_000n + MAX_VAT_RATE_BPS) <= gross * MAX_VAT_RATE_BPS;
}

/** VAT contained in a VAT-inclusive price, rounded up so tax is never under-collected. */
export function inclusiveVat(gross: bigint, rateBps: bigint): bigint {
    if (rateBps < 0n || rateBps > MAX_VAT_RATE_BPS) throw new Error('vat_rate_invalid');
    const numerator = gross * rateBps;
    const denominator = 10_000n + rateBps;
    const ceil = (numerator + denominator - 1n) / denominator;
    return withinCap(gross, ceil) ? ceil : numerator / denominator;
}

export function vatMessage(input: {
    network: string; contractId: string; ticketId: string; publicationId: string;
    gross: string; vat: string; expiresAtMs: string; keyVersion: string;
}): string {
    const lines = [VAT_DOMAIN, input.network, input.contractId, input.ticketId, input.publicationId, input.gross, input.vat,
        input.expiresAtMs, input.keyVersion];
    if (lines.some((line) => !line || /[\r\n]/.test(line))) throw new Error('invalid_vat_message');
    return lines.join('\n');
}

function base64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function attestVat(input: VatInput, signer: KeyPair): VatAttestation {
    if (!/^[0-9a-f]{64}$/.test(input.ticketId) || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.publicationId)) {
        throw new Error('invalid_request');
    }
    if (input.grossUsdcMicro < MIN_GROSS_USDC_MICRO) throw new Error('price_below_minimum');
    const vat = inclusiveVat(input.grossUsdcMicro, input.rateBps);
    const attestation = {
        gross_usdc_micro: input.grossUsdcMicro.toString(),
        vat_usdc_micro: vat.toString(),
        expires_at_ms: String(input.nowMs + ATTESTATION_TTL_MS),
        key_version: String(input.keyVersion),
    };
    const message = vatMessage({
        network: input.network, contractId: input.contractId, ticketId: input.ticketId, publicationId: input.publicationId,
        gross: attestation.gross_usdc_micro, vat: attestation.vat_usdc_micro, expiresAtMs: attestation.expires_at_ms,
        keyVersion: attestation.key_version,
    });
    const { signature } = signer.sign(new TextEncoder().encode(message));
    return { ...attestation, signature: base64(signature) };
}
