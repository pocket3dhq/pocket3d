import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '@pocket3d/nestjs-libraries/services/password';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Your current password, to confirm' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
