import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';

export const API_KEY_NAME_MAX_LENGTH = 60;

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Claude Code on my laptop', maxLength: API_KEY_NAME_MAX_LENGTH })
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Give the key a name' })
  @MaxLength(API_KEY_NAME_MAX_LENGTH)
  name: string;
}
