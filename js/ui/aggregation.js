// ═════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═════════════════════════════════════════════

import { getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency, getAggInterval, getAggVolumeUnit, getShowLiquidationSymbols, getLiquidationZoneColors, getLiquidationHighlightColor, getDecimalPlaces, getTooltipDelay, getLiquidationMinPriceFull, getLiquidationMaxPriceFull, setLiquidationMinPriceFull, setLiquidationMaxPriceFull, setAggVolumeUnit, setAggInterval, getLiquidationMinPriceSummary, getLiquidationMaxPriceSummary, getLiquidationVolumeUnitSummary, setLiquidationMinPriceSummary, setLiquidationMaxPriceSummary, setLiquidationVolumeUnitSummary, getAggColumnOrder, getAggColumnOrderResumida, getRowHeight, getAutoFitText } from '../state.js';
import { adjustFontSizeToFit } from '../utils/ui.js';
import { getCorrelatedEntry, getCorrelatedPrice } from '../utils/currency.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';
import { saveSettings } from '../storage/settings.js';
import { CURRENCY_META } from '../config.js';

// Performance tracking
let aggRenderCount = 0;
let lastAggRenderTime = 0;

// ═════════════════════════════════════════════
// State Management - Unified for both tables
// ═════════════════════════════════════════════

// Cache for dynamic import of handlers module (to avoid re-importing on every render)
let handlersModulePromise = null;
let handlersModule = null;

async function getHandlersModule() {
    if (handlersModule) return handlersModule;
    if (!handlersModulePromise) {
        handlersModulePromise = import('../events/handlers.js').then(module => {
            handlersModule = module;
            return module;
        });
    }
    return handlersModulePromise;
}

// Table state container - avoids duplicating variables
const tableState = {
    main: {
        lastRenderedBand: null,
        lastRenderedUnit: null,
        lastRenderedInterval: null,
        lastRenderedRowCount: 0,
        lastRenderedColorsStr: '',
        lastRenderedPricesHash: '',
        virtualScrollManager: null,
        currentPriceRangeIndex: -1,
        controlsInitialized: false
    },
    resumida: {
        lastRenderedBand: null,
        lastRenderedUnit: null,
        lastRenderedInterval: null,
        lastRenderedRowCount: 0,
        lastRenderedColorsStr: '',
        lastRenderedPricesHash: '',
        virtualScrollManager: null,
        currentPriceRangeIndex: -1,
        controlsInitialized: false
    }
};

/**
 * Computes a lightweight hash of the prices for coins with active positions.
 * Used to detect real price changes without forcing a full re-render every tick.
 */
function computeRelevantPricesHash(currentPrices, rows) {
    const activeCoins = new Set();
    for (const r of rows) {
        if (r.coin) activeCoins.add(r.coin);
    }
    activeCoins.add('BTC');

    let hash = '';
    for (const coin of [...activeCoins].sort()) {
        const price = currentPrices[coin];
        if (price != null) hash += `${coin}:${parseFloat(price).toFixed(2)}|`;
    }
    return hash;
}

/**
 * Formats a USD value in compact form (K, M, B)
 */
