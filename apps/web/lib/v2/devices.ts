// Links or renews this browser's playback device on a V2 ticket (decision O12). The ticket key
// signs `add_device` in the browser and never leaves it; the relayer submits the call from its own
// account, so the viewer approves nothing and pays nothing. Every device record lasts 30 days from
// its link or renewal (Market V2), so a listed device is renewed on Watch in its last seven days.
// A link counts only once `get_ticket` lists the device; the relayer's answer is never proof.
import type { TicketKey } from '../ticket-keys/keys';
import { buildAddDeviceArgs, signatureExpiry } from '../ticket-keys/messages';
import type { V2Config } from './config';
import type { DeviceKey } from './device-key';
import { readTicket, type MarketTicket, type TicketDevice, type ViewContract } from './tickets';

/** NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED, fixed at build time. Off unless `true`: the relayer route is off until configured. */
export function deviceLinkFromEnv(value: string | undefined = process.env.NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED): boolean {
    return value?.trim() === 'true';
}

export const DEVICE_LINK_ENABLED = deviceLinkFromEnv();

/** Market V2 `MAX_TICKET_DEVICES`: a fourth link replaces the device linked or renewed longest ago. */
export const MAX_TICKET_DEVICES = 3;
/** Matches the relayer's `DEVICE_RENEW_WITHIN_MS`: a device that expires sooner is renewed. */
export const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
/** After the relayer answers, the chain is read at these delays until it lists the device (V1 does the same). */
export const CONFIRM_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000];
/** Like checkout: the status route is asked every 3 seconds, at most 20 times. */
const STATUS_RETRY_MS = 3_000;
const STATUS_RETRIES = 20;

/**
 * What this device can do with a ticket now:
 * - `watch`: listed for more than seven days;
 * - `renew`: listed, but it expires within seven days, so Watch renews it first;
 * - `link`: not listed; `evicts` is the device a link would replace when three are active.
 */
export type DevicePlan =
    | { kind: 'watch'; expiresAtMs: number }
    | { kind: 'renew'; expiresAtMs: number }
    | { kind: 'link'; evicts: TicketDevice | null };

export function devicePlan(ticket: MarketTicket, sessionPublicKey: string, nowMs: number): DevicePlan {
    const active = ticket.devices.filter((device) => Number(device.expires_at_ms) > nowMs);
    const own = active.find((device) => device.session_public_key === sessionPublicKey);
    if (own) {
        const expiresAtMs = Number(own.expires_at_ms);
        return { kind: expiresAtMs > nowMs + RENEW_WITHIN_MS ? 'watch' : 'renew', expiresAtMs };
    }
    // The contract keeps devices in link order, oldest first, and drops the first one.
    return { kind: 'link', evicts: active.length >= MAX_TICKET_DEVICES ? active[0] : null };
}

export class DeviceLinkError extends Error {}

export interface DeviceLinkDeps {
    view: ViewContract;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

async function postJson(fetcher: typeof fetch, url: string, body: unknown): Promise<{ status: number; value: Record<string, unknown> }> {
    let response: Response;
    try {
        response = await fetcher(url, {
            method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
        });
    } catch {
        throw new DeviceLinkError('relayer_unavailable');
    }
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, value };
}

function errorCode(value: Record<string, unknown>, fallback: string): string {
    return typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : fallback;
}

/**
 * Links (or renews) `device` on the ticket of `ticketKey` and returns the ticket once the chain lists
 * the device for more than seven days. The device epoch is read from final state just before
 * signing; when another link or removal moved it meanwhile, the ticket is read and signed once more.
 * `allowEvict` is the device the viewer agreed to replace; a fresh read that would replace any other
 * device stops with `eviction_not_confirmed` before anything is signed.
 */
