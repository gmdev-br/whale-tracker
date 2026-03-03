// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Column Width Control
// ═══════════════════════════════════════════════════════════

import { getColumnWidth, setColumnWidth } from '../state.js';
import { saveSettings } from '../storage/settings.js';

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

export function initColumnWidthControl() {
    const columnWidthInputs = document.querySelectorAll('.js-column-width-input');
    const columnWidthVals = document.querySelectorAll('.js-column-width-val');

    if (columnWidthInputs.length === 0 || columnWidthVals.length === 0) {
        console.error('Column width input elements not found');
        return;
    }

    // Initialize with saved value or default
    const initialWidth = getColumnWidth();

    // Sync both mobile and desktop controls
    syncControls(['.js-column-width-input', '.js-column-width-val'], initialWidth);

    //console.log('Column width control initialized with width:', initialWidth);

    // Apply initial column width after a delay to ensure table is rendered
    setTimeout(() => applyColumnWidth(initialWidth), 500);

    // Event listeners for column width changes (both mobile and desktop)
    columnWidthInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            let width = parseInt(e.target.value, 10);

            // Validate and clamp the value
            if (isNaN(width)) width = 100;
            if (width < 60) width = 60;
            if (width > 500) width = 500;

            // Sync all controls
            syncControls(['.js-column-width-input', '.js-column-width-val'], width);
            setColumnWidth(width);
            applyColumnWidth(width);
        });

        // Save settings when user stops typing
        input.addEventListener('change', () => {
            saveSettings();
        });
    });
}

export function applyColumnWidth(width) {
    //console.log('applyColumnWidth called with width:', width);

    const table = document.getElementById('positionsTable');
    if (!table) {
        console.warn('Positions table not found for column width adjustment - will retry in 100ms');
        setTimeout(() => applyColumnWidth(width), 100);
        return;
    }

    // Set the CSS variable on the document root or table
    document.documentElement.style.setProperty('--column-width', width + 'px');
    document.documentElement.style.setProperty('--column-width-mobile', width + 'px');

    //console.log('Column width variable --column-width set to:', width + 'px');
}
