import { typedLocalStorage } from '../localstorage'

type SafeResult = { success: false; error: string } | { success: true; error?: undefined }

export function supportsBrowserNotifications() {
  return 'Notification' in window
}

export function isBrowserNotificationsEnabled() {
  const browserNotificationsEnabled = typedLocalStorage.browserNotificationsEnabled.get()
  if (!browserNotificationsEnabled) return false

  if (!document.body.hasAttribute('data-is-logged-in')) {
    typedLocalStorage.browserNotificationsEnabled.set(false)
    return false
  }

  return supportsBrowserNotifications() && Notification.permission === 'granted'
}

export async function enableBrowserNotifications(): Promise<SafeResult> {
  try {
    if (!supportsBrowserNotifications()) {
      return { success: false, error: 'Browser notifications are not supported' }
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission denied' }
    }

    typedLocalStorage.browserNotificationsEnabled.set(true)
    return { success: true }
  } catch (error) {
    console.error('Browser notification setup failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Browser notification setup failed: ${errorMessage}` }
  }
}

export function disableBrowserNotifications(): SafeResult {
  try {
    typedLocalStorage.browserNotificationsEnabled.set(false)
    return { success: true }
  } catch (error) {
    console.error('Browser notification disable failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Browser notification disable failed: ${errorMessage}` }
  }
}

export function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (!isBrowserNotificationsEnabled()) {
    console.warn('Browser notifications are not enabled')
    return null
  }

  try {
    return new Notification(title, options)
  } catch (error) {
    console.error('Failed to show browser notification:', error)
    return null
  }
}
