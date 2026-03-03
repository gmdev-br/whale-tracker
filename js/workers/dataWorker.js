const MAX_REASONABLE_PRICE = 10000000;
const MAX_ALLOWED_BANDS = 5000;
const MIN_VALID_COIN_PRICE = 0.0001;

// Helper: Convert USD value to active currency (BTC or Fiat)
function convertToActiveCcy(valUSD, overrideCcy = null, activeCurrency, fxRates, currentPrices) {
    const ccy = overrideCcy || activeCurrency;
    if (ccy === 'USD') return valUSD;
    if (ccy === 'BTC') {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        return btcPrice > 0 ? valUSD / btcPrice : 0;
    }
    const rate = fxRates[ccy] || 1;
    return valUSD * rate;
}

// Helper: Calculate correlated price (BTC equivalent) and convert to target fiat if needed
function getCorrelatedPrice(row, rawPrice, activeEntryCurrency, currentPrices, fxRates) {
    const targetCcy = activeEntryCurrency || 'USD';
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);
    const isValidCoinPrice = coinPrice >= MIN_VALID_COIN_PRICE;
    let correlatedVal = rawPrice;
    if (row.coin !== 'BTC' && btcPrice > 0 && isValidCoinPrice) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    }
    if (targetCcy === 'USD' || targetCcy === 'BTC') return correlatedVal;
    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
}

function getCorrelatedEntry(row, activeEntryCurrency, currentPrices, fxRates) {
    return getCorrelatedPrice(row, row.entryPx, activeEntryCurrency, currentPrices, fxRates);
}

