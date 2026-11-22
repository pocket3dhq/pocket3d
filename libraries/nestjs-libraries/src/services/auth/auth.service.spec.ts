import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService, EMAIL_EXISTS, INVALID_CREDENTIALS, INVALID_LINK } from './auth.service';
import { hashPassword } from '@pocket3d/nestjs-libraries/services/password';

const setup = (emailEnabled = false) => {
  const users = {
    emailExists: jest.fn().mockResolvedValue(false),
    getCredentialsByEmail: jest.fn(),
    getCredentialsById: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    activate: jest.fn().mockResolvedValue({}),
    updateName: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue({}),
    softDelete: jest.fn().mockResolvedValue({}),
  };
  const orgs = {
    createOrgAndUser: jest.fn().mockResolvedValue({
      user: { id: 'u1', email: 'ada@example.com', name: null, activated: !emailEnabled },
      organization: { id: 'o1', name: 'ada' },
    }),
    softDelete: jest.fn().mockResolvedValue({}),
  };
  const sessions = {
    create: jest.fn().mockResolvedValue('session-secret'),
    destroy: jest.fn(),
    destroyAllForUser: jest.fn().mockResolvedValue({}),
  };
  const tokens = { issue: jest.fn().mockResolvedValue('link-token'), consume: jest.fn() };
  const apiKeys = { revokeAllForOrg: jest.fn().mockResolvedValue({}) };
  const assets = { removeAllForOrg: jest.fn().mockResolvedValue(0) };
  const email = { hasProvider: jest.fn().mockReturnValue(emailEnabled), send: jest.fn() };
  const oauth = { revokeAllForOrg: jest.fn().mockResolvedValue({}) };
  const uploadTickets = { expireAllForOrg: jest.fn().mockResolvedValue({}) };
  const service = new AuthService(
    users as any,
    orgs as any,
    sessions as any,
    tokens as any,
    apiKeys as any,
    assets as any,
    email as any,
    oauth as any,
    uploadTickets as any
  );
  return { service, users, orgs, sessions, tokens, apiKeys, assets, email, oauth, uploadTickets };
};

const register = { email: 'ada@example.com', password: 'password123' };

