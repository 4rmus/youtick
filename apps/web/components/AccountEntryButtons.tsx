'use client';

import { useWallet } from './providers/WalletProvider';
import { Button } from './ui/button';

export function AccountEntryButtons({ walletLabel = 'Connect wallet' }: { walletLabel?: string }) {
    const { connect, connectNearAuth, isReady } = useWallet();
    return <div className="flex flex-wrap gap-2">
        {connectNearAuth && <Button disabled={!isReady} onClick={() => void connectNearAuth()}>Google / Passkey</Button>}
        <Button variant="outline" disabled={!isReady} onClick={() => void connect()}>{walletLabel}</Button>
    </div>;
}
