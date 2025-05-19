import type { Tail } from 'ts-essentials'

export function addOnLoadEventListener(
  ...args: Tail<Parameters<typeof document.addEventListener<'astro:page-load'>>>
) {
  document.addEventListener('astro:page-load', ...args)
  document.addEventListener('htmx:afterSwap', ...args)
}
