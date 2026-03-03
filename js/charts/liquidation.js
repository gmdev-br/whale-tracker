// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Liquidation
// ═══════════════════════════════════════════════════════════

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import {
    getDisplayedRows, getCurrentPrices, getActiveEntryCurrency, getShowSymbols,
    getLiqChartHeight, getChartMode, getAggregationFactor, getSavedLiqState,
    getFxRates, getChartHighLevSplit, getColorMaxLev, getDecimalPlaces, getLeverageColors,
    getBubbleScale, getBubbleOpacity, getMinBtcVolume, getWhaleMeta, getPriceUpdateVersion
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { liqChartOptions } from './liq-config.js';
import { getCorrelatedPrice } from '../utils/currency.js';
import { saveSettings } from '../storage/settings.js';

let liqChartInstance = null;
let lastDataHash = null;

// ── Chart Scale Resizing ──
function enableChartScaleResizing(canvasId, getChartInstance, resetBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    let isDragging = false;
    let dragAxis = null;
    let startPos = 0;
    let initialMin = 0;
    let initialMax = 0;

    canvas.addEventListener('mousedown', (e) => {
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { left, right, top, bottom } = chart.chartArea;

        if (x < left && y >= top && y <= bottom) {
            isDragging = true;
            dragAxis = 'y';
            startPos = y;
            initialMin = chart.scales.y.min;
            initialMax = chart.scales.y.max;
            e.preventDefault();
        } else if (y > bottom && x >= left && x <= right) {
            isDragging = true;
            dragAxis = 'x';
            startPos = x;
            initialMin = chart.scales.x.min;
            initialMax = chart.scales.x.max;
            e.preventDefault();
        }

        if (isDragging) {
            chart.isZoomed = true;
            if (resetBtnId) {
                const btn = document.getElementById(resetBtnId);
                if (btn) btn.style.display = 'block';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragAxis) return;
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scale = chart.scales[dragAxis];
        const isLog = scale.type === 'logarithmic';
        const sensitivity = 2.0;

        if (dragAxis === 'y') {
            const delta = y - startPos;
            const height = chart.chartArea.bottom - chart.chartArea.top;
            const factor = (delta / height) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const newLogRange = (logMax - logMin) * (1 + factor);
                const logCenter = (logMax + logMin) / 2;
                chart.options.scales.y.min = Math.exp(logCenter - newLogRange / 2);
                chart.options.scales.y.max = Math.exp(logCenter + newLogRange / 2);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;
                chart.options.scales.y.min = center - newRange / 2;
                chart.options.scales.y.max = center + newRange / 2;
            }
        } else if (dragAxis === 'x') {
            const delta = x - startPos;
            const width = chart.chartArea.right - chart.chartArea.left;
            const factor = -(delta / width) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const newLogRange = (logMax - logMin) * (1 + factor);
                const logCenter = (logMax + logMin) / 2;
                chart.options.scales.x.min = Math.exp(logCenter - newLogRange / 2);
                chart.options.scales.x.max = Math.exp(logCenter + newLogRange / 2);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;
                chart.options.scales.x.min = center - newRange / 2;
                chart.options.scales.x.max = center + newRange / 2;
            }
        }
        chart.update('none');
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragAxis = null;
            const chart = getChartInstance();
            if (chart) {
                chart.isZoomed = true;
                saveSettings();
            }
        }
    });
}

