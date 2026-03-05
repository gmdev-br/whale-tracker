// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — ECharts Horizontal Bar Chart
// Gráfico de barras horizontais para dados da Tabela 1 (Agregação)
// ═══════════════════════════════════════════════════════════

import {
    getDisplayedRows, getCurrentPrices, getActiveEntryCurrency,
    getFxRates, getAggInterval, getLiquidationMinPriceFull,
    getLiquidationMaxPriceFull, getLiquidationZoneColors, getShowLiquidationSymbols
} from '../state.js';
import { getCorrelatedEntry, getCorrelatedPrice } from '../utils/currency.js';
import { CURRENCY_META } from '../config.js';

// ECharts instance
let horizontalBarChart = null;
let lastDataHash = null;

// ═══════════════════════════════════════════════════════════
// ZOOM STATE MANAGEMENT - INFINITE ZOOM
// ═══════════════════════════════════════════════════════════

const ZOOM_CONFIG = {
    MIN_BARS: 1,            // Maximum zoom - pode ver apenas 1 barra
    MAX_BARS: Infinity,     // Minimum zoom - pode ver TODAS as barras
    DEFAULT_BARS: 20,       // Default view
    STEP_BARS: 3,           // Bars changed per button click
    ANIMATION_DURATION: 250, // Smooth transition duration
    WHEEL_SENSITIVITY: 0.15, // Sensitivity for smooth wheel zoom (0-1)
    WHEEL_DEBOUNCE: 16,     // ms - roughly 60fps for smooth zoom
    PINCH_SENSITIVITY: 1.5, // Sensitivity for pinch zoom
    DOUBLE_CLICK_ZOOM: 0.5  // Zoom factor for double-click (0.5 = half the bars)
};

// Current zoom state - preserved during data updates
let currentZoomState = {
    visibleBars: ZOOM_CONFIG.DEFAULT_BARS,
    centerIndex: null,      // null = centered on BTC price
    isUserZoom: false,      // true if user manually zoomed
    isAnimating: false      // prevents zoom conflicts during animation
};

// Mouse wheel zoom state
let isCtrlPressed = false;
let wheelDebounceTimer = null;
let lastWheelTime = 0;

// Touch/pinch state
let touchState = {
    isPinching: false,
    initialDistance: 0,
    initialZoomBars: 20,
    lastTouchTime: 0,
    lastTapTime: 0,
    tapCount: 0
};

// Smooth zoom accumulator for wheel events
let wheelZoomAccumulator = 0;

/**
 * Formata valores em formato compacto (K, M, B)
 */
