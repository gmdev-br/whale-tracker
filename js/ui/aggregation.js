// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═══════════════════════════════════════════════════════════

import { getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency, getAggInterval, getAggVolumeUnit, getShowAggSymbols, getAggZoneColors, getAggHighlightColor, getDecimalPlaces, getTooltipDelay, getAggMinPrice, getAggMaxPrice, setAggMinPrice, setAggMaxPrice, setAggVolumeUnit, getAggMinPriceResumida, getAggMaxPriceResumida, getAggVolumeUnitResumida, setAggMinPriceResumida, setAggMaxPriceResumida, setAggVolumeUnitResumida } from '../state.js';
import { getCorrelatedEntry, getCorrelatedPrice } from '../utils/currency.js';
import { fmtUSD, fmtCcy } from '../utils/formatters.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';
import { saveSettings } from '../storage/settings.js';
import { CURRENCY_META } from '../config.js';

let lastRenderedBand = null;
let lastRenderedUnit = null;
let lastRenderedInterval = null;
let lastRenderedRowCount = 0;
let lastRenderedColorsStr = '';
let lastRenderedPricesHash = '';
let aggVirtualScrollManager = null;
let currentPriceRangeIndex = -1; // Track index for the floating button
let aggControlsInitialized = false; // Flag to ensure event listeners are added only once

// Resumida table state
let lastRenderedBandResumida = null;
let lastRenderedUnitResumida = null;
let lastRenderedIntervalResumida = null;
let lastRenderedRowCountResumida = 0;
let lastRenderedColorsStrResumida = '';
let lastRenderedPricesHashResumida = '';
let aggVirtualScrollManagerResumida = null;
let currentPriceRangeIndexResumida = -1;
let aggControlsInitializedResumida = false;

/**
 * Computes a lightweight hash of the prices for coins with active positions.
 * Used to detect real price changes without forcing a full re-render every tick.
 */
function computeRelevantPricesHash(currentPrices, rows) {
    // Collect unique coins from active rows
    const activeCoins = new Set();
    for (const r of rows) {
        if (r.coin) activeCoins.add(r.coin);
    }
    // Always include BTC as reference
    activeCoins.add('BTC');

    // Build a compact string: coin:price|coin:price|...
    let hash = '';
    for (const coin of [...activeCoins].sort()) {
        const price = currentPrices[coin];
        if (price != null) hash += `${coin}:${parseFloat(price).toFixed(2)}|`;
    }
    return hash;
}

