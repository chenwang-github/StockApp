/**
 * N-Week Low Indicator Calculator
 * 前后端共享的核心计算逻辑
 * 
 * 算法说明：
 * 1. N周 = N × 5个交易日（排除周末和节假日）
 * 2. 窗口包含当前日期（slice[i-days, i+1]）
 * 3. 阈值 = 窗口最低价 + (窗口区间 × 波动百分比)
 * 4. 触发条件：当前收盘价 <= 阈值
 */

/**
 * 计算N-week low是否触发
 * @param {Array} prices - 价格数组 [{date, close}, ...]
 * @param {number} currentIndex - 当前索引
 * @param {number} weeks - 周数 (4, 8, 12, 24, 32, 52)
 * @param {number} fluctuation - 波动百分比 (0, 10, 20)
 * @returns {Object} { isTriggered, threshold, windowLow, windowHigh, range, currentClose, insufficient }
 */
function checkNWeekLowTrigger(prices, currentIndex, weeks, fluctuation) {
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
    
    // 计算阈值: lowest + (range × fluctuation%)
    const range = windowHigh - windowLow;
    const threshold = windowLow + (range * (fluctuation / 100));
    
    // 判断是否触发
    const currentClose = prices[currentIndex].close;
    const isTriggered = currentClose <= threshold;
    
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
    
    // 从最新往回扫描
    for (let i = prices.length - 1; i >= days; i--) {
        const result = checkNWeekLowTrigger(prices, i, weeks, fluctuation);
        
        if (result.isTriggered) {
            return prices[i].date;
        }
    }
    
    return null; // 历史中从未触发
}

/**
 * 批量计算所有N-week low triggers
 * @param {Array} prices - 价格数组
 * @param {Array} weekPeriods - 周期数组，默认 [4, 8, 12, 24, 32, 52]
 * @param {Array} fluctuations - 波动数组，默认 [0, 10, 20]
 * @param {Object} logger - 可选的日志对象（用于后端context.log）
 * @returns {Array} triggers数组
 */
function calculateAllNWeekLowTriggers(
    prices, 
    weekPeriods = [4, 8, 12, 24, 32, 52], 
    fluctuations = [0, 10, 20],
    logger = null
) {
    const triggers = [];
    
    if (logger) {
        logger(`Starting N-week low calculation. Total prices: ${prices.length}`);
    }
    
    for (const weeks of weekPeriods) {
        const days = weeks * 5;
        
        if (prices.length < days) {
            if (logger) {
                logger(`Skipping ${weeks}-week check: insufficient data (${prices.length} < ${days} trading days)`);
            }
            continue;
        }
        
        // 计算当前窗口信息（用于日志）
        const currentWindow = prices.slice(prices.length - days);
        const windowLow = Math.min(...currentWindow.map(p => p.close));
        const windowHigh = Math.max(...currentWindow.map(p => p.close));
        
        if (logger) {
            logger(`[${weeks}w = ${days}d] Window: Low=$${windowLow.toFixed(2)}, High=$${windowHigh.toFixed(2)}, Range=$${(windowHigh - windowLow).toFixed(2)}`);
        }
        
        for (const fluctuation of fluctuations) {
            const mostRecentDate = findMostRecentTriggerDate(prices, weeks, fluctuation);
            
            triggers.push({
                weeks,
                fluctuation,
                previousTriggeredDate: mostRecentDate
            });
            
            if (logger) {
                const status = mostRecentDate 
                    ? `last triggered on ${formatDate(mostRecentDate)}` 
                    : 'never triggered in history';
                logger(`Added trigger: ${weeks}-week low ±${fluctuation}% - ${status}`);
            }
        }
    }
    
    if (logger) {
        logger(`N-week low triggers found: ${triggers.length}`);
    }
    
    return triggers;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date - 日期对象
 * @returns {string|null} 格式化的日期字符串
 */
function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    // Node.js环境（后端）
    module.exports = {
        checkNWeekLowTrigger,
        findMostRecentTriggerDate,
        calculateAllNWeekLowTriggers,
        formatDate
    };
} else {
    // 浏览器环境（前端）
    window.NWeekLowIndicator = {
        checkNWeekLowTrigger,
        findMostRecentTriggerDate,
        calculateAllNWeekLowTriggers,
        formatDate
    };
}
