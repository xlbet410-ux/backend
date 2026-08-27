import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Coolify's Traefik reverse proxy, Express otherwise sees every
  // request as coming from Traefik's own IP — collapsing the per-IP
  // ThrottlerGuard limit below into one shared budget for the entire
  // site's traffic instead of one budget per visitor. Trusting exactly one
  // hop (Traefik) makes req.ip resolve to the real client IP from
  // X-Forwarded-For again.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: [
      'https://2xlbet.com',
      'https://www.2xlbet.com',
      'https://crm.2xlbet.com',
      'http://2xlbet.com',
      'http://www.2xlbet.com',
      'http://crm.2xlbet.com',
      'http://localhost:3000', // keep for local development
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // x-api-key: most CRM API calls happen server-side (Server
    // Components/Actions), which never hits CORS at all — but the offer
    // form's live game search (EligibleGamesPicker) calls the backend
    // straight from the browser, and the preflight was rejecting that
    // header, silently failing every search (games/catalog/search itself
    // has no auth guard, so this is purely a CORS allow-list gap).
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();