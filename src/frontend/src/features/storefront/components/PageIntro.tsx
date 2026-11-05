import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface PageIntroBreadcrumb {
  label: string
  /** Omit on the last item: it is the current page. */
  to?: string
}

export interface PageIntroProps {
  breadcrumbs: PageIntroBreadcrumb[]
  title: string
  description?: string
}

/** Top band shared by the service pages and the institutional pages. */
export default function PageIntro({ breadcrumbs, title, description }: PageIntroProps) {
  return (
    <section className="w-full bg-security-600 text-white">
      <div className="mx-auto max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <nav aria-label="Ruta">
          <ol className="flex flex-wrap items-center">
            {breadcrumbs.map((crumb, index) => {
              const isCurrent = index === breadcrumbs.length - 1 && !crumb.to
              return (
                <Fragment key={`${index}-${crumb.label}`}>
                  <li className="flex items-center">
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        className="inline-flex min-h-11 items-center !text-white underline-offset-4 hover:!text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current={isCurrent ? 'page' : undefined} className="inline-flex min-h-11 items-center font-bold">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                  {index < breadcrumbs.length - 1 && (
                    <li aria-hidden="true" className="px-2">
                      ›
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ol>
        </nav>
        <h1 className="mt-2 text-balance text-3xl font-bold text-white lg:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-[65ch] text-lg text-white">{description}</p>}
      </div>
    </section>
  )
}
