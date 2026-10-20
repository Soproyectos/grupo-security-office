import { useId, useState, type ReactNode } from 'react';
import type { DownloadHandler, FirmwareFile, ProductDocument, ProductFirmware } from '../types';
import { cx, ui } from '../styles';
import { ChevronDownIcon, DownloadIcon, FileIcon, InfoIcon } from './icons';
import { LicenseModal } from './LicenseModal';

const LANGUAGES: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
};

/* Acordeón con animación de altura (grid-rows 0fr → 1fr). */
function Disclosure({
  title,
  aside,
  defaultOpen = false,
  children,
}: {
  title: string;
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-4 bg-neutral-50 px-5 py-4 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 sm:px-6"
        >
          <span className="shrink-0 text-base font-bold text-neutral-950">{title}</span>
          {aside && <span className="hidden min-w-0 flex-1 text-xs text-neutral-500 md:block">{aside}</span>}
          <ChevronDownIcon
            className={cx(
              'ml-auto h-5 w-5 shrink-0 text-neutral-500 transition-transform duration-300',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div
        id={id}
        role="region"
        aria-hidden={!open}
        className={cx(
          'grid transition-all duration-300 ease-out',
          open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-4 sm:px-6">
            {aside && <div className="mb-3 text-xs text-neutral-500 md:hidden">{aside}</div>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguageLabel({ code }: { code: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-950">
      <span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-red-600" />
      Idioma: {LANGUAGES[code] ?? code.toUpperCase()}
    </p>
  );
}

const rowClass =
  'group flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600';

function DocumentsList({ documents, onDownload }: { documents: ProductDocument[]; onDownload?: DownloadHandler }) {
  const byLanguage = documents.reduce<Record<string, ProductDocument[]>>((acc, doc) => {
    (acc[doc.language] ??= []).push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(byLanguage).map(([lang, docs]) => (
        <div key={lang}>
          <LanguageLabel code={lang} />
          <ul className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
            {docs.map((doc) => (
              <li key={doc.id}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={rowClass}
                  onClick={() => onDownload?.({ id: doc.id, title: doc.title, url: doc.url, kind: doc.type })}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <FileIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                    <span className="truncate">{doc.title}</span>
                    <span className={ui.langTag}>{doc.language}</span>
                  </span>
                  <DownloadIcon className="h-4 w-4 shrink-0 text-neutral-500 transition-colors group-hover:text-red-600" />
                  <span className="sr-only">(abre en una pestaña nueva)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FirmwareList({
  firmware,
  onRequest,
}: {
  firmware: ProductFirmware;
  onRequest: (file: FirmwareFile) => void;
}) {
  return (
    <>
      <ul className="divide-y divide-neutral-100">
        {firmware.files.map((file) => (
          <li key={file.id}>
            <button type="button" className={rowClass} onClick={() => onRequest(file)}>
              <span className="flex min-w-0 items-center gap-3">
                <FileIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">{file.title}</span>
                {file.kind === 'release-notes' && <span className={ui.langTag}>PDF</span>}
              </span>
              <DownloadIcon className="h-4 w-4 shrink-0 text-neutral-500 transition-colors group-hover:text-red-600" />
            </button>
          </li>
        ))}
      </ul>
      {firmware.appliesTo.length > 0 && (
        <p className="mt-3 px-3 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700">Aplica a:</span> {firmware.appliesTo.join(', ')}
        </p>
      )}
    </>
  );
}

interface ProductResourcesProps {
  documents: ProductDocument[];
  firmware: ProductFirmware | null;
  onDownload?: DownloadHandler;
  licenseText?: ReactNode;
}

export function ProductResources({ documents, firmware, onDownload, licenseText }: ProductResourcesProps) {
  const [pending, setPending] = useState<FirmwareFile | null>(null);

  const startDownload = (file: FirmwareFile) => {
    onDownload?.({ id: file.id, title: file.title, url: file.url, kind: file.kind });
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const request = (file: FirmwareFile) => (file.requiresLicense ? setPending(file) : startDownload(file));

  if (documents.length === 0 && !firmware?.files.length) return null;

  return (
    <div className="space-y-4">
      {documents.length > 0 && (
        <Disclosure title="Documentos técnicos" defaultOpen>
          <DocumentsList documents={documents} onDownload={onDownload} />
        </Disclosure>
      )}

      {firmware && firmware.files.length > 0 && (
        <Disclosure
          title="Firmware"
          defaultOpen
          aside={
            firmware.note && (
              <span className="flex items-start gap-1.5">
                <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 text-neutral-400" />
                {firmware.note}
              </span>
            )
          }
        >
          <FirmwareList firmware={firmware} onRequest={request} />
        </Disclosure>
      )}

      <LicenseModal
        file={pending}
        onCancel={() => setPending(null)}
        onAccept={(file) => {
          setPending(null);
          startDownload(file);
        }}
      >
        {licenseText}
      </LicenseModal>
    </div>
  );
}