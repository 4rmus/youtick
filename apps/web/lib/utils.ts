import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function concatenateArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    if (buffers.length === 1) {
        return buffers[0];
    }

    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const buffer of buffers) {
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return combined.buffer;
}

export async function runWithConcurrency<T, R = void>(
    values: T[],
    concurrency: number,
    handler: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(values.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, values.length || 1)) }, async () => {
        while (nextIndex < values.length) {
            const current = nextIndex;
            nextIndex += 1;
            results[current] = await handler(values[current], current);
        }
    });

    await Promise.all(workers);
    return results;
}

export function toBlobPart(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
