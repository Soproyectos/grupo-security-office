import { SALES_PHONE_HREF } from '../../storefront/constants/contact';
import { formatCop } from '../../storefront/utils/formatCop';
import { quoteUrl } from '../lib/quote';
import { cx, ui } from '../styles';
import type { ProductDetail } from '../types';
import { ChatIcon } from './icons';

const TRUST_ITEMS = ['Distribuidor autorizado', 'Garantía de fábrica', 'Envíos a toda Colombia'];

/** Public price (IVA incluido) or the quote prompt when the product has none. */
export function ProductPriceBlock({ price, isInformational = false }: { price: ProductDetail['price']; isInformational?: boolean }) {
  if (price === null) {
    return (
      <div>
        <p className="text-2xl font-bold text-neutral-950">
          {isInformational ? 'Ficha informativa' : 'Precio a consultar'}
        </p>
        <p className="text-sm text-neutral-500">
          {isInformational ? 'Estamos completando los datos comerciales de este producto.' : 'Solicita una cotización y te respondemos por WhatsApp.'}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-4xl font-bold leading-tight tabular-nums text-neutral-950">{formatCop(price.value)}</p>
      <p className="text-sm text-neutral-500">IVA incluido</p>
    </div>
  );
}

export function ProductCtas({ product }: { product: ProductDetail }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {!product.isInformational && (
        <a
          href={quoteUrl(product)}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(ui.btnPrimary, 'sm:min-w-52')}
        >
          <ChatIcon className="h-4 w-4" />
          Cotizar por WhatsApp
        </a>
      )}
      <a href={SALES_PHONE_HREF} className={cx(ui.btnOutline, 'sm:min-w-32')}>
        Llamar
      </a>
    </div>
  );
}

export function ProductTrustStrip() {
  return (
    <ul className="grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 sm:grid-cols-3 sm:gap-4">
      {TRUST_ITEMS.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0 text-red-600"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Fixed bottom bar of small screens, so price and quote CTA stay reachable. */
export function ProductMobileBar({ product }: { product: ProductDetail }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-neutral-200 bg-white px-4 py-3 lg:hidden">
      <div className="min-w-0 flex-1">
        {product.price !== null ? (
          <>
            <p className="truncate text-xl font-bold leading-tight tabular-nums text-neutral-950">
              {formatCop(product.price.value)}
            </p>
            <p className="text-[11px] text-neutral-500">IVA incluido</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-neutral-700">
            {product.isInformational ? 'Ficha informativa' : 'Precio a consultar'}
          </p>
        )}
      </div>
      {!product.isInformational && (
        <a href={quoteUrl(product)} target="_blank" rel="noopener noreferrer" className={ui.btnPrimarySm}>
          Cotizar por WhatsApp
        </a>
      )}
    </div>
  );
}
