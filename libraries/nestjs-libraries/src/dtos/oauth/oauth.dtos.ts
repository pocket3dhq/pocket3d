import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// OAuth clients are other people's software: every field is optional and
// loosely typed here, and OAuthService checks the meaning, so a mistake gets
// the RFC error shape ({ error, error_description }) instead of a Nest 400
const MAX = 2000;

// RFC 7591 dynamic client registration (POST /oauth/register)
export class RegisterClientDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(MAX, { each: true })
  redirect_uris?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX)
  client_name?: string;

  @ApiPropertyOptional({ enum: ['none', 'client_secret_post', 'client_secret_basic'] })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  token_endpoint_auth_method?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  grant_types?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  response_types?: string[];
}

// The query of MAIN_URL/oauth/authorize, as the consent page passes it on
export class AuthorizeRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) response_type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) client_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) redirect_uri?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) code_challenge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) code_challenge_method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) scope?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) resource?: string;
}

// The consent page's answer (POST /oauth/authorize, signed in)
export class ConsentDto extends AuthorizeRequestDto {
  @ApiPropertyOptional()
  @IsBoolean()
  allow: boolean;
}

// POST /oauth/token (form-encoded or JSON)
export class TokenRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) grant_type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) redirect_uri?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) client_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) client_secret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) code_verifier?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) refresh_token?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) resource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) scope?: string;
}

// RFC 7009 (POST /oauth/revoke)
export class RevokeTokenDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) token?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) token_type_hint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) client_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX) client_secret?: string;
}
