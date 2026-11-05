import { Global, Module } from '@nestjs/common';
import { buildBibliotecaConfig } from './biblioteca-config';
import { PrismaModule } from './prisma.module';
import {
  BIBLIOTECA_CLIENT_FACTORY, BIBLIOTECA_CONFIG, BibliotecaPrismaService, createBibliotecaClient,
} from './biblioteca-prisma.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: BIBLIOTECA_CONFIG, useFactory: () => buildBibliotecaConfig(process.env) },
    { provide: BIBLIOTECA_CLIENT_FACTORY, useValue: createBibliotecaClient },
    BibliotecaPrismaService,
  ],
  exports: [BibliotecaPrismaService],
})
export class BibliotecaPrismaModule {}
