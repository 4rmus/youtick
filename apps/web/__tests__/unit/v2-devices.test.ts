import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { hexDecode } from '@/lib/crypto/codec';
import { NEAR_AUTH_PROVIDERS } from '@/lib/near-auth/config';
import { deriveRootKey, ticketKey } from '@/lib/ticket-keys/keys';
import type { V2Config } from '@/lib/v2/config';
import type { DeviceKey } from '@/lib/v2/device-key';
import { CONFIRM_DELAYS_MS, DEVICE_LINK_ENABLED, deviceLinkErrorMessage, deviceLinkFromEnv, devicePlan, linkDevice, RENEW_WITHIN_MS } from '@/lib/v2/devices';
import { parseTicket, type MarketTicket, type TicketDevice } from '@/lib/v2/tickets';
import { DEVICE_LINK_HINT, DeviceLink, evictionNotice } from '@/components/v2/DeviceLink';
import { linkedUntilNotice, TicketDeviceArea, UNLINKED_DEVICE_NOTICE } from '@/components/v2/MyTickets';

vi.unmock('near-api-js');

const DAY = 24 * 60 * 60 * 1000;
const { fixture } = vectors;
const NOW = Number(fixture.issued_at_ms);
const RELAYER = 'https://relayer.youtick.test';
const config: V2Config = {
    auth: { network: 'testnet', clientId: 'client-1', provider: NEAR_AUTH_PROVIDERS.testnet! },
    marketContractId: fixture.contract_id, gateAccountId: 'ckd-gate.youtick.testnet', relayerUrl: RELAYER,
    bridgeUrl: 'https://bridge.youtick.test', paymentServiceUrl: null,
};
const key = ticketKey(deriveRootKey(hexDecode(vectors.key_derivation.ckd_key_hex)), 0);
const purchaseSession = vectors.purchase.msg.device.session_public_key;
const secondSession = vectors.calls.add_device_args.session_public_key;

function deviceKey(sessionPublicKey: string): DeviceKey {
    return { sessionPublicKey, certificate: '{}', certificateSha256: fixture.certificate_sha256, sign: async () => '' };
}

function device(session: string, authorizedAtMs: number): TicketDevice {
    return { session_public_key: session, certificate_sha256: fixture.certificate_sha256, authorized_at_ms: String(authorizedAtMs), expires_at_ms: String(authorizedAtMs + 30 * DAY) };
}

function ticket(devices: TicketDevice[], epoch = 0): MarketTicket {
    return parseTicket({
        ticket_id: key.ticketId, ticket_public_key: key.publicKey, publication_id: fixture.publication_id, creator_id: fixture.creator_id,
        rail: 'card', status: 'watched', gross_usdc_micro: '5000000', purchased_at_ms: String(NOW - 40 * DAY), device_epoch: epoch, devices,
    }, key.ticketId)!;
}

/** A Market whose ticket reads come from `reads` in order (the last one repeats). */
function chain(reads: MarketTicket[]) {
    const view = vi.fn(async (contractId: string, method: string, args: Record<string, unknown>) => {
        expect([contractId, method, args]).toEqual([fixture.contract_id, 'get_ticket', { ticket_id: key.ticketId }]);
        return structuredClone(reads.length > 1 ? reads.shift() : reads[0]);
    });
    return view as unknown as Parameters<typeof linkDevice>[0]['deps']['view'];
}

function relayer(responses: Array<[number, unknown]>) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        expect(init).toMatchObject({ method: 'POST', credentials: 'omit' });
        const [status, body] = responses.shift() ?? [500, {}];
        return Response.json(body, { status });
    });
    return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const ID = 'f'.repeat(64);

