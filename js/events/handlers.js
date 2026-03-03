// ═════════════════════════════════════════════
// LIQUID GLASS — Events Handlers
// ═════════════════════════════════════════════

// Performance utilities
let debounceTimeouts = new Map();
let throttleLastRun = new Map();

/**
 * Debounce function to limit execution rate
 * @param {string} key - Unique identifier for the debounced function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 */
export function debounce(key, func, delay = 100) {
    return (...args) => {
        if (debounceTimeouts.has(key)) {
            clearTimeout(debounceTimeouts.get(key));
        }
        debounceTimeouts.set(key, setTimeout(() => {
            func(...args);
            debounceTimeouts.delete(key);
        }, delay));
    };
}

/**
 * Throttle function to limit execution rate
 * @param {string} key - Unique identifier for the throttled function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between executions in milliseconds
 */
export function throttle(key, func, limit = 100) {
    return (...args) => {
        const now = Date.now();
        const lastRun = throttleLastRun.get(key) || 0;
        if (now - lastRun >= limit) {
            func(...args);
            throttleLastRun.set(key, now);
        }
    };
}

/**
 * Enhanced touch event handler with passive option for better performance
 * @param {HTMLElement} element - Element to attach handler to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {Object} options - Event listener options
 */
export function addTouchHandler(element, event, handler, options = { passive: true }) {
    if (element) {
        element.addEventListener(event, handler, options);
    }
}

/**
 * Focus management utility
 * @param {HTMLElement} element - Element to focus
 * @param {boolean} preventScroll - Whether to prevent scroll on focus
 */
export function focusElement(element, preventScroll = false) {
    if (element) {
        element.focus({ preventScroll });
        element.setAttribute('tabindex', '0');
    }
}

/**
 * Keyboard navigation handler
 * @param {KeyboardEvent} event - Keyboard event
 * @param {Object} handlers - Map of key codes to handler functions
 */
export function handleKeyboardNavigation(event, handlers = {}) {
    const key = event.key;
    if (handlers[key]) {
        event.preventDefault();
        handlers[key](event);
    }
}

/**
 * Enhanced accessibility utilities
 */
export const accessibility = {
    /**
     * Set ARIA attributes on an element
     * @param {HTMLElement} element - Element to modify
     * @param {Object} attributes - ARIA attributes to set
     */
    setAria(element, attributes) {
        if (element) {
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(`aria-${key}`, value);
            });
        }
    },

    /**
     * Set role on an element
     * @param {HTMLElement} element - Element to modify
     * @param {string} role - Role to set
     */
    setRole(element, role) {
        if (element) {
            element.setAttribute('role', role);
        }
    },

    /**
     * Make element focusable
     * @param {HTMLElement} element - Element to modify
     * @param {number} tabIndex - Tab index value
     */
    makeFocusable(element, tabIndex = 0) {
        if (element) {
            element.setAttribute('tabindex', tabIndex);
        }
    }
};

/**
 * Error handling utilities
 */
export const errorHandler = {
    /**
     * Handle errors with logging and user feedback
     * @param {Error} error - Error object
     * @param {string} context - Context where error occurred
     * @param {boolean} showUserMessage - Whether to show user-friendly message
     */
    handleError(error, context = 'Unknown', showUserMessage = true) {
        console.error(`[Error in ${context}]:`, error);

        if (showUserMessage) {
            // Show user-friendly error message
            this.showUserError(error);
        }
    },

    /**
     * Show user-friendly error message
     * @param {Error} error - Error object
     */
    showUserError(error) {
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.innerHTML = `<span class="toast-icon">⚠</span><span class="toast-message">${this.getUserFriendlyMessage(error)}</span>`;
        document.getElementById('toast-container').appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => toast.classList.add('show'));

        // Auto-hide after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    },

    /**
     * Get user-friendly error message
     * @param {Error} error - Error object
     * @returns {string} User-friendly message
     */
    getUserFriendlyMessage(error) {
        if (error.message.includes('Network')) {
            return 'Network error. Please check your connection.';
        }
        if (error.message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        }
        return 'An error occurred. Please try again.';
    }
};

/**
 * Retry utility for failed operations
 * @param {Function} operation - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise} Result of operation
 */
export async function retry(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

/**
 * Graceful degradation utilities
 */
export const gracefulDegradation = {
    /**
     * Fallback to simpler version if feature fails
     * @param {Function} primary - Primary function to try
     * @param {Function} fallback - Fallback function
     * @returns {any} Result of primary or fallback
     */
    async fallback(primary, fallback) {
        try {
            return await primary();
        } catch (error) {
            console.warn('[Graceful Degradation] Primary failed, using fallback:', error);
            return await fallback();
        }
    },

    /**
     * Check if feature is supported
     * @param {string} feature - Feature to check
     * @returns {boolean} Whether feature is supported
     */
    isSupported(feature) {
        switch (feature) {
            case 'webgl':
                return !!window.WebGLRenderingContext;
            case 'webworker':
                return !!window.Worker;
            case 'intersectionobserver':
                return !!window.IntersectionObserver;
            case 'requestidlecallback':
                return typeof requestIdleCallback === 'function';
            default:
                return true;
        }
    }
};

/**
 * Performance monitoring utilities
 */
export const performanceMonitor = {
    metrics: new Map(),

    /**
     * Start measuring performance
     * @param {string} label - Label for the measurement
     */
    start(label) {
        this.metrics.set(label, { start: performance.now() });
    },

    /**
     * End measuring performance
     * @param {string} label - Label for the measurement
     * @returns {number} Duration in milliseconds
     */
    end(label) {
        const metric = this.metrics.get(label);
        if (metric) {
            const duration = performance.now() - metric.start;
            this.metrics.delete(label);

            // Log slow operations
            if (duration > 100) {
                console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
            }

            return duration;
        }
        return 0;
    },

    /**
     * Measure async operation
     * @param {string} label - Label for the measurement
     * @param {Function} fn - Async function to measure
     * @returns {Promise} Result of the function
     */
    async measure(label, fn) {
        this.start(label);
        try {
            const result = await fn();
            this.end(label);
            return result;
        } catch (error) {
            this.end(label);
            throw error;
        }
    }
};

// Helper function to synchronize controls with same value
function syncControls(valueSelectors, value) {
    valueSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.value = value;
            el.textContent = value;
        });
    });
}

import {
    setShowSymbols, setChartMode, setBubbleScale, setBubbleOpacity, setLineThickness, setAggregationFactor,
    setRankingLimit, setColorMaxLev, setChartHighLevSplit, setChartHeight,
    setLiqChartHeight, setSortKey, setSortDir, setActiveWindow, getSortKey,
    getSortDir, getShowSymbols, getChartMode, getBubbleScale, getAggregationFactor,
    getRankingLimit, getColorMaxLev, getChartHighLevSplit, getChartHeight,
    getLiqChartHeight, getActiveWindow, setColumnOrder, setVisibleColumns,
    getColumnOrder, getVisibleColumns, setPriceUpdateInterval, setActiveCurrency,
    setActiveEntryCurrency, setDecimalPlaces, setFontSize, setFontSizeKnown, setLeverageColors, setGridSpacing, setMinBtcVolume, getMinBtcVolume, setAggInterval, setLiquidationTableHeight, setAggVolumeUnit, getAggVolumeUnit, setIsZenMode, getIsZenMode,
    setShowLiquidationSymbols, getShowLiquidationSymbols, setLiquidationZoneColors, getLiquidationZoneColors, setLiquidationHighlightColor, getLiquidationHighlightColor, setTooltipDelay,
    getColumnWidths, setColumnWidths, getRowHeight, setRowHeight, setUseCompactFormat, getUseCompactFormat,
    getAutoFitText, setAutoFitText,
    getAggColumnOrder, setAggColumnOrder, getAggColumnOrderResumida, setAggColumnOrderResumida
} from '../state.js';
import { COLUMN_DEFS } from '../config.js';
import { renderTable, renderTableImmediate, rebuildTableHeaderCache, updateStats } from '../ui/table.js';
import { renderAggregationTable, renderAggregationTableResumida, scrollToCurrentPriceRange as aggScrollToRange, scrollToCurrentPriceRangeResumida } from '../ui/aggregation.js';
import { renderQuotesPanel, updateRankingPanel } from '../ui/panels.js';
import { saveSettings } from '../storage/settings.js';
import { startPriceTicker, stopPriceTicker } from '../ui/panels.js';
import { sortBy } from '../ui/filters.js';
import { selectCoin, updateCoinSearchLabel } from '../ui/combobox.js';

