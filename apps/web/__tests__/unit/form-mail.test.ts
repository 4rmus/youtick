import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFormMail } from '@/lib/form-mail';

const MESSAGE = {
    to: 'inbox@youtick.net',
    from: 'forms@youtick.net',
    subject: 'Opening notice (en)',
    text: 'Email: person@example.com',
};

describe('sendFormMail', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('hands the message to the binding and logs the accepted message id, nothing else', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const send = vi.fn(async () => ({ messageId: 'msg-123' }));

        await sendFormMail('opening_notice', { send }, MESSAGE);

        expect(send).toHaveBeenCalledWith(MESSAGE);
        expect(info).toHaveBeenCalledTimes(1);
        expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
            event: 'form_mail', form: 'opening_notice', outcome: 'accepted', messageId: 'msg-123',
        });
    });

    it('treats an answer without a message id as not sent', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (const answer of [undefined, null, {}, { messageId: '' }, { messageId: 42 }]) {
            warn.mockClear();
            await expect(sendFormMail('creator_application', { send: async () => answer }, MESSAGE))
                .rejects.toThrow('form_mail_not_accepted');
            expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
                event: 'form_mail', form: 'creator_application', outcome: 'no_message_id',
            });
        }
    });

    it('logs the error code of a refused send and passes the error on', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const refused = Object.assign(new Error('recipient person@example.com is not allowed'), { code: 'E_RECIPIENT_NOT_ALLOWED' });

        await expect(sendFormMail('content_report', { send: async () => { throw refused; } }, MESSAGE)).rejects.toBe(refused);

        expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
            event: 'form_mail', form: 'content_report', outcome: 'failed', code: 'E_RECIPIENT_NOT_ALLOWED',
        });
    });

    it('never logs the message, an address or an error text', async () => {
        const lines: string[] = [];
        vi.spyOn(console, 'info').mockImplementation((line: string) => { lines.push(line); });
        vi.spyOn(console, 'warn').mockImplementation((line: string) => { lines.push(line); });

        await sendFormMail('opening_notice', { send: async () => ({ messageId: 'msg-1' }) }, MESSAGE);
        await sendFormMail('opening_notice', { send: async () => { throw new Error('person@example.com bounced'); } }, MESSAGE).catch(() => {});
        await sendFormMail('opening_notice', { send: async () => { throw Object.assign(new Error('x'), { code: 'has spaces and person@example.com' }); } }, MESSAGE).catch(() => {});

        const logged = lines.join('\n');
        expect(logged).not.toContain('example.com');
        expect(logged).not.toContain('youtick.net');
        expect(logged).not.toContain('Opening notice');
        expect(lines.map((line) => JSON.parse(line).code)).toEqual([undefined, 'unknown', 'unknown']);
    });
});
