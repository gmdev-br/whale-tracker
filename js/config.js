// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Configuration
// ═══════════════════════════════════════════════════════════

export const INFO_URL = 'https://api.hyperliquid.xyz/info';
export const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

export const COLUMN_DEFS = [
    { key: 'col-num', label: '#', width: 40 },
    { key: 'col-address', label: 'Address', width: 180 },
    { key: 'col-coin', label: 'Coin', width: 80 },
    { key: 'col-szi', label: 'Size', width: 90 },
    { key: 'col-leverage', label: 'Leverage', width: 90 },
    { key: 'col-positionValue', label: 'Value', width: 100 },
    { key: 'col-valueCcy', label: 'Value (CCY)', width: 100 },
    { key: 'col-entryPx', label: 'Avg Entry', width: 100 },
    { key: 'col-entryCcy', label: 'Avg Entry (Corr)', width: 100 },
    { key: 'col-unrealizedPnl', label: 'UPNL', width: 100 },
    { key: 'col-funding', label: 'Funding', width: 100 },
    { key: 'col-liqPx', label: 'Liq. Price', width: 100 },
    { key: 'col-distToLiq', label: 'Dist. to Liq.', width: 120 },
    { key: 'col-accountValue', label: 'Acct. Value', width: 110 }
];

export const CURRENCY_META = {
    USD: { symbol: '$', locale: 'en-US' },
    BRL: { symbol: 'R$', locale: 'pt-BR' },
    EUR: { symbol: '€', locale: 'de-DE' },
    GBP: { symbol: '£', locale: 'en-GB' },
    JPY: { symbol: '¥', locale: 'ja-JP' },
    ARS: { symbol: '$', locale: 'es-AR' },
    CAD: { symbol: 'CA$', locale: 'en-CA' },
    AUD: { symbol: 'A$', locale: 'en-AU' },
    BTC: { symbol: '₿', locale: 'en-US' },
};

export const RETRY_DELAY_MS = 2000;  // wait 2s on 429 before retry

// Rate limit: 1200 weight/min, clearinghouseState = weight 2 → max 600 req/min = 10 req/s
// We use 8 concurrent requests to stay safely under the limit.
export const DEFAULT_MAX_CONCURRENCY = 8;