export function toggleShowSymbols() {
    setShowSymbols(!getShowSymbols());
    const isActive = getShowSymbols();
    const btnMobile = document.getElementById('btnShowSymMobile');
    const btnDesktop = document.getElementById('btnShowSymDesktop');
    if (btnMobile) {
        btnMobile.textContent = isActive ? 'Sim' : 'Não';
        btnMobile.classList.toggle('active', isActive);
    }
    if (btnDesktop) {
        btnDesktop.textContent = isActive ? 'On' : 'Off';
        btnDesktop.classList.toggle('active', isActive);
    }
    saveSettings();
    renderTable();
}

export function toggleShowAggSymbols() {
    const isChecked = document.getElementById('showAggSymbolsDrawer')?.checked;
    setShowLiquidationSymbols(isChecked);
    saveSettings();
    renderTable();
}

export function updateSpeed(val) {
    const v = parseInt(val, 10);
    if (v >= 1 && v <= 20) {
        syncControls(['.js-speed-val', '.js-speed-range'], v);
        saveSettings();
    }
}

export function updatePriceInterval(val) {
    const v = parseInt(val, 10);
    if (v >= 1 && v <= 30) {
        syncControls(['.js-price-interval-val'], v + 's');
        syncControls(['.js-price-interval-range'], v);
        setPriceUpdateInterval(v * 1000); // Convert seconds to milliseconds
        saveSettings();
        // Restart price ticker with new interval
        stopPriceTicker();
        startPriceTicker();
    }
}

export function updateRankingLimit(e) {
    const rankingLimits = document.querySelectorAll('.js-ranking-limit');
    // Use event target value if available, otherwise fallback to first element
    const val = (e?.target?.value) || rankingLimits[0]?.value || 10;
    setRankingLimit(parseInt(val, 10));
    // Sync all ranking limit inputs
    rankingLimits.forEach(el => el.value = val);
    saveSettings();
    // Trigger ranking panel update
    updateRankingPanel();
}

export function updateColorSettings(e) {
    const colorMaxLevs = document.querySelectorAll('.js-color-max-lev');
    // Use event target value if available, otherwise fallback to first element
    const val = (e?.target?.value) || colorMaxLevs[0]?.value || 50;
    setColorMaxLev(parseInt(val, 10));
    // Sync all color max lev inputs
    colorMaxLevs.forEach(el => el.value = val);
    saveSettings();
    // Trigger chart update by re-rendering the table
    renderTable();
}

