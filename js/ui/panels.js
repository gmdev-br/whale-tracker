// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Panels
// ═══════════════════════════════════════════════════════════

import { getAllRows, getCurrentPrices, getSelectedCoins, getPriceMode, getPriceUpdateInterval, getRankingLimit, setSelectedCoins, setPriceMode, getScanning, setCurrentPrices, getActiveCurrency, getFxRates, getShowSymbols, getActiveEntryCurrency } from '../state.js';
import { saveSettings } from '../storage/settings.js';
import { fmtCcy } from '../utils/formatters.js';
import { updateCoinSearchLabel } from './combobox.js';
import { renderTable, updateTablePriceData } from './table.js';
import { renderAggregationTable, renderAggregationTableResumida } from './aggregation.js';
import { getScatterChart } from '../charts/scatter.js';
import { getLiqChartInstance } from '../charts/liquidation.js';
import { CURRENCY_META } from '../config.js';

// Cache for market cap data
let marketCapCache = null;
let marketCapCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Ranking panel state for change detection
let rankingPanelDebounceTimer = null;
const RANKING_PANEL_DEBOUNCE_MS = 1000; // 1 second debounce
let _lastRankingPanelHash = '';

// Fetch real market cap data
export async function fetchMarketCapRanking() {
    const now = Date.now();

    // Return cached data if still valid
    if (marketCapCache && (now - marketCapCacheTime) < CACHE_DURATION) {
        return marketCapCache;
    }

    try {
        // Using CoinGecko API for market cap data
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false', {
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Transform to our format
        marketCapCache = data.map(coin => ({
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            marketCap: coin.market_cap,
            currentPrice: coin.current_price,
            priceChange24h: coin.price_change_percentage_24h,
            volume24h: coin.total_volume
        }));

        marketCapCacheTime = now;
        //console.log('Market cap data fetched and cached:', marketCapCache.length, 'coins');

        return marketCapCache;

    } catch (error) {
        console.warn('Failed to fetch market cap data:', error);
        // Fallback to empty array
        return [];
    }
}