describe('device plan', () => {
    it('watches a device listed for more than seven days, renews one that expires sooner and links an unlisted one', () => {
        const fresh = device(secondSession, NOW - DAY);
        expect(devicePlan(ticket([fresh]), secondSession, NOW)).toEqual({ kind: 'watch', expiresAtMs: NOW + 29 * DAY });
        const expiring = device(secondSession, NOW - 23 * DAY - 1);
        expect(devicePlan(ticket([expiring]), secondSession, NOW)).toEqual({ kind: 'renew', expiresAtMs: NOW + 7 * DAY - 1 });
        expect(devicePlan(ticket([device(secondSession, NOW - 30 * DAY)]), secondSession, NOW)).toEqual({ kind: 'link', evicts: null });
        expect(devicePlan(ticket([fresh]), purchaseSession, NOW)).toEqual({ kind: 'link', evicts: null });
        expect(RENEW_WITHIN_MS).toBe(7 * DAY);
    });

    it('names the oldest active device a fourth link replaces, ignoring expired ones', () => {
        const [a, b, c] = ['ed25519:A', 'ed25519:B', 'ed25519:C'].map((session, index) => device(session, NOW - (3 - index) * DAY));
        const expired = device('ed25519:E', NOW - 31 * DAY);
        expect(devicePlan(ticket([expired, a, b]), secondSession, NOW)).toEqual({ kind: 'link', evicts: null });
        expect(devicePlan(ticket([expired, a, b, c]), secondSession, NOW)).toEqual({ kind: 'link', evicts: a });
        // A renewal never evicts: the device is already one of the three.
        expect(devicePlan(ticket([a, b, device(secondSession, NOW - 24 * DAY)]), secondSession, NOW).kind).toBe('renew');
    });

    it('is off unless the build sets the flag to true', () => {
        expect(deviceLinkFromEnv(undefined)).toBe(false);
        expect(deviceLinkFromEnv('1')).toBe(false);
        expect(deviceLinkFromEnv(' true ')).toBe(true);
        expect(DEVICE_LINK_ENABLED).toBe(false);
    });
});

