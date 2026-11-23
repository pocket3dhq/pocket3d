import { Transform } from 'class-transformer';
import { cleanNote, versionNumberFrom } from '@pocket3d/helpers/utils/versions';

// A note cleaned and cut to length (services/versions.ts), never rejected:
// in a multipart upload the files are already stored when the fields are
// validated, and a rejection would leave them orphaned
export const CleanNote = () => Transform(({ value }) => (typeof value === 'string' ? cleanNote(value) : undefined));

// Multipart fields are strings: "true" / "1" mean yes, anything else no
export const MultipartFlag = () =>
  Transform(({ value }) => value === true || (typeof value === 'string' && /^(true|1)$/i.test(value.trim())));

// 3, "3" or "v3" → 3; anything else is left for @IsInt to reject
export const VersionNumber = () => Transform(({ value }) => versionNumberFrom(value) ?? value);