export function updateChartFilters(e) {
    const chartHighLevSplits = document.querySelectorAll('.js-chart-high-lev-split');
    // Use event target value if available, otherwise fallback to first element
    const val = (e?.target?.value) || chartHighLevSplits[0]?.value || 50;
    setChartHighLevSplit(parseInt(val, 10));
    // Sync all chart high lev split inputs
    chartHighLevSplits.forEach(el => el.value = val);
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateBubbleSize(val) {
    setBubbleScale(parseFloat(val));
    syncControls(['.js-bubble-size-val', '.js-bubble-size-range'], val);
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateBubbleOpacity(val) {
    setBubbleOpacity(parseFloat(val));
    syncControls(['.js-bubble-opacity-val', '.js-bubble-opacity-range'], val);
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateLineThickness(val) {
    setLineThickness(parseInt(val, 10));
    syncControls(['.js-line-thickness-val', '.js-line-thickness-range'], val);
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateAggregation(val) {
    setAggregationFactor(parseInt(val, 10));
    syncControls(['.js-aggregation-val', '.js-aggregation-range'], val);
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateDecimalPlaces(val) {
    const v = parseInt(val, 10);
    if (v >= 0 && v <= 8) {
        setDecimalPlaces(v);
        syncControls(['.js-decimal-places-val', '.js-decimal-places-range'], v);
        saveSettings();
        // Trigger table re-render to apply new formatting
        renderTable();
    }
}

export function updateFontSize(val) {
    const v = parseInt(val, 10);
    console.log('updateFontSize called with:', val, 'parsed:', v);
    if (v >= 10 && v <= 20) {
        setFontSize(v);
        syncControls(['.js-font-size-val', '.js-font-size-range'], v);
        saveSettings();
        // Trigger table re-render to apply new font size
        console.log('Calling renderTable for fontSize update');
        renderTable();
    }
}

export function updateFontSizeKnown(val) {
    const v = parseInt(val, 10);
    console.log('updateFontSizeKnown called with:', val, 'parsed:', v);
    if (v >= 10 && v <= 24) {
        setFontSizeKnown(v);
        syncControls(['.js-font-size-known-val', '.js-font-size-known-range'], v);
        saveSettings();
        // Trigger table re-render to apply new font size
        console.log('Calling renderTable for fontSizeKnown update');
        renderTable();
    }
}

export function updateRowHeight(val) {
    const v = parseInt(val, 10);
    if (v >= 30 && v <= 100) {
        setRowHeight(v);
        syncControls(['.js-row-height-val', '.js-row-height-range'], v);
        // Update CSS variable
        document.documentElement.style.setProperty('--row-height', v + 'px');
        saveSettings();
        // Trigger table re-render
        renderTable();
    }
}

export function updateLeverageColors(e) {
    // Get values from event target if available to handle duplicate IDs
    const targetId = e?.target?.id;
    const targetValue = e?.target?.value;
    const targetClass = e?.target?.className; // Check class too if needed

    // Helper to get value from any of the inputs for a specific color
    const getValue = (selector, defaultVal) => {
        // If the event target matches the selector (by class), use its value
        // Note: selector passed here is like '.js-color-long-low'
        if (e?.target && e.target.matches(selector)) {
            return e.target.value;
        }
        // Otherwise try to find one
        return document.querySelector(selector)?.value || defaultVal;
    };

    const longLow = getValue('.js-color-long-low', '#22c55e');
    const longHigh = getValue('.js-color-long-high', '#16a34a');
    const shortLow = getValue('.js-color-short-low', '#ef4444');
    const shortHigh = getValue('.js-color-short-high', '#dc2626');

    setLeverageColors({
        longLow,
        longHigh,
        shortLow,
        shortHigh
    });

    // Sync all color inputs and update CSS variables
    document.querySelectorAll('.js-color-long-low').forEach(el => el.value = longLow);
    document.querySelectorAll('.js-color-long-high').forEach(el => el.value = longHigh);
    document.querySelectorAll('.js-color-short-low').forEach(el => el.value = shortLow);
    document.querySelectorAll('.js-color-short-high').forEach(el => el.value = shortHigh);

    document.documentElement.style.setProperty('--long-low-color', longLow);
    document.documentElement.style.setProperty('--long-high-color', longHigh);
    document.documentElement.style.setProperty('--short-low-color', shortLow);
    document.documentElement.style.setProperty('--short-high-color', shortHigh);

    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateGridSpacing(val) {
    const v = parseInt(val, 10);
    if (v >= 100 && v <= 5000) {
        setGridSpacing(v);
        // Sync both mobile and desktop controls
        syncControls(['.js-grid-spacing-val', '.js-grid-spacing-range'], v);
        saveSettings();
        // Force chart redraw to update grid
        const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
        const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
        if (scatterChart) scatterChart.update('none');
        if (liqChart) liqChart.update('none');
    }
}

export function updateMinBtcVolume(val) {
    const v = parseFloat(val);
    if (!isNaN(v) && v >= 0) {
        setMinBtcVolume(v);
        // Sync both mobile and desktop controls
        syncControls(['.js-min-btc-volume'], v);
        saveSettings();
        // Trigger table re-render to apply new highlighting
        renderTable();
    }
}

export function updateAggInterval(val) {
    const v = parseInt(val, 10);
    if (!isNaN(v) && v >= 10) {
        setAggInterval(v);
        syncControls(['.js-agg-interval'], v);
        saveSettings();
        // Table depends on interval
        renderTable();
    }
}

export function setChartModeHandler(mode) {
    setChartMode(mode);
    saveSettings();

    // Update active tab styling
    document.querySelectorAll('.tab[data-chart]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.chart === mode);
    });

    // Update control visibility - handle duplicate IDs (desktop/mobile)
    const bubbleCtrls = document.querySelectorAll('.js-bubble-size-ctrl');
    const bubbleOpacityCtrls = document.querySelectorAll('.js-bubble-opacity-ctrl');
    const lineThicknessCtrls = document.querySelectorAll('.js-line-thickness-ctrl');
    const aggCtrls = document.querySelectorAll('.js-aggregation-ctrl');

    bubbleCtrls.forEach(ctrl => {
        ctrl.style.display = (mode === 'scatter') ? 'block' : 'none';
    });

    bubbleOpacityCtrls.forEach(ctrl => {
        ctrl.style.display = (mode === 'scatter') ? 'block' : 'none';
    });

    lineThicknessCtrls.forEach(ctrl => {
        ctrl.style.display = (mode === 'lines') ? 'block' : 'none';
    });

    aggCtrls.forEach(ctrl => {
        ctrl.style.display = (mode === 'column') ? 'block' : 'none';
    });

    // Trigger chart update
    renderTable();
}

export function updateChartHeight(height) {
    setChartHeight(height);
    saveSettings();
    const section = document.getElementById('chart-section');
    if (section) {
        section.style.height = height + 'px';
        const chart = window.getScatterChart ? window.getScatterChart() : null;
        if (chart) {
            chart.resize();
            chart.update();
        }
    }
}

export function updateLiqChartHeight(height) {
    setLiqChartHeight(height);
    saveSettings();
    const section = document.getElementById('liq-chart-section');
    if (section) {
        section.style.height = height + 'px';
        const chart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
        if (chart) {
            chart.resize();
            chart.update();
        }
    }
}

export function updateAggTableHeight(height) {
    setLiquidationTableHeight(height);
    saveSettings();
    const section = document.getElementById('liquidationSectionFullContent');
    if (section) {
        const wrap = section.querySelector('.table-wrap');
        if (wrap) wrap.style.maxHeight = height + 'px';
    }
}

// Debounced versions of color update functions to prevent UI freezing
const debouncedUpdateAggZoneColors = debounce('aggZoneColors', () => {
    const buyStrong = document.getElementById('colorLiquidationBuyStrong')?.value || '#22c55e';
    const buyNormal = document.getElementById('colorLiquidationBuyNormal')?.value || '#4ade80';
    const sellStrong = document.getElementById('colorLiquidationSellStrong')?.value || '#ef4444';
    const sellNormal = document.getElementById('colorLiquidationSellNormal')?.value || '#f87171';

    setLiquidationZoneColors({ buyStrong, buyNormal, sellStrong, sellNormal });
    saveSettings();
    // Call directly with force=true to bypass all debounce/optimization caches
    renderAggregationTable(true);
    renderAggregationTableResumida(true);
}, 150);

const debouncedUpdateAggHighlightColor = debounce('aggHighlightColor', () => {
    const highlightColor = document.getElementById('colorLiquidationHighlight')?.value || '#facc15';
    setLiquidationHighlightColor(highlightColor);
    saveSettings();
    renderAggregationTable(true);
    renderAggregationTableResumida(true);
}, 150);

export function updateAggZoneColors(e) {
    // Prevent default to avoid any browser lag
    if (e) e.preventDefault();
    // Use debounced version to prevent UI freezing during color drag
    debouncedUpdateAggZoneColors();
}

export function updateAggHighlightColor(e) {
    // Prevent default to avoid any browser lag
    if (e) e.preventDefault();
    // Use debounced version to prevent UI freezing during color drag
    debouncedUpdateAggHighlightColor();
}

export function updateTooltipDelay(val) {
    const v = parseInt(val, 10);
    if (!isNaN(v) && v >= 0) {
        setTooltipDelay(v);
        const vals = document.querySelectorAll('.js-tooltip-delay-val');
        const ranges = document.querySelectorAll('.js-tooltip-delay-range');
        vals.forEach(el => el.textContent = v);
        ranges.forEach(el => el.value = v);
        saveSettings();
    }
}

export function updateAggVolumeUnit(unit) {
    setAggVolumeUnit(unit);
    // Sync only main table unit tabs (not Resumida which has its own state)
    const tabs = document.querySelectorAll('#liquidationSectionFullWrapper .js-agg-volume-unit-tab, #settingsDrawer .js-agg-volume-unit-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.unit === unit));
    saveSettings();
    // Re-render aggregation table (triggered via renderTable)
    renderTable();
}

export function scrollToCurrentPrice() {
    console.log('scrollToCurrentPrice called');

    // Check which table is visible (not collapsed)
    const sectionWrapperCompleta = document.getElementById('liquidationSectionFullContent')?.closest('.section-wrapper');
    const sectionWrapperResumida = document.getElementById('liquidationSectionSummaryContent')?.closest('.section-wrapper');

    const isCompletaCollapsed = sectionWrapperCompleta?.classList.contains('collapsed') ?? false;
    const isResumidaCollapsed = sectionWrapperResumida?.classList.contains('collapsed') ?? false;

    // Determine which table to scroll to based on visibility
    if (!isResumidaCollapsed && isCompletaCollapsed) {
        // Only resumida is visible - scroll to resumida
        console.log('Scrolling to resumida table (only one visible)');
        scrollToCurrentPriceRangeResumida();
    } else if (!isCompletaCollapsed && isResumidaCollapsed) {
        // Only completa is visible - scroll to completa
        console.log('Scrolling to completa table (only one visible)');
        aggScrollToRange();
    } else if (!isCompletaCollapsed && !isResumidaCollapsed) {
        // Both are visible - scroll to both
        console.log('Scrolling to both tables (both visible)');
        aggScrollToRange();
        scrollToCurrentPriceRangeResumida();
    } else {
        // Both are collapsed - expand completa (default) and scroll
        console.log('Expanding completa table (both collapsed)');
        if (sectionWrapperCompleta) {
            sectionWrapperCompleta.classList.remove('collapsed');
            localStorage.setItem(`collapse_liquidationSectionFullContent`, 'false');
        }
        aggScrollToRange();
    }
}

export function toggleZenMode() {
    const isZen = !getIsZenMode();
    setIsZenMode(isZen);

    if (isZen) {
        document.body.classList.add('zen-mode');
    } else {
        document.body.classList.remove('zen-mode');
    }

    // Update toggles UI if they exist (mobile/drawer)
    const zenToggles = document.querySelectorAll('.js-zen-toggle');
    zenToggles.forEach(t => {
        if (t.type === 'checkbox') t.checked = isZen;
        else t.classList.toggle('active', isZen);
    });

    saveSettings();
}

export function updateCompactFormat(e) {
    const isChecked = e.target.checked;
    setUseCompactFormat(isChecked);

    // Sync UI
    document.querySelectorAll('.js-compact-toggle').forEach(t => {
        if (t !== e.target) t.checked = isChecked;
    });

    saveSettings();
    renderTable();
}

export function onCurrencyChange() {
    console.log('onCurrencyChange called');
    const activeCurrency = document.getElementById('currencySelect').value;
    const activeEntryCurrency = document.getElementById('entryCurrencySelect').value;

    console.log('Currency changed to:', activeCurrency, 'Entry currency:', activeEntryCurrency);

    // Update global state
    setActiveCurrency(activeCurrency);
    setActiveEntryCurrency(activeEntryCurrency);

    console.log('Updated global state:', {
        activeCurrency: activeCurrency,
        activeEntryCurrency: activeEntryCurrency
    });

    // Update column headers preserving resizers
    const thVal = document.getElementById('th-valueCcy');
    if (thVal) {
        const label = thVal.querySelector('.th-label');
        if (label) label.textContent = `Value (${activeCurrency}) ↕`;
    }
    const thEntry = document.getElementById('th-entryCcy');
    if (thEntry) {
        const label = thEntry.querySelector('.th-label');
        if (label) label.textContent = `Avg Entry (Corr) ↕`; // Keep original label or update as needed
    }
    const thLiq = document.getElementById('th-liqPx');
    if (thLiq) {
        const label = thLiq.querySelector('.th-label');
        if (label) label.textContent = `Liq. Price Corr (${activeEntryCurrency}) ↕`;
    }

    saveSettings();
    console.log('Calling renderTable after currency change');
    renderTable();
}

export function openColumnCombobox() {
    const cbs = document.querySelectorAll('.js-column-combobox');
    cbs.forEach(cb => cb.classList.add('open'));
    const displays = document.querySelectorAll('.js-column-select-display');
    if (displays.length > 0) renderColumnDropdown(displays[0].value);
}

export function closeColumnComboboxDelayed() {
    setTimeout(() => {
        const cbs = document.querySelectorAll('.js-column-combobox');
        cbs.forEach(cb => cb.classList.remove('open'));
    }, 180);
}

export function renderColumnDropdown(query = '') {
    const dds = document.querySelectorAll('.js-column-dropdown');
    if (dds.length === 0) return;

    const columns = [
        { key: 'col-num', label: '#' },
        { key: 'col-address', label: 'Address' },
        { key: 'col-coin', label: 'Coin' },
        { key: 'col-szi', label: 'Size' },
        { key: 'col-leverage', label: 'Leverage' },
        { key: 'col-positionValue', label: 'Value' },
        { key: 'col-valueCcy', label: 'Value (CCY)' },
        { key: 'col-entryPx', label: 'Avg Entry' },
        { key: 'col-entryCcy', label: 'Avg Entry (Corr)' },
        { key: 'col-unrealizedPnl', label: 'UPNL' },
        { key: 'col-funding', label: 'Funding' },
        { key: 'col-liqPx', label: 'Liq. Price' },
        { key: 'col-distToLiq', label: 'Dist. to Liq.' },
        { key: 'col-accountValue', label: 'Acct. Value' }
    ];

    const q = query.trim().toUpperCase();
    const filtered = q ? columns.filter(c => c.label.toUpperCase().includes(q)) : columns;
    const visibleColumns = getVisibleColumns();

    let html = '';

    // Add Show All / Hide All buttons
    html += `<div class="combobox-action-buttons">
        <div class="combobox-action-btn" onmousedown="event.preventDefault(); showAllColumns()">Show All</div>
        <div class="combobox-action-btn" onmousedown="event.preventDefault(); hideAllColumns()">Hide All</div>
    </div>`;

    // Add column items with checkboxes
    html += filtered.map(col => {
        const isVisible = visibleColumns.length === 0 || visibleColumns.includes(col.key);
        return `<div class="combobox-item${isVisible ? ' selected' : ''}" onmousedown="event.preventDefault(); event.stopPropagation(); toggleColumn('${col.key}')" style="margin-right: 8px;">
            <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="event.stopPropagation(); toggleColumn('${col.key}')" style="margin-right: 8px;">
            <span class="item-label">${col.label}</span>
        </div>`;
    }).join('');

    // Update all dropdowns with the same content
    dds.forEach(d => d.innerHTML = html || `<div class="combobox-empty">No match</div>`);
}

export function toggleColumn(key) {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];

    let newVisibleColumns;
    if (visibleColumns.length === 0) {
        // Currently all visible, remove the specified column
        newVisibleColumns = allColumns.filter(col => col !== key);
    } else {
        // Some columns hidden, toggle the specified column
        if (visibleColumns.includes(key)) {
            newVisibleColumns = visibleColumns.filter(col => col !== key);
            // If no columns left visible, show all
            if (newVisibleColumns.length === 0) {
                newVisibleColumns = [];
            }
        } else {
            newVisibleColumns = [...visibleColumns, key];
            // If all columns are visible, reset to empty array
            if (newVisibleColumns.length === allColumns.length) {
                newVisibleColumns = [];
            }
        }
    }

    setVisibleColumns(newVisibleColumns);
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();

    // Keep dropdown open to show updated state
    const cbs = document.querySelectorAll('.js-column-combobox');
    cbs.forEach(cb => cb.classList.add('open'));
    const display = document.querySelector('.js-column-select-display');
    if (display) renderColumnDropdown(display.value);
}

export function showAllColumns() {
    setVisibleColumns([]);
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();

    // Keep dropdown open to show updated state
    const cbs = document.querySelectorAll('.js-column-combobox');
    cbs.forEach(cb => cb.classList.add('open'));
    const display = document.querySelector('.js-column-select-display');
    if (display) renderColumnDropdown(display.value);
}

export function hideAllColumns() {
    setVisibleColumns(['col-address', 'col-coin']); // Keep address and coin visible
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();

    // Keep dropdown open to show updated state
    const cbs = document.querySelectorAll('.js-column-combobox');
    cbs.forEach(cb => cb.classList.add('open'));
    const display = document.querySelector('.js-column-select-display');
    if (display) renderColumnDropdown(display.value);
}

export function updateColumnSelectDisplay() {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];

    const displays = document.querySelectorAll('.js-column-select-display');
    if (!displays.length) return;

    if (visibleColumns.length === 0) {
        displays.forEach(d => d.value = `All ${allColumns.length} columns`);
    } else {
        const hiddenCount = allColumns.length - visibleColumns.length;
        displays.forEach(d => d.value = `${visibleColumns.length} visible, ${hiddenCount} hidden`);
    }
}

export function applyColumnOrder() {
    console.log('%c[HANDLERS:applyColumnOrder] ═══ CALLED ═══', 'background: #795548; color: white; font-weight: bold; font-size: 12px;');
    // Apply column order to table
    // This function is called after loading settings
    // The actual application will be handled by renderTable()
    // which reads from getColumnOrder()

    // Setup drag and drop for column reordering
    // Note: setupColumnDragAndDrop has its own guard to prevent double initialization
    console.log('[HANDLERS:applyColumnOrder] About to call setupColumnDragAndDrop...');
    setupColumnDragAndDrop();
    setupColumnResizing();
}

export function setupColumnResizing() {
    const tables = [
        { id: 'positionsTable', tableType: 'positions' },
        { id: 'liquidationTableFull', tableType: 'aggregation' },
        { id: 'liquidationTableSummary', tableType: 'aggregation' }
    ];

    tables.forEach(({ id, tableType }) => {
        const table = document.getElementById(id);
        if (!table) {
            console.log(`[setupColumnResizing] Table ${id} NOT FOUND`);
            return;
        }

        const ths = table.querySelectorAll('th');
        if (!ths || ths.length === 0) {
            console.log(`[setupColumnResizing] Table ${id} has no headers`);
            return;
        }

        console.log(`[setupColumnResizing] Setting up ${ths.length} resizers for table ${id} (type: ${tableType})`);

        let initializedCount = 0;
        let skippedCount = 0;

        ths.forEach((th) => {
            if (!th) {
                skippedCount++;
                return;
            }

            const resizer = th.querySelector('.resizer');
            if (!resizer) {
                console.log(`[setupColumnResizing] No resizer found for th: ${th.id}`);
                skippedCount++;
                return;
            }

            if (resizer.dataset.initialized) {
                skippedCount++;
                return;
            }
            resizer.dataset.initialized = 'true';
            initializedCount++;

            resizer.addEventListener('mousedown', (e) => {
                console.log(`[setupColumnResizing] Resize START on ${id} (type: ${tableType}), th: ${th.id}`);
                initResize(e, tableType);
            });
            resizer.addEventListener('click', e => e.stopPropagation());
        });

        console.log(`[setupColumnResizing] Table ${id}: ${initializedCount} resizers initialized, ${skippedCount} skipped`);
    });
}

/**
 * Setup vertical resizers for rows
 */
export function setupVerticalResizing() {
    const resizers = document.querySelectorAll('.resizer-v');

    resizers.forEach(resizer => {
        if (resizer.dataset.initialized) return;

        resizer.dataset.initialized = 'true';
        resizer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            initResizeV(e);
        });
        resizer.addEventListener('click', e => e.stopPropagation());
    });
}

function initResize(e, tableType) {
    e.preventDefault();

    const resizer = e.target;
    const th = resizer.closest('th');
    if (!th) return;

    const startX = e.clientX;
    const startWidth = th.offsetWidth;

    // Get column key for persistence
    const colKey = th.id.replace('th-', '').replace('agg-', '');

    // DEBUG: Log table identification
    console.log(`%c[initResize] Table identification:`, 'color: #ff5722; font-weight: bold;', {
        tableType: tableType,
        thId: th.id,
        colKey: colKey,
        storageKey: `${tableType}_${colKey}`
    });

    document.body.classList.add('resizing');
    th.classList.add('resizing-active');

    const onMouseMove = (e) => {
        window.requestAnimationFrame(() => {
            const diffX = e.clientX - startX;
            let newWidth = startWidth + diffX;

            // Apply limits based on table type
            if (tableType === 'positions') {
                newWidth = Math.max(40, Math.min(500, newWidth)); // 40-500px for positions table
            } else if (tableType === 'aggregation') {
                newWidth = Math.max(60, Math.min(300, newWidth)); // 60-300px for aggregation tables
            }

            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
        });
    };

    const onMouseUp = () => {
        // ═══════════════════════════════════════════════════════════
        // PERSISTENCE DEBUG: Resize Save
        // ═══════════════════════════════════════════════════════════
        console.log(`%c[PERSISTENCE:RESIZE] ═══ RESIZE ENDED ═══`, 'background: #ff9800; color: white; font-weight: bold; font-size: 12px;');

        document.body.classList.remove('resizing');
        th.classList.remove('resizing-active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save new width with table-specific key
        const columnWidths = getColumnWidths() || {};
        const storageKey = `${tableType}_${colKey}`;
        const finalWidth = parseInt(th.style.width);
        columnWidths[storageKey] = finalWidth;

        console.log(`%c[PERSISTENCE:RESIZE] Table:`, 'color: #ff9800; font-weight: bold;', tableType);
        console.log(`%c[PERSISTENCE:RESIZE] Column:`, 'color: #ff9800; font-weight: bold;', colKey);
        console.log(`%c[PERSISTENCE:RESIZE] Storage Key:`, 'color: #ff9800; font-weight: bold;', storageKey);
        console.log(`%c[PERSISTENCE:RESIZE] New Width:`, 'color: #ff9800; font-weight: bold;', finalWidth + 'px');
        console.log(`%c[PERSISTENCE:RESIZE] Full columnWidths object:`, 'color: #ff9800;', JSON.stringify(columnWidths, null, 2));

        setColumnWidths(columnWidths);
        console.log(`%c[PERSISTENCE:RESIZE] setColumnWidths() called`, 'color: #ff9800;');

        saveSettings(null, null, null, null, null, true); // Save immediately for column resize
        console.log(`%c[PERSISTENCE:RESIZE] saveSettings() called with immediate=true`, 'color: #ff9800; font-weight: bold;');
        console.log(`%c[PERSISTENCE:RESIZE] ✓ DONE`, 'background: #ff9800; color: white; font-weight: bold;');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function initResizeV(e) {
    e.preventDefault();

    const startY = e.clientY;
    const startHeight = getRowHeight();

    document.body.classList.add('resizing-v');

    const onMouseMove = (e) => {
        window.requestAnimationFrame(() => {
            const diffY = e.clientY - startY;
            let newHeight = startHeight + diffY;

            // Apply limits (e.g., 24px to 100px)
            newHeight = Math.max(24, Math.min(100, newHeight));

            setRowHeight(newHeight);

            // Directly update CSS variable for immediate feedback
            document.documentElement.style.setProperty('--row-height', `${newHeight}px`);
        });
    };

    const onMouseUp = () => {
        document.body.classList.remove('resizing-v');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save settings and trigger re-render
        saveSettings(null, null, null, null, null, true);

        // Re-render tables to update virtual scroll managers
        import('../ui/table.js').then(m => m.renderTable());
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// Use a module-level variable instead of DOM marker to avoid bfcache issues
let dragAndDropInitialized = false;

export function setupColumnDragAndDrop() {
    console.log('%c[DRAG-DROP:INIT] ═══ setupColumnDragAndDrop CALLED ═══', 'background: #673AB7; color: white; font-weight: bold; font-size: 12px;');
    console.log('[DRAG-DROP:INIT] Timestamp:', new Date().toISOString());
    console.log('[DRAG-DROP:INIT] dragAndDropInitialized flag:', dragAndDropInitialized);

    // Check both the JS variable AND the DOM marker (for backwards compatibility)
    const existingMarker = document.querySelector('.dragging-initialized');
    console.log('[DRAG-DROP:INIT] .dragging-initialized marker found?', !!existingMarker);

    if (dragAndDropInitialized) {
        console.log('%c[DRAG-DROP:INIT] ✗ EARLY RETURN - Drag and drop already initialized (JS flag)', 'background: #f44336; color: white; font-weight: bold;');
        return;
    }

    // Also remove any stale DOM marker from bfcache
    if (existingMarker) {
        console.log('%c[DRAG-DROP:INIT] Removing stale DOM marker from bfcache...', 'background: #FF9800; color: white; font-weight: bold;');
        existingMarker.remove();
    }

    console.log('%c[DRAG-DROP:INIT] ✓ Proceeding with initialization...', 'background: #4CAF50; color: white; font-weight: bold;');
    const tableHeaders = document.querySelectorAll('th[id^="th-"]');
    console.log('Found table headers:', tableHeaders.length);

    // Track drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let draggedTh = null;
    let dragGhost = null;
    let sourceTable = null;
    let draggedColumnIndex = -1;

    // Remove draggable from all headers (we handle manually)
    tableHeaders.forEach(th => {
        th.draggable = false;
    });

    // Global mouse event delegation for drag start (no capture to run after resize)
    document.addEventListener('mousedown', (e) => {
        // Skip if resizing
        if (document.body.classList.contains('resizing')) return;

        const th = e.target.closest('th[id^="th-"]');
        if (!th) return;

        // Skip if clicking on resizer
        const resizer = th.querySelector('.resizer');
        if (resizer && (e.target === resizer || resizer.contains(e.target))) return;

        // Start drag
        isDragging = true;
        draggedTh = th;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        sourceTable = th.closest('table');
        draggedColumnIndex = Array.from(th.parentElement.children).indexOf(th);

        // ═══════════════════════════════════════════════════════════
        // DEBUG: Log initial state for ALL tables
        // ═══════════════════════════════════════════════════════════
        const tableId = sourceTable?.id;
        const isAggTable = tableId === 'liquidationTableFull' || tableId === 'liquidationTableSummary';

        console.log('%c[DRAG-DROP:START] ═══ DRAG START ═══', 'background: #2196F3; color: white; font-weight: bold; font-size: 12px;');
        console.log('%c[DRAG-DROP:START] Dragged column:', 'color: #2196F3; font-weight: bold;', th.id);
        console.log('%c[DRAG-DROP:START] Table ID:', 'color: #2196F3; font-weight: bold;', tableId);
        console.log('%c[DRAG-DROP:START] Is Aggregation Table?', 'color: #2196F3; font-weight: bold;', isAggTable);

        if (isAggTable) {
            console.log('%c[DRAG-DROP:START] ═══ AGGREGATION TABLE DRAG ═══', 'background: #FF9800; color: white; font-weight: bold;');
            console.log('%c[DRAG-DROP:START] aggColumnOrder (Full):', 'color: #FF9800;', JSON.stringify(getAggColumnOrder()));
            console.log('%c[DRAG-DROP:START] aggColumnOrderResumida:', 'color: #FF9800;', JSON.stringify(getAggColumnOrderResumida()));
        } else {
            console.log('%c[DRAG-DROP:START] ColumnOrder (Positions):', 'color: #2196F3;', JSON.stringify(getColumnOrder()));
        }

        const headers = Array.from(th.parentElement.children).map(h => h.id);
        console.log('%c[DRAG-DROP:START] Current DOM headers order:', 'color: #2196F3;', JSON.stringify(headers));

        th.classList.add('dragging');

        // Highlight entire column being dragged
        const columnSelector = `td:nth-child(${draggedColumnIndex + 1})`;
        sourceTable.querySelectorAll(columnSelector).forEach(td => {
            td.classList.add('column-dragging');
        });
    }, false); // No capture to run after resize handler

    // Global mouse move for drag feedback
    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !draggedTh) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        // Only show dragging state after moving a bit
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            draggedTh.style.opacity = '0.5';

            // Create ghost element with entire column if not exists
            if (!dragGhost) {
                dragGhost = document.createElement('div');
                dragGhost.className = 'column-drag-ghost-full';

                // Get column width
                const columnWidth = draggedTh.offsetWidth;

                // Create header part
                const headerContent = draggedTh.querySelector('.th-label')?.textContent || draggedTh.textContent.trim().split('\n')[0];

                // Get visible cells from the column (limit to avoid performance issues)
                const columnSelector = `td:nth-child(${draggedColumnIndex + 1})`;
                const cells = sourceTable.querySelectorAll(columnSelector);
                const visibleCells = Array.from(cells).slice(0, 10); // Limit to 10 rows for performance

                // Build ghost HTML
                let ghostHTML = `
                    <div class="ghost-header" style="
                        background: linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(20, 30, 50, 0.95) 100%);
                        padding: 8px 12px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        color: var(--text);
                        border-bottom: 1px solid var(--glass-border);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${headerContent}</div>
                    <div class="ghost-body" style="max-height: 200px; overflow: hidden;">
                `;

                visibleCells.forEach(cell => {
                    const cellText = cell.textContent.trim();
                    ghostHTML += `<div class="ghost-cell" style="
                        padding: 6px 12px;
                        font-size: 11px;
                        color: var(--muted);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    ">${cellText}</div>`;
                });

                ghostHTML += '</div>';

                dragGhost.innerHTML = ghostHTML;
                dragGhost.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    z-index: 10000;
                    width: ${columnWidth}px;
                    background: rgba(15, 23, 42, 0.95);
                    border: 2px solid var(--accent);
                    border-radius: var(--r-sm);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(96, 165, 250, 0.2);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    opacity: 0.9;
                    transform: rotate(2deg);
                    transition: transform 0.1s ease;
                `;

                document.body.appendChild(dragGhost);
            }

            // Position ghost element
            dragGhost.style.left = `${e.clientX + 15}px`;
            dragGhost.style.top = `${e.clientY + 15}px`;
        }

        // Find potential drop target
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetTh = targetElement?.closest('th[id^="th-"]');

        if (targetTh && targetTh !== draggedTh) {
            // Only allow drop within the same table
            const targetTable = targetTh.closest('table');
            if (targetTable === sourceTable) {
                // Remove drag-over from all headers
                document.querySelectorAll('th').forEach(header => {
                    header.classList.remove('drag-over');
                });
                // Add drag-over to current target
                targetTh.classList.add('drag-over');
            }
        }
    });

    // Global mouse up for drop
    document.addEventListener('mouseup', (e) => {
        console.log('%c[DRAG-DROP:DROP] ═══ MOUSEUP EVENT ═══', 'background: #9C27B0; color: white; font-weight: bold; font-size: 12px;');
        console.log('[DRAG-DROP:DROP] isDragging:', isDragging);
        console.log('[DRAG-DROP:DROP] draggedTh:', draggedTh ? draggedTh.id : 'null');
        console.log('[DRAG-DROP:DROP] sourceTable:', sourceTable ? sourceTable.id : 'null');

        if (!isDragging || !draggedTh) {
            console.log('%c[DRAG-DROP:DROP] ✗ Early return - not dragging or no draggedTh', 'color: #f44336;');
            return;
        }

        // Find drop target
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetTh = targetElement?.closest('th[id^="th-"]');

        console.log('[DRAG-DROP:DROP] targetElement:', targetElement ? targetElement.tagName : 'null');
        console.log('[DRAG-DROP:DROP] targetTh:', targetTh ? targetTh.id : 'null');

        if (targetTh && targetTh !== draggedTh) {
            const targetTable = targetTh.closest('table');

            console.log('[DRAG-DROP:DROP] targetTable:', targetTable ? targetTable.id : 'null');
            console.log('[DRAG-DROP:DROP] sourceTable:', sourceTable ? sourceTable.id : 'null');
            console.log('[DRAG-DROP:DROP] Tables match?', targetTable === sourceTable);

            // Only allow drop within the same table
            if (targetTable === sourceTable) {
                console.log('%c[DRAG-DROP:DROP] ✓ Drop completed: ' + draggedTh.id + ' -> ' + targetTh.id, 'background: #4CAF50; color: white; font-weight: bold;');

                const draggedColumnId = draggedTh.id.replace('th-', '').replace('agg-', '');
                const targetColumnId = targetTh.id.replace('th-', '').replace('agg-', '');
                console.log('Dragged:', draggedColumnId, 'Target:', targetColumnId);

                // Check if this is positions table or aggregation table
                console.log('%c[DRAG-DROP:DROP] Checking table type...', 'background: #9C27B0; color: white; font-weight: bold;');
                console.log('%c[DRAG-DROP:DROP] sourceTable.id:', 'color: #9C27B0;', sourceTable.id);
                console.log('%c[DRAG-DROP:DROP] Is positionsTable?', 'color: #9C27B0;', sourceTable.id === 'positionsTable');

                if (sourceTable.id === 'positionsTable') {
                    // Get current column order
                    const currentOrder = getColumnOrder();

                    // ═══════════════════════════════════════════════════════════
                    // PERSISTENCE DEBUG: Drag-and-Drop Save
                    // ═══════════════════════════════════════════════════════════
                    console.log(`%c[PERSISTENCE:DRAG-DROP] ═══ DROP COMPLETED ═══`, 'background: #2196F3; color: white; font-weight: bold; font-size: 12px;');
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Table:`, 'color: #2196F3; font-weight: bold;', 'positionsTable');
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Dragged Column:`, 'color: #2196F3; font-weight: bold;', draggedColumnId);
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Target Column:`, 'color: #2196F3; font-weight: bold;', targetColumnId);
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Current Order (before):`, 'color: #2196F3;', JSON.stringify(currentOrder));

                    const draggedIndex = currentOrder.indexOf(`col-${draggedColumnId}`);
                    const targetIndex = currentOrder.indexOf(`col-${targetColumnId}`);
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Dragged Index:`, 'color: #2196F3;', draggedIndex);
                    console.log(`%c[PERSISTENCE:DRAG-DROP] Target Index:`, 'color: #2196F3;', targetIndex);

                    if (draggedIndex !== -1 && targetIndex !== -1) {
                        // Reorder columns
                        const newOrder = [...currentOrder];
                        const [draggedColumn] = newOrder.splice(draggedIndex, 1);
                        newOrder.splice(targetIndex, 0, draggedColumn);
                        console.log(`%c[PERSISTENCE:DRAG-DROP] New Order (after):`, 'color: #2196F3; font-weight: bold;', JSON.stringify(newOrder));

                        // Update state and save
                        setColumnOrder(newOrder);
                        const orderAfterSet = getColumnOrder();
                        console.log(`%c[PERSISTENCE:DRAG-DROP] setColumnOrder() called:`, 'color: #2196F3;', JSON.stringify(orderAfterSet));

                        // CRITICAL: Ensure columnOrder is saved
                        console.log(`%c[PERSISTENCE:DRAG-DROP] About to call saveSettings...`, 'background: #ff0000; color: white; font-weight: bold;');
                        saveSettings(null, null, null, null, null, true); // Save immediately for column reorder
                        console.log(`%c[PERSISTENCE:DRAG-DROP] saveSettings() called with immediate=true`, 'color: #2196F3; font-weight: bold;');
                        console.log(`%c[PERSISTENCE:DRAG-DROP] Column order saved:`, 'color: #00ff00; font-weight: bold;', JSON.stringify(orderAfterSet));

                        // IMPORTANT: Invalidate header cache to force rebuild with new order
                        rebuildTableHeaderCache();
                        console.log(`%c[PERSISTENCE:DRAG-DROP] Header cache invalidated`, 'color: #2196F3;');

                        // Re-render table IMMEDIATELY to apply new column order
                        renderTableImmediate();
                        console.log(`%c[PERSISTENCE:DRAG-DROP] renderTableImmediate() called`, 'color: #2196F3;');
                        console.log(`%c[PERSISTENCE:DRAG-DROP] ✓ DONE`, 'background: #2196F3; color: white; font-weight: bold;');
                    } else {
                        console.warn(`%c[PERSISTENCE:DRAG-DROP] ✗ FAILED - Invalid indices`, 'background: #f44336; color: white; font-weight: bold;', 'DraggedIndex:', draggedIndex, 'TargetIndex:', targetIndex);
                    }
                } else {
                    // ═══════════════════════════════════════════════════════════
                    // PERSISTENCE DEBUG: Aggregation Table Drop
                    // ═══════════════════════════════════════════════════════════
                    console.log('%c[PERSISTENCE:AGG-DROP] ═══ DROP (aggregation table) ═══', 'background: #FF9800; color: white; font-weight: bold; font-size: 12px;');
                    console.log('%c[PERSISTENCE:AGG-DROP] Table ID:', 'color: #FF9800; font-weight: bold;', sourceTable.id);
                    console.log('%c[PERSISTENCE:AGG-DROP] Dragged:', 'color: #FF9800;', draggedTh.id);
                    console.log('%c[PERSISTENCE:AGG-DROP] Target:', 'color: #FF9800;', targetTh.id);

                    const thead = sourceTable.querySelector('thead tr');
                    const tbody = sourceTable.querySelector('tbody');

                    console.log('%c[PERSISTENCE:AGG-DROP] thead found:', 'color: #FF9800;', !!thead);
                    console.log('%c[PERSISTENCE:AGG-DROP] tbody found:', 'color: #FF9800;', !!tbody);

                    if (thead) {
                        const allThs = Array.from(thead.querySelectorAll('th'));
                        const draggedIdx = allThs.indexOf(draggedTh);
                        const targetIdx = allThs.indexOf(targetTh);
                        console.log('%c[PERSISTENCE:AGG-DROP] draggedIdx:', 'color: #FF9800;', draggedIdx);
                        console.log('%c[PERSISTENCE:AGG-DROP] targetIdx:', 'color: #FF9800;', targetIdx);
                        console.log('%c[PERSISTENCE:AGG-DROP] Total headers:', 'color: #FF9800;', allThs.length);

                        if (draggedIdx !== -1 && targetIdx !== -1) {
                            // Move the header
                            console.log('%c[PERSISTENCE:AGG-DROP] Moving header in DOM...', 'color: #FF9800;');
                            if (draggedIdx < targetIdx) {
                                targetTh.after(draggedTh);
                            } else {
                                targetTh.before(draggedTh);
                            }
                            console.log('%c[PERSISTENCE:AGG-DROP] ✓ Header moved in DOM', 'color: #4CAF50;');

                            // Move all corresponding td cells in each row
                            if (tbody) {
                                const rows = tbody.querySelectorAll('tr');
                                console.log('%c[PERSISTENCE:AGG-DROP] Processing', 'color: #FF9800;', rows.length, 'rows');
                                let cellsMoved = 0;
                                rows.forEach((row, rowIdx) => {
                                    // SKIP virtual scroll spacer rows - they have only 1 cell with colspan
                                    if (row.classList.contains('vs-top-spacer') || row.classList.contains('vs-bottom-spacer')) {
                                        return;
                                    }

                                    const allTds = Array.from(row.querySelectorAll('td'));
                                    // Verify indices are valid for this row
                                    if (draggedIdx < allTds.length && targetIdx < allTds.length) {
                                        const draggedTd = allTds[draggedIdx];
                                        const targetTd = allTds[targetIdx];
                                        if (draggedTd && targetTd) {
                                            if (draggedIdx < targetIdx) {
                                                targetTd.after(draggedTd);
                                            } else {
                                                targetTd.before(draggedTd);
                                            }
                                            cellsMoved++;
                                        }
                                    }
                                });
                                console.log('%c[PERSISTENCE:AGG-DROP] Cells moved in', 'color: #FF9800;', cellsMoved, 'rows');
                            }

                            // ═══════════════════════════════════════════════════════════
                            // CRITICAL: Save the new column order for aggregation tables
                            // ═══════════════════════════════════════════════════════════
                            const newHeaderOrder = Array.from(thead.querySelectorAll('th')).map(th => th.id);
                            console.log('%c[PERSISTENCE:AGG-DROP] New header order from DOM:', 'background: #2196F3; color: white; font-weight: bold;', JSON.stringify(newHeaderOrder));

                            // Determine which state function to use
                            console.log('%c[PERSISTENCE:AGG-DROP] Determining table type...', 'color: #FF9800;');
                            console.log('%c[PERSISTENCE:AGG-DROP] sourceTable.id:', 'color: #FF9800;', sourceTable.id);
                            console.log('%c[PERSISTENCE:AGG-DROP] Is liquidationTableFull?', 'color: #FF9800;', sourceTable.id === 'liquidationTableFull');
                            console.log('%c[PERSISTENCE:AGG-DROP] Is liquidationTableSummary?', 'color: #FF9800;', sourceTable.id === 'liquidationTableSummary');

                            if (sourceTable.id === 'liquidationTableFull') {
                                console.log('%c[PERSISTENCE:AGG-DROP] Calling setAggColumnOrder()...', 'background: #ff0000; color: white; font-weight: bold;');
                                setAggColumnOrder(newHeaderOrder);
                                const savedOrder = getAggColumnOrder();
                                console.log('%c[PERSISTENCE:AGG-DROP] ✓ setAggColumnOrder() called. Current state:', 'background: #4CAF50; color: white; font-weight: bold;', JSON.stringify(savedOrder));
                            } else if (sourceTable.id === 'liquidationTableSummary') {
                                console.log('%c[PERSISTENCE:AGG-DROP] Calling setAggColumnOrderResumida()...', 'background: #ff0000; color: white; font-weight: bold;');
                                setAggColumnOrderResumida(newHeaderOrder);
                                const savedOrder = getAggColumnOrderResumida();
                                console.log('%c[PERSISTENCE:AGG-DROP] ✓ setAggColumnOrderResumida() called. Current state:', 'background: #4CAF50; color: white; font-weight: bold;', JSON.stringify(savedOrder));
                            } else {
                                console.error('%c[PERSISTENCE:AGG-DROP] ✗ UNKNOWN TABLE ID:', 'background: #f44336; color: white; font-weight: bold;', sourceTable.id);
                            }

                            // CRITICAL: Call saveSettings
                            console.log('%c[PERSISTENCE:AGG-DROP] About to call saveSettings(immediate=true)...', 'background: #ff0000; color: white; font-weight: bold; font-size: 14px;');
                            saveSettings(null, null, null, null, null, true);
                            console.log('%c[PERSISTENCE:AGG-DROP] ✓ saveSettings() called', 'background: #4CAF50; color: white; font-weight: bold;');
                            console.log('%c[PERSISTENCE:AGG-DROP] ═══ DONE ═══', 'background: #4CAF50; color: white; font-weight: bold; font-size: 12px;');
                        } else {
                            console.warn('[DRAG-DROP] Invalid header indices - draggedIdx:', draggedIdx, 'targetIdx:', targetIdx);
                        }
                    } else {
                        console.warn('[DRAG-DROP] thead not found!');
                    }
                }
            }
        }

        // Clean up
        isDragging = false;
        if (draggedTh) {
            draggedTh.classList.remove('dragging');
            draggedTh.style.opacity = '';

            // Remove column highlighting
            if (sourceTable && draggedColumnIndex >= 0) {
                const columnSelector = `td:nth-child(${draggedColumnIndex + 1})`;
                sourceTable.querySelectorAll(columnSelector).forEach(td => {
                    td.classList.remove('column-dragging');
                });
            }

            draggedTh = null;
        }
        if (dragGhost) {
            dragGhost.remove();
            dragGhost = null;
        }
        sourceTable = null;
        document.querySelectorAll('th').forEach(header => {
            header.classList.remove('drag-over');
        });
    });

    // Mark as initialized using both JS flag AND DOM marker
    dragAndDropInitialized = true;
    console.log('%c[DRAG-DROP:INIT] ✓ JS flag set to true', 'background: #4CAF50; color: white; font-weight: bold;');

    // Keep DOM marker for backwards compatibility and debugging
    const marker = document.createElement('div');
    marker.className = 'dragging-initialized';
    marker.style.display = 'none';
    document.body.appendChild(marker);
    console.log('%c[DRAG-DROP:INIT] ✓ DOM marker created', 'background: #4CAF50; color: white; font-weight: bold;');
}

