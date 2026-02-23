# Action Plan: Fix Real-time Updates and Currency Switching

## 1. Diagnosis
The user reports persistent issues despite previous fixes:
1.  **Crypto Table Not Updating:** Real-time data (PnL, Value, Dist%) remains static.
2.  **BTC Price Line Static:** The "Current Price" line on charts doesn't move.
3.  **Currency Switching Failed:** Switching from USD to BTC has no effect on the table.
4.  **Service Worker Caching:** Strong indication that the browser is serving old code (`sw.js` cache) preventing fixes from loading.

## 2. Technical Root Causes (Identified & Verified)
-   **Table Update:** `panels.js` was updated to call `renderTable()`, and `table.js` now invalidates cache on price updates. Logic is correct.
-   **Worker Calculation:** `dataWorker.js` correctly recalculates derived fields (`unrealizedPnl`, `positionValue`) using new prices.
-   **BTC Conversion:** `convertToActiveCcy` in `dataWorker.js` now handles `targetCurrency === 'BTC'` correctly.
-   **Service Worker:** `sw.js` was updated to `v6` and includes `self.skipWaiting()`. However, the user might still be on the old version if they haven't closed/reopened the tab or hard-refreshed.

## 3. Implementation Plan

### Phase 1: Force Update & Cache Clearing (Critical)
-   **Objective:** Ensure the user receives the latest code.
-   **Action:** Add a "New Version Available" toast notification in `main.js` / `index.html` that appears when a new Service Worker is detected, with a "Reload" button that forces `window.location.reload()`.
-   **Action:** Explicitly unregister old service workers if necessary during `init.js` to ensure a clean slate for debugging.

### Phase 2: Verify & Fix Chart Annotations
- [x] Action: In `panels.js`, verify that `scatterChart.options.plugins.annotation.annotations.currentPriceLine` is correctly targeting the `xScale` (which changes based on currency).
  - **Findings**: The chart uses a custom plugin `btcPriceLabel` instead of the standard `annotation` plugin. The `refPrice` calculation was using `activeCurrency` (Value) instead of `activeEntryCurrency` (X-Axis), causing mismatch when currencies differed.
  - **Fix**: Updated `panels.js` to use `activeEntryCurrency` for `refPrice` and correctly update `btcPriceLabel` options. Removed dead code for `annotation` plugin.

### Phase 3: Verify Currency Switching Logic
- [x] Action: Verify `activeCurrency` state propagation to `dataWorker.js`.
  - **Status**: Confirmed `currencyState` including `activeCurrency` is passed to worker. Added debug logs to worker to verify receipt.
- [ ] Action: Verify that `renderTable` triggers a re-render with the new currency.
- [ ] Action: Check if `virtualScrollManager` needs a force update when currency changes.

### Phase 4: User Feedback Loop
-   **Objective:** Confirm fix.
-   **Action:** Ask the user to click the "Reload" button (if implemented) or perform a hard refresh (Ctrl+F5) after these changes.

## 4. Success Criteria
1.  **Table Updates:** PnL and Value columns change every ~3 seconds.
2.  **BTC Line:** The vertical line on the chart moves with the BTC price.
3.  **BTC Mode:** Switching to BTC converts all $ values to ₿ values in the table.
4.  **Logs:** Console shows `[PriceUpdate]` and `[TableRender]` occurring in sync.

## 5. Execution Steps
1.  **Approve Plan:** User approves this plan.
2.  **Implement Toast:** Add update notification.
3.  **Refine Worker Logging:** Add temporary logs to `dataWorker.js` for verification.
4.  **Deploy:** User tests.

## 6. Adjustable Row Height (Completed)
- **Objective:** Allow users to customize the height of table rows for better density control.
- **Implementation:**
  - Added `rowHeight` to `state.js` and `settings.js`.
  - Added UI control in `index.html`.
  - Implemented `updateRowHeight` handler in `handlers.js`.
  - Updated `table.js` to use `rowHeight` in virtual scrolling and rendering.
  - Added event listeners in `init.js`.
