// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — IndexedDB Storage for Large Data
// ═══════════════════════════════════════════════════════════

/**
 * IndexedDB wrapper for storing large datasets
 * Provides better performance than localStorage for data > 5MB
 */

const DB_NAME = 'WhaleWatcherDB';
const DB_VERSION = 1;
const STORE_NAME = 'tableData';

class IndexedDBStorage {
    constructor() {
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store for table data
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async save(key, data) {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const record = {
                id: key,
                data: data,
                timestamp: Date.now()
            };

            const request = store.put(record);

            request.onsuccess = () => {
                const size = new Blob([JSON.stringify(data)]).size;
                //console.log(`[IndexedDB] Saved ${key}: ${(size / 1024).toFixed(1)} KB`);
                resolve();
            };

            request.onerror = () => {
                console.error('IndexedDB save error:', request.error);
                reject(request.error);
            };
        });
    }

    async load(key) {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const record = request.result;
                if (record) {
                    //console.log(`[IndexedDB] Loaded ${key}, age: ${Math.floor((Date.now() - record.timestamp) / 1000)}s`);
                    resolve(record.data);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('IndexedDB load error:', request.error);
                reject(request.error);
            };
        });
    }

    async delete(key) {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => {
                //console.log(`[IndexedDB] Deleted ${key}`);
                resolve();
            };

            request.onerror = () => {
                console.error('IndexedDB delete error:', request.error);
                reject(request.error);
            };
        });
    }

    async clear() {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                //console.log('[IndexedDB] Cleared all data');
                resolve();
            };

            request.onerror = () => {
                console.error('IndexedDB clear error:', request.error);
                reject(request.error);
            };
        });
    }

    async getUsage() {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = async () => {
                const keys = request.result;
                let totalSize = 0;

                for (const key of keys) {
                    const record = await this._loadRaw(key);
                    if (record) {
                        totalSize += new Blob([JSON.stringify(record)]).size;
                    }
                }

                resolve({
                    count: keys.length,
                    totalBytes: totalSize,
                    totalKB: totalSize / 1024,
                    totalMB: totalSize / (1024 * 1024)
                });
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async _loadRaw(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async cleanupOldData(maxAge = 7 * 24 * 60 * 60 * 1000) {
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();

            const cutoffTime = Date.now() - maxAge;
            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (cursor) {
                    if (cursor.value.timestamp < cutoffTime) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    //console.log(`[IndexedDB] Cleaned up ${deletedCount} old records`);
                    resolve(deletedCount);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Global instance
export const indexedDBStorage = new IndexedDBStorage();

/**
 * Hybrid storage that uses localStorage for small data and IndexedDB for large data
 */
export class HybridStorage {
    constructor(thresholdKB = 100) {
        this.thresholdBytes = thresholdKB * 1024;
    }

    async save(key, data) {
        const dataSize = new Blob([JSON.stringify(data)]).size;

        if (dataSize < this.thresholdBytes) {
            // Use localStorage for small data
            try {
                localStorage.setItem(key, JSON.stringify(data));
                //console.log(`[Hybrid] ${key}: ${(dataSize / 1024).toFixed(1)} KB (localStorage)`);
                return;
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    console.warn('[Hybrid] localStorage quota exceeded, falling back to IndexedDB');
                } else {
                    throw e;
                }
            }
        }

        // Use IndexedDB for large data
        await indexedDBStorage.save(key, data);
    }

    async load(key) {
        // Try localStorage first
        try {
            const localData = localStorage.getItem(key);
            if (localData) {
                return JSON.parse(localData);
            }
        } catch (e) {
            console.warn('[Hybrid] Failed to load from localStorage:', e);
        }

        // Fall back to IndexedDB
        return indexedDBStorage.load(key);
    }

    async delete(key) {
        localStorage.removeItem(key);
        await indexedDBStorage.delete(key);
    }

    async clear() {
        localStorage.clear();
        await indexedDBStorage.clear();
    }
}

export const hybridStorage = new HybridStorage(100); // 100KB threshold
