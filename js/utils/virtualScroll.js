// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Virtual Scrolling
// ═══════════════════════════════════════════════════════════

/**
 * Virtual scrolling implementation for large tables
 * Only renders visible rows + buffer to improve performance
 */
export class VirtualScroll {
    constructor(options = {}) {
        this.rowHeight = options.rowHeight || 52;
        this.rowHeightMeasured = false; // Will calibrate on first real render
        this.bufferSize = options.bufferSize || 5;
        this.keyField = options.keyField || null;
        this.tbody = options.tbody;
        this.data = [];
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.totalHeight = 0;
        this.renderedRows = new Map(); // Track rendered rows by index

        if (!this.tbody) {
            console.error('VirtualScroll: tbody element is required');
            return;
        }

        // Setup scroll listener
        this.setupScrollListener();
    }

    setupScrollListener() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;

        let ticking = false;
        tableContainer.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    handleScroll() {
        const tableContainer = this.tbody.closest('.table-wrap');
        const scrollTop = tableContainer ? tableContainer.scrollTop : 0;
        this.scrollTop = scrollTop;

        const oldStart = this.visibleStart;
        const oldEnd = this.visibleEnd;

        this.updateVisibleRange();

        // Only render if visible range changed
        if (this.visibleStart !== oldStart || this.visibleEnd !== oldEnd) {
            // Use requestAnimationFrame for smoother rendering
            requestAnimationFrame(() => {
                this.render();
            });
        }
    }

    updateVisibleRange() {
        const containerEl = this.tbody.closest('.table-wrap');
        // Use a fallback height (800px ≈ 20 rows) when the container hasn't been laid out yet
        const containerHeight = (containerEl?.offsetHeight) || 800;
        const startRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - this.bufferSize);
        const endRow = Math.min(
            this.data.length,
            Math.ceil((this.scrollTop + containerHeight) / this.rowHeight) + this.bufferSize
        );

        this.visibleStart = startRow;
        this.visibleEnd = endRow;
    }

    setData(data) {
        this.data = data;

        // Update height estimation using currently known row height
        this.totalHeight = data.length * this.rowHeight;

        this.updateVisibleRange();
        this.render(true); // Force update content

        // Only run calibration passes if we haven't successfully measured the row height yet!
        // Doing this on every setData in a real-time table causes severe scroll jumping.
        if (!this.rowHeightMeasured) {
            // PERFORMANCE: Consolidated multiple requestAnimationFrame calls into one
            // and reduced timeout from 250ms to 50ms for faster calibration.
            // This reduces layout thrashing and improves responsiveness during data updates.
            let calibrationPass = 0;
            const runCalibration = () => {
                calibrationPass++;
                this._calibrateRowHeight();
                if (this.rowHeightMeasured) {
                    this.updateVisibleRange();
                    this.render(true);
                } else if (calibrationPass < 2) {
                    // Schedule second pass with shorter delay (50ms instead of 250ms)
                    setTimeout(() => {
                        requestAnimationFrame(runCalibration);
                    }, 50);
                }
            };
            requestAnimationFrame(runCalibration);
        }
    }

    _calibrateRowHeight() {
        if (this.rowHeightMeasured) return;
        // Find the first real data row (not spacers)
        const realRow = Array.from(this.tbody.children).find(
            el => !el.classList.contains('vs-top-spacer') && !el.classList.contains('vs-bottom-spacer')
        );
        if (realRow && realRow.offsetHeight > 0) {
            const measuredHeight = realRow.offsetHeight;
            if (Math.abs(measuredHeight - this.rowHeight) > 2) {
                // Real height differs from estimate - recalculate total
                this.rowHeight = measuredHeight;
                this.totalHeight = this.data.length * this.rowHeight;
            }
            this.rowHeightMeasured = true;
        }
    }

    render(forceUpdate = false) {
        if (!this.tbody) return;

        const paddingTop = this.visibleStart * this.rowHeight;
        const paddingBottom = Math.max(0, (this.data.length - this.visibleEnd) * this.rowHeight);

        // Ensure spacers exist
        let topSpacer = this.tbody.querySelector('.vs-top-spacer');
        if (!topSpacer) {
            topSpacer = document.createElement('tr');
            topSpacer.className = 'vs-top-spacer';
            topSpacer.style.border = 'none';
            topSpacer.style.background = 'transparent';
            // Set colspan realistic enough to cover max columns but not break auto layouts (e.g 20)
            topSpacer.innerHTML = '<td colspan="25" style="padding: 0; border: none; height: 0;"></td>';
            this.tbody.insertBefore(topSpacer, this.tbody.firstChild);
        }

        let bottomSpacer = this.tbody.querySelector('.vs-bottom-spacer');
        if (!bottomSpacer) {
            bottomSpacer = document.createElement('tr');
            bottomSpacer.className = 'vs-bottom-spacer';
            bottomSpacer.style.border = 'none';
            bottomSpacer.style.background = 'transparent';
            bottomSpacer.innerHTML = '<td colspan="25" style="padding: 0; border: none; height: 0;"></td>';
            this.tbody.appendChild(bottomSpacer);
        }

        topSpacer.style.height = `${paddingTop}px`;
        topSpacer.style.display = paddingTop > 0 ? '' : 'none';

        bottomSpacer.style.height = `${paddingBottom}px`;
        bottomSpacer.style.display = paddingBottom > 0 ? '' : 'none';

        // Collect existing data rows
        const existingRows = Array.from(this.tbody.children).filter(
            el => !el.classList.contains('vs-top-spacer') && !el.classList.contains('vs-bottom-spacer')
        );

        const neededRowsCount = this.visibleEnd - this.visibleStart;

        // Add or remove rows to match the visible count
        while (existingRows.length < neededRowsCount) {
            const tr = document.createElement('tr');
            this.tbody.insertBefore(tr, bottomSpacer);
            existingRows.push(tr);
        }
        while (existingRows.length > neededRowsCount) {
            const tr = existingRows.pop();
            tr.remove();
        }

        // Helper template for parsing HTML strings
        const tempTemplate = document.createElement('template');

        // Update the content of each row
        let rowIndex = this.visibleStart;
        for (let i = 0; i < neededRowsCount; i++) {
            const rowData = this.data[rowIndex];
            const tr = existingRows[i];

            if (rowData) {
                // We extract just the inner content of the tr string (everything between <tr...> and </tr>)
                const fullHtml = rowData.html || this.renderRow(rowData, rowIndex);

                // Use robust DOM parsing instead of brittle regex
                tempTemplate.innerHTML = fullHtml.trim();
                const sourceTr = tempTemplate.content.firstElementChild;

                if (sourceTr) {
                    // Check if update is needed
                    // PERFORMANCE: Only update attributes and content if they actually changed
                    if (tr.className !== sourceTr.className) tr.className = sourceTr.className;
                    if (tr.style.cssText !== sourceTr.style.cssText) tr.style.cssText = sourceTr.style.cssText;

                    // Use innerHTML update only if changed - simple string compare is often faster than DOM thrashing
                    const newInnerHtml = sourceTr.innerHTML;
                    if (tr.innerHTML !== newInnerHtml) {
                        tr.innerHTML = newInnerHtml;
                    }

                    // Track index
                    tr.dataset.sourceIndex = String(rowIndex);
                } else {
                    // Fallback for non-TR strings (e.g. just inner content)
                    if (forceUpdate || tr.dataset.sourceIndex !== String(rowIndex)) {
                        tr.innerHTML = fullHtml;
                        tr.dataset.sourceIndex = String(rowIndex);
                    }
                }
            }
            rowIndex++;
        }
    }

    renderRow(row, index) {
        // Default row renderer - override in subclass or pass as option
        return `<div class="virtual-row" data-index="${index}">Row ${index}</div>`;
    }

    scrollToIndex(index) {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;

        const containerHeight = tableContainer.offsetHeight;
        const rowTop = index * this.rowHeight;
        const centeredTop = rowTop - (containerHeight / 2) + (this.rowHeight / 2);

        // Clamp values to valid scroll range
        const maxScroll = this.totalHeight - containerHeight;
        const clampedTop = Math.max(0, Math.min(centeredTop, maxScroll));

        tableContainer.scrollTop = clampedTop;
    }

    destroy() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (tableContainer) {
            tableContainer.removeEventListener('scroll', this.handleScroll.bind(this));
        }
        this.data = [];
        this.renderedRows.clear();
    }
}

