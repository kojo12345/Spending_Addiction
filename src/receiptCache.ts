const DB_NAME = 'paycycle-receipts'
const STORE_NAME = 'receipts'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open receipt cache.'))
  })
}

export async function cacheReceipt(id: string, dataUrl: string) {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(dataUrl, id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Unable to cache receipt.'))
  })
  db.close()
}

export async function readCachedReceipt(id: string) {
  const db = await openDatabase()
  const result = await new Promise<string | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result as string | undefined)
    request.onerror = () => reject(request.error ?? new Error('Unable to read cached receipt.'))
  })
  db.close()
  return result
}

export function compressReceipt(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Your browser could not process this image.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to compress this image.')), 'image/jpeg', 0.78)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read this image.'))
    }
    image.src = url
  })
}
