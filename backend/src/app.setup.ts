import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Express } from 'express';
import cookieParser from 'cookie-parser';

// Shared between main.ts and the e2e tests so tests exercise the exact
// same middleware/pipe configuration as production.
export function configureApp(app: INestApplication): INestApplication {
  // All browser traffic arrives via the Next.js rewrite proxy, so without this
  // req.ip is always the frontend container and per-IP rate limiting would
  // collapse into one shared bucket. Trust exactly one hop of X-Forwarded-For.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
