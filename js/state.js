// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Global State Management
// ═══════════════════════════════════════════════════════════

// Data state
let whaleList = [];       // from leaderboard
let allRows = [];         // flat: one row per position
let displayedRows = [];   // after filters
let whaleMeta = {};       // { address: { displayName, accountValue, windowPerformances } }
let lastSeenAccountValues = {}; // for Delta Scanning
let _statsSummary = { netSziPerCoin: {}, totalEntryNotional: 0 }; // PERFORMANCE: For O(N_coins) stats update

// Column state
let visibleColumns = [];   // Default all visible
let columnOrder = [];     // Default order
let columnWidths = {};    // { th-id: width_px }
let _columnCloseTimer = null;
let columnWidth = 100;    // Default column width in px

// Aggregation table column order (for drag-and-drop persistence)
let aggColumnOrder = null;      // Full aggregation table column order
let aggColumnOrderResumida = null;  // Summary aggregation table column order

// Sorting state
let sortKey = 'accountValue';
let sortDir = -1;
let activeWindow = 'allTime';

// Scanning state
let loadedCount = 0;
let scanning = false;
let isPaused = false;

// Filter state
let selectedCoins = [];   // Array for multi-select

// Price state
let priceMode = 'realtime'; // 'realtime' or 'dailyclose'
let priceTicker = null;
let dailyCloseCache = {}; // { COIN: price }
let currentPrices = {};   // coin -> mark price
let priceUpdateInterval = 3000; // Default 3 seconds (configurable by user)
let priceUpdateVersion = 0; // Incremented on every price update

// Ranking state
let rankingLimit = 10;
let rankingTicker = null;

// Chart state
let chartHeight = 400; // default height in px
let liqChartHeight = 400; // default height for liquidation chart
let colorMaxLev = 50;
let chartHighLevSplit = 50; // Threshold for Low/High leverage split
let chartMode = 'scatter'; // 'scatter' or 'column'
let bubbleScale = 1.0;
let bubbleOpacity = 0.6;
let lineThickness = 2; // Default line thickness for lines chart
let aggregationFactor = 50;
let savedScatterState = null;
let savedLiqState = null;
let gridSpacing = 500; // Grid spacing in px
let minBtcVolume = 0; // Volume BTC minimum for highlighting
let aggInterval = 50; // BTC price interval for aggregation (e.g. 50, 100)
let aggTableHeight = 450; // default height for the aggregation table container
let aggVolumeUnit = 'USD'; // 'USD' or 'BTC'
let liquidationMinPriceFull = 0;       // Local floor for aggregation table
let liquidationMaxPriceFull = 0;       // Local ceiling for aggregation table
let useCompactFormat = true; // Use K, M, B formatting for large numbers

// Resumida table state
let liquidationMinPriceSummary = 0;       // Local floor for resumida table
let liquidationMaxPriceSummary = 0;       // Local ceiling for resumida table
let liquidationVolumeUnitSummary = 'USD'; // 'USD' or 'BTC' for resumida table

// Custom colors for leverage categories
let leverageColors = {
    longLow: '#22c55e',    // Long pouco alavancado (verde)
    longHigh: '#16a34a',   // Long muito alavancado (verde escuro)
    shortLow: '#ef4444',   // Short pouco alavancado (vermelho)
    shortHigh: '#dc2626'   // Short muito alavancado (vermelho escuro)
};

// Aggregation Zone Colors
let liquidationZoneColors = {
    buyStrong: '#22c55e',
    buyNormal: '#4ade80',
    sellStrong: '#ef4444',
    sellNormal: '#f87171'
};

// Aggregation Highlight Color for current price row
let liquidationHighlightColor = '#facc15';

// Tooltip state
let tooltipDelay = 500; // Default 500ms

// Currency state
let fxRates = { USD: 1 };   // USD-based rates, fetched once
let fxReady = false;
let activeCurrency = 'USD';
let activeEntryCurrency = 'USD';
let showSymbols = true;
let showLiquidationSymbols = true; // For aggregation table volumes

