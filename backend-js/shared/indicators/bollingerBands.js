/**
 * Bollinger Bands Indicator Module
 * Calculates Bollinger Bands and checks for price touching/crossing bands
 * Supports BB Lower Band (buy signal) and BB Upper Band (sell signal)
 */

/**
 * Calculate Bollinger Bands at a specific index
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} currentIndex - Index to calculate BB for
 * @param {number} period - BB period (typically 20)
 * @param {number} stdDev - Standard deviation multiplier (typically 2)
 * @returns {Object} - { middle, upper, lower } or null if insufficient data
 */
function calculateBollingerBands(prices, currentIndex, period = 20, stdDev = 2) {
    // Need at least 'period' data points
    if (currentIndex < period - 1 || currentIndex >= prices.length) {
        return null;
    }
    
    // Get the last 'period' prices up to currentIndex
    const startIndex = currentIndex - period + 1;
    const relevantPrices = prices.slice(startIndex, currentIndex + 1);
    
    // Calculate SMA (middle band)
    const sum = relevantPrices.reduce((acc, p) => acc + p.close, 0);
    const sma = sum / period;
    
    // Calculate standard deviation
    const squaredDifferences = relevantPrices.map(p => Math.pow(p.close - sma, 2));
    const variance = squaredDifferences.reduce((acc, val) => acc + val, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    // Calculate bands
    return {
        middle: sma,
        upper: sma + (stdDev * standardDeviation),
        lower: sma - (stdDev * standardDeviation)
    };
}

/**
 * Check if price touches or crosses below the lower Bollinger Band
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} currentIndex - Index to check
 * @param {number} period - BB period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @param {number} distancePercent - Distance threshold as percentage of band width (0-100)
 *                                   0 = must touch, 10 = within 10% of band width
 * @returns {Object} - { isTriggered, bb, threshold, priceClose, priceLow }
 */
function checkBBLowerTrigger(prices, currentIndex, period = 20, stdDev = 2, distancePercent = 0) {
    const bb = calculateBollingerBands(prices, currentIndex, period, stdDev);
    
    if (!bb) {
        return {
            isTriggered: false,
            bb: null,
            threshold: null,
            priceClose: null,
            priceLow: null
        };
    }
    
    const currentPrice = prices[currentIndex];
    
    // Calculate threshold: lower band + (band width * distance percentage)
    const bandWidth = bb.upper - bb.lower;
    const threshold = bb.lower + (bandWidth * (distancePercent / 100));
    
    // Trigger when close price is at or below threshold
    // Only use close price for clearer visual alignment with the chart
    const isTriggered = currentPrice.close <= threshold;
    
    return {
        isTriggered,
        bb,
        threshold,
        priceClose: currentPrice.close,
        priceLow: currentPrice.low,
        period,
        stdDev,
        distancePercent
    };
}

/**
 * Check if price touches or crosses above the upper Bollinger Band
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} currentIndex - Index to check
 * @param {number} period - BB period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @param {number} distancePercent - Distance threshold as percentage of band width (0-100)
 *                                   0 = must touch, 10 = within 10% of band width
 * @returns {Object} - { isTriggered, bb, threshold, priceClose, priceHigh }
 */
function checkBBUpperTrigger(prices, currentIndex, period = 20, stdDev = 2, distancePercent = 0) {
    const bb = calculateBollingerBands(prices, currentIndex, period, stdDev);
    
    if (!bb) {
        return {
            isTriggered: false,
            bb: null,
            threshold: null,
            priceClose: null,
            priceHigh: null
        };
    }
    
    const currentPrice = prices[currentIndex];
    
    // Calculate threshold: upper band - (band width * distance percentage)
    const bandWidth = bb.upper - bb.lower;
    const threshold = bb.upper - (bandWidth * (distancePercent / 100));
    
    // Trigger when close price is at or above threshold
    // Only use close price for clearer visual alignment with the chart
    const isTriggered = currentPrice.close >= threshold;
    
    return {
        isTriggered,
        bb,
        threshold,
        priceClose: currentPrice.close,
        priceHigh: currentPrice.high,
        period,
        stdDev,
        distancePercent
    };
}

/**
 * Find the most recent date when price touched/crossed the lower BB
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} period - BB period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @param {number} distancePercent - Distance threshold percentage (default 0)
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentBBLowerTriggerDate(prices, period = 20, stdDev = 2, distancePercent = 0) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= period - 1; i--) {
        const result = checkBBLowerTrigger(prices, i, period, stdDev, distancePercent);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Find the most recent date when price touched/crossed the upper BB
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} period - BB period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @param {number} distancePercent - Distance threshold percentage (default 0)
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentBBUpperTriggerDate(prices, period = 20, stdDev = 2, distancePercent = 0) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= period - 1; i--) {
        const result = checkBBUpperTrigger(prices, i, period, stdDev, distancePercent);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Calculate all Bollinger Bands triggers
 * Generates multiple alarms based on distance thresholds
 * @param {Array} prices - Array of price objects with {date, close, high, low}
 * @param {number} period - BB period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @param {Array} distancePercents - Array of distance threshold percentages (default [0, 5, 10])
 * @returns {Array} - Array of alarm objects
 */
function calculateAllBBTriggers(prices, period = 20, stdDev = 2, distancePercents = [0, 5, 10]) {
    const alarms = [];
    
    // Generate BB Lower Band alarms for each distance threshold
    for (const distancePercent of distancePercents) {
        const lowerTriggerDate = findMostRecentBBLowerTriggerDate(prices, period, stdDev, distancePercent);
        alarms.push({
            alarmName: `BBLower${period}Period${stdDev}StdDev${distancePercent}Pct`,
            type: 'bb-lower',
            period: period,
            stdDev: stdDev,
            distancePercent: distancePercent,
            previousTriggeredDate: lowerTriggerDate
        });
    }
    
    // Generate BB Upper Band alarms for each distance threshold
    for (const distancePercent of distancePercents) {
        const upperTriggerDate = findMostRecentBBUpperTriggerDate(prices, period, stdDev, distancePercent);
        alarms.push({
            alarmName: `BBUpper${period}Period${stdDev}StdDev${distancePercent}Pct`,
            type: 'bb-upper',
            period: period,
            stdDev: stdDev,
            distancePercent: distancePercent,
            previousTriggeredDate: upperTriggerDate
        });
    }
    
    return alarms;
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateBollingerBands,
        checkBBLowerTrigger,
        checkBBUpperTrigger,
        findMostRecentBBLowerTriggerDate,
        findMostRecentBBUpperTriggerDate,
        calculateAllBBTriggers
    };
}

// Export for browser (window object)
if (typeof window !== 'undefined') {
    window.BollingerBandsIndicator = {
        calculateBollingerBands,
        checkBBLowerTrigger,
        checkBBUpperTrigger,
        findMostRecentBBLowerTriggerDate,
        findMostRecentBBUpperTriggerDate,
        calculateAllBBTriggers
    };
}
