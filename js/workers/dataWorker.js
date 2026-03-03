// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Data Processing Web Worker
// ═══════════════════════════════════════════════════════════

// Currency conversion logic adapted for the worker
function convertToActiveCcy(valueUsd, coin, targetCurrency, fxRates, currentPrices) {
    if (!valueUsd) return 0;
    if (!targetCurrency || targetCurrency === 'USD') return valueUsd;

    if (targetCurrency === 'BTC') {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        return btcPrice > 0 ? valueUsd / btcPrice : 0;
    }

    // For non-USD, convert using fxRates matrix
    const rate = fxRates[targetCurrency] || 1;
    return valueUsd * rate;
}

function getCorrelatedEntry(row, targetCurrency, currentPrices, fxRates) {
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);

    let correlatedVal = row.entryPx;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = row.entryPx * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = row.entryPx;
    }

    if (!targetCurrency || targetCurrency === 'USD') {
        return correlatedVal;
    }

    if (targetCurrency === 'BTC') {
        return correlatedVal;
    }

    const rate = fxRates[targetCurrency] || 1;
    return correlatedVal * rate;
}

function getCorrelatedPrice(row, rawPrice, targetCurrency, currentPrices, fxRates) {
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);

    let correlatedVal = rawPrice;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = rawPrice;
    }

    if (!targetCurrency || targetCurrency === 'USD') {
        return correlatedVal;
    }

    if (targetCurrency === 'BTC') {
        return correlatedVal;
    }

    const rate = fxRates[targetCurrency] || 1;
    return correlatedVal * rate;
}

