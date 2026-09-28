import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// Driver adapter en vez del motor nativo en Rust: evita el panic
// "PANIC: timer has gone away" del conector nativo de Prisma en
// hosting compartido (ver comentario en schema.prisma). Pool (no el
// cliente HTTP-only `neon()`) para soportar $transaction interactivo,
// usado por el pipeline de importación (SAVEPOINT por fila).
//
// El adapter de Neon habla el protocolo WebSocket serverless de Neon, así que
// SOLO funciona contra endpoints neon.tech. Contra un Postgres propio (Docker
// local, LAN, servidor) hay que usar el motor nativo en Rust, que conecta por
// TCP normal. Por eso el adapter se elige según la URL y no se fija a ciegas:
// con un Postgres local el `All attempts to open a WebSocket ... failed` dejaba
// la app en `status: degraded` con la BD inaccesible.
const isNeon = (process.env.DATABASE_URL ?? '').includes('neon.tech');
const adapter = isNeon
  ? new PrismaNeon(new Pool({ connectionString: process.env.DATABASE_URL }))
  : undefined;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(adapter ? { adapter } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
