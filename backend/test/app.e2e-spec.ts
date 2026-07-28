import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Integration tests against the real app wiring (guards, pipes, Prisma) and a
// real Postgres (see README: disposable test DB on :5433). Seeding happens in
// the test:e2e script via tsx BEFORE jest starts — sanitize-html depends on the
// ESM-only htmlparser2 v10, which Node's require(esm) handles at runtime but
// Jest's transformer cannot. Assertions are data-agnostic on purpose — they
// hold for the sample posts.json AND the real assignment file.

// supertest's res.body is `any` — these mirror the API response shapes so the
// assertions below stay type-checked.
interface PostItem {
  id: string;
  title: string;
  postedAt: string;
  tags: string[];
  content?: string;
}
interface PostList {
  items: PostItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface TagItem {
  name: string;
  postCount: number;
}

describe('API (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let cookie: string;

  const email = process.env.SEED_USER_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_USER_PASSWORD ?? 'Password123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /health is public and reports db up', async () => {
      const res = await request(server).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });
  });

  describe('auth', () => {
    it('rejects protected routes without a cookie', async () => {
      await request(server).get('/posts').expect(401);
      await request(server).get('/tags').expect(401);
      await request(server).get('/auth/me').expect(401);
    });

    it('rejects malformed login body with 400', async () => {
      await request(server).post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    });

    it('rejects wrong password with 401 and no cookie', async () => {
      const res = await request(server)
        .post('/auth/login')
        .send({ email, password: 'definitely-wrong' })
        .expect(401);
      expect(res.headers['set-cookie']).toBeUndefined();
      const body = res.body as { message: string };
      expect(body.message).toBe('Invalid credentials'); // same as unknown email — no enumeration
    });

    it('logs in and sets an httpOnly cookie', async () => {
      const res = await request(server).post('/auth/login').send({ email, password }).expect(200);
      const setCookie = res.headers['set-cookie'][0];
      expect(setCookie).toContain('access_token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      const body = res.body as { user: { email: string } };
      expect(body.user.email).toBe(email);
      cookie = setCookie.split(';')[0];
    });

    it('GET /auth/me returns the logged-in user', async () => {
      const res = await request(server).get('/auth/me').set('Cookie', cookie).expect(200);
      const body = res.body as { user: { email: string } };
      expect(body.user).toMatchObject({ email });
    });

    it('rejects a tampered token', async () => {
      await request(server)
        .get('/auth/me')
        .set('Cookie', 'access_token=tampered.jwt.token')
        .expect(401);
    });

    it('logout is public — clears the cookie even when the token is invalid', async () => {
      // Regression: if logout required auth, a stale cookie could never be
      // cleared and the frontend would loop between / and /login.
      const res = await request(server)
        .post('/auth/logout')
        .set('Cookie', 'access_token=expired.or.garbage')
        .expect(200);
      expect(res.headers['set-cookie'][0]).toMatch(/access_token=;/);
    });
  });

  describe('posts', () => {
    it('lists posts paginated with excerpts, without full content', async () => {
      const res = await request(server).get('/posts').set('Cookie', cookie).expect(200);
      const body = res.body as PostList;
      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.meta.limit).toBe(20);
      expect(body.items.length).toBeLessThanOrEqual(20);
      const post = body.items[0];
      expect(post).toHaveProperty('excerpt');
      expect(post).not.toHaveProperty('content');
      expect(Array.isArray(post.tags)).toBe(true);
    });

    it('sorts newest first', async () => {
      const res = await request(server).get('/posts?limit=10').set('Cookie', cookie).expect(200);
      const dates = (res.body as PostList).items.map((p) => Date.parse(p.postedAt));
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    it('filters by tag', async () => {
      const tags = await request(server).get('/tags').set('Cookie', cookie).expect(200);
      const tag = (tags.body as TagItem[])[0].name;
      const res = await request(server)
        .get(`/posts?tag=${encodeURIComponent(tag)}`)
        .set('Cookie', cookie)
        .expect(200);
      const body = res.body as PostList;
      expect(body.items.length).toBeGreaterThan(0);
      for (const post of body.items) expect(post.tags).toContain(tag);
    });

    it('searches title case-insensitively', async () => {
      const first = await request(server).get('/posts?limit=1').set('Cookie', cookie);
      const word = (first.body as PostList).items[0].title.split(' ')[0];
      const res = await request(server)
        .get(`/posts?search=${encodeURIComponent(word.toUpperCase())}`)
        .set('Cookie', cookie)
        .expect(200);
      const body = res.body as PostList;
      expect(body.items.length).toBeGreaterThan(0);
      for (const post of body.items) {
        expect(post.title.toLowerCase()).toContain(word.toLowerCase());
      }
    });

    it('treats LIKE metacharacters as literals, not wildcards', async () => {
      const all = await request(server).get('/posts?limit=1').set('Cookie', cookie).expect(200);
      const total = (all.body as PostList).meta.total;

      // Unescaped, `_` matches any single char and `%` any sequence — either
      // would return the whole table instead of literal matches.
      for (const char of ['_', '%']) {
        const res = await request(server)
          .get(`/posts?search=${encodeURIComponent(char)}`)
          .set('Cookie', cookie)
          .expect(200);
        const body = res.body as PostList;
        expect(body.meta.total).toBeLessThan(total);
        for (const post of body.items) expect(post.title).toContain(char);
      }
    });

    it('rejects invalid pagination params with 400', async () => {
      await request(server).get('/posts?page=abc').set('Cookie', cookie).expect(400);
      await request(server).get('/posts?limit=999').set('Cookie', cookie).expect(400);
    });

    it('returns full sanitized content in detail — no XSS vectors survive the seed', async () => {
      const list = await request(server).get('/posts?limit=5').set('Cookie', cookie);
      for (const item of (list.body as PostList).items) {
        const res = await request(server).get(`/posts/${item.id}`).set('Cookie', cookie).expect(200);
        const detail = res.body as PostItem;
        expect(detail.content).toBeDefined();
        expect(detail.content).not.toMatch(/<script/i);
        expect(detail.content).not.toMatch(/on\w+\s*=/i); // onerror=, onclick=, …
        expect(detail.content).not.toMatch(/javascript:/i);
      }
    });

    it('404s for an unknown post id', async () => {
      await request(server)
        .get('/posts/019f0000-0000-7000-8000-000000000000')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('tags', () => {
    it('lists tags with post counts', async () => {
      const res = await request(server).get('/tags').set('Cookie', cookie).expect(200);
      const body = res.body as TagItem[];
      expect(body.length).toBeGreaterThan(0);
      expect(typeof body[0].name).toBe('string');
      expect(typeof body[0].postCount).toBe('number');
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated login attempts (5/min)', async () => {
      const statuses: number[] = [];
      // sequential on purpose: deterministic hit counting, no socket churn
      for (let i = 0; i < 8; i++) {
        const res = await request(server).post('/auth/login').send({ email, password: 'wrong' });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    });
  });
});
