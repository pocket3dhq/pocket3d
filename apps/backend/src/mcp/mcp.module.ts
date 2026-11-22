import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { McpController } from '@pocket3d/backend/mcp/mcp.controller';
import { McpAuthMiddleware } from '@pocket3d/backend/services/auth/mcp.auth.middleware';
import { PocketThrottlerModule } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// The MCP server for AI agents (MAIN_URL/mcp), behind an OAuth token or an API key
@Module({
  imports: [PocketThrottlerModule],
  controllers: [McpController],
  providers: [McpAuthMiddleware],
})
export class McpModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(McpAuthMiddleware).forRoutes(McpController);
  }
}
