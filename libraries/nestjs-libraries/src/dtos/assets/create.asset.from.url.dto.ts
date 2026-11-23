import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
import { TITLE_MAX_LENGTH } from './create.asset.dto';
import { CleanNote } from './version.transforms';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

// POST /public/v1/assets/from-url and the MCP publish_from_url tool: a model
// that is already on the web (an AI 3D generator's output, a CDN...)
export class CreateAssetFromUrlDto {
  @ApiProperty({ description: 'Public http(s) URL of a .glb (up to 95 MB)', example: 'https://example.com/robot.glb' })
  @IsString()
  @MaxLength(2000)
  @IsUrl(URL_OPTIONS, { message: 'url must be an http(s) URL' })
  url: string;

  @ApiPropertyOptional({ description: 'Public http(s) URL of a PNG/JPEG/WebP cover for link previews (up to 5 MB)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @IsUrl(URL_OPTIONS, { message: 'coverUrl must be an http(s) URL' })
  coverUrl?: string;

  @ApiPropertyOptional({ maxLength: TITLE_MAX_LENGTH, description: 'Defaults to the file name' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().slice(0, TITLE_MAX_LENGTH) : value))
  title?: string;

  @ApiPropertyOptional({ description: 'What this version is or changed (up to 280 characters)', maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @CleanNote()
  note?: string;
}

// POST /public/v1/assets/:id/versions/from-url: nothing is downloaded before
// this is validated, so it may reject
export class CreateVersionFromUrlDto extends PickType(CreateAssetFromUrlDto, ['url', 'coverUrl', 'note'] as const) {
  @ApiPropertyOptional({ description: 'true: keep it private and not live until published', default: false })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