describe('linkDevice', () => {
    it('signs the protocol add_device vector with the epoch read from the chain and confirms the link on chain', async () => {
        const { fetcher, calls } = relayer([[200, { deviceRequestId: ID, state: 'submitted', txHash: 'tx' }]]);
        const sleep = vi.fn(async () => undefined);
        const linked = ticket([device(purchaseSession, NOW - DAY), device(secondSession, NOW)]);
        const view = chain([ticket([device(purchaseSession, NOW - DAY)]), linked]);
        await expect(linkDevice({ config, ticketKey: key, device: deviceKey(secondSession), deps: { view, fetch: fetcher, sleep, now: () => NOW } }))
            .resolves.toEqual(linked);
        expect(calls).toEqual([{ url: `${RELAYER}/v1/devices`, body: vectors.calls.add_device_args }]);
        // The ticket key stays in the browser: only the protocol arguments leave it.
        expect(JSON.stringify(calls)).not.toContain(key.publicKey);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('signs the epoch 1 link and the renewal vectors byte for byte', async () => {
        for (const [name, session, before] of [
            ['link_at_epoch_1', secondSession, [device(purchaseSession, NOW - 24 * DAY)]],
            ['renewal', purchaseSession, [device(secondSession, NOW), device(purchaseSession, NOW - 24 * DAY)]],
        ] as const) {
            const { fetcher, calls } = relayer([[200, { deviceRequestId: ID, state: 'submitted', txHash: 'tx' }]]);
            const after = ticket([...before.filter((entry) => entry.session_public_key !== session), device(session, NOW)], 1);
            await linkDevice({ config, ticketKey: key, device: deviceKey(session), deps: { view: chain([ticket([...before], 1), after]), fetch: fetcher, now: () => NOW } });
            expect(calls.map((call) => call.body)).toEqual([vectors.device_link[name].add_device_args]);
        }
    });

    it('follows a pending link on the status route, then waits for final state to list the device', async () => {
        const { fetcher, calls } = relayer([
            [202, { deviceRequestId: ID, state: 'pending', txHash: 'tx' }], [202, { deviceRequestId: ID, state: 'pending' }],
            [200, { deviceRequestId: ID, state: 'submitted', txHash: 'tx' }],
        ]);
        const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
        const before = ticket([]);
        const view = chain([before, before, before, ticket([device(secondSession, NOW)])]);
        await linkDevice({ config, ticketKey: key, device: deviceKey(secondSession), deps: { view, fetch: fetcher, sleep, now: () => NOW } });
        expect(calls.map((call) => [call.url, call.body.device_request_id])).toEqual([
            [`${RELAYER}/v1/devices`, undefined], [`${RELAYER}/v1/devices/status`, ID], [`${RELAYER}/v1/devices/status`, ID],
        ]);
        expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3_000, 3_000, ...CONFIRM_DELAYS_MS.slice(1, 3)]);
    });

    it('reads the ticket and signs once more when the epoch moved, but not twice', async () => {
        const { fetcher, calls } = relayer([[409, { error: 'device_epoch_stale' }], [200, { deviceRequestId: ID, state: 'submitted' }]]);
        const view = chain([ticket([]), ticket([], 1), ticket([device(secondSession, NOW)], 1)]);
        await linkDevice({ config, ticketKey: key, device: deviceKey(secondSession), deps: { view, fetch: fetcher, sleep: async () => undefined, now: () => NOW } });
        expect(calls.map((call) => call.body.device_epoch)).toEqual(['0', '1']);

        const twice = relayer([[409, { error: 'device_epoch_stale' }], [409, { error: 'device_epoch_stale' }]]);
        await expect(linkDevice({ config, ticketKey: key, device: deviceKey(secondSession),
            deps: { view: chain([ticket([])]), fetch: twice.fetcher, sleep: async () => undefined, now: () => NOW } })).rejects.toThrow('device_epoch_stale');
        expect(twice.calls).toHaveLength(2);
    });

    it('stops without signing again when the re-read shows the device already linked', async () => {
        const { fetcher, calls } = relayer([[409, { error: 'device_epoch_stale' }]]);
        const linked = ticket([device(secondSession, NOW)], 1);
        await expect(linkDevice({ config, ticketKey: key, device: deviceKey(secondSession),
            deps: { view: chain([ticket([]), linked]), fetch: fetcher, now: () => NOW } })).resolves.toEqual(linked);
        expect(calls).toHaveLength(1);
    });

    it('accepts the relayer\'s "listed" for a device the browser clock sees within seven days', async () => {
        const { fetcher } = relayer([[200, { deviceRequestId: ID, state: 'listed', txHash: null }]]);
        const edge = ticket([device(secondSession, NOW - 23 * DAY + 60_000)]);
        await expect(linkDevice({ config, ticketKey: key, device: deviceKey(secondSession),
            deps: { view: chain([edge]), fetch: fetcher, now: () => NOW + 2 * 60_000 } })).resolves.toEqual(edge);
    });

    it('replaces only the device the viewer agreed to, as read just before signing', async () => {
        const [a, b, c] = ['ed25519:A', 'ed25519:B', 'ed25519:C'].map((session, index) => device(session, NOW - (3 - index) * DAY));
        const full = ticket([a, b, c]);
        const linked = ticket([b, c, device(secondSession, NOW)], 1);
        const run = (reads: MarketTicket[], allowEvict?: string | null) => {
            const { fetcher, calls } = relayer([[200, { deviceRequestId: ID, state: 'submitted', evicts_session_public_key: 'ed25519:A' }]]);
            return { calls, result: linkDevice({ config, ticketKey: key, device: deviceKey(secondSession), allowEvict,
                deps: { view: chain(reads), fetch: fetcher, sleep: async () => undefined, now: () => NOW } }) };
        };
        // The page showed two devices, a third was linked since: nothing is signed without asking.
        const unconfirmed = run([full]);
        await expect(unconfirmed.result).rejects.toThrow('eviction_not_confirmed');
        expect(unconfirmed.calls).toEqual([]);
        // The viewer agreed to replace A, but A has expired since and a link would now replace B.
        const changed = run([ticket([device('ed25519:A', NOW - 31 * DAY), b, c, device('ed25519:D', NOW)])], 'ed25519:A');
        await expect(changed.result).rejects.toThrow('eviction_not_confirmed');
        const agreed = run([full, linked], 'ed25519:A');
        await expect(agreed.result).resolves.toEqual(linked);
        expect(agreed.calls).toHaveLength(1);
        expect(deviceLinkErrorMessage('eviction_not_confirmed')).toContain('changed');
    });

    it('reports relayer refusals, an unconfirmed link and an unknown ticket with fixed codes', async () => {
        const run = (responses: Array<[number, unknown]>, reads: (MarketTicket | null)[] = [ticket([])]) => linkDevice({
            config, ticketKey: key, device: deviceKey(secondSession),
            deps: { view: chain(reads as MarketTicket[]), fetch: relayer(responses).fetcher, sleep: async () => undefined, now: () => NOW },
        });
        await expect(run([[429, { error: 'ticket_limit_reached' }]])).rejects.toThrow('ticket_limit_reached');
        await expect(run([[502, { error: '<b>' }]])).rejects.toThrow('device_link_failed');
        await expect(run([[202, { state: 'pending' }]])).rejects.toThrow('device_link_pending');
        await expect(run([[200, { deviceRequestId: ID, state: 'submitted' }]])).rejects.toThrow('device_link_not_confirmed');
        await expect(run([], [null])).rejects.toThrow('ticket_not_found');
        const offline = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
        await expect(linkDevice({ config, ticketKey: key, device: deviceKey(secondSession),
            deps: { view: chain([ticket([])]), fetch: offline, now: () => NOW } })).rejects.toThrow('relayer_unavailable');
        expect(deviceLinkErrorMessage('ticket_limit_reached')).toContain('tomorrow');
        expect(deviceLinkErrorMessage('<b>')).toBe('This device could not be linked. Please try again.');
    });
});