function fmtCompact(val, showSymbol = true) {
    if (val === 0) return showSymbol ? '$0' : '0';
    const sym = showSymbol ? '$' : '';
    if (val >= 1000000000) return sym + (val / 1000000000).toFixed(2) + 'B';
    if (val >= 1000000) return sym + (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return sym + (val / 1000).toFixed(2) + 'K';
    return sym + val.toFixed(2);
}

/**
 * Calcula as bands (faixas) de agregação - mesma lógica da tabela 1
 */
function buildBandsForChart(rows, currentPrices, fxRates, activeEntryCurrency, bandSize, minPriceSetting, maxPriceSetting) {
    const bands = {};
    let totalLongNotional = 0;
    let totalShortNotional = 0;

    const MAX_REASONABLE_PRICE = 10000000;
    const hasUserMinPrice = minPriceSetting > 0;
    const hasUserMaxPrice = maxPriceSetting > 0;
    const hasValidUserRange = hasUserMinPrice && hasUserMaxPrice && minPriceSetting < maxPriceSetting;

    let minEntryBand = Infinity;
    let maxEntryBand = -Infinity;

    if (hasValidUserRange) {
        minEntryBand = minPriceSetting;
        maxEntryBand = maxPriceSetting;
    } else {
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const entryCcy = r._entCcy != null ? r._entCcy : getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);

            if (entryCcy != null && entryCcy > 0 && entryCcy <= MAX_REASONABLE_PRICE) {
                if (entryCcy < minEntryBand) minEntryBand = entryCcy;
                if (entryCcy > maxEntryBand) maxEntryBand = entryCcy;
            }

            const liqPxCcy = r._liqPxCcy != null ? r._liqPxCcy : (r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0);
            if (liqPxCcy != null && liqPxCcy > 0 && liqPxCcy <= MAX_REASONABLE_PRICE) {
                if (liqPxCcy < minEntryBand) minEntryBand = liqPxCcy;
                if (liqPxCcy > maxEntryBand) maxEntryBand = liqPxCcy;
            }
        }
    }

    if (minEntryBand !== Infinity && minEntryBand !== -Infinity) {
        minEntryBand = Math.floor(minEntryBand / bandSize) * bandSize;
        maxEntryBand = Math.floor(maxEntryBand / bandSize) * bandSize;
    } else {
        return { bands: [], totalLongNotional: 0, totalShortNotional: 0 };
    }

    // NOTA: Removido o truncamento de bands para exibir TODOS os dados da Tabela 1
    // O usuário poderá navegar através do scroll/dataZoom
    const totalBandsCount = Math.floor((maxEntryBand - minEntryBand) / bandSize) + 1; // eslint-disable-line no-unused-vars

    const isInUserRange = (price) => {
        if (!hasValidUserRange) return true;
        return price >= minPriceSetting && price <= maxPriceSetting;
    };

    // Pre-populate bands
    for (let b = minEntryBand; b <= maxEntryBand; b += bandSize) {
        bands[b] = {
            faixaDe: b,
            faixaAte: b + bandSize,
            qtdLong: 0,
            notionalLong: 0,
            qtdShort: 0,
            notionalShort: 0,
            liqVolLong: 0,
            liqVolShort: 0,
            ativosLong: new Set(),
            ativosShort: new Set(),
            isEmpty: true
        };
    }

    // Populate data
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const entryCcy = r._entCcy != null ? r._entCcy : getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        const val = r.positionValue;
        const liqPriceCorr = r._liqPxCcy != null ? r._liqPxCcy : (r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0);

        if (entryCcy != null && entryCcy > 0 && isInUserRange(entryCcy)) {
            const bandKey = Math.floor(entryCcy / bandSize) * bandSize;
            const b = bands[bandKey];
            if (b) {
                b.isEmpty = false;
                if (r.side === 'long') {
                    b.qtdLong++;
                    b.notionalLong += val;
                    b.ativosLong.add(r.coin);
                    totalLongNotional += val;
                } else {
                    b.qtdShort++;
                    b.notionalShort += val;
                    b.ativosShort.add(r.coin);
                    totalShortNotional += val;
                }
            }
        }

        if (liqPriceCorr != null && liqPriceCorr > 0 && isInUserRange(liqPriceCorr)) {
            const liqBandKey = Math.floor(liqPriceCorr / bandSize) * bandSize;
            const lb = bands[liqBandKey];
            if (lb) {
                lb.isEmpty = false;
                if (r.side === 'long') lb.liqVolLong += val;
                else lb.liqVolShort += val;
            }
        }
    }

    // Convert to array and filter empty
    const bandArray = Object.values(bands).filter(b => !b.isEmpty);

    // Sort by faixaDe
    bandArray.sort((a, b) => a.faixaDe - b.faixaDe);

    return { bands: bandArray, totalLongNotional, totalShortNotional };
}

/**
 * Renderiza o gráfico de barras horizontais
 */
