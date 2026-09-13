import { safePreviewUrl } from './livepeer-playback';

export type PreviewCue = { start: number; end: number; url: string; crop?: { x: number; y: number; width: number; height: number } };
const MAX_VTT_BYTES = 1_048_576;
const MAX_IMAGE_BYTES = 4_194_304;

function timestamp(value: string): number {
    const match = /^(?:(\d{2}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
    return match ? Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : NaN;
}

export function parsePreviewVtt(body: string, source: string): PreviewCue[] {
    if (!safePreviewUrl(source) || body.length > MAX_VTT_BYTES) return [];
    const blocks = body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[\t ]*\n/);
    if (!/^WEBVTT(?:[\t ].*)?$/.test(blocks.shift() ?? '')) return [];
    const cues: PreviewCue[] = [];
    for (const block of blocks) {
        if (/^(NOTE|STYLE|REGION)(?:[\t \n]|$)/.test(block)) continue;
        const lines = block.split('\n').map(line => line.trim());
        const index = lines.findIndex(line => line.includes('-->'));
        if (index < 0) continue;
        const times = /^(\S+)\s+-->\s+(\S+)(?:[\t ].*)?$/.exec(lines[index]);
        if (!times || lines.length !== index + 2 || cues.length >= 10_000) return [];
        const start = timestamp(times[1]), end = timestamp(times[2]);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (cues.length && start < cues[cues.length - 1].end)) return [];
        let image: URL;
        try { image = new URL(lines[index + 1], source); } catch { return []; }
        const fragment = image.hash;
        image.hash = '';
        const url = safePreviewUrl(image.href);
        if (!url) return [];
        let crop: PreviewCue['crop'];
        if (fragment) {
            const match = /^#xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(fragment);
            if (!match) return [];
            const [x, y, width, height] = match.slice(1).map(Number);
            if (![x, y, width, height].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 8192) || !width || !height) return [];
            crop = { x, y, width, height };
        }
        cues.push({ start, end, url, ...(crop ? { crop } : {}) });
    }
    return cues;
}

async function readProtectedPreview(url: string, token: string, signal: AbortSignal, limit: number): Promise<{ bytes: Uint8Array; type: string }> {
    if (!safePreviewUrl(url) || !token) throw new Error('preview_unavailable');
    const active = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    active.throwIfAborted();
    const response = await fetch(url, { headers: { 'Livepeer-Jwt': token }, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: active });
    if (response.status !== 200 || response.redirected || !response.body || Number(response.headers.get('Content-Length')) > limit) {
        await response.body?.cancel().catch(() => {});
        throw new Error('preview_unavailable');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            active.throwIfAborted();
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) throw new Error('preview_unavailable');
            chunks.push(chunk.value);
        }
        active.throwIfAborted();
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, type: response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '' };
}

export async function loadPreviewVtt(url: string, token: string, signal: AbortSignal): Promise<PreviewCue[]> {
    const { bytes } = await readProtectedPreview(url, token, signal, MAX_VTT_BYTES);
    return parsePreviewVtt(new TextDecoder('utf-8', { fatal: true }).decode(bytes), url);
}

export async function loadPreviewImage(url: string, token: string, signal: AbortSignal) {
    const { bytes, type } = await readProtectedPreview(url, token, signal, MAX_IMAGE_BYTES);
    const valid = type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        || type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
        || type === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw new Error('preview_unavailable');
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    signal.throwIfAborted();
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error('preview_unavailable');
    return { blob, width, height };
}
