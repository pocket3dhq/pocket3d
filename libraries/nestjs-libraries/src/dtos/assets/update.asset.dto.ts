import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';
import { MAX_VERSION_NUMBER } from '@pocket3d/helpers/utils/versions';
import { TITLE_MAX_LENGTH } from './create.asset.dto';
import { VersionNumber } from './version.transforms';

// PUT /assets/:id: rename, change the live version, or both (at least one)
export class UpdateAssetDto {
  @ApiPropertyOptional({ maxLength: TITLE_MAX_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'The title cannot be empty' })
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ description: 'The published version the link shows (3 or "v3")', example: 3 })
  @IsOptional()
  @VersionNumber()
  @IsInt({ message: 'liveVersion must be a version number, like 3' })
  @Min(1)
  @Max(MAX_VERSION_NUMBER)
  liveVersion?: number;
}