export function renderAggregationTable(force = false) {
    const aggSection = document.getElementById('aggSectionWrapper');
    const isCollapsed = aggSection?.classList.contains('collapsed');

    // Optimization: Skip rendering if collapsed, unless forced (e.g. initial load or search)
    if (isCollapsed && !force) {
        return;
    }

    // Initialize controls only once
    if (!aggControlsInitialized) {
        // 1. Aggregation Interval Tabs
        const intervalTabs = document.querySelectorAll('#aggIntervalTabs .tab-button');
        if (intervalTabs) {
            intervalTabs.forEach(t => t.addEventListener('click', () => {
                const interval = parseInt(t.dataset.interval);
                setAggInterval(interval);
                intervalTabs.forEach(btn => btn.classList.toggle('active', btn === t));
                renderAggregationTable(true);
                saveSettings();
            }));
        }

        // 2. Aggregation Volume Unit Tabs
        const unitTabs = document.querySelectorAll('#aggVolumeUnitTabs .tab-button');
        if (unitTabs) {
            unitTabs.forEach(t => t.addEventListener('click', () => {
                const unit = t.dataset.unit;
                setAggVolumeUnit(unit);
                unitTabs.forEach(btn => btn.classList.toggle('active', btn === t));
                renderAggregationTable(true);
                saveSettings();
            }));
        }

        // 3. Local Range Controls
        const minInput = document.getElementById('aggMinPrice');
        const maxInput = document.getElementById('aggMaxPrice');

        if (minInput && maxInput) {
            const updateRange = () => {
                const min = parseFloat(minInput.value) || 0;
                const max = parseFloat(maxInput.value) || 0;
                setAggMinPrice(min);
                setAggMaxPrice(max);
                renderAggregationTable(true);
                saveSettings();
            };

            minInput.addEventListener('change', updateRange);
            maxInput.addEventListener('change', updateRange);

            // Also update on Enter
            const onEnter = (e) => { if (e.key === 'Enter') updateRange(); };
            minInput.addEventListener('keydown', onEnter);
            maxInput.addEventListener('keydown', onEnter);
        }

        aggControlsInitialized = true;
    }

    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const aggVolumeUnit = getAggVolumeUnit();
    const showAggSymbols = getShowAggSymbols();
    const aggZoneColors = getAggZoneColors();
    const aggHighlightColor = getAggHighlightColor();
    const decimalPlaces = getDecimalPlaces();
    const bandSize = Math.max(1, getAggInterval()); // Safety: Ensure bandSize is at least 1
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;

    // Build current band identity
    const currentBand = btcPrice > 0 ? Math.floor(btcPrice / bandSize) * bandSize : 0;
    const colorsStr = JSON.stringify(aggZoneColors || {});
    const pricesHash = computeRelevantPricesHash(currentPrices, rows);

    // Optimization: Skip rendering if data hasn't significantly changed
    if (!force &&
        lastRenderedBand === currentBand &&
        lastRenderedUnit === aggVolumeUnit &&
        lastRenderedInterval === bandSize &&
        lastRenderedRowCount === rows.length &&
        lastRenderedColorsStr === colorsStr &&
        lastRenderedPricesHash === pricesHash) {
        return;
    }

    if (!rows || rows.length === 0) {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        document.getElementById('aggStatsBar').innerHTML = '';
        lastRenderedRowCount = 0;
        return;
    }

    // Update state tracking
    lastRenderedBand = currentBand;
    lastRenderedUnit = aggVolumeUnit;
    lastRenderedInterval = bandSize;
    lastRenderedRowCount = rows.length;
    lastRenderedColorsStr = colorsStr;
    lastRenderedPricesHash = pricesHash;

    const bands = {};

    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let posCount = rows.length;
    let bandsWithPosCount = 0;

    // 1. Determine the range
    let minEntryBand = getAggMinPrice();
    let maxEntryBand = getAggMaxPrice();
    let isAutoRange = false;

    if (!minEntryBand || !maxEntryBand || minEntryBand <= 0 || maxEntryBand <= 0 || minEntryBand >= maxEntryBand) {
        // Fallback to entry-based auto range if local range is invalid or not set
        minEntryBand = Infinity;
        maxEntryBand = -Infinity;
        isAutoRange = true;

        for (const r of rows) {
            const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            if (!isNaN(entryCcy) && entryCcy > 0) {
                const b = Math.floor(entryCcy / bandSize) * bandSize;
                if (b < minEntryBand) minEntryBand = b;
                if (b > maxEntryBand) maxEntryBand = b;
            }
        }
    } else {
        // Enforce band alignment for local settings
        minEntryBand = Math.floor(minEntryBand / bandSize) * bandSize;
        maxEntryBand = Math.floor(maxEntryBand / bandSize) * bandSize;
    }

    if (minEntryBand === Infinity || minEntryBand === -Infinity) {
        const statsBar = document.getElementById('aggStatsBar');
        if (statsBar) statsBar.innerHTML = '';
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        return;
    }

    // 2. Safety Truncate (Anti-Freeze)
    const MAX_ALLOWED_BANDS = 5000;
    let totalBandsCount = Math.floor((maxEntryBand - minEntryBand) / bandSize) + 1;
    if (totalBandsCount > MAX_ALLOWED_BANDS) {
        console.warn(`[AggTable] Excessive range detected (${totalBandsCount} bands). Truncating around current price.`);
        const centerBand = currentBand > 0 ? currentBand : (maxEntryBand + minEntryBand) / 2;
        const halfRange = Math.floor(MAX_ALLOWED_BANDS / 2) * bandSize;
        minEntryBand = Math.max(minEntryBand, Math.floor((centerBand - halfRange) / bandSize) * bandSize);
        maxEntryBand = Math.min(maxEntryBand, Math.floor((centerBand + halfRange) / bandSize) * bandSize);
    }

    // 3. Pre-populate bands map with Entry Price Range
    // This ensures teto/piso is correctly fixed to entries
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
            isEmpty: true // Default to true, will be cleared if entry is found
        };
    }

    // 4. Populate volumes
    for (const r of rows) {
        // Entry Price logic
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        if (!isNaN(entryCcy) && entryCcy > 0) {
            const bandDown = Math.floor(entryCcy / bandSize) * bandSize;
            const b = bands[bandDown];
            if (b) {
                b.isEmpty = false; // Has entry volume
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

        // Liquidation Volume logic (Independent of entry band, but restricted to table range)
        if (r.liquidationPx > 0) {
            const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
            if (isFinite(liqPriceCorr) && liqPriceCorr > 0) {
                const liqBand = Math.floor(liqPriceCorr / bandSize) * bandSize;
                const lb = bands[liqBand];
                if (lb) {
                    if (r.side === 'long') lb.liqVolLong += r.positionValue;
                    else lb.liqVolShort += r.positionValue;
                }
            }
        }
    }

    // Convert bands to array and sort descending
    const bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);
    bandsWithPosCount = bandArray.filter(b => !b.isEmpty).length;

    // Calculate max and min bands to fill "vacuos" (empty bands)
    if (bandArray.length > 0) {
        const maxBand = bandArray[0].faixaDe;
        const minBand = bandArray[bandArray.length - 1].faixaDe;
        const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;

        // Create full array including vacuos
        const fullBandArray = bandArray; // Already pre-populated and sorted
        let vacuosCount = bandArray.filter(b => b.isEmpty).length;

        // Top Stats
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
        const statsBar = document.getElementById('aggStatsBar');
        if (statsBar) {
            statsBar.innerHTML = statsHtml;
            // Visual trigger for update
            statsBar.classList.remove('flash-update');
            void statsBar.offsetWidth; // Trigger reflow
            statsBar.classList.add('flash-update');
        }


        // Render rows
        // Render rows using Virtual Scroll
        const currentBtcPos = btcPrice > 0 ? btcPrice : 0;

        if (!aggVirtualScrollManager) {
            // Threshold is low because aggregation rows have heavy styling
            // Row height is ~36px instead of 52px
            aggVirtualScrollManager = enableVirtualScroll('aggTableBody', { threshold: 40, rowHeight: 36 });
        }

        const rowRenderer = (b, index) => {
            const totalNotional = b.notionalLong + b.notionalShort;
            const isEmpty = b.isEmpty;

            const isCurrentPriceRange = currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte;

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

            let intType = '—';
            let intColor = '#6b7280';
            const isWeakIntensity = totalNotional < 10_000_000; // FRACA ou MUITO FRACA
            if (totalNotional >= 100_000_000) { intType = 'EXTREMA >100M'; intColor = '#f59e0b'; } // Orange
            else if (totalNotional >= 30_000_000) { intType = 'FORTE >30M'; intColor = '#22c55e'; }   // Green
            else if (totalNotional >= 10_000_000) { intType = 'MEDIA >10M'; intColor = '#60a5fa'; }  // Blue
            else if (totalNotional > 3_000_000) { intType = 'FRACA >3M'; intColor = '#9ca3af'; }  // Gray/light blue
            else if (totalNotional > 0) { intType = 'MUITO FRACA'; intColor = '#4b5563'; }

            let zoneType = isEmpty ? 'Zona Vazia' : '—';
            let zoneColor = '#4b5563';
            if (!isEmpty) {
                const isForteLong = b.notionalLong >= 30_000_000;
                const isForteShort = b.notionalShort >= 30_000_000;
                const isForteTotal = totalNotional >= 30_000_000;
                // Strong Buy/Sell only if intensity is NOT weak (Total Notional >= 10M)
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

                    // Update DOM color to match row-level Forte status
                    domColor = domType === 'COMPRA' ? (isForteZone ? aggZoneColors.buyStrong : aggZoneColors.buyNormal) :
                        domType === 'VENDA' ? (isForteZone ? aggZoneColors.sellStrong : aggZoneColors.sellNormal) : '#6b7280';
                }

                // Apply colors consistently to all directional cells based on row-level Forte status OR High Intensity
                // User Requirement: "linas com destaues por tipo de zona forte ou intensidade forte devem seguir somente um padrao de coloracao"
                // User Requirement Update: "compra e venda normais devem seguir apenas 1 cor"
                // User Requirement Update: "seo % de dominacia for menor que 70% a area é tida como contestada e todos os textos devem ser brancos"

                if (isContested) {
                    colorLong = b.notionalLong > 0 ? '#ffffff' : '#4b5563';
                    colorShort = b.notionalShort > 0 ? '#ffffff' : '#4b5563';
                } else if (totalNotional >= 10_000_000) {
                    if (domType === 'COMPRA') {
                        // Dominant Buy: Longs get Zone Color (Strong or Normal), Shorts get Gray (Neutral)
                        colorLong = b.notionalLong > 0 ? zoneColor : '#4b5563';
                        colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                    } else if (domType === 'VENDA') {
                        // Dominant Sell: Shorts get Zone Color (Strong or Normal), Longs get Gray (Neutral)
                        colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                        colorShort = b.notionalShort > 0 ? zoneColor : '#4b5563';
                    } else {
                        // Neutral High Intensity: Avoid mixing. Use Gray/Neutral.
                        colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                        colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                    }
                } else {
                    colorLong = b.notionalLong > 0 ? aggZoneColors.buyNormal : '#4b5563';
                    colorShort = b.notionalShort > 0 ? aggZoneColors.sellNormal : '#4b5563';
                }

                domBg = isForteZone ? `rgba(${hexToRgb(domColor)}, 0.1)` : `rgba(${hexToRgb(domColor)}, 0.05)`;
            } else {
                colorLong = '#4b5563';
                colorShort = '#4b5563';
                domBg = '';
                domColor = '#6b7280';
            }

            // Remove all highlights for weak intensity (FRACA or MUITO FRACA)
            let totalNotionalColor = '#bfdbfe';
            let fwBold = '700';
            let fwSemi = '600';

            // Apply Strong Highlight to all columns if it is a strong zone
            // or if it has Medium/Strong/Extreme Intensity (>= 10M)
            if (!isEmpty && (domPct === 100 || totalNotional >= 10_000_000)) {
                // We use isForteZone just for reference if needed, but apply style based on intensity
                // The condition totalNotional >= 10M covers Medium (10-30), Strong (30-100), Extreme (100+)
                if (totalNotional >= 10_000_000 && domType !== 'NEUTRO') {
                    // Use the dominant color for all key metrics
                    totalNotionalColor = domColor;
                    intColor = domColor;
                    // Ensure bold weight
                    fwBold = '700';
                    fwSemi = '700';
                }
            }

            // Force white text for Contested/Neutral areas if significant volume
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
                intColor = '#4b5563';
                totalNotionalColor = '#6b7280';
                domBg = '';
                fwBold = '400';
                fwSemi = '400';
            }

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

            const longCol = colorLong;
            const shortCol = colorShort;

            const trStyle = isEmpty ? 'opacity:0.6;background:transparent' : '';
            // valBg is now integrated into row background if needed, but we prioritize domBg for the whole row
            // const valBg = (totalNotional >= 10_000_000 && !isWeakIntensity) ? 'background:rgba(59,130,246,0.1)' : '';

            let highlightStyle = '';
            if (isCurrentPriceRange) {
                // Convert hex to rgba with 0.2 opacity for background
                const hexColor = aggHighlightColor || '#facc15';
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);
                highlightStyle = `background:rgba(${r},${g},${b},0.2); border:1px solid ${hexColor}; box-shadow:inset 0 0 10px rgba(${r},${g},${b},0.2)`;
            }

            const trClass = isCurrentPriceRange ? 'active-price-range' : '';

            // Priority: Highlight Color (Active Range) > Zone Color (Dominance)
            let rowBgCSS = '';
            if (highlightStyle) {
                // If we have an active price range highlight, we use that as the primary style
                // The CSS class .active-price-range can also handle some of this
            } else if (domBg) {
                rowBgCSS = `background:${domBg}`;
            }

            const expectedStyle = `${trStyle}; ${highlightStyle || ''}; ${rowBgCSS}`.replace(/;+/g, ';').replace(/^; |; $/g, '').trim();

            // Star indicator for Extreme Intensity
            const starIndicator = totalNotional >= 100_000_000 ? '<span style="color:#f59e0b; margin-right:4px; font-size:14px">⭐</span>' : '';

            // Tooltip Data Preparation (JSON)
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

            const tooltipAttr = tooltipData ? `data-tooltip='${JSON.stringify(tooltipData).replace(/'/g, "&#39;").replace(/"/g, "&quot;")}'` : '';
            const tooltipClass = tooltipData ? 'has-tooltip' : '';

            // Check for multiple of 1000 and 500 in price ranges
            const isRangeMultiple1000 = b.faixaDe % 1000 === 0;
            const isRangeMultiple500 = b.faixaDe % 500 === 0;

            let rangeColor = isCurrentPriceRange ? '#fff' : '#d1d5db';
            let rangeWeight = '700';

            if (isRangeMultiple1000) {
                rangeColor = '#fbbf24'; // Gold
                rangeWeight = '800';
            } else if (isRangeMultiple500) {
                rangeColor = '#fcd34d'; // Amber-300
                rangeWeight = '700';
            }

            // Calculate weighted average liquidation prices
            const avgLiqLong = b.notionalLong > 0 ? b.sumLiqNotionalLong / b.notionalLong : 0;
            const avgLiqShort = b.notionalShort > 0 ? b.sumLiqNotionalShort / b.notionalShort : 0;

            const formatLiq = (val, col) => {
                if (val === 0) return '—';
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

            const newContent = `
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; font-weight:${rangeWeight}; color:${rangeColor}; position: relative;">
                    ${starIndicator}
                    ${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; position:absolute; top:-6px; right:4px; line-height:1; background:#0a0e1a; padding:0 2px; border-radius:2px;">$${btcPrice.toLocaleString()}</div>` : ''}
                    $${b.faixaDe.toLocaleString()}
                </td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; color:${isRangeMultiple1000 || isRangeMultiple500 ? rangeColor : '#9ca3af'}; font-weight:${isRangeMultiple1000 ? '800' : (isRangeMultiple500 ? '700' : '400')}">$${b.faixaAte.toLocaleString()}</td>
                <td class="col-agg-liq" style="font-family:monospace; vertical-align:middle">${liqHtml}</td>
                <td class="mono col-agg-val">${liqRenderer(b.liqVolLong, 'long')}</td>
                <td class="mono col-agg-val">${liqRenderer(b.liqVolShort, 'short')}</td>
                <td class="col-agg-qty" style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${longCol}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>
                <td class="col-agg-qty" style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${shortCol}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}">${formatVal(totalNotional)}</td>
                <td class="col-agg-dom" style="color:${domColor}; font-weight:${fwBold}">${domType}</td>
                <td class="col-agg-pct" style="color:${domColor}; font-weight:${fwBold}">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>
                <td class="col-agg-int" style="color:${intColor}; font-size:11px; font-weight:${fwSemi}">${intType}</td>
                <td class="col-agg-zone" style="color:${zoneColor}; font-weight:${fwSemi}">${zoneType}</td>
                <td class="col-agg-assets" style="color:${longCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosLong).join(', ')}">${Array.from(b.ativosLong).join(', ')}</td>
                <td class="col-agg-assets" style="color:${shortCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosShort).join(', ')}">${Array.from(b.ativosShort).join(', ')}</td>
            `;

            return `<tr class="${trClass}" style="${expectedStyle}">${newContent}</tr>`;
        };

        // Update current price range index for the scroll button
        currentPriceRangeIndex = fullBandArray.findIndex(b => currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte);

        // Render using virtual scroll
        aggVirtualScrollManager.renderRow = rowRenderer;
        aggVirtualScrollManager.setData(fullBandArray);
    } else {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
    }
}

/**
 * Scrolls the aggregation table to the current price range row
 */
export function scrollToCurrentPriceRange() {
    if (aggVirtualScrollManager && currentPriceRangeIndex !== -1) {
        aggVirtualScrollManager.scrollToIndex(currentPriceRangeIndex);
    }
}

function fmtUsdCompact(val, showSymbol = true) {
    if (val === 0) return showSymbol ? '$0' : '0';
    const sym = showSymbol ? '$' : '';
    if (val >= 1_000_000_000) return sym + (val / 1_000_000_000).toFixed(2) + 'B';
    if (val >= 1_000_000) return sym + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1_000) return sym + (val / 1_000).toFixed(2) + 'K';
    return sym + val.toFixed(2);
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '128,128,128';
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b} `;
    } catch (e) {
        return '128,128,128';
    }
}

