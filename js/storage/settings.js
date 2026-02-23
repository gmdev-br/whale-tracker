// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Storage Settings
// ═══════════════════════════════════════════════════════════

import {
    getSortKey, getSortDir, getShowSymbols, getChartMode, getBubbleScale, getBubbleOpacity, getLineThickness,
    getAggregationFactor, getSelectedCoins, getPriceMode, getPriceUpdateInterval, getActiveWindow,
    getColumnOrder, getVisibleColumns, getRankingLimit, getColorMaxLev,
    getChartHighLevSplit, getChartHeight, getLiqChartHeight, getSavedScatterState,
    getSavedLiqState, getColumnWidths, getColumnWidth, getActiveCurrency, getActiveEntryCurrency, getDecimalPlaces, getLeverageColors, getFontSize, getFontSizeKnown, getRowHeight, setRowHeight, getGridSpacing, getMinBtcVolume,
    getAggInterval, getAggTableHeight, getAggVolumeUnit, getIsZenMode, getLastSeenAccountValues, getShowAggSymbols, getAggZoneColors, getAggHighlightColor, getTooltipDelay,
    setSortKey, setSortDir, setSavedScatterState, setSavedLiqState,
    setColumnOrder, setVisibleColumns, setSelectedCoins, setRankingLimit, setColorMaxLev, setChartHighLevSplit, setChartMode, setBubbleScale, setBubbleOpacity, setLineThickness, setAggregationFactor, setPriceMode, setShowSymbols, setPriceUpdateInterval, setDecimalPlaces, setFontSize, setFontSizeKnown, setLeverageColors, setColumnWidth, setGridSpacing, setMinBtcVolume, setAggInterval, setAggTableHeight, setAggVolumeUnit, setIsZenMode, setLastSeenAccountValues, setShowAggSymbols, setAggZoneColors, setAggHighlightColor, setTooltipDelay
} from '../state.js';
import { COLUMN_DEFS } from '../config.js';
import { cbSetValue, updateCoinSearchLabel } from '../ui/combobox.js';
import {
    applyColumnVisibility,
    updateColumnSelectDisplay
} from '../events/handlers.js';
import { renderQuotesPanel, updatePriceModeUI } from '../ui/panels.js';
import { debounce } from '../utils/performance.js';
import { showToast } from '../ui/toast.js';

const STORAGE_KEY = 'whaleWatcherSettings';

// Debounced save to reduce localStorage writes
const debouncedSave = debounce((settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    showToast('Configurações salvas', 'success', 2500);
}, 1000);

