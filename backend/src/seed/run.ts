// Standalone CLI entry: `npm run seed` (local dev, no Nest app needed).
// The API itself calls runSeed() on startup — same logic, one source of truth.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed';

const prisma = new PrismaClient();

runSeed(prisma)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
