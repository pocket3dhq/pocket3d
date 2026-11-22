import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

// The secret from an emailed link (activation)
export class TokenDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9]{20,100}$/, { message: 'This link is invalid' })
  token: string;
}