self.onmessage = async function (e) {
    const {
        allRows,
        whaleMeta,
        filterState,
        sortState,
        currencyState
    } = e.data;

    const {
        selectedCoins, addressFilter, sideFilter,
        minLev, maxLev, minSize, minFunding, levTypeFilter,
        minSzi, maxSzi, minValueCcy, maxValueCcy,
        minEntryCcy, maxEntryCcy, minUpnl, maxUpnl
    } = filterState;

    // DEBUG: Log all received data
    //console.log(`[Worker] Received message:`);
    //console.log(`[Worker] allRows count: ${allRows?.length || 0}`);
    //console.log(`[Worker] selectedCoins:`, selectedCoins);

    // PERFORMANCE: Pre-calculate coinSet once for efficient validation
    const coinSet = (allRows?.length > 0) ? new Set(allRows.map(r => r.coin)) : new Set();

    // FIX: Validate selectedCoins against actual data rows efficiently
    let effectiveSelectedCoins = selectedCoins;
    if (selectedCoins?.length > 0) {
        const matchingCoins = selectedCoins.filter(sc => coinSet.has(sc));

        if (matchingCoins.length === 0) {
            console.warn(`[Worker] selectedCoins has ${selectedCoins.length} coins but none match data. Ignoring coin filter.`);
            effectiveSelectedCoins = [];
        } else if (matchingCoins.length !== selectedCoins.length) {
            //console.log(`[Worker] Filtering to ${matchingCoins.length}/${selectedCoins.length} selected coins`);
            effectiveSelectedCoins = matchingCoins;
        }
    }
    const selectedCoinSet = effectiveSelectedCoins.length > 0 ? new Set(effectiveSelectedCoins) : null;

    const { activeCurrency, activeEntryCurrency, currentPrices, fxRates } = currencyState;
    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;

    // PERFORMANCE: Pre-parsed price data
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);

    // PERFORMANCE: Process rows in async chunks to avoid blocking the worker thread
    const CHUNK_SIZE = 1000;

    async function processRowsInChunks(rows) {
        const result = [];
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);

            const processedChunk = chunk.map(r => {
                const coinPrice = parseFloat(currentPrices[r.coin] || r.markPrice || 0);

                // PERFORMANCE: Update row in-place where possible or use a more efficient update pattern
                // We still want to return a copy to avoid mutation issues if other parts of the system expect it,
                // but we optimize the calculations.
                const newRow = { ...r };

                if (!isNaN(coinPrice) && coinPrice > 0) {
                    newRow.markPrice = coinPrice;
                    newRow.positionValue = Math.abs(newRow.szi) * coinPrice;
                    if (newRow.leverageValue > 0) {
                        newRow.marginUsed = newRow.positionValue / newRow.leverageValue;
                    }
                    newRow.unrealizedPnl = (coinPrice - newRow.entryPx) * newRow.szi;
                    if (newRow.liquidationPx > 0) {
                        newRow.distPct = Math.abs((coinPrice - newRow.liquidationPx) / coinPrice) * 100;
                    } else {
                        newRow.distPct = null;
                    }

                    // PERFORMANCE: Pre-calculate chart-specific fields
                    newRow._volBTC = btcPrice > 0 ? newRow.positionValue / btcPrice : 0;
                    newRow._sqrtPosVal = Math.sqrt(newRow.positionValue);
                }

                // PERFORMANCE: Pre-calculate currency converted values for sorting and filtering
                // This avoids calling convertToActiveCcy/getCorrelatedEntry thousands of times during sort/filter
                newRow._valCcy = convertToActiveCcy(newRow.positionValue, null, activeCurrency, fxRates, currentPrices);
                newRow._entCcy = getCorrelatedEntry(newRow, activeEntryCurrency, currentPrices, fxRates);
                newRow._liqPxCcy = newRow.liquidationPx > 0 ? getCorrelatedPrice(newRow, newRow.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;

                return newRow;
            });

            result.push(...processedChunk);
            if (i + CHUNK_SIZE < rows.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        return result;
    }

    const updatedRows = await processRowsInChunks(allRows);

    // 1. Filter rows using pre-calculated values
    let rows = updatedRows.filter(r => {
        if (selectedCoinSet && !selectedCoinSet.has(r.coin)) return false;

        if (addressFilterRegex) {
            const addr = r.address;
            const meta = whaleMeta[addr];
            const disp = meta?.displayName || '';
            if (!addressFilterRegex.test(addr) && !addressFilterRegex.test(disp)) return false;
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

    // 2. Sort rows using pre-calculated values
    const { sortKey, sortDir } = sortState;

    rows.sort((a, b) => {
        let va, vb;
        if (sortKey === 'coin') {
            return sortDir * a.coin.localeCompare(b.coin);
        } else if (sortKey === 'valueCcy') {
            va = a._valCcy; vb = b._valCcy;
        } else if (sortKey === 'entryCcy') {
            va = a._entCcy; vb = b._entCcy;
        } else if (sortKey === 'liqPx') {
            va = a._liqPxCcy; vb = b._liqPxCcy;
        } else {
            va = a[sortKey] ?? 0;
            vb = b[sortKey] ?? 0;
        }
        return sortDir * (vb - va);
    });

    // 3. Calculate global statistics in a single pass to save main thread time
    const stats = {
        whalesWithPos: 0,
        whalesLong: 0,
        whalesShort: 0,
        positionsLongCount: 0,
        positionsShortCount: 0,
        totalUpnl: 0,
        upnlLong: 0,
        upnlShort: 0,
        totalCap: 0,
        capLong: 0,
        capShort: 0,
        largest: 0
    };

    const whalesWithPosSet = new Set();
    const whalesLongSet = new Set();
    const whalesShortSet = new Set();

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        whalesWithPosSet.add(r.address);
        stats.totalUpnl += r.unrealizedPnl;

        if (r.side === 'long') {
            whalesLongSet.add(r.address);
            stats.upnlLong += r.unrealizedPnl;
            stats.positionsLongCount++;
        } else if (r.side === 'short') {
            whalesShortSet.add(r.address);
            stats.upnlShort += r.unrealizedPnl;
            stats.positionsShortCount++;
        }
    }

    stats.whalesWithPos = whalesWithPosSet.size;
    stats.whalesLong = whalesLongSet.size;
    stats.whalesShort = whalesShortSet.size;

    whalesWithPosSet.forEach(addr => {
        const meta = whaleMeta[addr];
        const val = meta?.accountValue || 0;
        stats.totalCap += val;
        if (val > stats.largest) stats.largest = val;
        if (whalesLongSet.has(addr)) stats.capLong += val;
        if (whalesShortSet.has(addr)) stats.capShort += val;
    });

    self.postMessage({ rows, stats });
};
