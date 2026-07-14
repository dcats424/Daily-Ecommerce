import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

  app.set('trust proxy', 1);
  app.use(cookieParser());

  const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.enableVersioning({ type: VersioningType.URI });

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DailyMart API')
    .setDescription('DailyMart E-Commerce API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Health endpoint
  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.json({ status: 'ok' }));

  // Landing page redirects to Swagger admin UI
  app.getHttpAdapter().get('/', (_req: any, res: any) => res.redirect('/v1/api'));

  await app.listen(env.HTTP_PORT);
  logger.log(`DailyMart API running on port ${env.HTTP_PORT}`);
}

bootstrap();
