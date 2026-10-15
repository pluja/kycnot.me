const markControls = (expanded: string) =>
  `document.querySelectorAll('[aria-controls="' + slot.id + '"]').forEach((link) => link.setAttribute('aria-expanded', ${expanded}))`

// closeSlot empties a slot and, for slots that follow the address bar, restores the URL from before it opened.
const closeSlot = `slot.replaceChildren(); delete slot.dataset.openUrl; ${markControls("'false'")}; if (slot.hasAttribute('data-follows-url') && slot.dataset.returnUrl) history.replaceState(history.state, '', slot.dataset.returnUrl)`

// inlinePanelToggle loads a panel into a slot with htmx, keeping the link as the no-JS fallback.
// Clicking the same link again empties the slot. With `select`, the response is a full page: only
// that element is kept, and the address bar follows the panel so Back and refresh still work.
// A load that fails or brings nothing back leaves the slot closed, so the next click retries.
export function inlinePanelToggle({
  url,
  slotId,
  select,
  open = false,
}: {
  url: string
  slotId: string
  select?: string
  open?: boolean
}) {
  return {
    href: url,
    'hx-get': url,
    'hx-target': `#${slotId}`,
    'hx-swap': 'innerHTML show:none',
    ...(select ? { 'hx-select': select, 'hx-push-url': 'true' } : {}),
    'hx-on:htmx:before-request': `const slot = document.getElementById('${slotId}'); const url = this.getAttribute('href'); if (slot.dataset.openUrl === url) { event.preventDefault(); ${closeSlot} } else { if (!slot.dataset.openUrl) slot.dataset.returnUrl = location.href; slot.dataset.openUrl = url; ${markControls("link === this ? 'true' : 'false'")} }`,
    'hx-on:htmx:after-request': `const slot = document.getElementById('${slotId}'); if (!slot.childElementCount) { ${closeSlot} }`,
    'aria-controls': slotId,
    'aria-expanded': open ? ('true' as const) : ('false' as const),
  }
}

// inlinePanelClose closes the surrounding slot in place; without JS the link navigates instead.
export const inlinePanelClose = {
  'hx-on:click': `const slot = this.closest('[data-inline-panel]'); if (slot) { event.preventDefault(); ${closeSlot} }`,
}

// swapRejectedActions lets htmx swap in a rejected action's 4xx response, which carries the form and its error
// message; htmx skips those by default.
export const swapRejectedActions =
  'const status = event.detail.xhr.status; if (status >= 400 && status < 500 && status !== 404) { event.detail.shouldSwap = true; event.detail.isError = false }'
