import { Body, Controller, Delete, Get, Put, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from '@pocket3d/nestjs-libraries/services/auth/auth.service';
import { UpdateProfileDto } from '@pocket3d/nestjs-libraries/dtos/users/update.profile.dto';
import { ChangePasswordDto } from '@pocket3d/nestjs-libraries/dtos/users/change.password.dto';
import { DeleteAccountDto } from '@pocket3d/nestjs-libraries/dtos/users/delete.account.dto';
import { GetSessionIdFromRequest, GetUserFromRequest } from '@pocket3d/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg, AuthUser } from '@pocket3d/nestjs-libraries/user/request.types';
import { clearSessionCookie } from '@pocket3d/nestjs-libraries/services/cookies';

// The signed-in account (behind AuthMiddleware)
@ApiTags('Account')
@Controller('/user')
export class UsersController {
  constructor(private _authService: AuthService) {}

  @Get('/self')
  self(@GetUserFromRequest() user: AuthUser, @GetOrgFromRequest() org: AuthOrg) {
    return this._authService.self(user, org);
  }

  @Put('/self')
  updateSelf(
    @GetUserFromRequest() user: AuthUser,
    @GetOrgFromRequest() org: AuthOrg,
    @Body() body: UpdateProfileDto
  ) {
    return this._authService.updateName(user, org, body.name);
  }

  @Put('/self/password')
  changePassword(
    @GetUserFromRequest() user: AuthUser,
    @GetSessionIdFromRequest() sessionId: string,
    @Body() body: ChangePasswordDto
  ) {
    return this._authService.changePassword(user.id, sessionId, body.currentPassword, body.newPassword);
  }

  @Delete('/self')
  async deleteSelf(
    @GetUserFromRequest() user: AuthUser,
    @GetOrgFromRequest() org: AuthOrg,
    @Body() body: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this._authService.deleteAccount(user, org, body.password);
    clearSessionCookie(res);
    return result;
  }
}
