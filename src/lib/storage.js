// 用 IndexedDB 保存导入过的 EPUB 原始文件与阅读进度，刷新后可继续阅读。

const DB_NAME = 'ja-epub-reader'
const STORE = 'books'
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function bookId(file) {
  return `${file.name}::${file.size}`
}

export async function saveBook(rec) {
  return tx('readwrite', (s) => s.put(rec))
}

export async function getBook(id) {
  return tx('readonly', (s) => s.get(id))
}

export async function listBooks() {
  const all = await tx('readonly', (s) => s.getAll())
  return (all || []).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))
}

export async function deleteBook(id) {
  return tx('readwrite', (s) => s.delete(id))
}

export async function updateProgress(id, patch) {
  const rec = await getBook(id)
  if (!rec) return
  Object.assign(rec, patch)
  await saveBook(rec)
}