function fmtUsdCompact(val, showSymbol = true) {
    if (val === 0) return showSymbol ? '$0' : '0';
    const sym = showSymbol ? '$' : '';
    if (val >= 1000000000) return sym + (val / 1000000000).toFixed(2) + 'B';
    if (val >= 1000000) return sym + (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return sym + (val / 1000).toFixed(2) + 'K';
    return sym + val.toFixed(2);
}

/**
 * Converts hex color to RGB string
 */
function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '128,128,128';
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b} `;
    } catch {
        return '128,128,128';
    }
}

// ═════════════════════════════════════════════
// Base Aggregation Table Renderer
// ═════════════════════════════════════════════

/**
 * Renders an aggregation table (main or resumida)
 * @param {Object} options - Configuration options
 * @param {boolean} options.isResumida - Whether this is the "Resumida" table
 * @param {boolean} options.force - Force re-render regardless of cache
 */
function renderAggregationTableBase(options = {}) {
    const { isResumida = false, force = false } = options;
    const suffix = isResumida ? 'Resumida' : '';
    const state = isResumida ? tableState.resumida : tableState.main;

    // Element IDs
    const sectionId = isResumida ? 'liquidationSectionSummaryWrapper' : 'liquidationSectionFullWrapper';
    const tableBodyId = isResumida ? 'liquidationTableSummaryBody' : 'liquidationTableFullBody';
    const statsBarId = isResumida ? 'liquidationStatsBarSummary' : 'liquidationStatsBarFull';
    const minPriceInputId = isResumida ? 'liquidationMinPriceSummary' : 'liquidationMinPriceFull';
    const maxPriceInputId = isResumida ? 'liquidationMaxPriceSummary' : 'liquidationMaxPriceFull';

    const aggSection = document.getElementById(sectionId);
    const isCollapsed = aggSection?.classList.contains('collapsed');

    // Optimization: Skip rendering if collapsed, unless forced
    if (isCollapsed && !force) {
        return;
    }

    // Initialize controls only once
    if (!state.controlsInitialized) {
        initializeControls(isResumida, state, minPriceInputId, maxPriceInputId, suffix);
        state.controlsInitialized = true;
    }

    // Get data
    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const aggVolumeUnit = isResumida ? getLiquidationVolumeUnitSummary() : getAggVolumeUnit();
    const showAggSymbols = getShowLiquidationSymbols();
    const aggZoneColors = getLiquidationZoneColors();
    const aggHighlightColor = getLiquidationHighlightColor();
    const decimalPlaces = getDecimalPlaces();
    const bandSize = Math.max(1, getAggInterval());
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;

    // Build current band identity
    const currentBand = btcPrice > 0 ? Math.floor(btcPrice / bandSize) * bandSize : 0;
    const colorsStr = JSON.stringify(aggZoneColors || {});
    const pricesHash = computeRelevantPricesHash(currentPrices, rows);

    // Optimization: Skip rendering if data hasn't significantly changed
    if (!force &&
        state.lastRenderedBand === currentBand &&
        state.lastRenderedUnit === aggVolumeUnit &&
        state.lastRenderedInterval === bandSize &&
        state.lastRenderedRowCount === rows.length &&
        state.lastRenderedColorsStr === colorsStr &&
        state.lastRenderedPricesHash === pricesHash) {
        return;
    }

    if (!rows || rows.length === 0) {
        document.getElementById(tableBodyId).innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        document.getElementById(statsBarId).innerHTML = '';
        state.lastRenderedRowCount = 0;
        return;
    }

    // Update state tracking
    state.lastRenderedBand = currentBand;
    state.lastRenderedUnit = aggVolumeUnit;
    state.lastRenderedInterval = bandSize;
    state.lastRenderedRowCount = rows.length;
    state.lastRenderedColorsStr = colorsStr;
    state.lastRenderedPricesHash = pricesHash;

    // Build bands
    const { bands, totalLongNotional, totalShortNotional, bandsWithPosCount } = buildBands(
        rows, currentPrices, fxRates, activeEntryCurrency, bandSize,
        isResumida ? getLiquidationMinPriceSummary() : getLiquidationMinPriceFull(),
        isResumida ? getLiquidationMaxPriceSummary() : getLiquidationMaxPriceFull(),
        currentBand
    );

    // Convert bands to array and sort descending
    let bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);

    // Filtro para tabela resumida: mostrar apenas pontos destacados
    if (isResumida) {
        bandArray = bandArray.filter(b => {
            // Remove vácuos
            if (b.isEmpty) return false;

            // Condição atual: intensidade >= MÉDIA
            const hasIntensity = b.notionalLong + b.notionalShort >= 10_000_000;

            // Nova condição: volume de liquidação significantivo
            const hasLiquidation = b.liqVolLong >= 10_000_000 || b.liqVolShort >= 10_000_000;

            // Mostra se tiver intensidade OU liquidação significativa
            return hasIntensity || hasLiquidation;
        });
    }

    if (bandArray.length === 0) {
        const statsBar = document.getElementById(statsBarId);
        if (statsBar) statsBar.innerHTML = '';
        document.getElementById(tableBodyId).innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        return;
    }

    const maxBand = bandArray[0].faixaDe;
    const minBand = bandArray[bandArray.length - 1].faixaDe;
    const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;
    const vacuosCount = bandArray.filter(b => b.isEmpty).length;
    const posCount = rows.length;

    // Render stats bar
    renderStatsBar(statsBarId, totalLongNotional, totalShortNotional, posCount, bandsWithPosCount, vacuosCount, totalBands);

    // Reorder headers if there's a saved column order
    const savedHeaderOrder = isResumida ? getAggColumnOrderResumida() : getAggColumnOrder();
    if (savedHeaderOrder && savedHeaderOrder.length > 0) {
        const tableEl = document.getElementById(isResumida ? 'liquidationTableSummary' : 'liquidationTableFull');
        if (tableEl) {
            const theadRow = tableEl.querySelector('thead tr');
            if (theadRow) {
                const thMap = new Map();
                const allThs = Array.from(theadRow.querySelectorAll('th'));
                allThs.forEach(th => {
                    thMap.set(th.id, th);
                });

                // Reorder headers
                const fragment = document.createDocumentFragment();
                savedHeaderOrder.forEach(thId => {
                    const th = thMap.get(thId);
                    if (th) {
                        fragment.appendChild(th);
                    }
                });

                // Clear and re-append in new order
                theadRow.innerHTML = '';
                theadRow.appendChild(fragment);
            }
        }
    }

    // Render table rows
    const currentBtcPos = btcPrice > 0 ? btcPrice : 0;

    const rowHeight = getRowHeight();

    if (!state.virtualScrollManager) {
        state.virtualScrollManager = enableVirtualScroll(tableBodyId, { threshold: 40, rowHeight: rowHeight });
    } else {
        // Update row height if it changed
        state.virtualScrollManager.rowHeight = rowHeight;
    }

    const rowRenderer = createRowRenderer({
        aggZoneColors,
        aggHighlightColor,
        showAggSymbols,
        decimalPlaces,
        activeEntryCurrency,
        currentPrices,
        fxRates,
        btcPrice,
        aggVolumeUnit,
        currentBtcPos,
        isResumida,
        rowHeight,
        autoFit: getAutoFitText()
    });

    state.currentPriceRangeIndex = bandArray.findIndex(b => currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte);

    state.virtualScrollManager.renderRow = rowRenderer;

    // Hook for font size adjustments after virtual scroll renders
    const originalOnRender = state.virtualScrollManager.onRender;
    state.virtualScrollManager.onRender = () => {
        if (originalOnRender) originalOnRender();

        if (getAutoFitText()) {
            const tableBody = document.getElementById(tableBodyId);
            if (tableBody) {
                const cells = tableBody.querySelectorAll('td.auto-fit-active');
                cells.forEach(td => {
                    const content = td.querySelector('.cell-content');
                    if (content) {
                        adjustFontSizeToFit(content, td);
                    }
                });
            }
        }
    };

    state.virtualScrollManager.setData(bandArray);

    // Setup column resizing for aggregation tables after render (using cached import)
    getHandlersModule().then(({ setupColumnResizing, applyColumnWidths, setupVerticalResizing }) => {
        try {
            setupColumnResizing();
            setupVerticalResizing();
            applyColumnWidths();
        } catch (error) {
            console.error('Erro ao configurar redimensionamento de colunas:', error);
        }
    }).catch(error => {
        console.error('Erro ao importar módulo de handlers para redimensionamento de colunas:', error);
    });
}

/**
 * Initialize control event listeners
 */
function initializeControls(isResumida, state, minPriceInputId, maxPriceInputId, suffix) {
    const renderFn = (force) => renderAggregationTableBase({ isResumida, force });

    // Local Range Controls
    const minInput = document.getElementById(minPriceInputId);
    const maxInput = document.getElementById(maxPriceInputId);

    if (minInput && maxInput) {
        const updateRange = () => {
            const min = parseFloat(minInput.value) || 0;
            const max = parseFloat(maxInput.value) || 0;
            if (isResumida) {
                setLiquidationMinPriceSummary(min);
                setLiquidationMaxPriceSummary(max);
            } else {
                setLiquidationMinPriceFull(min);
                setLiquidationMaxPriceFull(max);
            }
            renderFn(true);
            saveSettings();
        };

        minInput.addEventListener('change', updateRange);
        maxInput.addEventListener('change', updateRange);

        const onEnter = (e) => { if (e.key === 'Enter') updateRange(); };
        minInput.addEventListener('keydown', onEnter);
        maxInput.addEventListener('keydown', onEnter);
    }

    // Volume Unit Toggle Buttons (for Resumida table)
    if (isResumida) {
        const volumeUnitButtons = document.querySelectorAll(`#liquidationSectionSummaryWrapper .js-agg-volume-unit-tab`);
        if (volumeUnitButtons) {
            volumeUnitButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const unit = btn.dataset.unit;
                    setLiquidationVolumeUnitSummary(unit);
                    volumeUnitButtons.forEach(b => b.classList.toggle('active', b === btn));
                    renderFn(true);
                    saveSettings();
                });
            });
        }
    }

    // Note: Main table controls (interval, volume unit) are handled in init.js
    // via .js-agg-interval and .js-agg-volume-unit-tab selectors
}

