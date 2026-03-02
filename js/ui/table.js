// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Table
// ═══════════════════════════════════════════════════════════

import {
    getAllRows, getDisplayedRows, getSelectedCoins, getActiveCurrency,
    getActiveEntryCurrency, getShowSymbols, getSortKey, getSortDir,
    getVisibleColumns, getColumnOrder, setDisplayedRows, getCurrentPrices, getFxRates, getChartHighLevSplit, getFontSize, getFontSizeKnown, getDecimalPlaces, getMinBtcVolume, getScanning,
    getWhaleMeta, getPriceUpdateVersion, getRowHeight, getColumnWidth, getColumnWidths
} from '../state.js';
import { convertToActiveCcy } from '../utils/currency.js';
import { fmt, fmtUSD, fmtAddr, fmtCcy } from '../utils/formatters.js';
import { getCorrelatedPrice, getCorrelatedEntry } from '../utils/currency.js';
import { CURRENCY_META } from '../config.js';
import { saveSettings } from '../storage/settings.js';
import { renderScatterPlot } from '../charts/scatter.js';
import { renderLiqScatterPlot } from '../charts/liquidation.js';
import { setupColumnDragAndDrop, applyColumnWidths, setupColumnResizing } from '../events/handlers.js';
import { updateRankingPanel } from './panels.js';
import { applyColumnWidth } from './columnWidth.js';
import { debounce, Cache, adaptiveDebounce } from '../utils/performance.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';
import { renderAggregationTable, renderAggregationTableResumida } from './aggregation.js';

// Cache for filtered data to avoid recomputing
const filterCache = new Cache(5000);

// Performance tracking
let lastRenderTime = 0;
let renderCount = 0;

// Debounced render function to reduce DOM updates - use adaptive debounce
const debouncedRenderTable = adaptiveDebounce(() => {
    _renderTableInternal();
}, {
    scanDelay: 100,
    idleDelay: 300,
    getState: () => getScanning() ? 'scanning' : 'idle'
});

// Virtual scroll instance
let virtualScrollManager = null;

// Initialize Web Worker
let dataWorker = null;
if (window.Worker) {
    // PERFORMANCE: Removed cache-busting (?v=${Date.now()})
    // Cache busting forces the browser to re-download the worker on every page load,
    // which is unnecessary for a production environment and slows down initial load.
    // The service worker handles proper cache invalidation for updates.
    dataWorker = new Worker('js/workers/dataWorker.js');
}

// Cache for headers to prevent loss during reordering
let cachedHeaders = null;
let cachedFilterHeaders = null;
let lastColumnOrder = null;
let lastVisibleColumns = null;

/**
 * Validates if cached headers are still attached to DOM
 * Elements get detached when innerHTML is cleared or parent is removed
 * @returns {boolean} true if all cached headers are still in DOM
 */
function areHeadersValid() {
    if (!cachedHeaders) {
        console.log('[areHeadersValid] cachedHeaders is null/undefined');
        return false;
    }

    // Check if at least one header is still attached to DOM
    const headers = Object.values(cachedHeaders);
    if (headers.length === 0) {
        console.log('[areHeadersValid] cachedHeaders is empty');
        return false;
    }

    // Sample check: verify first header is still in DOM
    // If it's detached, all are likely detached
    const sampleHeader = headers[0];
    const isConnected = sampleHeader.isConnected || document.body.contains(sampleHeader);
    
    console.log('[areHeadersValid] Sample header:', sampleHeader.id, 'isConnected:', isConnected);
    
    return isConnected;
}

/**
 * Checks if the actual DOM header order matches the expected columnOrder
 * This detects when headers have been reset to default HTML order
 * @param {string[]} columnOrder - Expected column order
 * @returns {boolean} true if DOM matches expected order
 */
function isDOMHeaderOrderCorrect(columnOrder) {
    const table = document.getElementById('positionsTable');
    if (!table) return true; // Can't check, assume correct
    
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return true;
    
    const domHeaders = Array.from(headerRow.querySelectorAll('th'));
    const domOrder = domHeaders.map(th => `col-${th.id.replace('th-', '')}`);
    
    // Filter to only compare columns that exist in both
    const expectedOrder = (columnOrder || []).filter(col => domOrder.includes(col));
    const actualOrder = domOrder.filter(col => (columnOrder || []).includes(col));
    
    const matches = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);
    
    if (!matches) {
        console.log('[isDOMHeaderOrderCorrect] ⚠️ DOM order does NOT match expected!');
        console.log('[isDOMHeaderOrderCorrect] Expected:', JSON.stringify(expectedOrder));
        console.log('[isDOMHeaderOrderCorrect] Actual DOM:', JSON.stringify(actualOrder));
    }
    
    return matches;
}

/**
 * Rebuilds the header cache from current DOM state
 * Call this when headers are known to be valid (after initial render)
 */
function rebuildHeaderCache() {
    console.log('[rebuildHeaderCache] ════════════════════════════════════════');
    console.log('[rebuildHeaderCache] CALLED at', new Date().toLocaleTimeString());
    console.trace('[rebuildHeaderCache] Stack trace:');
    
    const table = document.getElementById('positionsTable');
    if (!table) {
        console.warn('[rebuildHeaderCache] Table not found');
        return;
    }

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) {
        console.warn('[rebuildHeaderCache] Header row not found');
        return;
    }

    // Capture current DOM order BEFORE clearing cache
    const currentDOMOrder = Array.from(headerRow.querySelectorAll('th')).map(th => th.id);
    console.log('[rebuildHeaderCache] Current DOM header order:', JSON.stringify(currentDOMOrder));
    console.log('[rebuildHeaderCache] Current state columnOrder:', JSON.stringify(getColumnOrder()));

    // Clear existing cache
    cachedHeaders = {};
    cachedFilterHeaders = {};

    // Rebuild from current DOM
    const currentHeaders = Array.from(headerRow.querySelectorAll('th'));
    currentHeaders.forEach(th => {
        const colKey = th.id.replace('th-', '');
        if (colKey) {
            cachedHeaders[`col-${colKey}`] = th;
        }
    });

    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        const currentFilterHeaders = Array.from(filterRow.querySelectorAll('th'));
        currentFilterHeaders.forEach(th => {
            const classes = Array.from(th.classList);
            const colClass = classes.find(cls => cls.startsWith('col-'));
            if (colClass) {
                cachedFilterHeaders[colClass] = th;
            }
        });
    }

    console.log('[rebuildHeaderCache] Header cache rebuilt, found', Object.keys(cachedHeaders).length, 'headers');
    console.log('[rebuildHeaderCache] cachedHeaders keys:', JSON.stringify(Object.keys(cachedHeaders)));
    console.log('[rebuildHeaderCache] ════════════════════════════════════════');
}

/**
 * Checks if column configuration has actually changed
 * Used to avoid unnecessary header re-renders
 */
function hasColumnConfigChanged(columnOrder, visibleColumns) {
    const orderChanged = JSON.stringify(columnOrder) !== JSON.stringify(lastColumnOrder);
    const visibilityChanged = JSON.stringify(visibleColumns) !== JSON.stringify(lastVisibleColumns);
    
    console.log('[hasColumnConfigChanged] DEBUG:', {
        columnOrder: JSON.stringify(columnOrder),
        lastColumnOrder: JSON.stringify(lastColumnOrder),
        orderChanged,
        visibleColumns: JSON.stringify(visibleColumns),
        lastVisibleColumns: JSON.stringify(lastVisibleColumns),
        visibilityChanged,
        result: orderChanged || visibilityChanged
    });
    
    return orderChanged || visibilityChanged;
}