// Custom Tooltip Event Handling
let activeTooltipTimeout = null;
let pendingTooltipTarget = null;

document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.has-tooltip');

    // If we moved away from a target or to a new one, clear any pending tooltip timer
    if (activeTooltipTimeout) {
        // Only clear if we are moving to a new target or leaving the current one
        // If we are moving within the same target, do nothing?
        // But mouseover bubbles. If we move child->child, target is same.
        // If we move out and back in, target is same but we might want to restart?
        // Let's stick to simple: clear previous pending if any.
        clearTimeout(activeTooltipTimeout);
        activeTooltipTimeout = null;
        pendingTooltipTarget = null;
    }

    if (!target) return;

    // GLOBAL CLEANUP: Remove any existing tooltips to prevent overlapping/stacking
    // This fixes the issue where rapid movement or virtual scroll leaves orphan tooltips
    document.querySelectorAll('.custom-tooltip').forEach(el => el.remove());
    document.querySelectorAll('[data-tooltip-active="true"]').forEach(el => {
        if (el !== target) el.dataset.tooltipActive = 'false';
    });

    // Prevent tooltip re-creation if already showing for this target
    if (target.dataset.tooltipActive === 'true') {
        return;
    }

    const tooltipDataStr = target.getAttribute('data-tooltip');
    if (!tooltipDataStr) {
        return;
    }

    // Set as pending
    pendingTooltipTarget = target;

    // Cancel timeout if mouse leaves before delay
    const cancelTimeout = () => {
        if (pendingTooltipTarget === target) {
            if (activeTooltipTimeout) {
                clearTimeout(activeTooltipTimeout);
                activeTooltipTimeout = null;
            }
            pendingTooltipTarget = null;
        }
        target.removeEventListener('mouseleave', cancelTimeout);
    };
    target.addEventListener('mouseleave', cancelTimeout);

    const delay = getTooltipDelay();

    activeTooltipTimeout = setTimeout(() => {
        // No longer pending
        if (pendingTooltipTarget === target) {
            pendingTooltipTarget = null;
            activeTooltipTimeout = null;
        }

        // Mark as active immediately to prevent double-firing
        target.dataset.tooltipActive = 'true';

        try {
            const data = JSON.parse(tooltipDataStr);
            let tooltipHtml = '';

            if (data.longs && data.longs.length > 0) {
                tooltipHtml += `<div class="custom-tooltip-header longs">🟢 COMPRAS (LONGS) - ${data.longsCount} Players</div>`;
                tooltipHtml += `<div class="custom-tooltip-table">`;
                tooltipHtml += `
                    <div class="custom-tooltip-row header">
                        <span class="col-player">Player</span>
                        <span class="col-entry">Entry</span>
                        <span class="col-vol">Vol</span>
                    </div>
                `;
                data.longs.forEach(p => {
                    tooltipHtml += `
                        <div class="custom-tooltip-row">
                            <span class="col-player" title="${p.name} (${p.coin})">${p.name} <span class="coin-tag">${p.coin}</span></span>
                            <span class="col-entry">$${p.displayEntry}</span>
                            <span class="col-vol">${p.displayVol}</span>
                        </div>
                    `;
                });
                tooltipHtml += `</div>`; // Close table
                if (data.longsRemaining > 0) {
                    tooltipHtml += `<div class="custom-tooltip-remaining">...e mais ${data.longsRemaining}</div>`;
                }
            }

            if (data.shorts && data.shorts.length > 0) {
                if (tooltipHtml) tooltipHtml += '<div class="custom-tooltip-spacer"></div>';
                tooltipHtml += `<div class="custom-tooltip-header shorts">🔴 VENDAS (SHORTS) - ${data.shortsCount} Players</div>`;
                tooltipHtml += `<div class="custom-tooltip-table">`;
                tooltipHtml += `
                    <div class="custom-tooltip-row header">
                        <span class="col-player">Player</span>
                        <span class="col-entry">Entry</span>
                        <span class="col-vol">Vol</span>
                    </div>
                `;
                data.shorts.forEach(p => {
                    tooltipHtml += `
                        <div class="custom-tooltip-row">
                            <span class="col-player" title="${p.name} (${p.coin})">${p.name} <span class="coin-tag">${p.coin}</span></span>
                            <span class="col-entry">$${p.displayEntry}</span>
                            <span class="col-vol">${p.displayVol}</span>
                        </div>
                    `;
                });
                tooltipHtml += `</div>`; // Close table
                if (data.shortsRemaining > 0) {
                    tooltipHtml += `<div class="custom-tooltip-remaining">...e mais ${data.shortsRemaining}</div>`;
                }
            }

            if (!tooltipHtml) {
                console.warn('Tooltip HTML is empty, resetting active state');
                target.dataset.tooltipActive = 'false';
                return;
            }

            const tooltipEl = document.createElement('div');
            tooltipEl.className = 'custom-tooltip';
            tooltipEl.innerHTML = tooltipHtml;
            document.body.appendChild(tooltipEl);

            const rect = target.getBoundingClientRect();

            // Check if mobile
            const isMobile = window.innerWidth <= 768;

            if (!isMobile) {
                // Initial positioning off-screen to measure
                tooltipEl.style.visibility = 'hidden';
                tooltipEl.style.top = '0px';
                tooltipEl.style.left = '0px';

                requestAnimationFrame(() => {
                    const tooltipRect = tooltipEl.getBoundingClientRect();

                    let top = rect.bottom + 10;
                    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

                    // Boundary checks
                    if (left < 10) left = 10;
                    if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;

                    // Flip to top if not enough space below
                    if (top + tooltipRect.height > window.innerHeight - 10) {
                        top = rect.top - tooltipRect.height - 10;
                    }

                    tooltipEl.style.top = `${top}px`;
                    tooltipEl.style.left = `${left}px`;
                    tooltipEl.style.visibility = 'visible';

                    // Trigger animation
                    requestAnimationFrame(() => tooltipEl.classList.add('visible'));
                });
            } else {
                // Mobile: let CSS handle positioning (centered)
                requestAnimationFrame(() => tooltipEl.classList.add('visible'));
            }

            // Cleanup function
            const cleanup = (e) => {
                // If moving between target and tooltip, don't close
                if (e && e.relatedTarget) {
                    const rel = e.relatedTarget;
                    if (rel === tooltipEl || tooltipEl.contains(rel)) return;
                    if (rel === target || target.contains(rel)) return;
                }

                // Close tooltip
                tooltipEl.classList.remove('visible');
                target.dataset.tooltipActive = 'false';

                // Remove listeners
                target.removeEventListener('mouseleave', cleanup);
                tooltipEl.removeEventListener('mouseleave', cleanup);
                document.removeEventListener('touchstart', handleOutsideClick);
                document.removeEventListener('click', handleOutsideClick);

                setTimeout(() => {
                    if (tooltipEl.parentNode) {
                        tooltipEl.remove();
                    }
                }, 200);
            };

            const handleOutsideClick = (e) => {
                // If clicking inside tooltip or target, don't close
                if (tooltipEl.contains(e.target) || target.contains(e.target)) return;
                cleanup();
            };

            target.addEventListener('mouseleave', cleanup);
            tooltipEl.addEventListener('mouseleave', cleanup);

            // Handle clicks outside (for mobile/desktop interaction)
            // Use capture=true for touchstart to catch it early? No, bubbling is fine.
            // Using setTimeout to avoid immediate trigger if the event that opened it propagates
            setTimeout(() => {
                document.addEventListener('touchstart', handleOutsideClick, { passive: true });
                document.addEventListener('click', handleOutsideClick);
            }, 50);

        } catch (err) {
            console.error('Error parsing tooltip data:', err, tooltipDataStr);
            target.dataset.tooltipActive = 'false';
        }
    }, delay);
});

