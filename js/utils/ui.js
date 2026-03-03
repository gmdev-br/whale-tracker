/**
 * Adjusts the font size of an element so that its content fits within its container.
 * @param {HTMLElement} element - The element whose font size should be adjusted.
 * @param {HTMLElement} container - The container that the element should fit into.
 * @param {number} minFontSize - The minimum font size in pixels.
 * @param {number} maxFontSize - The maximum font size in pixels.
 */
export function adjustFontSizeToFit(element, container, minFontSize = 8, maxFontSize = 14) {
    if (!element || !container) return;

    let low = minFontSize;
    let high = maxFontSize;
    let bestSize = minFontSize;

    // Use binary search for efficiency
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        element.style.fontSize = mid + 'px';

        if (element.scrollWidth <= container.clientWidth && element.scrollHeight <= container.clientHeight) {
            bestSize = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    element.style.fontSize = bestSize + 'px';
}
