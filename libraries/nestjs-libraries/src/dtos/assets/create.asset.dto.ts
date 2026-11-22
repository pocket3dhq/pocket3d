import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
