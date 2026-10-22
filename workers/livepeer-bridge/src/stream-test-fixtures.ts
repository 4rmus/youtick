// Test-only loader for the redacted Cloudflare Stream fixtures in src/fixtures/stream. It is not
// imported by the Worker entry point. Placeholders (<UID>, <CUSTOMER_CODE>, ...) are substituted
// with synthetic values so tests never depend on a real account, id or token.
export const STREAM_TEST_VALUES = {
    UID: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
    ACCOUNT_ID: '00112233445566778899aabbccddeeff',
    CUSTOMER_CODE: 'testcode0000',
    JOB_ID: 'job-001',
    GENERATION: '1',
    LENGTH: '20000000',
    P: 'eyJ2aWRlb0lEIjoidGVzdCJ9',
    S: 'ab'.repeat(16),
    TIME: '0',
    SIG: '0'.repeat(64),
    KEY_ID: 'feedfacefeedfacefeedfacefeedface',
    PEM_BASE64: 'cGVt',
    JWK_BASE64: 'andr',
    HEIGHT: '1080',
};

export type StreamFixtureValues = Partial<typeof STREAM_TEST_VALUES>;

type FileSystem = {
    readFile(path: URL, encoding: 'utf8'): Promise<string>;
    readdir(path: URL): Promise<string[]>;
};

async function fileSystem(): Promise<FileSystem> {
    return await import(/* @vite-ignore */ ['node', 'fs/promises'].join(':')) as FileSystem;
}

function fixtureUrl(name: string): URL {
    return new URL(`./fixtures/stream/${name}`, (import.meta as unknown as { url: string }).url);
}

export async function rawStreamFixture(name: string): Promise<string> {
    return (await fileSystem()).readFile(fixtureUrl(name), 'utf8');
}

export async function streamFixtureNames(): Promise<string[]> {
    return (await fileSystem()).readdir(fixtureUrl(''));
}

export function substitute(text: string, values: StreamFixtureValues = {}): string {
    const merged = { ...STREAM_TEST_VALUES, ...values };
    return text.replace(/<([A-Z_]+)>/g, (match, key: string) => (
        Object.hasOwn(merged, key) ? String(merged[key as keyof typeof merged]) : match
    ));
}

/** Text fixture (manifests) with placeholders substituted. */
export async function streamText(name: string, values?: StreamFixtureValues): Promise<string> {
    return substitute(await rawStreamFixture(name), values);
}

/** JSON fixture with placeholders substituted; a numeric `size` placeholder becomes a number. */
export async function streamJson<T = Record<string, unknown>>(name: string, values?: StreamFixtureValues): Promise<T> {
    const parsed = JSON.parse(substitute(await rawStreamFixture(name), values)) as Record<string, unknown>;
    const normalize = (video: unknown) => {
        if (video && typeof video === 'object' && typeof (video as { size?: unknown }).size === 'string') {
            (video as { size: unknown }).size = Number((video as { size: string }).size);
        }
    };
    normalize(parsed.result);
    normalize(parsed.body);
    return parsed as T;
}
