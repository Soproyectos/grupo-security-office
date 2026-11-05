import { PREVIEW_FIELD_ATTR, PREVIEW_HIGHLIGHT_ATTR } from './preview-fields'

const FIELD = `[${PREVIEW_FIELD_ATTR}]`
const HIGHLIGHT = `[${PREVIEW_HIGHLIGHT_ATTR}]`
// `--color-primary` is on the app's :root, so it reaches the frame through the cloned stylesheets.
// `--library-action` is scoped to `.biblioteca-workspace` and never exists inside the frame.
const BRAND_RED = 'var(--color-primary, #ce0203)'

/** Injected into the preview frame: hover on editable zones, the highlighted field and reduced motion. */
export const PREVIEW_FRAME_CSS = `
html, body { margin: 0; }

${FIELD} {
  cursor: pointer;
  transition: outline-color 150ms ease-out, background-color 150ms ease-out;
}

${FIELD}:hover {
  outline: 2px dashed ${BRAND_RED};
  outline-offset: 3px;
}

${HIGHLIGHT},
${HIGHLIGHT}:hover {
  outline: 3px solid ${BRAND_RED};
  outline-offset: 3px;
  border-radius: 6px;
  background-color: rgb(206 2 3 / 8%);
}

@media (prefers-reduced-motion: reduce) {
  ${FIELD} {
    transition: none;
  }
}
`
