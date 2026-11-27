import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCop } from '../../storefront/utils/formatCop';
import { quoteUrl } from '../lib/quote';
import { previewField } from '../preview/preview-fields';
import { cx, ui } from '../styles';
import type { ProductDetail } from '../types';
import { ChatIcon } from './icons';
import AddToQuoteButton, { ADD_TO_QUOTE_LABEL, type QuoteAction } from '../../storefront/components/AddToQuoteButton';

const TRUST_ITEMS = ['Distribuidor autorizado', 'Garantía de fábrica', 'Envíos a toda Colombia'];

/** Public price (IVA incluido) or the quote prompt when the product has none. */
export function ProductPriceBlock({ price, isInformational = false, discontinued = false, assigned = false }: { price: ProductDetail['price']; isInformational?: boolean; discontinued?: boolean; /** El valor es la tarifa del cliente con sesión, no el precio público. */ assigned?: boolean }) {
  if (price === null) {
    if (discontinued && !isInformational) return null;
    return (
      <div {...previewField('price')}>
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
    <div {...previewField('price')}>
      <p className="text-4xl font-bold leading-tight tabular-nums text-neutral-950">{formatCop(price.value)}</p>
      <p className="text-sm text-neutral-500">{assigned ? 'Tu tarifa' : 'IVA incluido'}</p>
    </div>
  );
}

function purchaseAction(product: ProductDetail) {
  const discontinued = product.status === 'discontinued';
  return {
    label: discontinued ? 'Preguntar por un equivalente' : 'Cotizar',
    href: quoteUrl(product, discontinued),
  };
}

export function ProductCtas({ product, quoteAction }: { product: ProductDetail; quoteAction?: QuoteAction }) {
  const action = purchaseAction(product);
  // A client with an active account quotes from her own list; WhatsApp stays as a secondary text link.
  if (quoteAction && !product.isInformational && product.status !== 'discontinued') {
    return (
      <div className="flex flex-col gap-2">
        <AddToQuoteButton action={quoteAction} productName={product.name} withQuantity className={cx(ui.btnPrimary, 'sm:min-w-52')} />
        <a href={action.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-red-600 underline hover:text-red-700">
          O consúltalo por WhatsApp
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {!product.isInformational && (
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(ui.btnPrimary, 'sm:min-w-52')}
        >
          <ChatIcon className="h-4 w-4" />
          {action.label}
        </a>
      )}
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

function MobileQuoteButton({ quoteAction }: { quoteAction: QuoteAction }) {
  const [added, setAdded] = useState(false);
  return (
    <>
      <p role="status" aria-live="polite" className="text-sm text-neutral-600">
        {added ? (
          <>Agregado a tu cotización. <Link to="/clientes/cotizacion" className="inline-flex min-h-11 items-center font-semibold text-red-600 underline">Ver mi cotización</Link></>
        ) : ''}
      </p>
      <button type="button" onClick={() => setAdded(quoteAction.add(1))} className={cx(ui.btnPrimary, 'min-h-11 w-full text-center')}>
        {ADD_TO_QUOTE_LABEL}
      </button>
    </>
  );
}

/** Fixed bottom bar of small screens, so price and quote CTA stay reachable. */
export function ProductMobileBar({ product, assignedPrice = null, quoteAction }: { product: ProductDetail; assignedPrice?: ProductDetail['price']; quoteAction?: QuoteAction }) {
  const price = assignedPrice ?? product.price;
  const action = purchaseAction(product);
  const showPrice = price !== null || product.isInformational || product.status !== 'discontinued';
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-neutral-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden" {...previewField('price')}>
      {showPrice && <div className="min-w-0 flex-1">
        {price !== null ? (
          <>
            <p className="truncate text-xl font-bold leading-tight tabular-nums text-neutral-950">
              {formatCop(price.value)}
            </p>
            <p className="text-[11px] text-neutral-500">{assignedPrice ? 'Tu tarifa' : 'IVA incluido'}</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-neutral-700">
            {product.isInformational ? 'Ficha informativa' : 'Precio a consultar'}
          </p>
        )}
      </div>}
      {quoteAction && !product.isInformational && product.status !== 'discontinued' ? (
        <MobileQuoteButton quoteAction={quoteAction} />
      ) : !product.isInformational && (
        <a href={action.href} target="_blank" rel="noopener noreferrer" className={cx(ui.btnPrimary, 'min-h-11 w-full text-center')}>
          {action.label}
        </a>
      )}
    </div>
  );
}
