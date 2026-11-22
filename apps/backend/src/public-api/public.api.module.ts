import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PublicAssetsController } from '@pocket3d/backend/public-api/routes/v1/public.assets.controller';
import { PublicMeController } from '@pocket3d/backend/public-api/routes/v1/public.me.controller';
import { PublicUploadLinkController } from '@pocket3d/backend/public-api/routes/v1/public.upload.link.controller';
import { PublicAuthMiddleware } from '@pocket3d/backend/services/auth/public.auth.middleware';
import { PocketThrottlerModule } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// The API the CLI and AI agents call, behind an organization's API key
const authenticatedController = [PublicAssetsController, PublicMeController];
@Module({
  imports: [PocketThrottlerModule],
  // upload links carry their own single-use token (UploadTicketGuard)
  controllers: [...authenticatedController, PublicUploadLinkController],
  providers: [PublicAuthMiddleware],
})
export class PublicApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PublicAuthMiddleware).forRoutes(...authenticatedController);
  }
}
