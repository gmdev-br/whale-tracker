// ═════════════════════════════════════════════════════════
// LIQUID GLASS — Liquidation Chart Configuration
// ═════════════════════════════════════════════════════════

import { saveSettings } from '../storage/settings.js';

// Chart.js plugins and configurations for liquidation chart
export const liqChartOptions = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            labels: {
                color: '#e2e8f4',
                font: { size: 12 }
            }
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
            // backdropFilter removed for performance
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            callbacks: {
                label: function (context) {
                    if (context.chart.config.type === 'bar') {
                        return `Count: ${context.parsed.y}`;
                    }
                    const r = context.raw._raw;
                    return [
                        `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`,
                        `Liq Price: ${context.parsed.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        `Size: ${Math.abs(r.szi).toFixed(4)}`,
                        `Value: $${r.positionValue.toLocaleString()}`
                    ];
                }
            }
        },
        annotation: {
            annotations: {}
        },
        zoom: {
            pan: {
                enabled: true,
                mode: 'xy',
                modifierKey: null,
                onPan: ({ chart }) => {
                    chart.isZoomed = true;
                    saveSettings();
                }
            },
            zoom: {
                wheel: { enabled: true, modifierKey: 'ctrl' },
                drag: { enabled: true, modifierKey: 'shift' },
                pinch: { enabled: true },
                mode: 'xy',
                onZoom: ({ chart }) => {
                    chart.isZoomed = true;
                    saveSettings();
                }
            }
        }
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