/**
 * Build bands data structure
 */

// Maximum reasonable price to prevent extreme band calculations
// Prices above this are likely data errors and would cause billions of bands
const MAX_REASONABLE_PRICE = 10000000; // $10 million - well above any realistic crypto price

function buildBands(rows, currentPrices, fxRates, activeEntryCurrency, bandSize, minPriceSetting, maxPriceSetting, currentBand) {
    const bands = {};
    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let bandsWithPosCount = 0;

    // Check if user has set valid price range settings
    const hasUserMinPrice = minPriceSetting > 0;
    const hasUserMaxPrice = maxPriceSetting > 0;
    const hasValidUserRange = hasUserMinPrice && hasUserMaxPrice && minPriceSetting < maxPriceSetting;

    // Determine the range based on user settings OR dynamic calculation
    let minEntryBand, maxEntryBand;

    if (hasValidUserRange) {
        // Use user-defined range
        minEntryBand = minPriceSetting;
        maxEntryBand = maxPriceSetting;
    } else {
        // Calculate dynamic range if no valid user settings exist
        minEntryBand = Infinity;
        maxEntryBand = -Infinity;

        for (const r of rows) {
            const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            // Validate entry price is within reasonable bounds to prevent extreme band calculations
            if (!isNaN(entryCcy) && entryCcy > 0 && entryCcy <= MAX_REASONABLE_PRICE) {
                const b = Math.floor(entryCcy / bandSize) * bandSize;
                if (b < minEntryBand) minEntryBand = b;
                if (b > maxEntryBand) maxEntryBand = b;
            }
        }

        // Also consider liquidation prices when no user range is set
        for (const r of rows) {
            if (r.liquidationPx > 0) {
                const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
                // Validate liquidation price is within reasonable bounds
                if (isFinite(liqPriceCorr) && liqPriceCorr > 0 && liqPriceCorr <= MAX_REASONABLE_PRICE) {
                    const liqB = Math.floor(liqPriceCorr / bandSize) * bandSize;
                    if (liqB < minEntryBand) minEntryBand = liqB;
                    if (liqB > maxEntryBand) maxEntryBand = liqB;
                }
            }
        }
    }

    // Apply floor alignment to band boundaries
    if (minEntryBand !== Infinity && minEntryBand !== -Infinity) {
        minEntryBand = Math.floor(minEntryBand / bandSize) * bandSize;
        maxEntryBand = Math.floor(maxEntryBand / bandSize) * bandSize;
    }

    if (minEntryBand === Infinity || minEntryBand === -Infinity) {
        return { bands: {}, totalLongNotional: 0, totalShortNotional: 0, bandsWithPosCount: 0 };
    }

    // Safety Truncate (Anti-Freeze)
    const MAX_ALLOWED_BANDS = 5000;
    const WARNING_BANDS_THRESHOLD = 500000; // Only warn for truly excessive ranges
    let totalBandsCount = Math.floor((maxEntryBand - minEntryBand) / bandSize) + 1;
    if (totalBandsCount > MAX_ALLOWED_BANDS) {
        // Only warn for truly excessive ranges, not normal large ranges that truncate fine
        if (totalBandsCount > WARNING_BANDS_THRESHOLD) {
            console.warn(`[AggTable] Excessive range detected (${totalBandsCount} bands). Truncating around current price.`);
        }
        const centerBand = currentBand > 0 ? currentBand : (maxEntryBand + minEntryBand) / 2;
        const halfRange = Math.floor(MAX_ALLOWED_BANDS / 2) * bandSize;
        minEntryBand = Math.max(minEntryBand, Math.floor((centerBand - halfRange) / bandSize) * bandSize);
        maxEntryBand = Math.min(maxEntryBand, Math.floor((centerBand + halfRange) / bandSize) * bandSize);
    }

    // Pre-populate bands map
    for (let b = minEntryBand; b <= maxEntryBand; b += bandSize) {
        bands[b] = {
            faixaDe: b,
            faixaAte: b + bandSize,
            qtdLong: 0,
            notionalLong: 0,
            qtdShort: 0,
            notionalShort: 0,
            sumLiqNotionalLong: 0,
            sumLiqNotionalShort: 0,
            liqVolLong: 0,
            liqVolShort: 0,
            ativosLong: new Set(),
            ativosShort: new Set(),
            positionsLong: [],
            positionsShort: [],
            isEmpty: true
        };
    }

    // Helper to check if price is within user-defined range
    const isInUserRange = (price) => {
        if (!hasValidUserRange) return true; // No filter applied if no valid user range
        return price >= minPriceSetting && price <= maxPriceSetting;
    };

    // Populate volumes - only include entries within user-defined range
    for (const r of rows) {
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        if (!isNaN(entryCcy) && entryCcy > 0 && isInUserRange(entryCcy)) {
            const bandDown = Math.floor(entryCcy / bandSize) * bandSize;
            const b = bands[bandDown];
            if (b) {
                b.isEmpty = false;
                const val = r.positionValue;
                if (r.side === 'long') {
                    b.qtdLong++;
                    b.notionalLong += val;
                    if (r.liquidationPx > 0) {
                        const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
                        b.sumLiqNotionalLong += (liqPriceCorr * val);
                    }
                    b.ativosLong.add(r.coin);
                    b.positionsLong.push(r);
                    totalLongNotional += val;
                } else {
                    b.qtdShort++;
                    b.notionalShort += val;
                    if (r.liquidationPx > 0) {
                        const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
                        b.sumLiqNotionalShort += (liqPriceCorr * val);
                    }
                    b.ativosShort.add(r.coin);
                    b.positionsShort.push(r);
                    totalShortNotional += val;
                }
            }
        }

        // Liquidation Volume logic - only include liquidations within user-defined range
        if (r.liquidationPx > 0) {
            const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
            if (isFinite(liqPriceCorr) && liqPriceCorr > 0 && isInUserRange(liqPriceCorr)) {
                const liqBand = Math.floor(liqPriceCorr / bandSize) * bandSize;
                const lb = bands[liqBand];
                if (lb) {
                    lb.isEmpty = false;  // Marca como não-vazio quando há liquidação
                    if (r.side === 'long') lb.liqVolLong += r.positionValue;
                    else lb.liqVolShort += r.positionValue;
                }
            }
        }
    }

    bandsWithPosCount = Object.values(bands).filter(b => !b.isEmpty).length;

    return { bands, totalLongNotional, totalShortNotional, bandsWithPosCount };
}

