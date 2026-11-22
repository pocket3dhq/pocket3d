import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';
import { TITLE_MAX_LENGTH } from './create.asset.dto';

// POST /assets/upload-link: the dashboard asks for a single-use upload link
// right before sending a file to it
export class CreateUploadLinkDto {
  @ApiPropertyOptional({
    description:
      'Used when the upload itself sends no title. Defaults to the file name.',
    maxLength: TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;
}
