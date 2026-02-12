import { http, createConfig } from 'wagmi';
import { arbitrum, base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

/**
 * Find the real MetaMask provider among multiple injected wallets.
 * HOT wallet and others set isMetaMask=true for compatibility,
 * but only the real MetaMask extension has the `_metamask` property.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMetaMaskProvider(): any {
    if (typeof window === 'undefined') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) return undefined;

    // EIP-5749: multiple providers array (MetaMask + HOT + others)
    if (eth.providers?.length) {
        // Real MetaMask has `_metamask` object, others don't
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mm = eth.providers.find((p: any) => p.isMetaMask && p._metamask);
        if (mm) return mm;
        // Fallback: any provider with isMetaMask but without other wallet flags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return eth.providers.find((p: any) =>
            p.isMetaMask &&
            !p.isBraveWallet &&
            !p.isRabby &&
            !p.isCoinbaseWallet &&
            !p.isTrust
        );
    }

    // Single provider
    if (eth.isMetaMask && eth._metamask) return eth;
    return undefined;
}

export const metaMaskConnector = injected({
    target: {
        id: 'metaMask',
        name: 'MetaMask',
        provider: getMetaMaskProvider,
    },
});

export const wagmiConfig = createConfig({
    chains: [arbitrum, base],
    connectors: [metaMaskConnector],
    transports: {
        [arbitrum.id]: http(),
        [base.id]: http(),
    },
});
