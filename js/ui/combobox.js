// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Combobox
// ═══════════════════════════════════════════════════════════

import { getSelectedCoins, setSelectedCoins } from '../state.js';
import { renderTable } from './table.js';
import { updateRankingPanel } from './panels.js';
import { saveSettings } from '../storage/settings.js';

// Generic Combobox Engine
// Each combobox is identified by its base id (e.g. 'sideFilter').
// HTML structure expected:
//   <div class="combobox" id="cb-{id}">
//     <div class="combobox-input-wrap">
//       <input type="text" id="cb-{id}-search" ...>
//       <span class="combobox-arrow">▾</span>
//     </div>
//     <div class="combobox-dropdown" id="cb-{id}-dropdown"></div>
//   </div>
//   <input type="hidden" id="{id}" value="">

const CB_OPTIONS = {}; // id -> [{value, label}]
const CB_TIMERS = {};  // id -> timeout

export function cbInit(id, options, _onChangeFn) {
    //console.log('cbInit called with:', { id, options, _onChangeFn: typeof _onChangeFn });
    CB_OPTIONS[id] = options; // [{value, label}]
    cbRender(id);
    // Set display to match current hidden value
    const hidden = document.getElementById(id);
    //console.log('Hidden input found:', !!hidden, 'Current value:', hidden?.value);
    if (hidden && hidden.value) {
        const opt = options.find(o => o.value === hidden.value);
        const search = document.getElementById(`cb-${id}-search`);
        //console.log('Setting initial display value:', opt?.label);
        if (search && opt) search.value = opt.label;
    }
}

export function cbOpen(id) {
    // Close all other comboboxes first
    Object.keys(CB_OPTIONS).forEach(otherId => {
        if (otherId !== id) cbClose(otherId);
    });
    const cb = document.getElementById(`cb-${id}`);
    if (!cb) return;
    cb.classList.add('open');
    cbRender(id);
}

export function cbCloseDelayed(id) {
    CB_TIMERS[id] = setTimeout(() => cbClose(id), 180);
}

export function cbClose(id) {
    const cb = document.getElementById(`cb-${id}`);
    if (cb) cb.classList.remove('open');
}

export function cbRender(id) {
    const dd = document.getElementById(`cb-${id}-dropdown`);
    if (!dd) return;
    const options = CB_OPTIONS[id] || [];
    const current = document.getElementById(id)?.value || '';

    const html = options.map(o => {
        const isSel = o.value === current;
        const isAll = o.value === '';
        return `<div class="combobox-item${isSel ? ' selected' : ''}${isAll ? ' all-item' : ''}" onmousedown="cbSelect('${id}','${o.value}','${o.label.replace(/'/g, "\\'")}')">` +
            `${o.label}</div>`;
    }).join('');

    dd.innerHTML = html || `<div class="combobox-empty">No options</div>`;
}

export function cbSelect(id, value, _label, _onChangeFn, renderTable) {
    //console.log('cbSelect called with:', { id, value, _label, _onChangeFn: typeof _onChangeFn });
    if (CB_TIMERS[id]) { clearTimeout(CB_TIMERS[id]); delete CB_TIMERS[id]; }
    const hidden = document.getElementById(id);
    if (hidden) hidden.value = value;
    const search = document.getElementById(`cb-${id}-search`);
    if (search) search.value = _label;
    cbClose(id);
    // Fire the appropriate callback
    if (id === 'currencySelect' || id === 'entryCurrencySelect') {
        // Call the currency change handler
        //console.log('Calling currency change handler for:', id);
        if (_onChangeFn) {
            //console.log('Currency change handler exists, calling it...');
            _onChangeFn();
        } else {
            //console.log('Currency change handler is undefined');
        }
    } else {
        saveSettings();
        renderTable();
    }
}

export function cbSetValue(id, value) {
    //console.log('cbSetValue called with:', { id, value });
    const options = CB_OPTIONS[id] || [];
    const opt = options.find(o => o.value === value);
    //console.log('Found option:', opt);
    if (!opt) {
        //console.log('Option not found for value:', value, 'Available options:', options);
        return;
    }
    const hidden = document.getElementById(id);
    if (hidden) {
        hidden.value = value;
        //console.log('Set hidden input value to:', value);
    }
    const search = document.getElementById(`cb-${id}-search`);
    if (search) {
        search.value = opt.label;
        //console.log('Set search input value to:', opt.label);
    }
}

// Coin Combobox (searchable)
let _coinOptions = [];
let _closeTimer = null;

