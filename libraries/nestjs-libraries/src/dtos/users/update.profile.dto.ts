import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { NAME_MAX_LENGTH, Trim } from '@pocket3d/nestjs-libraries/dtos/auth/auth.transforms';

export class UpdateProfileDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH, description: 'Empty clears it' })
  @Trim()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}
