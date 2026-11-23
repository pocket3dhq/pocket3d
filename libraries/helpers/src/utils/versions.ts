// Shared rules for model versions (v1, v2...): the backend, the MCP tools and
// the frontend's viewer all read numbers and notes through these

// Versions a model keeps at once (drafts included; deleted ones don't count).
// Bounds what one model can hold and what its history page lists
export const MAX_VERSIONS_PER_MODEL = 200;

// The highest number a version can have (numbers only go up)
export const MAX_VERSION_NUMBER = 999_999;

export const NOTE_MAX_LENGTH = 280;

// A version number as people and agents write it: 3, "3" or "v3".
// null for anything else
export const versionNumberFrom = (ref: unknown): number | null => {
  if (typeof ref === 'number') {
    return Number.isInteger(ref) && ref >= 1 && ref <= MAX_VERSION_NUMBER ? ref : null;
  }
  if (typeof ref !== 'string') {
    return null;
  }
  const match = ref.trim().match(/^v?([1-9]\d{0,5})$/i);
  return match ? Number(match[1]) : null;
};

// Characters that change how text displays without being visible: control
// characters (newlines become spaces) and the bidirectional overrides and
// isolates that can make a note read differently than it is written
const CONTROL = /[\u0000-\u001F\u007F-\u009F]+/g;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

// What changed in a version, as one plain line of up to 280 characters.
// Never rejects (a multipart upload is already stored when its fields are
// validated): it cleans and cuts instead. '' when nothing is left
export const cleanNote = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(CONTROL, ' ').replace(BIDI, '').replace(/\s+/g, ' ').trim();
  // by code point, so an emoji is never cut in half
  return Array.from(cleaned).slice(0, NOTE_MAX_LENGTH).join('').trim();
};
