import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';
import { GetApiKeyFromRequest, GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { AuthApiKey, AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

// `pocket3d whoami` / `pocket3d login`: is this key good, and whose is it?
@ApiTags('Public API')
@ApiHeader({ name: 'Authorization', description: 'Your API key (optionally "Bearer <key>")' })
@UseGuards(ThrottlerGuard)
@SkipThrottle({ ip: true, email: true })
@Throttle(API_THROTTLE.calls)
@Controller('/public/v1/me')
export class PublicMeController {
  @Get('/')
  me(@GetOrgFromRequest() org: AuthOrg, @GetApiKeyFromRequest() apiKey: AuthApiKey) {
    return {
      organization: { id: org.id, name: org.name },
      apiKey: { name: apiKey.name, prefix: apiKey.prefix },
    };
  }
}
