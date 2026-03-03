// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Scatter Plot
// ═══════════════════════════════════════════════════════════

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import {
    getDisplayedRows, getCurrentPrices, getActiveCurrency, getActiveEntryCurrency,
    getShowSymbols, getChartHeight, getChartHighLevSplit,
    getBubbleScale, getBubbleOpacity, getLineThickness, getChartMode, getAggregationFactor, getSavedScatterState,
    getFxRates, getDecimalPlaces, getLeverageColors, getMinBtcVolume,
    getWhaleMeta, getPriceUpdateVersion
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { saveSettings } from '../storage/settings.js';
import {
    originalZoomConfig,
    originalScaleResizing
} from './chart-mechanics-adapted.js';

// Import chart plugins - ChartZoom is already registered via CDN

let scatterChart = null;
let lastDataHash = null; // Track data changes for incremental updates

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

        // Y Axis (Left)
        if (x < left && y >= top && y <= bottom) {
            isDragging = true;
            dragAxis = 'y';
            startPos = y;
            initialMin = chart.scales.y.min;
            initialMax = chart.scales.y.max;
            e.preventDefault();
        }
        // X Axis (Bottom)
        else if (y > bottom && x >= left && x <= right) {
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
            const delta = y - startPos; // Drag down > 0
            const height = chart.chartArea.bottom - chart.chartArea.top;
            const factor = (delta / height) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;

                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;

                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;

                chart.options.scales.y.min = Math.exp(newLogMin);
                chart.options.scales.y.max = Math.exp(newLogMax);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;

                chart.options.scales.y.min = center - newRange / 2;
                chart.options.scales.y.max = center + newRange / 2;
            }
        } else if (dragAxis === 'x') {
            const delta = x - startPos; // Drag right > 0
            const width = chart.chartArea.right - chart.chartArea.left;
            // Drag Right -> Zoom In -> Negative factor
            const factor = -(delta / width) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;

                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;

                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;

                chart.options.scales.x.min = Math.exp(newLogMin);
                chart.options.scales.x.max = Math.exp(newLogMax);
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

export function renderScatterPlot() {
    const section = document.getElementById('chart-section');
    if (!section) return;

    const displayedRows = getDisplayedRows();
    if (!displayedRows || displayedRows.length === 0) {
        if (section.style.display !== 'none') section.style.display = 'none';
        return;
    }

    if (section.style.display !== 'block') {
        section.style.display = 'block';
        section.style.height = getChartHeight() + 'px';
    }

    // Check if the chart section is collapsed
    if (section && section.classList.contains('collapsed')) {
        // Flag for future refresh when opened
        section.dataset.dirty = 'true';
        return;
    }
    delete section?.dataset.dirty;

    const canvas = document.getElementById('scatterChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // PERFORMANCE: Use pre-calculated worker fields and single-pass for bounds/data mapping
    const bubbleScale = getBubbleScale();
    const activeEntryCcy = getActiveEntryCurrency();
    const btcPrice = parseFloat(getCurrentPrices()['BTC'] || 0);
    const fxRates = getFxRates();
    const rate = fxRates[activeEntryCcy] || 1;
    const refPrice = btcPrice * rate;

    const data = [];
    let minX = refPrice;
    let maxX = refPrice;

    for (let i = 0; i < displayedRows.length; i++) {
        const r = displayedRows[i];
        if (r._volBTC <= 0) continue;

        const x = r._entCcy;
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

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    // PERFORMANCE: Hyper-fast hash for change detection
    const chartMode = getChartMode();
    const highLevSplit = getChartHighLevSplit();
    const currentDataHash = `${displayedRows.length}|${chartMode}|${highLevSplit}|${bubbleScale}|${getBubbleOpacity()}|${getAggregationFactor()}|${activeEntryCcy}|${getPriceUpdateVersion()}`;

    // If only data changed and chart exists, update instead of destroy
    if (scatterChart && lastDataHash === currentDataHash) {
        return;
    }

    // Check if we can just update the datasets
    const canUpdateOnly = scatterChart &&
        scatterChart.config.type === (chartMode === 'column' || chartMode === 'lines' ? 'bar' : 'bubble') &&
        scatterChart.config.options.indexAxis === (chartMode === 'lines' ? 'y' : 'x');

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
        const range = maxX - minX || 1;
        const binSize = range / numBins;

        const bins = {
            longLow: new Array(numBins).fill(0),
            longHigh: new Array(numBins).fill(0),
            shortLow: new Array(numBins).fill(0),
            shortHigh: new Array(numBins).fill(0)
        };

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const binIdx = Math.min(Math.floor((d.x - minX) / binSize), numBins - 1);
            const lev = Math.abs(d._raw.leverageValue);
            const key = d._raw.side === 'long' ? (lev < highLevSplit ? 'longLow' : 'longHigh') : (lev < highLevSplit ? 'shortLow' : 'shortHigh');
            bins[key][binIdx]++;
        }

        const binLabels = Array.from({ length: numBins }, (_, i) => (minX + (i * binSize)).toLocaleString(undefined, { maximumFractionDigits: 0 }));

        const createDataset = (label, dataArr, color) => ({
            label, data: dataArr, backgroundColor: color, borderColor: color, borderWidth: 1, stack: 'positions'
        });

        if (bins.shortLow.some(b => b > 0)) datasets.push(createDataset(`Shorts (≤${highLevSplit}x)`, bins.shortLow, customColors.shortLow));
        if (bins.shortHigh.some(b => b > 0)) datasets.push(createDataset(`Shorts (>${highLevSplit}x)`, bins.shortHigh, customColors.shortHigh));
        if (bins.longLow.some(b => b > 0)) datasets.push(createDataset(`Longs (≤${highLevSplit}x)`, bins.longLow, customColors.longLow));
        if (bins.longHigh.some(b => b > 0)) datasets.push(createDataset(`Longs (>${highLevSplit}x)`, bins.longHigh, customColors.longHigh));

        localScales = {
            x: { type: 'category', ...chartOptions.scales.x, labels: binLabels },
            y: { ...chartOptions.scales.y, stacked: true }
        };
    } else if (chartMode === 'lines') {
        chartType = 'bar';
        localIndexAxis = 'y';

        // PERFORMANCE: Group positions into 4 datasets instead of one per row (O(N) -> O(1) datasets)
        const groupedData = {
            longLow: { label: `Longs (≤${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.longLow, 0.7), borderColor: customColors.longLow },
            longHigh: { label: `Longs (>${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.longHigh, 0.7), borderColor: customColors.longHigh },
            shortLow: { label: `Shorts (≤${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.shortLow, 0.7), borderColor: customColors.shortLow },
            shortHigh: { label: `Shorts (>${highLevSplit}x)`, data: [], backgroundColor: hexToRgba(customColors.shortHigh, 0.7), borderColor: customColors.shortHigh }
        };

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const r = d._raw;
            const lev = Math.abs(r.leverageValue);
            const key = r.side === 'long' ? (lev >= highLevSplit ? 'longHigh' : 'longLow') : (lev >= highLevSplit ? 'shortHigh' : 'shortLow');

            // Map data to x/y objects
            groupedData[key].data.push({ x: d.y, y: d.x, _raw: r });
        }

        datasets = Object.values(groupedData)
            .filter(g => g.data.length > 0)
            .map(g => ({
                ...g,
                borderWidth: 1,
                barThickness: getLineThickness(),
                grouped: true,
                categoryPercentage: 1.0,
                barPercentage: 1.0
            }));

        const maxVol = data.reduce((max, d) => Math.max(max, d.y), 0);
        localScales = {
            x: { type: 'linear', position: 'bottom', stacked: true, min: 0, max: maxVol * 1.1 },
            y: { type: 'linear', stacked: true, min: parseFloat(document.getElementById('minEntryCcy')?.value || 0) }
        };
    } else {
        const categories = {
            longLow: { label: `Longs (≤${highLevSplit}x)`, data: [], color: customColors.longLow, border: 1 },
            longHigh: { label: `Longs (>${highLevSplit}x)`, data: [], color: customColors.longHigh, border: 2 },
            shortLow: { label: `Shorts (≤${highLevSplit}x)`, data: [], color: customColors.shortLow, border: 1 },
            shortHigh: { label: `Shorts (>${highLevSplit}x)`, data: [], color: customColors.shortHigh, border: 2 }
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
            pointStyle: (context) => {
                const r = context.raw?._raw;
                const vol = context.raw?.y || 0;
                return (whaleMeta[r?.address]?.displayName || (minBtcVol > 0 && vol >= minBtcVol)) ? 'star' : 'circle';
            }
        }));

        localScales = {
            x: { type: 'linear', min: Math.max(parseFloat(document.getElementById('minEntryCcy')?.value || 0), 0) },
            y: { type: 'linear', min: 0 }
        };
    }

    if (canUpdateOnly) {
        scatterChart.data.datasets = datasets;
        scatterChart.options.scales.x = { ...scatterChart.options.scales.x, ...localScales.x };
        scatterChart.options.scales.y = { ...scatterChart.options.scales.y, ...localScales.y };
        if (chartType === 'bubble' || chartMode === 'lines') {
            scatterChart.options.plugins.btcPriceLabel = { price: refPrice, text: `BTC: $${refPrice.toLocaleString()}` };
        }
        scatterChart.update('none');
        return scatterChart;
    }

    if (scatterChart) scatterChart.destroy();

    const sym = getShowSymbols() ? (CURRENCY_META[activeEntryCcy || 'USD']?.symbol || '$') : '';
    const entryLabel = `Entry Price (${activeEntryCcy || 'USD'})`;

    scatterChart = new Chart(ctx, {
        type: chartType,
        data: { datasets },
        options: {
            ...chartOptions,
            indexAxis: localIndexAxis,
            plugins: {
                ...chartOptions.plugins,
                legend: { display: chartMode !== 'lines' },
                tooltip: {
                    ...chartOptions.plugins.tooltip,
                    callbacks: {
                        title: (items) => {
                            if (chartMode === 'column') return 'Position Count';
                            const r = items[0].raw?._raw || items[0].dataset._raw;
                            if (!r) return 'Unknown';
                            const disp = whaleMeta[r.address]?.displayName;
                            return `${r.coin} ${r.side === 'long' ? '▲' : '▼'}${disp ? ` (${disp})` : ''}`;
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
                    ...originalZoomConfig,
                    onZoomComplete: ({ chart }) => { chart.isZoomed = true; saveSettings(); },
                    onZoomStart: ({ chart }) => { chart.isZoomed = false; }
                }
            },
            scales: localScales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid, chartPlugins.btcPriceLabel]
    });

    if (getSavedScatterState()) {
        const s = getSavedScatterState();
        scatterChart.isZoomed = true;
        scatterChart.scales.x.min = s.x.min; scatterChart.scales.x.max = s.x.max;
        scatterChart.scales.y.min = s.y.min; scatterChart.scales.y.max = s.y.max;
        scatterChart.update('none');
    }

    return scatterChart;
}

export function getScatterChart() {
    return scatterChart;
}

export function setScatterChart(chart) {
    scatterChart = chart;
}

// Enable resizing for scatter chart
enableChartScaleResizing('scatterChart', () => scatterChart);

// Helper function
function getCorrelatedPrice(row, rawPrice, activeEntryCurrency, currentPrices) {
    const targetCcy = activeEntryCurrency || 'USD';
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || 0);
    const fxRates = getFxRates();

    let correlatedVal = rawPrice;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = rawPrice;
    }

    if (targetCcy === 'USD') {
        return correlatedVal;
    }

    if (targetCcy === 'BTC') {
        return correlatedVal;
    }

    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
}
