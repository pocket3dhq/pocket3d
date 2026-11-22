import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiKeysService, MAX_ACTIVE_API_KEYS } from './api.keys.service';
import { hashSecret } from '@pocket3d/nestjs-libraries/services/secret.token';

const setup = () => {
  const repo = {
    countActive: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation(async (data) => ({ id: 'k1', name: data.name, prefix: data.prefix })),
    list: jest.fn(),
    revoke: jest.fn(),
    revokeAllForOrg: jest.fn(),
    findActiveByHash: jest.fn(),
    touch: jest.fn(),
  };
  return { repo, service: new ApiKeysService(repo as any) };
};

describe('ApiKeysService', () => {
  it('stores only the hash and returns the key once', async () => {
    const { repo, service } = setup();
    const created = await service.create('o1', 'u1', '  laptop ');
    const stored = repo.create.mock.calls[0][0];
    expect(stored).toMatchObject({ organizationId: 'o1', createdById: 'u1', name: 'laptop' });
    expect(stored.keyHash).toBe(hashSecret(created.key));
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(created.prefix).toBe(created.key.slice(0, 8));
  });

  it('caps the number of active keys', async () => {
    const { repo, service } = setup();
    repo.countActive.mockResolvedValue(MAX_ACTIVE_API_KEYS);
    await expect(service.create('o1', 'u1', 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('revoke is scoped to the org and 404s otherwise', async () => {
    const { repo, service } = setup();
    repo.revoke.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.revoke('o1', 'k1')).resolves.toEqual({ revoked: true });
    expect(repo.revoke).toHaveBeenCalledWith('o1', 'k1');
    await expect(service.revoke('o2', 'k1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates by hash and touches lastUsedAt at most once a minute', async () => {
    const { repo, service } = setup();
    expect(await service.validate('')).toBeNull();
    expect(repo.findActiveByHash).not.toHaveBeenCalled();

    repo.findActiveByHash.mockResolvedValue(null);
    expect(await service.validate('p3d_x')).toBeNull();
    expect(repo.findActiveByHash).toHaveBeenCalledWith(hashSecret('p3d_x'));

    const found = { id: 'k1', name: 'n', prefix: 'p3d_abcd', organization: { id: 'o1', name: 'O' } };
    repo.findActiveByHash.mockResolvedValue({ ...found, lastUsedAt: null });
    expect(await service.validate('p3d_x')).toEqual({ apiKey: { id: 'k1', name: 'n', prefix: 'p3d_abcd' }, org: found.organization });
    expect(repo.touch).toHaveBeenCalledTimes(1);

    repo.findActiveByHash.mockResolvedValue({ ...found, lastUsedAt: new Date() });
    await service.validate('p3d_x');
    expect(repo.touch).toHaveBeenCalledTimes(1);
  });
});
