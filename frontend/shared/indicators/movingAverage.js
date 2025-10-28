/**
 * Moving Average Indicator Calculator
 * 前后端共享的均线计算和交叉检测逻辑
 * 
 * 支持的 Alarm 类型：
 * 1. 价格穿越均线 (Price Cross MA)
 * 2. 双均线交叉 (MA Cross MA - 金叉/死叉)
 */

/**
 * 计算简单移动平均线 (SMA)
 * @param {Array} prices - 价格数组 [{date, close}, ...]
 * @param {number} currentIndex - 当前索引
 * @param {number} period - MA周期 (5, 10, 20, 50, 200等)
 * @returns {number|null} MA值，如果数据不足返回null
 */
function calculateMA(prices, currentIndex, period) {
    if (currentIndex < period - 1) {
        return null;
    }
    
    const startIdx = currentIndex - period + 1;
    const window = prices.slice(startIdx, currentIndex + 1);
    
    const sum = window.reduce((acc, p) => acc + p.close, 0);
    return sum / period;
}

/**
 * 检测价格是否穿越均线（金叉/死叉）
 * @param {Array} prices - 价格数组
 * @param {number} currentIndex - 当前索引
 * @param {number} maPeriod - MA周期
 * @returns {Object} { crossed, direction, currentPrice, currentMA, prevPrice, prevMA }
 *   - crossed: 是否发生穿越
 *   - direction: 'golden' (金叉-向上穿), 'death' (死叉-向下穿), null
 */
function checkPriceCrossMA(prices, currentIndex, maPeriod) {
    if (currentIndex < maPeriod || currentIndex < 1) {
        return {
            crossed: false,
            direction: null,
            currentPrice: null,
            currentMA: null,
            prevPrice: null,
            prevMA: null
        };
    }
    
    const currentPrice = prices[currentIndex].close;
    const prevPrice = prices[currentIndex - 1].close;
    
    const currentMA = calculateMA(prices, currentIndex, maPeriod);
    const prevMA = calculateMA(prices, currentIndex - 1, maPeriod);
    
    if (currentMA === null || prevMA === null) {
        return {
            crossed: false,
            direction: null,
            currentPrice,
            currentMA,
            prevPrice,
            prevMA
        };
    }
    
    // 金叉：前一天价格 <= MA，今天价格 > MA
    const goldenCross = prevPrice <= prevMA && currentPrice > currentMA;
    
    // 死叉：前一天价格 >= MA，今天价格 < MA
    const deathCross = prevPrice >= prevMA && currentPrice < currentMA;
    
    return {
        crossed: goldenCross || deathCross,
        direction: goldenCross ? 'golden' : (deathCross ? 'death' : null),
        currentPrice,
        currentMA,
        prevPrice,
        prevMA
    };
}

/**
 * 检测双均线交叉（短期MA穿越长期MA）
 * @param {Array} prices - 价格数组
 * @param {number} currentIndex - 当前索引
 * @param {number} shortPeriod - 短期MA周期（如5, 10, 20）
 * @param {number} longPeriod - 长期MA周期（如50, 200）
 * @returns {Object} { crossed, direction, shortMA, longMA, prevShortMA, prevLongMA }
 *   - crossed: 是否发生穿越
 *   - direction: 'golden' (金叉), 'death' (死叉), null
 */
function checkMACrossMA(prices, currentIndex, shortPeriod, longPeriod) {
    if (currentIndex < longPeriod || currentIndex < 1) {
        return {
            crossed: false,
            direction: null,
            shortMA: null,
            longMA: null,
            prevShortMA: null,
            prevLongMA: null
        };
    }
    
    const shortMA = calculateMA(prices, currentIndex, shortPeriod);
    const longMA = calculateMA(prices, currentIndex, longPeriod);
    const prevShortMA = calculateMA(prices, currentIndex - 1, shortPeriod);
    const prevLongMA = calculateMA(prices, currentIndex - 1, longPeriod);
    
    if (shortMA === null || longMA === null || prevShortMA === null || prevLongMA === null) {
        return {
            crossed: false,
            direction: null,
            shortMA,
            longMA,
            prevShortMA,
            prevLongMA
        };
    }
    
    // 金叉：短期MA从下方穿过长期MA
    const goldenCross = prevShortMA <= prevLongMA && shortMA > longMA;
    
    // 死叉：短期MA从上方穿过长期MA
    const deathCross = prevShortMA >= prevLongMA && shortMA < longMA;
    
    return {
        crossed: goldenCross || deathCross,
        direction: goldenCross ? 'golden' : (deathCross ? 'death' : null),
        shortMA,
        longMA,
        prevShortMA,
        prevLongMA
    };
}

/**
 * 找到最近一次价格穿越MA的日期
 * @param {Array} prices - 完整价格数组
 * @param {number} maPeriod - MA周期
 * @param {string} direction - 'golden', 'death', 'both'
 * @returns {Date|null} 最近触发日期
 */
