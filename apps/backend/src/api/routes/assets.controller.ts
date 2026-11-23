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
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { VersionSource } from '@prisma/client';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { UpdateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.asset.dto';
import { UpdateVersionDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.version.dto';
import { PublishDraftDto } from '@pocket3d/nestjs-libraries/dtos/assets/publish.draft.dto';
import { CreateUploadLinkDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.upload.link.dto';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { ListAssetsDto } from '@pocket3d/nestjs-libraries/dtos/assets/list.assets.dto';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

const MODEL_PARAM = { name: 'id', description: 'The model id' };
const VERSION_PARAM = { name: 'n', description: 'The version number: 3 or v3' };

// The signed-in org's models (behind AuthMiddleware: JSON bodies only, the
// session cookie). Every route acts on the session's org only
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
  // size cap and storage check as every other upload. With `model`, the link
  // adds a version to that model (only one of this org's)
  @Post('/upload-link')
  async createUploadLink(
    @GetOrgFromRequest() org: AuthOrg,
    @Body() body: CreateUploadLinkDto
  ) {
    const { url, expiresAt, model, draft } = await this._uploadTicketsService.create(org.id, {
      title: body.title,
      model: body.model,
      note: body.note,
      draft: body.draft,
      source: VersionSource.DASHBOARD,
    });
    return { url, expiresAt, model, draft };
  }

  // The model with every version, drafts included
  @Get('/:id')
  @ApiParam(MODEL_PARAM)
  get(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.getOwnedAsset(org.id, id);
  }

  // Rename, change the live version (a rollback), or both
  @Put('/:id')
  @ApiParam(MODEL_PARAM)
  update(
    @GetOrgFromRequest() org: AuthOrg,
    @Param('id') id: string,
    @Body() body: UpdateAssetDto
  ) {
    return this._assetsService.update(org.id, id, body);
  }

  @Delete('/:id')
  @ApiParam(MODEL_PARAM)
  remove(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.remove(org.id, id);
  }

  @Post('/:id/versions/:n/publish')
  @ApiParam(MODEL_PARAM)
  @ApiParam(VERSION_PARAM)
  publishDraft(
    @GetOrgFromRequest() org: AuthOrg,
    @Param('id') id: string,
    @Param('n') n: string,
    @Body() body: PublishDraftDto
  ) {
    return this._assetsService.publishDraft(org.id, id, n, !!body.live);
  }

  @Put('/:id/versions/:n')
  @ApiParam(MODEL_PARAM)
  @ApiParam(VERSION_PARAM)
  updateVersion(
    @GetOrgFromRequest() org: AuthOrg,
    @Param('id') id: string,
    @Param('n') n: string,
    @Body() body: UpdateVersionDto
  ) {
    return this._assetsService.updateNote(org.id, id, n, body.note);
  }

  @Delete('/:id/versions/:n')
  @ApiParam(MODEL_PARAM)
  @ApiParam(VERSION_PARAM)
  removeVersion(
    @GetOrgFromRequest() org: AuthOrg,
    @Param('id') id: string,
    @Param('n') n: string
  ) {
    return this._assetsService.deleteVersion(org.id, id, n);
  }
}
