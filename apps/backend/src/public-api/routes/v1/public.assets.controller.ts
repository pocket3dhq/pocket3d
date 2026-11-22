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
import { ApiBody, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { CreateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { CreateAssetFromUrlDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.from.url.dto';
import { ListAssetsDto } from '@pocket3d/nestjs-libraries/dtos/assets/list.assets.dto';
import { UpdateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/update.asset.dto';
import { assetUploadOptions } from '@pocket3d/nestjs-libraries/upload/multer.stream.engine';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';
import { StorageLimitGuard } from '@pocket3d/backend/services/auth/storage.limit.guard';

// Rate-limited per account (API_THROTTLE); the guard runs before the storage
// check and before any byte of an upload is read
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
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      assetUploadOptions()
    )
  )
  createAsset(
    @GetOrgFromRequest() org: AuthOrg,
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() body: CreateAssetDto
  ) {
    return this._assetsService.createAsset(org.id, body, files?.file?.[0], files?.cover?.[0]);
  }

  // A .glb already on the web: the server downloads it (public addresses only)
  @Post('/from-url')
  @Throttle(API_THROTTLE.fromUrl)
  @UseGuards(StorageLimitGuard)
  createFromUrl(@GetOrgFromRequest() org: AuthOrg, @Body() body: CreateAssetFromUrlDto) {
    return this._assetsService.createFromUrl(org.id, body);
  }

  @Get('/')
  list(@GetOrgFromRequest() org: AuthOrg, @Query() query: ListAssetsDto) {
    return this._assetsService.listForOrg(org.id, query.page);
  }

  // :id is the model id or its share link (URL-encoded)
  @Put('/:id')
  rename(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string, @Body() body: UpdateAssetDto) {
    return this._assetsService.rename(org.id, id, body.title);
  }

  @Delete('/:id')
  remove(@GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._assetsService.remove(org.id, id);
  }
}
