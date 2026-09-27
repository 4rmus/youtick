import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { prepareTicket, approveTicket, continueTicket, ticketStatus } from '@/lib/near-auth-ticket-client';
import type { SigningReview } from '@/lib/near-auth-signing';
import type { MpcStatus } from '../../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
const mocks = vi.hoisted(() => ({ device: vi.fn(), block: vi.fn(), assert: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: mocks.device }));
vi.mock('@/lib/near-auth-signing', () => ({ assertSigningDevice: mocks.assert, signingAttemptBlockReason: mocks.block }));
vi.mock('@/lib/constants', () => ({ NEAR_CONFIG: { marketContractId: 'market.testnet' } }));
const review = { accountId: 'a'.repeat(64), transaction: [1, 2], ticket: 'opaque-review', purchase: { publicationId: 'video-1', priceUsdc: '2000000' } } as SigningReview;
const payment = { accountId: review.accountId, purpose: 'ticket', resourceId: 'video-1', operationId: 'b'.repeat(64), state: 'MPC_VERIFIED' } as MpcStatus;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.block.mockReturnValue(null); mocks.device.mockResolvedValue({}); mocks.assert.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());
it('preparation checks pending status and old ticket guards before touching the device; never requests approval', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment }));
    await expect(prepareTicket(review.accountId, 'video-1', '2000000', new AbortController().signal)).rejects.toThrow('mpc_pending');
    expect(mocks.device).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment: null })); mocks.block.mockReturnValue('signing_already_started');
    await expect(prepareTicket(review.accountId, 'video-1', '2000000', new AbortController().signal)).rejects.toThrow('signing_already_started');
    expect(mocks.device).not.toHaveBeenCalled();
});
it('prepares exact account/resource/price and submits once after approval', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment: null })).mockResolvedValueOnce(Response.json({ review }));
    const signal = new AbortController().signal;
    expect(await prepareTicket(review.accountId, 'video-1', '2000000', signal)).toEqual(review);
    mocks.fetch.mockResolvedValueOnce(Response.json({ payment })); const authorize = vi.fn().mockResolvedValue('private-token'), onSubmit = vi.fn();
    await approveTicket(review, authorize, signal, onSubmit); expect(authorize).toHaveBeenCalledWith(review.transaction); expect(onSubmit).toHaveBeenCalledOnce();
    const last = mocks.fetch.mock.calls.at(-1)!; expect(last[0]).toBe('/api/auth/ticket');
    expect(JSON.parse(last[1].body).action).toBe('submit'); expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it('account switch during provider approval cancels before submission', async () => {
    const controller = new AbortController(); const authorize = vi.fn(async () => { controller.abort(); return 'private-token'; });
    await expect(approveTicket(review, authorize, controller.signal)).rejects.toThrow(); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('status never executes; continuation rejects another user/video and sends only the stored operation ID', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment })); await ticketStatus();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).action).toBe('status');
    const signal = new AbortController().signal;
    await expect(continueTicket(payment, 'wrong', 'video-1', signal)).rejects.toThrow('account_changed');
    await expect(continueTicket(payment, review.accountId, 'wrong', signal)).rejects.toThrow('account_changed');
    mocks.fetch.mockResolvedValueOnce(Response.json({ payment: { ...payment, state: 'TICKET_SUBMITTED' } }));
    await continueTicket(payment, review.accountId, 'video-1', signal);
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ action: 'execute', operationId: payment.operationId });
    await continueTicket({ ...payment, state: 'TICKET_SUBMITTED' }, review.accountId, 'video-1', signal);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