export async function linkDevice(input: {
    config: V2Config; ticketKey: TicketKey; device: DeviceKey; deps: DeviceLinkDeps; allowEvict?: string | null;
}): Promise<MarketTicket> {
    const { config, ticketKey, device, deps } = input;
    const fetcher = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = deps.now ?? (() => Date.now());
    const read = async () => {
        const ticket = await readTicket(deps.view, config.marketContractId, ticketKey.ticketId);
        if (!ticket) throw new DeviceLinkError('ticket_not_found');
        return ticket;
    };

    let state: unknown;
    for (let attempt = 0; ; attempt += 1) {
        const ticket = await read();
        const plan = devicePlan(ticket, device.sessionPublicKey, now());
        // A retry after a link that already landed (and moved the epoch) needs no new signature.
        if (attempt > 0 && plan.kind === 'watch') return ticket;
        if (plan.kind === 'link' && plan.evicts && plan.evicts.session_public_key !== (input.allowEvict ?? null)) {
            throw new DeviceLinkError('eviction_not_confirmed');
        }
        const args = buildAddDeviceArgs({
            binding: { network: config.auth.network, contractId: config.marketContractId },
            ticket: ticketKey,
            device: { sessionPublicKey: device.sessionPublicKey, certificateSha256: device.certificateSha256 },
            deviceEpoch: String(ticket.device_epoch),
            expiresAtMs: signatureExpiry(now()),
        });
        let relayed = await postJson(fetcher, `${config.relayerUrl}/v1/devices`, args);
        const requestId = relayed.value.deviceRequestId;
        for (let poll = 0; relayed.status === 202; poll += 1) {
            if (typeof requestId !== 'string' || !/^[0-9a-f]{64}$/.test(requestId) || poll >= STATUS_RETRIES) {
                throw new DeviceLinkError('device_link_pending');
            }
            await sleep(STATUS_RETRY_MS);
            relayed = await postJson(fetcher, `${config.relayerUrl}/v1/devices/status`, { device_request_id: requestId });
        }
        if (relayed.status === 200) {
            state = relayed.value.state;
            break;
        }
        const code = errorCode(relayed.value, 'device_link_failed');
        if (code === 'device_epoch_stale' && attempt === 0) continue;
        throw new DeviceLinkError(code);
    }

    for (const delay of CONFIRM_DELAYS_MS) {
        if (delay) await sleep(delay);
        const ticket = await read();
        const plan = devicePlan(ticket, device.sessionPublicKey, now());
        // "listed" was the relayer's own seven-day reading; a clock a few minutes apart must not turn it into an error.
        if (plan.kind === 'watch' || (state === 'listed' && plan.kind === 'renew')) return ticket;
    }
    throw new DeviceLinkError('device_link_not_confirmed');
}

/** Plain-language messages for the codes `linkDevice` throws. */
const DEVICE_LINK_ERRORS: Record<string, string> = {
    ticket_not_found: 'This ticket could not be found. Please reload the page.',
    ticket_not_playable: 'This ticket can no longer be played.',
    publication_unavailable: 'This video was removed and can no longer be watched.',
    storage_unavailable: 'Linking devices is not available right now. Please try again later.',
    devices_disabled: 'Linking devices is not available right now. Please try again later.',
    mutations_disabled: 'Linking devices is not available right now. Please try again later.',
    dependency_unavailable: 'Linking devices is not available right now. Please try again later.',
    relayer_unavailable: 'We could not reach youtick. Check your connection and try again.',
    ticket_limit_reached: 'This ticket has been linked to devices too many times today. Please try again tomorrow.',
    daily_limit_reached: 'Too many devices are being linked right now. Please try again later.',
    rate_limited: 'Too many attempts from your connection. Please wait a minute and try again.',
    signature_expired: 'The request took too long. Please try again.',
    device_epoch_stale: 'Another device was linked or removed at the same time. Please try again.',
    eviction_not_confirmed: 'The devices on this ticket changed. Please check them and try again.',
    device_link_pending: 'The link is still being confirmed. Please check again in a minute.',
    device_link_not_confirmed: 'The link is still being confirmed. Please check again in a minute.',
};

export function deviceLinkErrorMessage(code: string): string {
    return DEVICE_LINK_ERRORS[code] ?? 'This device could not be linked. Please try again.';
}
