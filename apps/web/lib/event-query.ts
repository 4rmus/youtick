export function getLatestEventsQuery(totalCount: number, limit = 100): { from_index: string; limit: number } | null {
    if (!Number.isFinite(totalCount) || totalCount <= 0 || limit <= 0) {
        return null;
    }

    const cappedLimit = Math.min(totalCount, limit);
    return {
        from_index: String(totalCount - cappedLimit),
        limit: cappedLimit,
    };
}
