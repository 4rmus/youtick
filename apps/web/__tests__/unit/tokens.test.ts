import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { StatusLine } from '@/components/ui/status-line';
import { Steps } from '@/components/ui/steps';

const css = readFileSync('app/globals.css', 'utf8');

function token(name: string): string {
    const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6});`));
    if (!match) throw new Error(`missing token ${name}`);
    return match[1];
}

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
    const [light, dark] = [luminance(token(foreground)), luminance(token(background))].sort((a, b) => b - a);
    return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

describe('Sahne tokens', () => {
    it.each([
        ['light', 'ink', 18.14],
        ['light-2', 'ink', 11.92],
        ['light-3', 'ink', 7.83],
        ['ice', 'ink', 12.18],
        ['alert', 'ink', 8.64],
        ['light', 'panel', 17.02],
        ['light-2', 'panel', 11.19],
        ['light-3', 'panel', 7.34],
        ['alert', 'panel', 8.11],
        ['light-3', 'raised', 6.73],
        ['ink', 'light', 18.14],
        ['ink', 'ice', 12.18],
        ['ice', 'ice-deep', 9.07],
        ['alert', 'alert-deep', 7.34],
        ['light-3', 'poster-dark', 7.21],
    ])('%s on %s keeps a %s:1 contrast', (foreground, background, ratio) => {
        expect(contrast(foreground, background)).toBe(ratio);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['ink', 'panel', 'raised'])('form control edges stay at least 3:1 on %s', (background) => {
        expect(contrast('edge', background)).toBeGreaterThanOrEqual(3);
    });

    it('has one colour source and no unused shadcn tokens', () => {
        expect(existsSync('tailwind.config.js')).toBe(false);
        expect(css).not.toMatch(/--(chart|sidebar)-/);
        expect(css).not.toMatch(/oklch\(/);
        expect(css).not.toMatch(/--(color-)?near-/);
        expect(css).not.toContain('var(--near-');
    });

    it('loads Archivo with the width axis on <html> and keeps the self-hosted font policy', () => {
        const layout = readFileSync('app/layout.tsx', 'utf8');
        expect(layout).toContain("Archivo({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--font-archivo' })");
        expect(layout).toMatch(/<html [^>]*className=\{archivo\.variable\}/);
        expect(layout).not.toContain('Geist');
        expect(css).toContain('--font-sans: var(--font-archivo)');
        expect(readFileSync('middleware.ts', 'utf8')).toContain(`"font-src 'self' data:"`);
    });
});

describe('Sahne primitives', () => {
    const Status = StatusLine as React.FC<{ tone: 'progress' | 'error' }>;
    const html = (element: React.ReactElement) => renderToStaticMarkup(element);

    it('keeps 44 px targets, the 2 px corner and the ice focus ring on buttons', () => {
        for (const size of ['default', 'sm', 'lg', 'icon'] as const) {
            const markup = html(React.createElement(Button, { size }, 'Buy'));
            expect(markup).toMatch(/min-h-1[1-4]|h-11 w-11/);
            expect(markup).toContain('rounded-xs');
            expect(markup).toContain('focus-visible:outline-ice');
        }
        expect(html(React.createElement(Button, null, 'Buy'))).toContain('bg-light');
    });

    it('renders chips by state', () => {
        expect(html(React.createElement(Chip, { tone: 'owned' }, 'Ticket'))).toContain('bg-ice text-ink');
        expect(html(React.createElement(Chip, { tone: 'paused' }, 'Paused'))).toContain('text-alert');
    });

    it('wires field label, hint and error to the input', () => {
        const markup = html(React.createElement(Field, { id: 'price', label: 'Ticket price', hint: 'At least 2 USDC.', error: 'Too low', suffix: 'USDC', numeric: true }));
        expect(markup).toContain('<label for="price"');
        expect(markup).toContain('aria-describedby="price-hint price-error"');
        expect(markup).toContain('aria-invalid="true"');
        expect(markup).toContain('role="alert"');
        expect(markup).toContain('border-alert');
    });

    it('marks the active step and announces status lines', () => {
        const markup = html(React.createElement(Steps, {
            label: 'Publication steps',
            steps: [
                { label: 'File', state: 'complete' },
                { label: 'Details', state: 'active' },
                { label: 'Payment', state: 'failed' },
                { label: 'Upload', state: 'pending' },
            ],
        }));
        expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
        expect(markup).toContain('aria-label="Publication steps"');
        expect(html(React.createElement(Status, { tone: 'progress' }, 'Checking'))).toContain('role="status"');
        expect(html(React.createElement(Status, { tone: 'error' }, 'Failed'))).toContain('role="alert"');
    });
});
