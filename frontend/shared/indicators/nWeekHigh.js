/**
 * N-Week High Indicator Calculator
 * 前后端共享的核心计算逻辑
 * 
 * 算法说明：
 * 1. N周 = N × 5个交易日（排除周末和节假日）
 * 2. 窗口包含当前日期（slice[i-days, i+1]）
 * 3. 阈值 = 窗口最高价 - (窗口区间 × 波动百分比)
 * 4. 触发条件：当前收盘价 >= 阈值
 */

/**
 * 计算N-week high是否触发
 * @param {Array} prices - 价格数组 [{date, close}, ...]
 * @param {number} currentIndex - 当前索引
 * @param {number} weeks - 周数 (4, 8, 12, 24, 32, 52)
 * @param {number} fluctuation - 波动百分比 (0, 10, 20)
 * @returns {Object} { isTriggered, threshold, windowLow, windowHigh, range, currentClose, insufficient }
 */
function checkNWeekHighTrigger(prices, currentIndex, weeks, fluctuation) {
    const days = weeks * 5; // 1周 = 5个交易日
    
    // 获取窗口数据（包含当前day）
    // 窗口: [currentIndex - days, currentIndex + 1) = days + 1 个元素
    const startIdx = currentIndex - days;
    
    if (startIdx < 0 || currentIndex >= prices.length) {
        return {
            isTriggered: false,
            threshold: null,
            windowLow: null,
            windowHigh: null,
            insufficient: true
        };
    }
    
    const window = prices.slice(startIdx, currentIndex + 1);
    
    if (window.length < days + 1) {
        return {
            isTriggered: false,
            threshold: null,
            windowLow: null,
            windowHigh: null,
            insufficient: true
        };
    }
    
    // 计算窗口的最低和最高价
    const windowLow = Math.min(...window.map(p => p.close));
    const windowHigh = Math.max(...window.map(p => p.close));
    
    // 计算阈值: highest - (range × fluctuation%)
    const range = windowHigh - windowLow;
    const threshold = windowHigh - (range * (fluctuation / 100));
    
    // 判断是否触发
    const currentClose = prices[currentIndex].close;
    const isTriggered = currentClose >= threshold;
    
    return {
        isTriggered,
        threshold,
        windowLow,
        windowHigh,
        range,
        currentClose,
        insufficient: false
    };
}

/**
 * 找到最近一次触发的日期
 * @param {Array} prices - 完整价格数组
 * @param {number} weeks - 周数
 * @param {number} fluctuation - 波动百分比
 * @returns {Date|null} 最近触发日期，如果从未触发则返回null
 */
function findMostRecentTriggerDate(prices, weeks, fluctuation) {
    const days = weeks * 5;
    
    // 从最新日期往前遍历
    for (let i = prices.length - 1; i >= days; i--) {
        const result = checkNWeekHighTrigger(prices, i, weeks, fluctuation);
        
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    
    return null;
}

/**
 * 计算所有N-week high组合的trigger状态
 * @param {Array} prices - 价格数组 [{date, close}, ...]
 * @param {Array} weekPeriods - 周期数组 [4, 8, 12, 24, 32, 52]
 * @param {Array} fluctuations - 波动百分比数组 [0, 10, 20]
 * @param {Function} logger - 日志函数 (optional)
 * @returns {Array} triggers数组
 */
function calculateAllNWeekHighTriggers(prices, weekPeriods, fluctuations, logger) {
    const triggers = [];
    
    for (const weeks of weekPeriods) {
        for (const fluctuation of fluctuations) {
            const triggerDate = findMostRecentTriggerDate(prices, weeks, fluctuation);
            
            triggers.push({
                weeks: weeks,
                fluctuation: fluctuation,
                previousTriggeredDate: triggerDate
            });
            
            if (logger && triggerDate) {
                const dateStr = triggerDate instanceof Date 
                    ? triggerDate.toISOString().split('T')[0]
                    : triggerDate;
                logger(`${weeks}w ${fluctuation}% high: Last triggered on ${dateStr}`);
            }
        }
    }
    
    return triggers;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
    if (!date) return null;
    if (typeof date === 'string') return date.split('T')[0];
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkNWeekHighTrigger,
        findMostRecentTriggerDate,
        calculateAllNWeekHighTriggers,
        formatDate
    };
}

// Export for Browser (Global)
if (typeof window !== 'undefined') {
    window.NWeekHighIndicator = {
        checkNWeekHighTrigger,
        findMostRecentTriggerDate,
        calculateAllNWeekHighTriggers,
        formatDate
    };
}