/**
 * Render the stats bar
 */
function renderStatsBar(statsBarId, totalLongNotional, totalShortNotional, posCount, bandsWithPosCount, vacuosCount, totalBands) {
    const ratioLS = totalShortNotional > 0 ? (totalLongNotional / totalShortNotional).toFixed(3) : '∞';
    const statsHtml = `
        <div class="agg-live-indicator" style="margin-right:8px">
            <div class="agg-live-badge"><div class="agg-live-dot"></div>LIVE</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Long Total <span style="color:#22c55e;font-weight:700;font-family:monospace">${fmtUsdCompact(totalLongNotional)}</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Short Total <span style="color:#ef4444;font-weight:700;font-family:monospace">${fmtUsdCompact(totalShortNotional)}</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Ratio L/S <span style="color:#60a5fa;font-weight:700">${ratioLS}x</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Posições <span style="font-weight:700">${posCount}</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">c/ Posições <span style="color:#22c55e;font-weight:700">${bandsWithPosCount}</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Vácuos <span style="color:#6b7280;font-weight:700">${vacuosCount}</span></div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Total faixas <span style="font-weight:700">${totalBands}</span></div>
    `;
    const statsBar = document.getElementById(statsBarId);
    if (statsBar) {
        statsBar.innerHTML = statsHtml;
        statsBar.classList.remove('flash-update');
        void statsBar.offsetWidth;
        statsBar.classList.add('flash-update');
    }
}

/**
 * Create a row renderer function with captured context
 */
