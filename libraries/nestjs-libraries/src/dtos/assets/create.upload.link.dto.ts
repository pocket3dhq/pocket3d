import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
import { TITLE_MAX_LENGTH } from './create.asset.dto';
import { CleanNote } from './version.transforms';

// POST /assets/upload-link: the dashboard asks for a single-use upload link
// right before sending a file to it
export class CreateUploadLinkDto {
  @ApiPropertyOptional({
    description:
      'Used when the upload itself sends no title. Defaults to the file name. Only for new models.',
    maxLength: TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ description: 'Add a version to this model (its id or link) instead of creating one' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  model?: string;

  @ApiPropertyOptional({ maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @CleanNote()
  note?: string;

  @ApiPropertyOptional({ description: 'With model: upload it as a private draft', default: false })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
