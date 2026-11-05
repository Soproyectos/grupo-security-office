import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';

@Controller('api/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(BibliotecaPrismaService) private readonly library?: BibliotecaPrismaService,
  ) {}

  @Public()
  @Get()
  async check() {
    let dbStatus: 'connected' | 'error' = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    // Con la biblioteca dedicada se comprueba también su base; en legacy comparte conexión y la respuesta no cambia.
    let libraryStatus: 'connected' | 'error' | undefined;
    if (this.library?.config.mode === 'dedicated') {
      libraryStatus = 'connected';
      try {
        await this.library.client.$queryRaw`SELECT 1`;
      } catch {
        libraryStatus = 'error';
      }
    }

    return {
      status: dbStatus === 'connected' && libraryStatus !== 'error' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      ...(libraryStatus ? { library: libraryStatus } : {}),
      environment: this.configService.get<string>('NODE_ENV') || 'development',
    };
  }

  @Public()
  @Get('ping')
  ping() {
    return { pong: true, timestamp: new Date().toISOString() };
  }
}
