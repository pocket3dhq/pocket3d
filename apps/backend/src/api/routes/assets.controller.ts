import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { UpdateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.asset.dto';
import { CreateUploadLinkDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.upload.link.dto';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { ListAssetsDto } from '@pocket3d/nestjs-libraries/dtos/assets/list.assets.dto';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

// The signed-in org's models (behind AuthMiddleware)
@ApiTags('Models')
@Controller('/assets')
export class AssetsController {
  constructor(
    private _assetsService: AssetsService,
    private _uploadTicketsService: UploadTicketsService
  ) {}

  @Get('/')
  list(@GetOrgFromRequest() org: AuthOrg, @Query() query: ListAssetsDto) {
    return this._assetsService.listForOrg(org.id, query.page);
  }

  // Uploading from the dashboard: this JSON route hands out a single-use upload
  // link, and the browser sends the file straight to it (POST
  // /public/v1/uploads/:token), so a dashboard upload gets the same sniffing,
  // size cap and storage check as every other upload
  @Post('/upload-link')
  async createUploadLink(
    @GetOrgFromRequest() org: AuthOrg,
    @Body() body: CreateUploadLinkDto
  ) {
    const { url, expiresAt } = await this._uploadTicketsService.create(
      org.id,
      body.title
    );
    return { url, expiresAt };
  }

  @Put('/:id')
  rename(
    @GetOrgFromRequest() org: AuthOrg,
    @Param('id') id: string,
    @Body() body: UpdateAssetDto
  ) {
    return this._assetsService.rename(org.id, id, body.title);
  }

  @Delete('/:id')
  remove(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.remove(org.id, id);
  }
}
