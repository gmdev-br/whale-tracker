// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Events Initialization
// ═══════════════════════════════════════════════════════════

console.log('init.js loaded (v2)');

// ═══════════════════════════════════════════════════════════
// CRITICAL: Handle bfcache restoration for drag-and-drop
// When page is restored from back-forward cache, the DOM may
// still contain the .dragging-initialized marker, preventing
// drag-and-drop from re-initializing after F5
// ═══════════════════════════════════════════════════════════
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log('%c[BFCACHE] Page restored from bfcache, cleaning up...', 'background: #FF5722; color: white; font-weight: bold;');
        const marker = document.querySelector('.dragging-initialized');
        if (marker) {
            marker.remove();
            console.log('%c[BFCACHE] ✓ Removed .dragging-initialized marker', 'background: #4CAF50; color: white; font-weight: bold;');
        }
    }
});

import {
    getShowSymbols, getRankingLimit, getColorMaxLev, getChartHighLevSplit,
    getBubbleScale, getAggregationFactor, getDecimalPlaces, setAllRows, setActiveWindow, getActiveWindow, getChartMode, getIsZenMode, getColumnWidth, getColumnOrder
} from '../state.js';
import { loadTableData } from '../storage/data.js';
import { chartPlugins, chartOptions, chartMechanics } from '../charts/config.js';
import { saveSettings, loadSettings } from '../storage/settings.js';
import { updateRankingPanel, renderQuotesPanel, removeCoin as removeCoinFn, handlePriceModeClick, updatePriceModeUI, startPriceTicker } from '../ui/panels.js';
import { renderScatterPlot, getScatterChart } from '../charts/scatter.js';
import { renderLiqScatterPlot, getLiqChartInstance } from '../charts/liquidation.js';
import { updateStats, renderTable, renderTableImmediate, updateTableDataOnly } from '../ui/table.js';
import { startScan, stopScan, togglePause, finishScan } from '../api/leaderboard.js';
import { updateCoinFilter, cbOpen, openCombobox, cbSelect as cbSelectFn, selectCoin as selectCoinFn, cbInit, setupClickOutsideHandler } from '../ui/combobox.js';
import { saveTableData } from '../storage/data.js';
import { setLastSaveTime, setRenderPending } from '../state.js';
import { fetchAllMids } from '../api/exchangeRates.js';
import {
    updateSpeed, updateRankingLimit, updateColorSettings, updateChartFilters,
    updateBubbleSize, updateBubbleOpacity, updateLineThickness, updateAggregation, setChartModeHandler, updateChartHeight,
    updateLiqChartHeight, onCurrencyChange, openColumnCombobox, closeColumnComboboxDelayed,
    renderColumnDropdown as renderColumnDropdownFn, toggleColumn as toggleColumnFn, showAllColumns as showAllColumnsFn, hideAllColumns as hideAllColumnsFn, updateColumnSelectDisplay, applyColumnOrder,
    applyColumnWidths, applyColumnVisibility, toggleShowSymbols, toggleShowAggSymbols, updatePriceInterval, updateDecimalPlaces, updateFontSize, updateFontSizeKnown, updateRowHeight, updateLeverageColors, updateGridSpacing, updateMinBtcVolume, updateAggInterval, updateAggTableHeight, updateAggVolumeUnit, scrollToCurrentPrice,
    toggleZenMode, updateAggZoneColors, updateAggHighlightColor, updateCompactFormat
} from './handlers.js';
import { initColumnWidthControl, applyColumnWidth } from '../ui/columnWidth.js';
import { setWindow, setStatus, setProgress } from '../ui/status.js';
import { sortBy, updateSortIndicators } from '../ui/filters.js';
import { CURRENCY_META } from '../config.js';
import { eventManager } from '../utils/eventManager.js';
import { getElement, getElements } from '../utils/domCache.js';