export function renderLiqScatterPlot(workerLiqPoints = null, force = false) {
    const section = document.getElementById('liquidationChartWrapper');
    if (!section) return;

    if (section && section.classList.contains('collapsed') && !force) {
        // Flag for future refresh when opened
        section.dataset.dirty = 'true';
        return;
    }
    delete section?.dataset.dirty;

    const rows = getDisplayedRows();
    if (!rows || rows.length === 0) {
        if (section.style.display !== 'none') section.style.display = 'none';
        return;
    }

    if (section.style.display !== 'block') {
        section.style.display = 'block';
        section.style.height = getLiqChartHeight() + 'px';
    }

    const canvas = document.getElementById('liqChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // PERFORMANCE: Use pre-calculated worker fields and single-pass for bounds/data mapping
    let data = [];
    let minX = 0;
    let maxX = 0;

    const activeEntryCcy = getActiveEntryCurrency();
    const btcPrice = parseFloat(getCurrentPrices()['BTC'] || 0);
    const fxRates = getFxRates();
    const rate = fxRates[activeEntryCcy] || 1;
    let refPrice = activeEntryCcy === 'BTC' ? 1 : btcPrice * rate;

    if (workerLiqPoints) {
        // FAST PATH: Use pre-calculated data from worker
        data = workerLiqPoints;
        if (data.length > 0) {
            minX = data[0].x;
            maxX = data[0].x;
            for (let i = 1; i < data.length; i++) {
                const x = data[i].x;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
            }
        }
    } else {
        // FALLBACK: Calculate manually (O(N))
        const bubbleScale = getBubbleScale();
        minX = refPrice;
        maxX = refPrice;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (r._liqPxCcy <= 0) continue;

            const x = r._liqPxCcy;
            const d = {
                x: x,
                y: r._volBTC,
                r: r._sqrtPosVal / 1000 * bubbleScale,
                _raw: r
            };
            data.push(d);

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    const chartMode = getChartMode();
    const bubbleScale = getBubbleScale();

    if (liqChartInstance && lastDataHash === currentDataHash) {
        return;
    }

    const canUpdateOnly = liqChartInstance &&
        liqChartInstance.config.type === (chartMode === 'column' || chartMode === 'lines' ? 'bar' : 'bubble') &&
        liqChartInstance.config.options.indexAxis === (chartMode === 'lines' ? 'y' : 'x');

    lastDataHash = currentDataHash;

    const customColors = getLeverageColors();
    const opacity = getBubbleOpacity();

    let datasets = [];
    let localScales = {};
    let localIndexAxis = 'x';
    let chartType = 'bubble';

    if (chartMode === 'column') {
        chartType = 'bar';
        const numBins = getAggregationFactor();
        const binSize = (maxX - minX || 1) / numBins;
        const bins = new Array(numBins).fill(0);
        for (let i = 0; i < data.length; i++) {
            bins[Math.min(Math.floor((data[i].x - minX) / binSize), numBins - 1)]++;
        }
        datasets = [{ label: 'Liquidations', data: bins, backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 0.8)', borderWidth: 1 }];
        localScales = {
            x: { type: 'category', ...chartOptions.scales.x, labels: bins.map((_, i) => (minX + (i * binSize)).toLocaleString(undefined, { maximumFractionDigits: 0 })) },
            y: { ...chartOptions.scales.y }
        };
    } else if (chartMode === 'lines') {
        chartType = 'bar';
        localIndexAxis = 'y';

        const groupedData = {
            longLow: { label: `Longs (≤${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.longLow, 0.7), borderColor: customColors.longLow },
            longHigh: { label: `Longs (>${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.longHigh, 0.7), borderColor: customColors.longHigh },
            shortLow: { label: `Shorts (≤${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.shortLow, 0.7), borderColor: customColors.shortLow },
            shortHigh: { label: `Shorts (>${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.shortHigh, 0.7), borderColor: customColors.shortHigh }
        };

        let maxVol = 0;
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const r = d._raw;
            const lev = Math.abs(r.leverageValue);
            const key = r.side === 'long' ? (lev >= highLevSplit ? 'longHigh' : 'longLow') : (lev >= highLevSplit ? 'shortHigh' : 'shortLow');
            groupedData[key].data.push({ x: d.y, y: d.x, _raw: r });
            if (d.y > maxVol) maxVol = d.y;
        }

        datasets = Object.values(groupedData)
            .filter(g => g.data.length > 0)
            .map(g => ({
                ...g,
                borderWidth: 1,
                barThickness: 2,
                grouped: true,
                categoryPercentage: 1.0,
                barPercentage: 1.0
            }));

        localScales = {
            x: { type: 'linear', position: 'bottom', stacked: true, min: 0, max: maxVol * 1.1 },
            y: { type: 'linear', stacked: true, min: parseFloat(document.getElementById('minEntryCcy')?.value || undefined) }
        };
    } else {
        const categories = {
            longLow: { data: [], label: `Longs (≤${highLevSplit}x)`, color: customColors.longLow, border: 1 },
            longHigh: { data: [], label: `Longs (>${highLevSplit}x)`, color: customColors.longHigh, border: 2 },
            shortLow: { data: [], label: `Shorts (≤${highLevSplit}x)`, color: customColors.shortLow, border: 1 },
            shortHigh: { data: [], label: `Shorts (>${highLevSplit}x)`, color: customColors.shortHigh, border: 2 }
        };
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const lev = Math.abs(d._raw.leverageValue);
            const key = d._raw.side === 'long' ? (lev < highLevSplit ? 'longLow' : 'longHigh') : (lev < highLevSplit ? 'shortLow' : 'shortHigh');
            categories[key].data.push(d);
        }
        const minBtcVol = getMinBtcVolume();
        const whaleMeta = getWhaleMeta();
        datasets = Object.values(categories).filter(c => c.data.length > 0).map(c => ({
            label: c.label, data: c.data, parsing: false, normalized: true,
            backgroundColor: hexToRgba(c.color, opacity),
            borderColor: c.color, borderWidth: c.border,
            pointStyle: (ctx) => {
                const r = ctx.raw?._raw;
                return (whaleMeta[r?.address]?.displayName || (minBtcVol > 0 && ctx.raw?.y >= minBtcVol)) ? 'star' : 'circle';
            }
        }));
        localScales = {
            x: { type: 'linear', min: Math.max(parseFloat(document.getElementById('minEntryCcy')?.value || 0), 0) },
            y: { type: 'linear', min: 0 }
        };
    }

    if (canUpdateOnly) {
        liqChartInstance.data.datasets = datasets;
        liqChartInstance.options.scales.x = { ...liqChartInstance.options.scales.x, ...localScales.x };
        liqChartInstance.options.scales.y = { ...liqChartInstance.options.scales.y, ...localScales.y };
        if (chartType === 'bubble' || chartMode === 'lines') {
            liqChartInstance.options.plugins.btcPriceLabel = { price: refPrice, text: `BTC: $${refPrice.toLocaleString()}` };
        }
        liqChartInstance.update('none');
        return liqChartInstance;
    }

    if (liqChartInstance) liqChartInstance.destroy();

    const sym = getShowSymbols() ? (CURRENCY_META[activeEntryCcy || 'USD']?.symbol || '$') : '';
    liqChartInstance = new Chart(ctx, {
        type: chartType,
        data: { datasets },
        options: {
            ...liqChartOptions,
            indexAxis: localIndexAxis,
            plugins: {
                ...liqChartOptions.plugins,
                legend: { display: chartMode !== 'lines' },
                tooltip: {
                    ...liqChartOptions.plugins.tooltip,
                    callbacks: {
                        title: (items) => {
                            if (chartMode === 'column') return 'Liquidation Count';
                            const r = items[0].raw?._raw || items[0].dataset._raw;
                            if (!r) return 'Unknown';
                            const d = getWhaleMeta()[r.address]?.displayName;
                            return `${r.coin} ${r.side === 'long' ? '▲' : '▼'}${d ? ` (${d})` : ''}`;
                        },
                        label: (item) => {
                            if (chartMode === 'column') return `Count: ${item.parsed.y}`;
                            const r = item.raw?._raw || item.dataset._raw;
                            if (!r) return '';
                            const dp = getDecimalPlaces();
                            const x = chartMode === 'lines' ? item.parsed.y : item.parsed.x;
                            const y = chartMode === 'lines' ? item.parsed.x : item.parsed.y;
                            return [
                                `Price: ${sym}${x.toLocaleString(undefined, { maximumFractionDigits: dp })}`,
                                `BTC: ${y.toFixed(dp)}`,
                                `USD: $${r.positionValue.toLocaleString(undefined, { maximumFractionDigits: dp })}`
                            ];
                        }
                    }
                },
                btcPriceLabel: (chartType === 'bubble' || chartMode === 'lines') ? {
                    price: refPrice,
                    text: `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                } : undefined,
                zoom: {
                    ...liqChartOptions.plugins.zoom,
                    onZoomComplete: ({ chart }) => { chart.isZoomed = true; saveSettings(null, null, null, window.getScatterChart ? window.getScatterChart() : null, chart); },
                    onZoomStart: ({ chart }) => { chart.isZoomed = false; }
                }
            },
            scales: localScales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid, chartPlugins.btcPriceLabel]
    });

    if (getSavedLiqState()) {
        const s = getSavedLiqState();
        liqChartInstance.isZoomed = true;
        liqChartInstance.scales.x.min = s.x.min; liqChartInstance.scales.x.max = s.x.max;
        liqChartInstance.scales.y.min = s.y.min; liqChartInstance.scales.y.max = s.y.max;
        liqChartInstance.update('none');
    }

    return liqChartInstance;
}

export function getLiqChartInstance() {
    return liqChartInstance;
}

export function setLiqChartInstance(chart) {
    liqChartInstance = chart;
}

// Enable resizing for liquidation chart
enableChartScaleResizing('liqChart', () => liqChartInstance);
