import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotionAuthService } from './notion-auth.service';
import { NotionAuthController } from './notion-auth.controller';
import { NotionCryptoService } from './notion-crypto.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [NotionAuthController],
  providers: [NotionAuthService, NotionCryptoService],
  exports: [NotionAuthService],
})
export class NotionAuthModule {}