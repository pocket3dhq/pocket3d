import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';

// No auth: anyone with the link may see the model. Feeds the viewer page
@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(private _assetsService: AssetsService) {}

  @Get('/assets/:id')
  async getAsset(@Param('id') id: string) {
    const asset = await this._assetsService.getPublicAsset(id);
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    return asset;
  }
}
