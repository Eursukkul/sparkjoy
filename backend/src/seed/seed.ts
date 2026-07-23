import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { v7 as uuidv7 } from 'uuid';

const logger = new Logger('Seed');
const BATCH_SIZE = 1000;
const EXCERPT_LENGTH = 200;

/** Shape of one record in posts.json (external input — validated below). */
interface RawPost {
  title: string;
  content: string;
  postedAt: string;
  postedBy: string;
  tags: string[];
}

// posts.json is untrusted input: sanitize once here, store clean HTML,
// so every consumer (frontend included) can render it as-is.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2'],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height'],
  },
  // http/https only — strips javascript: URLs in href/src
  allowedSchemes: ['http', 'https', 'mailto'],
};

const toExcerpt = (html: string): string => {
  // space before each tag so adjacent block elements don't glue words together
  const text = sanitizeHtml(html.replace(/</g, ' <'), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text;
};

const isValidRawPost = (p: unknown): p is RawPost => {
  const post = p as RawPost;
  return (
    typeof post?.title === 'string' &&
    typeof post?.content === 'string' &&
    typeof post?.postedBy === 'string' &&
    !Number.isNaN(Date.parse(post?.postedAt)) &&
    Array.isArray(post?.tags)
  );
};

export async function runSeed(prisma: PrismaClient): Promise<void> {
  await seedTestUser(prisma);

  // Idempotency: posts are seed-only data, so "any posts exist" means done.
  const existing = await prisma.post.count();
  if (existing > 0) {
    logger.log(`Posts already seeded (${existing} rows) — skipping`);
    return;
  }

  const file = process.env.SEED_FILE ?? resolve(process.cwd(), '..', 'posts.json');
  logger.log(`Seeding posts from ${file}`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown[];

  const valid = raw.filter(isValidRawPost);
  if (valid.length < raw.length) {
    logger.warn(`Skipped ${raw.length - valid.length} malformed records`);
  }

  const started = Date.now();
  const posts = valid.map((p) => ({
    id: uuidv7(),
    title: p.title,
    content: sanitizeHtml(p.content, SANITIZE_OPTIONS),
    excerpt: toExcerpt(p.content),
    postedAt: new Date(p.postedAt),
    postedBy: p.postedBy,
    tags: [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))],
  }));

  // Tags first: one createMany for all unique names, then a name→id map in memory.
  const tagNames = [...new Set(posts.flatMap((p) => p.tags))];
  await prisma.tag.createMany({ data: tagNames.map((name) => ({ name })), skipDuplicates: true });
  const tagIdByName = new Map((await prisma.tag.findMany()).map((t) => [t.name, t.id]));

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    await prisma.post.createMany({
      // explicit column list: the in-memory shape also carries `tags`, which is not a Post column
      data: batch.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        postedAt: post.postedAt,
        postedBy: post.postedBy,
      })),
    });
    await prisma.postTag.createMany({
      data: batch.flatMap((post) =>
        post.tags.map((name) => ({ postId: post.id, tagId: tagIdByName.get(name)! })),
      ),
    });
    logger.log(`Inserted ${Math.min(i + BATCH_SIZE, posts.length)}/${posts.length} posts`);
  }

  logger.log(
    `Seeded ${posts.length} posts, ${tagNames.length} tags in ${Date.now() - started}ms`,
  );
}

async function seedTestUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_USER_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_USER_PASSWORD ?? 'Password123!';
  const passwordHash = await hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {}, // keep existing password if the user already exists
    create: { email, passwordHash, name: 'Test Admin' },
  });
  logger.log(`Test user ready: ${email}`);
}
