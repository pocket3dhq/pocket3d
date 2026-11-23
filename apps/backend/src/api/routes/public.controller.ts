import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { StatKind } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.repository';
import { SessionsService } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.service';
import { GetPublicAssetDto } from '@pocket3d/nestjs-libraries/dtos/assets/get.public.asset.dto';
import { readCookie, SESSION_COOKIE } from '@pocket3d/nestjs-libraries/services/cookies';
import { THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// Crawlers that run JavaScript but aren't people (link unfurlers mostly
// don't run it at all, so they never send a beacon)
const BOT_AGENT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|telegram|headless|lighthouse/i;

// No auth: anyone with the link may see the model and its published
// versions (never drafts). Feeds the viewer page
@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(private _assetsService: AssetsService, private _sessionsService: SessionsService) {}

  @Get('/assets/:id')
  async getAsset(@Param('id') id: string, @Query() query: GetPublicAssetDto) {
    const asset = await this._assetsService.getPublicView(id, query.v);
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    return asset;
  }

  // The viewer page's beacons (navigator.sendBeacon, no body): a visit to
  // the share link, a click on its Download button. Always 204, counted or
  // not, so they never tell whether a model exists
  @Post('/assets/:id/views')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle(THROTTLE.stats)
  async view(@Param('id') id: string, @Req() req: Request) {
    await this.count(id, 'views', req);
  }

  @Post('/assets/:id/downloads')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle(THROTTLE.stats)
  async download(@Param('id') id: string, @Req() req: Request) {
    await this.count(id, 'downloads', req);
  }

  private async count(id: string, kind: StatKind, req: Request) {
    if (BOT_AGENT.test(String(req.headers['user-agent'] || ''))) {
      return;
    }
    // Signed in: the owner's own visits don't count. Read only, and a bad
    // or missing cookie just means "a visitor"
    const session = await this._sessionsService.validate(readCookie(req, SESSION_COOKIE)).catch(() => null);
    await this._assetsService.recordStat(id, kind, session?.org?.id);
  }
}
