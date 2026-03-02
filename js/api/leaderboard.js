// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Leaderboard API
// ═══════════════════════════════════════════════════════════

import { LEADERBOARD_URL } from '../config.js';
import {
    setAllRows, setLoadedCount, setScanning, setIsPaused, setWhaleList,
    getScanning, getIsPaused, getMaxConcurrency, getFxReady, getFxRates, getActiveCurrency
} from '../state.js';
import { streamPositions } from './hyperliquid.js';

export async function startScan(callbacks) {
    const { setStatus, setProgress, fetchAllMids, updateStats, updateCoinFilter, renderTable, updateTableDataOnly, saveTableData, finishScan, setLastSaveTime, setRenderPending } = callbacks;
    const minVal = parseFloat(document.getElementById('minValue').value) || 2500000;
    const scanStartTime = Date.now();

    document.getElementById('scanBtn').disabled = true;
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').textContent = '⏸ Pause';
    setIsPaused(false);
    document.getElementById('positionsTableBody').innerHTML = `<tr><td colspan="14" class="empty-cell"><span class="spinner"></span> Fetching leaderboard…</td></tr>`;
    setAllRows([]);
    setLoadedCount(0);

    setStatus('Fetching leaderboard…', 'scanning');
    setProgress(5);

    try {
        // Refresh prices before scanning to ensure accuracy
        await fetchAllMids();

        const lbResp = await fetch(LEADERBOARD_URL);
        if (!lbResp.ok) throw new Error(`Leaderboard HTTP ${lbResp.status}`);
        const lbData = await lbResp.json();
        const rows = lbData.leaderboardRows || [];

        setStatus(`Found ${rows.length} whales. Validating data…`, 'scanning');
        setProgress(10);

        // Filter whales by account value with validation
        const whaleList = rows
            .filter(r => {
                const accountValue = parseFloat(r.accountValue);
                if (accountValue < minVal) return false;

                // Filter out suspicious entries
                if (accountValue > 1_000_000_000 && !r.displayName) {
                    console.warn(`Filtering suspicious whale: ${r.ethAddress} with $${(accountValue / 1_000_000_000).toFixed(1)}B and no display name`);
                    return false;
                }

                return true;
            })
            .sort((a, b) => parseFloat(b.accountValue) - parseFloat(a.accountValue));

        setWhaleList(whaleList);
        setProgress(15);

        const fxRates = getFxRates();
        const activeCurrency = getActiveCurrency();
        const fxReady = getFxReady();
        const fxStatus = fxReady ? `FX: 1 USD = ${(fxRates[activeCurrency] ?? 1).toFixed(2)} ${activeCurrency}` : '';
        setStatus(`Found ${whaleList.length} whales. Loading positions… ${fxStatus}`, 'scanning');

        // Start the concurrency-limited streaming loader with enhanced progress tracking
        setScanning(true);
        const maxConcurrency = getMaxConcurrency();

        // Enhanced progress tracking
        const totalWhales = whaleList.length;
        let processedCount = 0;
        let lastProgressUpdate = Date.now();

        const enhancedCallbacks = {
            ...callbacks,
            // Add progress tracking to existing callbacks
            updateStats: (showSymbols, allRows) => {
                processedCount++;
                const now = Date.now();

                // Update progress every 2 seconds during scanning
                if (now - lastProgressUpdate > 2000) {
                    const progress = 15 + (processedCount / totalWhales) * 75; // 15% initial + 75% for processing
                    setProgress(Math.min(progress, 95));
                    setStatus(`Loading ${processedCount}/${totalWhales} whales… (${Math.round(progress)}%)`, 'scanning');
                    lastProgressUpdate = now;
                }

                // Call original updateStats
                updateStats(showSymbols, allRows);
            }
        };

        await streamPositions(whaleList, minVal, maxConcurrency, enhancedCallbacks);

        // Show scan completion time
        const scanDuration = Date.now() - scanStartTime;
        const durationSeconds = Math.round(scanDuration / 1000);
        console.log(`Scan completed in ${durationSeconds}s`);

    } catch (e) {
        console.error('Scan error:', e);
        document.getElementById('positionsTableBody').innerHTML = `<tr><td colspan="14" class="empty-cell" style="color:var(--red)">
            <div class="empty-icon">⚠️</div>
            <div style="margin-bottom: 16px;">
                <strong>Scan Failed:</strong> ${e.message}<br>
                <small style="color:var(--muted)">Please check your internet connection and try again.</small>
            </div>
            <button class="btn" onclick="document.getElementById('scanBtn').click()">🔄 Try Reconnecting</button>
        </td></tr>`;
        setStatus('Scan failed', 'error');
        document.getElementById('scanBtn').disabled = false;
        document.getElementById('pauseBtn').style.display = 'none';
    }
}

export function stopScan(setStatus) {
    setScanning(false);
    setIsPaused(false);
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    setStatus('Stopping…', 'scanning');
}

export function togglePause(setStatus) {
    const isPaused = getIsPaused();
    setIsPaused(!isPaused);
    const btn = document.getElementById('pauseBtn');
    const scanBtn = document.getElementById('scanBtn');

    if (!isPaused) {
        // Resuming scan
        btn.textContent = '⏸ Pause';
        btn.style.background = '';
        setStatus('Resuming scan...', 'scanning');
        scanBtn.disabled = true;
    } else {
        // Pausing scan
        btn.textContent = '▶ Continue';
        btn.style.background = 'rgba(255, 193, 7, 0.2)';
        setStatus('Scan paused', 'paused');
        scanBtn.disabled = false;
    }
}

export function finishScan(setStatus, setProgress) {
    setProgress(100);
    const scanning = getScanning();
    const stoppedEarly = !scanning;

    // Ensure scanning state is reset
    setScanning(false);

    const label = stoppedEarly ? '⏹ Stopped' : '✓ Done';
    setStatus(label, 'done');
    document.getElementById('scanBtn').disabled = false;
    setTimeout(() => setProgress(0), 1500);
}
