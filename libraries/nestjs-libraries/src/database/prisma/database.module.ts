import { Global, Module } from '@nestjs/common';
import { PrismaRepository, PrismaService } from './prisma.service';
import { AssetsRepository } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.repository';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { UsersRepository } from '@pocket3d/nestjs-libraries/database/prisma/users/users.repository';
import { UsersService } from '@pocket3d/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationsRepository } from '@pocket3d/nestjs-libraries/database/prisma/organizations/organizations.repository';
import { OrganizationsService } from '@pocket3d/nestjs-libraries/database/prisma/organizations/organizations.service';
import { SessionsRepository } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.repository';
import { SessionsService } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.service';
import { ApiKeysRepository } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.repository';
import { ApiKeysService } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.service';
import { AuthTokensRepository } from '@pocket3d/nestjs-libraries/database/prisma/auth-tokens/auth.tokens.repository';
import { AuthTokensService } from '@pocket3d/nestjs-libraries/database/prisma/auth-tokens/auth.tokens.service';
import { EmailService } from '@pocket3d/nestjs-libraries/emails/email.service';
import { AuthService } from '@pocket3d/nestjs-libraries/services/auth/auth.service';
import { OAuthRepository } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.repository';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import { UploadTicketsRepository } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.repository';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { McpService } from '@pocket3d/nestjs-libraries/mcp/mcp.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    PrismaService,
    PrismaRepository,
    AssetsRepository,
    AssetsService,
    UsersRepository,
    UsersService,
    OrganizationsRepository,
    OrganizationsService,
    SessionsRepository,
    SessionsService,
    ApiKeysRepository,
    ApiKeysService,
    AuthTokensRepository,
    AuthTokensService,
    EmailService,
    AuthService,
    OAuthRepository,
    OAuthService,
    UploadTicketsRepository,
    UploadTicketsService,
    McpService,
  ],
  get exports() {
    return this.providers;
  },
})
export class DatabaseModule {}
