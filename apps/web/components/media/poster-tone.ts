export type PosterTone = 'dark' | 'light';

/** FNV-1a 32-bit: small, stable and the same in every runtime. */
function fnv1a(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** The same publication always gets the same poster tone. */
export function posterTone(publicationId: string): PosterTone {
    return fnv1a(publicationId) % 2 === 0 ? 'dark' : 'light';
}
