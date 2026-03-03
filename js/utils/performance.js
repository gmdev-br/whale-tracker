// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Performance Utilities
// ═══════════════════════════════════════════════════════════

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Creates an adaptive debounced function with different delays based on system state
 * @param {Function} func - Function to debounce
 * @param {Object} options - Configuration options
 * @param {number} options.scanDelay - Delay during scanning (default: 100ms)
 * @param {number} options.idleDelay - Delay when idle (default: 300ms)
 * @param {Function} options.getState - Function to get current state (should return 'scanning' or 'idle')
 */
export function adaptiveDebounce(func, options = {}) {
    const { scanDelay = 100, idleDelay = 300, getState } = options;
    let timeout;

    return function executedFunction(...args) {
        clearTimeout(timeout);

        // Determine current delay based on state
        const currentState = getState ? getState() : 'idle';
        const delay = currentState === 'scanning' ? scanDelay : idleDelay;

        timeout = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 */
export function throttle(func, wait = 100) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, wait);
        }
    };
}

/**
 * Creates a memoized version of the function.
 * The memoized function caches the result of func for a given set of arguments.
 */
export function memoize(func, keyGenerator = null) {
    const cache = new Map();
    return function (...args) {
        const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = func.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

/**
 * Simple cache with TTL (time to live) support
 */
export class Cache {
    constructor(ttl = 5000) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    clear() {
        this.cache.clear();
    }

    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
}

/**
 * Batch multiple function calls into a single requestAnimationFrame
 */
export function batchRAF(callback) {
    let scheduled = false;
    return function (...args) {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => {
                callback(...args);
                scheduled = false;
            });
        }
    };
}

/**
 * Measure execution time of a function
 */
export function measureTime(func, label) {
    return function (...args) {
        const start = performance.now();
        const result = func.apply(this, args);
        const end = performance.now();
        //console.log(`${label}: ${(end - start).toFixed(2)}ms`);
        return result;
    };
}
