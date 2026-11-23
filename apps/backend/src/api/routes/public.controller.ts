import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { GetPublicAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/get.public.asset.dto';

// No auth: anyone with the link may see the model and its published
// versions (never drafts). Feeds the viewer page
@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(private _assetsService: AssetsService) {}

  @Get('/assets/:id')
  async getAsset(@Param('id') id: string, @Query() query: GetPublicAssetDto) {
    const asset = await this._assetsService.getPublicView(id, query.v);
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    return asset;
  }
}