export async function updateRankingPanel() {
    // Skip update during scanning to avoid performance issues
    if (getScanning()) {
        return;
    }

    // Capture worker-calculated stats if provided
    const workerCoinStats = arguments[0]?.coinStats;

    // Debounce to avoid excessive calls
    if (rankingPanelDebounceTimer) {
        clearTimeout(rankingPanelDebounceTimer);
    }

    rankingPanelDebounceTimer = setTimeout(async () => {
        const panel = document.getElementById('holdingsPanel');
        if (!panel) {
            console.warn('Ranking panel element not found');
            return;
        }

        const rankingLimit = getRankingLimit();
        const selectedCoins = getSelectedCoins();

        // Use worker data if available, otherwise fallback to UI-side calculation (slower)
        let whaleStats = workerCoinStats;
        if (!whaleStats) {
            const allRows = getAllRows();
            whaleStats = {};
            allRows.forEach(row => {
                if (!whaleStats[row.coin]) {
                    whaleStats[row.coin] = {
                        totalPositionValue: 0,
                        count: 0,
                        whales: new Set()
                    };
                }
                whaleStats[row.coin].totalPositionValue += row.positionValue;
                whaleStats[row.coin].count++;
                whaleStats[row.coin].whales.add(row.address);
            });

            // Normalize for the renderer
            Object.keys(whaleStats).forEach(c => {
                whaleStats[c].whaleCount = whaleStats[c].whales.size;
            });
        }

        // Try to get market cap data
        let marketCapData = [];
        try {
            marketCapData = await fetchMarketCapRanking();
        } catch (e) {
            console.warn('Failed to fetch market cap data:', e);
        }

        // If we have whale data but no market cap data, use whale ranking
        if (marketCapData.length === 0) {
            //console.log('Using whale position ranking (no market cap data)');
            renderWhalePositionRanking(panel, whaleStats, rankingLimit, selectedCoins);
            return;
        }

        // Combine market cap with whale position data
        const combinedData = marketCapData
            .slice(0, rankingLimit)
            .map(coin => {
                const whaleData = whaleStats[coin.symbol] || { totalPositionValue: 0, count: 0, whaleCount: 0 };
                return {
                    ...coin,
                    whalePositionValue: whaleData.totalPositionValue,
                    whaleCount: whaleData.count,
                    whaleWhales: whaleData.whaleCount
                };
            });

        //console.log('Market cap ranking updated:', combinedData.length, 'coins');

        // PERFORMANCE: Faster hash without JSON.stringify
        const currentHash = `${combinedData.length}-${combinedData[0]?.whalePositionValue || 0}-${selectedCoins.length}`;
        if (currentHash === _lastRankingPanelHash) {
            return;
        }
        _lastRankingPanelHash = currentHash;

        panel.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-right: 10px; color: var(--muted); font-size: 11px; flex-shrink: 0;">
                <span>🌍</span>
                <span>Global Market Cap Ranking</span>
            </div>
            ${combinedData.map((coin, i) => {
            const rank = i + 1;
            const marketCapStr = fmtCcy(coin.marketCap, null, 'USD', true);
            const change = coin.priceChange24h ? `${coin.priceChange24h.toFixed(2)}%` : '0%';
            const changeClass = coin.priceChange24h >= 0 ? 'green' : 'red';
            const isSelected = selectedCoins.includes(coin.symbol);

            // Whale position data (secondary information)
            const whalePositionValue = coin.whalePositionValue || 0;
            const whaleCount = coin.whaleCount || 0;
            const whaleMarketCapStr = whalePositionValue > 0 ? fmtCcy(whalePositionValue, null, 'USD', true) : '—';
            const whaleInfo = whaleCount > 0 ?
                `Whale Market Cap: ${whaleMarketCapStr}\n${whaleCount} whales • $${(whalePositionValue / 1000000).toFixed(1)}M positions` :
                'No whale positions';

            return `
                    <div class="ranking-card ${isSelected ? 'selected' : ''}"
                         onclick="selectCoin('${coin.symbol}')"
                         title="${coin.name} (${coin.symbol})\nGlobal Market Cap: ${marketCapStr}\n24h Change: ${change}\n${whaleInfo}">
                        <div class="ranking-rank">#${rank}</div>
                        <div class="ranking-coin">${coin.symbol}</div>
                        <div class="ranking-mcap">${marketCapStr}</div>
                        <div class="ranking-change ${changeClass}">${change}</div>
                        <div class="whale-market-cap" title="${whaleInfo}">${whaleMarketCapStr}</div>
                        ${whaleCount > 0 ? `<div class="whale-indicator" title="${whaleInfo}">🐋</div>` : ''}
                        ${isSelected ? '<div class="ranking-selected-indicator">✓</div>' : ''}
                    </div>
                `;
        }).join('')}
        `;

        //console.log('Market cap ranking panel updated with', combinedData.length, 'coins');
    }, RANKING_PANEL_DEBOUNCE_MS);
}

// Helper function to render whale position ranking
function renderWhalePositionRanking(panel, whaleStats, rankingLimit, selectedCoins) {
    const sortedCoins = Object.entries(whaleStats)
        .sort((a, b) => b[1].totalPositionValue - a[1].totalPositionValue)
        .slice(0, rankingLimit);

    if (sortedCoins.length === 0) {
        panel.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; padding: 10px; color: var(--muted); font-size: 12px; flex-shrink: 0;">
                <span>📊</span>
                <span>No whale positions loaded yet. Start scanning to see data.</span>
            </div>
        `;
        return;
    }

    panel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-right: 10px; color: var(--muted); font-size: 11px; flex-shrink: 0;">
            <span>🐋</span>
            <span>Whale Position Ranking</span>
        </div>
        ${sortedCoins.map(([coin, stats], i) => {
        const rank = i + 1;
        const totalPositionValue = stats.totalPositionValue;
        const whaleMarketCapStr = fmtCcy(totalPositionValue, null, 'USD', true);
        const isSelected = selectedCoins.includes(coin);
        const whaleInfo = `${stats.count} whales • $${(totalPositionValue / 1000000).toFixed(1)}M positions`;

        return `
                <div class="ranking-card ${isSelected ? 'selected' : ''}" 
                     onclick="selectCoin('${coin}')" 
                     title="${coin}\nWhale Market Cap: ${whaleMarketCapStr}\n${whaleInfo}">
                    <div class="ranking-rank">#${rank}</div>
                    <div class="ranking-coin">${coin}</div>
                    <div class="ranking-mcap">${whaleMarketCapStr}</div>
                    <div class="ranking-change">—</div>
                    <div class="whale-market-cap" title="${whaleInfo}">${stats.whales.size} 🐋</div>
                    <div class="whale-indicator" title="${whaleInfo}">🐋</div>
                    ${isSelected ? '<div class="ranking-selected-indicator">✓</div>' : ''}
                </div>
            `;
    }).join('')}
    `;

    //console.log('Whale position ranking rendered with', sortedCoins.length, 'coins');
}

// Fallback function for whale position ranking (kept for compatibility)
function updateWhalePositionRanking() {
    const panel = document.getElementById('holdingsPanel');
    if (!panel) return;

    const allRows = getAllRows();
    const rankingLimit = getRankingLimit();
    const selectedCoins = getSelectedCoins();

    // Calculate top coins by total whale position value
    const coinStats = {};
    allRows.forEach(row => {
        if (!coinStats[row.coin]) {
            coinStats[row.coin] = {
                totalPositionValue: 0,
                count: 0,
                whales: new Set()
            };
        }
        coinStats[row.coin].totalPositionValue += row.positionValue;
        coinStats[row.coin].count++;
        coinStats[row.coin].whales.add(row.address);
    });

    renderWhalePositionRanking(panel, coinStats, rankingLimit, selectedCoins);
}

export function renderQuotesPanel() {
    const panel = document.getElementById('quotesPanel');
    if (!panel) return;

    const selectedCoins = getSelectedCoins();
    if (selectedCoins.length === 0) {
        panel.style.display = 'none';
        // Não paramos mais o ticker aqui para manter BTC e debug atualizados globalmente
        return;
    }

    panel.style.display = 'flex';

    // Initial render with current state
    updateQuotesHTML();

    // Start price ticker
    startPriceTicker();
}

// Quotes state for change detection
let _lastQuotesHTMLHash = '';

export function updateQuotesHTML() {
    const panel = document.getElementById('quotesPanel');
    if (!panel) return;

    // DEBUG: Log quotes update
    //console.log(`[QuotesUpdate] ${new Date().toLocaleTimeString()} - Updating DOM`);

    const selectedCoins = getSelectedCoins();
    const currentPrices = getCurrentPrices();

    // PERFORMANCE: Simple change detection to avoid layout thrashing
    // PERFORMANCE: Use a faster hash (property sum or count) instead of full stringification
    let priceSum = 0;
    for (let i = 0; i < selectedCoins.length; i++) {
        priceSum += (currentPrices[selectedCoins[i]] || 0);
    }
    const currentHash = `${selectedCoins.length}-${priceSum.toFixed(2)}`;
    if (currentHash === _lastQuotesHTMLHash) {
        return;
    }
    _lastQuotesHTMLHash = currentHash;

    panel.innerHTML = selectedCoins.map(coin => {
        const currentPrice = parseFloat(currentPrices[coin] || 0);
        const prevPrice = parseFloat(window[`prevPrice_${coin}`] || currentPrice);

        let direction = 'neutral';
        if (currentPrice > prevPrice) direction = 'up';
        else if (currentPrice < prevPrice) direction = 'down';

        const priceStr = currentPrice.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });

        const changePct = prevPrice > 0 ?
            ((currentPrice - prevPrice) / prevPrice * 100).toFixed(2) : '0.00';

        return `
            <div class="quote-card ${direction}">
                <button class="quote-remove" onclick="event.preventDefault(); removeCoin('${coin}')">✕</button>
                <div class="quote-coin">${coin}</div>
                <div class="quote-price ${direction === 'up' ? 'flash-up' : direction === 'down' ? 'flash-down' : ''}">${priceStr}</div>
                <div class="quote-change ${direction}">${changePct}%</div>
                <div class="quote-label">Price</div>
            </div>
        `;
    }).join('');
}

export function handlePriceModeClick(el) {
    document.querySelectorAll('#priceModeToggle .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    setPriceMode(el.dataset.mode);
    saveSettings();
    renderQuotesPanel();
}

export function updatePriceModeUI() {
    const priceMode = getPriceMode();
    // Select all tabs with data-mode attribute (handles duplicate IDs for priceModeToggle)
    const tabs = document.querySelectorAll('.tab[data-mode]');
    tabs.forEach(t => {
        if (t.dataset.mode === priceMode) t.classList.add('active');
        else t.classList.remove('active');
    });
}

let priceTicker = null;

export function startPriceTicker() {
    stopPriceTicker();

    priceTicker = setInterval(async () => {
        try {
            const response = await fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'allMids' })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // DEBUG: Update debug panel
            const debugUpdate = document.getElementById('debug-last-update');
            const debugBtc = document.getElementById('debug-btc-price');
            if (debugUpdate) debugUpdate.textContent = new Date().toLocaleTimeString();
            if (debugBtc && data['BTC']) debugBtc.textContent = parseFloat(data['BTC']).toFixed(2);

            // Update current prices with the fetched data
            if (data && typeof data === 'object') {
                const selectedCoins = getSelectedCoins();
                const currentPrices = getCurrentPrices();

                // DEBUG: Log BTC price update
                if (data['BTC']) {
                    //console.log(`[PriceUpdate] ${new Date().toLocaleTimeString()} - BTC Price: ${data['BTC']} | Total Coins Updated: ${Object.keys(data).length}`);
                }

                // Update ALL prices to ensure BTC and other reference currencies are up to date
                Object.keys(data).forEach(coin => {
                    const newPrice = parseFloat(data[coin]);
                    if (!isNaN(newPrice)) {
                        currentPrices[coin] = newPrice;
                    }
                });

                // Update prevPrice only for selected coins for the flash effect
                selectedCoins.forEach(coin => {
                    const newPrice = parseFloat(data[coin]);
                    if (!isNaN(newPrice)) {
                        // Initialize prevPrice if not set
                        if (!window[`prevPrice_${coin}`]) {
                            window[`prevPrice_${coin}`] = newPrice;
                        }
                    }
                });

                setCurrentPrices(currentPrices);

                // Now update UI which uses these prices
                updateQuotesHTML();

                // Update prevPrice for NEXT tick
                selectedCoins.forEach(coin => {
                    const newPrice = parseFloat(data[coin]);
                    if (!isNaN(newPrice)) {
                        window[`prevPrice_${coin}`] = newPrice;
                    }
                });
            }

            // Update charts to reflect new price line position
            const scatterChart = getScatterChart();
            const liqChart = getLiqChartInstance();
            if (scatterChart) {
                // Update the price line annotation
                const currentPrices = getCurrentPrices();
                const btcPrice = parseFloat(currentPrices['BTC'] || 0);
                const activeEntryCurrency = getActiveEntryCurrency();

                // Calculate refPrice based on entry currency (X-axis)
                let refPrice = btcPrice;
                if (activeEntryCurrency === 'BTC') {
                    refPrice = 1;
                } else if (activeEntryCurrency && activeEntryCurrency !== 'USD') {
                    const fxRates = getFxRates();
                    const rate = fxRates[activeEntryCurrency] || 1;
                    refPrice = btcPrice * rate;
                }

                // Update BTC price label plugin
                if (scatterChart.options.plugins.btcPriceLabel) {
                    scatterChart.options.plugins.btcPriceLabel.price = refPrice;
                    const currencyMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
                    const showSymbols = getShowSymbols();
                    const sym = showSymbols ? currencyMeta.symbol : '';
                    scatterChart.options.plugins.btcPriceLabel.text = `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    // DEBUG: Chart update
                    //console.log(`[ChartUpdate] Scatter refPrice: ${refPrice} (Entry Currency: ${activeEntryCurrency})`);
                }

                // DEBUG: Check chart validity before update
                const canvas = document.getElementById('scatterChart');
                const section = document.getElementById('chart-section');
                //console.log(`[ChartUpdate] scatterChart exists: ${!!scatterChart}, canvas exists: ${!!canvas}, canvas in DOM: ${canvas?.isConnected}, section display: ${section?.style.display}, chart.ctx: ${!!scatterChart?.ctx}, chart.canvas: ${!!scatterChart?.canvas}`);

                // Only update if chart is valid and visible
                const isChartVisible = section && section.style.display !== 'none' && canvas?.offsetParent !== null;
                if (scatterChart.ctx && scatterChart.canvas && canvas && canvas.isConnected && isChartVisible) {
                    try {
                        scatterChart.update('none'); // Use 'none' for instant update without animation
                    } catch (e) {
                        console.warn('[ChartUpdate] scatterChart.update() failed:', e.message);
                    }
                }
            }

            if (liqChart) {
                // Update liquidation chart price line
                const currentPrices = getCurrentPrices();
                const btcPrice = parseFloat(currentPrices['BTC'] || 0);
                const activeEntryCurrency = getActiveEntryCurrency();
                let refPrice = btcPrice;
                if (activeEntryCurrency === 'BTC') {
                    refPrice = 1;
                } else if (activeEntryCurrency && activeEntryCurrency !== 'USD') {
                    const fxRates = getFxRates();
                    const rate = fxRates[activeEntryCurrency] || 1;
                    refPrice = btcPrice * rate;
                }

                // Update annotation
                if (liqChart.options.plugins.annotation && liqChart.options.plugins.annotation.annotations.currentPriceLine) {
                    liqChart.options.plugins.annotation.annotations.currentPriceLine.xMin = refPrice;
                    liqChart.options.plugins.annotation.annotations.currentPriceLine.xMax = refPrice;
                    liqChart.options.plugins.annotation.annotations.currentPriceLine.yMin = undefined;
                    liqChart.options.plugins.annotation.annotations.currentPriceLine.yMax = undefined;
                }

                // Update BTC price label
                if (liqChart.options.plugins.btcPriceLabel) {
                    liqChart.options.plugins.btcPriceLabel.price = refPrice;
                    const currencyMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
                    const showSymbols = getShowSymbols();
                    const sym = showSymbols ? currencyMeta.symbol : '';
                    liqChart.options.plugins.btcPriceLabel.text = `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    // DEBUG: LiqChart update
                    //console.log(`[ChartUpdate] LiqChart refPrice: ${refPrice}`);
                }

                // DEBUG: Check liqChart validity before update
                const liqCanvas = document.getElementById('liqScatterChart');
                const liqSection = document.getElementById('liq-chart-section');
                //console.log(`[ChartUpdate] liqChart exists: ${!!liqChart}, canvas exists: ${!!liqCanvas}, canvas in DOM: ${liqCanvas?.isConnected}, section display: ${liqSection?.style.display}, chart.ctx: ${!!liqChart?.ctx}, chart.canvas: ${!!liqChart?.canvas}`);

                // Only update if chart is valid and visible
                const isLiqVisible = liqSection && liqSection.style.display !== 'none' && liqCanvas?.offsetParent !== null;
                if (liqChart.ctx && liqChart.canvas && liqCanvas && liqCanvas.isConnected && isLiqVisible) {
                    try {
                        liqChart.update('none'); // Use 'none' for instant update
                    } catch (e) {
                        console.warn('[ChartUpdate] liqChart.update() failed:', e.message);
                    }
                }
            }

            // Update aggregation table highlight if active
            renderAggregationTable();
            renderAggregationTableResumida();

            // Update main table with new prices (using lightweight update to preserve column settings)
            updateTablePriceData();
        } catch (e) {
            console.warn('Failed to fetch prices', e);
        }
    }, getPriceUpdateInterval());
}

export function stopPriceTicker() {
    if (priceTicker) {
        clearInterval(priceTicker);
        priceTicker = null;
    }
}

export function removeCoin(coin) {
    const selectedCoins = getSelectedCoins();
    setSelectedCoins(selectedCoins.filter(c => c !== coin));
    saveSettings();
    updateCoinSearchLabel();
    renderTable();
    renderQuotesPanel();
}

