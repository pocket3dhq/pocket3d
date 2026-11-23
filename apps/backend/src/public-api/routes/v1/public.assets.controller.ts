import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { VersionSource } from '@prisma/client';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { CreateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { CreateVersionDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.version.dto';
import {
  CreateAssetFromUrlDto,
  CreateVersionFromUrlDto,
} from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.from.url.dto';
import { ListAssetsDto } from '@pocket3d/nestjs-libraries/dtos/assets/list.assets.dto';
import { UpdateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.asset.dto';
import { UpdateVersionDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.version.dto';
import { PublishDraftDto } from '@pocket3d/nestjs-libraries/dtos/assets/publish.draft.dto';
import { assetUploadOptions } from '@pocket3d/nestjs-libraries/upload/multer.stream.engine';
import { GetApiKeyFromRequest, GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthApiKey, AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';
import { StorageLimitGuard } from '@pocket3d/backend/services/auth/storage.limit.guard';
import { ModelTargetGuard } from '@pocket3d/backend/services/auth/model.target.guard';

const UPLOAD_FIELDS = FileFieldsInterceptor(
  [
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ],
  assetUploadOptions()
);

const MODEL_PARAM = { name: 'id', description: 'The model id, or its share link (URL-encoded)' };
const VERSION_PARAM = { name: 'n', description: 'The version number: 3 or v3' };

// Who sent a version: the API key's name, shown to the owner in the history
const fromKey = (apiKey: AuthApiKey) => ({ source: VersionSource.API, sourceName: apiKey?.name });

// Rate-limited per account (API_THROTTLE); the guard runs before the storage
// check and before any byte of an upload is read. Every route acts on the
// models of the API key's org only
@ApiTags('Public API')
@ApiHeader({ name: 'Authorization', description: 'Your API key (optionally "Bearer <key>")' })
@UseGuards(ThrottlerGuard)
@SkipThrottle({ ip: true, email: true })
@Throttle(API_THROTTLE.calls)
@Controller('/public/v1/assets')
export class PublicAssetsController {
  constructor(private _assetsService: AssetsService) {}

  @Post('/')
  @Throttle(API_THROTTLE.publish)
  @UseGuards(StorageLimitGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '.glb, up to 95 MB' },
        cover: { type: 'string', format: 'binary', description: 'PNG/JPEG/WebP link-preview image, up to 5 MB' },
        title: { type: 'string', maxLength: 120 },
        note: { type: 'string', maxLength: 280, description: 'Shown in the version history' },
      },
    },
  })
  @UseInterceptors(UPLOAD_FIELDS)
  createAsset(
    @GetOrgFromRequest() org: AuthOrg,
    @GetApiKeyFromRequest() apiKey: AuthApiKey,
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() body: CreateAssetDto
  ) {
    return this._assetsService.createAsset(org.id, body, files?.file?.[0], files?.cover?.[0], fromKey(apiKey));
  }

  // A .glb already on the web: the server downloads it (public addresses only)
  @Post('/from-url')
  @Throttle(API_THROTTLE.fromUrl)
  @UseGuards(StorageLimitGuard)
  createFromUrl(
    @GetOrgFromRequest() org: AuthOrg,
    @GetApiKeyFromRequest() apiKey: AuthApiKey,
    @Body() body: CreateAssetFromUrlDto
  ) {
    return this._assetsService.createFromUrl(org.id, body, fromKey(apiKey));
  }

  @Get('/')
  list(@GetOrgFromRequest() org: AuthOrg, @Query() query: ListAssetsDto) {
    return this._assetsService.listForOrg(org.id, query.page);
  }

  // The model with every version (drafts included) and who sent each
  @Get('/:id')
  @ApiParam(MODEL_PARAM)
  get(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.getOwnedAsset(org.id, id);
  }

  // Rename, change the live version (a rollback), or both
  @Put('/:id')
  @ApiParam(MODEL_PARAM)
  update(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string, @Body() body: UpdateAssetDto) {
    return this._assetsService.update(org.id, id, body);
  }

  @Delete('/:id')
  @ApiParam(MODEL_PARAM)
  remove(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.remove(org.id, id);
  }

  // A new version of the model: same link, live at once (or a private draft
  // with draft=true). ModelTargetGuard refuses another org's model before
  // the upload streams in
  @Post('/:id/versions')
  @ApiParam(MODEL_PARAM)
  @Throttle(API_THROTTLE.publish)
  @UseGuards(ModelTargetGuard, StorageLimitGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '.glb, up to 95 MB' },
        cover: { type: 'string', format: 'binary', description: 'PNG/JPEG/WebP link-preview image, up to 5 MB' },
        note: { type: 'string', maxLength: 280, description: 'What changed' },
        draft: { type: 'boolean', description: 'true: private and not live until published' },
      },
    },
  })
  @UseInterceptors(UPLOAD_FIELDS)
  addVersion(
    @GetOrgFromRequest() org: AuthOrg,
    @GetApiKeyFromRequest() apiKey: AuthApiKey,
    @Param('id') id: string,
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() body: CreateVersionDto
  ) {
    return this._assetsService.addVersion(
      org.id,
      id,
      { file: files?.file?.[0], cover: files?.cover?.[0] },
      { note: body.note, draft: body.draft, origin: fromKey(apiKey) }
    );
  }

  @Post('/:id/versions/from-url')
  @ApiParam(MODEL_PARAM)
  @Throttle(API_THROTTLE.fromUrl)
  @UseGuards(StorageLimitGuard)
  addVersionFromUrl(
    @GetOrgFromRequest() org: AuthOrg,
    @GetApiKeyFromRequest() apiKey: AuthApiKey,
    @Param('id') id: string,
    @Body() body: CreateVersionFromUrlDto
  ) {
    return this._assetsService.addVersionFromUrl(org.id, id, body, fromKey(apiKey));
  }

  // A draft joins the public history (and, with live: true, the link shows it)
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

  // Not the live version, nor the last published one
  @Delete('/:id/versions/:n')
  @ApiParam(MODEL_PARAM)
  @ApiParam(VERSION_PARAM)
  removeVersion(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string, @Param('n') n: string) {
    return this._assetsService.deleteVersion(org.id, id, n);
  }
}