// Reset function for debugging or when needed
export function resetDragAndDropInitialization() {
    dragAndDropInitialized = false;
    const marker = document.querySelector('.dragging-initialized');
    if (marker) marker.remove();
    console.log('%c[DRAG-DROP:INIT] Drag-and-drop initialization reset', 'background: #FF5722; color: white; font-weight: bold;');
}

export function applyColumnVisibility() {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];

    // Update table header visibility
    allColumns.forEach(colKey => {
        const thElement = document.getElementById(`th-${colKey.replace('col-', '')}`);
        if (thElement) {
            const isVisible = visibleColumns.length === 0 || visibleColumns.includes(colKey);
            thElement.style.display = isVisible ? '' : 'none';
        }
    });

    // Update filter row visibility
    allColumns.forEach(colKey => {
        const filterCells = document.querySelectorAll(`.filter-cell.${colKey}`);
        filterCells.forEach(cell => {
            const isVisible = visibleColumns.length === 0 || visibleColumns.includes(colKey);
            cell.style.display = isVisible ? '' : 'none';
        });
    });
}

export function applyColumnWidths() {
    console.log('[applyColumnWidths] ════════════════════════════════════════');
    console.log('[applyColumnWidths] CALLED at', new Date().toLocaleTimeString());
    console.trace('[applyColumnWidths] Stack trace:');

    const columnWidths = getColumnWidths() || {};
    console.log('[applyColumnWidths] columnWidths from state:', JSON.stringify(columnWidths));

    // Apply widths for positions table from storage or defaults from COLUMN_DEFS
    console.log('[applyColumnWidths] Applying widths to positions table...');
    let appliedCount = 0;
    COLUMN_DEFS.forEach(colDef => {
        const thId = `th-${colDef.key.replace('col-', '')}`;
        const th = document.getElementById(thId);

        if (th) {
            // Priority: Stored width (new key format) > Stored width (old key format) > Default width > 100
            const storageKey = `positions_${colDef.key.replace('col-', '')}`;
            const oldStorageKey = thId;
            const storedWidth = columnWidths[storageKey];
            const oldStoredWidth = columnWidths[oldStorageKey];
            let width = storedWidth || oldStoredWidth || colDef.width || 100;

            console.log(`[applyColumnWidths] Column ${colDef.key}: storageKey=${storageKey}, stored=${storedWidth || 'none'}, oldStored=${oldStoredWidth || 'none'}, default=${colDef.width}, FINAL=${width}`);

            // Enforce minimum width
            if (width < 40) width = 40; // Allow smaller columns like # (width 40 in config)

            th.style.width = `${width}px`;
            th.style.minWidth = `${width}px`;
            th.style.maxWidth = `${width}px`;
            appliedCount++;
        } else {
            console.log(`[applyColumnWidths] Column ${colDef.key}: th element NOT FOUND (${thId})`);
        }
    });
    console.log(`[applyColumnWidths] Applied widths to ${appliedCount} columns`);

    // Apply widths for aggregation tables (liquidationTableFull and liquidationTableSummary)
    const aggTables = ['liquidationTableFull', 'liquidationTableSummary'];
    aggTables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const ths = table.querySelectorAll('th[id]');
        ths.forEach(th => {
            const colKey = th.id.replace('th-', '').replace('agg-', '');
            const storageKey = `aggregation_${colKey}`;

            // Use stored width or default
            let width = columnWidths[storageKey] || th.getAttribute('data-default-width') || 100;
            width = parseInt(width);

            // Enforce limits for aggregation tables
            width = Math.max(60, Math.min(300, width));

            th.style.width = `${width}px`;
            th.style.minWidth = `${width}px`;
            th.style.maxWidth = `${width}px`;
        });
    });

    console.log('[applyColumnWidths] ✓ DONE');
    console.log('[applyColumnWidths] ════════════════════════════════════════');
}

/**
     * Handles the auto-fit text toggle.
     * @param {Event} e - The change event.
     */
export function handleAutoFitTextToggle(e) {
    const isEnabled = e.target.checked;
    setAutoFitText(isEnabled);
    saveSettings();

    // Re-render main table
    renderTable();

    // Re-render aggregation tables
    renderAggregationTable(true);
    renderAggregationTableResumida(true);
}
