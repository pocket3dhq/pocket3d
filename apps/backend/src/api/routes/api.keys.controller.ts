import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.service';
import { CreateApiKeyDto } from '@pocket3d/nestjs-libraries/dtos/api-keys/create.api.key.dto';
import { GetUserFromRequest } from '@pocket3d/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthOrg, AuthUser } from '@pocket3d/nestjs-libraries/user/request.types';

// The keys the CLI and agents publish with (behind AuthMiddleware)
@ApiTags('API keys')
@Controller('/api-keys')
export class ApiKeysController {
  constructor(private _apiKeysService: ApiKeysService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: AuthOrg) {
    return this._apiKeysService.list(org.id);
  }

  // The answer holds the full key; it is never shown again
  @Post('/')
  create(@GetOrgFromRequest() org: AuthOrg, @GetUserFromRequest() user: AuthUser, @Body() body: CreateApiKeyDto) {
    return this._apiKeysService.create(org.id, user.id, body.name);
  }

  @Delete('/:id')
  revoke(@GetOrgFromRequest() org: AuthOrg, @Param('id', new ParseUUIDPipe()) id: string) {
    return this._apiKeysService.revoke(org.id, id);
  }
}
