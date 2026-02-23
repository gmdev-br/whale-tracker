// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═══════════════════════════════════════════════════════════

import { getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency, getAggInterval, getAggVolumeUnit, getShowAggSymbols, getAggZoneColors, getAggHighlightColor, getDecimalPlaces, getTooltipDelay } from '../state.js';
import { getCorrelatedEntry, getCorrelatedPrice } from '../utils/currency.js';
import { fmtUSD, fmtCcy } from '../utils/formatters.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';
import { CURRENCY_META } from '../config.js';

let lastRenderedBand = null;
let lastRenderedUnit = null;
let lastRenderedInterval = null;
let lastRenderedRowCount = 0;
let lastRenderedColorsStr = '';
let lastRenderedPricesHash = '';
let aggVirtualScrollManager = null;
let currentPriceRangeIndex = -1; // Track index for the floating button

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

    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const aggVolumeUnit = getAggVolumeUnit();
    const showAggSymbols = getShowAggSymbols();
    const aggZoneColors = getAggZoneColors();
    const aggHighlightColor = getAggHighlightColor();
    const decimalPlaces = getDecimalPlaces();
    const bandSize = getAggInterval();
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
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="14" class="empty-cell">Sem dados disponíveis.</td></tr>';
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

    // Build bands map
    for (const r of rows) {
        // Calculate correlated entry price
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);

        if (isNaN(entryCcy) || entryCcy <= 0) continue;

        // Determine band
        const bandDown = Math.floor(entryCcy / bandSize) * bandSize;

        if (!bands[bandDown]) {
            bands[bandDown] = {
                faixaDe: bandDown,
                faixaAte: bandDown + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                sumLiqNotionalLong: 0,
                sumLiqNotionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set(),
                positionsLong: [],
                positionsShort: []
            };
        }

        const b = bands[bandDown];
        const val = r.positionValue; // USD value

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
        } else if (r.side === 'short') {
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

    // Convert bands to array and sort descending
    const bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);
    bandsWithPosCount = bandArray.length;

    // Calculate max and min bands to fill "vacuos" (empty bands)
    if (bandArray.length > 0) {
        const maxBand = bandArray[0].faixaDe;
        const minBand = bandArray[bandArray.length - 1].faixaDe;
        const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;

        // Create full array including vacuos
        const fullBandArray = [];
        let vacuosCount = 0;

        for (let base = maxBand; base >= minBand; base -= bandSize) {
            fullBandArray.push(bands[base] || {
                faixaDe: base,
                faixaAte: base + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set(),
                positionsLong: [],
                positionsShort: [],
                isEmpty: true
            });
            if (!bands[base]) vacuosCount++;
        }

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
            const valBg = (totalNotional >= 10_000_000 && !isWeakIntensity) ? 'background:rgba(59,130,246,0.1)' : '';

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
            const expectedStyle = `${trStyle}; ${highlightStyle}`.trim().replace(/^; | ;$/g, '');

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

            const newContent = `
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; font-weight:${rangeWeight}; color:${rangeColor}">
                    ${starIndicator}
                    ${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; margin-bottom:2px">BTC $${btcPrice.toLocaleString()}</div>` : ''}
                    $${b.faixaDe.toLocaleString()}
                </td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-range" style="font-family:monospace; color:${isRangeMultiple1000 || isRangeMultiple500 ? rangeColor : '#9ca3af'}; font-weight:${isRangeMultiple1000 ? '800' : (isRangeMultiple500 ? '700' : '400')}">$${b.faixaAte.toLocaleString()}</td>
                <td class="col-agg-liq" style="font-family:monospace; vertical-align:middle">${liqHtml}</td>
                <td class="col-agg-qty" style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${longCol}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>
                <td class="col-agg-qty" style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="color:${shortCol}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>
                <td ${tooltipAttr} class="${tooltipClass} col-agg-val" style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}; ${valBg}">${formatVal(totalNotional)}</td>
                <td class="col-agg-dom" style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domType}</td>
                <td class="col-agg-pct" style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>
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
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="14" class="empty-cell">Sem dados disponíveis.</td></tr>';
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
