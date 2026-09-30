'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';
import { hasLivepeerEntitlement, readLivepeerPublication } from '@/lib/livepeer-publication';
import {
    canStartTicketPurchase,
    purchaseErrorMessage,
    purchaseLivepeerTicket,
    ticketAccessView,
    type TicketPurchaseStep,
} from './ticket-checkout';

export function useTicketCheckout(jobId: string) {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const queryClient = useQueryClient();
    const [busy, setBusy] = React.useState(false);
    const [step, setStep] = React.useState<TicketPurchaseStep | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const publicationQuery = useQuery({
        queryKey: ['livepeerPublication', jobId],
        queryFn: () => readLivepeerPublication(jobId),
        retry: false,
    });
    const entitlementQuery = useQuery({
        queryKey: ['livepeerEntitlement', accountId, jobId],
        queryFn: () => hasLivepeerEntitlement(accountId!, jobId),
        enabled: Boolean(accountId && jobId),
        staleTime: 15_000,
    });
    const paymentPurpose = React.useMemo(() => ({
        type: 'ticket' as const,
        publication_id: jobId,
    }), [jobId]);

    const purchase = async () => {
        const publication = publicationQuery.data;
        if (!canStartTicketPurchase({ accountId, publication, entitlement: entitlementQuery })) return;
        setBusy(true);
        setError(null);
        try {
            await purchaseLivepeerTicket({
                accountId: accountId!,
                jobId,
                publication: publication!,
                purpose: paymentPurpose,
                getWallet,
                onPriceChanged: (current) => queryClient.setQueryData(['livepeerPublication', jobId], current),
                onEntitlementConfirmed: () => queryClient.invalidateQueries({
                    queryKey: ['livepeerEntitlement', accountId, jobId],
                }),
                onStep: setStep,
            });
        } catch (reason) {
            setError(purchaseErrorMessage(reason));
        } finally {
            setBusy(false);
            setStep(null);
        }
    };

    const publication = publicationQuery.data;
    return {
        accountId,
        connect,
        getWallet,
        isReady,
        publicationQuery,
        entitlementQuery,
        paymentPurpose,
        busy,
        step,
        error,
        clearError: () => setError(null),
        purchase,
        accessView: publication
            ? ticketAccessView({ isReady, accountId, availability: publication.availability, entitlement: entitlementQuery })
            : null,
        salesOpen: publication?.availability === 'ACTIVE',
    };
}