// ── Swipe Gestures for Navigation ──
function setupSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    const swipeThreshold = 50;

    function handleTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }

    function handleTouchEnd(e) {
        if (!touchStartX || !touchStartY) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Only handle horizontal swipes
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
            // Check if we're on a tab element
            const target = e.target;
            const tab = target.closest('.tab');

            if (tab) {
                const tabs = Array.from(tab.parentElement.querySelectorAll('.tab'));
                const currentIndex = tabs.indexOf(tab);

                if (diffX > 0 && currentIndex > 0) {
                    // Swipe right - go to previous tab
                    tabs[currentIndex - 1].click();
                } else if (diffX < 0 && currentIndex < tabs.length - 1) {
                    // Swipe left - go to next tab
                    tabs[currentIndex + 1].click();
                }
            }
        }

        touchStartX = 0;
        touchStartY = 0;
    }

    // Use eventManager for better cleanup
    eventManager.on(document, 'touchstart', handleTouchStart, { passive: true });
    eventManager.on(document, 'touchend', handleTouchEnd);
}

// ── Pull-to-Refresh ──
function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const pullThreshold = 100;
    const pullToRefresh = getElement('pullToRefresh');

    if (!pullToRefresh) return;

    function handleTouchStart(e) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
        }
    }

    function handleTouchMove(e) {
        if (window.scrollY !== 0) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && !isPulling) {
            isPulling = true;
        }

        if (isPulling && diff > 0) {
            e.preventDefault();
            const progress = Math.min(diff / pullThreshold, 1);
            pullToRefresh.style.transform = `translateY(${diff}px)`;

            if (progress >= 1) {
                pullToRefresh.classList.add('active');
            } else {
                pullToRefresh.classList.remove('active');
            }
        }
    }

    function handleTouchEnd() {
        if (!isPulling) return;

        const isActive = pullToRefresh.classList.contains('active');

        if (isActive) {
            // Trigger refresh
            window.location.reload();
        } else {
            // Reset
            pullToRefresh.style.transform = 'translateY(-100%)';
            pullToRefresh.classList.remove('active');
        }

        isPulling = false;
        startY = 0;
    }

    // Use eventManager for better cleanup
    eventManager.on(document, 'touchstart', handleTouchStart, { passive: true });
    eventManager.on(document, 'touchmove', handleTouchMove, { passive: false });
    eventManager.on(document, 'touchend', handleTouchEnd);
}

// ── Splash Screen ──
function setupSplashScreen() {
    const splashScreen = getElement('splashScreen');
    if (!splashScreen) return;

    // Hide splash screen - handle both cases: already loaded or still loading
    function hideSplashScreen() {
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 300);
        }, 1000);
    }

    // Check if page is already loaded
    if (document.readyState === 'complete') {
        hideSplashScreen();
    } else {
        // Page still loading, wait for load event
        eventManager.on(window, 'load', hideSplashScreen);
    }
}

