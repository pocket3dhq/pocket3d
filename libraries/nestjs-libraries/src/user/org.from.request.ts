import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthApiKey, AuthOrg } from './request.types';

// The organization acting: from the session (AuthMiddleware) or from the API
// key (PublicAuthMiddleware). Every org-owned query is scoped by its id
export const GetOrgFromRequest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthOrg => ctx.switchToHttp().getRequest().org
);

// The API key used for this request (PublicAuthMiddleware sets it)
export const GetApiKeyFromRequest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthApiKey => ctx.switchToHttp().getRequest().apiKey
);
