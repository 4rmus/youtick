'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CoverImage } from '@/components/media/CoverImage';
import { useWallet } from '@/components/providers/WalletProvider';
import { EmptyState, LoadErrorState } from '@/components/states/states';
import { StateScreen } from '@/components/states/StateScreen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatusLine } from '@/components/ui/status-line';
import { useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { livepeerPublicationCoverUrl } from '@/lib/livepeer-publication';
import { accountReadModelEnabled, readAccountTickets, type AccountTicket } from '@/lib/market-read-model';
import { playerTime } from '@/lib/player-copy';
import { continueWatching, ticketState } from './ticket-model';
import { ThisDevice } from './ThisDevice';
import { useWatchPositions } from './useWatchPositions';

export function TicketsView() {
    const { accountId, connect, isReady } = useWallet();
    const messages = useMessages();
    const t = messages.tickets;

    if (!accountId) {
        return (
            <Page title={t.title}>
                <StateScreen glyph="→" title={t.connectTitle} body={t.connectBody}
                    actions={<Button size="lg" disabled={!isReady} onClick={() => void connect()}>{messages.nav.connect}</Button>} />
            </Page>
        );
    }
    return (
        <Page title={t.title}>
            {accountReadModelEnabled ? <TicketList accountId={accountId} /> : (
                <StateScreen glyph="—" title={t.unavailableTitle} body={t.unavailableBody}
                    actions={<Button asChild variant="outline"><Link href="/">{t.browse}</Link></Button>} />
            )}
            <ThisDevice accountId={accountId} t={t} />
        </Page>
    );
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="container mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-10 px-4 py-12 md:py-16">
            <h1 className="font-display text-6xl md:text-8xl">{title}</h1>
            {children}
        </div>
    );
}

function TicketList({ accountId }: { accountId: string }) {
    const locale = useLocale();
    const messages = useMessages();
    const t = messages.tickets;
    const query = useInfiniteQuery({
        queryKey: ['accountTickets', accountId],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => readAccountTickets(accountId, pageParam, 12),
        getNextPageParam: (page) => page.nextCursor,
        staleTime: 30_000,
        retry: false,
    });
    const tickets = query.data?.pages.flatMap((page) => page.items) ?? [];
    const indexedAtMs = query.data?.pages[0]?.indexedAtMs;
    const positions = useWatchPositions(accountId, tickets);
    const resume = continueWatching(tickets, positions.data ?? new Map());

    if (query.isLoading) return <StatusLine tone="progress">{messages.discover.loading}</StatusLine>;
    if (query.error && tickets.length === 0) return <LoadErrorState onRetry={() => void query.refetch()} />;
    if (tickets.length === 0) {
        return <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<Button asChild variant="outline"><Link href="/">{t.browse}</Link></Button>} />;
    }

    return (
        <div className="flex flex-col gap-12">
            {indexedAtMs && (
                <p className="text-[13px] text-light-3">
                    {t.updated(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(indexedAtMs))}
                </p>
            )}
            {query.error && <StatusLine tone="error">{messages.discover.updateFailed}</StatusLine>}

            {resume.length > 0 && (
                <section aria-labelledby="continue-title" className="flex flex-col gap-5">
                    <h2 id="continue-title" className="label-caps text-ice">{t.continueTitle}</h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {resume.map(({ ticket, position }) => (
                            <Link key={ticket.publicationId} href={`/s/${encodeURIComponent(ticket.publicationId)}`}
                                className="group flex flex-col gap-2.5 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ice">
                                <span className="relative block border border-line">
                                    <CoverImage publicationId={ticket.publicationId} title={ticket.publication.title} src={livepeerPublicationCoverUrl(ticket.publication)} />
                                    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-light/20">
                                        <span className="block h-[3px] bg-ice" style={{ width: `${Math.round((position.position / position.duration) * 100)}%` }} />
                                    </span>
                                </span>
                                <span className="font-display text-2xl leading-none group-hover:text-ice">{ticket.publication.title}</span>
                                <span className="text-[13px] text-ice">{t.continueAt(playerTime(position.position), playerTime(position.duration))}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <section aria-labelledby="all-title" className="flex flex-col gap-5">
                <h2 id="all-title" className="label-caps">{t.allTickets}</h2>
                <ul className="flex flex-col border-t border-line">
                    {tickets.map((ticket) => <TicketRow key={ticket.publicationId} ticket={ticket} t={t} />)}
                </ul>
                {query.hasNextPage && (
                    <div className="flex justify-center">
                        <Button size="lg" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                            {query.isFetchingNextPage ? messages.discover.loadingMore : messages.discover.showMore}
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
}

function TicketRow({ ticket, t }: { ticket: AccountTicket; t: ReturnType<typeof useMessages>['tickets'] }) {
    const publication = ticket.publication;
    const state = publication ? ticketState(publication.availability) : null;
    const body = (
        <>
            <span className="flex min-w-0 flex-col gap-1">
                <span className="font-display truncate text-2xl leading-none">{publication?.title ?? ticket.publicationId}</span>
                <span className="truncate text-[13px] text-light-3">{publication ? publication.creator_id : t.missing}</span>
            </span>
            {state && (
                <Chip tone={state === 'watchable' ? 'onSale' : state === 'paused' ? 'neutral' : 'paused'} className="shrink-0">
                    {state === 'watchable' ? t.watchable : state === 'paused' ? t.salesPaused : t.takenDown}
                </Chip>
            )}
        </>
    );
    const row = 'flex min-h-16 items-center justify-between gap-4 border-b border-line py-3';
    return (
        <li>
            {state && state !== 'removed' ? (
                <Link href={`/s/${encodeURIComponent(ticket.publicationId)}`} className={`${row} hover:text-ice focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ice`}>{body}</Link>
            ) : <div className={row}>{body}</div>}
        </li>
    );
}
