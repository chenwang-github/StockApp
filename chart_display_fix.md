# 切换时间范围图表显示修复

## 问题描述
用户反馈：切换时间范围后，图表初始显示完整的40多年数据（看起来很密集），需要手动拖动滑动条才能看到合适的时间窗口。

## 问题原因
在 `updateTimeSlider()` 函数中，虽然计算了正确的时间窗口，但图表的初始显示没有正确设置为该窗口，而是显示了全部数据。

## 修复方案

### 修复前的问题
```javascript
// 计算了正确的窗口数据
const windowData = data.slice(startIndex, endIndex);

// 但是图表没有正确设置显示范围
if (this.chart) {
    // 缺少图表时间轴的设置
    this.chart.update('none');
}
```

### 修复后的解决方案
```javascript
// 计算了正确的窗口数据
const windowData = data.slice(startIndex, endIndex);

// 正确设置图表显示的时间窗口
if (this.chart) {
    const windowStartTime = new Date(windowData[0].date);
    const windowEndTime = new Date(windowData[windowData.length - 1].date);
    
    // 设置图表X轴显示范围为当前窗口
    this.chart.options.scales.x.min = windowStartTime;
    this.chart.options.scales.x.max = windowEndTime;
    this.chart.update('none');
    
    // 同时更新"Current View"显示
    const currentViewRange = document.getElementById('currentViewRange');
    if (currentViewRange) {
        currentViewRange.textContent = `${windowStartTime.toISOString().split('T')[0]} to ${windowEndTime.toISOString().split('T')[0]}`;
    }
}
```

## 用户体验改进

### 修复前的行为
1. 用户选择"3个月"时间范围
2. 图表显示完整的40年数据（密密麻麻）❌
3. 用户必须手动拖动滑动条才能看到3个月的数据

### 修复后的行为  
1. 用户选择"3个月"时间范围
2. 图表立即显示最近3个月的数据 ✅
3. 滑动条标签仍显示完整范围（1980-2022）
4. "Current View"显示当前查看的3个月范围

## 保持的功能
- ✅ 滑动条标签仍显示完整数据范围（1980-2022）
- ✅ 用户可以拖动滑动条浏览历史数据
- ✅ "Current View"实时显示当前查看的时间段
- ✅ 切换时间范围后立即显示合适的窗口

现在切换任何时间范围后，图表都会立即显示相应的时间窗口，不需要手动拖动！