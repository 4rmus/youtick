import Hls, { AbrController, type Level } from 'hls.js';

export type PlayerQuality = { index: number; label: string };

export function qualityOptions(levels: Pick<Level, 'width' | 'height' | 'bitrate'>[]): PlayerQuality[] {
    return levels.flatMap((level, index) => {
        if (!Number.isSafeInteger(level.width) || !Number.isSafeInteger(level.height) || level.width <= 0 || level.height <= 0) return [];
        const conventional = Math.abs(level.width / level.height - 16 / 9) < 0.02;
        const duplicate = levels.some((other, i) => i !== index && other.width === level.width && other.height === level.height);
        return [{ index, label: `${conventional ? `${level.height}p` : `${level.width} × ${level.height}`}${duplicate ? ` · ${Math.round(level.bitrate / 1000)} kbps` : ''}` }];
    });
}

export function qualityController(onLevels: (instance: Hls, options: PlayerQuality[]) => void, onDestroy: (instance: Hls) => void) {
    return class extends AbrController {
        constructor(hls: Hls) {
            super(hls);
            hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => onLevels(hls, qualityOptions(data.levels)));
            hls.on(Hls.Events.LEVELS_UPDATED, (_event, data) => onLevels(hls, qualityOptions(data.levels)));
            hls.on(Hls.Events.DESTROYING, () => onDestroy(hls));
        }
    };
}

export async function playbackMode(): Promise<'hls' | 'native'> {
    if (Hls.isSupported()) return 'hls';
    if (document.createElement('video').canPlayType('application/vnd.apple.mpegurl')) return 'native';
    throw new Error('livepeer_playback_unsupported');
}
