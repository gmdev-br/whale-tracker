import { INFO_URL, RETRY_DELAY_MS } from '../config.js';
import {
    setAllRows, getAllRows, setLoadedCount, setScanning, getCurrentPrices, getScanning,
    getIsPaused, getRenderPending, getLastSaveTime, getLastSeenAccountValues, setLastSeenAccountValues,
    getWhaleMeta, setWhaleMeta
} from '../state.js';
import { saveSettings } from '../storage/settings.js';

// ── Adaptive Rate Limiter ─────────────────────────────────────────
class AdaptiveRateLimiter {
    constructor(baseRequestsPerSecond = 9.5) {
        this.baseDelay = 1000 / baseRequestsPerSecond;
        this.minDelay = 1000 / 20; // Max 20 req/s
        this.maxDelay = 1000 / 2;  // Min 2 req/s
        this.lastCall = 0;
        this.successCount = 0;
        this.failureCount = 0;
        this.currentDelay = this.baseDelay;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
    }

    async acquire() {
        const now = Date.now();
        const nextCall = Math.max(now, this.lastCall + this.currentDelay);
        const waitTime = nextCall - now;
        this.lastCall = nextCall;

        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
    }

    reportSuccess() {
        this.successCount++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        // Gradually increase rate after consistent success
        if (this.consecutiveSuccesses > 10) {
            this.currentDelay = Math.max(
                this.minDelay,
                this.currentDelay * 0.95
            );
            this.consecutiveSuccesses = 0;
        }
    }

    reportFailure() {
        this.failureCount++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        // Slow down immediately on failure
        this.currentDelay = Math.min(
            this.maxDelay,
            this.currentDelay * 2
        );

        // Reset to base delay after 5 consecutive failures
        if (this.consecutiveFailures > 5) {
            this.currentDelay = this.baseDelay;
            this.consecutiveFailures = 0;
        }
    }

    getCurrentRate() {
        return 1000 / this.currentDelay;
    }

    reset() {
        this.currentDelay = this.baseDelay;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
    }
}

const apiRateLimiter = new AdaptiveRateLimiter(9.5);

// ── Concurrency-limited streaming loader ──────────────────────────────
// Fires MAX_CONCURRENCY requests at a time. As each resolves, the next
// whale is immediately dispatched — keeping the pipeline full without
// ever exceeding the rate limit. Retries on 429 with exponential backoff.

