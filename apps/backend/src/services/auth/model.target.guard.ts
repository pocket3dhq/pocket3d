import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';

// Before the upload interceptor streams anything: a new version can only go
// to a model of the caller's org (404 otherwise, so another org's model isn't
// even confirmed to exist) that has room for one more version (409). Nobody
// can spend an org's storage or the server's bandwidth on a model that isn't
// theirs. The transaction that adds the version checks ownership again; this
// guard only makes sure a refused upload is refused before its bytes arrive.
// Guards run after the auth middleware set req.org, before interceptors
@Injectable()
export class ModelTargetGuard implements CanActivate {
  constructor(private _assetsService: AssetsService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    await this._assetsService.checkVersionTarget(req.org.id, String(req.params?.id ?? ''));
    return true;
  }
}