function createRowRenderer(context) {
    const { aggZoneColors, aggHighlightColor, showAggSymbols, decimalPlaces, activeEntryCurrency, currentPrices, fxRates, btcPrice, aggVolumeUnit, currentBtcPos, isResumida, rowHeight, autoFit } = context;

    return (b, _index) => {
        const totalNotional = b.notionalLong + b.notionalShort;
        const isEmpty = b.isEmpty;
        const isCurrentPriceRange = currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte;

        // Calculate dominance
        let domType = 'VACUO';
        let domPct = 0;
        let domBg = '';
        let domColor = '#6b7280';
        let colorLong = '#4b5563';
        let colorShort = '#4b5563';

        if (totalNotional > 0) {
            if (b.notionalLong > b.notionalShort) {
                domType = 'COMPRA';
                const isForte = b.notionalLong >= 30_000_000;
                domColor = isForte ? aggZoneColors.buyStrong : aggZoneColors.buyNormal;
                domBg = isForte ? `rgba(${hexToRgb(aggZoneColors.buyStrong)}, 0.1)` : `rgba(${hexToRgb(aggZoneColors.buyNormal)}, 0.05)`;
                domPct = (b.notionalLong / totalNotional) * 100;
            } else if (b.notionalShort > b.notionalLong) {
                domType = 'VENDA';
                const isForte = b.notionalShort >= 30_000_000;
                domColor = isForte ? aggZoneColors.sellStrong : aggZoneColors.sellNormal;
                domBg = isForte ? `rgba(${hexToRgb(aggZoneColors.sellStrong)}, 0.1)` : `rgba(${hexToRgb(aggZoneColors.sellNormal)}, 0.05)`;
                domPct = (b.notionalShort / totalNotional) * 100;
            } else {
                domType = 'NEUTRO';
                domColor = '#9ca3af';
                domPct = 50;
            }
        }

        // Calculate intensity
        let intType = '—';
        let intColor = '#6b7280';
        const isWeakIntensity = totalNotional < 10_000_000;
        if (totalNotional >= 100_000_000) { intType = 'EXTREMA >100M'; intColor = '#f59e0b'; }
        else if (totalNotional >= 30_000_000) { intType = 'FORTE >30M'; intColor = '#22c55e'; }
        else if (totalNotional >= 10_000_000) { intType = 'MEDIA >10M'; intColor = '#60a5fa'; }
        else if (totalNotional > 3_000_000) { intType = 'FRACA >3M'; intColor = '#9ca3af'; }
        else if (totalNotional > 0) { intType = 'MUITO FRACA'; intColor = '#4b5563'; }

        // Calculate zone type
        let zoneType = isEmpty ? 'Zona Vazia' : '—';
        let zoneColor = '#4b5563';

        // Initialize styling variables BEFORE the if/else block to avoid TDZ error
        let totalNotionalColor = '#bfdbfe';
        let fwBold = '700';
        let fwSemi = '600';

        if (!isEmpty) {
            const isForteTotal = totalNotional >= 30_000_000;
            const isForteZone = (domPct === 100 || isForteTotal) && totalNotional >= 10_000_000;
            const baseStr = domType === 'COMPRA' ? 'Compra' : domType === 'VENDA' ? 'Venda' : 'Neutro';
            const isContested = domPct < 70;

            if (isContested) {
                zoneType = 'Contestada';
                zoneColor = '#ffffff';
                domColor = '#ffffff';
            } else {
                if (domPct === 50) {
                    zoneType = 'Indecisão';
                    zoneColor = '#9ca3af';
                } else {
                    if (isForteZone) {
                        zoneType = baseStr + ' Forte';
                        zoneColor = domType === 'COMPRA' ? aggZoneColors.buyStrong : aggZoneColors.sellStrong;
                    } else {
                        zoneType = baseStr + ' Normal';
                        zoneColor = domType === 'COMPRA' ? aggZoneColors.buyNormal : aggZoneColors.sellNormal;
                    }
                }

                domColor = domType === 'COMPRA' ? (isForteZone ? aggZoneColors.buyStrong : aggZoneColors.buyNormal) :
                    domType === 'VENDA' ? (isForteZone ? aggZoneColors.sellStrong : aggZoneColors.sellNormal) : '#6b7280';
            }

            if (isContested) {
                colorLong = b.notionalLong > 0 ? '#ffffff' : '#4b5563';
                colorShort = b.notionalShort > 0 ? '#ffffff' : '#4b5563';
            } else if (totalNotional >= 10_000_000) {
                if (domType === 'COMPRA') {
                    colorLong = b.notionalLong > 0 ? zoneColor : '#4b5563';
                    colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                } else if (domType === 'VENDA') {
                    colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                    colorShort = b.notionalShort > 0 ? zoneColor : '#4b5563';
                } else {
                    colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                    colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                }
            } else {
                colorLong = b.notionalLong > 0 ? aggZoneColors.buyNormal : '#4b5563';
                colorShort = b.notionalShort > 0 ? aggZoneColors.sellNormal : '#4b5563';
            }

            domBg = isForteZone ? `rgba(${hexToRgb(domColor)}, 0.1)` : `rgba(${hexToRgb(domColor)}, 0.05)`;

            // Initialize styling variables for the if branch
            totalNotionalColor = '#bfdbfe';
            fwBold = '700';
            fwSemi = '600';
        } else {
            colorLong = '#4b5563';
            colorShort = '#4b5563';
            domColor = '#6b7280';
            zoneColor = '#4b5563';
            intColor = '#4b5563';
            totalNotionalColor = '#6b7280';
            fwBold = '400';
            fwSemi = '400';
        }

        // Calculate styling - variables already declared above
        if (!isEmpty && (domPct === 100 || totalNotional >= 10_000_000)) {
            if (totalNotional >= 10_000_000 && domType !== 'NEUTRO') {
                totalNotionalColor = domColor;
                intColor = domColor;
                fwBold = '700';
                fwSemi = '700';
            }
        }

        if (!isEmpty && domPct < 70 && totalNotional >= 10_000_000) {
            totalNotionalColor = '#ffffff';
            intColor = '#ffffff';
            fwBold = '700';
            fwSemi = '700';
        }

        if (isWeakIntensity && !isEmpty) {
            colorLong = '#4b5563';
            colorShort = '#4b5563';
            domColor = '#6b7280';
            zoneColor = '#4b5563';
            intColor = '#6b7280';
            totalNotionalColor = '#6b7280';
            fwBold = '400';
            fwSemi = '400';
        }

        // Format functions
        const formatVal = (v) => {
            if (v === 0) return '—';
            if (aggVolumeUnit === 'BTC' && btcPrice > 0) {
                const btcVal = v / btcPrice;
                const sym = showAggSymbols ? '₿' : '';
                return sym + (btcVal >= 1000 ? (btcVal / 1000).toFixed(1) + 'K' : btcVal.toFixed(2));
            }
            return fmtUsdCompact(v, showAggSymbols);
        };
        const formatQty = (v) => v > 0 ? v : '—';

        const trStyle = isEmpty ? 'opacity:0.6;background:transparent' : '';

        let highlightStyle = '';
        if (isCurrentPriceRange) {
            const hexColor = aggHighlightColor || '#facc15';
            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);
            highlightStyle = `background:rgba(${r},${g},${b},0.2); border:1px solid ${hexColor}; box-shadow:inset 0 0 10px rgba(${r},${g},${b},0.2)`;
        }

        const trClass = isCurrentPriceRange ? 'active-price-range' : '';

        let rowBgCSS = '';
        if (highlightStyle) {
            // Use highlight style
        } else if (domBg) {
            rowBgCSS = `background:${domBg}`;
        }

        const expectedStyle = `${trStyle}; ${highlightStyle || ''}; ${rowBgCSS}`.replace(/;+/g, ';').replace(/^; |; $/g, '').trim();

        const starIndicator = totalNotional >= 100_000_000 ? '<span style="color:#f59e0b; margin-right:4px; font-size:14px">⭐</span>' : '';

        // Tooltip data
        let tooltipData = null;
        if (!isEmpty && (b.positionsLong.length > 0 || b.positionsShort.length > 0)) {
            const maxItems = 15;
            tooltipData = {
                longs: [],
                shorts: [],
                longsCount: 0,
                shortsCount: 0,
                longsRemaining: 0,
                shortsRemaining: 0
            };

            if (b.positionsLong.length > 0) {
                tooltipData.longsCount = new Set(b.positionsLong.map(p => p.address)).size;
                const sortedLongs = [...b.positionsLong].sort((x, y) => y.positionValue - x.positionValue);
                tooltipData.longs = sortedLongs.slice(0, maxItems).map(p => {
                    const entryCorr = getCorrelatedEntry(p, activeEntryCurrency, currentPrices, fxRates);
                    return {
                        name: p.displayName || p.address.substring(0, 6) + '...',
                        coin: p.coin,
                        displayEntry: entryCorr.toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }),
                        displayVol: aggVolumeUnit === 'BTC'
                            ? `₿${(btcPrice > 0 ? p.positionValue / btcPrice : 0).toFixed(2)}`
                            : fmtUsdCompact(p.positionValue)
                    };
                });
                tooltipData.longsRemaining = Math.max(0, sortedLongs.length - maxItems);
            }

            if (b.positionsShort.length > 0) {
                tooltipData.shortsCount = new Set(b.positionsShort.map(p => p.address)).size;
                const sortedShorts = [...b.positionsShort].sort((x, y) => y.positionValue - x.positionValue);
                tooltipData.shorts = sortedShorts.slice(0, maxItems).map(p => {
                    const entryCorr = getCorrelatedEntry(p, activeEntryCurrency, currentPrices, fxRates);
                    return {
                        name: p.displayName || p.address.substring(0, 6) + '...',
                        coin: p.coin,
                        displayEntry: entryCorr.toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }),
                        displayVol: aggVolumeUnit === 'BTC'
                            ? `₿${(btcPrice > 0 ? p.positionValue / btcPrice : 0).toFixed(2)}`
                            : fmtUsdCompact(p.positionValue)
                    };
                });
                tooltipData.shortsRemaining = Math.max(0, sortedShorts.length - maxItems);
            }
        }

        const tooltipAttr = tooltipData ? `data-tooltip='${JSON.stringify(tooltipData).replace(/'/g, '&#39;').replace(/"/g, '&quot;')}'` : '';
        const tooltipClass = tooltipData ? 'has-tooltip' : '';

        const isRangeMultiple1000 = b.faixaDe % 1000 === 0;
        const isRangeMultiple500 = b.faixaDe % 500 === 0;

        let rangeColor = isCurrentPriceRange ? '#fff' : '#d1d5db';
        let rangeWeight = '700';

        if (isRangeMultiple1000) {
            rangeColor = '#fbbf24';
            rangeWeight = '800';
        } else if (isRangeMultiple500) {
            rangeColor = '#fcd34d';
            rangeWeight = '700';
        }

        const avgLiqLong = b.notionalLong > 0 ? b.sumLiqNotionalLong / b.notionalLong : 0;
        const avgLiqShort = b.notionalShort > 0 ? b.sumLiqNotionalShort / b.notionalShort : 0;

        const formatLiq = (val, col) => {
            if (val === 0) return '<span class="muted" style="opacity:0.4">—</span>';
            const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
            const sym = showAggSymbols ? entMeta.symbol : '';
            return `<span style="color:${col}">${sym}${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>`;
        };

        const liqHtml = `<div style="display:flex; flex-direction:column; gap:2px; font-size:10px; line-height:1">
            ${b.notionalLong > 0 ? `<div>L: ${formatLiq(avgLiqLong, colorLong)}</div>` : ''}
            ${b.notionalShort > 0 ? `<div>S: ${formatLiq(avgLiqShort, colorShort)}</div>` : ''}
        </div>`;

        const fmtVal = (v) => {
            if (aggVolumeUnit === 'BTC' && btcPrice > 0) {
                const btcVal = v / btcPrice;
                const sym = showAggSymbols ? '₿' : '';
                return sym + (btcVal >= 1000 ? (btcVal / 1000).toFixed(1) + 'K' : btcVal.toFixed(2));
            }
            return fmtUsdCompact(v, showAggSymbols);
        };

        const liqRenderer = (val, type) => {
            if (val === 0) return '<span class="muted" style="opacity:0.4">—</span>';
            const color = type === 'long' ? aggZoneColors.buyNormal : aggZoneColors.sellNormal;
            const weight = val >= 30_000_000 ? 'font-weight:bold;' : '';
            return `<span style="color:${color};${weight}">${fmtVal(val)}</span>`;
        };

        const autoFitClass = autoFit ? 'auto-fit-active' : '';
        const wrap = (content, extraClass = '') => `<div class="cell-content ${extraClass}">${content}</div>`;

        // Create cell map with th-id as key for reordering support
        const cellMap = {
            'th-agg-faixaDe': `<td ${tooltipAttr} class="${tooltipClass} col-agg-range ${autoFitClass}" style="font-family:monospace; font-weight:${rangeWeight}; color:${rangeColor}; position: relative;">${wrap(`${starIndicator}${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; position:absolute; top:-6px; right:4px; line-height:1; background:#0a0e1a; padding:0 2px; border-radius:2px;">$${btcPrice.toLocaleString()}</div>` : ''}$${b.faixaDe.toLocaleString()}`)}</td>`,
            'th-agg-faixaAte': `<td ${tooltipAttr} class="${tooltipClass} col-agg-range ${autoFitClass}" style="font-family:monospace; color:${isRangeMultiple1000 || isRangeMultiple500 ? rangeColor : '#9ca3af'}; font-weight:${isRangeMultiple1000 ? '800' : (isRangeMultiple500 ? '700' : '400')}">${wrap(`$${b.faixaAte.toLocaleString()}`)}</td>`,
            'th-agg-liqPrice': `<td class="col-agg-liq ${autoFitClass}" style="font-family:monospace; vertical-align:middle">${wrap(liqHtml)}</td>`,
            'th-agg-liqVolLong': `<td class="mono col-agg-val ${autoFitClass}">${wrap(liqRenderer(b.liqVolLong, 'long'))}</td>`,
            'th-agg-liqVolShort': `<td class="mono col-agg-val ${autoFitClass}">${wrap(liqRenderer(b.liqVolShort, 'short'))}</td>`,
            'th-agg-qtdLong': `<td class="col-agg-qty ${autoFitClass}" style="color:${colorLong}; text-align:center">${wrap(formatQty(b.qtdLong))}</td>`,
            'th-agg-notionalLong': `<td ${tooltipAttr} class="${tooltipClass} col-agg-val ${autoFitClass}" style="color:${colorLong}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${wrap(formatVal(b.notionalLong))}</td>`,
            'th-agg-qtdShort': `<td class="col-agg-qty ${autoFitClass}" style="color:${colorShort}; text-align:center">${wrap(formatQty(b.qtdShort))}</td>`,
            'th-agg-notionalShort': `<td ${tooltipAttr} class="${tooltipClass} col-agg-val ${autoFitClass}" style="color:${colorShort}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${wrap(formatVal(b.notionalShort))}</td>`,
            'th-agg-totalNotional': `<td ${tooltipAttr} class="${tooltipClass} col-agg-val ${autoFitClass}" style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}">${wrap(formatVal(totalNotional))}</td>`,
            'th-agg-dominancia': `<td class="col-agg-dom ${autoFitClass}" style="color:${domColor}; font-weight:${fwBold}">${wrap(domType)}</td>`,
            'th-agg-pctDom': `<td class="col-agg-pct ${autoFitClass}" style="color:${domColor}; font-weight:${fwBold}">${wrap(domPct > 0 ? domPct.toFixed(1) + '%' : '—')}</td>`,
            'th-agg-intensidade': `<td class="col-agg-int ${autoFitClass}" style="color:${intColor}; font-size:11px; font-weight:${fwSemi}">${wrap(intType)}</td>`,
            'th-agg-tipoZona': `<td class="col-agg-zone ${autoFitClass}" style="color:${zoneColor}; font-weight:${fwSemi}">${wrap(zoneType)}</td>`,
            'th-agg-ativosLong': `<td class="col-agg-assets ${autoFitClass}" style="color:${colorLong}; font-size:11px; max-width:150px;" title="${Array.from(b.ativosLong).join(', ')}">${wrap(Array.from(b.ativosLong).join(', '))}</td>`,
            'th-agg-ativosShort': `<td class="col-agg-assets ${autoFitClass}" style="color:${colorShort}; font-size:11px; max-width:150px;" title="${Array.from(b.ativosShort).join(', ')}">${wrap(Array.from(b.ativosShort).join(', '))}</td>`
        };

        // Get saved column order (if any)
        const savedOrder = isResumida ? getAggColumnOrderResumida() : getAggColumnOrder();

        // Build content in the correct order
        let newContent;
        if (savedOrder && savedOrder.length > 0) {
            // Use saved order
            newContent = savedOrder.map(thId => cellMap[thId] || '').join('');
        } else {
            // Use default order
            newContent = Object.values(cellMap).join('');
        }

        return `<tr class="${trClass}" style="height: ${rowHeight}px; ${expectedStyle}">${newContent}</tr>`;
    };
}