export function renderHorizontalBarChart(force = false) {
    const chartDom = document.getElementById('horizontalBarChart');
    if (!chartDom) return;

    // Check visibility
    const section = document.getElementById('horizontalBarSectionWrapper');
    if (section && section.classList.contains('collapsed') && !force) {
        return;
    }

    // Get data
    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const bandSize = Math.max(1, getAggInterval());
    const minPrice = getLiquidationMinPriceFull();
    const maxPrice = getLiquidationMaxPriceFull();
    const aggZoneColors = getLiquidationZoneColors();
    const showSymbols = getShowLiquidationSymbols();

    if (!rows || rows.length === 0) {
        if (horizontalBarChart) {
            horizontalBarChart.dispose();
            horizontalBarChart = null;
        }
        return;
    }

    // Build bands
    const { bands } = buildBandsForChart(rows, currentPrices, fxRates, activeEntryCurrency, bandSize, minPrice, maxPrice);

    if (bands.length === 0) {
        if (horizontalBarChart) {
            horizontalBarChart.dispose();
            horizontalBarChart = null;
        }
        return;
    }

    // Check if data changed
    const dataHash = `${bands.length}-${bands[0].faixaDe}-${bands[bands.length - 1].faixaAte}`;
    if (!force && dataHash === lastDataHash && horizontalBarChart) {
        return;
    }
    lastDataHash = dataHash;

    // Prepare data for chart
    const categories = bands.map(b => `$${b.faixaDe.toLocaleString()}-$${b.faixaAte.toLocaleString()}`);
    const longData = bands.map(b => ({
        value: b.notionalLong,
        qtd: b.qtdLong,
        ativos: Array.from(b.ativosLong).join(', '),
        liqVol: b.liqVolLong
    }));
    const shortData = bands.map(b => ({
        value: -b.notionalShort, // Negative for left side
        qtd: b.qtdShort,
        ativos: Array.from(b.ativosShort).join(', '),
        liqVol: b.liqVolShort
    }));

    // Get BTC price for current range highlighting
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;
    const currentBandIndex = bands.findIndex(b => btcPrice >= b.faixaDe && btcPrice < b.faixaAte);

    // Calculate dynamic height based on data count - cada band precisa de ~30px de altura
    const totalBands = bands.length;
    const BAR_HEIGHT = 30; // altura mínima por barra em pixels
    const MIN_CHART_HEIGHT = 500; // altura mínima do gráfico
    const dynamicChartHeight = Math.max(MIN_CHART_HEIGHT, totalBands * BAR_HEIGHT);

    // Apply dynamic height to container
    chartDom.style.height = `${dynamicChartHeight}px`;

    // Initialize ECharts if needed
    if (!horizontalBarChart) {
        horizontalBarChart = echarts.init(chartDom, 'dark', {
            renderer: 'canvas'
        });

        // Responsive resize
        window.addEventListener('resize', () => {
            horizontalBarChart && horizontalBarChart.resize();
        });

        // Attach dataZoom event listener for syncing zoom state
        horizontalBarChart.on('dataZoom', function(params) {
            // Debounce to avoid excessive updates
            if (wheelDebounceTimer) {
                clearTimeout(wheelDebounceTimer);
            }
            wheelDebounceTimer = setTimeout(() => {
                syncZoomStateFromChart();
            }, 100);
        });

        // Initialize zoom controls when chart is first created
        initZoomControls();
    } else {
        // Resize chart to new dynamic height
        horizontalBarChart.resize();
    }

    // Configurar dataZoom para mostrar TODOS os dados - range inicial mostra a área do BTC
    // mas permite rolar para ver todas as faixas de preço
    // Usar valor absoluto (número de barras) em vez de porcentagem para zoom mais preciso
    let startValue = 0;
    let endValue = totalBands - 1;

    // Determine visible bars count based on zoom state
    let visibleBars = currentZoomState.isUserZoom
        ? currentZoomState.visibleBars
        : ZOOM_CONFIG.DEFAULT_BARS;
    visibleBars = Math.min(visibleBars, totalBands);

    // Calculate center index (BTC price or preserved position)
    let centerIdx = currentZoomState.centerIndex !== null
        ? currentZoomState.centerIndex
        : (currentBandIndex >= 0 ? currentBandIndex : Math.floor(totalBands / 2));

    // Calculate range around center
    const halfVisible = Math.floor(visibleBars / 2);
    let startIndex = Math.max(0, centerIdx - halfVisible);
    let endIndex = Math.min(totalBands - 1, startIndex + visibleBars - 1);

    // Adjust if we're near the boundaries
    if (endIndex - startIndex + 1 < visibleBars) {
        startIndex = Math.max(0, endIndex - visibleBars + 1);
    }

    startValue = startIndex;
    endValue = endIndex;

    // Chart options
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },
            backgroundColor: 'rgba(7, 12, 26, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            textStyle: {
                color: '#e2e8f4',
                fontSize: 12
            },
            padding: 12,
            formatter: function (params) {
                const dataIndex = params[0].dataIndex;
                const band = bands[dataIndex];
                const isCurrentRange = dataIndex === currentBandIndex;

                let html = `<div style="font-weight:600;margin-bottom:8px;">`;
                html += `Faixa: $${band.faixaDe.toLocaleString()} - $${band.faixaAte.toLocaleString()}`;
                if (isCurrentRange) html += ' <span style="color:#facc15;">◄ BTC Atual</span>';
                html += `</div>`;

                html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;

                // Long side
                html += `<div style="color:#22c55e;">`;
                html += `<div style="font-weight:600;margin-bottom:4px;">📈 LONG</div>`;
                html += `<div>Notional: ${fmtCompact(band.notionalLong)}</div>`;
                html += `<div>Posições: ${band.qtdLong}</div>`;
                if (band.liqVolLong > 0) html += `<div>Liq Vol: ${fmtCompact(band.liqVolLong)}</div>`;
                if (band.ativosLong.size > 0) html += `<div style="font-size:10px;opacity:0.8;margin-top:4px;">${Array.from(band.ativosLong).slice(0, 5).join(', ')}${band.ativosLong.size > 5 ? '...' : ''}</div>`;
                html += `</div>`;

                // Short side
                html += `<div style="color:#ef4444;">`;
                html += `<div style="font-weight:600;margin-bottom:4px;">📉 SHORT</div>`;
                html += `<div>Notional: ${fmtCompact(band.notionalShort)}</div>`;
                html += `<div>Posições: ${band.qtdShort}</div>`;
                if (band.liqVolShort > 0) html += `<div>Liq Vol: ${fmtCompact(band.liqVolShort)}</div>`;
                if (band.ativosShort.size > 0) html += `<div style="font-size:10px;opacity:0.8;margin-top:4px;">${Array.from(band.ativosShort).slice(0, 5).join(', ')}${band.ativosShort.size > 5 ? '...' : ''}</div>`;
                html += `</div>`;

                html += `</div>`;

                return html;
            }
        },
        legend: {
            data: ['Long', 'Short'],
            textStyle: {
                color: '#9ca3af'
            },
            top: 0
        },
        grid: {
            left: '3%',
            right: '60', // espaço fixo para o slider do dataZoom
            bottom: 40,
            top: 50,
            containLabel: true
        },
        // DataZoom para scroll vertical - permite navegar por TODAS as faixas de preço
        // Usando value-based zoom (startValue/endValue) para controle preciso de barras visíveis
        dataZoom: [
            {
                type: 'slider',
                yAxisIndex: 0,
                show: true,
                right: 10,
                width: 20,
                top: 60,
                bottom: 50,
                startValue: startValue,
                endValue: endValue,
                minValueSpan: 1,        // mínimo 1 barra visível (máximo zoom ilimitado)
                maxValueSpan: totalBands, // máximo: todas as barras visíveis (mínimo zoom ilimitado)
                handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
                handleSize: '80%',
                handleStyle: {
                    color: '#6366f1',
                    shadowBlur: 3,
                    shadowColor: 'rgba(0, 0, 0, 0.6)',
                    shadowOffsetX: 2,
                    shadowOffsetY: 2
                },
                textStyle: {
                    color: '#9ca3af'
                },
                borderColor: 'rgba(255, 255, 255, 0.1)',
                fillerColor: 'rgba(99, 102, 241, 0.3)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                dataBackground: {
                    lineStyle: {
                        color: 'rgba(255, 255, 255, 0.2)'
                    },
                    areaStyle: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                selectedDataBackground: {
                    lineStyle: {
                        color: '#6366f1'
                    },
                    areaStyle: {
                        color: '#6366f1'
                    }
                },
                // Smooth animation for zoom transitions
                animation: true,
                animationDuration: ZOOM_CONFIG.ANIMATION_DURATION
            },
            {
                type: 'inside',
                yAxisIndex: 0,
                zoomOnMouseWheel: 'ctrl',  // só dá zoom com Ctrl+Scroll
                moveOnMouseWheel: true,    // scroll normal move a visualização
                moveOnMouseMove: false,    // não move ao mover o mouse
                preventDefaultMouseMove: true,
                // Zoom sensitivity
                zoomLock: false,
                // Preserve range ratio during zoom
                rangeMode: ['value', 'value']
            }
        ],
        xAxis: {
            type: 'value',
            axisLabel: {
                formatter: function (value) {
                    return fmtCompact(Math.abs(value), showSymbols);
                },
                color: '#9ca3af'
            },
            splitLine: {
                lineStyle: {
                    color: 'rgba(255, 255, 255, 0.06)'
                }
            },
            axisLine: {
                lineStyle: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            }
        },
        yAxis: {
            type: 'category',
            data: categories,
            axisLabel: {
                color: function (value, index) {
                    return index === currentBandIndex ? '#facc15' : '#9ca3af';
                },
                fontWeight: function (value, index) {
                    return index === currentBandIndex ? 'bold' : 'normal';
                },
                formatter: function (value, index) {
                    if (index === currentBandIndex) return '● ' + value;
                    return value;
                }
            },
            axisLine: {
                lineStyle: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            }
        },
        series: [
            {
                name: 'Long',
                type: 'bar',
                stack: 'total',
                data: longData.map(d => d.value),
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: aggZoneColors?.buyNormal || '#4ade80' },
                        { offset: 1, color: aggZoneColors?.buyStrong || '#22c55e' }
                    ]),
                    borderRadius: [0, 4, 4, 0]
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(34, 197, 94, 0.5)'
                    }
                }
            },
            {
                name: 'Short',
                type: 'bar',
                stack: 'total',
                data: shortData.map(d => d.value),
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: aggZoneColors?.sellStrong || '#ef4444' },
                        { offset: 1, color: aggZoneColors?.sellNormal || '#f87171' }
                    ]),
                    borderRadius: [4, 0, 0, 4]
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(239, 68, 68, 0.5)'
                    }
                }
            }
        ]
    };

    horizontalBarChart.setOption(option);

    // Update zoom level indicator
    updateZoomLevelIndicator();
}