export async function fetchWithRetry(whale, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await apiRateLimiter.acquire();
            const resp = await fetch(INFO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearinghouseState', user: whale.ethAddress })
            });
            if (resp.status === 429) {
                apiRateLimiter.reportFailure();
                const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Rate limited, retrying in ${wait}ms…`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            if (!resp.ok) {
                apiRateLimiter.reportFailure();
                return null;
            }
            apiRateLimiter.reportSuccess();
            return await resp.json();
        } catch (error) {
            if (attempt === retries - 1) {
                apiRateLimiter.reportFailure();
                return null;
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

export function processState(whale, state, allRows) {
    if (!state) return;
    const currentPrices = getCurrentPrices();
    const assetPositions = state.assetPositions || [];
    const positions = [];

    // Single pass filtering and pre-parsing
    for (let i = 0; i < assetPositions.length; i++) {
        const p = assetPositions[i];
        const pos = p.position;
        const size = parseFloat(pos.szi);
        if (size === 0) continue;

        if (pos.entryPx === null || pos.entryPx === undefined) {
            console.warn(`Invalid entry price for ${whale.ethAddress} in ${pos.coin}`);
            continue;
        }

        // Store for later mapping
        p._parsedSize = size;
        positions.push(p);
    }

    let accountValue = parseFloat(whale.accountValue);

    if (state.marginSummary && state.marginSummary.accountValue) {
        const chAccountValue = parseFloat(state.marginSummary.accountValue);
        const diff = Math.abs(accountValue - chAccountValue);
        const pctDiff = accountValue > 0 ? (diff / accountValue) * 100 : 0;

        if (pctDiff > 20 && chAccountValue > 0) {
            accountValue = chAccountValue;
        }
    }

    // Update global whaleMeta
    const whaleMeta = getWhaleMeta();
    whaleMeta[whale.ethAddress] = {
        displayName: whale.displayName || '',
        accountValue: accountValue,
        windowPerformances: whale.windowPerformances || {}
    };

    const ethAddress = whale.ethAddress;
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const pos = p.position;
        const size = p._parsedSize;
        const coin = pos.coin;
        const markPrice = parseFloat(currentPrices[coin] || pos.entryPx);
        const liqPx = parseFloat(pos.liquidationPx);
        const entryPx = parseFloat(pos.entryPx);

        let distPct = null;
        if (liqPx > 0 && markPrice > 0) {
            distPct = Math.abs((markPrice - liqPx) / markPrice) * 100;
        }

        allRows.push({
            address: ethAddress,
            coin: coin,
            szi: size,
            side: size > 0 ? 'long' : 'short',
            leverageType: pos.leverage?.type || 'cross',
            leverageValue: parseInt(pos.leverage?.value || 1, 10),
            positionValue: parseFloat(pos.positionValue),
            entryPx: entryPx,
            markPrice: markPrice,
            unrealizedPnl: parseFloat(pos.unrealizedPnl),
            funding: parseFloat(pos.cumFunding?.sinceOpen || 0),
            liquidationPx: liqPx,
            distPct: distPct,
            marginUsed: parseFloat(pos.marginUsed),
        });
    }
}

export async function streamPositions(whaleList, minVal, maxConcurrency, callbacks) {
    const { updateStats, updateCoinFilter, renderTable, updateTableDataOnly, saveTableData, setStatus, setProgress, finishScan, setLastSaveTime, setRenderPending } = callbacks;
    const lastSaveTime = getLastSaveTime();
    let localLastSaveTime = lastSaveTime;
    let allRows = getAllRows();
    const lastSeenAccountValues = getLastSeenAccountValues();
    const newSeenAccountValues = { ...lastSeenAccountValues };

    document.getElementById('autoLoading').style.display = 'block';
    document.getElementById('stopBtn').style.display = 'inline-block';
    const queue = [...whaleList];
    let active = 0;
    let done = 0;
    const total = queue.length;

    // Track skipped whales for Delta Scanning
    let skippedCount = 0;

    // PERFORMANCE: Use a Map for O(1) address tracking instead of O(N) array filtering
    const positionsByAddress = new Map();
    // Initialize map with existing rows if any
    allRows.forEach(r => {
        if (!positionsByAddress.has(r.address)) {
            positionsByAddress.set(r.address, []);
        }
        positionsByAddress.get(r.address).push(r);
    });

    function processWhale(whale) {
        // Delta Scanning: check if account value changed
        const currentVal = parseFloat(whale.accountValue);
        const lastVal = lastSeenAccountValues[whale.ethAddress];

        // Only skip if we already have rows for this address (to be safe)
        const hasData = positionsByAddress.has(whale.ethAddress);

        if (lastVal && Math.abs(currentVal - lastVal) < 0.01 && hasData) {
            skippedCount++;
            done++;
            setLoadedCount(done);
            const pct = 15 + (done / total) * 80;
            setProgress(Math.min(pct, 95));
            return Promise.resolve(null);
        }

        return fetchWithRetry(whale).then(state => {
            if (state) {
                // Remove existing rows for this address using the Map (O(1))
                positionsByAddress.set(whale.ethAddress, []);

                // Process state will push new rows into the global allRows array.
                // To keep the Map in sync, we'll temporarily capture the new rows.
                const newRowsForWhale = [];
                processState(whale, state, newRowsForWhale);

                // Update our Map. We DON'T flatten allRows here (O(N)) because 
                // it would cause O(N*W) complexity during the scan.
                positionsByAddress.set(whale.ethAddress, newRowsForWhale);

                newSeenAccountValues[whale.ethAddress] = currentVal;
            }
            done++;
            setLoadedCount(done);
            const pct = 15 + (done / total) * 80;
            setProgress(Math.min(pct, 95));
            return state;
        });
    }

    // Track if this is the first render during scanning
    let isFirstScanRender = true;

    function scheduleRender() {
        if (getRenderPending()) return;
        setRenderPending(true);

        // PERFORMANCE: Increased debounce during scan from 1000ms to 3000ms
        // This reduces render frequency significantly during heavy scanning operations
        // Normal (non-scan) delay remains at 400ms for responsive UI
        const renderDelay = getScanning() ? 3000 : 400;

        setTimeout(() => {
            setRenderPending(false);

            // PERFORMANCE: Flatten the map once here (at most once every 3s during scan)
            // instead of on every whale update. This transforms O(N*W) into O(N).
            allRows = Array.from(positionsByAddress.values()).flat();
            setAllRows(allRows);

            // IMPORTANT: During scanning, use updateTableDataOnly to preserve column widths/order
            // Only do full renderTable on first scan render or when not scanning
            if (getScanning() && !isFirstScanRender && updateTableDataOnly) {
                updateTableDataOnly();
            } else {
                if (isFirstScanRender) {
                    isFirstScanRender = false;
                }
                renderTable();
            }

            // Periodic save to handle mid-scan refreshes
            const now = Date.now();
            if (now - localLastSaveTime > 2000) {
                saveTableData();
                setLastSaveTime(now);
                localLastSaveTime = now;
            }
        }, renderDelay);
    }

    await new Promise(resolve => {
        async function dispatch() {
            // Stop if user requested
            if (!getScanning()) {
                if (active === 0) resolve();
                return;
            }
            // Fill up to maxConcurrency slots
            while (getScanning() && active < maxConcurrency && queue.length > 0) {
                const whale = queue.shift();
                active++;

                // If paused, wait before fetching
                while (getScanning() && getIsPaused()) {
                    await new Promise(r => setTimeout(r, 500));
                }

                processWhale(whale).then(state => {
                    active--;
                    const statusMsg = skippedCount > 0
                        ? `Loading ${done}/${total} whales… (Skipped ${skippedCount} unchanged)`
                        : `Loading ${done}/${total} whales…`;
                    setStatus(statusMsg, 'scanning');
                    scheduleRender();
                    if (!getScanning()) {
                        if (active === 0) resolve();
                    } else if (queue.length > 0) {
                        dispatch(); // refill the slot immediately
                    } else if (active === 0) {
                        resolve(); // all done
                    }
                });
            }
        }
        dispatch();
    });

    document.getElementById('autoLoading').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    // Final render to make sure everything is shown
    // Use full renderTable for final render to ensure everything is properly displayed
    updateStats(false, allRows);
    updateCoinFilter(allRows);
    renderTable();
    saveTableData(); // Save final data
    setLastSeenAccountValues(newSeenAccountValues);
    saveSettings(); // Save delta scanning values
    finishScan(setStatus, setProgress);
}
