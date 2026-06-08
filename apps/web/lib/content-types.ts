export type ContentTypeLabels = Record<string, string>;

const CONTENT_TYPE_KEY_BY_VALUE: Record<string, string> = {
    Cinema: 'cinema',
    cinema: 'cinema',
    Concert: 'concert',
    concert: 'concert',
    Documentary: 'documentary',
    documentary: 'documentary',
    ShortFilm: 'short_film',
    short_film: 'short_film',
    FestivalSelection: 'festival_selection',
    festival_selection: 'festival_selection',
    Exclusive: 'exclusive',
    exclusive: 'exclusive',
};

export function normalizeContentTypeKey(type?: string | null): string | null {
    if (!type) {
        return null;
    }

    return CONTENT_TYPE_KEY_BY_VALUE[type] ?? type;
}

export function getContentTypeLabel(
    labels: ContentTypeLabels | undefined,
    type?: string | null,
): string | null {
    const key = normalizeContentTypeKey(type);
    if (!key) {
        return null;
    }

    return labels?.[key] ?? type ?? null;
}
