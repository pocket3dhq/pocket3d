import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@pocket3d/nestjs-libraries/services/password';
import { NAME_MAX_LENGTH, NormalizeEmail, Trim } from './auth.transforms';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;
}
