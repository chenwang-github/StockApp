/**
 * RSI (Relative Strength Index) Indicator Module
 * Calculates RSI and checks for oversold/overbought triggers
 * Supports RSI Oversold (<=10, <=20, <=30) and RSI Overbought (>=70, >=80, >=90)
 */

/**
 * Calculate RSI (Relative Strength Index) for a given period
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} period - RSI period (typically 14)
 * @returns {Array} - Array of RSI values (null for first 'period' entries)
 */
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
        return new Array(prices.length).fill(null);
    }

    const rsiValues = new Array(prices.length).fill(null);
    
    // Calculate initial average gain and loss
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = prices[i].close - prices[i - 1].close;
        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate first RSI
    if (avgLoss === 0) {
        rsiValues[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsiValues[period] = 100 - (100 / (1 + rs));
    }
    
    // Calculate subsequent RSI values using smoothed averages
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i].close - prices[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        
        if (avgLoss === 0) {
            rsiValues[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsiValues[i] = 100 - (100 / (1 + rs));
        }
    }
    
    return rsiValues;
}

/**
 * Check if RSI oversold threshold is triggered at a specific index
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} currentIndex - Index to check
 * @param {number} threshold - Oversold threshold (e.g., 30 for RSI <= 30)
 * @param {number} period - RSI period (default 14)
 * @returns {Object} - { isTriggered, rsiValue, threshold }
 */
function checkRSIOversoldTrigger(prices, currentIndex, threshold, period = 14) {
    // Need enough data to calculate RSI
    if (currentIndex < period || currentIndex >= prices.length) {
        return {
            isTriggered: false,
            rsiValue: null,
            threshold
        };
    }

    const rsiValues = calculateRSI(prices, period);
    const rsiValue = rsiValues[currentIndex];
    
    if (rsiValue === null) {
        return {
            isTriggered: false,
            rsiValue: null,
            threshold
        };
    }
    
    // Trigger when RSI is less than or equal to threshold
    const isTriggered = rsiValue <= threshold;
    
    return {
        isTriggered,
        rsiValue,
        threshold
    };
}

/**
 * Check if RSI overbought threshold is triggered at a specific index
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} currentIndex - Index to check
 * @param {number} threshold - Overbought threshold (e.g., 70 for RSI >= 70)
 * @param {number} period - RSI period (default 14)
 * @returns {Object} - { isTriggered, rsiValue, threshold }
 */
function checkRSIOverboughtTrigger(prices, currentIndex, threshold, period = 14) {
    // Need enough data to calculate RSI
    if (currentIndex < period || currentIndex >= prices.length) {
        return {
            isTriggered: false,
            rsiValue: null,
            threshold
        };
    }

    const rsiValues = calculateRSI(prices, period);
    const rsiValue = rsiValues[currentIndex];
    
    if (rsiValue === null) {
        return {
            isTriggered: false,
            rsiValue: null,
            threshold
        };
    }
    
    // Trigger when RSI is greater than or equal to threshold
    const isTriggered = rsiValue >= threshold;
    
    return {
        isTriggered,
        rsiValue,
        threshold
    };
}

/**
 * Find the most recent date when RSI oversold threshold was triggered
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} threshold - Oversold threshold
 * @param {number} period - RSI period (default 14)
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentRSIOversoldTriggerDate(prices, threshold, period = 14) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= period; i--) {
        const result = checkRSIOversoldTrigger(prices, i, threshold, period);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Find the most recent date when RSI overbought threshold was triggered
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} threshold - Overbought threshold
 * @param {number} period - RSI period (default 14)
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentRSIOverboughtTriggerDate(prices, threshold, period = 14) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= period; i--) {
        const result = checkRSIOverboughtTrigger(prices, i, threshold, period);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Calculate all RSI triggers for the standard thresholds
 * Generates 6 alarms: RSI <= 10, 20, 30 and RSI >= 70, 80, 90
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} period - RSI period (default 14)
 * @returns {Array} - Array of alarm objects
 */
function calculateAllRSITriggers(prices, period = 14) {
    const alarms = [];
    const oversoldThresholds = [10, 20, 30];
    const overboughtThresholds = [70, 80, 90];
    
    // Generate RSI Oversold alarms (<=10, <=20, <=30)
    for (const threshold of oversoldThresholds) {
        const previousTriggeredDate = findMostRecentRSIOversoldTriggerDate(prices, threshold, period);
        alarms.push({
            alarmName: `RSIOversold${threshold}`,
            type: 'rsi-oversold',
            threshold: threshold,
            period: period,
            previousTriggeredDate: previousTriggeredDate
        });
    }
    
    // Generate RSI Overbought alarms (>=70, >=80, >=90)
    for (const threshold of overboughtThresholds) {
        const previousTriggeredDate = findMostRecentRSIOverboughtTriggerDate(prices, threshold, period);
        alarms.push({
            alarmName: `RSIOverbought${threshold}`,
            type: 'rsi-overbought',
            threshold: threshold,
            period: period,
            previousTriggeredDate: previousTriggeredDate
        });
    }
    
    return alarms;
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateRSI,
        checkRSIOversoldTrigger,
        checkRSIOverboughtTrigger,
        findMostRecentRSIOversoldTriggerDate,
        findMostRecentRSIOverboughtTriggerDate,
        calculateAllRSITriggers
    };
}

// Export for browser (window object)
if (typeof window !== 'undefined') {
    window.RSIIndicator = {
        calculateRSI,
        checkRSIOversoldTrigger,
        checkRSIOverboughtTrigger,
        findMostRecentRSIOversoldTriggerDate,
        findMostRecentRSIOverboughtTriggerDate,
        calculateAllRSITriggers
    };
}
