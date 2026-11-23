import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
import { CleanNote, MultipartFlag } from './version.transforms';

export const TITLE_MAX_LENGTH = 120;

export class CreateAssetDto {
  // Trimmed and cut to length instead of rejected: by the time the body is
  // validated the files are already in storage, so a rejection here would
  // leave them orphaned
  @ApiPropertyOptional({
    description: 'Shown on the viewer page and in link previews. Defaults to the file name.',
    maxLength: TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().slice(0, TITLE_MAX_LENGTH) : value
  )
  title?: string;

  @ApiPropertyOptional({ description: 'What this version is or changed (shown in its history)', maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @CleanNote()
  note?: string;

  // Declared so it isn't silently dropped: a new model can't be a draft, and
  // AssetsService says so (after removing the stored files) instead of
  // publishing what the caller meant to keep private
  @ApiPropertyOptional({ description: 'Only for new versions (POST /assets/{id}/versions); a new model is always published' })
  @IsOptional()
  @MultipartFlag()
  @IsBoolean()
  draft?: boolean;
}
