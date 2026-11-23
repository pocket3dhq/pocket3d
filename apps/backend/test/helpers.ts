import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '@pocket3d/backend/app.module';
import { configureApp } from '@pocket3d/backend/app.setup';
import { EmailService } from '@pocket3d/nestjs-libraries/emails/email.service';
import { EmailMessage } from '@pocket3d/nestjs-libraries/emails/email.interface';
import { PrismaService } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

// Stands in for Resend: records what would have been sent
export class FakeEmailService {
  enabled = false;
  sent: EmailMessage[] = [];
  hasProvider() {
    return this.enabled;
  }
  async send(message: EmailMessage) {
    if (this.enabled) this.sent.push(message);
  }
  // The token of the last link sent to `to` (…/auth/activate/<token>)
  lastToken(to: string, kind: 'activate' | 'reset') {
    const message = [...this.sent].reverse().find((m) => m.to === to && m.html.includes(`/auth/${kind}/`));
    return message?.html.match(new RegExp(`/auth/${kind}/([A-Za-z0-9]+)`))?.[1];
  }
}

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  email: FakeEmailService;
}

export async function createTestApp(): Promise<TestApp> {
  const email = new FakeEmailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue(email)
    .compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return { app, http: () => request(app.getHttpServer()), prisma: app.get(PrismaService), email };
}

// Children first (foreign keys), Prisma only
export async function resetDatabase(prisma: PrismaService) {
  await prisma.oAuthGrant.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.uploadTicket.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.assetDailyStat.deleteMany();
  // versions first: deleting them clears the models' live pointer (SetNull)
  await prisma.assetVersion.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.userOrganization.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

// Every request gets its own client IP unless a test pins one, so the
// per-IP rate limits only bite in the test about rate limits
let ipCounter = 0;
export const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

let emailCounter = 0;
export const uniqueEmail = (label = 'user') => `${label}-${Date.now()}-${++emailCounter}@example.com`;

export const PASSWORD = 'correct horse battery';

export const sessionCookie = (res: request.Response) => {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
  const cookie = cookies.find((c) => c.startsWith('p3d_session='));
  return cookie?.split(';')[0];
};

// Signs up (email off) and returns the session cookie
export async function signUp(t: TestApp, email = uniqueEmail(), password = PASSWORD, name?: string) {
  const res = await t
    .http()
    .post('/auth/register')
    .set('X-Real-IP', nextIp())
    .send({ email, password, name });
  if (res.status !== 200 || !sessionCookie(res)) {
    throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { email, password, cookie: sessionCookie(res)! };
}

export async function createKey(t: TestApp, cookie: string, name = 'test key') {
  const res = await t.http().post('/api-keys').set('Cookie', cookie).send({ name });
  if (res.status !== 201) {
    throw new Error(`createKey failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: string; key: string; prefix: string; name: string };
}

// A valid binary glTF 2.0 with one triangle (same as scripts/smoke.sh)
export function triangleGlb() {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      buffers: [{ byteLength: 36 }],
    })
  );
  const pad = (b: Buffer, c: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
  const chunk = (data: Buffer, type: number) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const bin = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const body = Buffer.concat([chunk(pad(json, 0x20), 0x4e4f534a), chunk(bin, 0x004e4942)]);
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([head, body]);
}

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export function publish(t: TestApp, key: string, title = 'Triangle', withCover = false) {
  const req = t
    .http()
    .post('/public/v1/assets')
    .set('Authorization', key)
    .field('title', title)
    .attach('file', triangleGlb(), { filename: 'triangle.glb', contentType: 'model/gltf-binary' });
  return withCover ? req.attach('cover', PNG_1X1, { filename: 'cover.png', contentType: 'image/png' }) : req;
}
