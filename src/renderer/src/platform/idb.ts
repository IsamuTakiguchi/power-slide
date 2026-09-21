/**
 * IndexedDB の薄いラッパー（Web 版専用）。
 * 下書きのデッキと、File System Access API のハンドルを保存するのに使う。
 * localStorage ではなく IndexedDB なのは、ハンドル（構造化クローンが必要）を入れるため。
 */

const DB_NAME = 'power-slide'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB を開けませんでした'))
  })
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = action(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB の操作に失敗しました'))
        tx.oncomplete = () => db.close()
      }),
  )
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('readonly', (store) => store.get(key) as IDBRequest<T | undefined>)
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run('readwrite', (store) => store.put(value, key)).then(() => undefined)
}

export function idbDelete(key: string): Promise<void> {
  return run('readwrite', (store) => store.delete(key)).then(() => undefined)
}