function reorderTableHeadersAndFilters(columnOrder) {
    console.log('[reorderTableHeadersAndFilters] ════════════════════════════════════════');
    console.log('[reorderTableHeadersAndFilters] CALLED at', new Date().toLocaleTimeString());
    console.log('[reorderTableHeadersAndFilters] columnOrder received:', JSON.stringify(columnOrder));
    console.trace('[reorderTableHeadersAndFilters] Stack trace:');

    const table = document.getElementById('positionsTable');
    if (!table) {
        console.warn('[reorderTableHeadersAndFilters] Table not found, returning');
        return;
    }

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) {
        console.warn('[reorderTableHeadersAndFilters] Header row not found, returning');
        return;
    }

    const visibleColumns = getVisibleColumns();
    console.log('[reorderTableHeadersAndFilters] visibleColumns:', JSON.stringify(visibleColumns));
    console.log('[reorderTableHeadersAndFilters] cachedHeaders before:', cachedHeaders ? Object.keys(cachedHeaders).length : 'null');
    if (cachedHeaders) {
        console.log('[reorderTableHeadersAndFilters] cachedHeaders keys:', JSON.stringify(Object.keys(cachedHeaders)));
    }

    // Check if we actually need to reorder (optimization)
    const headersValid = areHeadersValid();
    const configChanged = hasColumnConfigChanged(columnOrder, visibleColumns);
    const domOrderCorrect = isDOMHeaderOrderCorrect(columnOrder);
    
    console.log('[reorderTableHeadersAndFilters] areHeadersValid():', headersValid);
    console.log('[reorderTableHeadersAndFilters] hasColumnConfigChanged():', configChanged);
    console.log('[reorderTableHeadersAndFilters] isDOMHeaderOrderCorrect():', domOrderCorrect);

    if (!configChanged && headersValid && domOrderCorrect) {
        console.log('[reorderTableHeadersAndFilters] No changes needed, just reapplying widths');
        console.log('[reorderTableHeadersAndFilters] getColumnWidths() before reapply:', JSON.stringify(getColumnWidths()));
        // Just reapply widths, don't touch headers
        applyColumnWidths();
        console.log('[reorderTableHeadersAndFilters] getColumnWidths() after reapply:', JSON.stringify(getColumnWidths()));
        const columnWidth = getColumnWidth();
        applyColumnWidth(columnWidth);
        return;
    }
    
    if (!domOrderCorrect) {
        console.log('[reorderTableHeadersAndFilters] DOM order mismatch detected - forcing reorder');
    }

    // Update tracking
    console.log('[reorderTableHeadersAndFilters] Updating lastColumnOrder from:', JSON.stringify(lastColumnOrder), 'to:', JSON.stringify(columnOrder));
    lastColumnOrder = [...(columnOrder || [])];
    lastVisibleColumns = [...(visibleColumns || [])];

    // Check if cached headers are still valid (attached to DOM)
    if (!headersValid) {
        console.log('[reorderTableHeadersAndFilters] Cache INVALID - rebuilding from DOM');
        console.log('[reorderTableHeadersAndFilters] Current DOM header order BEFORE rebuild:');
        const table = document.getElementById('positionsTable');
        if (table) {
            const currentHeaders = Array.from(table.querySelectorAll('thead tr th'));
            console.log('[reorderTableHeadersAndFilters]   DOM headers:', JSON.stringify(currentHeaders.map(h => h.id)));
        }
        rebuildHeaderCache();
        console.log('[reorderTableHeadersAndFilters] cachedHeaders after rebuild:', cachedHeaders ? Object.keys(cachedHeaders).length : 'null');
        if (cachedHeaders) {
            console.log('[reorderTableHeadersAndFilters] cachedHeaders keys after rebuild:', JSON.stringify(Object.keys(cachedHeaders)));
        }
    } else {
        console.log('[reorderTableHeadersAndFilters] Cache is valid');
    }

    // Initialize cache from DOM if still not present
    if (!cachedHeaders || Object.keys(cachedHeaders).length === 0) {
        const currentHeaders = Array.from(headerRow.querySelectorAll('th'));
        if (currentHeaders.length > 0) {
            cachedHeaders = {};
            currentHeaders.forEach(th => {
                const colKey = th.id.replace('th-', '');
                if (colKey) {
                    cachedHeaders[`col-${colKey}`] = th;
                }
            });
        }
    }

    const filterRow = document.querySelector('.filter-row');
    if ((!cachedFilterHeaders || Object.keys(cachedFilterHeaders).length === 0) && filterRow) {
        const currentFilterHeaders = Array.from(filterRow.querySelectorAll('th'));
        if (currentFilterHeaders.length > 0) {
            cachedFilterHeaders = {};
            currentFilterHeaders.forEach(th => {
                const classes = Array.from(th.classList);
                const colClass = classes.find(cls => cls.startsWith('col-'));
                if (colClass) {
                    cachedFilterHeaders[colClass] = th;
                }
            });
        }
    }

    // If no headers cached and none in DOM, we can't do anything
    if (!cachedHeaders || Object.keys(cachedHeaders).length === 0) {
        console.warn('reorderTableHeadersAndFilters: No headers found.');
        return;
    }

    // If columnOrder is empty, use default order from cache keys
    if (!columnOrder || columnOrder.length === 0) {
        columnOrder = Object.keys(cachedHeaders);
    }

    // PERFORMANCE: Use DocumentFragment to batch DOM updates
    // Instead of clearing innerHTML (which is destructive and causes reflows),
    // we use DocumentFragment to batch append operations in memory,
    // then perform a single DOM update. This reduces reflows and improves performance.
    const headerFragment = document.createDocumentFragment();
    const filterFragment = filterRow ? document.createDocumentFragment() : null;

    // Reorder headers based on columnOrder
    columnOrder.forEach(colKey => {
        if (cachedHeaders[colKey]) {
            headerFragment.appendChild(cachedHeaders[colKey]);
        }
        if (filterFragment && cachedFilterHeaders && cachedFilterHeaders[colKey]) {
            filterFragment.appendChild(cachedFilterHeaders[colKey]);
        }
    });

    // IMPORTANT: Update cache references BEFORE clearing DOM
    // The appendChild operation moves elements, so we need to preserve the references
    const newCachedHeaders = {};
    const newCachedFilterHeaders = {};

    columnOrder.forEach(colKey => {
        if (cachedHeaders[colKey]) {
            newCachedHeaders[colKey] = cachedHeaders[colKey];
        }
        if (cachedFilterHeaders && cachedFilterHeaders[colKey]) {
            newCachedFilterHeaders[colKey] = cachedFilterHeaders[colKey];
        }
    });

    // Clear and append in single batch operation
    console.log('[reorderTableHeadersAndFilters] ⚠️ CLEARING headerRow.innerHTML');
    headerRow.innerHTML = '';
    console.log('[reorderTableHeadersAndFilters] Appending headerFragment');
    headerRow.appendChild(headerFragment);
    if (filterRow) {
        console.log('[reorderTableHeadersAndFilters] ⚠️ CLEARING filterRow.innerHTML');
        filterRow.innerHTML = '';
        filterRow.appendChild(filterFragment);
    }

    // IMPORTANT: Also reorder the data cells (td) in tbody to match headers
    // This ensures data stays aligned with headers after drag-and-drop
    console.log('[reorderTableHeadersAndFilters] Reordering data cells in tbody...');
    console.log('[reorderTableHeadersAndFilters] columnOrder for cell reorder:', JSON.stringify(columnOrder));
    const tbody = table.querySelector('tbody');
    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        console.log('[reorderTableHeadersAndFilters] Found', rows.length, 'rows in tbody');

        // FIX: Skip cell reordering if no data rows exist yet.
        // The rowRenderer in finalizeTableRender already generates cells in the correct
        // order based on columnOrder, so we don't need to reorder them after the fact.
        // This fixes the timing issue where reorderTableHeadersAndFilters was called
        // before finalizeTableRender created the rows.
        const hasDataRows = Array.from(rows).some(row =>
            !row.classList.contains('vs-top-spacer') &&
            !row.classList.contains('vs-bottom-spacer') &&
            row.querySelectorAll('td').length > 0
        );
        
        if (!hasDataRows) {
            console.log('[reorderTableHeadersAndFilters] No data rows found yet. Skipping cell reorder - rowRenderer will handle ordering during generation.');
        } else {
            // Only reorder cells if data rows exist
        rows.forEach((row, rowIndex) => {
            // SKIP virtual scroll spacer rows - they have only 1 cell with colspan
            if (row.classList.contains('vs-top-spacer') || row.classList.contains('vs-bottom-spacer')) {
                console.log('[reorderTableHeadersAndFilters] Skipping spacer row', rowIndex);
                return;
            }
            
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length === 0) {
                console.log('[reorderTableHeadersAndFilters] Row', rowIndex, 'has no cells, skipping');
                return; // Skip empty rows - rowRenderer hasn't populated them yet
            }
            console.log('[reorderTableHeadersAndFilters] Row', rowIndex, 'has', cells.length, 'cells');

            // Create a map of colKey to cell based on cell class
            const cellMap = new Map();
            cells.forEach((cell, cellIndex) => {
                // Find the col- class on the cell
                const colClass = Array.from(cell.classList).find(cls => cls.startsWith('col-'));
                if (colClass) {
                    cellMap.set(colClass, cell);
                }
            });

            // FIX: Use intersection of columnOrder and available cells
            // This handles cases where visibleColumns filters which cells are rendered
            const availableCellKeys = Array.from(cellMap.keys());
            const orderToUse = columnOrder.filter(colKey => cellMap.has(colKey));
            
            if (orderToUse.length === 0) {
                console.warn('[reorderTableHeadersAndFilters] No matching cells found for row', rowIndex, '- skipping');
                return;
            }
            
            console.log('[reorderTableHeadersAndFilters] Row', rowIndex, 'reordering', orderToUse.length, 'of', columnOrder.length, 'columns');

            // Create fragment with cells in new order
            const cellFragment = document.createDocumentFragment();
            let cellsReordered = 0;
            orderToUse.forEach(colKey => {
                const cell = cellMap.get(colKey);
                if (cell) {
                    cellFragment.appendChild(cell);
                    cellsReordered++;
                }
            });

            console.log('[reorderTableHeadersAndFilters] Reordered', cellsReordered, 'cells for row', rowIndex);

            // Clear row and append cells in new order (only for available cells)
            if (cellsReordered > 0) {
                // Keep any cells that aren't in columnOrder (append at end)
                const extraCells = cells.filter(cell => {
                    const colClass = Array.from(cell.classList).find(cls => cls.startsWith('col-'));
                    return colClass && !columnOrder.includes(colClass);
                });
                
                // Clear row and append reordered cells
                row.innerHTML = '';
                row.appendChild(cellFragment);
                
                // Append any extra cells at the end
                extraCells.forEach(cell => row.appendChild(cell));
            }
        });
        console.log('[reorderTableHeadersAndFilters] ✓ Finished reordering cells for all rows');
        } // Close hasDataRows else block
    } else {
        console.warn('[reorderTableHeadersAndFilters] tbody not found!');
    }

    // Update cache with the new ordered references
    cachedHeaders = newCachedHeaders;
    cachedFilterHeaders = newCachedFilterHeaders;
    console.log('[reorderTableHeadersAndFilters] Cache updated - headers:', Object.keys(cachedHeaders).length);

    // DEBUG: Log final header order in DOM
    const finalTable = document.getElementById('positionsTable');
    if (finalTable) {
        const finalHeaders = Array.from(finalTable.querySelectorAll('thead tr th'));
        console.log('[reorderTableHeadersAndFilters] Final DOM header order:', JSON.stringify(finalHeaders.map(h => h.id)));
    }

    // IMPORTANT: Always reapply column widths after reordering
    // Column widths are lost when innerHTML is cleared
    console.log('[reorderTableHeadersAndFilters] Reapplying column widths...');
    console.log('[reorderTableHeadersAndFilters] getColumnWidths() BEFORE applyColumnWidths:', JSON.stringify(getColumnWidths()));
    applyColumnWidths();
    console.log('[reorderTableHeadersAndFilters] getColumnWidths() AFTER applyColumnWidths:', JSON.stringify(getColumnWidths()));

    // Also apply the CSS column width variable
    const columnWidth = getColumnWidth();
    applyColumnWidth(columnWidth);

    console.log('[reorderTableHeadersAndFilters] ✓ DONE - Headers reordered, widths reapplied');
    console.log('[reorderTableHeadersAndFilters] ════════════════════════════════════════');
}