/**
 * Simple virtual scroll for table rows
 * Only enables when row count exceeds threshold
 */
export function enableVirtualScroll(tbodyId = 'positionsTableBody', options = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const threshold = options.threshold || 100;
    let rowHeight = options.rowHeight || 52;
    const bufferSize = options.bufferSize || 5;

    let virtualScroll = null;
    let currentRenderer = null;

    const renderFn = (rows, rowRenderer) => {
        // Update renderer if provided
        if (rowRenderer) currentRenderer = rowRenderer;

        // Use stored renderer if not provided
        const renderer = rowRenderer || currentRenderer;
        if (!renderer) {
            console.error('VirtualScroll: No row renderer provided');
            return;
        }

        if (rows.length > threshold) {
            if (!virtualScroll) {
                virtualScroll = new VirtualScroll({
                    tbody,
                    rowHeight,
                    bufferSize
                });
            }

            // PERFORMANCE: Avoid mapping over all rows to pre-calculate HTML.
            // Wire the custom renderer directly into the VirtualScroll instance so
            // it calls renderer(rowData, rowIndex) on-demand for only visible rows.
            virtualScroll.renderRow = renderer;

            // Reset tbody to clean up any leftover regular rows
            if (virtualScroll.data.length === 0) {
                tbody.innerHTML = '';
            }

            virtualScroll.setData(rows);
        } else {
            // Disable virtual scroll for small datasets
            if (virtualScroll) {
                virtualScroll.destroy();
                virtualScroll = null;
            }

            // Render all rows normally
            tbody.innerHTML = rows.map((row, index) => renderer(row, index)).join('');
        }
    };

    return {
        render: renderFn,
        setData: (rows) => renderFn(rows, currentRenderer),
        set renderRow(fn) { currentRenderer = fn; },
        get renderRow() { return currentRenderer },
        setRowHeight: (height) => {
            rowHeight = height;
            if (virtualScroll) {
                virtualScroll.rowHeight = height;
                virtualScroll.rowHeightMeasured = false;
                virtualScroll.totalHeight = virtualScroll.data.length * height;
                virtualScroll.updateVisibleRange();
                virtualScroll.render(true);
            }
        },
        scrollToIndex: (index) => {
            if (virtualScroll) {
                virtualScroll.scrollToIndex(index);
            } else {
                // Fallback for non-virtualized table
                const rows = tbody.querySelectorAll('tr');
                if (rows[index]) {
                    rows[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        },
        destroy: () => {
            if (virtualScroll) {
                virtualScroll.destroy();
                virtualScroll = null;
            }
        }
    };
}