// Formatting state
let decimalPlaces = 2; // Default 2 decimal places for prices and values
let fontSize = 12; // Default font size for normal rows in px
let fontSizeKnown = 14; // Default font size for known addresses in px
let rowHeight = 52; // Default row height in px

// Concurrency state
let maxConcurrency = 8;

// UI state
let renderPending = false;
let lastSaveTime = 0;
let isZenMode = false;
let autoFitText = false; // Add autoFitText to state

// Getters
export const getState = () => ({
    whaleList,
    allRows,
    displayedRows,
    visibleColumns,
    columnOrder,
    columnWidths,
    sortKey,
    sortDir,
    activeWindow,
    loadedCount,
    scanning,
    isPaused,
    selectedCoins,
    priceMode,
    dailyCloseCache,
    currentPrices,
    priceUpdateInterval,
    rankingLimit,
    chartHeight,
    liqChartHeight,
    colorMaxLev,
    chartHighLevSplit,
    chartMode,
    bubbleScale,
    aggregationFactor,
    savedScatterState,
    savedLiqState,
    fxRates,
    fxReady,
    activeCurrency,
    activeEntryCurrency,
    showSymbols,
    decimalPlaces,
    fontSizeKnown,
    rowHeight,
    maxConcurrency,
    renderPending,
    lastSaveTime,
    leverageColors,
    columnWidth,
    minBtcVolume,
    aggInterval,
    aggTableHeight,
    aggVolumeUnit,
    liquidationMinPriceFull,
    liquidationMaxPriceFull,
    useCompactFormat,
    lastSeenAccountValues,
    whaleMeta,
    isZenMode,
    showLiquidationSymbols,
    liquidationZoneColors,
    autoFitText
});

// Setters
export const setState = (updates) => {
    Object.assign({
        whaleList,
        allRows,
        displayedRows,
        visibleColumns,
        columnOrder,
        columnWidths,
        sortKey,
        sortDir,
        activeWindow,
        loadedCount,
        scanning,
        isPaused,
        selectedCoins,
        priceMode,
        dailyCloseCache,
        currentPrices,
        priceUpdateInterval,
        rankingLimit,
        chartHeight,
        liqChartHeight,
        colorMaxLev,
        chartHighLevSplit,
        chartMode,
        bubbleScale,
        bubbleOpacity,
        lineThickness,
        aggregationFactor,
        savedScatterState,
        savedLiqState,
        fxRates,
        fxReady,
        activeCurrency,
        activeEntryCurrency,
        showSymbols,
        decimalPlaces,
        maxConcurrency,
        renderPending,
        lastSaveTime,
        leverageColors,
        columnWidth,
        gridSpacing,
        minBtcVolume,
        aggInterval,
        aggTableHeight,
        aggVolumeUnit,
        liquidationMinPriceFull,
        liquidationMaxPriceFull,
        useCompactFormat,
        lastSeenAccountValues,
        whaleMeta,
        isZenMode,
        showLiquidationSymbols,
        liquidationZoneColors,
        autoFitText
    }, updates);
};

