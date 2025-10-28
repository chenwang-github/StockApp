/**
 * Daily Change Indicator Module
 * Calculates daily percentage changes and checks for triggers
 * Supports DailyLoss (1-5%) and DailyGain (1-5%)
 */

/**
 * Check if daily loss threshold is triggered at a specific index
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} currentIndex - Index to check
 * @param {number} thresholdPercent - Loss threshold percentage (e.g., 3 for -3%)
 * @returns {Object} - { isTriggered, dailyChangePercent, previousClose, currentClose }
 */
function checkDailyLossTrigger(prices, currentIndex, thresholdPercent) {
    // Need at least 2 data points (current and previous)
    if (currentIndex < 1 || currentIndex >= prices.length) {
        return {
            isTriggered: false,
            dailyChangePercent: null,
            previousClose: null,
            currentClose: null
        };
    }

    const previousClose = prices[currentIndex - 1].close;
    const currentClose = prices[currentIndex].close;
    
    // Calculate daily change percentage
    const dailyChangePercent = ((currentClose - previousClose) / previousClose) * 100;
    
    // Trigger when loss is greater than or equal to threshold (negative change)
    const isTriggered = dailyChangePercent <= -thresholdPercent;
    
    return {
        isTriggered,
        dailyChangePercent,
        previousClose,
        currentClose,
        thresholdPercent
    };
}

/**
 * Check if daily gain threshold is triggered at a specific index
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} currentIndex - Index to check
 * @param {number} thresholdPercent - Gain threshold percentage (e.g., 3 for +3%)
 * @returns {Object} - { isTriggered, dailyChangePercent, previousClose, currentClose }
 */
function checkDailyGainTrigger(prices, currentIndex, thresholdPercent) {
    // Need at least 2 data points (current and previous)
    if (currentIndex < 1 || currentIndex >= prices.length) {
        return {
            isTriggered: false,
            dailyChangePercent: null,
            previousClose: null,
            currentClose: null
        };
    }

    const previousClose = prices[currentIndex - 1].close;
    const currentClose = prices[currentIndex].close;
    
    // Calculate daily change percentage
    const dailyChangePercent = ((currentClose - previousClose) / previousClose) * 100;
    
    // Trigger when gain is greater than or equal to threshold (positive change)
    const isTriggered = dailyChangePercent >= thresholdPercent;
    
    return {
        isTriggered,
        dailyChangePercent,
        previousClose,
        currentClose,
        thresholdPercent
    };
}

/**
 * Find the most recent date when daily loss threshold was triggered
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} thresholdPercent - Loss threshold percentage
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentDailyLossTriggerDate(prices, thresholdPercent) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= 1; i--) {
        const result = checkDailyLossTrigger(prices, i, thresholdPercent);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Find the most recent date when daily gain threshold was triggered
 * @param {Array} prices - Array of price objects with {date, close}
 * @param {number} thresholdPercent - Gain threshold percentage
 * @returns {string|null} - Most recent trigger date in ISO format, or null
 */
function findMostRecentDailyGainTriggerDate(prices, thresholdPercent) {
    // Start from the end (most recent) and work backwards
    for (let i = prices.length - 1; i >= 1; i--) {
        const result = checkDailyGainTrigger(prices, i, thresholdPercent);
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    return null;
}

/**
 * Calculate all daily change triggers for the standard thresholds
 * Generates 10 alarms: DailyLoss 1-5% and DailyGain 1-5%
 * @param {Array} prices - Array of price objects with {date, close}
 * @returns {Array} - Array of alarm objects
 */
function calculateAllDailyChangeTriggers(prices) {
    const alarms = [];
    const thresholds = [1, 2, 3, 4, 5]; // Percentages
    
    // Generate Daily Loss alarms (1-5%)
    for (const threshold of thresholds) {
        const previousTriggeredDate = findMostRecentDailyLossTriggerDate(prices, threshold);
        alarms.push({
            alarmName: `DailyLoss${threshold}Percent`,
            type: 'daily-loss',
            threshold: threshold,
            previousTriggeredDate: previousTriggeredDate
        });
    }
    
    // Generate Daily Gain alarms (1-5%)
    for (const threshold of thresholds) {
        const previousTriggeredDate = findMostRecentDailyGainTriggerDate(prices, threshold);
        alarms.push({
            alarmName: `DailyGain${threshold}Percent`,
            type: 'daily-gain',
            threshold: threshold,
            previousTriggeredDate: previousTriggeredDate
        });
    }
    
    return alarms;
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkDailyLossTrigger,
        checkDailyGainTrigger,
        findMostRecentDailyLossTriggerDate,
        findMostRecentDailyGainTriggerDate,
        calculateAllDailyChangeTriggers
    };
}

// Export for browser (window object)
if (typeof window !== 'undefined') {
    window.DailyChangeIndicator = {
        checkDailyLossTrigger,
        checkDailyGainTrigger,
        findMostRecentDailyLossTriggerDate,
        findMostRecentDailyGainTriggerDate,
        calculateAllDailyChangeTriggers
    };
}