/**
 * Retorna a instância do gráfico
 */
export function getHorizontalBarChart() {
    return horizontalBarChart;
}

/**
 * Destrói o gráfico
 */
export function destroyHorizontalBarChart() {
    if (horizontalBarChart) {
        horizontalBarChart.dispose();
        horizontalBarChart = null;
        lastDataHash = null;
    }
    // Reset zoom state
    currentZoomState = {
        visibleBars: ZOOM_CONFIG.DEFAULT_BARS,
        centerIndex: null,
        isUserZoom: false,
        isAnimating: false
    };
}

/**
 * Atualiza o gráfico (wrapper para facilitar chamadas externas)
 */
export function updateHorizontalBarChart(force = false) {
    renderHorizontalBarChart(force);
}

// ═══════════════════════════════════════════════════════════
// ZOOM CONTROLS
// ═══════════════════════════════════════════════════════════

/**
 * Atualiza o indicador de nível de zoom na UI
 * Mostra: barras visíveis / total + porcentagem de zoom
 */
function updateZoomLevelIndicator() {
    const indicator = document.getElementById('hbZoomLevel');
    if (indicator) {
        const totalBars = getTotalBarsCount();
        const visibleBars = currentZoomState.visibleBars;

        // Calculate zoom percentage (100% = all bars visible, higher = zoomed in)
        const zoomPercent = totalBars > 0 ? Math.round((totalBars / visibleBars) * 100) : 100;

        // Format with visual indicator
        let zoomIcon = '🔍';
        if (zoomPercent >= 500) zoomIcon = '🔎'; // High zoom
        else if (zoomPercent <= 105) zoomIcon = '📊'; // All data visible

        indicator.textContent = `${visibleBars}/${totalBars} ${zoomIcon} ${zoomPercent}%`;

        // Add tooltip with instructions
        indicator.title = `Zoom: ${zoomPercent}%\n${visibleBars} de ${totalBars} faixas visíveis\n\nDicas:\n• Ctrl+Scroll: Zoom suave\n• Duplo-clique: Zoom na barra\n• Pinch: Zoom touch`;
    }
}

