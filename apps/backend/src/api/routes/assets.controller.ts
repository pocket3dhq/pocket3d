import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { UpdateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.asset.dto';
import { ListAssetsDto } from '@pocket3d/nestjs-libraries/dtos/assets/list.assets.dto';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

// The signed-in org's models (behind AuthMiddleware)
@ApiTags('Models')
@Controller('/assets')
export class AssetsController {
  constructor(private _assetsService: AssetsService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: AuthOrg, @Query() query: ListAssetsDto) {
    return this._assetsService.listForOrg(org.id, query.page);
  }

  @Put('/:id')
  rename(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string, @Body() body: UpdateAssetDto) {
    return this._assetsService.rename(org.id, id, body.title);
  }

  @Delete('/:id')
  remove(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.remove(org.id, id);
  }
}