function setupEventListeners() {
    console.log('setupEventListeners called');
    // Setup click outside handler for comboboxes
    setupClickOutsideHandler();

    // Setup pull-to-refresh
    setupPullToRefresh();

    // Setup splash screen
    setupSplashScreen();

    // Setup swipe gestures
    setupSwipeGestures();

    // Mobile menu toggle
    const menuToggle = getElement('menuToggle');
    const mobileMenu = getElement('mobileMenu');
    const mobileMenuOverlay = getElement('mobileMenuOverlay');
    const mobileMenuClose = getElement('mobileMenuClose');

    function openMobileMenu() {
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (menuToggle) {
        eventManager.on(menuToggle, 'click', openMobileMenu);
    }

    if (mobileMenuClose) {
        eventManager.on(mobileMenuClose, 'click', closeMobileMenu);
    }

    if (mobileMenuOverlay) {
        eventManager.on(mobileMenuOverlay, 'click', closeMobileMenu);
    }

    // Close menu on escape key
    eventManager.on(document, 'keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
            closeSettings();
        }
    });

    // Settings Drawer and Advanced Filters
    const settingsToggle = getElement('settingsToggle');
    const settingsDrawer = getElement('settingsDrawer');
    const settingsOverlay = getElement('settingsOverlay');
    const settingsDrawerClose = getElement('settingsDrawerClose');

    function openSettings() {
        if (settingsDrawer) settingsDrawer.classList.add('active');
        if (settingsOverlay) settingsOverlay.classList.add('active');
    }

    function closeSettings() {
        if (settingsDrawer) settingsDrawer.classList.remove('active');
        if (settingsOverlay) settingsOverlay.classList.remove('active');
    }

    if (settingsToggle) eventManager.on(settingsToggle, 'click', openSettings);
    if (settingsDrawerClose) eventManager.on(settingsDrawerClose, 'click', closeSettings);
    if (settingsOverlay) eventManager.on(settingsOverlay, 'click', closeSettings);

    const toggleFiltersBtn = getElement('toggleFiltersBtn');
    const advancedFiltersRow = getElement('advancedFiltersRow');
    if (toggleFiltersBtn && advancedFiltersRow) {
        eventManager.on(toggleFiltersBtn, 'click', () => {
            const isHidden = advancedFiltersRow.style.display === 'none';
            advancedFiltersRow.style.display = isHidden ? 'table-row' : 'none';
            toggleFiltersBtn.classList.toggle('active', isHidden);
            // Optionally trigger resize or update handlers if adjusting headers
            if (typeof updateHeaderWidths === 'function') {
                updateHeaderWidths();
            }
        });
    }

    // Collapsible sections - use event delegation
    const collapseToggles = getElements('.js-collapse-toggle');
    collapseToggles.forEach(toggle => {
        const targetId = toggle.getAttribute('data-target');
        const wrapper = toggle.closest('.section-wrapper');

        // Load saved state
        const isCollapsed = localStorage.getItem(`collapse_${targetId}`) === 'true';
        if (isCollapsed && wrapper) {
            wrapper.classList.add('collapsed');
        }

        eventManager.on(toggle, 'click', () => {
            if (wrapper) {
                wrapper.classList.toggle('collapsed');
                const currentlyCollapsed = wrapper.classList.contains('collapsed');
                localStorage.setItem(`collapse_${targetId}`, currentlyCollapsed);
            }
        });
    });

    // Scan controls
    const scanBtn = getElement('scanBtn');
    if (scanBtn) {
        eventManager.on(scanBtn, 'click', () => startScan({
            setStatus,
            setProgress,
            fetchAllMids,
            updateStats,
            updateCoinFilter,
            renderTable,
            updateTableDataOnly,
            saveTableData,
            finishScan,
            setLastSaveTime,
            setRenderPending
        }));
    }

    const stopBtn = getElement('stopBtn');
    if (stopBtn) {
        eventManager.on(stopBtn, 'click', () => stopScan(setStatus));
    }

    const pauseBtn = getElement('pauseBtn');
    if (pauseBtn) {
        eventManager.on(pauseBtn, 'click', () => togglePause(setStatus));
    }

    // Speed control - attach to both mobile and desktop - use event delegation
    const speedRanges = getElements('.js-speed-range');
    speedRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateSpeed(e.target.value);
        });
    });

    // Price update interval control - attach to both mobile and desktop - use event delegation
    const priceIntervalRanges = getElements('.js-price-interval-range');
    priceIntervalRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updatePriceInterval(e.target.value);
        });
    });

    // Window tabs - use event delegation
    eventManager.delegate(document, 'click', '.tab[data-window]', (e, target) => {
        setWindow(target, getActiveWindow(), setActiveWindow, saveSettings, renderTable);
    });

    // Price mode tabs - use event delegation
    eventManager.delegate(document, 'click', '.tab[data-mode]', (e, target) => {
        handlePriceModeClick(target);
    });

    // Column sorting - use event delegation
    const table = getElement('positionsTable');
    if (table) {
        eventManager.delegate(table, 'click', 'th[id^="th-"]', (e, target) => {
            // Skip if currently resizing
            if (document.body.classList.contains('resizing')) return;

            const resizer = target.querySelector('.resizer');
            if (resizer && (e.target === resizer || resizer.contains(e.target))) return;

            const key = target.id.replace('th-', '');
            sortBy(key, renderTable);
        });
    }

    // Filter inputs - use getElement and eventManager
    const filterInputs = ['minValue', 'coinFilter', 'sideFilter', 'minLev', 'maxLev', 'minSize',
        'minSzi', 'maxSzi', 'minValueCcy', 'maxValueCcy', 'minEntryCcy', 'maxEntryCcy',
        'minUpnl', 'maxUpnl', 'minFunding', 'levTypeFilter', 'addressFilter'];

    filterInputs.forEach(id => {
        const el = getElement(id);
        if (el) {
            eventManager.on(el, 'change', () => {
                saveSettings();
                renderTable();
            });

            // Also add input event listener for number inputs to save as user types
            if (el.type === 'number') {
                eventManager.on(el, 'input', () => {
                    saveSettings();
                });
            }
        }
    });

    // Compact format toggle - use getElements and eventManager
    const compactToggles = getElements('.js-compact-toggle');
    compactToggles.forEach(toggle => {
        eventManager.on(toggle, 'change', updateCompactFormat);
    });

    // Show symbols toggle - use getElement and eventManager
    const btnShowSymMobile = getElement('btnShowSymMobile');
    const btnShowSymDesktop = getElement('btnShowSymDesktop');
    if (btnShowSymMobile) {
        eventManager.on(btnShowSymMobile, 'click', toggleShowSymbols);
    }
    if (btnShowSymDesktop) {
        eventManager.on(btnShowSymDesktop, 'click', toggleShowSymbols);
    }

    // Aggregation symbols toggle - use getElement and eventManager
    const showAggSymbolsDrawer = getElement('showAggSymbolsDrawer');
    if (showAggSymbolsDrawer) {
        eventManager.on(showAggSymbolsDrawer, 'change', toggleShowAggSymbols);
    }

    // Aggregation color pickers - use getElement and eventManager
    const aggColors = [
        'colorLiquidationBuyStrong', 'colorLiquidationBuyNormal',
        'colorLiquidationSellStrong', 'colorLiquidationSellNormal'
    ];
    aggColors.forEach(id => {
        const el = getElement(id);
        if (el) eventManager.on(el, 'input', updateAggZoneColors);
    });

    // Highlight color picker - use getElement and eventManager
    const highlightColorEl = getElement('colorLiquidationHighlight');
    if (highlightColorEl) {
        eventManager.on(highlightColorEl, 'input', updateAggHighlightColor);
    }

    // Ranking limit - attach to both mobile and desktop - use getElements and eventManager
    const rankingLimits = getElements('.js-ranking-limit');
    rankingLimits.forEach(limit => {
        eventManager.on(limit, 'change', updateRankingLimit);
    });

    // Color settings - attach to both mobile and desktop - use getElements and eventManager
    const colorMaxLevs = getElements('.js-color-max-lev');
    colorMaxLevs.forEach(el => {
        eventManager.on(el, 'change', updateColorSettings);
    });

    const chartHighLevSplits = getElements('.js-chart-high-lev-split');
    chartHighLevSplits.forEach(el => {
        eventManager.on(el, 'change', updateChartFilters);
    });

    // Bubble size - attach to both mobile and desktop - use getElements and eventManager
    const bubbleSizeRanges = getElements('.js-bubble-size-range');
    bubbleSizeRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateBubbleSize(e.target.value);
        });
    });

    // Bubble opacity - attach to both mobile and desktop - use getElements and eventManager
    const bubbleOpacityRanges = getElements('.js-bubble-opacity-range');
    bubbleOpacityRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateBubbleOpacity(e.target.value);
        });
    });

    // Line thickness - attach to both mobile and desktop - use getElements and eventManager
    const lineThicknessRanges = getElements('.js-line-thickness-range');
    lineThicknessRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateLineThickness(e.target.value);
        });
    });

    // Aggregation mode - attach to both mobile and desktop - use getElements and eventManager
    const aggregationRanges = getElements('.js-aggregation-range');
    aggregationRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateAggregation(e.target.value);
        });
    });

    // Aggregation Table Interval - attach to both mobile and desktop - use getElements and eventManager
    const aggIntervalInputs = getElements('.js-agg-interval');
    aggIntervalInputs.forEach(input => {
        eventManager.on(input, 'input', (e) => {
            updateAggInterval(e.target.value);
        });
    });

    // Decimal places control - attach to both mobile and desktop - use getElements and eventManager
    const decimalPlacesRanges = getElements('.js-decimal-places-range');
    decimalPlacesRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateDecimalPlaces(e.target.value);
        });
    });

    // Font size control - attach to both mobile and desktop - use getElements and eventManager
    const fontSizeRanges = getElements('.js-font-size-range');
    fontSizeRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateFontSize(e.target.value);
        });
        eventManager.on(range, 'change', (e) => {
            updateFontSize(e.target.value);
        });
        eventManager.on(range, 'keyup', (e) => {
            updateFontSize(e.target.value);
        });
    });

    // Font size for known addresses control - attach to both mobile and desktop - use getElements and eventManager
    const fontSizeKnownRanges = getElements('.js-font-size-known-range');
    fontSizeKnownRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateFontSizeKnown(e.target.value);
        });
        eventManager.on(range, 'change', (e) => {
            updateFontSizeKnown(e.target.value);
        });
        eventManager.on(range, 'keyup', (e) => {
            updateFontSizeKnown(e.target.value);
        });
    });

    // Row height control - attach to both mobile and desktop - use getElements and eventManager
    const rowHeightRanges = getElements('.js-row-height-range');
    rowHeightRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateRowHeight(e.target.value);
        });
        eventManager.on(range, 'change', (e) => {
            updateRowHeight(e.target.value);
        });
        eventManager.on(range, 'keyup', (e) => {
            updateRowHeight(e.target.value);
        });
    });

    // Leverage color inputs - attach to both mobile and desktop - use getElements and eventManager
    const colorInputs = [
        { id: 'colorLongLow', class: 'js-color-long-low' },
        { id: 'colorLongHigh', class: 'js-color-long-high' },
        { id: 'colorShortLow', class: 'js-color-short-low' },
        { id: 'colorShortHigh', class: 'js-color-short-high' }
    ];
    colorInputs.forEach(item => {
        const elements = getElements(`.${item.class}`);
        elements.forEach(el => {
            eventManager.on(el, 'change', updateLeverageColors);
        });
    });

    // Chart mode tabs - use event delegation
    eventManager.delegate(document, 'click', '.tab[data-chart]', (e, target) => {
        setChartModeHandler(target.dataset.chart);
    });

    // Chart height controls
    const chartSection = getElement('chart-section');
    if (chartSection) {
        setupResizable(chartSection, updateChartHeight);
    }

    const liqChartSection = getElement('liq-chart-section');
    if (liqChartSection) {
        setupResizable(liqChartSection, updateLiqChartHeight);
    }

    const aggTableSection = getElement('liquidationTableFullSection');
    if (aggTableSection) {
        setupResizable(aggTableSection, updateAggTableHeight);
    }

    const aggTableSectionResumida = getElement('liquidationTableSummarySection');
    if (aggTableSectionResumida) {
        setupResizable(aggTableSectionResumida, updateAggTableHeight);
    }

    // Grid spacing control - attach to both mobile and desktop - use getElements and eventManager
    const gridSpacingRanges = getElements('.js-grid-spacing-range');
    gridSpacingRanges.forEach(range => {
        eventManager.on(range, 'input', (e) => {
            updateGridSpacing(e.target.value);
        });
    });

    // Min BTC Volume control - attach to both mobile and desktop - use getElements and eventManager
    const minBtcVolumeInputs = getElements('.js-min-btc-volume');
    minBtcVolumeInputs.forEach(input => {
        eventManager.on(input, 'input', (e) => {
            updateMinBtcVolume(e.target.value);
        });
    });

    // Price filter controls for chart scale - use getElement and eventManager
    const minEntryCcy = getElement('minEntryCcy');
    const maxEntryCcy = getElement('maxEntryCcy');

    if (minEntryCcy) {
        eventManager.on(minEntryCcy, 'input', () => {
            // Re-render charts to update scale
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            if (scatterChart) {
                scatterChart.destroy();
                renderScatterPlot();
            }
            if (liqChart) {
                liqChart.destroy();
                renderLiqScatterPlot();
            }
        });
    }

    if (maxEntryCcy) {
        eventManager.on(maxEntryCcy, 'input', () => {
            // Re-render charts to update scale
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            if (scatterChart) {
                scatterChart.destroy();
                renderScatterPlot();
            }
            if (liqChart) {
                liqChart.destroy();
                renderLiqScatterPlot();
            }
        });
    }

    // Currency selectors - use getElement and eventManager
    const currencySelect = getElement('currencySelect');
    const entryCurrencySelect = getElement('entryCurrencySelect');
    if (currencySelect) {
        eventManager.on(currencySelect, 'change', onCurrencyChange);
    }
    if (entryCurrencySelect) {
        eventManager.on(entryCurrencySelect, 'change', onCurrencyChange);
    }

    // Column combobox - use getElements and eventManager
    const columnSelectDisplays = getElements('.js-column-select-display');
    columnSelectDisplays.forEach(display => {
        eventManager.on(display, 'focus', openColumnCombobox);
        eventManager.on(display, 'blur', (e) => {
            // Only close if the related target is not within the combobox
            // Check closest combobox wrapper
            const combobox = display.closest('.js-column-combobox');
            if (!combobox || !combobox.contains(e.relatedTarget)) {
                closeColumnComboboxDelayed();
            }
        });
        eventManager.on(display, 'input', (e) => {
            renderColumnDropdownFn(e.target.value);
        });
    });

    // Generic comboboxes - click to open - use getElement and eventManager
    const comboboxIds = ['cb-sideFilter', 'cb-levTypeFilter', 'cb-currencySelect', 'cb-entryCurrencySelect'];

    // Use DOMContentLoaded to ensure elements exist
    function setupComboboxListeners() {
        console.log('Setting up combobox listeners, readyState:', document.readyState);
        comboboxIds.forEach(fullId => {
            const combobox = getElement(fullId);
            console.log(`Combobox ${fullId} found:`, !!combobox);
            if (combobox) {
                eventManager.on(combobox, 'click', (e) => {
                    console.log('Combobox clicked:', fullId);
                    e.preventDefault();
                    e.stopPropagation();
                    // Extract base ID (remove 'cb-' prefix)
                    const baseId = fullId.replace('cb-', '');
                    cbOpen(baseId);
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        eventManager.on(document, 'DOMContentLoaded', setupComboboxListeners);
    } else {
        setupComboboxListeners();
    }

    // Coin combobox - use getElement and eventManager
    const coinSearch = getElement('coinSearch');
    if (coinSearch) {
        eventManager.on(coinSearch, 'click', openCombobox);
    }

    // Zen Mode toggles - use getElement and eventManager
    const zenToggleHeader = getElement('zenToggleHeader');
    if (zenToggleHeader) {
        eventManager.on(zenToggleHeader, 'click', toggleZenMode);
    }

    const zenToggleMobile = getElement('zenToggleMobile');
    if (zenToggleMobile) {
        eventManager.on(zenToggleMobile, 'click', toggleZenMode);
    }

    const zenToggleDrawer = getElement('zenToggleDrawer');
    if (zenToggleDrawer) {
        eventManager.on(zenToggleDrawer, 'change', toggleZenMode);
    }

    const exitZenBtn = getElement('exitZenBtn');
    if (exitZenBtn) {
        eventManager.on(exitZenBtn, 'click', toggleZenMode);
    }

    // Aggregation Volume Unit tabs - use event delegation
    eventManager.delegate(document, 'click', '#liquidationSectionFullWrapper .js-agg-volume-unit-tab, #settingsDrawer .js-agg-volume-unit-tab', (e, target) => {
        updateAggVolumeUnit(target.dataset.unit);
    });

    const scrollToCurrentBtn = getElement('scrollToCurrentBtn');
    if (scrollToCurrentBtn) {
        eventManager.on(scrollToCurrentBtn, 'click', scrollToCurrentPrice);
    }

    // Make cbSelect, selectCoin, and toggleColumn globally accessible for inline onmousedown handlers
    window.cbSelect = (id, value, label, onChangeFn, renderTableFn) => {
        // For currency selectors, use onCurrencyChange, otherwise use renderTable
        if (id === 'currencySelect' || id === 'entryCurrencySelect') {
            cbSelectFn(id, value, label, onCurrencyChange, renderTable);
        } else {
            cbSelectFn(id, value, label, null, renderTable);
        }
    };

    // Make onCurrencyChange globally accessible
    window.onCurrencyChange = onCurrencyChange;
    window.selectCoin = (value, label) => {
        selectCoinFn(value, label);
    };
    window.toggleColumn = (key) => {
        toggleColumnFn(key);
    };
    window.showAllColumns = () => {
        showAllColumnsFn();
    };
    window.hideAllColumns = () => {
        hideAllColumnsFn();
    };
    window.renderColumnDropdown = (query) => {
        renderColumnDropdownFn(query);
    };
    window.removeCoin = (coin) => {
        removeCoinFn(coin);
    };

    // Make chart functions globally accessible for zoom events
    window.getScatterChart = getScatterChart;
    window.getLiqChartInstance = getLiqChartInstance;
}

function setupResizable(element, callback) {
    const resizer = element.querySelector('.chart-resizer');
    if (!resizer) return;

    let isResizing = false;
    let startY, startHeight;

    eventManager.on(resizer, 'mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = element.offsetHeight;
        resizer.classList.add('active');
        e.preventDefault();
    });

    eventManager.on(document, 'mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        callback(newHeight);
    });

    eventManager.on(document, 'mouseup', () => {
        isResizing = false;
        resizer.classList.remove('active');
    });
}

function applyColumnWidthAfterRender() {
    const width = getColumnWidth();
    console.log('applyColumnWidthAfterRender called with width from state:', width);
    applyColumnWidth(width);
}

function initializeCharts() {
    renderScatterPlot();
    renderLiqScatterPlot();
}

function initializePanels() {
    updateRankingPanel();
    renderQuotesPanel();
    updatePriceModeUI();
    initColumnWidthControl();
    // Iniciar o ticker de preços global para garantir atualizações do BTC e Debug Panel
    startPriceTicker();
}

async function loadInitialState() {
    console.log('%c[INIT] ═══ loadInitialState STARTING ═══', 'background: #2196F3; color: white; font-weight: bold; font-size: 14px;');
    console.log('[INIT] Timestamp:', new Date().toISOString());
    
    // ═══════════════════════════════════════════════════════════
    // CRITICAL FIX: Remove any existing drag-and-drop marker from bfcache
    // The bfcache (back-forward cache) may preserve the .dragging-initialized
    // marker in the DOM after F5, preventing drag-and-drop from re-initializing
    // ═══════════════════════════════════════════════════════════
    const existingMarker = document.querySelector('.dragging-initialized');
    if (existingMarker) {
        console.log('%c[INIT] ⚠ Found existing .dragging-initialized marker (from bfcache), removing...', 'background: #FF5722; color: white; font-weight: bold;');
        existingMarker.remove();
        console.log('%c[INIT] ✓ Marker removed', 'background: #4CAF50; color: white; font-weight: bold;');
    } else {
        console.log('[INIT] No existing .dragging-initialized marker found');
    }
    loadTableData(setAllRows);

    // Initialize currency comboboxes FIRST before loading settings
    const currencyOptions = Object.keys(CURRENCY_META).map(ccy => ({
        value: ccy,
        label: ccy
    }));

    console.log('Initializing currency comboboxes with options:', currencyOptions);
    cbInit('currencySelect', currencyOptions, onCurrencyChange);
    cbInit('entryCurrencySelect', currencyOptions, onCurrencyChange);

    // Load settings FIRST so that initializePanels uses correct saved values
    console.log('loadInitialState: Loading settings...');
    loadSettings();

    // THEN initialize panels with the loaded settings values
    console.log('loadInitialState: Initializing panels...');
    initializePanels();

    // Carregar preços atuais e taxas de câmbio antes de renderizar a tabela
    try {
        await Promise.all([
            fetchAllMids(),
            // Import fetchExchangeRates dynamically since it's not imported at the top
            import('../api/exchangeRates.js').then(m => m.fetchExchangeRates())
        ]);
    } catch (e) {
        console.error('Error fetching initial data:', e);
    }

    // Apply sort indicators after loading settings
    updateSortIndicators();

    // Apply column visibility first
    applyColumnVisibility();
    applyColumnWidths();
    updateColumnSelectDisplay();

    // DEBUG: Log columnOrder after loadSettings
    console.log('[loadInitialState] columnOrder after loadSettings:', JSON.stringify(getColumnOrder()));

    // Update chart control visibility based on current mode
    const chartMode = getChartMode();
    const bubbleCtrls = document.querySelectorAll('.js-bubble-size-ctrl');
    const aggCtrls = document.querySelectorAll('.js-aggregation-ctrl');

    bubbleCtrls.forEach(ctrl => {
        ctrl.style.display = (chartMode === 'scatter') ? 'block' : 'none';
    });
    aggCtrls.forEach(ctrl => {
        ctrl.style.display = (chartMode === 'column') ? 'block' : 'none';
    });

    // PERFORMANCE: Consolidated redundant renders into single render
    // Previously there were two renderTableImmediate() calls - one immediate and one after 350ms timeout.
    // This caused unnecessary double rendering on page load. Now we render once after all async effects settle.
    // The safety net delay is kept to ensure all async effects from loadSettings/onCurrencyChange have completed.
    setTimeout(() => {
        console.log('[loadInitialState] Consolidated render after async effects...');
        console.log('[loadInitialState] columnOrder BEFORE renderTableImmediate:', JSON.stringify(getColumnOrder()));
        renderTableImmediate();
        console.log('[loadInitialState] columnOrder AFTER renderTableImmediate:', JSON.stringify(getColumnOrder()));
    }, 350);

    // Apply initial Zen Mode state
    if (getIsZenMode()) {
        document.body.classList.add('zen-mode');
        // Update toggles UI
        const zenToggles = document.querySelectorAll('.js-zen-toggle');
        zenToggles.forEach(t => {
            if (t.type === 'checkbox') t.checked = true;
            else t.classList.add('active');
        });
    }

    // Apply column width after table is rendered
    setTimeout(applyColumnWidthAfterRender, 100);

    // Initialize generic comboboxes with options
    cbInit('sideFilter', [
        { value: '', label: 'All' },
        { value: 'long', label: 'Long' },
        { value: 'short', label: 'Short' }
    ], renderTable);

    cbInit('levTypeFilter', [
        { value: '', label: 'All' },
        { value: 'isolated', label: 'Isolated' },
        { value: 'cross', label: 'Cross' }
    ], renderTable);

    // Currency comboboxes already initialized above in loadInitialState()

    // Set initial values from state
    const btnShowSymMobile = document.getElementById('btnShowSymMobile');
    const btnShowSymDesktop = document.getElementById('btnShowSymDesktop');
    const showSymbols = getShowSymbols();
    if (btnShowSymMobile) {
        btnShowSymMobile.textContent = showSymbols ? 'Sim' : 'Não';
        btnShowSymMobile.classList.toggle('active', showSymbols);
    }
    if (btnShowSymDesktop) {
        btnShowSymDesktop.textContent = showSymbols ? 'On' : 'Off';
        btnShowSymDesktop.classList.toggle('active', showSymbols);
    }

    const speedVals = document.querySelectorAll('.js-speed-val');
    speedVals.forEach(el => {
        el.textContent = '8'; // Default value
    });

    const priceIntervalVals = document.querySelectorAll('.js-price-interval-val');
    priceIntervalVals.forEach(el => {
        el.textContent = '3s'; // Default value
    });

    const rankingLimits = document.querySelectorAll('.js-ranking-limit');
    rankingLimits.forEach(el => {
        el.value = getRankingLimit();
    });

    const colorMaxLevs = document.querySelectorAll('.js-color-max-lev');
    colorMaxLevs.forEach(el => {
        el.value = getColorMaxLev();
    });

    const chartHighLevSplits = document.querySelectorAll('.js-chart-high-lev-split');
    chartHighLevSplits.forEach(el => {
        el.value = getChartHighLevSplit();
    });

    const bubbleSizeRanges = document.querySelectorAll('.js-bubble-size-range');
    const bubbleSizeVals = document.querySelectorAll('.js-bubble-size-val');
    bubbleSizeRanges.forEach(el => el.value = getBubbleScale());
    bubbleSizeVals.forEach(el => el.textContent = getBubbleScale().toFixed(1));

    const aggregationRanges = document.querySelectorAll('.js-aggregation-range');
    const aggregationVals = document.querySelectorAll('.js-aggregation-val');
    aggregationRanges.forEach(el => el.value = getAggregationFactor());
    aggregationVals.forEach(el => el.textContent = getAggregationFactor());

    const decimalPlacesRanges = document.querySelectorAll('.js-decimal-places-range');
    const decimalPlacesVals = document.querySelectorAll('.js-decimal-places-val');
    decimalPlacesRanges.forEach(el => el.value = getDecimalPlaces());
    decimalPlacesVals.forEach(el => el.textContent = getDecimalPlaces());
}

export { setupEventListeners, initializeCharts, initializePanels, loadInitialState };