describe('AuthService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co/';
    delete process.env.DISABLE_REGISTRATION;
  });
  afterAll(() => {
    process.env = env;
  });

  describe('register', () => {
    it('creates an active account and a session when there is no email provider', async () => {
      const { service, orgs, sessions } = setup(false);
      await expect(service.register({ ...register, name: 'Ada' }, 'ua')).resolves.toEqual({ session: 'session-secret' });
      const [account, onlyIfFirst] = orgs.createOrgAndUser.mock.calls[0];
      expect(account).toMatchObject({ email: 'ada@example.com', name: 'Ada', activated: true, organizationName: 'Ada' });
      expect(account.password).toMatch(/^scrypt\$/);
      expect(onlyIfFirst).toBe(false);
      expect(sessions.create).toHaveBeenCalledWith('u1', 'ua');
    });

    it('names the org after the email when there is no name', async () => {
      const { service, orgs } = setup(false);
      await service.register(register);
      expect(orgs.createOrgAndUser.mock.calls[0][0].organizationName).toBe('ada');
    });

    it('with email: inactive, activation link sent, no session', async () => {
      const { service, orgs, sessions, tokens, email } = setup(true);
      await expect(service.register(register)).resolves.toEqual({ activate: true });
      expect(orgs.createOrgAndUser.mock.calls[0][0].activated).toBe(false);
      expect(tokens.issue).toHaveBeenCalledWith('u1', 'ACTIVATE');
      expect(email.send.mock.calls[0][0].to).toBe('ada@example.com');
      expect(email.send.mock.calls[0][0].html).toContain('https://pocket3d.co/auth/activate/link-token');
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('refuses an existing email', async () => {
      const { service, users, orgs } = setup();
      users.emailExists.mockResolvedValue(true);
      await expect(service.register(register)).rejects.toThrow(new ConflictException(EMAIL_EXISTS));
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('maps a concurrent duplicate (P2002) and a lost serializable race (P2034)', async () => {
      for (const code of ['P2002', 'P2034']) {
        const { service, orgs } = setup();
        orgs.createOrgAndUser.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '6' }));
        await expect(service.register(register)).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('passes DISABLE_REGISTRATION down as "only if first"', async () => {
      process.env.DISABLE_REGISTRATION = 'true';
      const { service, orgs } = setup();
      await service.register(register);
      expect(orgs.createOrgAndUser.mock.calls[0][1]).toBe(true);
    });
  });

  describe('canRegister', () => {
    it('is open by default, and closed after the first account when disabled', async () => {
      const { service, users } = setup();
      expect(await service.canRegister()).toBe(true);
      process.env.DISABLE_REGISTRATION = 'true';
      users.count.mockResolvedValue(0);
      expect(await service.canRegister()).toBe(true);
      users.count.mockResolvedValue(1);
      expect(await service.canRegister()).toBe(false);
    });
  });

  describe('login', () => {
    it('logs in with the right password', async () => {
      const { service, users } = setup();
      users.getCredentialsByEmail.mockResolvedValue({ id: 'u1', password: await hashPassword('password123'), activated: true });
      await expect(service.login(register)).resolves.toEqual({ session: 'session-secret' });
    });

    it('says the same thing for an unknown email and a wrong password', async () => {
      const { service, users } = setup();
      users.getCredentialsByEmail.mockResolvedValue(null);
      await expect(service.login(register)).rejects.toThrow(new UnauthorizedException(INVALID_CREDENTIALS));
      users.getCredentialsByEmail.mockResolvedValue({ id: 'u1', password: await hashPassword('other-password'), activated: true });
      await expect(service.login(register)).rejects.toThrow(new UnauthorizedException(INVALID_CREDENTIALS));
    });

    it('refuses an account that is not activated (only after the password is right)', async () => {
      const { service, users, sessions } = setup(true);
      users.getCredentialsByEmail.mockResolvedValue({ id: 'u1', password: await hashPassword('password123'), activated: false });
      await expect(service.login(register)).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });

  describe('emailed links', () => {
    it('activates with a valid token, refuses a used or unknown one', async () => {
      const { service, tokens, users } = setup(true);
      tokens.consume.mockResolvedValueOnce('u1').mockResolvedValueOnce(null);
      await expect(service.activate('t')).resolves.toEqual({ session: 'session-secret' });
      expect(users.activate).toHaveBeenCalledWith('u1');
      await expect(service.activate('t')).rejects.toThrow(new BadRequestException(INVALID_LINK));
    });

    it('forgot: sends a reset link only to real accounts, answers the same', async () => {
      const { service, users, email } = setup(true);
      users.getCredentialsByEmail.mockResolvedValueOnce({ id: 'u1', email: 'ada@example.com' }).mockResolvedValueOnce(null);
      await expect(service.forgot('ada@example.com')).resolves.toEqual({ forgot: true });
      await expect(service.forgot('ghost@example.com')).resolves.toEqual({ forgot: true });
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].html).toContain('/auth/reset/link-token');
    });

    it('forgot: unavailable without an email provider', async () => {
      const { service } = setup(false);
      await expect(service.forgot('a@b.co')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reset: new password, activated, every old session ended', async () => {
      const { service, tokens, users, sessions } = setup(true);
      tokens.consume.mockResolvedValue('u1');
      await expect(service.reset('t', 'new password!')).resolves.toEqual({ session: 'session-secret' });
      expect(users.updatePassword.mock.calls[0][1]).toMatch(/^scrypt\$/);
      expect(users.activate).toHaveBeenCalledWith('u1');
      expect(sessions.destroyAllForUser).toHaveBeenCalledWith('u1');
      expect(sessions.destroyAllForUser.mock.invocationCallOrder[0]).toBeLessThan(sessions.create.mock.invocationCallOrder[0]);
    });

    it('resend: only for an existing, inactive account', async () => {
      const { service, users, email } = setup(true);
      users.getCredentialsByEmail
        .mockResolvedValueOnce({ id: 'u1', email: 'a@b.co', activated: true })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'u2', email: 'c@d.co', activated: false });
      for (const address of ['a@b.co', 'x@y.co', 'c@d.co']) {
        await expect(service.resendActivation(address)).resolves.toEqual({ sent: true });
      }
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].to).toBe('c@d.co');
    });
  });

  describe('account', () => {
    it('changes the password only with the current one, keeping this session', async () => {
      const { service, users, sessions } = setup();
      users.getCredentialsById.mockResolvedValue({ id: 'u1', password: await hashPassword('current-pass') });
      await expect(service.changePassword('u1', 's1', 'wrong', 'new-password')).rejects.toBeInstanceOf(BadRequestException);
      expect(users.updatePassword).not.toHaveBeenCalled();
      await expect(service.changePassword('u1', 's1', 'current-pass', 'new-password')).resolves.toEqual({ changed: true });
      expect(sessions.destroyAllForUser).toHaveBeenCalledWith('u1', 's1');
    });

    it('deletes everything the account owns, after checking the password', async () => {
      const { service, users, orgs, sessions, apiKeys, assets, oauth, uploadTickets } = setup();
      users.getCredentialsById.mockResolvedValue({ id: 'u1', password: await hashPassword('current-pass') });
      const user = { id: 'u1', email: 'a@b.co', name: null as string | null };
      const org = { id: 'o1', name: 'a' };
      await expect(service.deleteAccount(user, org, 'nope')).rejects.toBeInstanceOf(BadRequestException);
      expect(assets.removeAllForOrg).not.toHaveBeenCalled();
      await expect(service.deleteAccount(user, org, 'current-pass')).resolves.toEqual({ deleted: true });
      expect(assets.removeAllForOrg).toHaveBeenCalledWith('o1');
      expect(apiKeys.revokeAllForOrg).toHaveBeenCalledWith('o1');
      expect(oauth.revokeAllForOrg).toHaveBeenCalledWith('o1');
      expect(uploadTickets.expireAllForOrg).toHaveBeenCalledWith('o1');
      expect(orgs.softDelete).toHaveBeenCalledWith('o1');
      expect(users.softDelete).toHaveBeenCalledWith('u1');
      expect(sessions.destroyAllForUser).toHaveBeenCalledWith('u1');
    });

    it('self never includes secrets', () => {
      const { service } = setup(true);
      expect(service.self({ id: 'u1', email: 'a@b.co', name: 'A', password: 'x' } as any, { id: 'o1', name: 'A' })).toEqual({
        id: 'u1',
        email: 'a@b.co',
        name: 'A',
        org: { id: 'o1', name: 'A' },
        emailEnabled: true,
      });
    });
  });
});
