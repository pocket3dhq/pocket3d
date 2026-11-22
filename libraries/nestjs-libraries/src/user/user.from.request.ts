import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './request.types';

// The signed-in user (AuthMiddleware sets it)
export const GetUserFromRequest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user
);

// The current browser session id (AuthMiddleware sets it)
export const GetSessionIdFromRequest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().sessionId
);
