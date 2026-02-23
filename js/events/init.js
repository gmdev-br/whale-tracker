// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Events Initialization
// ═══════════════════════════════════════════════════════════

console.log('init.js loaded (v2)');

import {
    getShowSymbols, getRankingLimit, getColorMaxLev, getChartHighLevSplit,
    getBubbleScale, getAggregationFactor, getDecimalPlaces, setAllRows, setActiveWindow, getActiveWindow, getChartMode, getIsZenMode
} from '../state.js';
import { loadTableData } from '../storage/data.js';
import { chartPlugins, chartOptions, chartMechanics } from '../charts/config.js';
import { saveSettings, loadSettings } from '../storage/settings.js';
import { updateRankingPanel, renderQuotesPanel, removeCoin as removeCoinFn, handlePriceModeClick, updatePriceModeUI } from '../ui/panels.js';
import { renderScatterPlot, getScatterChart } from '../charts/scatter.js';
import { renderLiqScatterPlot, getLiqChartInstance } from '../charts/liquidation.js';
import { updateStats, renderTable, renderTableImmediate } from '../ui/table.js';
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
    toggleZenMode, updateAggZoneColors, updateAggHighlightColor
} from './handlers.js';
import { initColumnWidthControl, applyColumnWidth } from '../ui/columnWidth.js';
import { setWindow, setStatus, setProgress } from '../ui/status.js';
import { sortBy } from '../ui/filters.js';
import { CURRENCY_META } from '../config.js';

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

    // Use passive listeners for better scroll performance
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
}

// ── Pull-to-Refresh ──
function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const pullThreshold = 100;
    const pullToRefresh = document.getElementById('pullToRefresh');

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

    // Use passive listeners for better scroll performance
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}

