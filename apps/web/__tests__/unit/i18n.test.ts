import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { resolveLocale } from '@/lib/i18n/locale';
import { localizedPublicationView, uploadErrorMessage, fileValidationMessage } from '@/features/upload/upload-job';
import { purchaseErrorMessage } from '@/features/checkout/ticket-checkout';
import { checkoutStateLabel, paymentErrorMessage } from '@/features/checkout/conversion-checkout';

type Tree = { [key: string]: unknown };

function leaves(tree: unknown, path = ''): Array<[string, unknown]> {
    if (typeof tree === 'string' || typeof tree === 'function') return [[path, tree]];
    if (Array.isArray(tree)) return tree.flatMap((item, index) => leaves(item, `${path}[${index}]`));
    return Object.entries(tree as Tree).flatMap(([key, value]) => leaves(value, path ? `${path}.${key}` : key));
}

function sample(value: unknown): string {
    return typeof value === 'function' ? String((value as (...args: unknown[]) => unknown)('X', 'Y', 'Z')) : String(value);
}

describe('dictionaries', () => {
    const en = leaves(messages.en);
    const tr = leaves(messages.tr);

    it('have the same keys, arrays and value kinds in both languages', () => {
        expect(tr.map(([path, value]) => [path, typeof value])).toEqual(en.map(([path, value]) => [path, typeof value]));
    });

    it('never leave a message empty', () => {
        for (const [path, value] of [...en, ...tr]) expect(sample(value).trim(), path).not.toBe('');
    });

    it('translate every sentence while keeping product names and units as they are', () => {
        const same = en.filter(([path, value], index) => sample(value) === sample(tr[index][1]) && !path.startsWith('conversion.token'));
        expect(same.map(([path]) => path)).toEqual([]);
    });

    it('keep interpolated values in both languages', () => {
        for (const [path, value] of en.filter(([, item]) => typeof item === 'function')) {
            const trValue = tr.find(([trPath]) => trPath === path)![1];
            for (const argument of ['X', 'Y', 'Z'].slice(0, (value as (...args: unknown[]) => unknown).length)) {
                expect(sample(trValue), path).toContain(argument);
            }
        }
    });
});

describe('resolveLocale', () => {
    it.each([
        [null, 'en'],
        ['', 'en'],
        ['tr-TR,tr;q=0.9,en;q=0.8', 'tr'],
        ['en-US,en;q=0.9,tr;q=0.8', 'en'],
        ['de-DE,tr;q=0.7,en;q=0.5', 'tr'],
        ['fr-FR,de;q=0.8', 'en'],
        ['tr;q=0,en', 'en'],
        ['en;q=0.2,tr;q=0.9', 'tr'],
        ['TR', 'tr'],
    ])('maps %s to %s', (header, locale) => {
        expect(resolveLocale(header)).toBe(locale);
    });
});

describe('stored language preference', () => {
    const events = { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };

    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        Object.assign(window, events);
    });
    afterEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('migrates the legacy player language and removes it on the next choice', async () => {
        localStorage.setItem('youtick:player-language', 'tr');
        const locale = await import('@/lib/i18n/locale');
        expect(locale.readStoredLocale()).toBe('tr');
        locale.setStoredLocale('en');
        expect(localStorage.getItem('youtick:locale')).toBe('en');
        expect(localStorage.getItem('youtick:player-language')).toBeNull();
        expect(events.dispatchEvent).toHaveBeenCalledOnce();
    });

    it('lets the player follow the shared preference', async () => {
        const player = await import('@/lib/player-copy');
        player.setPlayerLanguage('tr');
        expect(localStorage.getItem('youtick:locale')).toBe('tr');
        expect(player.playerLanguage()).toBe('tr');
    });

    it('ignores unknown stored values', async () => {
        localStorage.setItem('youtick:locale', 'de');
        const locale = await import('@/lib/i18n/locale');
        expect(locale.readStoredLocale()).toBeNull();
        expect(locale.currentLocale()).toBe('en');
    });
});

describe('rendering with the server-chosen language', () => {
    it('renders Turkish when the layout resolves tr', async () => {
        const { I18nProvider } = await import('@/lib/i18n/I18nProvider');
        const { RuntimeClosed } = await import('@/components/RuntimeClosed');
        const html = renderToStaticMarkup(React.createElement(I18nProvider as React.FC<{ initialLocale: 'tr' }>, { initialLocale: 'tr' }, React.createElement(RuntimeClosed)));
        expect(html).toContain(messages.tr.runtime.title);
        expect(html).not.toContain(messages.en.runtime.title);
    });

    it('defaults to English without a provider', async () => {
        const { RuntimeClosed } = await import('@/components/RuntimeClosed');
        expect(renderToStaticMarkup(React.createElement(RuntimeClosed))).toContain(messages.en.runtime.title);
    });
});

describe('locale-aware copy helpers', () => {
    it('translate purchase, conversion and upload messages', () => {
        expect(purchaseErrorMessage(new Error('livepeer_sales_closed'), 'tr')).toBe(messages.tr.purchaseErrors.salesClosed);
        expect(paymentErrorMessage('payment_mode_mismatch', 'tr')).toBe(messages.tr.conversion.errors.modeMismatch);
        expect(checkoutStateLabel('converting', 'tr')).toBe(messages.tr.conversion.states.converting);
        expect(uploadErrorMessage(new Error('livepeer_wallet_rejected'), false, 'tr')).toBe(messages.tr.upload.errors.walletRejected);
        expect(uploadErrorMessage(new Error('livepeer_draft_invalid'), false, 'tr'))
            .toBe('Kurtarma bilgisi geçersiz (livepeer_draft_invalid). Bu yüklemeyi koru ve tekrar denemeden önce mevcut imza ya da ödeme girişimini kontrol et.');
        expect(fileValidationMessage('empty_file', 'tr')).toBe(messages.tr.upload.fileErrors.empty);
        expect(localizedPublicationView({ isError: false, data: { publication: {} } }, 'tr').buttonLabel)
            .toBe(messages.tr.upload.publication.readyButton);
    });

    it('keep English as the default for existing callers', () => {
        expect(purchaseErrorMessage(new Error('livepeer_sales_closed'))).toBe('Ticket sales are paused for this video.');
        expect(checkoutStateLabel('converting')).toBe('Converting to USDC…');
    });
});