/**
 * Retorna o número total de barras no gráfico
 */
function getTotalBarsCount() {
    if (!horizontalBarChart) return 0;
    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    return yAxisData.length || 0;
}

/**
 * Sincroniza o estado atual do zoom a partir do gráfico
 * Chamado quando o usuário interage com o dataZoom (slider ou scroll)
 */
function syncZoomStateFromChart() {
    if (!horizontalBarChart) return;

    const option = horizontalBarChart.getOption();
    if (!option.dataZoom || !option.dataZoom[0]) return;

    const dz = option.dataZoom[0];
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    // Calculate visible bars from startValue/endValue
    let startVal = dz.startValue !== undefined ? dz.startValue : 0;
    let endVal = dz.endValue !== undefined ? dz.endValue : totalBands - 1;

    // Handle percentage fallback
    if (dz.start !== undefined && dz.end !== undefined && dz.startValue === undefined) {
        startVal = Math.floor((dz.start / 100) * totalBands);
        endVal = Math.min(totalBands - 1, Math.ceil((dz.end / 100) * totalBands));
    }

    // Garante valores válidos
    startVal = Math.max(0, startVal);
    endVal = Math.min(totalBands - 1, endVal);

    // Calcula barras visíveis - se o range cobrir todas, mostra o total
    let visibleBars = endVal - startVal + 1;
    visibleBars = Math.max(1, Math.min(totalBands, visibleBars));

    // Se estiver mostrando todas ou quase todas (dentro de uma margem), considera como total
    if (visibleBars >= totalBands - 1) {
        visibleBars = totalBands;
    }

    const centerIdx = Math.floor((startVal + endVal) / 2);

    // Update state
    currentZoomState.visibleBars = visibleBars;
    currentZoomState.centerIndex = centerIdx;
    currentZoomState.isUserZoom = true;

    // Update UI indicator
    updateZoomLevelIndicator();
}

/**
 * Aplica zoom no gráfico baseado no número de barras visíveis desejado
 * Mantém o centro da visualização atual
 */
function applyZoom(visibleBars, centerIndex = null) {
    if (!horizontalBarChart) return;

    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    // Zoom ilimitado: garante apenas entre 1 e todas as barras
    let targetBars = Math.max(1, Math.min(totalBands, visibleBars));

    // Se quer mostrar todas as barras, mostra do início ao fim
    let startIndex, endIndex, centerIdx;

    if (targetBars >= totalBands) {
        // Mostrar todas as barras: range completo
        startIndex = 0;
        endIndex = totalBands - 1;
        centerIdx = Math.floor(totalBands / 2);
        targetBars = totalBands; // Garante que o estado reflete o total
    } else {
        // Determine center index
        centerIdx = centerIndex;
        if (centerIdx === null || centerIdx === undefined) {
            // Use current center from dataZoom
            const dz = option.dataZoom[0];
            if (dz && dz.startValue !== undefined && dz.endValue !== undefined) {
                centerIdx = Math.floor((dz.startValue + dz.endValue) / 2);
            } else {
                centerIdx = Math.floor(totalBands / 2);
            }
        }

        // Calculate range
        const halfVisible = Math.floor(targetBars / 2);
        startIndex = Math.max(0, centerIdx - halfVisible);
        endIndex = Math.min(totalBands - 1, startIndex + targetBars - 1);

        // Adjust if near boundaries
        if (endIndex - startIndex + 1 < targetBars) {
            startIndex = Math.max(0, endIndex - targetBars + 1);
        }
    }

    // Update state
    currentZoomState.visibleBars = targetBars;
    currentZoomState.centerIndex = centerIdx;
    currentZoomState.isUserZoom = true;

    // Update UI indicator
    updateZoomLevelIndicator();

    // Apply with smooth animation
    horizontalBarChart.dispatchAction({
        type: 'dataZoom',
        startValue: startIndex,
        endValue: endIndex,
        animation: {
            duration: ZOOM_CONFIG.ANIMATION_DURATION,
            easing: 'cubicOut'
        }
    });
}

