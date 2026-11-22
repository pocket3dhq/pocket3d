import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from '@pocket3d/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationsService } from '@pocket3d/nestjs-libraries/database/prisma/organizations/organizations.service';
import { SessionsService } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.service';
import { AuthTokensService } from '@pocket3d/nestjs-libraries/database/prisma/auth-tokens/auth.tokens.service';
import { ApiKeysService } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.service';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import { UploadTicketsService } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { EmailService } from '@pocket3d/nestjs-libraries/emails/email.service';
import { activationEmail, resetEmail } from '@pocket3d/nestjs-libraries/emails/email.templates';
import { dummyPasswordHash, hashPassword, verifyPassword } from '@pocket3d/nestjs-libraries/services/password';
import { RegisterDto } from '@pocket3d/nestjs-libraries/dtos/auth/register.dto';
import { LoginDto } from '@pocket3d/nestjs-libraries/dtos/auth/login.dto';
import { AuthOrg, AuthUser } from '@pocket3d/nestjs-libraries/user/request.types';

export const INVALID_CREDENTIALS = 'Invalid email or password';
export const NOT_ACTIVATED = 'Activate your account first: open the link we emailed you';
export const INVALID_LINK = 'This link is invalid or has expired';
export const EMAIL_EXISTS = 'Email already exists';

// What register / login / activate / reset hand back to the controller:
// either a session secret for the cookie, or "check your email"
export type AuthResult = { session: string } | { activate: true };

// Signup, login and the emailed links (activate, forgot, reset), with
// database sessions instead of JWTs and single-use tokens for the links
@Injectable()
export class AuthService {
  constructor(
    private _usersService: UsersService,
    private _organizationsService: OrganizationsService,
    private _sessionsService: SessionsService,
    private _authTokensService: AuthTokensService,
    private _apiKeysService: ApiKeysService,
    private _assetsService: AssetsService,
    private _emailService: EmailService,
    private _oauthService: OAuthService,
    private _uploadTicketsService: UploadTicketsService
  ) {}

  // DISABLE_REGISTRATION=true still lets the very first account in, so a
  // self-hoster can lock the instance before anyone else finds it
  registrationDisabled() {
    return process.env.DISABLE_REGISTRATION === 'true';
  }

  // What the signup page asks: open, or closed but nobody has signed up yet
  async canRegister() {
    return !this.registrationDisabled() || (await this._usersService.count()) === 0;
  }

  emailEnabled() {
    return this._emailService.hasProvider();
  }

  private mainUrl() {
    return (process.env.MAIN_URL || '').replace(/\/+$/, '');
  }

  async register(body: RegisterDto, userAgent?: string): Promise<AuthResult> {
    if (await this._usersService.emailExists(body.email)) {
      throw new ConflictException(EMAIL_EXISTS);
    }

    const activated = !this.emailEnabled();
    const name = body.name || null;
    let created: Awaited<ReturnType<OrganizationsService['createOrgAndUser']>>;
    try {
      created = await this._organizationsService.createOrgAndUser(
        {
          email: body.email,
          name,
          password: await hashPassword(body.password),
          activated,
          organizationName: name || body.email.split('@')[0],
        },
        this.registrationDisabled()
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002: the same email signed up concurrently; P2034: a concurrent
        // signup won the serializable transaction
        if (err.code === 'P2002') throw new ConflictException(EMAIL_EXISTS);
        if (err.code === 'P2034') throw new ConflictException('Please try again');
      }
      throw err;
    }

    if (!activated) {
      await this.sendActivation(created.user.id, created.user.email);
      return { activate: true };
    }
    return { session: await this._sessionsService.create(created.user.id, userAgent) };
  }

  async login(body: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await this._usersService.getCredentialsByEmail(body.email);
    if (!user) {
      // same work as a real check, so timing doesn't tell who has an account
      await verifyPassword(body.password, await dummyPasswordHash());
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(body.password, user.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.activated) {
      throw new ForbiddenException(NOT_ACTIVATED);
    }
    return { session: await this._sessionsService.create(user.id, userAgent) };
  }

  logout(sessionToken?: string) {
    return this._sessionsService.destroy(sessionToken);
  }

  async activate(token: string, userAgent?: string): Promise<AuthResult> {
    const userId = await this._authTokensService.consume('ACTIVATE', token);
    if (!userId) {
      throw new BadRequestException(INVALID_LINK);
    }
    await this._usersService.activate(userId);
    return { session: await this._sessionsService.create(userId, userAgent) };
  }

  // Answers the same whether or not the email has an account
  async resendActivation(email: string) {
    if (this.emailEnabled()) {
      const user = await this._usersService.getCredentialsByEmail(email);
      if (user && !user.activated) {
        await this.sendActivation(user.id, user.email);
      }
    }
    return { sent: true };
  }

  // Answers the same whether or not the email has an account
  async forgot(email: string) {
    if (!this.emailEnabled()) {
      throw new BadRequestException('Password reset is not available on this instance');
    }
    const user = await this._usersService.getCredentialsByEmail(email);
    if (user) {
      const token = await this._authTokensService.issue(user.id, 'RESET');
      await this._emailService.send({ to: user.email, ...resetEmail(`${this.mainUrl()}/auth/reset/${token}`) });
    }
    return { forgot: true };
  }

  // The link proves the person owns the address, so it also activates the
  // account. Every other session ends: whoever knew the old password is out
  async reset(token: string, password: string, userAgent?: string): Promise<AuthResult> {
    const userId = await this._authTokensService.consume('RESET', token);
    if (!userId) {
      throw new BadRequestException(INVALID_LINK);
    }
    await this._usersService.updatePassword(userId, await hashPassword(password));
    await this._usersService.activate(userId);
    await this._sessionsService.destroyAllForUser(userId);
    return { session: await this._sessionsService.create(userId, userAgent) };
  }

  self(user: AuthUser, org: AuthOrg) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      org: { id: org.id, name: org.name },
      emailEnabled: this.emailEnabled(),
    };
  }

  async updateName(user: AuthUser, org: AuthOrg, name: string) {
    const updated = await this._usersService.updateName(user.id, name);
    return this.self(updated, org);
  }

  // Keeps this browser signed in, signs every other one out
  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string) {
    const user = await this._usersService.getCredentialsById(userId);
    if (!user || !(await verifyPassword(currentPassword, user.password))) {
      throw new BadRequestException('Your current password is wrong');
    }
    await this._usersService.updatePassword(userId, await hashPassword(newPassword));
    await this._sessionsService.destroyAllForUser(userId, sessionId);
    return { changed: true };
  }

  // Models (and their files), keys, connected apps, upload links, sessions,
  // then the org and the user. The share links stop working at once
  async deleteAccount(user: AuthUser, org: AuthOrg, password: string) {
    const credentials = await this._usersService.getCredentialsById(user.id);
    if (!credentials || !(await verifyPassword(password, credentials.password))) {
      throw new BadRequestException('Your password is wrong');
    }
    await this._assetsService.removeAllForOrg(org.id);
    await this._apiKeysService.revokeAllForOrg(org.id);
    await this._oauthService.revokeAllForOrg(org.id);
    await this._uploadTicketsService.expireAllForOrg(org.id);
    await this._organizationsService.softDelete(org.id);
    await this._usersService.softDelete(user.id);
    await this._sessionsService.destroyAllForUser(user.id);
    return { deleted: true };
  }

  private async sendActivation(userId: string, email: string) {
    const token = await this._authTokensService.issue(userId, 'ACTIVATE');
    await this._emailService.send({ to: email, ...activationEmail(`${this.mainUrl()}/auth/activate/${token}`) });
  }
}
