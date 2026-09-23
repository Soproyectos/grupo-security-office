import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from './common/uploads-path';
import { parseTrustProxyHops } from './config/parse-trust-proxy-hops';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  const configService = app.get(ConfigService);

  // Trust N hops of reverse proxy (nginx sets X-Forwarded-For/X-Real-IP).
  // Without this, ThrottlerGuard sees the proxy's internal IP for all requests.
  // Configurable because the number of trusted hops depends on deployment
  // topology (extra CDN/load balancer in front changes this count); an
  // incorrect fixed value lets the public throttle be bypassed via a spoofed
  // X-Forwarded-For header.
  const trustProxyHopsRaw = configService.get<string>('TRUST_PROXY_HOPS');
  const trustProxyHops = parseTrustProxyHops(trustProxyHopsRaw);
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.use(helmet());
  app.use(cookieParser());

  // Servir archivos subidos (imágenes de productos) desde /uploads
  app.useStaticAssets(UPLOADS_DIR, { prefix: UPLOADS_URL_PREFIX });

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Grupo Security API')
    .setDescription('API del panel administrativo de Grupo Security')
    .setVersion('1.0')
    .addCookieAuth('auth_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port =
    configService.get<number>('PORT') ??
    configService.get<number>('API_PORT') ??
    3000;

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
