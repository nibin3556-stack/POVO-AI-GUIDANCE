/** Joins truthy class names (a tiny clsx). */
export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');
