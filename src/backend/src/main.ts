import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { PortalAuthService } from './modules/customer-portal/portal-auth/portal-auth.service';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from './common/uploads-path';
import { AppModule } from './app.module';
import { applyTrustProxy } from './common/http/trust-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'], bodyParser: false });
  const configService = app.get(ConfigService);

  // Detrás de nginx: sin esto `req.ip` es siempre la dirección del proxy y el límite de solicitudes cuenta a todos como una IP.
  applyTrustProxy(app, configService.get<string>('TRUST_PROXY'));

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || 'http://localhost:5173',
    credentials: true,
  });

  // Better Auth (portal de clientes) lee su propio body: va ANTES de los parsers.
  const portalAuthHandler = app.get(PortalAuthService, { strict: false }).handler;
  app.use((req: any, res: any, next: any) =>
    req.url.startsWith('/api/portal-auth') ? portalAuthHandler(req, res) : next());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Servir archivos subidos (imágenes de productos) desde /uploads
  app.useStaticAssets(UPLOADS_DIR, { prefix: UPLOADS_URL_PREFIX });

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