export function updateStats(showSymbols, allRows) {
    const whaleMeta = getWhaleMeta();

    const whalesWithPos = new Set();
    const whalesLong = new Set();
    const whalesShort = new Set();
    let totalUpnl = 0;
    let upnlLong = 0;
    let upnlShort = 0;
    let positionsLongCount = 0;
    let positionsShortCount = 0;

    for (let i = 0; i < allRows.length; i++) {
        const r = allRows[i];
        whalesWithPos.add(r.address);
        totalUpnl += r.unrealizedPnl;
        if (r.side === 'long') {
            whalesLong.add(r.address);
            upnlLong += r.unrealizedPnl;
            positionsLongCount++;
        } else if (r.side === 'short') {
            whalesShort.add(r.address);
            upnlShort += r.unrealizedPnl;
            positionsShortCount++;
        }
    }

    let totalCap = 0;
    let capLong = 0;
    let capShort = 0;
    let largest = 0;

    whalesWithPos.forEach(addr => {
        const meta = whaleMeta[addr];
        const val = meta?.accountValue || 0;
        totalCap += val;
        if (val > largest) largest = val;
        if (whalesLong.has(addr)) capLong += val;
        if (whalesShort.has(addr)) capShort += val;
    });

    // Update Overall Stats
    document.getElementById('sWhales').textContent = new Intl.NumberFormat('en-US').format(whalesWithPos.size);
    document.getElementById('sPositions').textContent = new Intl.NumberFormat('en-US').format(allRows.length);
    const sym = showSymbols ? '$' : '';
    document.getElementById('sCapital').textContent = sym + fmt(totalCap);
    const upnlEl = document.getElementById('sUpnl');
    upnlEl.textContent = fmtUSD(totalUpnl);
    upnlEl.className = 'stat-value ' + (totalUpnl >= 0 ? 'green' : 'red');
    document.getElementById('sLargest').textContent = sym + fmt(largest);

    // Update Long/Short Breakdowns
    document.getElementById('sWhalesLong').textContent = `L: ${whalesLong.size}`;
    document.getElementById('sWhalesShort').textContent = `S: ${whalesShort.size}`;
    document.getElementById('sPositionsLong').textContent = `L: ${positionsLongCount}`;
    document.getElementById('sPositionsShort').textContent = `S: ${positionsShortCount}`;
    document.getElementById('sCapitalLong').textContent = `L: ${sym}${fmt(capLong)}`;
    document.getElementById('sCapitalShort').textContent = `S: ${sym}${fmt(capShort)}`;
    document.getElementById('sUpnlLong').textContent = `L: ${fmtUSD(upnlLong)}`;
    document.getElementById('sUpnlShort').textContent = `S: ${fmtUSD(upnlShort)}`;
}

// Track last render caller for diagnostics
let lastRenderCaller = 'unknown';
let lastRenderTimestamp = 0;

