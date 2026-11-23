import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { CreateAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { assetUploadOptions } from '@pocket3d/nestjs-libraries/upload/multer.stream.engine';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';
import { StorageLimitGuard } from '@pocket3d/backend/services/auth/storage.limit.guard';
import { UPLOAD_LINK_GONE, UploadTicketGuard } from '@pocket3d/backend/services/auth/upload.ticket.guard';
import {
  ClaimedTicket,
  UploadTicketsService,
} from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';

// Upload links from the MCP tool create_upload_link and the dashboard: the
// same upload as POST /public/v1/assets (or …/assets/:id/versions when the
// link was made for a model), authorised by a single-use token in the path
// instead of an API key (not behind PublicAuthMiddleware). The browser page
// MAIN_URL/u/<token> uses both routes: GET to show the link, POST to upload
@ApiTags('Public API')
@Controller('/public/v1/uploads')
export class PublicUploadLinkController {
  constructor(
    private _assetsService: AssetsService,
    private _uploadTicketsService: UploadTicketsService
  ) {}

  // Whether the link still works, without using it up. Not rate-limited: the
  // upload page asks from the Next.js server, so every visitor would share
  // one IP (and it's a single lookup of an unguessable token)
  @Get('/:token')
  @ApiParam({ name: 'token', description: 'From create_upload_link' })
  async checkLink(@Param('token') token: string) {
    const ticket = await this._uploadTicketsService.peek(token);
    if (!ticket) {
      throw new HttpException(UPLOAD_LINK_GONE, HttpStatus.GONE);
    }
    return ticket;
  }

  // Per IP (the link has no account yet), counted before the link is used up
  @Post('/:token')
  @ApiParam({ name: 'token', description: 'From create_upload_link; works once, expires after 10 minutes' })
  @SkipThrottle({ email: true })
  @Throttle(API_THROTTLE.uploadLink)
  @UseGuards(ThrottlerGuard, UploadTicketGuard, StorageLimitGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '.glb, up to 95 MB' },
        cover: { type: 'string', format: 'binary', description: 'PNG/JPEG/WebP link-preview image, up to 5 MB' },
        title: { type: 'string', maxLength: 120, description: 'New models only' },
        note: { type: 'string', maxLength: 280, description: 'What this version is or changed' },
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
    @Param('token') _token: string,
    @GetOrgFromRequest() org: AuthOrg,
    @Req() req: Request & { uploadTicket: ClaimedTicket },
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() body: CreateAssetDto
  ) {
    const ticket = req.uploadTicket;
    const file = files?.file?.[0];
    const cover = files?.cover?.[0];
    const note = body.note || ticket.note || undefined;
    const origin = { source: ticket.source, sourceName: ticket.sourceName };
    if (ticket.assetId) {
      // the link was made for this model of this org; the transaction checks
      // both again. Draft or not is the link's call, never the body's
      return this._assetsService.addVersion(org.id, ticket.assetId, { file, cover }, { note, draft: ticket.draft, origin });
    }
    const title = body.title || ticket.title || undefined;
    return this._assetsService.createAsset(org.id, { title, note }, file, cover, origin);
  }
}
