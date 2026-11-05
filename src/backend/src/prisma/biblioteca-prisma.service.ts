import { Inject, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma, PrismaClient as BibliotecaClient } from '../../prisma/biblioteca/generated/client';
import type { BibliotecaConfig } from './biblioteca-config';
import { PrismaService } from './prisma.service';

export const BIBLIOTECA_CONFIG = Symbol('BIBLIOTECA_CONFIG');
export const BIBLIOTECA_CLIENT_FACTORY = Symbol('BIBLIOTECA_CLIENT_FACTORY');
export type BibliotecaClientFactory = (config: Extract<BibliotecaConfig, { mode: 'dedicated' }>) => BibliotecaClient;

export const createBibliotecaClient: BibliotecaClientFactory = (config) => {
  // Lazy import: legacy mode does not load, instantiate or connect a second client.
  const { PrismaClient } = require('../../prisma/biblioteca/generated/client') as typeof import('../../prisma/biblioteca/generated/client');
  return new PrismaClient({ adapter: new PrismaPg(config.pool) });
};

type ServerIdentity = {
  database: string; username: string; session_username: string;
  ip: string | null; port: number; cluster: string; version: number;
  data_directory: string; search_path: string;
};

@Injectable()
export class BibliotecaPrismaService implements OnModuleInit, OnModuleDestroy {
  private dedicated: BibliotecaClient | undefined;
  private ready = false;
  private readonly activeTransactions = new WeakSet<object>();

  constructor(
    private readonly legacy: PrismaService,
    @Inject(BIBLIOTECA_CONFIG) readonly config: BibliotecaConfig,
    @Inject(BIBLIOTECA_CLIENT_FACTORY) private readonly createClient: BibliotecaClientFactory,
  ) {}

  get client(): BibliotecaClient {
    if (this.config.mode === 'legacy') {
      // Library queries use the shared 23-model contract, never the operational relations.
      return this.legacy as unknown as BibliotecaClient;
    }
    if (!this.ready || !this.dedicated) throw new Error('Library database identity has not been verified');
    return this.dedicated;
  }

  assertWritesAllowed(): void {
    if (this.config.writesFrozen) {
      throw new ServiceUnavailableException({
        code: 'LIBRARY_WRITES_FROZEN',
        message: 'Las escrituras de biblioteca están temporalmente congeladas. Las consultas siguen disponibles.',
      });
    }
  }

  ownsTransaction(tx: object): boolean {
    return this.activeTransactions.has(tx);
  }

  /** Optional `options` (isolation level, timeouts) are passed to Prisma unchanged; omitting them keeps the default behavior. */
  async writeTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable' },
  ): Promise<T> {
    this.assertWritesAllowed();
    return this.client.$transaction(async (tx) => {
      this.activeTransactions.add(tx);
      try { return await work(tx); }
      finally { this.activeTransactions.delete(tx); }
    }, options);
  }

  async onModuleInit(): Promise<void> {
    if (this.config.mode === 'legacy') return;
    const config = this.config;
    try {
      this.dedicated = this.createClient(config);
      await this.dedicated.$connect();
      const rows = await this.dedicated.$queryRaw<ServerIdentity[]>`
        SELECT current_database()::text AS database, current_user::text AS username,
               session_user::text AS session_username, host(inet_server_addr()) AS ip,
               inet_server_port() AS port, current_setting('cluster_name') AS cluster,
               current_setting('server_version_num')::int AS version,
               current_setting('data_directory') AS data_directory,
               current_setting('search_path') AS search_path
      `;
      const actual = rows[0];
      if (rows.length !== 1 || !actual || actual.database !== config.database
          || actual.username !== 'gs_it' || actual.session_username !== 'gs_it'
          || actual.ip !== config.serverIp || actual.port !== 5432 || actual.cluster !== config.cluster
          || !Number.isInteger(actual.version) || actual.version < 180000 || actual.version > 189999
          || actual.data_directory !== '/var/lib/postgresql/18/docker'
          || actual.search_path.split(',').map((s) => s.trim()).join(',') !== 'public,pg_catalog') {
        throw new Error('Unexpected library database identity');
      }
      this.ready = true;
    } catch {
      this.ready = false;
      await this.dedicated?.$disconnect().catch(() => undefined);
      this.dedicated = undefined;
      // Driver errors can contain connection details; do not expose them in logs.
      throw new Error('Library database connection or identity verification failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.ready = false;
    await this.dedicated?.$disconnect();
    this.dedicated = undefined;
  }
}
