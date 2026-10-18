import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLaunchStage } from '@/lib/constants';

const STAGE_KEYS = ['NEXT_PUBLIC_LAUNCH_STAGE', 'NEXT_PUBLIC_LAUNCH_STAGE_RELEASE'] as const;

async function loadLaunchStage(env: Partial<Record<typeof STAGE_KEYS[number], string>>, nodeEnv?: string) {
    vi.resetModules();
    for (const key of STAGE_KEYS) {
        if (env[key] === undefined) delete process.env[key];
        else process.env[key] = env[key];
    }
    if (nodeEnv) vi.stubEnv('NODE_ENV', nodeEnv);
    const { LAUNCH_STAGE } = await import('@/lib/constants');
    return LAUNCH_STAGE;
}

describe('launch stage (design-language plan §4.3, G1)', () => {
    afterEach(() => {
        for (const key of STAGE_KEYS) delete process.env[key];
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('defaults to prova when no stage variable is set', () => {
        expect(resolveLaunchStage({ stage: undefined, release: undefined, nodeEnv: 'production' })).toBe('prova');
        expect(resolveLaunchStage({ stage: '', release: undefined, nodeEnv: 'production' })).toBe('prova');
        expect(resolveLaunchStage({ stage: '  ', release: 'gala', nodeEnv: 'production' })).toBe('prova');
    });

    it('rejects unknown stage values', () => {
        for (const value of ['Prova', 'beta', 'launch', 'gala vizyon']) {
            expect(() => resolveLaunchStage({ stage: value, release: value, nodeEnv: 'development' }))
                .toThrow('NEXT_PUBLIC_LAUNCH_STAGE must be prova, gala or vizyon');
        }
    });

    it('refuses gala and vizyon in a production build without the explicit release variable', () => {
        for (const stage of ['gala', 'vizyon'] as const) {
            expect(() => resolveLaunchStage({ stage, release: undefined, nodeEnv: 'production' }))
                .toThrow(`launch stage ${stage} needs NEXT_PUBLIC_LAUNCH_STAGE_RELEASE=${stage} in a production build`);
            expect(() => resolveLaunchStage({ stage, release: 'prova', nodeEnv: 'production' })).toThrow();
            expect(() => resolveLaunchStage({ stage, release: 'true', nodeEnv: 'production' })).toThrow();
            expect(resolveLaunchStage({ stage, release: stage, nodeEnv: 'production' })).toBe(stage);
            // Outside production the stage variable alone selects the layer (local review of a later layer).
            expect(resolveLaunchStage({ stage, release: undefined, nodeEnv: 'development' })).toBe(stage);
            expect(resolveLaunchStage({ stage, release: undefined, nodeEnv: 'test' })).toBe(stage);
        }
        expect(resolveLaunchStage({ stage: 'prova', release: undefined, nodeEnv: 'production' })).toBe('prova');
    });

    it('exposes the configured stage from the environment, prova unless released otherwise', async () => {
        expect(await loadLaunchStage({})).toBe('prova');
        expect(await loadLaunchStage({ NEXT_PUBLIC_LAUNCH_STAGE: 'gala' })).toBe('gala');
        await expect(loadLaunchStage({ NEXT_PUBLIC_LAUNCH_STAGE: 'gala' }, 'production'))
            .rejects.toThrow('NEXT_PUBLIC_LAUNCH_STAGE_RELEASE=gala');
        expect(await loadLaunchStage(
            { NEXT_PUBLIC_LAUNCH_STAGE: 'vizyon', NEXT_PUBLIC_LAUNCH_STAGE_RELEASE: 'vizyon' },
            'production',
        )).toBe('vizyon');
        // A release variable on its own never changes the stage.
        expect(await loadLaunchStage({ NEXT_PUBLIC_LAUNCH_STAGE_RELEASE: 'gala' }, 'production')).toBe('prova');
    });
});
