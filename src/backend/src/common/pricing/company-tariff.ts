import { BadRequestException } from '@nestjs/common';
import type { PortalAccountType } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** Prisma clients needed to resolve a tariff: operational data and the library (price lists). */
export interface CompanyTariffDeps {
  prisma: PrismaService;
  /** Library client typed like the operational one (same contract used across the codebase). */
  db: PrismaService;
}

export interface CompanyTariff {
  priceListId: string;
  priceList: { id: string; isActive: boolean } & Record<string, unknown>;
}

async function priceListById(deps: CompanyTariffDeps, id: string) {
  const rows = await deps.db.priceList.findMany({ where: { id: { in: [id] } } });
  return rows.find((row) => row.id === id);
}

/**
 * The tariff belongs to the COMPANY: its tier's price list if the tier is active, otherwise the general mapping for
 * the account type. Returns null when no price list applies (prices are then "por confirmar", never invented).
 *
 * `strict` keeps the customer-portal behaviour: an inactive tier or price list is an error shown to the customer.
 * Lenient mode (staff quotes) falls back to the general mapping instead.
 */
export async function resolveCompanyTariff(
  deps: CompanyTariffDeps,
  type: PortalAccountType,
  tierId: string | null | undefined,
  strict: boolean,
): Promise<CompanyTariff | null> {
  if (tierId) {
    const tier = await deps.prisma.portalTier.findUnique({ where: { id: tierId } });
    if (!tier?.isActive) {
      if (strict) throw new BadRequestException('Tu escalafón comercial no está activo; contacta a tu asesor');
    } else {
      if (!tier.priceListId) return null;
      const priceList = await priceListById(deps, tier.priceListId);
      if (priceList?.isActive) return { priceListId: tier.priceListId, priceList: priceList as CompanyTariff['priceList'] };
      if (strict) throw new BadRequestException('La tarifa de tu escalafón no está activa');
    }
  }
  const mapping = await deps.prisma.portalPriceListMapping.findUnique({ where: { type } });
  const priceList = mapping ? await priceListById(deps, mapping.priceListId) : undefined;
  if (mapping && priceList?.isActive) return { priceListId: mapping.priceListId, priceList: priceList as CompanyTariff['priceList'] };
  if (type === 'FINAL_CUSTOMER' || !strict) return null;
  throw new BadRequestException('No hay una tarifa activa configurada para este tipo de cliente');
}