/**
 * Aplica zoom no gráfico (aumentar - mostra menos barras)
 * Usa smooth zoom para transição suave
 */
export function zoomIn() {
    if (!horizontalBarChart) return;

    syncZoomStateFromChart();

    // Se já estiver no mínimo (1 barra), não faz nada
    if (currentZoomState.visibleBars <= 1) {
        return;
    }

    // Zoom máximo ilimitado: pode ir até 1 barra
    const newVisibleBars = Math.max(
        1,
        currentZoomState.visibleBars - ZOOM_CONFIG.STEP_BARS
    );

    // Só aplica se realmente houver mudança
    if (newVisibleBars !== currentZoomState.visibleBars) {
        applySmoothZoom(newVisibleBars, currentZoomState.centerIndex);
    }
}

/**
 * Aplica zoom no gráfico (diminuir - mostra mais barras)
 * Usa smooth zoom para transição suave
 */
export function zoomOut() {
    if (!horizontalBarChart) return;

    syncZoomStateFromChart();

    // Zoom mínimo ilimitado: pode ver TODAS as barras
    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    // Se já estiver mostrando todas as barras, não faz nada
    if (currentZoomState.visibleBars >= totalBands) {
        return;
    }

    const newVisibleBars = Math.min(
        totalBands,  // permite ver todas as barras
        currentZoomState.visibleBars + ZOOM_CONFIG.STEP_BARS
    );

    // Só aplica se realmente houver mudança no número de barras visíveis
    if (newVisibleBars !== currentZoomState.visibleBars) {
        applySmoothZoom(newVisibleBars, currentZoomState.centerIndex);
    }
}

/**
 * Reseta o zoom para a visualização padrão (centrada no preço atual do BTC)
 * Usa smooth zoom para transição suave
 */
export function zoomReset() {
    if (!horizontalBarChart) return;

    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    // Reset state
    currentZoomState.visibleBars = Math.min(ZOOM_CONFIG.DEFAULT_BARS, totalBands);
    currentZoomState.isUserZoom = false;

    // Get current prices from state
    const currentPrices = getCurrentPrices();
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;

    // Find current BTC price band
    let currentBandIndex = -1;
    for (let i = 0; i < yAxisData.length; i++) {
        const label = yAxisData[i];
        const match = label.match(/\$([\d,]+)-\$([\d,]+)/);
        if (match) {
            const faixaDe = parseInt(match[1].replace(/,/g, ''));
            const faixaAte = parseInt(match[2].replace(/,/g, ''));
            if (btcPrice >= faixaDe && btcPrice < faixaAte) {
                currentBandIndex = i;
                break;
            }
        }
    }

    // Use BTC band as center, or middle if not found
    const centerIdx = currentBandIndex >= 0 ? currentBandIndex : Math.floor(totalBands / 2);
    currentZoomState.centerIndex = centerIdx;

    applySmoothZoom(currentZoomState.visibleBars, centerIdx);
}

/**
 * Handler para evento de wheel no container do gráfico
 * Infinite smooth zoom com Ctrl+Scroll
 *
 * Características:
 * - Zoom suave e contínuo (não por steps)
 * - Acumulador de delta para precisão
 * - 60fps de taxa de atualização
 */
function handleChartWheel(e) {
    if (!horizontalBarChart) return;

    const isZoomModifier = e.ctrlKey || e.metaKey;
    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    if (isZoomModifier) {
        // Ctrl+Scroll: ZOOM INFINITO SUAVE
        e.preventDefault();
        e.stopPropagation();

        const now = performance.now();
        const delta = e.deltaY;

        // Accumulate wheel delta for smooth zoom
        wheelZoomAccumulator += delta * ZOOM_CONFIG.WHEEL_SENSITIVITY;

        // Check if enough time has passed (60fps = ~16ms)
        if (now - lastWheelTime < ZOOM_CONFIG.WHEEL_DEBOUNCE) {
            return;
        }
        lastWheelTime = now;

        // Calculate zoom change based on accumulated delta
        const currentBars = currentZoomState.visibleBars;
        let zoomFactor = 1 + (Math.abs(wheelZoomAccumulator) / 100);

        let newVisibleBars;
        if (delta > 0) {
            // Zoom out (show more bars) - multiply
            newVisibleBars = Math.min(totalBands, Math.ceil(currentBars * zoomFactor));
        } else {
            // Zoom in (show fewer bars) - divide
            newVisibleBars = Math.max(1, Math.floor(currentBars / zoomFactor));
        }

        // Reset accumulator
        wheelZoomAccumulator = 0;

        // Only apply if there's a meaningful change
        if (newVisibleBars !== currentBars) {
            applySmoothZoom(newVisibleBars, currentZoomState.centerIndex);
        }
    } else {
        // Scroll sem Ctrl: navegação (move)
        // Quando todas as barras cabem na tela, deixa o scroll da página acontecer
        if (currentZoomState.visibleBars >= totalBands) {
            return;
        }
        // O dataZoom 'inside' já cuida da navegação
    }
}

