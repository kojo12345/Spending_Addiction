const DB_NAME = 'paycycle-reminders'
const STORE_NAME = 'reminders'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readReminder() {
  const db = await openDatabase()
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('daily')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return result
}

async function saveReminder(value) {
  const db = await openDatabase()
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, 'daily')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  db.close()
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_DAILY_REMINDER') {
    event.waitUntil(readReminder().then((previous) => saveReminder({ ...(previous ?? {}), ...event.data.reminder })))
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'paycycle-daily-reminder') return
  event.waitUntil((async () => {
    const reminder = await readReminder()
    if (!reminder?.enabled || Notification.permission !== 'granted') return
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const minutes = now.getHours() * 60 + now.getMinutes()
    const [hour, minute] = reminder.time.split(':').map(Number)
    if (minutes < hour * 60 + minute || reminder.lastDate === date) return
    await self.registration.showNotification('Paycycle', {
      body: `Today's comfortable amount: ${reminder.allowance}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: '/' },
    })
    await saveReminder({ ...reminder, lastDate: date })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'))
})