// ── Splash Screen ──
function setupSplashScreen() {
    const splashScreen = document.getElementById('splashScreen');
    if (!splashScreen) return;

    // Hide splash screen after page loads
    window.addEventListener('load', () => {
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 300);
        }, 1000);
    });
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
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

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
        menuToggle.addEventListener('click', openMobileMenu);
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
            closeSettings();
        }
    });

    // Settings Drawer and Advanced Filters
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsDrawerClose = document.getElementById('settingsDrawerClose');

    function openSettings() {
        if (settingsDrawer) settingsDrawer.classList.add('active');
        if (settingsOverlay) settingsOverlay.classList.add('active');
    }

    function closeSettings() {
        if (settingsDrawer) settingsDrawer.classList.remove('active');
        if (settingsOverlay) settingsOverlay.classList.remove('active');
    }

    if (settingsToggle) settingsToggle.addEventListener('click', openSettings);
    if (settingsDrawerClose) settingsDrawerClose.addEventListener('click', closeSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);

    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const advancedFiltersRow = document.getElementById('advancedFiltersRow');
    if (toggleFiltersBtn && advancedFiltersRow) {
        toggleFiltersBtn.addEventListener('click', () => {
            const isHidden = advancedFiltersRow.style.display === 'none';
            advancedFiltersRow.style.display = isHidden ? 'table-row' : 'none';
            toggleFiltersBtn.classList.toggle('active', isHidden);
            // Optionally trigger resize or update handlers if adjusting headers
            if (typeof updateHeaderWidths === 'function') {
                updateHeaderWidths();
            }
        });
    }

    // Collapsible sections
    const collapseToggles = document.querySelectorAll('.js-collapse-toggle');
    collapseToggles.forEach(toggle => {
        const targetId = toggle.getAttribute('data-target');
        const wrapper = toggle.closest('.section-wrapper');

        // Load saved state
        const isCollapsed = localStorage.getItem(`collapse_${targetId}`) === 'true';
        if (isCollapsed && wrapper) {
            wrapper.classList.add('collapsed');
        }

        toggle.addEventListener('click', () => {
            if (wrapper) {
                wrapper.classList.toggle('collapsed');
                const currentlyCollapsed = wrapper.classList.contains('collapsed');
                localStorage.setItem(`collapse_${targetId}`, currentlyCollapsed);
            }
        });
    });

    // Scan controls
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => startScan({
            setStatus,
            setProgress,
            fetchAllMids,
            updateStats,
            updateCoinFilter,
            renderTable,
            saveTableData,
            finishScan,
            setLastSaveTime,
            setRenderPending
        }));
    }

    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => stopScan(setStatus));
    }

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => togglePause(setStatus));
    }

    // Speed control - attach to both mobile and desktop
    const speedRanges = document.querySelectorAll('.js-speed-range');
    speedRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateSpeed(e.target.value);
        });
    });

    // Price update interval control - attach to both mobile and desktop
    const priceIntervalRanges = document.querySelectorAll('.js-price-interval-range');
    priceIntervalRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updatePriceInterval(e.target.value);
        });
    });

    // Window tabs
    document.querySelectorAll('.tab[data-window]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setWindow(e.target, getActiveWindow(), setActiveWindow, saveSettings, renderTable);
        });
    });

    // Price mode tabs - handle duplicate IDs (desktop/mobile)
    document.querySelectorAll('.tab[data-mode]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            handlePriceModeClick(e.target);
        });
    });

    // Column sorting - use event delegation
    const table = document.querySelector('table');
    if (table) {
        table.addEventListener('click', (e) => {
            // Skip if currently resizing
            if (document.body.classList.contains('resizing')) return;

            const th = e.target.closest('th[id^="th-"]');
            if (!th) return;

            const resizer = th.querySelector('.resizer');
            if (resizer && (e.target === resizer || resizer.contains(e.target))) return;

            const key = th.id.replace('th-', '');
            sortBy(key, renderTable);
        });
    }

    // Filter inputs
    const filterInputs = ['minValue', 'coinFilter', 'sideFilter', 'minLev', 'maxLev', 'minSize',
        'minSzi', 'maxSzi', 'minValueCcy', 'maxValueCcy', 'minEntryCcy', 'maxEntryCcy',
        'minUpnl', 'maxUpnl', 'minFunding', 'levTypeFilter', 'addressFilter']; // Removed minBtcVolume as it is handled separately

    filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                saveSettings();
                renderTable();
            });

            // Also add input event listener for number inputs to save as user types
            if (el.type === 'number') {
                el.addEventListener('input', () => {
                    saveSettings();
                });
            }
        }
    });

    // Show symbols toggle
    const btnShowSymMobile = document.getElementById('btnShowSymMobile');
    const btnShowSymDesktop = document.getElementById('btnShowSymDesktop');
    if (btnShowSymMobile) {
        btnShowSymMobile.addEventListener('click', toggleShowSymbols);
    }
    if (btnShowSymDesktop) {
        btnShowSymDesktop.addEventListener('click', toggleShowSymbols);
    }

    // Aggregation symbols toggle
    const showAggSymbolsDrawer = document.getElementById('showAggSymbolsDrawer');
    if (showAggSymbolsDrawer) {
        showAggSymbolsDrawer.addEventListener('change', toggleShowAggSymbols);
    }

    // Aggregation color pickers
    const aggColors = [
        'colorAggBuyStrong', 'colorAggBuyNormal',
        'colorAggSellStrong', 'colorAggSellNormal'
    ];
    aggColors.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateAggZoneColors);
    });

    // Highlight color picker
    const highlightColorEl = document.getElementById('colorAggHighlight');
    if (highlightColorEl) {
        highlightColorEl.addEventListener('input', updateAggHighlightColor);
    }

    // Ranking limit - attach to both mobile and desktop
    const rankingLimits = document.querySelectorAll('.js-ranking-limit');
    rankingLimits.forEach(limit => {
        limit.addEventListener('change', updateRankingLimit);
    });

    // Color settings - attach to both mobile and desktop
    const colorMaxLevs = document.querySelectorAll('.js-color-max-lev');
    colorMaxLevs.forEach(el => {
        el.addEventListener('change', updateColorSettings);
    });

    const chartHighLevSplits = document.querySelectorAll('.js-chart-high-lev-split');
    chartHighLevSplits.forEach(el => {
        el.addEventListener('change', updateChartFilters);
    });

    // Bubble size - attach to both mobile and desktop
    const bubbleSizeRanges = document.querySelectorAll('.js-bubble-size-range');
    bubbleSizeRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateBubbleSize(e.target.value);
        });
    });

    // Bubble opacity - attach to both mobile and desktop
    const bubbleOpacityRanges = document.querySelectorAll('.js-bubble-opacity-range');
    bubbleOpacityRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateBubbleOpacity(e.target.value);
        });
    });

    // Line thickness - attach to both mobile and desktop
    const lineThicknessRanges = document.querySelectorAll('.js-line-thickness-range');
    lineThicknessRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateLineThickness(e.target.value);
        });
    });

    // Aggregation mode - attach to both mobile and desktop
    const aggregationRanges = document.querySelectorAll('.js-aggregation-range');
    aggregationRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateAggregation(e.target.value);
        });
    });

    // Aggregation Table Interval - attach to both mobile and desktop
    const aggIntervalInputs = document.querySelectorAll('.js-agg-interval');
    aggIntervalInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            updateAggInterval(e.target.value);
        });
    });

    // Decimal places control - attach to both mobile and desktop
    const decimalPlacesRanges = document.querySelectorAll('.js-decimal-places-range');
    decimalPlacesRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateDecimalPlaces(e.target.value);
        });
    });

    // Font size control - attach to both mobile and desktop
    const fontSizeRanges = document.querySelectorAll('.js-font-size-range');
    fontSizeRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateFontSize(e.target.value);
        });
        range.addEventListener('change', (e) => {
            updateFontSize(e.target.value);
        });
        range.addEventListener('keyup', (e) => {
            updateFontSize(e.target.value);
        });
    });

    // Font size for known addresses control - attach to both mobile and desktop
    const fontSizeKnownRanges = document.querySelectorAll('.js-font-size-known-range');
    fontSizeKnownRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateFontSizeKnown(e.target.value);
        });
        range.addEventListener('change', (e) => {
            updateFontSizeKnown(e.target.value);
        });
        range.addEventListener('keyup', (e) => {
            updateFontSizeKnown(e.target.value);
        });
    });

    // Row height control - attach to both mobile and desktop
    const rowHeightRanges = document.querySelectorAll('.js-row-height-range');
    rowHeightRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateRowHeight(e.target.value);
        });
        range.addEventListener('change', (e) => {
            updateRowHeight(e.target.value);
        });
        range.addEventListener('keyup', (e) => {
            updateRowHeight(e.target.value);
        });
    });

    // Leverage color inputs - attach to both mobile and desktop
    const colorInputs = [
        { id: 'colorLongLow', class: 'js-color-long-low' },
        { id: 'colorLongHigh', class: 'js-color-long-high' },
        { id: 'colorShortLow', class: 'js-color-short-low' },
        { id: 'colorShortHigh', class: 'js-color-short-high' }
    ];
    colorInputs.forEach(item => {
        const elements = document.querySelectorAll(`.${item.class}`);
        elements.forEach(el => {
            el.addEventListener('change', updateLeverageColors);
        });
    });

    // Chart mode tabs
    document.querySelectorAll('.tab[data-chart]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setChartModeHandler(e.target.dataset.chart);
        });
    });

    // Chart height controls
    const chartSection = document.getElementById('chart-section');
    if (chartSection) {
        setupResizable(chartSection, updateChartHeight);
    }

    const liqChartSection = document.getElementById('liq-chart-section');
    if (liqChartSection) {
        setupResizable(liqChartSection, updateLiqChartHeight);
    }

    const aggTableSection = document.getElementById('agg-table-section');
    if (aggTableSection) {
        setupResizable(aggTableSection, updateAggTableHeight);
    }

    // Grid spacing control - attach to both mobile and desktop
    const gridSpacingRanges = document.querySelectorAll('.js-grid-spacing-range');
    gridSpacingRanges.forEach(range => {
        range.addEventListener('input', (e) => {
            updateGridSpacing(e.target.value);
        });
    });

    // Min BTC Volume control - attach to both mobile and desktop
    const minBtcVolumeInputs = document.querySelectorAll('.js-min-btc-volume');
    minBtcVolumeInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            updateMinBtcVolume(e.target.value);
        });
    });

    // Price filter controls for chart scale
    const minEntryCcy = document.getElementById('minEntryCcy');
    const maxEntryCcy = document.getElementById('maxEntryCcy');

    if (minEntryCcy) {
        minEntryCcy.addEventListener('input', () => {
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
        maxEntryCcy.addEventListener('input', () => {
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

    // Currency selectors
    const currencySelect = document.getElementById('currencySelect');
    const entryCurrencySelect = document.getElementById('entryCurrencySelect');
    if (currencySelect) {
        currencySelect.addEventListener('change', onCurrencyChange);
    }
    if (entryCurrencySelect) {
        entryCurrencySelect.addEventListener('change', onCurrencyChange);
    }

    // Column combobox
    const columnSelectDisplays = document.querySelectorAll('.js-column-select-display');
    columnSelectDisplays.forEach(display => {
        display.addEventListener('focus', openColumnCombobox);
        display.addEventListener('blur', (e) => {
            // Only close if the related target is not within the combobox
            // Check closest combobox wrapper
            const combobox = display.closest('.js-column-combobox');
            if (!combobox || !combobox.contains(e.relatedTarget)) {
                closeColumnComboboxDelayed();
            }
        });
        display.addEventListener('input', (e) => {
            renderColumnDropdown(e.target.value);
        });
    });

    // Generic comboboxes - click to open
    const comboboxIds = ['cb-sideFilter', 'cb-levTypeFilter', 'cb-currencySelect', 'cb-entryCurrencySelect'];

    // Use DOMContentLoaded to ensure elements exist
    function setupComboboxListeners() {
        console.log('Setting up combobox listeners, readyState:', document.readyState);
        comboboxIds.forEach(fullId => {
            const combobox = document.getElementById(fullId);
            console.log(`Combobox ${fullId} found:`, !!combobox);
            if (combobox) {
                combobox.addEventListener('click', (e) => {
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
        document.addEventListener('DOMContentLoaded', setupComboboxListeners);
    } else {
        setupComboboxListeners();
    }

    // Coin combobox
    const coinSearch = document.getElementById('coinSearch');
    if (coinSearch) {
        coinSearch.addEventListener('click', openCombobox);
    }

    // Zen Mode toggles
    const zenToggleHeader = document.getElementById('zenToggleHeader');
    if (zenToggleHeader) {
        zenToggleHeader.addEventListener('click', toggleZenMode);
    }

    const zenToggleMobile = document.getElementById('zenToggleMobile');
    if (zenToggleMobile) {
        zenToggleMobile.addEventListener('click', toggleZenMode);
    }

    const zenToggleDrawer = document.getElementById('zenToggleDrawer');
    if (zenToggleDrawer) {
        zenToggleDrawer.addEventListener('change', toggleZenMode);
    }

    const exitZenBtn = document.getElementById('exitZenBtn');
    if (exitZenBtn) {
        exitZenBtn.addEventListener('click', toggleZenMode);
    }

    // Aggregation Volume Unit tabs
    document.querySelectorAll('.js-agg-volume-unit-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            updateAggVolumeUnit(e.target.dataset.unit);
        });
    });

    const scrollToCurrentBtn = document.getElementById('scrollToCurrentBtn');
    if (scrollToCurrentBtn) {
        scrollToCurrentBtn.addEventListener('click', scrollToCurrentPrice);
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

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = element.offsetHeight;
        resizer.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        callback(newHeight);
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        resizer.classList.remove('active');
    });
}

function applyColumnWidthAfterRender() {
    const width = document.querySelector('.js-column-width-input')?.value || 100;
    console.log('applyColumnWidthAfterRender called with width:', width);
    applyColumnWidth(parseInt(width, 10));
}

function initializeCharts() {
    renderScatterPlot();
    renderLiqScatterPlot();
    chartMechanics.setupColumnResizing();
}

function initializePanels() {
    updateRankingPanel();
    renderQuotesPanel();
    updatePriceModeUI();
    initColumnWidthControl();
}

async function loadInitialState() {
    console.log('loadInitialState: Starting...');
    loadTableData(setAllRows);

    // Initialize currency comboboxes FIRST before loading settings
    const currencyOptions = Object.keys(CURRENCY_META).map(ccy => ({
        value: ccy,
        label: ccy
    }));

    console.log('Initializing currency comboboxes with options:', currencyOptions);
    cbInit('currencySelect', currencyOptions, onCurrencyChange);
    cbInit('entryCurrencySelect', currencyOptions, onCurrencyChange);

    console.log('loadInitialState: Loading settings...');
    loadSettings();

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

    // Apply column visibility first
    applyColumnVisibility();
    applyColumnWidths();
    updateColumnSelectDisplay();

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

    console.log('loadInitialState: Rendering table...');
    renderTableImmediate(); // Use immediate render to bypass debounce on page load

    // Safety net: loadSettings triggers async onCurrencyChange which may call renderTable
    // and reset the filter cache with a different cache key, causing a blank table.
    // After 350ms, all async effects from loadSettings will have settled, so we force a final render.
    setTimeout(() => {
        console.log('loadInitialState: Safety net render after async effects...');
        renderTableImmediate();
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
