import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { PrismaService } from './prisma/prisma.service';
import { runSeed } from './seed/seed';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SparkJoy Posts API')
    .setDescription('REST API for the posts assignment')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  // Idempotent auto-seed so `docker compose up` needs no extra commands.
  // Set SEED_ON_START=false to opt out (e.g. when running `npm run seed` manually).
  if (process.env.SEED_ON_START !== 'false') {
    await runSeed(app.get(PrismaService));
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port} — Swagger at /docs`);
}

void bootstrap();
