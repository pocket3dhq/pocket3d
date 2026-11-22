import { SessionsService } from './sessions.service';
import { hashSecret } from '@pocket3d/nestjs-libraries/services/secret.token';

const setup = () => {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 's1' }),
    findValid: jest.fn(),
    touch: jest.fn(),
    deleteByHash: jest.fn(),
    deleteAllForUser: jest.fn(),
  };
  return { repo, service: new SessionsService(repo as any) };
};

describe('SessionsService', () => {
  it('creates a 30-day session and stores only the hash', async () => {
    const { repo, service } = setup();
    const token = await service.create('u1', 'Firefox');
    const data = repo.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashSecret(token));
    expect(data.userAgent).toBe('Firefox');
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  it('returns null without a token, an unknown one, or a user without an org', async () => {
    const { repo, service } = setup();
    expect(await service.validate(undefined)).toBeNull();
    repo.findValid.mockResolvedValue(null);
    expect(await service.validate('x')).toBeNull();
    repo.findValid.mockResolvedValue({ id: 's1', lastUsedAt: new Date(), user: { id: 'u1', email: 'e', name: null, organizations: [] } });
    expect(await service.validate('x')).toBeNull();
  });

  it('returns the user and org, touching at most once a minute', async () => {
    const { repo, service } = setup();
    const user = { id: 'u1', email: 'e', name: null as string | null, organizations: [{ organization: { id: 'o1', name: 'O' } }] };
    repo.findValid.mockResolvedValue({ id: 's1', lastUsedAt: new Date(Date.now() - 5 * 60_000), user });
    expect(await service.validate('x')).toEqual({ sessionId: 's1', user: { id: 'u1', email: 'e', name: null }, org: { id: 'o1', name: 'O' } });
    expect(repo.findValid).toHaveBeenCalledWith(hashSecret('x'));
    expect(repo.touch).toHaveBeenCalledWith('s1');

    repo.findValid.mockResolvedValue({ id: 's1', lastUsedAt: new Date(), user });
    await service.validate('x');
    expect(repo.touch).toHaveBeenCalledTimes(1);
  });

  it('destroys by hash', async () => {
    const { repo, service } = setup();
    await service.destroy('x');
    expect(repo.deleteByHash).toHaveBeenCalledWith(hashSecret('x'));
    await service.destroy(undefined);
    expect(repo.deleteByHash).toHaveBeenCalledTimes(1);
  });
});
