// Handlers are delegated from `document` so HTMX OOB swaps of
// #swap-flip / #swap-currency-from / #swap-currency-to don't strip
// listeners off freshly-rendered nodes.

let wired = false

document.addEventListener('astro:page-load', () => {
  if (wired) return
  wired = true
  wireDelegated()
})

function wireDelegated() {
  // Capture phase: Astro's <ClientRouter /> intercepts <a> clicks in capture
  // too. preventDefault must fire before its handler or ClientRouter starts
  // SPA-fetching the GET URL and wipes results.
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('input', onInput)
  // <details>.toggle does not bubble; capture phase still reaches it.
  document.addEventListener('toggle', onToggle, true)
}

function onClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  document.querySelectorAll<HTMLDetailsElement>('details[data-swap-select]').forEach((root) => {
    if (root.open && !root.contains(target)) root.open = false
  })

  // Preserve cmd/ctrl-click "open in new tab" semantics on flip and options.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const flip = target.closest<HTMLAnchorElement>('#swap-flip')
  if (flip) {
    event.preventDefault()
    event.stopImmediatePropagation()
    handleFlip(flip)
    return
  }

  const option = target.closest<HTMLAnchorElement>('[data-swap-select-option]')
  if (option) {
    const root = option.closest<HTMLDetailsElement>('details[data-swap-select]')
    if (!root) return
    event.preventDefault()
    event.stopImmediatePropagation()
    selectOption(root, option)
  }
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const root = target.closest<HTMLDetailsElement>('details[data-swap-select]')
  if (!root || !root.open) return
  const search = root.querySelector<HTMLInputElement>('[data-swap-select-search]')

  if (event.key === 'Escape') {
    event.preventDefault()
    root.open = false
    root.querySelector<HTMLElement>('summary')?.focus()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocus(root, 1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(root, -1)
    return
  }
  if (event.key === 'Enter' && document.activeElement === search) {
    const first = visibleOptions(root)[0]
    if (first) {
      event.preventDefault()
      first.click()
    }
  }
}

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  if (target.matches('[data-swap-select-search]')) {
    const root = target.closest<HTMLDetailsElement>('details[data-swap-select]')
    const list = root?.querySelector<HTMLElement>('[data-swap-select-list]')
    if (root) applyFilter(root, (target as HTMLInputElement).value)
    if (list) list.scrollTop = 0
    return
  }

  // Clear the peer leg so the server sees only the side the user is driving.
  const otherId = AMOUNT_PEERS[target.id]
  if (!otherId) return
  const self = target as HTMLInputElement
  const other = document.querySelector<HTMLInputElement>(`#${otherId}`)
  if (other && self.value !== '' && other.value !== '') other.value = ''
}

const AMOUNT_PEERS: Record<string, string> = {
  'swap-send': 'swap-receive',
  'swap-receive': 'swap-send',
}

function onToggle(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLDetailsElement)) return
  if (!target.matches('details[data-swap-select]')) return
  if (!target.open) return
  const search = target.querySelector<HTMLInputElement>('[data-swap-select-search]')
  const list = target.querySelector<HTMLElement>('[data-swap-select-list]')
  // Reset filter on each open so arrow-key browsing always starts from the full list.
  if (search) {
    search.value = ''
    applyFilter(target, '')
  }
  scrollSelectedIntoView(target, list)
  requestAnimationFrame(() => search?.focus())
}

function handleFlip(flip: HTMLAnchorElement) {
  const url = new URL(flip.href, window.location.href)
  const newFrom = url.searchParams.get('from')
  const newTo = url.searchParams.get('to')
  if (!newFrom || !newTo) return

  // Assign amounts before the non-silent setSelected: .value= doesn't fire
  // input events, so HTMX submits exactly once with the fully-updated form.
  const send = document.querySelector<HTMLInputElement>('#swap-send')
  const receive = document.querySelector<HTMLInputElement>('#swap-receive')
  if (send) send.value = url.searchParams.get('sendAmount') ?? ''
  if (receive) receive.value = url.searchParams.get('receiveAmount') ?? ''

  setSelected('from', newFrom, { silent: true })
  setSelected('to', newTo)
}

function setSelected(name: 'from' | 'to', value: string, opts?: { silent?: boolean }) {
  const root = document.getElementById(`swap-currency-${name}`)
  if (!(root instanceof HTMLDetailsElement)) return
  const option = root.querySelector<HTMLAnchorElement>(
    `[data-swap-option-value="${CSS.escape(value)}"]`
  )
  if (option) selectOption(root, option, opts)
}

