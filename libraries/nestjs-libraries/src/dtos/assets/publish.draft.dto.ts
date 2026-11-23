import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

// POST /assets/:id/versions/:n/publish
export class PublishDraftDto {
  @ApiPropertyOptional({ description: 'Also make it the version the link shows', default: false })
  @IsOptional()
  @IsBoolean()
  live?: boolean;
}