// Individual setters for common state updates
export const setWhaleList = (value) => { whaleList = value; };
export const setAllRows = (value) => {
    allRows = value;
    // PERFORMANCE: Pre-calculate summary for O(N_coins) stats updates
    const summary = { netSziPerCoin: {}, totalEntryNotional: 0 };
    for (let i = 0; i < value.length; i++) {
        const r = value[i];
        summary.netSziPerCoin[r.coin] = (summary.netSziPerCoin[r.coin] || 0) + r.szi;
        summary.totalEntryNotional += (r.entryPx * r.szi);
    }
    _statsSummary = summary;
};
export const getStatsSummary = () => _statsSummary;
export const setDisplayedRows = (value) => { displayedRows = value; };
export const setScanning = (value) => { scanning = value; };
export const setIsPaused = (value) => { isPaused = value; };
export const setLoadedCount = (value) => { loadedCount = value; };
export const setCurrentPrices = (value) => {
    currentPrices = value;
    priceUpdateVersion++;
};
export const getPriceUpdateVersion = () => priceUpdateVersion;
export const setPriceUpdateInterval = (value) => { priceUpdateInterval = value; };
export const setFxRates = (value) => { fxRates = value; };
export const setFxReady = (value) => { fxReady = value; };
export const setActiveCurrency = (value) => { activeCurrency = value; };
export const setActiveEntryCurrency = (value) => { activeEntryCurrency = value; };
export const setShowSymbols = (value) => { showSymbols = value; };
export const setDecimalPlaces = (value) => { decimalPlaces = value; };
export const setFontSize = (value) => { fontSize = value; };
export const setFontSizeKnown = (value) => { fontSizeKnown = value; };
export const setRowHeight = (value) => { rowHeight = value; };
export const setSelectedCoins = (value) => { selectedCoins = value; };
export const setMaxConcurrency = (value) => { maxConcurrency = value; };
export const setSortKey = (value) => { sortKey = value; };
export const setSortDir = (value) => { sortDir = value; };
export const setActiveWindow = (value) => { activeWindow = value; };
export const setRankingLimit = (value) => { rankingLimit = value; };
export const setChartHeight = (value) => { chartHeight = value; };
export const setLiqChartHeight = (value) => { liqChartHeight = value; };
export const setColorMaxLev = (value) => { colorMaxLev = value; };
export const setChartHighLevSplit = (value) => { chartHighLevSplit = value; };
export const setChartMode = (value) => { chartMode = value; };
export const setBubbleScale = (value) => { bubbleScale = value; };
export const setBubbleOpacity = (val) => { bubbleOpacity = val; };
export const setLineThickness = (val) => { lineThickness = val; };
export const setAggregationFactor = (val) => { aggregationFactor = val; };
export const setSavedScatterState = (value) => { savedScatterState = value; };
export const setSavedLiqState = (value) => { savedLiqState = value; };
export const setVisibleColumns = (value) => { visibleColumns = value; };
export const setColumnOrder = (value) => { columnOrder = value; };
export const setColumnWidths = (value) => { columnWidths = value; };
export const setAggColumnOrder = (value) => { aggColumnOrder = value; };
export const setAggColumnOrderResumida = (value) => { aggColumnOrderResumida = value; };
export const setRenderPending = (value) => { renderPending = value; };
export const setLastSaveTime = (value) => { lastSaveTime = value; };
export const setLeverageColors = (value) => { leverageColors = value; };
export const setGridSpacing = (value) => { gridSpacing = value; };
export const setMinBtcVolume = (value) => { minBtcVolume = value; };
export const setAggInterval = (value) => { aggInterval = value; };
export const setLiquidationTableHeight = (value) => { aggTableHeight = value; };
export const setAggVolumeUnit = (value) => { aggVolumeUnit = value; };
export const setLiquidationMinPriceFull = (value) => { liquidationMinPriceFull = value; };
export const setLiquidationMaxPriceFull = (value) => { liquidationMaxPriceFull = value; };
export const setUseCompactFormat = (value) => { useCompactFormat = value; };
export const setLiquidationZoneColors = (value) => { liquidationZoneColors = value; };
export const setLiquidationHighlightColor = (value) => { liquidationHighlightColor = value; };
export const setIsZenMode = (value) => { isZenMode = value; };
export const setShowLiquidationSymbols = (value) => { showLiquidationSymbols = value; };
export const setWhaleMeta = (value) => { whaleMeta = value; };
export const setLastSeenAccountValues = (value) => { lastSeenAccountValues = value; };
export const setAutoFitText = (value) => { autoFitText = !!value; };

