import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';

export const UPLOAD_LINK_GONE =
  'This upload link is invalid, expired or already used. Ask for a new one (create_upload_link).';

// POST /public/v1/uploads/:token: the single-use link is the credential.
// Claimed (burned) before the file streams in, so two uploads with the same
// link can't both get through. Sets req.org like PublicAuthMiddleware, so
// StorageLimitGuard and @GetOrgFromRequest work the same, and req.uploadTicket
// with what the link allows (a new model, or a version of one model). A link
// made for a model that was deleted since is refused here, before the file
// streams in
@Injectable()
export class UploadTicketGuard implements CanActivate {
  constructor(
    private _uploadTicketsService: UploadTicketsService,
    private _assetsService: AssetsService
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const claimed = await this._uploadTicketsService.claim(req.params?.token);
    if (!claimed) {
      throw new HttpException(UPLOAD_LINK_GONE, HttpStatus.GONE);
    }
    Object.assign(req, { org: claimed.org, uploadTicket: claimed });
    if (claimed.assetId) {
      await this._assetsService.checkVersionTarget(claimed.org.id, claimed.assetId);
    }
    return true;
  }
}
