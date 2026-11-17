const DATABASE_NAME = "english-word-quiz-audio-cache"
const STORE_NAME = "tts-audio"
const DATABASE_VERSION = 1

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function getCachedTtsAudio(key: string): Promise<Blob | null> {
  const database = await openDatabase()
  if (!database) return null
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      const value = request.result
      resolve(value instanceof Blob ? value : null)
      database.close()
    }
    request.onerror = () => { database.close(); resolve(null) }
  })
}

export async function saveCachedTtsAudio(key: string, audio: Blob): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(audio, key)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); resolve() }
    transaction.onabort = () => { database.close(); resolve() }
  })
}
