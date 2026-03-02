// ═══════════════════════════════════════════════════════
// LIQUID GLASS — Charts Configuration (Adapted for Current Project)
// ═══════════════════════════════════════════════════════════

// Import chart mechanics from adapted implementation
import {
    crosshairPlugin,
    btcPriceLabelPlugin,
    btcGridPlugin
} from './chart-mechanics-adapted.js';

import {
    originalZoomConfig,
    liqZoomConfig,
    originalScaleResizing,
    setupChartHeightResizing,
    resetScatterZoom,
    resetLiqZoom
} from './chart-mechanics-adapted.js';

// Chart.js plugins and configurations (Adapted)
export const chartPlugins = {
    crosshair: crosshairPlugin,
    btcPriceLabel: btcPriceLabelPlugin,
    btcGrid: btcGridPlugin
};

export const chartMechanics = {
    setupChartHeightResizing
};

export const chartOptions = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(7, 12, 26, 0.95)',
            titleColor: '#e2e8f4',
            titleFont: { size: 12, weight: '600' },
            bodyColor: '#e2e8f4',
            bodyFont: { size: 12 },
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 14,
            displayColors: false,
            cornerRadius: 8,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            callbacks: {
                label: function (context) {
                    return context.parsed.y !== undefined ?
                        `Value: ${context.parsed.y.toLocaleString()}` : '';
                }
            }
        },
        zoom: originalZoomConfig
    },
    scales: {
        x: {
            grid: {
                color: 'rgba(255, 255, 255, 0.06)',
                drawBorder: false
            },
            ticks: {
                color: '#9ca3af',
                font: {
                    size: 12,
                    family: 'Inter'
                }
            },
            min: 0
        },
        y: {
            grid: {
                color: 'rgba(255, 255, 255, 0.06)',
                drawBorder: false
            },
            ticks: {
                color: '#9ca3af',
                font: {
                    size: 12,
                    family: 'Inter'
                }
            },
            min: 0
        }
    }
};
