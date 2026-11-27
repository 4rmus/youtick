// One mail from a public form (creator application, content report, opening notice) to the youtick inbox
// through its Cloudflare Email Sending binding.
//
// The route answers "sent" only when Email Sending returned a message id. A binding that resolves without
// one has not handed the mail to Email Sending, and a visitor must then see the e-mail fallback instead of
// a confirmation for a mail that never leaves. Every attempt leaves one log line: the form, the outcome
// and the message id or error code. The message, the addresses and error texts are never logged.

export type FormMailForm = 'creator_application' | 'content_report' | 'opening_notice';

export type FormMailMessage = { to: string; from: string; subject: string; text: string };

/** Cloudflare Email Sending binding (`send_email`, structured API). */
export type FormMailBinding = { send(message: FormMailMessage): Promise<unknown> };

const ERROR_CODE = /^[A-Za-z0-9_]{1,64}$/;

function messageIdOf(result: unknown): string | null {
    const id = result && typeof result === 'object' ? (result as { messageId?: unknown }).messageId : null;
    return typeof id === 'string' && id ? id : null;
}

function errorCodeOf(error: unknown): string {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
    return typeof code === 'string' && ERROR_CODE.test(code) ? code : 'unknown';
}

export async function sendFormMail(form: FormMailForm, binding: FormMailBinding, message: FormMailMessage): Promise<void> {
    let result: unknown;
    try {
        result = await binding.send(message);
    } catch (error) {
        console.warn(JSON.stringify({ event: 'form_mail', form, outcome: 'failed', code: errorCodeOf(error) }));
        throw error;
    }
    const messageId = messageIdOf(result);
    if (!messageId) {
        console.warn(JSON.stringify({ event: 'form_mail', form, outcome: 'no_message_id' }));
        throw new Error('form_mail_not_accepted');
    }
    console.info(JSON.stringify({ event: 'form_mail', form, outcome: 'accepted', messageId }));
}