// ═══════════════════════════════════════════════════════════
// RESUMIDA TABLE - Aggregation Table (Simplified Version)
// ═══════════════════════════════════════════════════════════

export function renderAggregationTableResumida(force = false) {
    const aggSection = document.getElementById('aggSectionWrapperResumida');
    const isCollapsed = aggSection?.classList.contains('collapsed');

    // Optimization: Skip rendering if collapsed, unless forced
    if (isCollapsed && !force) {
        return;
    }

    // Initialize controls only once
    if (!aggControlsInitializedResumida) {
        // 1. Aggregation Interval Tabs for Resumida
        const intervalTabs = document.querySelectorAll('#aggIntervalTabsResumida .tab-button');
        if (intervalTabs) {
            intervalTabs.forEach(t => t.addEventListener('click', () => {
                const interval = parseInt(t.dataset.interval);
                setAggInterval(interval);
                intervalTabs.forEach(btn => btn.classList.toggle('active', btn === t));
                renderAggregationTableResumida(true);
                saveSettings();
            }));
        }

        // 2. Aggregation Volume Unit Tabs for Resumida
        const unitTabs = document.querySelectorAll('#aggVolumeUnitTabsResumida .tab-button');
        if (unitTabs) {
            unitTabs.forEach(t => t.addEventListener('click', () => {
                const unit = t.dataset.unit;
                setAggVolumeUnitResumida(unit);
                unitTabs.forEach(btn => btn.classList.toggle('active', btn === t));
                renderAggregationTableResumida(true);
                saveSettings();
            }));
        }

        // 3. Local Range Controls for Resumida
        const minInput = document.getElementById('aggMinPriceResumida');
        const maxInput = document.getElementById('aggMaxPriceResumida');

        if (minInput && maxInput) {
            const updateRange = () => {
                const min = parseFloat(minInput.value) || 0;
                const max = parseFloat(maxInput.value) || 0;
                setAggMinPriceResumida(min);
                setAggMaxPriceResumida(max);
                renderAggregationTableResumida(true);
                saveSettings();
            };

            minInput.addEventListener('change', updateRange);
            maxInput.addEventListener('change', updateRange);

            const onEnter = (e) => { if (e.key === 'Enter') updateRange(); };
            minInput.addEventListener('keydown', onEnter);
            maxInput.addEventListener('keydown', onEnter);
        }

        // 4. Volume Unit Toggle Buttons for Resumida
        const volumeUnitButtons = document.querySelectorAll('#aggSectionWrapperResumida .js-agg-volume-unit-tab');
        if (volumeUnitButtons) {
            volumeUnitButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const unit = btn.dataset.unit;
                    setAggVolumeUnitResumida(unit);
                    volumeUnitButtons.forEach(b => b.classList.toggle('active', b === btn));
                    renderAggregationTableResumida(true);
                    saveSettings();
                });
            });
        }

        aggControlsInitializedResumida = true;
    }

    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const aggVolumeUnitResumida = getAggVolumeUnitResumida();
    const showAggSymbols = getShowAggSymbols();
    const aggZoneColors = getAggZoneColors();
    const aggHighlightColor = getAggHighlightColor();
    const decimalPlaces = getDecimalPlaces();
    const bandSize = Math.max(1, getAggInterval());
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;

    // Build current band identity
    const currentBand = btcPrice > 0 ? Math.floor(btcPrice / bandSize) * bandSize : 0;
    const colorsStr = JSON.stringify(aggZoneColors || {});
    const pricesHash = computeRelevantPricesHash(currentPrices, rows);

    // Optimization: Skip rendering if data hasn't significantly changed
    if (!force &&
        lastRenderedBandResumida === currentBand &&
        lastRenderedUnitResumida === aggVolumeUnitResumida &&
        lastRenderedIntervalResumida === bandSize &&
        lastRenderedRowCountResumida === rows.length &&
        lastRenderedColorsStrResumida === colorsStr &&
        lastRenderedPricesHashResumida === pricesHash) {
        return;
    }

    if (!rows || rows.length === 0) {
        document.getElementById('aggTableBodyResumida').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        document.getElementById('aggStatsBarResumida').innerHTML = '';
        lastRenderedRowCountResumida = 0;
        return;
    }

    // Update state tracking
    lastRenderedBandResumida = currentBand;
    lastRenderedUnitResumida = aggVolumeUnitResumida;
    lastRenderedIntervalResumida = bandSize;
    lastRenderedRowCountResumida = rows.length;
    lastRenderedColorsStrResumida = colorsStr;
    lastRenderedPricesHashResumida = pricesHash;

    const bands = {};

    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let posCount = rows.length;
    let bandsWithPosCount = 0;

    // 1. Determine the range
    let minEntryBand = getAggMinPriceResumida();
    let maxEntryBand = getAggMaxPriceResumida();
    let isAutoRange = false;

    if (!minEntryBand || !maxEntryBand || minEntryBand <= 0 || maxEntryBand <= 0 || minEntryBand >= maxEntryBand) {
        minEntryBand = Infinity;
        maxEntryBand = -Infinity;
        isAutoRange = true;

        for (const r of rows) {
            const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            if (!isNaN(entryCcy) && entryCcy > 0) {
                const b = Math.floor(entryCcy / bandSize) * bandSize;
                if (b < minEntryBand) minEntryBand = b;
                if (b > maxEntryBand) maxEntryBand = b;
            }
        }
    } else {
        minEntryBand = Math.floor(minEntryBand / bandSize) * bandSize;
        maxEntryBand = Math.floor(maxEntryBand / bandSize) * bandSize;
    }

    if (minEntryBand === Infinity || minEntryBand === -Infinity) {
        const statsBar = document.getElementById('aggStatsBarResumida');
        if (statsBar) statsBar.innerHTML = '';
        document.getElementById('aggTableBodyResumida').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
        return;
    }

    // 2. Safety Truncate (Anti-Freeze)
    const MAX_ALLOWED_BANDS = 5000;
    let totalBandsCount = Math.floor((maxEntryBand - minEntryBand) / bandSize) + 1;
    if (totalBandsCount > MAX_ALLOWED_BANDS) {
        console.warn(`[AggTableResumida] Excessive range detected (${totalBandsCount} bands). Truncating around current price.`);
        const centerBand = currentBand > 0 ? currentBand : (maxEntryBand + minEntryBand) / 2;
        const halfRange = Math.floor(MAX_ALLOWED_BANDS / 2) * bandSize;
        minEntryBand = Math.max(minEntryBand, Math.floor((centerBand - halfRange) / bandSize) * bandSize);
        maxEntryBand = Math.min(maxEntryBand, Math.floor((centerBand + halfRange) / bandSize) * bandSize);
    }

    // 3. Pre-populate bands map
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

    // 4. Populate volumes
    for (const r of rows) {
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        if (!isNaN(entryCcy) && entryCcy > 0) {
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

        // Liquidation Volume logic
        if (r.liquidationPx > 0) {
            const liqPriceCorr = getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates);
            if (isFinite(liqPriceCorr) && liqPriceCorr > 0) {
                const liqBand = Math.floor(liqPriceCorr / bandSize) * bandSize;
                const lb = bands[liqBand];
                if (lb) {
                    if (r.side === 'long') lb.liqVolLong += r.positionValue;
                    else lb.liqVolShort += r.positionValue;
                }
            }
        }
    }

    // Convert bands to array and sort descending
    const bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);
    bandsWithPosCount = bandArray.filter(b => !b.isEmpty).length;

    if (bandArray.length > 0) {
        const maxBand = bandArray[0].faixaDe;
        const minBand = bandArray[bandArray.length - 1].faixaDe;
        const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;

        const fullBandArray = bandArray;
        let vacuosCount = bandArray.filter(b => b.isEmpty).length;

        // Top Stats
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
        const statsBar = document.getElementById('aggStatsBarResumida');
        if (statsBar) {
            statsBar.innerHTML = statsHtml;
            statsBar.classList.remove('flash-update');
            void statsBar.offsetWidth;
            statsBar.classList.add('flash-update');
        }

        // Render rows using Virtual Scroll
        const currentBtcPos = btcPrice > 0 ? btcPrice : 0;

        if (!aggVirtualScrollManagerResumida) {
            aggVirtualScrollManagerResumida = enableVirtualScroll('aggTableBodyResumida', { threshold: 40, rowHeight: 36 });
        }

        const rowRenderer = (b, index) => {
            const totalNotional = b.notionalLong + b.notionalShort;
            const isEmpty = b.isEmpty;

            const isCurrentPriceRange = currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte;

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

            let intType = '—';
            let intColor = '#6b7280';
            const isWeakIntensity = totalNotional < 10_000_000;
            if (totalNotional >= 100_000_000) { intType = 'EXTREMA >100M'; intColor = '#f59e0b'; }
            else if (totalNotional >= 30_000_000) { intType = 'FORTE >30M'; intColor = '#22c55e'; }
            else if (totalNotional >= 10_000_000) { intType = 'MEDIA >10M'; intColor = '#60a5fa'; }
            else if (totalNotional > 3_000_000) { intType = 'FRACA >3M'; intColor = '#9ca3af'; }
            else if (totalNotional > 0) { intType = 'MUITO FRACA'; intColor = '#4b5563'; }

            let zoneType = isEmpty ? 'Zona Vazia' : '—';
            let zoneColor = '#4b5563';
            if (!isEmpty) {
                const isForteLong = b.notionalLong >= 30_000_000;
                const isForteShort = b.notionalShort >= 30_000_000;
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
            } else {
                colorLong = '#4b5563';
                colorShort = '#4b5563';
                domBg = '';
                domColor = '#6b7280';
            }

            let totalNotionalColor = '#bfdbfe';
            let fwBold = '700';
            let fwSemi = '600';

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
                intColor = '#4b5563';
                totalNotionalColor = '#6b7280';
                domBg = '';
                fwBold = '400';
                fwSemi = '400';
            }

            const formatVal = (v) => {
                if (v === 0) return '—';
                if (aggVolumeUnitResumida === 'BTC' && btcPrice > 0) {
                    const btcVal = v / btcPrice;
                    const sym = showAggSymbols ? '₿' : '';
                    return sym + (btcVal >= 1000 ? (btcVal / 1000).toFixed(1) + 'K' : btcVal.toFixed(2));
                }
                return fmtUsdCompact(v, showAggSymbols);
            };
            const formatQty = (v) => v > 0 ? v : '—';

            const longCol = colorLong;
            const shortCol = colorShort;

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
            } else if (domBg) {
                rowBgCSS = `background:${domBg}`;
            }

            const expectedStyle = `${trStyle}; ${highlightStyle || ''}; ${rowBgCSS}`.replace(/;+/g, ';').replace(/^; |; $/g, '').trim();

            const starIndicator = totalNotional >= 100_000_000 ? '<span style="color:#f59e0b; margin-right:4px; font-size:14px">⭐</span>' : '';

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
                            displayVol: aggVolumeUnitResumida === 'BTC'
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
                            displayVol: aggVolumeUnitResumida === 'BTC'
                                ? `₿${(btcPrice > 0 ? p.positionValue / btcPrice : 0).toFixed(2)}`
                                : fmtUsdCompact(p.positionValue)
                        };
                    });
                    tooltipData.shortsRemaining = Math.max(0, sortedShorts.length - maxItems);
                }
            }

            const tooltipAttr = tooltipData ? `data-tooltip='${JSON.stringify(tooltipData).replace(/'/g, "&#39;").replace(/"/g, "&quot;")}'` : '';
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
                if (val === 0) return '—';
                const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
                const sym = showAggSymbols ? entMeta.symbol : '';
                return `<span style="color:${col}">${sym}${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>`;
            };

            const liqHtml = `<div style="display:flex; flex-direction:column; gap:2px; font-size:10px; line-height:1">
                ${b.notionalLong > 0 ? `<div>L: ${formatLiq(avgLiqLong, colorLong)}</div>` : ''}
                ${b.notionalShort > 0 ? `<div>S: ${formatLiq(avgLiqShort, colorShort)}</div>` : ''}
            </div>`;

            const fmtVal = (v) => {
                if (aggVolumeUnitResumida === 'BTC' && btcPrice > 0) {
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

            const newContent = `
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; font-weight:${rangeWeight}; color:${rangeColor}; position: relative;">
                    ${starIndicator}
                    ${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; position:absolute; top:-6px; right:4px; line-height:1; background:#0a0e1a; padding:0 2px; border-radius:2px;">$${btcPrice.toLocaleString()}</div>` : ''}
                    $${b.faixaDe.toLocaleString()}
                </td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; color:${isRangeMultiple1000 || isRangeMultiple500 ? rangeColor : '#9ca3af'}; font-weight:${isRangeMultiple1000 ? '800' : (isRangeMultiple500 ? '700' : '400')}">$${b.faixaAte.toLocaleString()}</td>
                <td class="col-agg-liq" style="font-family:monospace; vertical-align:middle">${liqHtml}</td>
                <td class="mono col-agg-val">${liqRenderer(b.liqVolLong, 'long')}</td>
                <td class="mono col-agg-val">${liqRenderer(b.liqVolShort, 'short')}</td>
                <td class="col-agg-qty" style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${longCol}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>
                <td class="col-agg-qty" style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${shortCol}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}">${formatVal(totalNotional)}</td>
                <td class="col-agg-dom" style="color:${domColor}; font-weight:${fwBold}">${domType}</td>
                <td class="col-agg-pct" style="color:${domColor}; font-weight:${fwBold}">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>
                <td class="col-agg-int" style="color:${intColor}; font-size:11px; font-weight:${fwSemi}">${intType}</td>
                <td class="col-agg-zone" style="color:${zoneColor}; font-weight:${fwSemi}">${zoneType}</td>
                <td class="col-agg-assets" style="color:${longCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosLong).join(', ')}">${Array.from(b.ativosLong).join(', ')}</td>
                <td class="col-agg-assets" style="color:${shortCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosShort).join(', ')}">${Array.from(b.ativosShort).join(', ')}</td>
            `;

            return `<tr class="${trClass}" style="${expectedStyle}">${newContent}</tr>`;
        };

        currentPriceRangeIndexResumida = fullBandArray.findIndex(b => currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte);

        aggVirtualScrollManagerResumida.renderRow = rowRenderer;
        aggVirtualScrollManagerResumida.setData(fullBandArray);
    } else {
        document.getElementById('aggTableBodyResumida').innerHTML = '<tr><td colspan="16" class="empty-cell">Sem dados disponíveis.</td></tr>';
    }
}

/**
 * Scrolls the resumida table to the current price range row
 */
export function scrollToCurrentPriceRangeResumida() {
    if (aggVirtualScrollManagerResumida && currentPriceRangeIndexResumida !== -1) {
        aggVirtualScrollManagerResumida.scrollToIndex(currentPriceRangeIndexResumida);
    }
}