export function saveSettings(getChartState = null, savedScatterState = null, savedLiqState = null, scatterChart = null, liqChartInstance = null) {
    // Helper to get chart state
    function getChartStateHelper(chart) {
        if (!chart) return null;
        if (chart.isZoomed) {
            return {
                x: { min: chart.scales.x.min, max: chart.scales.x.max },
                y: { min: chart.scales.y.min, max: chart.scales.y.max }
            };
        }
        return null; // Return null if not zoomed (user wants default view)
    }

    const currencySelectEl = document.getElementById('currencySelect');
    const entryCurrencySelectEl = document.getElementById('entryCurrencySelect');
    const minValueCcyEl = document.getElementById('minValueCcy');
    const maxValueCcyEl = document.getElementById('maxValueCcy');

    const settings = {
        scatterChartState: getChartStateHelper(scatterChart) || savedScatterState,
        liqChartState: getChartStateHelper(liqChartInstance) || savedLiqState,
        minValue: document.getElementById('minValue').value,
        sideFilter: document.getElementById('sideFilter').value,
        minLev: document.getElementById('minLev').value,
        maxLev: document.getElementById('maxLev').value,
        minSize: document.getElementById('minSize').value,
        minSzi: document.getElementById('minSzi').value,
        maxSzi: document.getElementById('maxSzi').value,
        minValueCcy: minValueCcyEl ? minValueCcyEl.value : '',
        maxValueCcy: maxValueCcyEl ? maxValueCcyEl.value : '',
        minEntryCcy: document.getElementById('minEntryCcy').value,
        maxEntryCcy: document.getElementById('maxEntryCcy').value,
        minUpnl: document.getElementById('minUpnl').value,
        maxUpnl: document.getElementById('maxUpnl').value,
        minFunding: document.getElementById('minFunding').value,
        levTypeFilter: document.getElementById('levTypeFilter').value,
        currencySelect: currencySelectEl ? currencySelectEl.value : '',
        entryCurrencySelect: entryCurrencySelectEl ? entryCurrencySelectEl.value : '',
        addressFilter: document.getElementById('addressFilter').value,
        selectedCoins: getSelectedCoins(),
        priceMode: getPriceMode(),
        priceUpdateInterval: getPriceUpdateInterval(),
        activeWindow: getActiveWindow(),
        columnWidths: getColumnWidths(),
        rankingLimit: getRankingLimit(),
        colorMaxLev: getColorMaxLev(),
        chartHighLevSplit: getChartHighLevSplit(),
        sortKey: getSortKey(),
        sortDir: getSortDir(),
        showSymbols: getShowSymbols(),
        chartHeight: getChartHeight(),
        chartMode: getChartMode(),
        bubbleScale: getBubbleScale(),
        bubbleOpacity: getBubbleOpacity(),
        lineThickness: getLineThickness(),
        aggregationFactor: getAggregationFactor(),
        decimalPlaces: getDecimalPlaces(),
        fontSize: getFontSize(),
        fontSizeKnown: getFontSizeKnown(),
        rowHeight: getRowHeight(),
        visibleColumns: getVisibleColumns(),
        columnOrder: getColumnOrder(),
        leverageColors: getLeverageColors(),
        columnWidth: getColumnWidth(),
        gridSpacing: getGridSpacing(),
        minBtcVolume: getMinBtcVolume(),
        aggInterval: getAggInterval(),
        aggTableHeight: getAggTableHeight(),
        aggVolumeUnit: getAggVolumeUnit(),
        isZenMode: getIsZenMode(),
        showAggSymbols: getShowAggSymbols(),
        aggZoneColors: getAggZoneColors(),
        aggHighlightColor: getAggHighlightColor(),
        lastSeenAccountValues: getLastSeenAccountValues(),
        tooltipDelay: getTooltipDelay()
    };

    console.log('Saving currency settings:', {
        currencySelect: settings.currencySelect,
        entryCurrencySelect: settings.entryCurrencySelect
    });

    console.log('Saving VALUE column data:', {
        minValueCcy: settings.minValueCcy,
        maxValueCcy: settings.maxValueCcy
    });

    // Use debounced save to reduce localStorage writes
    debouncedSave(settings);
}