// ═════════════════════════════════════════════
// Public API - Wrapper Functions
// ═════════════════════════════════════════════

/**
 * Renders the main aggregation table
 */
export function renderAggregationTable(force = false) {
    return renderAggregationTableBase({ isResumida: false, force });
}

/**
 * Renders the resumida aggregation table
 */
export function renderAggregationTableResumida(force = false) {
    return renderAggregationTableBase({ isResumida: true, force });
}

/**
 * Scrolls the main aggregation table to the current price range row
 */
export function scrollToCurrentPriceRange() {
    const state = tableState.main;
    if (state.virtualScrollManager && state.currentPriceRangeIndex !== -1) {
        state.virtualScrollManager.scrollToIndex(state.currentPriceRangeIndex);
    }
}

/**
 * Scrolls the resumida aggregation table to the current price range row
 */
export function scrollToCurrentPriceRangeResumida() {
    const state = tableState.resumida;
    if (state.virtualScrollManager && state.currentPriceRangeIndex !== -1) {
        state.virtualScrollManager.scrollToIndex(state.currentPriceRangeIndex);
    }
}

// ═════════════════════════════════════════════
// Custom Tooltip Event Handling
// ═════════════════════════════════════════════

let activeTooltipTimeout = null;
let pendingTooltipTarget = null;

