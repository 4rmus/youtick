import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Static guards for the Sahne accessibility pass (G17); the browser audit covers rendered pages.
const files = execFileSync('git', ['ls-files', 'app/*.tsx', 'components/*.tsx'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((file) => ({ file, source: readFileSync(file, 'utf8') }));

describe('Sahne accessibility guards', () => {
    it('never removes the focus outline without a visible replacement', () => {
        const offenders = files.flatMap(({ file, source }) => source.split('\n')
            .filter((line) => /(^|[\s"'`])outline-none\b/.test(line) && !/focus-visible:(ring|outline-2)|focus-within/.test(line)
                && !file.endsWith('components/ui/field.tsx') && !file.endsWith('components/discover/ProgramSection.tsx'))
            .map((line) => `${file}: ${line.trim().slice(0, 80)}`));
        expect(offenders).toEqual([]);
    });

    it('keeps interactive controls at least 44 px tall', () => {
        const offenders = files.flatMap(({ file, source }) => source.split('\n')
            .filter((line) => /<(button|select|input)\b[^>]*\b(h-(8|9|10)|min-h-(8|9|10))\b/.test(line)
                || /const (select|control) = '[^']*\bh-(8|9|10)\b/.test(line))
            .map((line) => `${file}: ${line.trim().slice(0, 80)}`));
        expect(offenders).toEqual([]);
    });

    it('uses Sahne colour tokens instead of the retired palette in UI files', () => {
        const offenders = files.filter(({ source }) => /near-(green|red)|\bzinc-\d|\bemerald-\d|\bamber-\d|\bred-\d{3}/.test(source)).map(({ file }) => file);
        expect(offenders).toEqual([]);
    });

    it('stops motion for users who ask for less', () => {
        const css = readFileSync('app/globals.css', 'utf8');
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important[\s\S]*transition-duration: 0\.01ms !important/);
    });
});
