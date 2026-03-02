// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Data Validation Fix
// ═══════════════════════════════════════════════════════════

import { LEADERBOARD_URL, INFO_URL, RETRY_DELAY_MS } from '../config.js';
import { 
    setAllRows, setLoadedCount, setScanning, setIsPaused, setWhaleList,
    getScanning, getIsPaused, getMaxConcurrency, getFxReady, getFxRates, getActiveCurrency, getCurrentPrices
} from '../state.js';
import { streamPositions } from './hyperliquid.js';

// Enhanced validation function
function validateWhaleData(whale, clearinghouseData) {
    const issues = [];
    
    // Check if whale has positions
    if (!clearinghouseData || !clearinghouseData.assetPositions) {
        issues.push('No position data available');
        return issues;
    }
    
    const nonZeroPositions = clearinghouseData.assetPositions.filter(p => 
        parseFloat(p.position.szi) !== 0
    );
    
    // Check for data consistency
    const lbAccountValue = parseFloat(whale.accountValue);
    const chAccountValue = clearinghouseData.marginSummary ? 
        parseFloat(clearinghouseData.marginSummary.accountValue) : 0;
    
    // If difference is more than 20%, flag it
    if (lbAccountValue > 0 && chAccountValue > 0) {
        const diff = Math.abs(lbAccountValue - chAccountValue);
        const pctDiff = (diff / lbAccountValue) * 100;
        
        if (pctDiff > 20) {
            issues.push(`Account value mismatch: Leaderboard $${lbAccountValue.toLocaleString()} vs Clearinghouse $${chAccountValue.toLocaleString()} (${pctDiff.toFixed(1)}% diff)`);
        }
    }
    
    // Check for suspicious leaderboard values
    if (lbAccountValue > 1_000_000_000 && nonZeroPositions.length === 0) {
        issues.push(`High value whale ($${(lbAccountValue/1_000_000_000).toFixed(1)}B) with no active positions`);
    }
    
    // Check for null/undefined critical fields
    if (!whale.displayName) {
        issues.push('Missing display name');
    }
    
    return issues;
}

// Enhanced fetch with retry and validation
export async function fetchWithRetryAndValidation(whale, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const resp = await fetch(INFO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearinghouseState', user: whale.ethAddress })
            });
            
            if (resp.status === 429) {
                const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Rate limited, retrying in ${wait}ms…`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            
            if (!resp.ok) {
                console.warn(`Failed to fetch data for ${whale.ethAddress}: HTTP ${resp.status}`);
                return null;
            }
            
            const state = await resp.json();
            
            // Validate data consistency
            const issues = validateWhaleData(whale, state);
            if (issues.length > 0) {
                console.warn(`Data validation issues for ${whale.ethAddress}:`, issues);
                
                // If major inconsistencies, prefer clearinghouse data
                const hasMajorIssues = issues.some(issue => 
                    issue.includes('Account value mismatch') || 
                    issue.includes('High value whale with no active positions')
                );
                
                if (hasMajorIssues && state.marginSummary) {
                    // Update whale account value with clearinghouse data
                    whale.accountValue = state.marginSummary.accountValue;
                    whale.validated = true;
                    whale.validationIssues = issues;
                }
            }
            
            return state;
            
        } catch (e) {
            if (attempt === retries - 1) {
                console.error(`Failed to fetch data for ${whale.ethAddress}:`, e);
                return null;
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

// Enhanced process state with validation
export function processStateWithValidation(whale, state, allRows) {
    if (!state) return;
    
    const currentPrices = getCurrentPrices();
    const positions = (state.assetPositions || []).filter(p => {
        const size = parseFloat(p.position.szi);
        if (size === 0) return false;
        
        // Additional validation for position data
        const pos = p.position;
        if (pos.entryPx === null || pos.entryPx === undefined) {
            console.warn(`Invalid entry price for ${whale.ethAddress} in ${pos.coin}`);
            return false;
        }
        
        return true;
    });
    
    positions.forEach(p => {
        const pos = p.position;
        const size = parseFloat(pos.szi);
        const markPrice = parseFloat(currentPrices[pos.coin] || pos.entryPx);
        const liqPx = parseFloat(pos.liquidationPx);
        const entryPx = parseFloat(pos.entryPx);
        
        let distPct = null;
        if (liqPx > 0 && markPrice > 0) {
            distPct = Math.abs((markPrice - liqPx) / markPrice) * 100;
        }
        
        allRows.push({
            address: whale.ethAddress,
            displayName: whale.displayName,
            accountValue: parseFloat(whale.accountValue),
            leaderRow: whale,
            validated: whale.validated || false,
            validationIssues: whale.validationIssues || [],
            coin: pos.coin,
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
    });
}

// Enhanced scan function with validation
export async function startScanWithValidation(callbacks) {
    const { setStatus, setProgress, fetchAllMids, updateStats, updateCoinFilter, renderTable, updateTableDataOnly, saveTableData, finishScan, setLastSaveTime, setRenderPending } = callbacks;
    const minVal = parseFloat(document.getElementById('minValue').value) || 2500000;
    
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').textContent = '⏸ Pause';
    setIsPaused(false);
    document.getElementById('positionsTableBody').innerHTML = `<tr><td colspan="13" class="empty-cell"><span class="spinner"></span> Fetching leaderboard…</td></tr>`;
    setAllRows([]);
    setLoadedCount(0);

    setStatus('Fetching and validating leaderboard…', 'scanning');
    setProgress(5);

    try {
        // Refresh prices before scanning
        await fetchAllMids();

        const lbResp = await fetch(LEADERBOARD_URL);
        if (!lbResp.ok) throw new Error(`Leaderboard HTTP ${lbResp.status}`);
        const lbData = await lbResp.json();
        const rows = lbData.leaderboardRows || [];

        // Enhanced filtering with validation
        let whaleList = rows
            .filter(r => {
                const accountValue = parseFloat(r.accountValue);
                if (accountValue < minVal) return false;
                
                // Filter out suspicious entries
                if (accountValue > 1_000_000_000 && !r.displayName) {
                    console.warn(`Filtering suspicious whale: ${r.ethAddress} with $${(accountValue/1_000_000_000).toFixed(1)}B and no display name`);
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
        setStatus(`Found ${whaleList.length} validated whales. Loading positions… ${fxStatus}`, 'scanning');

        // Start the enhanced streaming loader
        setScanning(true);
        const maxConcurrency = getMaxConcurrency();
        await streamPositions(whaleList, minVal, maxConcurrency, callbacks);

    } catch (e) {
        console.error(e);
        document.getElementById('positionsTableBody').innerHTML = `<tr><td colspan="13" class="empty-cell" style="color:var(--red)">Error: ${e.message}</td></tr>`;
        setStatus('Error', 'error');
        document.getElementById('scanBtn').disabled = false;
    }
}
