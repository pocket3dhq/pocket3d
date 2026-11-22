import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RootController } from '@pocket3d/backend/api/routes/root.controller';
import { PublicController } from '@pocket3d/backend/api/routes/public.controller';
import { AuthController } from '@pocket3d/backend/api/routes/auth.controller';
import { UsersController } from '@pocket3d/backend/api/routes/users.controller';
import { ApiKeysController } from '@pocket3d/backend/api/routes/api.keys.controller';
import { AssetsController } from '@pocket3d/backend/api/routes/assets.controller';
import { OAuthController } from '@pocket3d/backend/api/routes/oauth.controller';
import { OAuthGrantsController } from '@pocket3d/backend/api/routes/oauth.grants.controller';
import { WellKnownController } from '@pocket3d/backend/api/routes/well.known.controller';
import { AuthMiddleware } from '@pocket3d/backend/services/auth/auth.middleware';
import { PocketThrottlerModule } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// The web app's API: open routes, then the dashboard behind the session cookie
const authenticatedController = [UsersController, ApiKeysController, AssetsController, OAuthGrantsController];
@Module({
  imports: [PocketThrottlerModule],
  controllers: [
    RootController,
    PublicController,
    AuthController,
    OAuthController,
    WellKnownController,
    ...authenticatedController,
  ],
  providers: [AuthMiddleware],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(...authenticatedController);
  }
}