describe('device link UI', () => {
    const plan = (evicts: TicketDevice | null) => ({ kind: 'link' as const, evicts });
    const link = (initialPhase?: 'confirm', evicts: TicketDevice | null = null) => React.createElement(DeviceLink, {
        config, view: chain([ticket([])]), ticketKey: key, device: deviceKey(secondSession), plan: plan(evicts), onLinked: () => undefined, initialPhase,
    });
    const area = (props: Partial<React.ComponentProps<typeof TicketDeviceArea>>) => renderToStaticMarkup(React.createElement(TicketDeviceArea, {
        linkEnabled: true, plan: { kind: 'watch', expiresAtMs: NOW + 20 * DAY }, open: false, renewing: false, renewFailed: false,
        onWatch: () => undefined, player: () => React.createElement('div', null, 'PLAYER'), link: (linkPlan) => link(undefined, linkPlan.evicts), ...props,
    }));

    it('offers "Watch on this device" for an unlinked device, with no payment or approval', () => {
        const html = area({ plan: plan(null) });
        expect(html).toContain('Watch on this device');
        expect(html).toContain(DEVICE_LINK_HINT);
        expect(DEVICE_LINK_HINT).toMatch(/No payment and nothing to approve.*up to 3 devices.*30 days/);
        expect(html).not.toContain('>Watch<');
    });

    it('asks before a fourth device replaces the oldest one', () => {
        const oldest = device('ed25519:A', NOW - 3 * DAY);
        const html = renderToStaticMarkup(link('confirm', oldest));
        expect(html).toContain(evictionNotice(oldest.authorized_at_ms));
        expect(evictionNotice(oldest.authorized_at_ms)).toContain(new Date(NOW - 3 * DAY).toLocaleDateString());
        expect(html).toContain('Link this device');
        expect(html).toContain('Cancel');
        // Without a device to replace there is nothing to confirm.
        expect(renderToStaticMarkup(link('confirm'))).toContain('Watch on this device');
    });

    it('shows Watch with the link date for a listed device, and a note when a renewal failed', () => {
        const html = area({ plan: { kind: 'renew', expiresAtMs: NOW + 3 * DAY }, renewFailed: true });
        expect(html).toContain('Watch');
        expect(html).toContain(linkedUntilNotice(NOW + 3 * DAY));
        expect(html).toContain('could not be renewed just now');
        expect(area({ open: true })).toContain('PLAYER');
    });

    it('keeps the neutral notice and plain Watch while the flag is off', () => {
        const unlinked = area({ linkEnabled: false, plan: plan(null) });
        expect(unlinked).toContain(UNLINKED_DEVICE_NOTICE);
        expect(unlinked).not.toContain('Watch on this device');
        const listed = area({ linkEnabled: false, plan: { kind: 'renew', expiresAtMs: NOW + DAY } });
        expect(listed).toContain('Watch');
        expect(listed).not.toContain('linked until');
        expect(UNLINKED_DEVICE_NOTICE).not.toMatch(/soon|cleeng|USDC|crypto/i);
    });
});
