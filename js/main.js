// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Main Entry Point
// ═══════════════════════════════════════════════════════════

import { loadInitialState, setupEventListeners, initializeCharts, initializePanels } from './events/init.js';
import { showToast } from './ui/toast.js';

// Simple entry point
async function init() {
    console.log('Initializing Liquid Glass v6.0 (Service Worker Fix)...');
    
    // Debug toast
    setTimeout(() => {
        showToast('System Updated: v6.0', 'success', 5000);
    }, 1000);

    // Load state and settings first
    await loadInitialState();

    // Setup event listeners
    setupEventListeners();

    // Initialize charts
    initializeCharts();

    // Initialize panels (charts are rendered within loadInitialState via renderTable)
    initializePanels();

    console.log('Liquid Glass initialized');
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