// Internal render function - does the actual work
function _renderTableInternal() {
    const now = new Date().toLocaleTimeString();
    lastRenderTimestamp = Date.now();

    // ═══════════════════════════════════════════════════════════
    // PERSISTENCE DEBUG: Render Application
    // ═══════════════════════════════════════════════════════════
    console.log(`%c[PERSISTENCE:RENDER] ═══ RENDER STARTED ═══`, 'background: #9C27B0; color: white; font-weight: bold; font-size: 12px;');
    console.log(`%c[PERSISTENCE:RENDER] Time:`, 'color: #9C27B0;', now);
    console.log(`%c[PERSISTENCE:RENDER] Caller:`, 'color: #9C27B0;', lastRenderCaller);

    // Log current state values for persistence debugging
    const currentColumnWidths = getColumnWidths();
    const currentColumnOrder = getColumnOrder();
    console.log(`%c[PERSISTENCE:RENDER] columnWidths from state:`, 'color: #9C27B0; font-weight: bold;', JSON.stringify(currentColumnWidths, null, 2));
    console.log(`%c[PERSISTENCE:RENDER] columnOrder from state:`, 'color: #9C27B0; font-weight: bold;', JSON.stringify(currentColumnOrder, null, 2));

    function renderCharts() {
        renderScatterPlot();
        renderLiqScatterPlot();
    }
    const allRows = getAllRows();
    const whaleMeta = getWhaleMeta();
    console.log('[renderTable] allRows count:', allRows.length);
    const selectedCoins = getSelectedCoins();
    console.log('renderTable: selectedCoins:', selectedCoins);
    const activeCurrency = getActiveCurrency();
    const activeEntryCurrency = getActiveEntryCurrency();
    const showSymbols = getShowSymbols();
    const sortKey = getSortKey();
    const sortDir = getSortDir();
    const visibleColumns = getVisibleColumns();
    const columnOrder = getColumnOrder();
    console.log('[renderTable] columnOrder from state:', JSON.stringify(columnOrder));
    console.log('[renderTable] columnWidths from state:', JSON.stringify(getColumnWidths()));
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const decimalPlaces = getDecimalPlaces();

    // Reorder table headers first
    console.log(`%c[PERSISTENCE:RENDER] Calling reorderTableHeadersAndFilters()...`, 'color: #9C27B0;');
    reorderTableHeadersAndFilters(columnOrder);
    console.log(`%c[PERSISTENCE:RENDER] reorderTableHeadersAndFilters() completed`, 'color: #9C27B0;');

    const sideFilter = document.getElementById('sideFilter').value;
    const addressFilter = document.getElementById('addressFilter').value.trim().toLowerCase();
    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;
    const minLev = parseFloat(document.getElementById('minLev').value);
    const maxLev = parseFloat(document.getElementById('maxLev').value);
    const minSize = parseFloat(document.getElementById('minSize').value);
    const minFunding = parseFloat(document.getElementById('minFunding').value);
    const levTypeFilter = document.getElementById('levTypeFilter').value;

    const minSzi = parseFloat(document.getElementById('minSzi').value);
    const maxSzi = parseFloat(document.getElementById('maxSzi').value);
    const minValueCcy = parseFloat(document.getElementById('minValueCcy').value);
    const maxValueCcy = parseFloat(document.getElementById('maxValueCcy').value);
    const minEntryCcy = parseFloat(document.getElementById('minEntryCcy').value);
    const maxEntryCcy = parseFloat(document.getElementById('maxEntryCcy').value);
    const minUpnl = parseFloat(document.getElementById('minUpnl').value);
    const maxUpnl = parseFloat(document.getElementById('maxUpnl').value);

    // Create cache key for filter state
    // NOTE: allRows.length is included so the cache is invalidated when data loads after an
    // initial empty render (e.g., loadSettings triggering renderTable before loadTableData).
    const cacheKey = JSON.stringify({
        dataLen: allRows.length,
        selectedCoins,
        addressFilter,
        sideFilter,
        minLev,
        maxLev,
        minSize,
        minFunding,
        levTypeFilter,
        minSzi,
        maxSzi,
        minValueCcy,
        maxValueCcy,
        minEntryCcy,
        maxEntryCcy,
        activeCurrency,
        activeEntryCurrency,
        priceVersion: getPriceUpdateVersion(), // Invalidate cache when prices update
        sortKey: getSortKey(),
        sortDir: getSortDir()
    });

    // Check cache first
    let rows;
    if (filterCache.has(cacheKey)) {
        rows = filterCache.get(cacheKey);
        console.log('Using cached filtered rows:', rows.length);
        finalizeTableRender(rows, showSymbols);
    } else {
        if (dataWorker) {
            // Use Web Worker for heavy lifting
            dataWorker.onmessage = function (e) {
                const processedRows = e.data.rows;
                console.log(`[Table] Worker returned ${processedRows.length} rows.`);
                filterCache.set(cacheKey, processedRows);
                finalizeTableRender(processedRows, showSymbols);
            };

            const currencyState = {
                activeCurrency, activeEntryCurrency, currentPrices, fxRates
            };

            const filterState = {
                selectedCoins, addressFilter, sideFilter,
                minLev, maxLev, minSize, minFunding, levTypeFilter,
                minSzi, maxSzi, minValueCcy, maxValueCcy,
                minEntryCcy, maxEntryCcy, minUpnl, maxUpnl
            };

            const sortState = { sortKey, sortDir };

            // Send payload to worker
            dataWorker.postMessage({
                allRows, whaleMeta, filterState, sortState, currencyState
            });

            return; // Exit here, the rest is handled by finalizeTableRender
        } else {
            // Fallback for browsers without Worker support

            // FIX: Validate selectedCoins against actual data coins
            let effectiveSelectedCoins = selectedCoins;
            if (allRows?.length > 0 && selectedCoins?.length > 0) {
                const uniqueCoins = [...new Set(allRows.map(r => r.coin))];
                const matchingCoins = selectedCoins.filter(sc => uniqueCoins.includes(sc));
                if (matchingCoins.length === 0) {
                    console.warn(`[Table] selectedCoins has ${selectedCoins.length} coins but none match data. Ignoring coin filter.`);
                    effectiveSelectedCoins = [];
                } else if (matchingCoins.length !== selectedCoins.length) {
                    effectiveSelectedCoins = matchingCoins;
                }
            }

            // 0. Update rows with current prices
            const updatedRows = allRows.map(r => {
                const currentPrice = parseFloat(currentPrices[r.coin]);
                if (!isNaN(currentPrice) && currentPrice > 0) {
                    const newRow = { ...r };
                    newRow.markPrice = currentPrice;
                    newRow.positionValue = Math.abs(newRow.szi) * currentPrice;
                    if (newRow.leverageValue > 0) {
                        newRow.marginUsed = newRow.positionValue / newRow.leverageValue;
                    }
                    newRow.unrealizedPnl = (currentPrice - newRow.entryPx) * newRow.szi;
                    if (newRow.liquidationPx > 0) {
                        newRow.distPct = Math.abs((currentPrice - newRow.liquidationPx) / currentPrice) * 100;
                    } else {
                        newRow.distPct = null;
                    }
                    return newRow;
                }
                return r;
            });

            rows = updatedRows.filter(r => {
                if (effectiveSelectedCoins.length > 0 && !effectiveSelectedCoins.includes(r.coin)) return false;
                if (addressFilterRegex) {
                    const addr = r.address;
                    const meta = whaleMeta[addr];
                    const disp = meta?.displayName || '';
                    if (!addressFilterRegex.test(addr) && !addressFilterRegex.test(disp)) return false;
                }
                if (sideFilter && r.side !== sideFilter) return false;
                if (!isNaN(minLev) && r.leverageValue < minLev) return false;
                if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
                if (!isNaN(minSize) && r.positionValue < minSize) return false;
                if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
                if (levTypeFilter && r.leverageType !== levTypeFilter) return false;

                if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
                if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;

                const valCcy = convertToActiveCcy(r.positionValue, null, activeCurrency, fxRates);
                if (!isNaN(minValueCcy) && valCcy < minValueCcy) return false;
                if (!isNaN(maxValueCcy) && valCcy > maxValueCcy) return false;

                const entCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
                if (!isNaN(minEntryCcy) && entCcy < minEntryCcy) return false;
                if (!isNaN(maxEntryCcy) && entCcy > maxEntryCcy) return false;

                if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
                if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;

                return true;
            });

            // Sort
            const sortKey = getSortKey();
            const sortDir = getSortDir();
            rows.sort((a, b) => {
                let va, vb;
                if (sortKey === 'coin') {
                    return sortDir * a.coin.localeCompare(b.coin);
                } else if (sortKey === 'funding') {
                    va = a.funding; vb = b.funding;
                } else if (sortKey === 'valueCcy') {
                    va = convertToActiveCcy(a.positionValue, null, activeCurrency, fxRates);
                    vb = convertToActiveCcy(b.positionValue, null, activeCurrency, fxRates);
                } else if (sortKey === 'entryCcy') {
                    va = getCorrelatedEntry(a, activeEntryCurrency, currentPrices, fxRates);
                    vb = getCorrelatedEntry(b, activeEntryCurrency, currentPrices, fxRates);
                } else if (sortKey === 'liqPx') {
                    va = a.liquidationPx > 0 ? getCorrelatedPrice(a, a.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
                    vb = b.liquidationPx > 0 ? getCorrelatedPrice(b, b.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
                } else {
                    va = a[sortKey] ?? 0;
                    vb = b[sortKey] ?? 0;
                }
                return sortDir * (vb - va);
            });

            // Cache the result
            filterCache.set(cacheKey, rows);
            finalizeTableRender(rows, showSymbols);
        }
    }

    // Function to handle the actual DOM rendering after filtering
    function finalizeTableRender(rows, showSymbols) {
        const currentPrices = getCurrentPrices();
        const fxRates = getFxRates();
        const activeCurrency = getActiveCurrency();
        const activeEntryCurrency = getActiveEntryCurrency();
        const whaleMeta = getWhaleMeta();
        const decimalPlaces = getDecimalPlaces();
        const columnOrder = getColumnOrder();

        setDisplayedRows(rows);

        // PERFORMANCE: Render charts asynchronously when scanning to avoid blocking the main thread
        // During scanning operations, we defer chart rendering using requestIdleCallback (if available)
        // or setTimeout(..., 0) as a fallback. This keeps the UI responsive during heavy data processing.
        if (!getScanning()) {
            try {
                renderCharts(); // Update chart with filtered rows
            } catch (err) {
                console.error('renderCharts error (non-fatal):', err);
            }
        } else if (window.isScanning) {
            // Async chart rendering during scan
            const scheduleChartRender = window.requestIdleCallback ||
                ((cb) => setTimeout(cb, 0));
            scheduleChartRender(() => {
                try {
                    renderCharts();
                } catch (err) {
                    console.error('renderCharts async error (non-fatal):', err);
                }
            });
        }

        // Update statistics with filtered rows
        try {
            updateStats(showSymbols, rows);
        } catch (err) {
            console.error('updateStats error (non-fatal):', err);
        }

        const tbody = document.getElementById('positionsTableBody');

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" class="empty-cell"><div class="empty-icon">🔍</div><div>No positions match the current filters.</div></td></tr>`;
            return;
        }

        // Use virtual scrolling for large datasets
        const rowHeight = getRowHeight();
        if (!virtualScrollManager) {
            virtualScrollManager = enableVirtualScroll('positionsTableBody', { threshold: 100, rowHeight: rowHeight });
        } else {
             // Update row height in case it changed
             if (typeof virtualScrollManager.setRowHeight === 'function') {
                 virtualScrollManager.setRowHeight(rowHeight);
             }
        }

        // Row renderer function
        const rowRenderer = (r, i) => {
            const meta = whaleMeta[r.address] || {};
            const side = r.side;
            const pnlClass = r.unrealizedPnl >= 0 ? 'green' : 'red';
            const fundClass = r.funding >= 0 ? 'green' : 'red';

            // Calculate BTC volume (Value BTC = positionValue / btcPrice)
            const btcPrice = parseFloat(currentPrices['BTC'] || 0);
            const volBTC = btcPrice > 0 ? r.positionValue / btcPrice : 0;

            // Get min BTC volume setting from state
            const minBtcVolume = getMinBtcVolume();

            // Check if wallet should be highlighted (either displayName or high BTC volume)
            const isHighlighted = meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume);

            // Get font sizes
            const fontSize = getFontSize();
            const fontSizeKnown = getFontSizeKnown();
            const rowFontSize = isHighlighted ? fontSizeKnown : fontSize;
            const rowFontStyle = `font-size: ${rowFontSize}px`;

            // Leverage label
            const levType = r.leverageType === 'isolated' ? 'Isolated' : 'Cross';
            const levLabel = `${r.leverageValue}x ${levType}`;

            // Determine leverage badge color class
            const highLevSplit = getChartHighLevSplit();
            const isHighLev = Math.abs(r.leverageValue) >= highLevSplit;
            const levClass = `${side}-${isHighLev ? 'high' : 'low'}`;

            // Liquidation Price (Correlated)
            const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
            let liqPriceFormatted = '—';
            if (r.liquidationPx > 0) {
                const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
                const sym = showSymbols ? entMeta.symbol : '';
                liqPriceFormatted = sym + liqPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            // Distance to liq
            let distHtml = '<span class="muted">—</span>';
            if (r.distPct !== null) {
                const pct = r.distPct;
                const barClass = pct > 30 ? 'safe' : pct > 10 ? 'warn' : 'danger';
                const barW = Math.min(pct, 100).toFixed(0);
                const liqStr = r.liquidationPx > 0 ? (showSymbols ? '$' : '') + r.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
                distHtml = `
            <div class="liq-cell">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <span class="liq-pct ${barClass === 'safe' ? 'green' : barClass === 'warn' ? '' : 'red'}" style="${barClass === 'warn' ? 'color:var(--orange)' : ''}">${pct.toFixed(0)}%</span>
                    <span class="liq-price">${liqStr}</span>
                </div>
                <div class="liq-bar-wrap"><div class="liq-bar ${barClass}" style="width:${barW}%"></div></div>
            </div>`;
            }

            // Size display: show absolute value + coin
            const absSzi = Math.abs(r.szi);
            const sziStr = absSzi.toFixed(decimalPlaces);

            const ccyVal = convertToActiveCcy(r.positionValue, null, activeCurrency, fxRates);
            const ccyStr = fmtCcy(ccyVal, null, activeCurrency, showSymbols);

            const entVal = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            let entStr = '';
            const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
            const sym = showSymbols ? entMeta.symbol : '';
            entStr = sym + entVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const usdSym = showSymbols ? '$' : '';

            // Cell Renderers Map
            const cells = {
                'col-num': `<td class="muted col-num" style="font-size:11px">${i + 1}</td>`,
                'col-address': `<td class="col-address ${levClass}" style="${rowFontStyle}">
                <div class="addr-cell">
                    ${isHighlighted ? `<span class="addr-avatar-star ${levClass}">★</span>` : `<div class="addr-avatar">${(meta.displayName || r.address).slice(0, 2).toUpperCase()}</div>`}
                    <div>
                        <a class="addr-link" href="https://app.hyperliquid.xyz/explorer/address/${r.address}" target="_blank">
                            <div class="addr-text">${fmtAddr(r.address)}</div>
                        </a>
                        ${meta.displayName ? `<div class="addr-name">${meta.displayName}</div>` : ''}
                    </div>
                </div>
            </td>`,
                'col-coin': `<td class="col-coin" style="${rowFontStyle}">
                <span class="coin-badge ${levClass}">${r.coin} ${side === 'long' ? '▲' : '▼'}</span>
            </td>`,
                'col-szi': `<td class="mono col-szi ${levClass}" style="${rowFontStyle}">${sziStr}</td>`,
                'col-leverage': `<td class="col-leverage" style="${rowFontStyle}"><span class="lev-badge ${levClass}">${levLabel}</span></td>`,
                'col-positionValue': `<td class="mono col-positionValue ${levClass}" style="${rowFontStyle}">${usdSym}${fmt(r.positionValue)}</td>`,
                'col-valueCcy': `<td class="mono col-valueCcy ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${ccyStr}</td>`,
                'col-entryPx': `<td class="mono col-entryPx ${levClass}" style="${rowFontStyle}">${r.entryPx.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>`,
                'col-entryCcy': `<td class="mono col-entryCcy ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${entStr}</td>`,
                'col-unrealizedPnl': `<td class="mono col-unrealizedPnl ${pnlClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${fmtUSD(r.unrealizedPnl)}</td>`,
                'col-funding': `<td class="mono col-funding ${fundClass}" style="${rowFontStyle}">${fmtUSD(r.funding)}</td>`,
                'col-liqPx': `<td class="mono col-liqPx ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${liqPriceFormatted}</td>`,
                'col-distToLiq': `<td class="col-distToLiq ${levClass}" style="${rowFontStyle}">${distHtml}</td>`,
                'col-accountValue': `<td class="mono col-accountValue ${levClass}" style="${rowFontStyle}">${usdSym}${fmt(meta.accountValue || 0)}</td>`
            };

            // Filter cells based on visible columns
            const visibleColumns = getVisibleColumns();
            let filteredCells = {};

            if (visibleColumns.length === 0) {
                // All columns visible
                filteredCells = cells;
            } else {
                // Only specified columns visible
                visibleColumns.forEach(colKey => {
                    if (cells[colKey]) {
                        filteredCells[colKey] = cells[colKey];
                    }
                });
            }

            // Use columnOrder if available, otherwise use filteredCells keys (fallback for drag-and-drop sync)
            const orderToUse = (columnOrder && columnOrder.length > 0)
                ? columnOrder.filter(Key => filteredCells[Key] !== undefined)
                : Object.keys(filteredCells);
            
            return `<tr class="${meta.displayName ? 'row-known-address' : ''}" style="height: ${rowHeight}px">
            ${orderToUse.map(Key => filteredCells[Key]).join('')}
        </tr>`;
        };

        // Render using virtual scroll or traditional method
        // Override row renderer and update data
        virtualScrollManager.renderRow = rowRenderer;
        virtualScrollManager.setData(rows);

        // DEBUG: Update table rows count
        const debugRows = document.getElementById('debug-table-rows');
        if (debugRows) debugRows.textContent = rows.length;

        // Update ranking panel after rendering table (async)
        updateRankingPanel();

        // Render aggregation table based on filtered rows
        renderAggregationTable(true);
        renderAggregationTableResumida(true);

        // Apply column widths after table is rendered
        console.log(`%c[PERSISTENCE:RENDER] Calling applyColumnWidths()...`, 'color: #9C27B0;');
        applyColumnWidths();
        console.log(`%c[PERSISTENCE:RENDER] applyColumnWidths() completed`, 'color: #9C27B0;');

        // Also apply the default column width (CSS variable)
        const columnWidth = getColumnWidth();
        applyColumnWidth(columnWidth);

        // Setup drag and drop and resizing for column reordering
        // Always try to setup resizing since table might be recreated
        setTimeout(() => {
            setupColumnResizing();
        }, 100);
        
        // Always try to setup drag and drop - the function has its own guards
        // The setupColumnDragAndDrop function uses a module-level flag that resets on page reload
        console.log('%c[RENDER:TABLE] Scheduling setupColumnDragAndDrop...', 'background: #FF5722; color: white; font-weight: bold;');
        setTimeout(() => {
            console.log('%c[RENDER:TABLE] Calling setupColumnDragAndDrop from setTimeout', 'background: #FF5722; color: white; font-weight: bold;');
            setupColumnDragAndDrop();
        }, 100);

        console.log(`%c[PERSISTENCE:RENDER] ✓ RENDER COMPLETED`, 'background: #9C27B0; color: white; font-weight: bold;');
    }
}

// Public renderTable function - debounced version
export function renderTable() {
    // Capture caller information for diagnostics
    try {
        const stack = new Error().stack;
        const callerLine = stack.split('\n')[2] || 'unknown';
        lastRenderCaller = callerLine.trim().replace(/^at\s+/, '');
    } catch (e) {
        lastRenderCaller = 'unknown';
    }
    console.log('[renderTable] Public renderTable called from:', lastRenderCaller);
    debouncedRenderTable();
}

// Force immediate render (for cases where debouncing is not desired)
export function renderTableImmediate() {
    // Capture caller information for diagnostics
    try {
        const stack = new Error().stack;
        const callerLine = stack.split('\n')[2] || 'unknown';
        lastRenderCaller = callerLine.trim().replace(/^at\s+/, '') + ' (immediate)';
    } catch (e) {
        lastRenderCaller = 'unknown (immediate)';
    }
    console.log('[renderTableImmediate] Called from:', lastRenderCaller);
    _renderTableInternal();
}

/**
 * Rebuilds the header cache from current DOM state
 * Call this when headers need to be re-cached (e.g., after initial render)
 */
export function rebuildTableHeaderCache() {
    rebuildHeaderCache();
}

/**
 * Update table data only without re-rendering headers
 * Use this when only data has changed (not filters, sort, or columns)
 * This preserves column widths, order, and user customizations
 */
export function updateTableDataOnly() {
    console.log('[updateTableDataOnly] ════════════════════════════════════════');
    console.log('[updateTableDataOnly] CALLED at', new Date().toLocaleTimeString());
    console.trace('[updateTableDataOnly] Stack trace:');
    
    const allRows = getAllRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeCurrency = getActiveCurrency();
    const activeEntryCurrency = getActiveEntryCurrency();
    const showSymbols = getShowSymbols();
    const whaleMeta = getWhaleMeta();
    const decimalPlaces = getDecimalPlaces();
    const minBtcVolume = getMinBtcVolume();
    const columnOrder = getColumnOrder();
    
    console.log('[updateTableDataOnly] columnOrder from state:', JSON.stringify(columnOrder));
    console.log('[updateTableDataOnly] lastColumnOrder tracking:', JSON.stringify(lastColumnOrder));

    // Get current displayed rows from state
    const displayedRows = getDisplayedRows();
    if (!displayedRows || displayedRows.length === 0) {
        console.log('[updateTableDataOnly] No displayed rows, doing full render');
        _renderTableInternal();
        return;
    }

    // Validate headers are still attached to DOM
    const headersValid = areHeadersValid();
    const domOrderCorrect = isDOMHeaderOrderCorrect(columnOrder);
    console.log('[updateTableDataOnly] areHeadersValid():', headersValid);
    console.log('[updateTableDataOnly] isDOMHeaderOrderCorrect():', domOrderCorrect);
    
    if (!headersValid) {
        console.log('[updateTableDataOnly] Headers detached, doing full render');
        _renderTableInternal();
        return;
    }
    
    if (!domOrderCorrect) {
        console.log('[updateTableDataOnly] DOM order incorrect - headers were reset!');
    }

    const table = document.getElementById('positionsTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Update stats panel
    try {
        updateStats(showSymbols, displayedRows);
    } catch (err) {
        console.error('updateStats error (non-fatal):', err);
    }

    // Reorder headers if needed (but don't clear them)
    reorderTableHeadersAndFilters(columnOrder);

    // Get all visible rows in the DOM
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((rowEl) => {
        // Skip empty state row
        if (rowEl.querySelector('.empty-cell')) return;

        // Find the address cell to identify the row data
        const addressCell = rowEl.querySelector('.col-address .addr-text');
        if (!addressCell) return;

        const address = addressCell.textContent?.trim();
        if (!address) return;

        // Find the coin cell to get the coin
        const coinCell = rowEl.querySelector('.col-coin .coin-badge');
        if (!coinCell) return;

        const coinText = coinCell.textContent?.trim();
        const coin = coinText?.split(' ')[0];
        if (!coin) return;

        // Find the matching row data
        const rowData = displayedRows.find(r =>
            fmtAddr(r.address) === address && r.coin === coin
        );

        if (!rowData) return;

        const meta = whaleMeta[rowData.address] || {};
        const side = rowData.side;
        const pnlClass = rowData.unrealizedPnl >= 0 ? 'green' : 'red';
        const fundClass = rowData.funding >= 0 ? 'green' : 'red';

        // Calculate BTC volume for highlighting
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        const volBTC = btcPrice > 0 ? rowData.positionValue / btcPrice : 0;
        const isHighlighted = meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume);

        // Get currency meta for formatting
        const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
        const usdSym = showSymbols ? '$' : '';
        const entSym = showSymbols ? entMeta.symbol : '';

        // Update position value cell
        const posValueCell = rowEl.querySelector('.col-positionValue');
        if (posValueCell) {
            posValueCell.textContent = `${usdSym}${fmt(rowData.positionValue)}`;
        }

        // Update valueCcy cell
        const valueCcyCell = rowEl.querySelector('.col-valueCcy');
        if (valueCcyCell) {
            const ccyVal = convertToActiveCcy(rowData.positionValue, null, activeCurrency, fxRates);
            valueCcyCell.textContent = fmtCcy(ccyVal, null, activeCurrency, showSymbols);
            if (isHighlighted) {
                valueCcyCell.style.fontWeight = '600';
            }
        }

        // Update entryCcy cell
        const entryCcyCell = rowEl.querySelector('.col-entryCcy');
        if (entryCcyCell) {
            const entVal = getCorrelatedEntry(rowData, activeEntryCurrency, currentPrices, fxRates);
            entryCcyCell.textContent = entSym + entVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (isHighlighted) {
                entryCcyCell.style.fontWeight = '600';
            }
        }

        // Update unrealizedPnl cell
        const pnlCell = rowEl.querySelector('.col-unrealizedPnl');
        if (pnlCell) {
            pnlCell.textContent = fmtUSD(rowData.unrealizedPnl);
            pnlCell.className = `mono col-unrealizedPnl ${pnlClass}`;
            if (isHighlighted) {
                pnlCell.style.fontWeight = '600';
            }
        }

        // Update funding cell
        const fundingCell = rowEl.querySelector('.col-funding');
        if (fundingCell) {
            fundingCell.textContent = fmtUSD(rowData.funding);
            fundingCell.className = `mono col-funding ${fundClass}`;
        }

        // Update liqPx cell
        const liqPxCell = rowEl.querySelector('.col-liqPx');
        if (liqPxCell && rowData.liquidationPx > 0) {
            const liqPrice = getCorrelatedPrice(rowData, rowData.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
            liqPxCell.textContent = entSym + liqPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (isHighlighted) {
                liqPxCell.style.fontWeight = '600';
            }
        }

        // Update distToLiq cell
        const distCell = rowEl.querySelector('.col-distToLiq');
        if (distCell && rowData.distPct !== null) {
            const pct = rowData.distPct;
            const barClass = pct > 30 ? 'safe' : pct > 10 ? 'warn' : 'danger';
            const barW = Math.min(pct, 100).toFixed(0);
            const liqStr = rowData.liquidationPx > 0 ? (showSymbols ? '$' : '') + rowData.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';

            const pctSpan = distCell.querySelector('.liq-pct');
            if (pctSpan) {
                pctSpan.textContent = `${pct.toFixed(0)}%`;
                pctSpan.className = `liq-pct ${barClass === 'safe' ? 'green' : barClass === 'warn' ? '' : 'red'}`;
                if (barClass === 'warn') {
                    pctSpan.style.color = 'var(--orange)';
                } else {
                    pctSpan.style.color = '';
                }
            }

            const liqPriceSpan = distCell.querySelector('.liq-price');
            if (liqPriceSpan) {
                liqPriceSpan.textContent = liqStr;
            }

            const liqBar = distCell.querySelector('.liq-bar');
            if (liqBar) {
                liqBar.style.width = `${barW}%`;
                liqBar.className = `liq-bar ${barClass}`;
            }
        }

        // Update accountValue cell
        const accValueCell = rowEl.querySelector('.col-accountValue');
        if (accValueCell) {
            accValueCell.textContent = `${usdSym}${fmt(meta.accountValue || 0)}`;
        }
    });

    // Update aggregation tables
    try {
        renderAggregationTable(true);
        renderAggregationTableResumida(true);
    } catch (err) {
        console.error('Aggregation table update error (non-fatal):', err);
    }

    console.log('[updateTableDataOnly] Table data updated, headers preserved');
}

/**
 * Update only price-dependent data in the table without re-rendering headers
 * This is used by the price ticker to avoid overwriting column width/order settings
 */
export function updateTablePriceData() {
    const allRows = getAllRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeCurrency = getActiveCurrency();
    const activeEntryCurrency = getActiveEntryCurrency();
    const showSymbols = getShowSymbols();
    const whaleMeta = getWhaleMeta();
    const decimalPlaces = getDecimalPlaces();
    const minBtcVolume = getMinBtcVolume();

    // Get current displayed rows from state
    const displayedRows = getDisplayedRows();
    if (!displayedRows || displayedRows.length === 0) return;

    const table = document.getElementById('positionsTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Update stats panel
    try {
        updateStats(showSymbols, displayedRows);
    } catch (err) {
        console.error('updateStats error (non-fatal):', err);
    }

    // Get all visible rows in the DOM
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((rowEl) => {
        // Skip empty state row
        if (rowEl.querySelector('.empty-cell')) return;

        // Find the address cell to identify the row data
        const addressCell = rowEl.querySelector('.col-address .addr-text');
        if (!addressCell) return;

        const address = addressCell.textContent?.trim();
        if (!address) return;

        // Find the coin cell to get the coin
        const coinCell = rowEl.querySelector('.col-coin .coin-badge');
        if (!coinCell) return;

        const coinText = coinCell.textContent?.trim();
        const coin = coinText?.split(' ')[0];
        if (!coin) return;

        // Find the matching row data
        const rowData = displayedRows.find(r =>
            fmtAddr(r.address) === address && r.coin === coin
        );

        if (!rowData) return;

        const meta = whaleMeta[rowData.address] || {};
        const side = rowData.side;
        const pnlClass = rowData.unrealizedPnl >= 0 ? 'green' : 'red';
        const fundClass = rowData.funding >= 0 ? 'green' : 'red';

        // Calculate BTC volume for highlighting
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        const volBTC = btcPrice > 0 ? rowData.positionValue / btcPrice : 0;
        const isHighlighted = meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume);

        // Get currency meta for formatting
        const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
        const usdSym = showSymbols ? '$' : '';
        const entSym = showSymbols ? entMeta.symbol : '';

        // Update position value cell
        const posValueCell = rowEl.querySelector('.col-positionValue');
        if (posValueCell) {
            posValueCell.textContent = `${usdSym}${fmt(rowData.positionValue)}`;
        }

        // Update valueCcy cell
        const valueCcyCell = rowEl.querySelector('.col-valueCcy');
        if (valueCcyCell) {
            const ccyVal = convertToActiveCcy(rowData.positionValue, null, activeCurrency, fxRates);
            valueCcyCell.textContent = fmtCcy(ccyVal, null, activeCurrency, showSymbols);
            if (isHighlighted) {
                valueCcyCell.style.fontWeight = '600';
            }
        }

        // Update entryCcy cell
        const entryCcyCell = rowEl.querySelector('.col-entryCcy');
        if (entryCcyCell) {
            const entVal = getCorrelatedEntry(rowData, activeEntryCurrency, currentPrices, fxRates);
            entryCcyCell.textContent = entSym + entVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (isHighlighted) {
                entryCcyCell.style.fontWeight = '600';
            }
        }

        // Update unrealizedPnl cell
        const pnlCell = rowEl.querySelector('.col-unrealizedPnl');
        if (pnlCell) {
            pnlCell.textContent = fmtUSD(rowData.unrealizedPnl);
            pnlCell.className = `mono col-unrealizedPnl ${pnlClass}`;
            if (isHighlighted) {
                pnlCell.style.fontWeight = '600';
            }
        }

        // Update funding cell
        const fundingCell = rowEl.querySelector('.col-funding');
        if (fundingCell) {
            fundingCell.textContent = fmtUSD(rowData.funding);
            fundingCell.className = `mono col-funding ${fundClass}`;
        }

        // Update liqPx cell
        const liqPxCell = rowEl.querySelector('.col-liqPx');
        if (liqPxCell && rowData.liquidationPx > 0) {
            const liqPrice = getCorrelatedPrice(rowData, rowData.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
            liqPxCell.textContent = entSym + liqPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (isHighlighted) {
                liqPxCell.style.fontWeight = '600';
            }
        }

        // Update distToLiq cell
        const distCell = rowEl.querySelector('.col-distToLiq');
        if (distCell && rowData.distPct !== null) {
            const pct = rowData.distPct;
            const barClass = pct > 30 ? 'safe' : pct > 10 ? 'warn' : 'danger';
            const barW = Math.min(pct, 100).toFixed(0);
            const liqStr = rowData.liquidationPx > 0 ? (showSymbols ? '$' : '') + rowData.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';

            const pctSpan = distCell.querySelector('.liq-pct');
            if (pctSpan) {
                pctSpan.textContent = `${pct.toFixed(0)}%`;
                pctSpan.className = `liq-pct ${barClass === 'safe' ? 'green' : barClass === 'warn' ? '' : 'red'}`;
                if (barClass === 'warn') {
                    pctSpan.style.color = 'var(--orange)';
                } else {
                    pctSpan.style.color = '';
                }
            }

            const liqPriceSpan = distCell.querySelector('.liq-price');
            if (liqPriceSpan) {
                liqPriceSpan.textContent = liqStr;
            }

            const liqBar = distCell.querySelector('.liq-bar');
            if (liqBar) {
                liqBar.style.width = `${barW}%`;
                liqBar.className = `liq-bar ${barClass}`;
            }
        }

        // Update accountValue cell
        const accValueCell = rowEl.querySelector('.col-accountValue');
        if (accValueCell) {
            accValueCell.textContent = `${usdSym}${fmt(meta.accountValue || 0)}`;
        }
    });

    // Update aggregation tables
    try {
        renderAggregationTable(true);
        renderAggregationTableResumida(true);
    } catch (err) {
        console.error('Aggregation table update error (non-fatal):', err);
    }
}

/**
 * Diagnostic function to help debug column state issues
 * Call this from browser console: diagnoseColumnState()
 */
export async function diagnoseColumnState() {
    console.log('%c[DIAGNOSE] ════════════════════════════════════════════════════════════', 'background: #9C27B0; color: white; font-size: 14px; font-weight: bold;');

    // Import state getters dynamically to avoid circular dependency issues
    const state = await import('../state.js');

    const columnOrder = state.getColumnOrder ? state.getColumnOrder() : [];
    const columnWidths = state.getColumnWidths ? state.getColumnWidths() : {};
    const visibleColumns = state.getVisibleColumns ? state.getVisibleColumns() : [];

    console.log('%cColumn Order:', 'font-weight: bold; color: #2196F3;', columnOrder);
    console.log('%cVisible Columns:', 'font-weight: bold; color: #2196F3;', visibleColumns);
    console.log('%cColumn Widths:', 'font-weight: bold; color: #2196F3;', columnWidths);

    // Check cached headers
    console.log('%cCached Headers:', 'font-weight: bold; color: #FF9800;');
    if (cachedHeaders) {
        const headerKeys = Object.keys(cachedHeaders);
        console.log('  - Count:', headerKeys.length);
        headerKeys.forEach(key => {
            const th = cachedHeaders[key];
            const isConnected = th.isConnected || document.body.contains(th);
            const width = th.style.width;
            console.log(`  - ${key}: inDOM=${isConnected}, width=${width}`);
        });
    } else {
        console.log('  - cachedHeaders is NULL');
    }

    // Check cached filter headers
    console.log('%cCached Filter Headers:', 'font-weight: bold; color: #FF9800;');
    if (cachedFilterHeaders) {
        console.log('  - Count:', Object.keys(cachedFilterHeaders).length);
    } else {
        console.log('  - cachedFilterHeaders is NULL');
    }

    // Check DOM headers
    const table = document.getElementById('positionsTable');
    if (table) {
        const headerRow = table.querySelector('thead tr');
        if (headerRow) {
            const domHeaders = Array.from(headerRow.querySelectorAll('th'));
            console.log('%cDOM Headers:', 'font-weight: bold; color: #4CAF50;', domHeaders.length);
            domHeaders.forEach((th, i) => {
                const id = th.id || 'no-id';
                const width = th.style.width;
                const rect = th.getBoundingClientRect();
                console.log(`  [${i}] ${id}: width=${width}, actual=${rect.width.toFixed(1)}px`);
            });
        } else {
            console.log('%cDOM Headers: Header row not found!', 'color: red;');
        }
    } else {
        console.log('%cDOM Headers: Table not found!', 'color: red;');
    }

    // Last render info
    console.log('%cLast Render:', 'font-weight: bold; color: #E91E63;');
    console.log('  - Caller:', lastRenderCaller);
    console.log('  - Timestamp:', lastRenderTimestamp ? new Date(lastRenderTimestamp).toLocaleTimeString() : 'never');
    console.log('  - Seconds ago:', lastRenderTimestamp ? ((Date.now() - lastRenderTimestamp) / 1000).toFixed(1) : 'N/A');

    // Tracking variables
    console.log('%cTracking Variables:', 'font-weight: bold; color: #607D8B;');
    console.log('  - lastColumnOrder:', lastColumnOrder);
    console.log('  - lastVisibleColumns:', lastVisibleColumns);

    console.log('%c[DIAGNOSE] ════════════════════════════════════════════════════════════', 'background: #9C27B0; color: white; font-size: 14px; font-weight: bold;');

    return {
        columnOrder,
        visibleColumns,
        columnWidths,
        cachedHeaders: cachedHeaders ? Object.keys(cachedHeaders) : null,
        cachedFilterHeaders: cachedFilterHeaders ? Object.keys(cachedFilterHeaders) : null,
        lastRenderCaller,
        lastRenderTimestamp
    };
}

// Make it available globally for console debugging
if (typeof window !== 'undefined') {
    window.diagnoseColumnState = () => diagnoseColumnState().then(result => result);
}