export function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let s = null;

    if (saved) {
        try {
            s = JSON.parse(saved);
        } catch (e) {
            console.warn('Failed to parse saved settings', e);
        }
    }

    // Initialize column order
    if (s && s.columnOrder && s.columnOrder.length > 0) {
        // Merge new columns from COLUMN_DEFS that are missing in saved order
        const currentKeys = COLUMN_DEFS.map(c => c.key);
        const savedKeys = new Set(s.columnOrder);
        currentKeys.forEach(key => {
            if (!savedKeys.has(key)) {
                // Insert before col-distToLiq if possible, else append
                if (key === 'col-liqPx') {
                    const idx = s.columnOrder.indexOf('col-distToLiq');
                    if (idx > -1) s.columnOrder.splice(idx, 0, key);
                    else s.columnOrder.push(key);
                } else {
                    s.columnOrder.push(key);
                }
            }
        });
        console.log('Setting columnOrder from saved:', s.columnOrder);
        setColumnOrder(s.columnOrder);
    } else {
        // Initialize with default column order
        const defaultOrder = COLUMN_DEFS.map(c => c.key);
        console.log('Setting default columnOrder:', defaultOrder);
        setColumnOrder(defaultOrder);
        s = s || {};
        s.columnOrder = defaultOrder;
    }

    // Initialize visible columns
    if (s && s.visibleColumns && s.visibleColumns.length > 0) {
        // Filter out invalid keys from visibleColumns
        const validKeys = new Set(COLUMN_DEFS.map(c => c.key));
        s.visibleColumns = s.visibleColumns.filter(key => validKeys.has(key));

        // If after filtering we have no columns, reset to all
        if (s.visibleColumns.length === 0) {
            console.warn('All saved visibleColumns were invalid, resetting to default');
            s.visibleColumns = COLUMN_DEFS.map(c => c.key);
        } else {
            // Merge new columns (if any are missing from saved but exist in defs)
            // Note: We don't force-add new columns here to respect user's choice of hidden columns,
            // unless we want to auto-show new features.
            // For now, let's only add them if the user hasn't explicitly hidden them?
            // Actually, safe bet is to append new columns so user sees them.
            const savedKeys = new Set(s.visibleColumns);
            COLUMN_DEFS.forEach(def => {
                if (!savedKeys.has(def.key)) {
                    // But wait, if user intentionally hid it?
                    // We can't distinguish "hidden by user" vs "new column".
                    // Let's assume if it's not in saved, it might be new.
                    // But for now, let's NOT auto-add to visibleColumns to respect privacy,
                    // UNLESS the user has "All" visible?
                    // Let's stick to: Ensure valid keys.
                }
            });
        }

        console.log('Setting visibleColumns from saved (sanitized):', s.visibleColumns);
        setVisibleColumns(s.visibleColumns);
        applyColumnVisibility();
        updateColumnSelectDisplay();
    } else {
        // Initialize with all columns visible
        const defaultVisible = COLUMN_DEFS.map(c => c.key);
        console.log('Setting default visibleColumns:', defaultVisible);
        setVisibleColumns(defaultVisible);
        s = s || {};
        s.visibleColumns = defaultVisible;
    }

    // Ensure columnOrder contains all columns from COLUMN_DEFS
    const currentColumnOrder = getColumnOrder();
    if (!currentColumnOrder || currentColumnOrder.length === 0) {
        const defaultOrder = COLUMN_DEFS.map(c => c.key);
        setColumnOrder(defaultOrder);
    } else {
        // Check for missing columns in columnOrder and append them
        const allKeys = COLUMN_DEFS.map(c => c.key);
        const existingKeys = new Set(currentColumnOrder);
        let updatedOrder = [...currentColumnOrder];
        let hasChanges = false;
        
        allKeys.forEach(key => {
            if (!existingKeys.has(key)) {
                updatedOrder.push(key);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            console.log('Updating columnOrder with missing columns:', updatedOrder);
            setColumnOrder(updatedOrder);
        }
    }

    // Load other settings if they exist
    if (!s) return;

    if (s.showSymbols !== undefined) {
        setShowSymbols(s.showSymbols);
        const btnMobile = document.getElementById('btnShowSymMobile');
        const btnDesktop = document.getElementById('btnShowSymDesktop');
        if (btnMobile) {
            btnMobile.textContent = s.showSymbols ? 'Sim' : 'Não';
            btnMobile.classList.toggle('active', s.showSymbols);
        }
        if (btnDesktop) {
            btnDesktop.textContent = s.showSymbols ? 'On' : 'Off';
            btnDesktop.classList.toggle('active', s.showSymbols);
        }
    }
    if (s.chartMode) {
        setChartMode(s.chartMode);
        document.querySelectorAll('.tab[data-chart]').forEach(t => {
            t.classList.toggle('active', t.dataset.chart === s.chartMode);
        });
        const bubbleCtrls = document.querySelectorAll('.js-bubble-size-ctrl');
        bubbleCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'scatter') ? 'block' : 'none');
        const bubbleOpacityCtrls = document.querySelectorAll('.js-bubble-opacity-ctrl');
        bubbleOpacityCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'scatter') ? 'block' : 'none');
        const lineThicknessCtrls = document.querySelectorAll('.js-line-thickness-ctrl');
        lineThicknessCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'lines') ? 'block' : 'none');
        const aggCtrls = document.querySelectorAll('.js-aggregation-ctrl');
        aggCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'column') ? 'block' : 'none');
    }
    if (s.bubbleScale) {
        setBubbleScale(s.bubbleScale);
        const bubbleSizeVals = document.querySelectorAll('.js-bubble-size-val');
        const bubbleSizeRanges = document.querySelectorAll('.js-bubble-size-range');
        bubbleSizeVals.forEach(el => el.textContent = s.bubbleScale.toFixed(1));
        bubbleSizeRanges.forEach(el => el.value = s.bubbleScale);
    }
    if (s.bubbleOpacity) {
        setBubbleOpacity(s.bubbleOpacity);
        const bubbleOpacityVals = document.querySelectorAll('.js-bubble-opacity-val');
        const bubbleOpacityRanges = document.querySelectorAll('.js-bubble-opacity-range');
        bubbleOpacityVals.forEach(el => el.textContent = s.bubbleOpacity.toFixed(2));
        bubbleOpacityRanges.forEach(el => el.value = s.bubbleOpacity);
    }
    if (s.lineThickness) {
        setLineThickness(s.lineThickness);
        const lineThicknessVals = document.querySelectorAll('.js-line-thickness-val');
        const lineThicknessRanges = document.querySelectorAll('.js-line-thickness-range');
        lineThicknessVals.forEach(el => el.textContent = s.lineThickness);
        lineThicknessRanges.forEach(el => el.value = s.lineThickness);
    }
    if (s.aggregationFactor) {
        setAggregationFactor(s.aggregationFactor);
        const aggregationVals = document.querySelectorAll('.js-aggregation-val');
        const aggregationRanges = document.querySelectorAll('.js-aggregation-range');
        aggregationVals.forEach(el => el.textContent = s.aggregationFactor);
        aggregationRanges.forEach(el => el.value = s.aggregationFactor);
    }
    if (s.decimalPlaces !== undefined) {
        setDecimalPlaces(s.decimalPlaces);
        const decimalPlacesVals = document.querySelectorAll('.js-decimal-places-val');
        const decimalPlacesRanges = document.querySelectorAll('.js-decimal-places-range');
        decimalPlacesVals.forEach(el => el.textContent = s.decimalPlaces);
        decimalPlacesRanges.forEach(el => el.value = s.decimalPlaces);
    }
    if (s.fontSize !== undefined) {
        setFontSize(s.fontSize);
        const fontSizeVals = document.querySelectorAll('.js-font-size-val');
        const fontSizeRanges = document.querySelectorAll('.js-font-size-range');
        fontSizeVals.forEach(el => el.textContent = s.fontSize);
        fontSizeRanges.forEach(el => el.value = s.fontSize);
    }
    if (s.fontSizeKnown !== undefined) {
        setFontSizeKnown(s.fontSizeKnown);
        const fontSizeKnownVals = document.querySelectorAll('.js-font-size-known-val');
        const fontSizeKnownRanges = document.querySelectorAll('.js-font-size-known-range');
        fontSizeKnownVals.forEach(el => el.textContent = s.fontSizeKnown);
        fontSizeKnownRanges.forEach(el => el.value = s.fontSizeKnown);
    }
    if (s.rowHeight !== undefined) {
        setRowHeight(s.rowHeight);
        const rowHeightVals = document.querySelectorAll('.js-row-height-val');
        const rowHeightRanges = document.querySelectorAll('.js-row-height-range');
        rowHeightVals.forEach(el => el.textContent = s.rowHeight);
        rowHeightRanges.forEach(el => el.value = s.rowHeight);
        document.documentElement.style.setProperty('--row-height', s.rowHeight + 'px');
    }
    if (s.tooltipDelay !== undefined) {
        setTooltipDelay(s.tooltipDelay);
        const tooltipDelayVals = document.querySelectorAll('.js-tooltip-delay-val');
        const tooltipDelayRanges = document.querySelectorAll('.js-tooltip-delay-range');
        tooltipDelayVals.forEach(el => el.textContent = s.tooltipDelay + 'ms');
        tooltipDelayRanges.forEach(el => el.value = s.tooltipDelay);
    }
    if (s.minValue) document.getElementById('minValue').value = s.minValue;
    if (s.coinFilter) {
        document.getElementById('coinFilter').value = s.coinFilter;
        document.getElementById('coinSearch').value = s.coinFilter;
    }
    if (s.sideFilter) cbSetValue('sideFilter', s.sideFilter);
    if (s.minLev) document.getElementById('minLev').value = s.minLev;
    if (s.maxLev) document.getElementById('maxLev').value = s.maxLev;
    if (s.minSize) document.getElementById('minSize').value = s.minSize;
    if (s.minSzi) document.getElementById('minSzi').value = s.minSzi;
    if (s.maxSzi) document.getElementById('maxSzi').value = s.maxSzi;
    if (s.minValueCcy) document.getElementById('minValueCcy').value = s.minValueCcy;
    if (s.maxValueCcy) document.getElementById('maxValueCcy').value = s.maxValueCcy;

    console.log('Loading VALUE column data:', {
        minValueCcy: s.minValueCcy,
        maxValueCcy: s.maxValueCcy
    });
    if (s.minEntryCcy) document.getElementById('minEntryCcy').value = s.minEntryCcy;
    if (s.maxEntryCcy) document.getElementById('maxEntryCcy').value = s.maxEntryCcy;
    if (s.minUpnl) document.getElementById('minUpnl').value = s.minUpnl;
    if (s.maxUpnl) document.getElementById('maxUpnl').value = s.maxUpnl;
    if (s.minFunding) document.getElementById('minFunding').value = s.minFunding;
    if (s.levTypeFilter) cbSetValue('levTypeFilter', s.levTypeFilter);
    if (s.currencySelect) cbSetValue('currencySelect', s.currencySelect);
    if (s.entryCurrencySelect) cbSetValue('entryCurrencySelect', s.entryCurrencySelect);

    console.log('Loading currency settings:', {
        currencySelect: s.currencySelect,
        entryCurrencySelect: s.entryCurrencySelect
    });

    // Trigger currency change handler to update state and headers
    if (s.currencySelect || s.entryCurrencySelect) {
        console.log('Triggering onCurrencyChange after loading settings');
        // Import and call onCurrencyChange
        import('../events/handlers.js').then(({ onCurrencyChange }) => {
            onCurrencyChange();
        });
    }
    if (s.coinFilter) {
        document.getElementById('coinFilter').value = s.coinFilter;
    }
    if (s.selectedCoins) {
        console.log('Loading selectedCoins from settings:', s.selectedCoins);
        setSelectedCoins(s.selectedCoins);
        updateCoinSearchLabel();
        renderQuotesPanel();
    } else if (s.coinFilter) {
        // Fallback for old coinFilter format
        console.log('Using fallback coinFilter:', s.coinFilter);
        document.getElementById('coinSearch').value = s.coinFilter;
    }
    if (s.priceMode) {
        setPriceMode(s.priceMode);
        updatePriceModeUI();
    }
    if (s.priceUpdateInterval) {
        setPriceUpdateInterval(s.priceUpdateInterval);
        const priceIntervalVals = document.querySelectorAll('.js-price-interval-val');
        const priceIntervalRanges = document.querySelectorAll('.js-price-interval-range');
        priceIntervalVals.forEach(el => el.textContent = (s.priceUpdateInterval / 1000) + 's');
        priceIntervalRanges.forEach(el => el.value = s.priceUpdateInterval / 1000);
    }
    if (s.columnWidths) {
        // columnWidths = s.columnWidths;
        // applyColumnWidths();
    }
    if (s.rankingLimit) {
        const rankingLimits = document.querySelectorAll('.js-ranking-limit');
        rankingLimits.forEach(el => el.value = s.rankingLimit);
        setRankingLimit(s.rankingLimit);
    }
    if (s.colorMaxLev) {
        const colorMaxLevs = document.querySelectorAll('.js-color-max-lev');
        colorMaxLevs.forEach(el => el.value = s.colorMaxLev);
        setColorMaxLev(s.colorMaxLev);
    }
    if (s.chartHighLevSplit !== undefined) {
        const chartHighLevSplits = document.querySelectorAll('.js-chart-high-lev-split');
        chartHighLevSplits.forEach(el => el.value = s.chartHighLevSplit);
        setChartHighLevSplit(s.chartHighLevSplit);
    }
    if (s.activeWindow) {
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.window === s.activeWindow);
        });
    }
    if (s.sortKey) setSortKey(s.sortKey);
    if (s.sortDir) setSortDir(s.sortDir);
    if (s.chartHeight) {
        const section = document.getElementById('chart-section');
        if (section) {
            section.style.height = s.chartHeight + 'px';
        }
    }
    if (s.liqChartHeight) {
        const section = document.getElementById('liq-chart-section');
        if (section) {
            section.style.height = s.liqChartHeight + 'px';
        }
    }
    if (s.scatterChartState) setSavedScatterState(s.scatterChartState);
    if (s.liqChartState) setSavedLiqState(s.liqChartState);
    if (s.leverageColors) {
        setLeverageColors(s.leverageColors);
        const colorLongLow = document.querySelectorAll('.js-color-long-low');
        const colorLongHigh = document.querySelectorAll('.js-color-long-high');
        const colorShortLow = document.querySelectorAll('.js-color-short-low');
        const colorShortHigh = document.querySelectorAll('.js-color-short-high');
        colorLongLow.forEach(el => el.value = s.leverageColors.longLow || '#22c55e');
        colorLongHigh.forEach(el => el.value = s.leverageColors.longHigh || '#16a34a');
        colorShortLow.forEach(el => el.value = s.leverageColors.shortLow || '#ef4444');
        colorShortHigh.forEach(el => el.value = s.leverageColors.shortHigh || '#dc2626');

        // Update CSS variables with loaded colors
        document.documentElement.style.setProperty('--long-low-color', s.leverageColors.longLow || '#22c55e');
        document.documentElement.style.setProperty('--long-high-color', s.leverageColors.longHigh || '#16a34a');
        document.documentElement.style.setProperty('--short-low-color', s.leverageColors.shortLow || '#ef4444');
        document.documentElement.style.setProperty('--short-high-color', s.leverageColors.shortHigh || '#dc2626');
    } else {
        // Initialize CSS variables with default colors
        document.documentElement.style.setProperty('--long-low-color', '#22c55e');
        document.documentElement.style.setProperty('--long-high-color', '#16a34a');
        document.documentElement.style.setProperty('--short-low-color', '#ef4444');
        document.documentElement.style.setProperty('--short-high-color', '#dc2626');
    }
    if (s.columnWidth !== undefined) {
        setColumnWidth(s.columnWidth);
        // Sync both mobile and desktop controls
        const columnWidthInputs = document.querySelectorAll('.js-column-width-input');
        const columnWidthVals = document.querySelectorAll('.js-column-width-val');
        columnWidthInputs.forEach(el => el.value = s.columnWidth);
        columnWidthVals.forEach(el => el.textContent = s.columnWidth);
    }
    if (s.gridSpacing !== undefined) {
        setGridSpacing(s.gridSpacing);
        // Sync both mobile and desktop controls
        const gridSpacingRanges = document.querySelectorAll('.js-grid-spacing-range');
        const gridSpacingVals = document.querySelectorAll('.js-grid-spacing-val');
        gridSpacingRanges.forEach(el => el.value = s.gridSpacing);
        gridSpacingVals.forEach(el => el.textContent = s.gridSpacing);
    }
    if (s.minBtcVolume !== undefined) {
        setMinBtcVolume(s.minBtcVolume);
        const minBtcVolumeEls = document.querySelectorAll('.js-min-btc-volume');
        minBtcVolumeEls.forEach(el => el.value = s.minBtcVolume);
    }
    if (s.aggInterval !== undefined) {
        setAggInterval(s.aggInterval);
        const aggIntervalEls = document.querySelectorAll('.js-agg-interval');
        aggIntervalEls.forEach(el => el.value = s.aggInterval);
    }
    if (s.aggTableHeight !== undefined) {
        setAggTableHeight(s.aggTableHeight);
        const section = document.getElementById('aggSectionContent');
        if (section) {
            const wrap = section.querySelector('.table-wrap');
            if (wrap) wrap.style.maxHeight = s.aggTableHeight + 'px';
        }
    }
    if (s.aggVolumeUnit !== undefined) {
        setAggVolumeUnit(s.aggVolumeUnit);
        updateAggVolumeUI(s.aggVolumeUnit);
    }
    if (s.isZenMode !== undefined) {
        setIsZenMode(s.isZenMode);
        // We will trigger the UI update for Zen Mode in init.js after settings are loaded
    }
    if (s.showAggSymbols !== undefined) {
        setShowAggSymbols(s.showAggSymbols);
        const checkbox = document.getElementById('showAggSymbolsDrawer');
        if (checkbox) checkbox.checked = s.showAggSymbols;
    }
    if (s.aggZoneColors) {
        setAggZoneColors(s.aggZoneColors);
        if (document.getElementById('colorAggBuyStrong')) document.getElementById('colorAggBuyStrong').value = s.aggZoneColors.buyStrong || '#22c55e';
        if (document.getElementById('colorAggBuyNormal')) document.getElementById('colorAggBuyNormal').value = s.aggZoneColors.buyNormal || '#4ade80';
        if (document.getElementById('colorAggSellStrong')) document.getElementById('colorAggSellStrong').value = s.aggZoneColors.sellStrong || '#ef4444';
        if (document.getElementById('colorAggSellNormal')) document.getElementById('colorAggSellNormal').value = s.aggZoneColors.sellNormal || '#f87171';
    }
    if (s.aggHighlightColor !== undefined) {
        setAggHighlightColor(s.aggHighlightColor);
        if (document.getElementById('colorAggHighlight')) document.getElementById('colorAggHighlight').value = s.aggHighlightColor || '#facc15';
    }
    if (s.lastSeenAccountValues) {
        setLastSeenAccountValues(s.lastSeenAccountValues);
    }
}

function updateAggVolumeUI(unit) {
    const tabs = document.querySelectorAll('.js-agg-volume-unit-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.unit === unit));
}
