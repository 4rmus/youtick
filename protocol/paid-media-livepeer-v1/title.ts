// Match Rust str::trim (Unicode White_Space) without changing signed title bytes.
export const hasTitleContent = (title: string): boolean => /[^\p{White_Space}]/u.test(title);