// PERFORMANCE: Process rows in async chunks to avoid blocking the worker thread
const CHUNK_SIZE = 1000;
async function processRowsInChunks(rows, currentPrices, fxRates, activeCurrency, activeEntryCurrency, btcPrice) {
    const result = new Array(rows.length);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, rows.length);
        for (let j = i; j < end; j++) {
            const r = rows[j];
            const coinPrice = parseFloat(currentPrices[r.coin] || r.markPrice || 0);

            // PERFORMANCE: Avoid object spreading {...r}. Direct assignment is 3-5x faster.
            const newRow = Object.assign({}, r);

            if (!isNaN(coinPrice) && coinPrice > 0) {
                newRow.markPrice = coinPrice;
                const posVal = Math.abs(newRow.szi) * coinPrice;
                newRow.positionValue = posVal;
                if (newRow.leverageValue > 0) newRow.marginUsed = posVal / newRow.leverageValue;
                newRow.unrealizedPnl = (coinPrice - newRow.entryPx) * newRow.szi;
                newRow.distPct = newRow.liquidationPx > 0 ? Math.abs((coinPrice - newRow.liquidationPx) / coinPrice) * 100 : null;
                newRow._volBTC = btcPrice > 0 ? posVal / btcPrice : 0;
                newRow._sqrtPosVal = Math.sqrt(posVal);
            }
            newRow._valCcy = convertToActiveCcy(newRow.positionValue, null, activeCurrency, fxRates, currentPrices);
            newRow._entCcy = getCorrelatedEntry(newRow, activeEntryCurrency, currentPrices, fxRates);
            newRow._liqPxCcy = newRow.liquidationPx > 0 ? getCorrelatedPrice(newRow, newRow.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;

            result[j] = newRow;
        }
        if (i + CHUNK_SIZE < rows.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return result;
}

// Worker-side persistent logic
let cachedAllRows = null;
let cachedWhaleMeta = null;
let cachedUpdatedRows = null;
let lastPriceUpdateVersion = -1;

self.onmessage = async function (e) {
    const {
        allRows: incomingAllRows,
        whaleMeta: incomingWhaleMeta,
        filterState,
        sortState,
        currencyState,
        aggParams,
        priceUpdateVersion
    } = e.data;

    if (incomingAllRows) cachedAllRows = incomingAllRows;
    if (incomingWhaleMeta) cachedWhaleMeta = incomingWhaleMeta;
    if (!cachedAllRows) return;

    const { activeCurrency, activeEntryCurrency, currentPrices, fxRates } = currencyState;

    if (!cachedUpdatedRows || lastPriceUpdateVersion !== priceUpdateVersion || incomingAllRows) {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        cachedUpdatedRows = await processRowsInChunks(cachedAllRows, currentPrices, fxRates, activeCurrency, activeEntryCurrency, btcPrice);
        lastPriceUpdateVersion = priceUpdateVersion;
    }

    const { selectedCoins, addressFilter, sideFilter, minLev, maxLev, minSize, minFunding, levTypeFilter, minSzi, maxSzi, minValueCcy, maxValueCcy, minEntryCcy, maxEntryCcy, minUpnl, maxUpnl } = filterState;
    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;
    const selectedCoinSet = (selectedCoins && selectedCoins.length > 0) ? new Set(selectedCoins) : null;

    // 1. Filter
    let rows = cachedUpdatedRows.filter(r => {
        if (selectedCoinSet && !selectedCoinSet.has(r.coin)) return false;
        if (addressFilterRegex) {
            const meta = cachedWhaleMeta[r.address];
            if (!addressFilterRegex.test(r.address) && !addressFilterRegex.test(meta?.displayName || '')) return false;
        }
        if (sideFilter && r.side !== sideFilter) return false;
        if (!isNaN(minLev) && r.leverageValue < minLev) return false;
        if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
        if (!isNaN(minSize) && r.positionValue < minSize) return false;
        if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
        if (levTypeFilter && r.leverageType !== levTypeFilter) return false;
        if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
        if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;
        if (!isNaN(minValueCcy) && r._valCcy < minValueCcy) return false;
        if (!isNaN(maxValueCcy) && r._valCcy > maxValueCcy) return false;
        if (!isNaN(minEntryCcy) && r._entCcy < minEntryCcy) return false;
        if (!isNaN(maxEntryCcy) && r._entCcy > maxEntryCcy) return false;
        if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
        if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;
        return true;
    });

    // 2. Sort
    const { sortKey, sortDir } = sortState;
    rows.sort((a, b) => {
        let va, vb;
        if (sortKey === 'coin') return sortDir * a.coin.localeCompare(b.coin);
        if (sortKey === 'valueCcy') { va = a._valCcy; vb = b._valCcy; }
        else if (sortKey === 'entryCcy') { va = a._entCcy; vb = b._entCcy; }
        else if (sortKey === 'liqPx') { va = a._liqPxCcy; vb = b._liqPxCcy; }
        else { va = a[sortKey] ?? 0; vb = b[sortKey] ?? 0; }
        return sortDir * (vb - va);
    });

    // 3. Single-Pass Stats, Aggregation & Chart Data Pre-calc
    const { bandSize, minPriceFull, maxPriceFull, minPriceSummary, maxPriceSummary } = aggParams || {};
    const fullBands = {};
    const resBands = {};

    // PERFORMANCE: Pre-allocate chart data arrays to avoid UI-thread O(N) mapping
    const scatterPoints = [];
    const liqPoints = [];
    const bubbleScale = filterState.bubbleScale || 1.0;

    const stats = {
        whalesWithPos: 0, whalesLong: 0, whalesShort: 0,
        positionsLongCount: 0, positionsShortCount: 0,
        totalUpnl: 0, upnlLong: 0, upnlShort: 0,
        totalCap: 0, capLong: 0, capShort: 0,
        largest: 0, coinStats: {}, uniqueCoins: [],
        aggFull: null, aggRes: null,
        scatterPoints, liqPoints // Pre-calculated chart data
    };

    const whalesWithPosSet = new Set();
    const whalesLongSet = new Set();
    const whalesShortSet = new Set();
    const processedWhalesForCap = new Set(); // Track whales already counted in totalCap pass

    const createBand = (priceVal) => ({
        faixaDe: priceVal, faixaAte: priceVal + (bandSize || 0),
        qtdLong: 0, notionalLong: 0,
        qtdShort: 0, notionalShort: 0,
        sumLiqNotionalLong: 0, sumLiqNotionalShort: 0,
        liqVolLong: 0, liqVolShort: 0,
        ativosLong: new Set(), ativosShort: new Set(),
        positionsLong: [], positionsShort: [],
        whalesLong: new Set(), whalesShort: new Set(),
        isEmpty: true
    });

    const isInRange = (price, min, max) => (min <= 0 || max <= 0) || (price >= min && price <= max);

    let totalLongNotional = 0;
    let totalShortNotional = 0;

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const addr = r.address;

        // General Stats
        whalesWithPosSet.add(addr);
        stats.totalUpnl += r.unrealizedPnl;
        if (r.side === 'long') {
            whalesLongSet.add(addr);
            stats.upnlLong += r.unrealizedPnl;
            stats.positionsLongCount++;
        } else {
            whalesShortSet.add(addr);
            stats.upnlShort += r.unrealizedPnl;
            stats.positionsShortCount++;
        }

        // PERFORMANCE: Consolidate whale market cap into main pass
        if (!processedWhalesForCap.has(addr)) {
            const meta = cachedWhaleMeta[addr];
            const val = meta?.accountValue || 0;
            stats.totalCap += val;
            if (val > stats.largest) stats.largest = val;
            if (whalesLongSet.has(addr)) stats.capLong += val;
            if (whalesShortSet.has(addr)) stats.capShort += val;
            processedWhalesForCap.add(addr);
        }

        if (!stats.coinStats[r.coin]) stats.coinStats[r.coin] = { totalPositionValue: 0, count: 0, whaleCount: 0, _whales: new Set() };
        const cs = stats.coinStats[r.coin];
        cs.totalPositionValue += r.positionValue;
        cs.count++;
        if (!cs._whales.has(addr)) {
            cs.whaleCount++;
            cs._whales.add(addr);
        }

        // PERFORMANCE: Pre-calculate chart points
        if (r._volBTC > 0) {
            const commonPointData = {
                y: r._volBTC,
                r: r._sqrtPosVal / 1000 * bubbleScale,
                _raw: r
            };

            // Scatter points (x = entry price)
            scatterPoints.push({ x: r._entCcy, ...commonPointData });

            // Liquidation points (x = liq price)
            if (r._liqPxCcy > 0) {
                liqPoints.push({ x: r._liqPxCcy, ...commonPointData });
            }
        }

        // Aggregation logic
        if (aggParams) {
            const entryCcy = r._entCcy;
            const val = r.positionValue;
            const liqPriceCorr = r._liqPxCcy;
            const bandKey = Math.floor(entryCcy / bandSize) * bandSize;

            if (isInRange(entryCcy, minPriceFull, maxPriceFull)) {
                if (!fullBands[bandKey]) fullBands[bandKey] = createBand(bandKey);
                const b = fullBands[bandKey];
                b.isEmpty = false;
                if (r.side === 'long') {
                    b.qtdLong++; b.notionalLong += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalLong += (liqPriceCorr * val);
                    b.ativosLong.add(r.coin);
                    b.positionsLong.push(r);
                    b.whalesLong.add(addr);
                    totalLongNotional += val;
                } else {
                    b.qtdShort++; b.notionalShort += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalShort += (liqPriceCorr * val);
                    b.ativosShort.add(r.coin);
                    b.positionsShort.push(r);
                    b.whalesShort.add(addr);
                    totalShortNotional += val;
                }
            }

            if (isInRange(entryCcy, minPriceSummary, maxPriceSummary)) {
                if (!resBands[bandKey]) resBands[bandKey] = createBand(bandKey);
                const b = resBands[bandKey];
                b.isEmpty = false;
                if (r.side === 'long') {
                    b.qtdLong++; b.notionalLong += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalLong += (liqPriceCorr * val);
                    b.ativosLong.add(r.coin);
                    b.positionsLong.push(r);
                    b.whalesLong.add(addr);
                } else {
                    b.qtdShort++; b.notionalShort += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalShort += (liqPriceCorr * val);
                    b.ativosShort.add(r.coin);
                    b.positionsShort.push(r);
                    b.whalesShort.add(addr);
                }
            }

            if (liqPriceCorr > 0) {
                const liqBandKey = Math.floor(liqPriceCorr / bandSize) * bandSize;
                if (isInRange(liqPriceCorr, minPriceFull, maxPriceFull)) {
                    if (!fullBands[liqBandKey]) fullBands[liqBandKey] = createBand(liqBandKey);
                    fullBands[liqBandKey].isEmpty = false;
                    if (r.side === 'long') fullBands[liqBandKey].liqVolLong += val;
                    else fullBands[liqBandKey].liqVolShort += val;
                }
                if (isInRange(liqPriceCorr, minPriceSummary, maxPriceSummary)) {
                    if (!resBands[liqBandKey]) resBands[liqBandKey] = createBand(liqBandKey);
                    resBands[liqBandKey].isEmpty = false;
                    if (r.side === 'long') resBands[liqBandKey].liqVolLong += val;
                    else resBands[liqBandKey].liqVolShort += val;
                }
            }
        }
    }

    // Finalize Stats
    const coins = Object.keys(stats.coinStats).sort();
    stats.uniqueCoins = coins;
    for (let i = 0; i < coins.length; i++) {
        delete stats.coinStats[coins[i]]._whales;
    }

    stats.whalesWithPos = whalesWithPosSet.size;
    stats.whalesLong = whalesLongSet.size;
    stats.whalesShort = whalesShortSet.size;

    // Finalize Aggregation
    if (aggParams) {
        const finalize = (bandsMap) => {
            const arr = Object.values(bandsMap).sort((a, b) => b.faixaDe - a.faixaDe);
            for (let i = 0; i < arr.length; i++) {
                const b = arr[i];
                if (!b.isEmpty) {
                    b.positionsLong.sort((x, y) => y.positionValue - x.positionValue);
                    b.positionsShort.sort((x, y) => y.positionValue - x.positionValue);
                    b.ativosLong = Array.from(b.ativosLong);
                    b.ativosShort = Array.from(b.ativosShort);
                    b.whalesLongCount = b.whalesLong.size;
                    b.whalesShortCount = b.whalesShort.size;
                    delete b.whalesLong;
                    delete b.whalesShort;
                }
            }
            return { bandArray: arr, totalLongNotional, totalShortNotional, bandsWithPosCount: arr.filter(x => !x.isEmpty).length };
        };

        stats.aggFull = finalize(fullBands);
        const aggRes = finalize(resBands);

        // Summary filtering
        if (aggRes.bandArray) {
            aggRes.bandArray = aggRes.bandArray.filter(b => {
                if (b.isEmpty) return false;
                return (b.notionalLong + b.notionalShort >= 10_000_000) ||
                    (b.liqVolLong >= 10_000_000 || b.liqVolShort >= 10_000_000);
            });
        }
        stats.aggRes = aggRes;
    }

    self.postMessage({ rows, stats });
};
