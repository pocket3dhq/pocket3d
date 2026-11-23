import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_VERSION_NUMBER } from '@pocket3d/helpers/utils/versions';

// GET /public/assets/:id?v=3 (the viewer page sends only valid numbers)
export class GetPublicAssetDto {
  @ApiPropertyOptional({ description: 'A published version to show instead of the live one' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION_NUMBER)
  v?: number;
}
