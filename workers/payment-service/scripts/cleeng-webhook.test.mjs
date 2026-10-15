import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_URL, EVENTS, parseArgs, register } from './cleeng-webhook.mjs';

const TOKEN = 'publisher-token-0123456789';
const SECRET = 'whsec_PkPHH0UXY0ynbFB8jcyBjgI6VwN/y2vh+JdxD7QZtSA=';

async function files() {
    const dir = await mkdtemp(join(tmpdir(), 'cleeng-webhook-'));
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, `${TOKEN}\n`, { mode: 0o600 });
    return { tokenFile, secretOut: join(dir, 'whsec'), url: DEFAULT_URL };
}

test('arguments: register needs a token file and a new secret file; only an https /webhooks/card URL', () => {
    assert.deepEqual(parseArgs(['register', '--token-file', 't', '--secret-out', 's']), { url: DEFAULT_URL, tokenFile: 't', secretOut: 's' });
    assert.throws(() => parseArgs(['list']), /usage/);
    assert.throws(() => parseArgs(['register', '--token-file', 't']), /usage/);
    assert.throws(() => parseArgs(['register', '--token-file', 't', '--secret-out', 's', '--url', 'http://x.net/webhooks/card']), /url_invalid/);
    assert.throws(() => parseArgs(['register', '--token-file', 't', '--secret-out', 's', '--url', 'https://x.net/other']), /url_invalid/);
});

test('registers the two topics with the token header and writes the secret to a 0600 file only', async () => {
    const options = await files();
    const calls = [];
    const result = await register(options, async (url, init) => {
        calls.push({ url, init });
        return Response.json({
            id: 'ep_1', url: DEFAULT_URL, status: 'active', events: EVENTS,
            signing: { algorithm: 'HMAC-SHA256', secret: SECRET, secretPrefix: 'whsec_Pk' },
        }, { status: 201 });
    });
    assert.equal(calls[0].url, 'https://webhook.api.sandbox.cleeng.com/endpoints');
    assert.equal(calls[0].init.headers['X-Publisher-Token'], TOKEN);
    assert.deepEqual(JSON.parse(calls[0].init.body).events, ['transactionCreated', 'paymentRefunded']);
    assert.equal(await readFile(options.secretOut, 'utf8'), `${SECRET}\n`);
    assert.equal((await stat(options.secretOut)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(result).includes(SECRET) && !JSON.stringify(result).includes(TOKEN));
    // A second run never overwrites the first secret.
    await assert.rejects(register(options, async () => Response.json({ signing: { secret: SECRET } }, { status: 201 })), /EEXIST/);
});

test('a refused registration reports only the status and Cleeng error code, and writes nothing', async () => {
    const options = await files();
    await assert.rejects(register(options, async () => Response.json({ error: { code: 'validation_error', message: `bad ${TOKEN}` } }, { status: 409 })),
        (error) => error.message === 'cleeng_webhook_http_409_validation_error');
    await assert.rejects(stat(options.secretOut), /ENOENT/);
});