document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.has-tooltip');

    if (activeTooltipTimeout) {
        clearTimeout(activeTooltipTimeout);
        activeTooltipTimeout = null;
    }

    if (!target) {
        if (pendingTooltipTarget) {
            pendingTooltipTarget.dataset.tooltipActive = 'false';
            pendingTooltipTarget = null;
        }
        const existing = document.getElementById('liquidationTooltip');
        if (existing) existing.remove();
        return;
    }

    if (target === pendingTooltipTarget) return;

    if (pendingTooltipTarget && pendingTooltipTarget !== target) {
        pendingTooltipTarget.dataset.tooltipActive = 'false';
        const existing = document.getElementById('liquidationTooltip');
        if (existing) existing.remove();
    }

    pendingTooltipTarget = target;

    const delay = getTooltipDelay();

    activeTooltipTimeout = setTimeout(() => {
        if (!pendingTooltipTarget) return;

        const tooltipDataStr = pendingTooltipTarget.dataset.tooltip;
        if (!tooltipDataStr) return;

        try {
            const tooltipData = JSON.parse(tooltipDataStr.replace(/"/g, '"').replace(/'/g, "'"));
            pendingTooltipTarget.dataset.tooltipActive = 'true';

            let html = '<div style="display:flex;gap:24px">';

            if (tooltipData.longs && tooltipData.longs.length > 0) {
                html += `<div>
                    <div style="color:#22c55e;font-weight:700;margin-bottom:4px">LONGS (${tooltipData.longsCount || tooltipData.longs.length} wallets)</div>
                    ${tooltipData.longs.map(p => `<div style="font-size:11px;color:#9ca3af"><span style="color:#fff">${p.name}</span> ${p.coin} @ ${p.displayEntry} <span style="color:#22c55e">${p.displayVol}</span></div>`).join('')}
                    ${tooltipData.longsRemaining > 0 ? `<div style="font-size:10px;color:#6b7280">+${tooltipData.longsRemaining} more</div>` : ''}
                </div>`;
            }

            if (tooltipData.shorts && tooltipData.shorts.length > 0) {
                html += `<div>
                    <div style="color:#ef4444;font-weight:700;margin-bottom:4px">SHORTS (${tooltipData.shortsCount || tooltipData.shorts.length} wallets)</div>
                    ${tooltipData.shorts.map(p => `<div style="font-size:11px;color:#9ca3af"><span style="color:#fff">${p.name}</span> ${p.coin} @ ${p.displayEntry} <span style="color:#ef4444">${p.displayVol}</span></div>`).join('')}
                    ${tooltipData.shortsRemaining > 0 ? `<div style="font-size:10px;color:#6b7280">+${tooltipData.shortsRemaining} more</div>` : ''}
                </div>`;
            }

            html += '</div>';

            let tooltip = document.getElementById('liquidationTooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'liquidationTooltip';
                tooltip.style.cssText = 'position:fixed;z-index:10000;background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:12px;max-width:500px;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-size:12px;pointer-events:none';
                document.body.appendChild(tooltip);
            }

            tooltip.innerHTML = html;

            const rect = pendingTooltipTarget.getBoundingClientRect();
            let left = rect.right + 10;
            let top = rect.top;

            if (left + tooltip.offsetWidth > window.innerWidth) {
                left = rect.left - tooltip.offsetWidth - 10;
            }
            if (top + tooltip.offsetHeight > window.innerHeight) {
                top = window.innerHeight - tooltip.offsetHeight - 10;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';

        } catch (err) {
            console.error('Error parsing tooltip data:', err, tooltipDataStr);
            pendingTooltipTarget.dataset.tooltipActive = 'false';
        }
    }, delay);
});
