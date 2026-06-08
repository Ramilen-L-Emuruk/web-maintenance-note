import type { Reminder } from './reminders'

const LAST_NOTIFIED_KEY = 'mn:last-notified'

/** 通知の許可状態。 */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** 通知許可をリクエストする。 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

/**
 * リマインドを OS 通知として表示する。
 * 静的 PWA にはプッシュサーバーが無いため、アプリ起動時や
 * Periodic Background Sync 契機でのローカル通知として扱う。
 * iOS ではホーム画面に追加した PWA でのみ動作する点に注意。
 */
export async function notifyReminders(reminders: Reminder[]): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (reminders.length === 0) return

  // 1日に1回まで（同じ内容での通知連発を防ぐ）
  const today = new Date().toISOString().slice(0, 10)
  const signature = today + '|' + reminders.map((r) => r.id + r.severity).join(',')
  if (localStorage.getItem(LAST_NOTIFIED_KEY) === signature) return
  localStorage.setItem(LAST_NOTIFIED_KEY, signature)

  const overdue = reminders.filter((r) => r.severity === 'overdue').length
  const soon = reminders.filter((r) => r.severity === 'soon').length
  const body = [overdue ? `超過 ${overdue}件` : '', soon ? `まもなく ${soon}件` : '']
    .filter(Boolean)
    .join(' / ')

  const title = 'メンテナンスノート'
  const options: NotificationOptions = {
    body: `${body}\n${reminders
      .slice(0, 3)
      .map((r) => `・${r.bikeName} ${r.title}（${r.detail}）`)
      .join('\n')}`,
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'maintenance-reminder',
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
    } else {
      new Notification(title, options)
    }
  } catch {
    /* noop */
  }
}

/** Periodic Background Sync を登録（対応ブラウザのみ）。 */
export async function registerPeriodicSync(): Promise<void> {
  try {
    const reg: any = await navigator.serviceWorker?.ready
    if (reg && 'periodicSync' in reg) {
      const status = await (navigator as any).permissions?.query({ name: 'periodic-background-sync' })
      if (!status || status.state === 'granted') {
        await reg.periodicSync.register('check-reminders', {
          minInterval: 24 * 60 * 60 * 1000,
        })
      }
    }
  } catch {
    /* 非対応環境は無視 */
  }
}
