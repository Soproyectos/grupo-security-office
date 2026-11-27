import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Sequential customer code CL-0001, CL-0002, ... based on the last CL-<num> code
 * (retries on a unique(code) race). The ONLY generator: the internal create and the
 * web-account approval both call it so every customer gets the same format.
 */
export async function generateCustomerCode(
  prisma: Pick<PrismaService, 'customer'>,
  attempt = 0,
): Promise<string> {
  if (attempt >= 5) {
    return `CL-${Date.now().toString(36).toUpperCase()}`;
  }

  const last = await prisma.customer.findFirst({
    where: { code: { startsWith: 'CL-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastNum = last?.code ? parseInt(last.code.slice(3), 10) : 0;
  const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
  const candidate = `CL-${String(next).padStart(4, '0')}`;

  const exists = await prisma.customer.findUnique({
    where: { code: candidate },
    select: { id: true },
  });
  if (exists) return generateCustomerCode(prisma, attempt + 1);
  return candidate;
}
