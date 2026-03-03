/**
 * Adjusts the font size of an element so that its content fits within its container.
 * Uses a Canvas-based measurement to avoid layout thrashing (multiple DOM reflows).
 * @param {HTMLElement} element - The element whose font size should be adjusted.
 * @param {HTMLElement} container - The container that the element should fit into.
 * @param {number} minFontSize - The minimum font size in pixels.
 * @param {number} maxFontSize - The maximum font size in pixels.
 */
let canvasContext = null;

export function adjustFontSizeToFit(element, container, minFontSize = 8, maxFontSize = 14) {
    if (!element || !container) return;

    // Use a cached canvas context for performance
    if (!canvasContext) {
        const canvas = document.createElement('canvas');
        canvasContext = canvas.getContext('2d');
    }

    const text = element.textContent;
    const computedStyle = window.getComputedStyle(element);
    const fontFamily = computedStyle.fontFamily;
    const fontWeight = computedStyle.fontWeight;

    // We measure against the container's inner dimensions minus some padding safety
    const maxWidth = container.clientWidth - 4;
    const maxHeight = container.clientHeight - 2;

    let low = minFontSize;
    let high = maxFontSize;
    let bestSize = minFontSize;

    // Binary search for the best font size using canvas measurement
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        canvasContext.font = `${fontWeight} ${mid}px ${fontFamily}`;
        const metrics = canvasContext.measureText(text);

        // Height is roughly proportional to font size
        const estimatedHeight = mid * 1.2;

        if (metrics.width <= maxWidth && estimatedHeight <= maxHeight) {
            bestSize = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // Apply the final font size once to avoid multiple reflows
    element.style.fontSize = bestSize + 'px';
}