/**
 * Aplica zoom suave com transição animada
 * Versão otimizada para zoom contínuo (wheel/pinch)
 */
function applySmoothZoom(visibleBars, centerIndex = null) {
    if (!horizontalBarChart || currentZoomState.isAnimating) return;

    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis && option.yAxis[0] ? option.yAxis[0].data : [];
    const totalBands = yAxisData.length || 1;

    // Clamp values
    let targetBars = Math.max(1, Math.min(totalBands, visibleBars));

    // Determine center index
    let centerIdx = centerIndex;
    if (centerIdx === null || centerIdx === undefined) {
        const dz = option.dataZoom?.[0];
        if (dz && dz.startValue !== undefined && dz.endValue !== undefined) {
            centerIdx = Math.floor((dz.startValue + dz.endValue) / 2);
        } else {
            centerIdx = Math.floor(totalBands / 2);
        }
    }

    // Calculate range
    const halfVisible = Math.floor(targetBars / 2);
    let startIndex = Math.max(0, centerIdx - halfVisible);
    let endIndex = Math.min(totalBands - 1, startIndex + targetBars - 1);

    // Adjust if near boundaries
    if (endIndex - startIndex + 1 < targetBars) {
        startIndex = Math.max(0, endIndex - targetBars + 1);
    }

    // Update state
    currentZoomState.visibleBars = targetBars;
    currentZoomState.centerIndex = centerIdx;
    currentZoomState.isUserZoom = true;

    // Update UI
    updateZoomLevelIndicator();

    // Apply zoom with animation
    currentZoomState.isAnimating = true;
    horizontalBarChart.dispatchAction({
        type: 'dataZoom',
        startValue: startIndex,
        endValue: endIndex,
        animation: {
            duration: ZOOM_CONFIG.ANIMATION_DURATION,
            easing: 'cubicOut'
        }
    });

    // Reset animation flag
    setTimeout(() => {
        currentZoomState.isAnimating = false;
    }, ZOOM_CONFIG.ANIMATION_DURATION);
}

/**
 * Handler para double-click no gráfico
 * Zoom in na posição clicada
 */
function handleChartDoubleClick(e) {
    if (!horizontalBarChart) return;

    const chartDom = document.getElementById('horizontalBarChart');
    if (!chartDom) return;

    const rect = chartDom.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const option = horizontalBarChart.getOption();
    const yAxisData = option.yAxis?.[0]?.data || [];
    const totalBands = yAxisData.length || 1;

    // Convert Y position to data index
    const grid = option.grid?.[0] || { top: 50, bottom: 40 };
    const chartHeight = rect.height - grid.top - grid.bottom;
    const relativeY = y - grid.top;

    // Calculate which bar was clicked (approximate)
    const currentRange = currentZoomState.visibleBars;
    const dz = option.dataZoom?.[0];
    let startVal = dz?.startValue || 0;
    let endVal = dz?.endValue || (totalBands - 1);

    const barHeight = chartHeight / (endVal - startVal + 1);
    const clickedBarOffset = Math.floor(relativeY / barHeight);
    const clickedIndex = startVal + clickedBarOffset;

    if (clickedIndex >= 0 && clickedIndex < totalBands) {
        // Zoom in centered on clicked bar
        const newVisibleBars = Math.max(1, Math.floor(currentRange * ZOOM_CONFIG.DOUBLE_CLICK_ZOOM));
        applySmoothZoom(newVisibleBars, clickedIndex);
    }
}

/**
 * Handler para eventos touch (pinch-to-zoom)
 */
function handleTouchStart(e) {
    if (e.touches.length === 2) {
        // Start pinch
        touchState.isPinching = true;
        touchState.initialDistance = getTouchDistance(e.touches);
        touchState.initialZoomBars = currentZoomState.visibleBars;
        e.preventDefault();
    }

    // Handle double-tap detection
    const now = Date.now();
    const timeSinceLastTap = now - touchState.lastTapTime;

    if (timeSinceLastTap < 300) {
        touchState.tapCount++;
        if (touchState.tapCount === 2) {
            // Double-tap: zoom in at tap location
            const touch = e.touches[0];
            const simulatedEvent = { clientX: touch.clientX, clientY: touch.clientY };
            handleChartDoubleClick(simulatedEvent);
            touchState.tapCount = 0;
        }
    } else {
        touchState.tapCount = 1;
    }
    touchState.lastTapTime = now;
}

