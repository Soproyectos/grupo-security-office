import { ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { buildBibliotecaConfig } from '../../prisma/biblioteca-config';
import { PrismaService } from '../../prisma/prisma.service';

/** Compatibility for legacy constructors/tests only; missing dedicated provider fails closed. */
export function directLegacyProductLibrary(prisma: PrismaService): BibliotecaPrismaService {
  if (process.env.LIBRARY_DATABASE_MODE && process.env.LIBRARY_DATABASE_MODE !== 'legacy') {
    throw new Error('Product services require the library provider in dedicated mode');
  }
  const config = buildBibliotecaConfig({ LIBRARY_DATABASE_MODE: 'legacy', LIBRARY_WRITES_FROZEN: process.env.LIBRARY_WRITES_FROZEN });
  return new BibliotecaPrismaService(prisma, config, () => {
    throw new Error('Legacy must not create another client');
  });
}

/** Reuse only a live transaction from this library; never nest a second database transaction. */
export function productLibraryWrite<T>(
  library: BibliotecaPrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  tx?: Prisma.TransactionClient,
): Promise<T> {
  library.assertWritesAllowed();
  if (!tx) {
    if (library.config.mode === 'legacy') return work(library.client);
    return library.writeTransaction(work);
  }
  if (library.config.mode === 'dedicated' && !library.ownsTransaction(tx)) {
    throw new ServiceUnavailableException({ code: 'LIBRARY_FOREIGN_TRANSACTION', message: 'Se requiere una transacción activa de biblioteca.' });
  }
  return work(tx);
}
