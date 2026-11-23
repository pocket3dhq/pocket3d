import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
import { CleanNote, MultipartFlag } from './version.transforms';

// The text fields of POST /public/v1/assets/:id/versions (multipart). They
// never reject (see CleanNote): the files are stored before they are read
export class CreateVersionDto {
  @ApiPropertyOptional({ description: 'What changed, shown in the history (up to 280 characters)', maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @CleanNote()
  note?: string;

  @ApiPropertyOptional({
    description: 'true: keep it private and not live until published (POST …/versions/{n}/publish)',
    default: false,
  })
  @IsOptional()
  @MultipartFlag()
  @IsBoolean()
  draft?: boolean;
}
