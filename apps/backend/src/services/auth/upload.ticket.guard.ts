import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';

export const UPLOAD_LINK_GONE =
  'This upload link is invalid, expired or already used. Ask for a new one (create_upload_link).';

// POST /public/v1/uploads/:token: the single-use link is the credential.
// Claimed (burned) before the file streams in, so two uploads with the same
// link can't both get through. Sets req.org like PublicAuthMiddleware, so
// StorageLimitGuard and @GetOrgFromRequest work the same
@Injectable()
export class UploadTicketGuard implements CanActivate {
  constructor(private _uploadTicketsService: UploadTicketsService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const claimed = await this._uploadTicketsService.claim(req.params?.token);
    if (!claimed) {
      throw new HttpException(UPLOAD_LINK_GONE, HttpStatus.GONE);
    }
    Object.assign(req, { org: claimed.org, uploadTicketTitle: claimed.title });
    return true;
  }
}
