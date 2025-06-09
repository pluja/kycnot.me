import { registerSW } from 'virtual:pwa-register'

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __SW_REGISTRATION__?: ServiceWorkerRegistration
  }
}

export const updateSW = registerSW({
  immediate: true,
  onRegisteredSW: (_swScriptUrl, registration) => {
    if (registration) window.__SW_REGISTRATION__ = registration
  },
  onNeedRefresh: () => {
    void updateSW(true)
  },
  onRegisterError: (error) => {
    console.error('Service Worker registration error', error)
  },
})