function selectOption(
  root: HTMLDetailsElement,
  option: HTMLAnchorElement,
  opts?: { silent?: boolean }
) {
  const value = option.dataset.swapOptionValue ?? ''
  const code = option.dataset.swapOptionCode ?? ''
  const network = option.dataset.swapOptionNetwork ?? ''
  if (!value) return

  const hidden = root.querySelector<HTMLInputElement>('[data-swap-select-input]')
  if (hidden) hidden.value = value

  const summary = root.querySelector<HTMLElement>('summary')
  if (summary) {
    const optionIcon = option.querySelector<SVGElement>('svg')
    const summaryIcon = summary.querySelector<SVGElement>('svg')
    if (optionIcon && summaryIcon) {
      const clone = optionIcon.cloneNode(true) as SVGElement
      clone.setAttribute('class', summaryIcon.getAttribute('class') ?? '')
      summaryIcon.replaceWith(clone)
    }

    const codeEl = summary.querySelector<HTMLElement>('span.font-title')
    if (codeEl) codeEl.textContent = code

    let badge = summary.querySelector<HTMLElement>('[data-swap-network-badge]')
    if (network) {
      if (!badge && codeEl) {
        badge = document.createElement('span')
        badge.dataset.swapNetworkBadge = ''
        badge.className =
          'rounded-sm bg-night-700 px-1 py-px text-[9px] font-semibold tracking-wider text-day-200 uppercase'
        codeEl.after(badge)
      }
      if (badge) badge.textContent = network
    } else if (badge) {
      badge.remove()
    }
  }

  root.querySelectorAll<HTMLAnchorElement>('[data-swap-select-option]').forEach((o) => {
    if (o === option) {
      o.setAttribute('aria-current', 'true')
      o.classList.remove('text-day-200', 'hover:bg-night-800')
      o.classList.add('bg-green-500/10', 'text-green-100')
    } else {
      o.removeAttribute('aria-current')
      o.classList.remove('bg-green-500/10', 'text-green-100')
      o.classList.add('text-day-200', 'hover:bg-night-800')
    }
  })

  root.open = false
  if (!opts?.silent) {
    pushPairUrl()
    triggerFormSubmit()
  }
}

function triggerFormSubmit() {
  // requestSubmit fires a native SubmitEvent; htmx.trigger dispatches a
  // CustomEvent that HTMX's form listener doesn't always catch.
  const form = document.getElementById('swap-form')
  if (form instanceof HTMLFormElement) form.requestSubmit()
}

function pushPairUrl() {
  const fromInput = document.querySelector<HTMLInputElement>(
    '#swap-currency-from [data-swap-select-input]'
  )
  const toInput = document.querySelector<HTMLInputElement>(
    '#swap-currency-to [data-swap-select-input]'
  )
  const sendInput = document.querySelector<HTMLInputElement>('#swap-send')
  const receiveInput = document.querySelector<HTMLInputElement>('#swap-receive')
  const from = fromInput?.value
  const to = toInput?.value
  if (!from || !to) return
  const url = new URL(window.location.href)
  url.pathname = '/swap'
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  // URL reflects whichever side is driving, matching the input clear rule.
  const sendVal = sendInput?.value.trim() ?? ''
  const receiveVal = receiveInput?.value.trim() ?? ''
  if (sendVal !== '') {
    url.searchParams.set('sendAmount', sendVal)
    url.searchParams.delete('receiveAmount')
  } else if (receiveVal !== '') {
    url.searchParams.set('receiveAmount', receiveVal)
    url.searchParams.delete('sendAmount')
  } else {
    url.searchParams.delete('sendAmount')
    url.searchParams.delete('receiveAmount')
  }
  history.pushState({}, '', url.toString())
}

function visibleOptions(root: HTMLElement): HTMLAnchorElement[] {
  return Array.from(
    root.querySelectorAll<HTMLAnchorElement>('[data-swap-select-option]:not([hidden])')
  )
}

function moveFocus(root: HTMLDetailsElement, direction: 1 | -1) {
  const options = visibleOptions(root)
  if (options.length === 0) return
  const active = document.activeElement as HTMLElement | null
  const currentIdx = active ? options.indexOf(active as HTMLAnchorElement) : -1
  let nextIdx: number
  if (currentIdx === -1) {
    nextIdx = direction > 0 ? 0 : options.length - 1
  } else {
    nextIdx = Math.max(0, Math.min(options.length - 1, currentIdx + direction))
  }
  const next = options[nextIdx]
  if (!next) return
  next.focus({ preventScroll: true })
  next.scrollIntoView({ block: 'nearest' })
}

function scrollSelectedIntoView(root: HTMLElement, list: HTMLElement | null) {
  if (!list) return
  const selected = root.querySelector<HTMLAnchorElement>(
    '[data-swap-select-option][aria-current="true"]'
  )
  if (!selected) {
    list.scrollTop = 0
    return
  }
  // 60px leaves ~2 rows of context above the selection.
  list.scrollTop = selected.offsetTop - list.offsetTop - 60
}

function applyFilter(root: HTMLElement, raw: string) {
  const query = raw.trim().toLowerCase()
  const options = root.querySelectorAll<HTMLAnchorElement>('[data-swap-select-option]')
  const visibleByGroup: Record<string, number> = {}
  options.forEach((option) => {
    const text = option.getAttribute('data-search-text') ?? ''
    const group = option.getAttribute('data-group') ?? ''
    const matches = query === '' || text.includes(query)
    option.hidden = !matches
    if (matches) visibleByGroup[group] = (visibleByGroup[group] ?? 0) + 1
  })
  root.querySelectorAll<HTMLElement>('[data-swap-select-heading]').forEach((heading) => {
    const group = heading.getAttribute('data-group') ?? ''
    heading.hidden = (visibleByGroup[group] ?? 0) === 0
  })
  const totalVisible = Object.values(visibleByGroup).reduce((a, b) => a + b, 0)
  const empty = root.querySelector<HTMLElement>('[data-swap-select-empty]')
  const queryEl = root.querySelector<HTMLElement>('[data-swap-select-query]')
  if (empty) empty.hidden = totalVisible > 0
  if (queryEl) queryEl.textContent = raw.trim()
}
