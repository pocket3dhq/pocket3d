import { Transform } from 'class-transformer';

export const NAME_MAX_LENGTH = 60;

// Emails are compared lowercased and trimmed everywhere
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
