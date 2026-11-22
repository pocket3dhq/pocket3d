import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';
import { TITLE_MAX_LENGTH } from './create.asset.dto';

export class UpdateAssetDto {
  @ApiProperty({ maxLength: TITLE_MAX_LENGTH })
  @Trim()
  @IsString()
  @MinLength(1, { message: 'The title cannot be empty' })
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;
}
