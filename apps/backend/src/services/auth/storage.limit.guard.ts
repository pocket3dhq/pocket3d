import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';

// Before the upload interceptor streams anything into storage: an org that
// is already at its limit is refused without spending bandwidth on the file.
// (Guards run after PublicAuthMiddleware set req.org, before interceptors.)
@Injectable()
export class StorageLimitGuard implements CanActivate {
  constructor(private _assetsService: AssetsService) {}

  async canActivate(context: ExecutionContext) {
    const org = context.switchToHttp().getRequest().org;
    await this._assetsService.assertRoomFor(org.id, 1);
    return true;
  }
}