function handleTouchMove(e) {
    if (touchState.isPinching && e.touches.length === 2) {
        e.preventDefault();

        const currentDistance = getTouchDistance(e.touches);
        const scale = currentDistance / touchState.initialDistance;

        // Apply pinch zoom
        const option = horizontalBarChart.getOption();
        const yAxisData = option.yAxis?.[0]?.data || [];
        const totalBands = yAxisData.length || 1;

        // Calculate new visible bars based on pinch scale
        let newVisibleBars;
        if (scale > 1) {
            // Pinch out = zoom out (more bars)
            newVisibleBars = Math.min(totalBands, Math.ceil(touchState.initialZoomBars * scale * ZOOM_CONFIG.PINCH_SENSITIVITY));
        } else {
            // Pinch in = zoom in (fewer bars)
            newVisibleBars = Math.max(1, Math.floor(touchState.initialZoomBars * scale / ZOOM_CONFIG.PINCH_SENSITIVITY));
        }

        // Debounce for performance
        if (!currentZoomState.isAnimating && newVisibleBars !== currentZoomState.visibleBars) {
            applySmoothZoom(newVisibleBars, currentZoomState.centerIndex);
        }
    }
}

function handleTouchEnd(e) {
    if (touchState.isPinching) {
        touchState.isPinching = false;
        touchState.initialDistance = 0;
    }
}

/**
 * Calcula distância entre dois toques
 */
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Handler para eventos de teclado (Ctrl pressionado/solto)
 */
function handleKeyDown(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlPressed = true;
    }
}

function handleKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlPressed = false;
    }
}

/**
 * Inicializa os event listeners dos controles de zoom
 * Suporta: botões, mouse wheel (Ctrl+scroll), double-click, pinch-to-zoom
 */
export function initZoomControls() {
    const zoomInBtn = document.getElementById('hbZoomIn');
    const zoomOutBtn = document.getElementById('hbZoomOut');
    const zoomResetBtn = document.getElementById('hbZoomReset');
    const chartDom = document.getElementById('horizontalBarChart');

    console.log('[initZoomControls] buttons found:', { zoomIn: !!zoomInBtn, zoomOut: !!zoomOutBtn, zoomReset: !!zoomResetBtn, chart: !!chartDom });

    // Button controls
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', zoomIn);
        console.log('[initZoomControls] zoomIn listener attached');
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', zoomOut);
        console.log('[initZoomControls] zoomOut listener attached');
    }
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', zoomReset);
        console.log('[initZoomControls] zoomReset listener attached');
    }

    // Mouse wheel zoom on chart container (smooth infinite zoom)
    if (chartDom) {
        chartDom.addEventListener('wheel', handleChartWheel, { passive: false });
        // Double-click to zoom
        chartDom.addEventListener('dblclick', handleChartDoubleClick);
        // Touch events for pinch-to-zoom
        chartDom.addEventListener('touchstart', handleTouchStart, { passive: false });
        chartDom.addEventListener('touchmove', handleTouchMove, { passive: false });
        chartDom.addEventListener('touchend', handleTouchEnd);
    }

    // Keyboard listeners for Ctrl key tracking
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // ECharts dataZoom event - sync state when user interacts with slider
    if (horizontalBarChart) {
        horizontalBarChart.on('dataZoom', function(params) {
            // Sync state after user interaction
            setTimeout(syncZoomStateFromChart, 50);
        });
    }
}

/**
 * Remove os event listeners dos controles de zoom
 */
export function destroyZoomControls() {
    const zoomInBtn = document.getElementById('hbZoomIn');
    const zoomOutBtn = document.getElementById('hbZoomOut');
    const zoomResetBtn = document.getElementById('hbZoomReset');
    const chartDom = document.getElementById('horizontalBarChart');

    if (zoomInBtn) {
        zoomInBtn.removeEventListener('click', zoomIn);
    }
    if (zoomOutBtn) {
        zoomOutBtn.removeEventListener('click', zoomOut);
    }
    if (zoomResetBtn) {
        zoomResetBtn.removeEventListener('click', zoomReset);
    }
    if (chartDom) {
        chartDom.removeEventListener('wheel', handleChartWheel);
        chartDom.removeEventListener('dblclick', handleChartDoubleClick);
        chartDom.removeEventListener('touchstart', handleTouchStart);
        chartDom.removeEventListener('touchmove', handleTouchMove);
        chartDom.removeEventListener('touchend', handleTouchEnd);
    }

    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);

    if (horizontalBarChart) {
        horizontalBarChart.off('dataZoom');
    }
}

/**
 * Retorna o estado atual do zoom (para debug ou uso externo)
 */
export function getZoomState() {
    return { ...currentZoomState };
}

/**
 * Define o estado do zoom (para restauração de estado salvo)
 */
export function setZoomState(state) {
    if (state) {
        currentZoomState = {
            visibleBars: state.visibleBars || ZOOM_CONFIG.DEFAULT_BARS,
            centerIndex: state.centerIndex,
            isUserZoom: state.isUserZoom || false
        };
    }
}