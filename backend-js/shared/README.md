# 共享代码模块 (Shared Code)

## 📁 目录结构

```
backend-js/shared/          # 主要共享代码（源头）
└── indicators/
    └── nWeekLow.js        # N-Week Low 计算逻辑

frontend/shared/           # 前端共享代码（从backend-js复制）
└── indicators/
    └── nWeekLow.js        # 与backend-js/shared同步
```

## 🎯 设计原则

**单一真相来源**: `backend-js/shared/` 是共享代码的唯一源头。

**前后端共用**: 同一份代码在前端（浏览器）和后端（Node.js）都能运行。

**自动同步**: 使用sync脚本保持前后端代码一致。

## 📦 模块说明

### `indicators/nWeekLow.js`

N-Week Low触发器计算模块，包含以下函数：

#### `checkNWeekLowTrigger(prices, currentIndex, weeks, fluctuation)`
检查指定索引是否触发N-week low条件。

**参数:**
- `prices`: 价格数组 `[{date, close}, ...]`
- `currentIndex`: 要检查的索引位置
- `weeks`: 周数 (4, 8, 12, 24, 32, 52)
- `fluctuation`: 波动百分比 (0, 10, 20)

**返回:**
```javascript
{
    isTriggered: boolean,      // 是否触发
    threshold: number,         // 阈值
    windowLow: number,        // 窗口最低价
    windowHigh: number,       // 窗口最高价
    range: number,            // 窗口区间
    currentClose: number,     // 当前收盘价
    insufficient: boolean     // 数据是否不足
}
```

#### `findMostRecentTriggerDate(prices, weeks, fluctuation)`
找到最近一次触发的日期。

#### `calculateAllNWeekLowTriggers(prices, weekPeriods, fluctuations, logger)`
批量计算所有组合的N-week low triggers。

## 🔄 同步共享代码

### 方法1：使用脚本（推荐）

```bash
# 在项目根目录执行
node scripts/sync-shared.js
```

### 方法2：手动复制

```bash
# PowerShell
Copy-Item -Recurse -Force "backend-js\shared" "frontend\shared"

# Bash
cp -r backend-js/shared frontend/shared
```

## 💻 使用方式

### 后端使用 (Node.js)

```javascript
const { calculateAllNWeekLowTriggers } = require('../shared/indicators/nWeekLow');

const triggers = calculateAllNWeekLowTriggers(
    prices,
    [4, 8, 12, 24, 32, 52],  // weekPeriods
    [0, 10, 20],              // fluctuations
    context.log               // logger (optional)
);
```

### 前端使用 (Browser)

```html
<!-- HTML引入 -->
<script src="shared/indicators/nWeekLow.js"></script>
```

```javascript
// JavaScript使用
const { checkNWeekLowTrigger } = window.NWeekLowIndicator;

const result = checkNWeekLowTrigger(fullData, currentIndex, 4, 0);
if (result.isTriggered) {
    // 显示绿点
}
```

## ⚠️ 重要提醒

1. **修改后必须同步**: 修改`backend-js/shared/`中的代码后，务必运行`node scripts/sync-shared.js`将更改同步到前端。

2. **不要直接修改前端副本**: 永远不要直接修改`frontend/shared/`中的文件，所有修改都应该在`backend-js/shared/`中进行。

3. **测试**: 修改共享模块后，需要同时测试前端和后端功能。

## 🧪 测试

```javascript
// 测试示例
const prices = [
    { date: new Date('2025-07-01'), close: 220 },
    { date: new Date('2025-07-02'), close: 215 },
    // ... more data
    { date: new Date('2025-08-01'), close: 202.38 }
];

const result = checkNWeekLowTrigger(prices, prices.length - 1, 4, 0);
console.log(result.isTriggered); // true or false
```

## 📝 算法说明

**N-Week Low 计算逻辑:**

1. **周期转换**: N周 = N × 5个交易日
2. **窗口范围**: `[currentIndex - days, currentIndex + 1]` (包含当前日)
3. **阈值计算**: `threshold = windowLow + (range × fluctuation%)`
4. **触发条件**: `currentClose <= threshold`

**示例**: 4周0%波动
- 窗口: 最近20个交易日 + 当天 = 21天
- 如果当前收盘价 ≤ 这21天的最低价，则触发
