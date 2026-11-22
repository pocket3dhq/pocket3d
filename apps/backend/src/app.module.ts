import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@pocket3d/nestjs-libraries/database/prisma/database.module';
import { ApiModule } from '@pocket3d/backend/api/api.module';
import { PublicApiModule } from '@pocket3d/backend/public-api/public.api.module';
import { McpModule } from '@pocket3d/backend/mcp/mcp.module';

@Global()
@Module({
  imports: [DatabaseModule, ApiModule, PublicApiModule, McpModule],
  controllers: [],
  providers: [],
  exports: [DatabaseModule],
})
export class AppModule {}