// Getters for common state access
export const getAllRows = () => allRows;
export const getDisplayedRows = () => displayedRows;
export const getCurrentPrices = () => currentPrices;
export const getPriceUpdateInterval = () => priceUpdateInterval;
export const getActiveCurrency = () => activeCurrency;
export const getActiveEntryCurrency = () => activeEntryCurrency;
export const getShowSymbols = () => showSymbols;
export const getDecimalPlaces = () => decimalPlaces;
export const getFontSize = () => fontSize;
export const getFontSizeKnown = () => fontSizeKnown;
export const getRowHeight = () => rowHeight;
export const getSortKey = () => sortKey;
export const getSortDir = () => sortDir;
export const getActiveWindow = () => activeWindow;
export const getVisibleColumns = () => visibleColumns;
export const getColumnOrder = () => columnOrder;
export const getColumnWidths = () => columnWidths;
export const getAggColumnOrder = () => aggColumnOrder;
export const getAggColumnOrderResumida = () => aggColumnOrderResumida;
export const getScanning = () => scanning;
export const getIsPaused = () => isPaused;
export const getMaxConcurrency = () => maxConcurrency;
export const getFxRates = () => fxRates;
export const getFxReady = () => fxReady;
export const getRankingLimit = () => rankingLimit;
export const getChartHeight = () => chartHeight;
export const getLiqChartHeight = () => liqChartHeight;
export const getColorMaxLev = () => colorMaxLev;
export const getChartHighLevSplit = () => chartHighLevSplit;
export const getChartMode = () => chartMode;
export const getBubbleScale = () => bubbleScale;
export const getBubbleOpacity = () => bubbleOpacity;
export const getLineThickness = () => lineThickness;
export const getAggregationFactor = () => aggregationFactor;
export const getSavedScatterState = () => savedScatterState;
export const getSavedLiqState = () => savedLiqState;
export const getRenderPending = () => renderPending;
export const getLastSaveTime = () => lastSaveTime;
export const getPriceMode = () => priceMode;
export const getSelectedCoins = () => selectedCoins;
export const getLeverageColors = () => leverageColors;
export const getColumnWidth = () => columnWidth;
export const getGridSpacing = () => gridSpacing;
export const getMinBtcVolume = () => minBtcVolume;
export const getAggInterval = (value) => aggInterval;
export const getLiquidationTableHeight = (value) => aggTableHeight;
export const getAggVolumeUnit = () => aggVolumeUnit;
export const getLiquidationMinPriceFull = () => liquidationMinPriceFull;
export const getLiquidationMaxPriceFull = () => liquidationMaxPriceFull;
export const getUseCompactFormat = () => useCompactFormat;
export const getLiquidationZoneColors = () => liquidationZoneColors;
export const getLiquidationHighlightColor = () => liquidationHighlightColor;
export const getAutoFitText = () => autoFitText;

export const getTooltipDelay = () => tooltipDelay;
export const setTooltipDelay = (val) => {
    tooltipDelay = parseInt(val, 10);
    if (isNaN(tooltipDelay)) tooltipDelay = 500;
};
export const getIsZenMode = (value) => isZenMode;
export const getShowLiquidationSymbols = () => showLiquidationSymbols;
export const getWhaleMeta = () => whaleMeta;
export const getLastSeenAccountValues = () => lastSeenAccountValues;
export const setPriceMode = (mode) => {
    priceMode = mode;
};
export const setColumnWidth = (value) => { columnWidth = value; };

// Resumida table getters and setters
export const getLiquidationMinPriceSummary = () => liquidationMinPriceSummary;
export const getLiquidationMaxPriceSummary = () => liquidationMaxPriceSummary;
export const getLiquidationVolumeUnitSummary = () => liquidationVolumeUnitSummary;
export const setLiquidationMinPriceSummary = (value) => { liquidationMinPriceSummary = value; };
export const setLiquidationMaxPriceSummary = (value) => { liquidationMaxPriceSummary = value; };
export const setLiquidationVolumeUnitSummary = (value) => { liquidationVolumeUnitSummary = value; };
