import { expect, test, type Page } from '@playwright/test';
import nacl from 'tweetnacl';
import { splitSecretIntoShares } from '../lib/kms/shares';

const GUEST_ACCOUNT_ID = 'guest-smoke.youtick.near';
const FREE_CID = '11111111-1111-4111-8111-111111111111';
const PAID_CID = '22222222-2222-4222-8222-222222222222';
const MANIFEST_CID = 'bafybeiguesttrialsmokemanifest0000000000000001';
const INIT_CID = 'bafybeiguesttrialsmokeinit000000000000000001';
const SEGMENT_CID = 'bafybeiguesttrialsmokesegment00000000000001';
const POSTER_REF = `ipfs://${SEGMENT_CID}`;

const aesKeyB64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const shares = splitSecretIntoShares(aesKeyB64, 2, 2);
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(input: Uint8Array): string {
    const digits = [0];
    for (const byte of input) {
        let carry = byte;
        for (let index = 0; index < digits.length; index += 1) {
            carry += digits[index] << 8;
            digits[index] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }

    let encoded = '';
    for (const byte of input) {
        if (byte !== 0) break;
        encoded += BASE58_ALPHABET[0];
    }
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        encoded += BASE58_ALPHABET[digits[index]];
    }
    return encoded;
}

function callFunctionResult(value: unknown, id: unknown) {
    return {
        jsonrpc: '2.0',
        id,
        result: {
            block_hash: 'mock-block-hash',
            block_height: 1,
            logs: [],
            result: Array.from(Buffer.from(JSON.stringify(value))),
        },
    };
}

function eventForCid(cid: string) {
    const base = {
        title: `${MANIFEST_CID}:::${POSTER_REF}:::${cid === FREE_CID ? 'Free Smoke Release' : 'Paid Smoke Release'}`,
        description: 'Smoke test release',
        creator_id: 'creator.youtick.near',
        created_at: 1,
        content_type: 'cinema',
        banned: false,
    };

    if (cid === FREE_CID) {
        return {
            ...base,
            price: '0',
            price_usd: null,
            price_usdc: null,
            access_mode: 'free_collectible',
        };
    }

    return {
        ...base,
        price: '1000000000000000000000000',
        price_usd: 100,
        price_usdc: '1000000',
        access_mode: 'paid',
    };
}

async function installGuestSession(page: Page) {
    const keyPair = nacl.sign.keyPair();
    const secretKey = `ed25519:${base58Encode(keyPair.secretKey)}`;

    await page.addInitScript(({ accountId, key }) => {
        localStorage.setItem('language', 'en');
        localStorage.setItem('managedNearAccount', JSON.stringify({ accountId, kind: 'guest' }));
        localStorage.setItem(`near-api-js:keystore:${accountId}:mainnet`, key);
    }, {
        accountId: GUEST_ACCOUNT_ID,
        key: secretKey,
    });
}

