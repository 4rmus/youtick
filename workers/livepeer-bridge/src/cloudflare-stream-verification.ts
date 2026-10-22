// Cloudflare Stream readiness verification (M2-G3 fills this in).
import type { ProviderVerificationResult, VerifyReadyAssetInput } from './media-provider';
import type { CloudflareStreamProvider } from './cloudflare-stream-provider';

export async function verifyStreamReadyAsset(
    _provider: CloudflareStreamProvider,
    _input: VerifyReadyAssetInput,
): Promise<ProviderVerificationResult> {
    throw new Error('provider_verification_incomplete');
}
