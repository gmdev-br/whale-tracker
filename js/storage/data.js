// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Storage Data
// ═══════════════════════════════════════════════════════════

import { getAllRows, getWhaleMeta, setWhaleMeta } from '../state.js';
import { showToast } from '../ui/toast.js';
import { hybridStorage } from '../storage/indexedDB.js';

const DATA_KEY = 'whaleWatcherData';

export async function saveTableData() {
    try {
        const allRows = getAllRows();
        const whaleMeta = getWhaleMeta();

        if (allRows.length === 0) {
            console.warn('Skipping save: no data to save');
            return;
        }

        // Optimized data structure: store meta separately to avoid duplication
        const payload = {
            v: 2, // Version 2: Optimized structure
            meta: whaleMeta,
            rows: allRows.map(r => ({
                a: r.address,
                c: r.coin,
                s: r.szi,
                sd: r.side,
                lt: r.leverageType,
                lv: r.leverageValue,
                pv: r.positionValue,
                ep: r.entryPx,
                mp: r.markPrice,
                up: r.unrealizedPnl,
                f: r.funding,
                lp: r.liquidationPx,
                dp: r.distPct,
                mu: r.marginUsed
            }))
        };

        const data = JSON.stringify(payload);
        await hybridStorage.save(DATA_KEY, payload);
        //console.log(`Saved ${allRows.length} rows (${(data.length / 1024).toFixed(1)} KB) using format v2`);
    } catch (e) {
        console.error('Failed to save table data:', e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('Warning: Storage quota exceeded. Some data may not persist.', 'error', 5000);
        }
    }
}

export async function loadTableData(setAllRows) {
    //console.log('[DIAG] loadTableData: starting...');
    try {
        const saved = await hybridStorage.load(DATA_KEY);
        //console.log('[DIAG] loadTableData: loaded data length =', saved ? JSON.stringify(saved).length : 'null');

        if (saved) {
            //console.log('[DIAG] loadTableData: parsed version =', saved.v, 'is array?', Array.isArray(saved));

            // Handle Version 2 (Optimized)
            if (saved.v === 2 && Array.isArray(saved.rows)) {
                const rowCount = saved.rows.length;
                const metaCount = Object.keys(saved.meta || {}).length;
                //console.log(`[DIAG] loadTableData: v2 format, ${rowCount} rows, ${metaCount} metas`);

                if (saved.meta) setWhaleMeta(saved.meta);

                const rows = saved.rows.map(r => ({
                    address: r.a,
                    coin: r.c,
                    szi: r.s,
                    side: r.sd,
                    leverageType: r.lt,
                    leverageValue: r.lv,
                    positionValue: r.pv,
                    entryPx: r.ep,
                    markPrice: r.mp,
                    unrealizedPnl: r.up,
                    funding: r.f,
                    liquidationPx: r.lp,
                    distPct: r.dp,
                    marginUsed: r.mu,
                    // Pull displayName and accountValue from meta if available
                    displayName: saved.meta?.[r.a]?.displayName || '',
                    accountValue: saved.meta?.[r.a]?.accountValue || 0,
                    windowPerformances: saved.meta?.[r.a]?.windowPerformances || {}
                }));

                //console.log('[DIAG] loadTableData: calling setAllRows with', rows.length, 'rows');
                setAllRows(rows);
                //console.log('[DIAG] loadTableData: setAllRows done');
                return;
            }

            // Fallback for Version 1 (Legacy)
            if (Array.isArray(saved) && saved.length > 0) {
                //console.log(`[DIAG] loadTableData: legacy v1 format, ${saved.length} rows`);
                setAllRows(saved);
                // Extract meta from legacy rows to populate whaleMeta
                const meta = {};
                saved.forEach(r => {
                    if (r.address && !meta[r.address]) {
                        meta[r.address] = {
                            displayName: r.displayName || '',
                            accountValue: r.accountValue || 0,
                            windowPerformances: r.windowPerformances || {}
                        };
                    }
                });
                setWhaleMeta(meta);
                return;
            } else {
                console.warn('[DIAG] loadTableData: data is empty or unknown format. saved=', JSON.stringify(saved).substring(0, 200));
            }
        } else {
            console.warn('[DIAG] loadTableData: NO DATA in localStorage (key:', DATA_KEY, ')');
        }
    } catch (e) {
        console.error('[DIAG] loadTableData: EXCEPTION:', e);
        localStorage.removeItem(DATA_KEY);
    }
}