export function openCombobox() {
    // Close generic comboboxes
    Object.keys(CB_OPTIONS).forEach(id => cbClose(id));
    const cb = document.getElementById('coinCombobox');
    if (!cb) return;
    cb.classList.add('open');
    renderCoinDropdown(document.getElementById('coinSearch').value);
}

export function closeComboboxDelayed() {
    _closeTimer = setTimeout(() => {
        const cb = document.getElementById('coinCombobox');
        if (cb) cb.classList.remove('open');
    }, 180);
}

export function onCoinSearch() {
    const cb = document.getElementById('coinCombobox');
    if (cb) cb.classList.add('open');
    const query = document.getElementById('coinSearch').value;
    renderCoinDropdown(query);
}

// Coin dropdown state for change detection
let _lastCoinDropdownHash = '';

export function renderCoinDropdown(query = '') {
    const dd = document.getElementById('coinDropdown');
    if (!dd) return;

    const selectedCoins = getSelectedCoins();
    const selectedSet = new Set(selectedCoins);
    const q = query.toLowerCase().trim();

    // PERFORMANCE: Use simple hash for change detection
    const currentHash = `${q}|${selectedCoins.length}|${_coinOptions.length}`;
    if (currentHash === _lastCoinDropdownHash && q !== '') {
        return;
    }
    _lastCoinDropdownHash = currentHash;

    let html = `<div class="combobox-item all-item ${selectedCoins.length === 0 ? 'selected' : ''}" onmousedown="event.preventDefault(); selectCoin('','')">All coins</div>`;

    let matchCount = 0;
    const items = [];

    for (let i = 0; i < _coinOptions.length; i++) {
        const c = _coinOptions[i];
        if (q && !c.toLowerCase().includes(q)) continue;

        matchCount++;
        const isSel = selectedSet.has(c);
        items.push(`<div class="combobox-item${isSel ? ' selected' : ''}" onmousedown="event.preventDefault(); selectCoin('${c}','${c}')">` +
            `<span class="item-label">${c}</span>${isSel ? '<span class="item-remove">✕</span>' : ''}</div>`);

        // Limit dropdown results for performance if query is short
        if (q === '' && matchCount >= 100) break;
    }

    if (matchCount === 0) {
        html += `<div class="combobox-empty">No match</div>`;
    } else {
        html += items.join('');
    }

    dd.innerHTML = html;
}

export function selectCoin(value, _label) {
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }

    const selectedCoins = getSelectedCoins();
    if (value === '') {
        setSelectedCoins([]);
    } else {
        if (selectedCoins.includes(value)) {
            setSelectedCoins(selectedCoins.filter(c => c !== value));
        } else {
            setSelectedCoins([...selectedCoins, value]);
        }
    }

    saveSettings();
    updateCoinSearchLabel();
    renderTable();
    updateRankingPanel(); // Update ranking panel selection state
}

export function updateCoinSearchLabel() {
    const search = document.getElementById('coinSearch');
    const selectedCoins = getSelectedCoins();
    //console.log('updateCoinSearchLabel called, selectedCoins:', selectedCoins);
    if (selectedCoins.length === 0) {
        search.value = '';
    } else if (selectedCoins.length === 1) {
        search.value = selectedCoins[0];
    } else {
        search.value = `${selectedCoins.length} coins`;
    }
}

export function updateCoinFilter(workerDataOrRows) {
    // If we received stats from worker, use the pre-calculated uniqueCoins
    if (workerDataOrRows && workerDataOrRows.uniqueCoins) {
        _coinOptions = workerDataOrRows.uniqueCoins;
    } else if (Array.isArray(workerDataOrRows)) {
        // Fallback for manual updates or missing worker data
        _coinOptions = [...new Set(workerDataOrRows.map(r => r.coin))].sort();
    }

    // Only update label if no coins are selected (preserve user selection)
    if (getSelectedCoins().length === 0) {
        updateCoinSearchLabel();
    }
}

// ── Click outside handling ──
export function setupClickOutsideHandler() {
    document.addEventListener('click', (e) => {
        // Handle generic comboboxes
        Object.keys(CB_OPTIONS).forEach(id => {
            const cb = document.getElementById(`cb-${id}`);
            if (cb && !cb.contains(e.target)) {
                cbClose(id);
            }
        });

        // Handle coin combobox
        const coinCb = document.getElementById('coinCombobox');
        if (coinCb && !coinCb.contains(e.target)) {
            coinCb.classList.remove('open');
        }

        // Handle column combobox
        const columnCbs = document.querySelectorAll('.js-column-combobox');
        columnCbs.forEach(columnCb => {
            if (columnCb && !columnCb.contains(e.target)) {
                columnCb.classList.remove('open');
            }
        });
    });
}