async function mockNearAndMedia(page: Page) {
    let retrieveCount = 0;

    await page.route('**/api/near-rpc', async (route) => {
        const body = route.request().postDataJSON() as {
            id?: unknown;
            params?: {
                account_id?: string;
                method_name?: string;
                args_base64?: string;
            };
        };
        const params = body.params ?? {};
        const args = params.args_base64
            ? JSON.parse(Buffer.from(params.args_base64, 'base64').toString('utf8')) as Record<string, string>
            : {};

        switch (params.method_name) {
            case 'get_event':
                await route.fulfill({ json: callFunctionResult(eventForCid(args.encrypted_cid), body.id) });
                return;
            case 'has_ticket':
                await route.fulfill({
                    json: callFunctionResult(
                        args.account_id === GUEST_ACCOUNT_ID && args.encrypted_cid === FREE_CID,
                        body.id,
                    ),
                });
                return;
            case 'get_events_count':
                await route.fulfill({ json: callFunctionResult(0, body.id) });
                return;
            case 'get_events':
                await route.fulfill({ json: callFunctionResult([], body.id) });
                return;
            case 'list_decryption_operators':
                await route.fulfill({
                    json: callFunctionResult([
                        {
                            account_id: 'kms-a.youtick.near',
                            endpoint: `${new URL(route.request().url()).origin}/__playwright-kms-a`,
                            transport_public_key: 'pk-a',
                            kind: 'DecryptionOperator',
                            active: true,
                        },
                        {
                            account_id: 'kms-b.youtick.near',
                            endpoint: `${new URL(route.request().url()).origin}/__playwright-kms-b`,
                            transport_public_key: 'pk-b',
                            kind: 'DecryptionOperator',
                            active: true,
                        },
                    ], body.id),
                });
                return;
            case 'get_threshold_config':
                await route.fulfill({
                    json: callFunctionResult({ total_operators: 2, required_shares: 2 }, body.id),
                });
                return;
            default:
                await route.fulfill({ json: callFunctionResult(null, body.id) });
        }
    });

    await page.route('**/__playwright-kms-*/health', async (route) => {
        await route.fulfill({
            json: {
                ok: true,
                data: {
                    network: 'mainnet',
                    contract: 'youtick.near',
                },
            },
        });
    });

    await page.route('**/__playwright-kms-*/retrieve', async (route) => {
        const operatorIndex = route.request().url().includes('kms-a') ? 0 : 1;
        retrieveCount += 1;
        await route.fulfill({
            json: {
                ok: true,
                data: {
                    ...shares[operatorIndex],
                    totalShares: 2,
                    requiredShares: 2,
                    scheme: 'shamir-v1',
                    operatorAccountId: operatorIndex === 0 ? 'kms-a.youtick.near' : 'kms-b.youtick.near',
                },
            },
        });
    });

    await page.route('https://*/ipfs/**', async (route) => {
        const url = route.request().url();
        if (url.includes(MANIFEST_CID)) {
            await route.fulfill({
                json: {
                    version: 2,
                    packaging: 'cmaf',
                    encrypted: true,
                    codec: 'avc1.42E01E',
                    contentType: 'video/mp4',
                    durationMs: 1000,
                    initSegment: {
                        cid: INIT_CID,
                        byteLength: 1,
                        counterB64: Buffer.alloc(16).toString('base64'),
                    },
                    tracks: [
                        {
                            id: 1,
                            kind: 'video',
                            codec: 'avc1.42E01E',
                            bitrate: 1,
                            timescale: 1000,
                        },
                    ],
                    segments: [
                        {
                            seq: 0,
                            durationMs: 1000,
                            payloads: [
                                {
                                    cid: SEGMENT_CID,
                                    trackId: 1,
                                    kind: 'video',
                                    byteLength: 1,
                                    startMs: 0,
                                    endMs: 1000,
                                    counterB64: Buffer.alloc(16).toString('base64'),
                                },
                            ],
                        },
                    ],
                },
            });
            return;
        }

        await route.fulfill({
            body: Buffer.from([0]),
            contentType: 'video/mp4',
        });
    });

    return {
        getRetrieveCount: () => retrieveCount,
    };
}

test.describe('guest/trial watch smoke', () => {
    test.beforeEach(async ({ page }) => {
        await installGuestSession(page);
    });

    test('guest account can open a free-ticket playback path', async ({ page }) => {
        const mocks = await mockNearAndMedia(page);

        await page.goto(`/watch?cid=${FREE_CID}`);

        await expect(page.getByRole('heading', { name: 'Free Smoke Release', level: 1 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Ticket Verified' })).toBeVisible();

        await page.getByRole('button', { name: 'Play' }).click();

        await expect.poll(mocks.getRetrieveCount).toBeGreaterThanOrEqual(2);
        await expect(page.locator('video')).toBeVisible();
    });

    test('guest account sees a wallet CTA instead of a paid checkout attempt', async ({ page }) => {
        await mockNearAndMedia(page);

        await page.goto(`/watch?cid=${PAID_CID}`);

        await expect(page.getByRole('heading', { name: 'Paid Smoke Release', level: 1 })).toBeVisible();
        await expect(page.getByText('Paid tickets need a connected wallet. Your guest account can still watch free tickets.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Connect Wallet to Buy' })).toBeVisible();
        await expect(page.getByText('Getting NEAR price...')).toHaveCount(0);
        await expect(page.locator('video')).toHaveCount(0);
    });
});
