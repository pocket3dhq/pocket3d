import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  createKey,
  createTestApp,
  nextIp,
  PASSWORD,
  publish,
  resetDatabase,
  sessionCookie,
  signUp,
  TestApp,
  triangleGlb,
  uniqueEmail,
} from './helpers';
import { TEST_UPLOAD_DIRECTORY } from './test.env';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';

// The whole account story against the real app and a real database:
// signup → session → keys → publish → library → revoke → delete
describe('accounts (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.email.enabled = false;
    t.email.sent = [];
    delete process.env.DISABLE_REGISTRATION;
  });

  const localFile = (url: string) =>
    join(
      TEST_UPLOAD_DIRECTORY,
      url.replace('http://localhost:4200/uploads/', '')
    );

  describe('signup and sessions', () => {
    it('registers, sets an httpOnly session cookie and answers /user/self', async () => {
      const email = uniqueEmail('Ada');
      const res = await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({
          email: `  ${email.toUpperCase()} `,
          password: PASSWORD,
          name: 'Ada',
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ login: true });
      const setCookie = ([] as string[])
        .concat(res.headers['set-cookie'])
        .join(';');
      expect(setCookie).toMatch(/p3d_session=/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);

      const self = await t
        .http()
        .get('/user/self')
        .set('Cookie', sessionCookie(res)!);
      expect(self.status).toBe(200);
      expect(self.body).toMatchObject({
        email: email.toLowerCase(),
        name: 'Ada',
        emailEnabled: false,
      });
      expect(self.body.org.name).toBe('Ada');
      expect(JSON.stringify(self.body)).not.toMatch(/password/i);
    });

    it('stores only a scrypt hash of the password and a sha256 of the session', async () => {
      const { email, cookie } = await signUp(t);
      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user!.password).toMatch(/^scrypt\$/);
      expect(user!.password).not.toContain(PASSWORD);
      const session = await t.prisma.session.findFirst({
        where: { userId: user!.id },
      });
      expect(session!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(cookie).not.toContain(session!.tokenHash);
    });

    it('refuses a duplicate email (any case)', async () => {
      const { email } = await signUp(t);
      const res = await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({ email: email.toUpperCase(), password: PASSWORD });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Email already exists');
    });

    it('validates the signup body', async () => {
      const bad = await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({ email: 'not-an-email', password: 'short' });
      expect(bad.status).toBe(400);
      expect(bad.body.message.join(' ')).toMatch(/valid email/);
      expect(bad.body.message.join(' ')).toMatch(/at least 8/);
    });

    it('logs in and out; a logged-out cookie is dead', async () => {
      const { email, cookie: first } = await signUp(t);
      const login = await t
        .http()
        .post('/auth/login')
        .set('X-Real-IP', nextIp())
        .send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      const second = sessionCookie(login)!;
      expect(second).not.toBe(first);

      const logout = await t.http().post('/auth/logout').set('Cookie', second);
      expect(logout.status).toBe(200);
      expect(
        ([] as string[]).concat(logout.headers['set-cookie']).join(';')
      ).toMatch(/p3d_session=;/);
      expect(
        (await t.http().get('/user/self').set('Cookie', second)).status
      ).toBe(401);
      // the other session is untouched
      expect(
        (await t.http().get('/user/self').set('Cookie', first)).status
      ).toBe(200);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { email } = await signUp(t);
      const wrongPassword = await t
        .http()
        .post('/auth/login')
        .set('X-Real-IP', nextIp())
        .send({ email, password: 'nope-nope' });
      const unknown = await t
        .http()
        .post('/auth/login')
        .set('X-Real-IP', nextIp())
        .send({ email: uniqueEmail('ghost'), password: 'nope-nope' });
      expect(wrongPassword.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknown.body.message);
    });

    it('rejects a missing, forged or expired session', async () => {
      expect((await t.http().get('/user/self')).status).toBe(401);
      expect(
        (await t.http().get('/user/self').set('Cookie', 'p3d_session=forged'))
          .status
      ).toBe(401);

      const { cookie } = await signUp(t);
      await t.prisma.session.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await t.http().get('/user/self').set('Cookie', cookie)).status
      ).toBe(401);
    });

    it('refuses state-changing requests that are not JSON (CSRF)', async () => {
      const { cookie } = await signUp(t);
      const form = await t
        .http()
        .post('/api-keys')
        .set('Cookie', cookie)
        .type('form')
        .send('name=evil');
      expect(form.status).toBe(415);
      const text = await t
        .http()
        .post('/api-keys')
        .set('Cookie', cookie)
        .set('Content-Type', 'text/plain')
        .send('{"name":"x"}');
      expect(text.status).toBe(415);
      expect(await t.prisma.apiKey.count()).toBe(0);
    });

    it('ignores fields a DTO does not declare', async () => {
      const email = uniqueEmail();
      await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({ email, password: PASSWORD, activated: false, id: 'chosen-id' });
      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user!.activated).toBe(true);
      expect(user!.id).not.toBe('chosen-id');
    });
  });

  describe('API keys and publishing', () => {
    it('creates a key shown once, publishes with it, and answers /public/v1/me', async () => {
      const { cookie } = await signUp(t, uniqueEmail(), PASSWORD, 'Studio');
      const key = await createKey(t, cookie, 'laptop');
      expect(key.key).toMatch(/^p3d_[A-Za-z0-9]{40}$/);
      expect(key.prefix).toBe(key.key.slice(0, 8));

      const listed = await t.http().get('/api-keys').set('Cookie', cookie);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).not.toHaveProperty('key');
      expect(listed.body[0]).not.toHaveProperty('keyHash');

      const stored = await t.prisma.apiKey.findFirst();
      expect(stored!.keyHash).not.toContain(key.key);

      const me = await t
        .http()
        .get('/public/v1/me')
        .set('Authorization', `Bearer ${key.key}`);
      expect(me.status).toBe(200);
      expect(me.body).toEqual({
        organization: { id: expect.any(String), name: 'Studio' },
        apiKey: { name: 'laptop', prefix: key.prefix },
      });

      const published = await publish(t, key.key, 'My triangle', true);
      expect(published.status).toBe(201);
      expect(published.body.url).toBe(
        `http://localhost:4200/m/${published.body.id}`
      );
      expect(published.body).not.toHaveProperty('name');
      expect(published.body).not.toHaveProperty('organizationId');

      const asset = await t.prisma.asset.findUnique({
        where: { id: published.body.id },
      });
      expect(asset!.organizationId).toBe(me.body.organization.id);
      expect((await t.prisma.apiKey.findFirst())!.lastUsedAt).not.toBeNull();
    });

    it('rejects publishing without a key or with a wrong one', async () => {
      expect((await publish(t, '')).status).toBe(401);
      const wrong = await publish(t, 'p3d_' + 'x'.repeat(40));
      expect(wrong.status).toBe(401);
      expect(wrong.body.msg).toBe('Invalid API key');
      expect(await t.prisma.asset.count()).toBe(0);
    });

    it('no longer accepts the old shared API_KEY env var', async () => {
      process.env.API_KEY = 'legacy-shared-key';
      try {
        expect((await publish(t, 'legacy-shared-key')).status).toBe(401);
      } finally {
        delete process.env.API_KEY;
      }
    });

    it('revoking a key stops it at once', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      expect((await publish(t, key.key)).status).toBe(201);

      // Content-Length: 0 and no type, as the Next dev proxy sends it
      const revoke = await t
        .http()
        .delete(`/api-keys/${key.id}`)
        .set('Cookie', cookie)
        .set('Content-Length', '0');
      expect(revoke.status).toBe(200);
      expect((await publish(t, key.key)).status).toBe(401);
      expect(
        (await t.http().get('/public/v1/me').set('Authorization', key.key))
          .status
      ).toBe(401);
      expect(
        (await t.http().get('/api-keys').set('Cookie', cookie)).body
      ).toHaveLength(0);
      expect(
        (await t.http().delete(`/api-keys/${key.id}`).set('Cookie', cookie))
          .status
      ).toBe(404);
    });

    it('caps active keys at 25', async () => {
      const { cookie } = await signUp(t);
      for (let i = 0; i < 25; i += 1) {
        await createKey(t, cookie, `key ${i}`);
      }
      const extra = await t
        .http()
        .post('/api-keys')
        .set('Cookie', cookie)
        .send({ name: 'one too many' });
      expect(extra.status).toBe(400);
      expect(extra.body.message).toMatch(/up to 25/);
    });

    it('validates key names and ids', async () => {
      const { cookie } = await signUp(t);
      expect(
        (
          await t
            .http()
            .post('/api-keys')
            .set('Cookie', cookie)
            .send({ name: '   ' })
        ).status
      ).toBe(400);
      expect(
        (
          await t
            .http()
            .post('/api-keys')
            .set('Cookie', cookie)
            .send({ name: 'x'.repeat(61) })
        ).status
      ).toBe(400);
      expect(
        (await t.http().delete('/api-keys/not-a-uuid').set('Cookie', cookie))
          .status
      ).toBe(400);
    });
  });

  describe('models library', () => {
    it('lists, renames and deletes your models (and removes the files)', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      const first = (await publish(t, key.key, 'First', true)).body;
      const second = (await publish(t, key.key, 'Second')).body;

      const list = await t.http().get('/assets').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ page: 1, pages: 1, total: 2 });
      expect(list.body.assets.map((a: any) => a.title)).toEqual([
        'Second',
        'First',
      ]);
      expect(list.body.assets[0].url).toBe(
        `http://localhost:4200/m/${second.id}`
      );
      expect(list.body.assets[0]).not.toHaveProperty('name');

      const renamed = await t
        .http()
        .put(`/assets/${first.id}`)
        .set('Cookie', cookie)
        .send({ title: '  Renamed  ' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.title).toBe('Renamed');
      expect(
        (await t.http().get(`/public/assets/${first.id}`)).body.title
      ).toBe('Renamed');
      expect(
        (
          await t
            .http()
            .put(`/assets/${first.id}`)
            .set('Cookie', cookie)
            .send({ title: '' })
        ).status
      ).toBe(400);

      expect(existsSync(localFile(first.path))).toBe(true);
      expect(existsSync(localFile(first.coverPath))).toBe(true);
      const removed = await t
        .http()
        .delete(`/assets/${first.id}`)
        .set('Cookie', cookie);
      expect(removed.status).toBe(200);
      expect((await t.http().get(`/public/assets/${first.id}`)).status).toBe(
        404
      );
      expect(existsSync(localFile(first.path))).toBe(false);
      expect(existsSync(localFile(first.coverPath))).toBe(false);
      expect(
        (await t.http().get('/assets').set('Cookie', cookie)).body.total
      ).toBe(1);
    });

    it('publishes from the dashboard through a single-use upload link', async () => {
      const { cookie } = await signUp(t);
      const other = await signUp(t);

      // only a signed-in session gets a link, and the body is JSON like the rest
      expect((await t.http().post('/assets/upload-link').send({})).status).toBe(
        401
      );
      const link = await t
        .http()
        .post('/assets/upload-link')
        .set('Cookie', cookie)
        .send({ title: '  From the dashboard  ' });
      expect(link.status).toBe(201);
      expect(link.body).toEqual({
        url: expect.stringMatching(
          /^http:\/\/localhost:4200\/api\/public\/v1\/uploads\/p3d_up_/
        ),
        expiresAt: expect.any(String),
        model: null,
        draft: false,
      });
      expect(
        (
          await t
            .http()
            .post('/assets/upload-link')
            .set('Cookie', cookie)
            .send({ title: 'x'.repeat(121) })
        ).status
      ).toBe(400);

      const path = link.body.url.replace('http://localhost:4200/api', '');
      const upload = () =>
        t
          .http()
          .post(path)
          .attach('file', triangleGlb(), {
            filename: 'triangle.glb',
            contentType: 'model/gltf-binary',
          });
      const first = await upload();
      expect(first.status).toBe(201);
      expect(first.body.title).toBe('From the dashboard');
      expect((await upload()).status).toBe(410);

      // into the account that asked for the link, nobody else's
      expect(
        (await t.http().get('/assets').set('Cookie', cookie)).body.total
      ).toBe(1);
      expect(
        (await t.http().get('/assets').set('Cookie', other.cookie)).body.total
      ).toBe(0);
    });

    it('paginates', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      for (let i = 0; i < 26; i += 1) {
        await publish(t, key.key, `Model ${i}`);
      }
      const page2 = await t.http().get('/assets?page=2').set('Cookie', cookie);
      expect(page2.body).toMatchObject({ page: 2, pages: 2, total: 26 });
      expect(page2.body.assets).toHaveLength(2);
      expect(
        (await t.http().get('/assets?page=0').set('Cookie', cookie)).status
      ).toBe(400);
    });

    it("keeps accounts apart: B can't see, rename, delete or revoke A's things", async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      const keyA = await createKey(t, a.cookie);
      const modelA = (await publish(t, keyA.key, 'A model')).body;

      expect(
        (await t.http().get('/assets').set('Cookie', b.cookie)).body.total
      ).toBe(0);
      expect(
        (await t.http().get('/api-keys').set('Cookie', b.cookie)).body
      ).toHaveLength(0);
      expect(
        (
          await t
            .http()
            .put(`/assets/${modelA.id}`)
            .set('Cookie', b.cookie)
            .send({ title: 'pwned' })
        ).status
      ).toBe(404);
      expect(
        (await t.http().delete(`/assets/${modelA.id}`).set('Cookie', b.cookie))
          .status
      ).toBe(404);
      expect(
        (await t.http().delete(`/api-keys/${keyA.id}`).set('Cookie', b.cookie))
          .status
      ).toBe(404);

      expect(
        (await t.http().get(`/public/assets/${modelA.id}`)).body.title
      ).toBe('A model');
      expect((await publish(t, keyA.key)).status).toBe(201);
    });
  });

  describe('registration switch and the first account', () => {
    it('DISABLE_REGISTRATION lets only the first account in', async () => {
      process.env.DISABLE_REGISTRATION = 'true';
      expect((await t.http().get('/auth/can-register')).body.register).toBe(
        true
      );
      await signUp(t);
      expect((await t.http().get('/auth/can-register')).body.register).toBe(
        false
      );
      const second = await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({ email: uniqueEmail(), password: PASSWORD });
      expect(second.status).toBe(403);
      expect(second.body.message).toMatch(/closed/);
    });

    it('signup never takes over models published before accounts', async () => {
      const org = await t.prisma.organization.create({
        data: { name: 'placeholder' },
      });
      await t.prisma.asset.create({
        data: {
          id: 'Orphan000001',
          title: 'Old',
          name: 'a.glb',
          path: 'http://x/a.glb',
          fileSize: 1,
        },
      });
      await t.prisma.asset.create({
        data: {
          id: 'Owned0000001',
          title: 'Owned',
          name: 'b.glb',
          path: 'http://x/b.glb',
          fileSize: 1,
          organizationId: org.id,
        },
      });

      // the very first account gets nothing
      const first = await signUp(t);
      const second = await signUp(t);
      expect(
        (await t.http().get('/assets').set('Cookie', first.cookie)).body.total
      ).toBe(0);
      expect(
        (await t.http().get('/assets').set('Cookie', second.cookie)).body.total
      ).toBe(0);

      // nobody owns the old one, and the owned one stays where it is
      expect(
        (await t.prisma.asset.findUnique({ where: { id: 'Orphan000001' } }))!
          .organizationId
      ).toBeNull();
      expect(
        (await t.prisma.asset.findUnique({ where: { id: 'Owned0000001' } }))!
          .organizationId
      ).toBe(org.id);
    });
  });

  describe('storage limit (MAX_STORAGE_PER_ORG_MB)', () => {
    afterEach(() => {
      delete process.env.MAX_STORAGE_PER_ORG_MB;
    });

    const storedFiles = () => {
      const walk = (dir: string): string[] =>
        existsSync(dir)
          ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
              e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
            )
          : [];
      return walk(TEST_UPLOAD_DIRECTORY).length;
    };

    it('is unlimited when unset, and the list reports what is used', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      const model = (await publish(t, key.key, 'One', true)).body;
      const list = await t.http().get('/assets').set('Cookie', cookie);
      // the files are the model's v1
      const stored = await t.prisma.assetVersion.findUnique({
        where: { assetId_number: { assetId: model.id, number: 1 } },
      });
      expect(stored!.coverSize).toBeGreaterThan(0);
      expect(list.body.storage).toEqual({
        used: stored!.fileSize + stored!.coverSize!,
        limit: null,
      });
    });

    it('refuses the upload that would go over, and keeps nothing of it', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      const size: number = (await publish(t, key.key, 'First')).body.fileSize;
      // room for the first model and a bit, not for a second one
      process.env.MAX_STORAGE_PER_ORG_MB = String((size * 1.5) / 1024 / 1024);

      const before = storedFiles();
      const over = await publish(t, key.key, 'Second');
      expect(over.status).toBe(413);
      expect(over.body.message).toMatch(/Storage limit reached/);
      expect(over.body.message).toMatch(/dashboard/);
      expect(storedFiles()).toBe(before);
      expect(await t.prisma.asset.count()).toBe(1);

      const list = await t.http().get('/assets').set('Cookie', cookie);
      expect(list.body.storage.limit).toBe(Math.floor(size * 1.5));
    });

    it('an org already at its limit is refused before the file is stored', async () => {
      const { cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      await publish(t, key.key, 'Fills it');
      process.env.MAX_STORAGE_PER_ORG_MB = '0.0001'; // ~100 bytes, already exceeded
      const before = storedFiles();
      const res = await publish(t, key.key, 'Nope');
      expect(res.status).toBe(413);
      expect(storedFiles()).toBe(before);
    });

    it('limits each account separately; deleting a model frees room', async () => {
      const a = await signUp(t);
      const keyA = await createKey(t, a.cookie);
      const first = (await publish(t, keyA.key, 'A1')).body;
      process.env.MAX_STORAGE_PER_ORG_MB = String(
        (first.fileSize * 1.5) / 1024 / 1024
      );

      const b = await signUp(t);
      const keyB = await createKey(t, b.cookie);
      expect((await publish(t, keyB.key, 'B1')).status).toBe(201);
      expect((await publish(t, keyA.key, 'A2')).status).toBe(413);

      await t.http().delete(`/assets/${first.id}`).set('Cookie', a.cookie);
      expect((await publish(t, keyA.key, 'A2')).status).toBe(201);
    });
  });

  describe('with an email provider', () => {
    beforeEach(() => {
      t.email.enabled = true;
    });

    it('needs the emailed link before the first login', async () => {
      const email = uniqueEmail();
      const res = await t
        .http()
        .post('/auth/register')
        .set('X-Real-IP', nextIp())
        .send({ email, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activate: true });
      expect(sessionCookie(res)).toBeUndefined();

      const early = await t
        .http()
        .post('/auth/login')
        .set('X-Real-IP', nextIp())
        .send({ email, password: PASSWORD });
      expect(early.status).toBe(403);

      // a resend replaces the first link
      const firstToken = t.email.lastToken(email, 'activate')!;
      await t
        .http()
        .post('/auth/resend-activation')
        .set('X-Real-IP', nextIp())
        .send({ email });
      const token = t.email.lastToken(email, 'activate')!;
      expect(token).not.toBe(firstToken);
      expect(
        (
          await t
            .http()
            .post('/auth/activate')
            .set('X-Real-IP', nextIp())
            .send({ token: firstToken })
        ).status
      ).toBe(400);

      const activated = await t
        .http()
        .post('/auth/activate')
        .set('X-Real-IP', nextIp())
        .send({ token });
      expect(activated.status).toBe(200);
      expect(
        (
          await t
            .http()
            .get('/user/self')
            .set('Cookie', sessionCookie(activated)!)
        ).status
      ).toBe(200);

      // single use
      expect(
        (
          await t
            .http()
            .post('/auth/activate')
            .set('X-Real-IP', nextIp())
            .send({ token })
        ).status
      ).toBe(400);
      expect(
        (
          await t
            .http()
            .post('/auth/login')
            .set('X-Real-IP', nextIp())
            .send({ email, password: PASSWORD })
        ).status
      ).toBe(200);
    });

    it('resets a password once, signs every session out, and expires', async () => {
      t.email.enabled = false;
      const { email, cookie } = await signUp(t);
      t.email.enabled = true;

      const forgot = await t
        .http()
        .post('/auth/forgot')
        .set('X-Real-IP', nextIp())
        .send({ email });
      expect(forgot.body).toEqual({ forgot: true });
      // same answer, no email, for an unknown address
      const unknown = await t
        .http()
        .post('/auth/forgot')
        .set('X-Real-IP', nextIp())
        .send({ email: uniqueEmail('ghost') });
      expect(unknown.body).toEqual({ forgot: true });
      expect(t.email.sent).toHaveLength(1);

      const token = t.email.lastToken(email, 'reset')!;
      const reset = await t
        .http()
        .post('/auth/reset')
        .set('X-Real-IP', nextIp())
        .send({ token, password: 'a brand new password' });
      expect(reset.status).toBe(200);
      expect(sessionCookie(reset)).toBeDefined();
      expect(
        (await t.http().get('/user/self').set('Cookie', cookie)).status
      ).toBe(401);
      expect(
        (
          await t
            .http()
            .post('/auth/reset')
            .set('X-Real-IP', nextIp())
            .send({ token, password: 'another one!' })
        ).status
      ).toBe(400);

      expect(
        (
          await t
            .http()
            .post('/auth/login')
            .set('X-Real-IP', nextIp())
            .send({ email, password: PASSWORD })
        ).status
      ).toBe(401);
      expect(
        (
          await t
            .http()
            .post('/auth/login')
            .set('X-Real-IP', nextIp())
            .send({ email, password: 'a brand new password' })
        ).status
      ).toBe(200);

      await t
        .http()
        .post('/auth/forgot')
        .set('X-Real-IP', nextIp())
        .send({ email });
      const late = t.email.lastToken(email, 'reset')!;
      await t.prisma.authToken.updateMany({
        where: { type: 'RESET', usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      expect(
        (
          await t
            .http()
            .post('/auth/reset')
            .set('X-Real-IP', nextIp())
            .send({ token: late, password: 'too late now' })
        ).status
      ).toBe(400);
    });

    it('without a provider, forgot-password is unavailable', async () => {
      t.email.enabled = false;
      const res = await t
        .http()
        .post('/auth/forgot')
        .set('X-Real-IP', nextIp())
        .send({ email: uniqueEmail() });
      expect(res.status).toBe(400);
    });
  });

  describe('account settings', () => {
    it('updates the name', async () => {
      const { cookie } = await signUp(t);
      const res = await t
        .http()
        .put('/user/self')
        .set('Cookie', cookie)
        .send({ name: '  Grace  ' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Grace');
      expect(
        (
          await t
            .http()
            .put('/user/self')
            .set('Cookie', cookie)
            .send({ name: '' })
        ).body.name
      ).toBeNull();
    });

    it('changes the password: keeps this session, ends the others', async () => {
      const { email, cookie } = await signUp(t);
      const other = sessionCookie(
        await t
          .http()
          .post('/auth/login')
          .set('X-Real-IP', nextIp())
          .send({ email, password: PASSWORD })
      )!;

      const wrong = await t
        .http()
        .put('/user/self/password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'not it at all', newPassword: 'whatever123' });
      expect(wrong.status).toBe(400);

      const ok = await t
        .http()
        .put('/user/self/password')
        .set('Cookie', cookie)
        .send({ currentPassword: PASSWORD, newPassword: 'the new password' });
      expect(ok.status).toBe(200);
      expect(
        (await t.http().get('/user/self').set('Cookie', cookie)).status
      ).toBe(200);
      expect(
        (await t.http().get('/user/self').set('Cookie', other)).status
      ).toBe(401);
    });

    it('deletes the account: models, files, keys, sessions; the email is free again', async () => {
      const { email, cookie } = await signUp(t);
      const key = await createKey(t, cookie);
      const model = (await publish(t, key.key, 'Doomed', true)).body;

      expect(
        (
          await t
            .http()
            .delete('/user/self')
            .set('Cookie', cookie)
            .send({ password: 'wrong password' })
        ).status
      ).toBe(400);
      const res = await t
        .http()
        .delete('/user/self')
        .set('Cookie', cookie)
        .send({ password: PASSWORD });
      expect(res.status).toBe(200);

      expect(
        (await t.http().get('/user/self').set('Cookie', cookie)).status
      ).toBe(401);
      expect((await publish(t, key.key)).status).toBe(401);
      expect((await t.http().get(`/public/assets/${model.id}`)).status).toBe(
        404
      );
      expect(existsSync(localFile(model.path))).toBe(false);
      expect(
        (
          await t
            .http()
            .post('/auth/login')
            .set('X-Real-IP', nextIp())
            .send({ email, password: PASSWORD })
        ).status
      ).toBe(401);

      // the address can sign up again, as a new empty account
      const again = await signUp(t, email);
      expect(
        (await t.http().get('/assets').set('Cookie', again.cookie)).body.total
      ).toBe(0);
    });
  });

  describe('rate limits', () => {
    it('limits login attempts per email, whatever the IP', async () => {
      const { email } = await signUp(t);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await t
          .http()
          .post('/auth/login')
          .set('X-Real-IP', nextIp())
          .send({ email, password: 'wrong-password' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('limits signups per IP', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await t
          .http()
          .post('/auth/register')
          .set('X-Real-IP', ip)
          .send({ email: uniqueEmail(), password: PASSWORD });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
    });
  });
});