function findMostRecentPriceCrossMA(prices, maPeriod, direction = 'both') {
    for (let i = prices.length - 1; i >= maPeriod; i--) {
        const result = checkPriceCrossMA(prices, i, maPeriod);
        
        if (result.crossed) {
            if (direction === 'both' || result.direction === direction) {
                return prices[i].date;
            }
        }
    }
    
    return null;
}

/**
 * 找到最近一次双均线交叉的日期
 * @param {Array} prices - 完整价格数组
 * @param {number} shortPeriod - 短期MA周期
 * @param {number} longPeriod - 长期MA周期
 * @param {string} direction - 'golden', 'death', 'both'
 * @returns {Date|null} 最近触发日期
 */
function findMostRecentMACrossMA(prices, shortPeriod, longPeriod, direction = 'both') {
    for (let i = prices.length - 1; i >= longPeriod; i--) {
        const result = checkMACrossMA(prices, i, shortPeriod, longPeriod);
        
        if (result.crossed) {
            if (direction === 'both' || result.direction === direction) {
                return prices[i].date;
            }
        }
    }
    
    return null;
}

/**
 * 找到最近一次MA位置关系满足条件的日期（above/below）
 * @param {Array} prices - 完整价格数组
 * @param {number} ma1Period - MA1周期
 * @param {number} ma2Period - MA2周期
 * @param {string} direction - 'above' 或 'below'
 * @returns {Date|null} 最近满足条件的日期
 */
function findMostRecentMAPosition(prices, ma1Period, ma2Period, direction) {
    const maxPeriod = Math.max(ma1Period, ma2Period);
    
    for (let i = prices.length - 1; i >= maxPeriod - 1; i--) {
        const ma1 = calculateMA(prices, i, ma1Period);
        const ma2 = calculateMA(prices, i, ma2Period);
        
        if (ma1 === null || ma2 === null) {
            continue;
        }
        
        if (direction === 'above' && ma1 > ma2) {
            return prices[i].date;
        } else if (direction === 'below' && ma1 < ma2) {
            return prices[i].date;
        }
    }
    
    return null;
}

/**
 * 计算所有MA交叉触发状态
 * @param {Array} prices - 价格数组
 * @param {Array} maPeriods - MA周期数组，默认 [10, 50, 100, 200]
 * @param {Array} directions - 方向数组，默认 ['above', 'below', 'cross-up', 'cross-down']
 * @param {Function} logger - 可选的日志函数
 * @returns {Array} triggers数组
 */
function calculateAllMACrossTriggers(
    prices,
    maPeriods = [10, 50, 100, 200],
    directions = ['above', 'below', 'cross-up', 'cross-down'],
    logger = null
) {
    const triggers = [];
    
    // 生成所有MA组合 (ma1, ma2)，其中 ma1 < ma2
    for (let i = 0; i < maPeriods.length; i++) {
        for (let j = i + 1; j < maPeriods.length; j++) {
            const ma1Period = maPeriods[i];
            const ma2Period = maPeriods[j];
            
            for (const direction of directions) {
                let triggerDate = null;
                
                // 根据不同方向查找最近触发日期
                if (direction === 'cross-up') {
                    triggerDate = findMostRecentMACrossMA(prices, ma1Period, ma2Period, 'golden');
                } else if (direction === 'cross-down') {
                    triggerDate = findMostRecentMACrossMA(prices, ma1Period, ma2Period, 'death');
                } else if (direction === 'above' || direction === 'below') {
                    // 对于 above/below，找最近一次满足条件的日期
                    triggerDate = findMostRecentMAPosition(prices, ma1Period, ma2Period, direction);
                }
                
                triggers.push({
                    type: 'ma-cross',
                    ma1Period: ma1Period,
                    ma2Period: ma2Period,
                    direction: direction,
                    previousTriggeredDate: triggerDate
                });
                
                if (logger && triggerDate) {
                    const dateStr = triggerDate instanceof Date 
                        ? triggerDate.toISOString().split('T')[0]
                        : triggerDate;
                    logger(`MA${ma1Period} ${direction} MA${ma2Period}: Last triggered on ${dateStr}`);
                }
            }
        }
    }
    
    return triggers;
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateMA,
        checkPriceCrossMA,
        checkMACrossMA,
        findMostRecentPriceCrossMA,
        findMostRecentMACrossMA,
        findMostRecentMAPosition,
        calculateAllMACrossTriggers
    };
}

// Export for Browser (Global)
if (typeof window !== 'undefined') {
    window.MovingAverageIndicator = {
        calculateMA,
        checkPriceCrossMA,
        checkMACrossMA,
        findMostRecentPriceCrossMA,
        findMostRecentMACrossMA,
        findMostRecentMAPosition,
        calculateAllMACrossTriggers
    };
}
