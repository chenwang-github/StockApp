/* =================================
   STOCK PRICE VIEWER - SIMPLIFIED VERSION
   ================================= */

function log(message) {
    console.log(message);
}

class StockViewer {
    constructor() {
        this.chart = null;
        this.rsiChart = null;
        this.currentData = null;
        this.selectedTimeRange = 365; // Default 1 year
        this.activeAlarms = {}; // Track active alarms
        this.buyConditions = []; // Track selected buy conditions
        this.sellConditions = []; // Track selected sell conditions
        this.rsiPeriod = 14; // Default RSI period
        this.showBollingerBands = false; // Bollinger Bands visibility
        log('Stock Viewer initializing...');
        this.init();
    }

    async init() {
        try {
            log('Setting up chart...');
            this.setupChart();
            this.setupRSIChart();
            
            log('Setting up event listeners...');
            this.setupEventListeners();
            
            log('Loading default stock (AAPL)...');
            document.getElementById('stockSearch').value = 'AAPL';
            await this.loadStockData('AAPL');
            
            log('Stock Viewer ready!');
        } catch (error) {
            log('Error during initialization: ' + error.message);
            this.showError('Initialization failed: ' + error.message);
        }
    }

    setupChart() {
        const ctx = document.getElementById('stockChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Stock Price',
                        data: [],
                        borderColor: '#007bff',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        order: 2
                    },
                    {
                        label: 'Buying Signals',
                        data: [],
                        type: 'scatter',
                        pointBackgroundColor: '#22c55e',
                        pointBorderColor: '#16a34a',
                        pointRadius: 8,
                        pointHoverRadius: 12,
                        pointBorderWidth: 2,
                        showLine: false,
                        order: 0
                    },
                    {
                        label: 'Selling Signals',
                        data: [],
                        type: 'scatter',
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#dc2626',
                        pointRadius: 8,
                        pointHoverRadius: 12,
                        pointBorderWidth: 2,
                        showLine: false,
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                day: 'MMM dd',
                                week: 'MMM dd',
                                month: 'MMM yyyy',
                                quarter: 'MMM yyyy',
                                year: 'yyyy'
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: { maxTicksLimit: 8, maxRotation: 0, minRotation: 0 }
                    },
                    y: { 
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                },
                plugins: {
                    legend: { 
                        display: false,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            },
                            filter: function(legendItem, chartData) {
                                // Don't show "Alarm Triggers" in legend
                                return legendItem.text !== 'Alarm Triggers';
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                if (context.datasetIndex === 1) {
                                    return '🔔 Alarm Triggered: $' + context.parsed.y.toFixed(2);
                                }
                                if (context.datasetIndex >= 2) {
                                    // MA line
                                    return context.dataset.label + ': $' + context.parsed.y.toFixed(2);
                                }
                                return 'Price: $' + context.parsed.y.toFixed(2);
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: false,
                            mode: 'x'
                        },
                        zoom: { wheel: { enabled: false }, mode: 'x' }
                    }
                }
            }
        });
    }

    setupRSIChart() {
        const ctx = document.getElementById('rsiChart').getContext('2d');
        this.rsiChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'RSI',
                        data: [],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                day: 'MMM dd',
                                week: 'MMM dd',
                                month: 'MMM yyyy',
                                quarter: 'MMM yyyy',
                                year: 'yyyy'
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: { maxTicksLimit: 8, maxRotation: 0, minRotation: 0 }
                    },
                    y: { 
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: {
                            stepSize: 20,
                            callback: function(value) {
                                return value;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: (context) => {
                                const rsi = context.parsed.y.toFixed(2);
                                const oversoldThreshold = this.activeAlarms['rsi-oversold']?.value || 30;
                                const overboughtThreshold = this.activeAlarms['rsi-overbought']?.value || 70;
                                
                                let status = '';
                                if (context.parsed.y <= oversoldThreshold) {
                                    status = ' (Oversold 🟢)';
                                } else if (context.parsed.y >= overboughtThreshold) {
                                    status = ' (Overbought 🔴)';
                                }
                                return 'RSI: ' + rsi + status;
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            overboughtZone: {
                                type: 'box',
                                yMin: 70,
                                yMax: 100,
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                borderColor: 'transparent'
                            },
                            oversoldZone: {
                                type: 'box',
                                yMin: 0,
                                yMax: 30,
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                borderColor: 'transparent'
                            },
                            overbought: {
                                type: 'line',
                                yMin: 70,
                                yMax: 70,
                                borderColor: 'rgba(220, 38, 38, 0.5)',
                                borderWidth: 1,
                                borderDash: [5, 5],
                                label: {
                                    display: false
                                }
                            },
                            oversold: {
                                type: 'line',
                                yMin: 30,
                                yMax: 30,
                                borderColor: 'rgba(22, 163, 74, 0.5)',
                                borderWidth: 1,
                                borderDash: [5, 5],
                                label: {
                                    display: false
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    setupEventListeners() {
        // Stock search
        const stockSearch = document.getElementById('stockSearch');
        const loadStockBtn = document.getElementById('loadStockBtn');

        // Load stock on button click
        const loadStock = () => {
            const symbol = stockSearch.value.trim().toUpperCase();
            if (symbol) {
                this.loadStockData(symbol);
            }
        };

        loadStockBtn.addEventListener('click', loadStock);

        // Also load on Enter key
        stockSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadStock();
            }
        });

        // Time range buttons
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedTimeRange = parseInt(e.target.dataset.days);
                
                // Reload chart with new time range if we have data
                if (this.currentData && this.currentData.length > 0) {
                    this.updateChart(this.currentData);
                }
            });
        });
        
        // Sell amount type selector
        const sellAmountType = document.getElementById('sellAmountType');
        const sellAmountInput = document.getElementById('sellAmount');
        if (sellAmountType) {
            sellAmountType.addEventListener('change', (e) => {
                if (e.target.value === 'percent') {
                    // Switch to percentage mode
                    sellAmountInput.value = '100';
                    sellAmountInput.min = '1';
                    sellAmountInput.max = '100';
                    sellAmountInput.step = '5';
                } else {
                    // Switch to USD mode
                    sellAmountInput.value = '1000';
                    sellAmountInput.min = '1';
                    sellAmountInput.max = '';
                    sellAmountInput.step = '100';
                }
            });
        }

    }

    async loadStockData(symbol) {
        try {
            document.getElementById('metrics').innerHTML = '<div class="loading">Loading data...</div>';
            
            // Try to download from blob storage
            let csvText = await this.downloadFromBlobStorage(symbol);
            
            // If not found in blob storage, fetch from provider and store it
            if (!csvText) {
                log(`${symbol} not found in blob storage. Fetching from provider...`);
                document.getElementById('metrics').innerHTML = '<div class="loading">Fetching data...</div>';
                
                await this.fetchAndStoreStock(symbol);
                
                // Now download from blob storage
                csvText = await this.downloadFromBlobStorage(symbol);
                
                if (!csvText) {
                    throw new Error(`Failed to fetch data for ${symbol}`);
                }
            }
            
            // Parse CSV data
            const lines = csvText.split('\n');
            const data = [];
            
            // Skip header line (Date,Low,Open,Volume,High,Close,Adjusted Close)
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const columns = line.split(',');
                if (columns.length >= 7) {
                    const dateStr = columns[0]; // Format: DD-MM-YYYY
                    const low = parseFloat(columns[1]);
                    const open = parseFloat(columns[2]);
                    const volume = parseFloat(columns[3]);
                    const high = parseFloat(columns[4]);
                    const close = parseFloat(columns[5]);
                    
                    if (!isNaN(close) && dateStr) {
                        // Parse DD-MM-YYYY format
                        const dateParts = dateStr.split('-');
                        if (dateParts.length === 3) {
                            const day = parseInt(dateParts[0]);
                            const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
                            const year = parseInt(dateParts[2]);
                            const date = new Date(year, month, day);
                            
                            if (!isNaN(date.getTime())) {
                                data.push({
                                    date: date.toISOString().split('T')[0],
                                    close: close,
                                    open: open,
                                    high: high,
                                    low: low,
                                    volume: isNaN(volume) ? 0 : volume
                                });
                            }
                        }
                    }
                }
            }

            // Sort by date ascending
            data.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            this.currentData = data;

            log(`Loaded ${this.currentData.length} data points for ${symbol} from blob storage`);
            
            // Store the symbol for later use
            this.currentData.symbol = symbol;
            
            // Populate the "After" and "Up to" year dropdowns
            this.populateYearDropdowns();
            
            // updateChart will call updateMetrics with filtered data
            this.updateChart(this.currentData);
            
            // Check alarms with new data
            this.checkAlarms();
            
        } catch (error) {
            log('Error loading stock data: ' + error.message);
            console.error('Full error:', error);
            this.showError(`Please Check if Symbol is Correct. Failed to load data for ${symbol}: ${error.message}`);
        }
    }

    async downloadFromBlobStorage(symbol) {
        try {
            // Azure blob storage URL format
            const storageUrl = `https://rgstockappac53.blob.core.windows.net/stock-data/${symbol}.csv`;
            
            log(`Attempting to download ${symbol} from blob storage...`);
            const response = await fetch(storageUrl);
            
            if (!response.ok) {
                log(`${symbol} not found in blob storage (${response.status})`);
                return null;
            }
            
            const csvText = await response.text();
            log(`Successfully downloaded ${symbol} from blob storage`);
            return csvText;
        } catch (error) {
            log(`Error downloading from blob storage: ${error.message}`);
            return null;
        }
    }

    async fetchAndStoreStock(symbol) {
        try {
            // Use config from config.js file
            const functionUrl = `${config.apiBaseUrl}/UpdateStockFromYahoo`;
            
            log(`Calling Azure Function to fetch and store ${symbol}... (${config.environment})`);
            const response = await fetch(`${functionUrl}?symbol=${symbol}`);
            
            if (!response.ok) {
                throw new Error(`Azure Function failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            log(`Successfully fetched ${symbol}: ${result.recordsAdded} records added`);
            
            return result;
        } catch (error) {
            log(`Error calling Azure Function: ${error.message}`);
            throw error;
        }
    }

    populateYearDropdowns() {
        if (!this.currentData || this.currentData.length === 0) return;
        
        const afterYearSelect = document.getElementById('strategyAfterYear');
        const upToYearSelect = document.getElementById('strategyUpToYear');
        if (!afterYearSelect || !upToYearSelect) return;
        
        // Get all unique years from the data
        const years = new Set();
        this.currentData.forEach(d => {
            const year = new Date(d.date).getFullYear();
            years.add(year);
        });
        
        // Sort years in descending order (newest first)
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        
        // Populate "After" dropdown
        afterYearSelect.innerHTML = '<option value="earliest">Earliest</option>';
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            afterYearSelect.appendChild(option);
        });
        
        // Set the earliest (oldest) year as default for "After"
        if (sortedYears.length > 0) {
            const earliestYear = sortedYears[sortedYears.length - 1];
            afterYearSelect.value = earliestYear;
        }
        
        // Populate "Up to" dropdown
        upToYearSelect.innerHTML = '<option value="latest">Latest</option>';
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            upToYearSelect.appendChild(option);
        });
        
        // Set the most recent (newest) year as default for "Up to"
        if (sortedYears.length > 0) {
            const latestYear = sortedYears[0];
            upToYearSelect.value = latestYear;
        }
    }

    updateChart(data) {
        if (!data || data.length === 0) {
            log('No data to display');
            return;
        }

        // Filter data based on selected time range
        // Use the last date in the dataset instead of current date
        const lastDataDate = new Date(data[data.length - 1].date);
        const cutoffDate = new Date(lastDataDate);
        cutoffDate.setDate(cutoffDate.getDate() - this.selectedTimeRange);
        
        const filteredData = this.selectedTimeRange === 99999 
            ? data 
            : data.filter(d => new Date(d.date) >= cutoffDate);

        // Prepare chart data in the format Chart.js expects
        const chartData = filteredData.map(d => ({
            x: d.date,
            y: d.close
        }));

        // Update chart dataset
        this.chart.data.datasets[0].data = chartData;
        this.chart.data.datasets[0].label = `Stock Price (${filteredData.length} days)`;
        
        // Update MA lines if MA crossover alarm is active
        this.updateMALines(filteredData);
        
        // Update Bollinger Bands
        this.updateBollingerBands(filteredData);
        
        // Update the chart
        this.chart.update('none'); // 'none' mode for no animation
        
        // Update RSI chart
        this.updateRSIChart(filteredData);
        
        // Update metrics with filtered data
        this.updateMetrics(this.currentData.symbol || 'Stock', filteredData);
        
        // Update alarm markers
        this.updateAlarmMarkers();
        
        log(`Chart updated with ${filteredData.length} data points`);
    }

    updateMetrics(symbol, data) {
        if (!data || data.length === 0) return;

        const latest = data[data.length - 1];
        const oldest = data[0];
        const priceChange = latest.close - oldest.close;
        const priceChangePercent = (priceChange / oldest.close) * 100;
        
        const prices = data.map(d => d.close);
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

        document.getElementById('metrics').innerHTML = `
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricStockSymbol')}</div>
                <div class="metric-value">${symbol}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricCurrentPrice')}</div>
                <div class="metric-value">$${latest.close.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricTotalChange')}</div>
                <div class="metric-value" style="${priceChangePercent >= 0 ? 'color: #4ade80;' : 'color: #f87171;'}">
                    ${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricHighestPrice')}</div>
                <div class="metric-value">$${maxPrice.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricLowestPrice')}</div>
                <div class="metric-value">$${minPrice.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">${i18n.t('metricAveragePrice')}</div>
                <div class="metric-value">$${avgPrice.toFixed(2)}</div>
            </div>
        `;
    }

    updateMALines(filteredData) {
        // Remove any existing MA line datasets (indices 3 and beyond)
        // Keep: [0]=Stock Price, [1]=Buying Signals, [2]=Selling Signals
        while (this.chart.data.datasets.length > 3) {
            this.chart.data.datasets.pop();
        }
        
        // Check if MA crossover alarms are active
        const maCrossoverAlarm = this.activeAlarms['ma-crossover'];
        const maCrossoverAlarm2 = this.activeAlarms['ma-crossover-2'];
        
        if (!maCrossoverAlarm && !maCrossoverAlarm2) {
            return; // No MA alarms active, no lines to draw
        }
        
        // Collect all unique MA periods to avoid duplicate lines
        const maPeriods = new Set();
        const maConfigs = [];
        
        if (maCrossoverAlarm) {
            maConfigs.push({
                ma1: maCrossoverAlarm.ma1,
                ma2: maCrossoverAlarm.ma2,
                setNumber: 1
            });
        }
        
        if (maCrossoverAlarm2) {
            maConfigs.push({
                ma1: maCrossoverAlarm2.ma1,
                ma2: maCrossoverAlarm2.ma2,
                setNumber: 2
            });
        }
        
        // Collect unique periods with their colors
        const periodColors = {};
        const colors = ['#ff6b6b', '#4ecdc4', '#ffa500', '#9b59b6']; // Red, Teal, Orange, Purple
        let colorIndex = 0;
        
        maConfigs.forEach(config => {
            if (!periodColors[config.ma1]) {
                periodColors[config.ma1] = colors[colorIndex % colors.length];
                colorIndex++;
            }
            if (!periodColors[config.ma2]) {
                periodColors[config.ma2] = colors[colorIndex % colors.length];
                colorIndex++;
            }
        });
        
        let hasLines = false;
        
        // Calculate and draw each unique MA period only once
        for (const [period, color] of Object.entries(periodColors)) {
            const maPeriod = parseInt(period);
            const maData = [];
            
            // Calculate MA line for the filtered data
            filteredData.forEach((dataPoint, index) => {
                // Find this point in the full dataset
                const fullIndex = this.currentData.findIndex(d => d.date === dataPoint.date);
                
                if (fullIndex >= maPeriod - 1) {
                    const dataForMA = this.currentData.slice(0, fullIndex + 1);
                    const maValue = this.calculateMA(dataForMA, maPeriod);
                    if (maValue) {
                        maData.push({ x: dataPoint.date, y: maValue });
                    }
                }
            });
            
            // Add MA line dataset
            if (maData.length > 0) {
                this.chart.data.datasets.push({
                    label: `MA-${maPeriod}`,
                    data: maData,
                    borderColor: color,
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 3, // Behind stock price but in front of signals
                    borderDash: []
                });
                hasLines = true;
            }
        }
        
        // Update legend to show MA lines
        this.chart.options.plugins.legend.display = hasLines;
    }

    updateBollingerBands(filteredData, period = 20) {
        // Remove existing Bollinger Bands datasets
        this.chart.data.datasets = this.chart.data.datasets.filter(ds => 
            !ds.label || (!ds.label.startsWith('BB-'))
        );
        
        // Only show Bollinger Bands if enabled
        if (!this.showBollingerBands || !filteredData || filteredData.length < period) {
            return;
        }
        
        const upperBandData = [];
        const middleBandData = [];
        const lowerBandData = [];
        
        // Calculate Bollinger Bands for each point in filtered data
        filteredData.forEach((dataPoint, index) => {
            // Find this point in the full dataset
            const fullIndex = this.currentData.findIndex(d => d.date === dataPoint.date);
            
            if (fullIndex >= period - 1) {
                const dataForBB = this.currentData.slice(0, fullIndex + 1);
                const bb = this.calculateBollingerBands(dataForBB, period);
                
                if (bb) {
                    upperBandData.push({ x: dataPoint.date, y: bb.upper });
                    middleBandData.push({ x: dataPoint.date, y: bb.middle });
                    lowerBandData.push({ x: dataPoint.date, y: bb.lower });
                }
            }
        });
        
        // Add Bollinger Bands datasets
        if (upperBandData.length > 0) {
            const bbStartIndex = this.chart.data.datasets.length;
            
            // Upper band
            this.chart.data.datasets.push({
                label: 'BB-Upper',
                data: upperBandData,
                borderColor: 'rgba(128, 128, 128, 0.5)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                order: 4,
                borderDash: [5, 5]
            });
            
            // Middle band (20-day SMA)
            this.chart.data.datasets.push({
                label: 'BB-Middle (SMA-20)',
                data: middleBandData,
                borderColor: 'rgba(128, 128, 128, 0.7)',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                order: 4
            });
            
            // Lower band with fill to upper band
            this.chart.data.datasets.push({
                label: 'BB-Lower',
                data: lowerBandData,
                borderColor: 'rgba(128, 128, 128, 0.5)',
                backgroundColor: 'rgba(128, 128, 128, 0.1)',
                borderWidth: 1,
                fill: bbStartIndex, // Fill to the upper band dataset
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                order: 4,
                borderDash: [5, 5]
            });
            
            this.chart.options.plugins.legend.display = true;
        }
    }

    updateRSIChart(filteredData) {
        const minPoints = this.rsiPeriod + 1; // Need period + 1 points for RSI
        
        if (!filteredData || filteredData.length < minPoints) {
            // Not enough data for RSI
            this.rsiChart.data.datasets[0].data = [];
            this.rsiChart.update('none');
            document.getElementById('rsiValue').textContent = '--';
            document.getElementById('rsiValue').className = 'rsi-value';
            return;
        }

        const rsiData = [];
        
        // Calculate RSI for each point in filtered data
        filteredData.forEach((dataPoint, index) => {
            // Find this point in the full dataset
            const fullIndex = this.currentData.findIndex(d => d.date === dataPoint.date);
            
            if (fullIndex >= this.rsiPeriod) { // Need at least period + 1 points for RSI
                const dataUpToPoint = this.currentData.slice(0, fullIndex + 1);
                const rsi = this.calculateRSI(dataUpToPoint, this.rsiPeriod);
                
                if (rsi !== null) {
                    rsiData.push({ x: dataPoint.date, y: rsi });
                }
            }
        });

        // Update RSI chart
        this.rsiChart.data.datasets[0].data = rsiData;
        this.rsiChart.update('none');

        // Update RSI value display
        if (rsiData.length > 0) {
            const latestRSI = rsiData[rsiData.length - 1].y;
            const rsiValueElement = document.getElementById('rsiValue');
            rsiValueElement.textContent = latestRSI.toFixed(2);
            
            // Get dynamic thresholds
            const oversoldThreshold = this.activeAlarms['rsi-oversold']?.value || 30;
            const overboughtThreshold = this.activeAlarms['rsi-overbought']?.value || 70;
            
            // Update color based on RSI value with dynamic thresholds
            rsiValueElement.className = 'rsi-value';
            if (latestRSI <= oversoldThreshold) {
                rsiValueElement.classList.add('oversold');
            } else if (latestRSI >= overboughtThreshold) {
                rsiValueElement.classList.add('overbought');
            }
        }
    }

    showError(message) {
        document.getElementById('metrics').innerHTML = `<div class="error">${message}</div>`;
        log('Error shown: ' + message);
    }

    updateRSIChartVisibility() {
        const rsiContainer = document.querySelector('.rsi-chart-container');
        const hasRSIAlarm = this.activeAlarms['rsi-oversold'] || this.activeAlarms['rsi-overbought'];
        
        if (hasRSIAlarm) {
            rsiContainer.classList.add('visible');
            // Update the chart with current data if available
            if (this.currentData && this.currentData.length > 0) {
                this.refreshChart();
            }
        } else {
            rsiContainer.classList.remove('visible');
        }
    }

    toggleBollingerBands() {
        this.showBollingerBands = !this.showBollingerBands;
        
        log(`Bollinger Bands ${this.showBollingerBands ? 'enabled' : 'disabled'}`);
        
        // Refresh the chart to show/hide Bollinger Bands
        if (this.currentData && this.currentData.length > 0) {
            this.refreshChart();
        }
    }

    updateBollingerBandsVisibility() {
        // Show Bollinger Bands if either BB alarm is active
        const hasBBAlarm = this.activeAlarms['bb-lower'] || this.activeAlarms['bb-upper'];
        this.showBollingerBands = hasBBAlarm;
        
        if (this.currentData && this.currentData.length > 0) {
            this.refreshChart();
        }
    }

    updateRSIPeriod(input) {
        const period = parseInt(input.value);
        if (period >= 5 && period <= 100) {
            this.rsiPeriod = period;
            
            // Update the RSI label in the chart
            const rsiLabel = document.querySelector('.rsi-label');
            if (rsiLabel) {
                rsiLabel.textContent = `RSI (${period})`;
            }
            
            log(`RSI period updated to: ${period}`);
            
            // Refresh chart if data is available (regardless of visibility)
            if (this.currentData && this.currentData.length > 0) {
                this.refreshChart();
            }
        }
    }

    updateRSIAnnotations() {
        if (!this.rsiChart) return;
        
        const oversoldValue = this.activeAlarms['rsi-oversold']?.value || 30;
        const overboughtValue = this.activeAlarms['rsi-overbought']?.value || 70;
        
        // Update the annotation zones and lines
        this.rsiChart.options.plugins.annotation.annotations.oversoldZone.yMax = oversoldValue;
        this.rsiChart.options.plugins.annotation.annotations.oversold.yMin = oversoldValue;
        this.rsiChart.options.plugins.annotation.annotations.oversold.yMax = oversoldValue;
        
        this.rsiChart.options.plugins.annotation.annotations.overboughtZone.yMin = overboughtValue;
        this.rsiChart.options.plugins.annotation.annotations.overbought.yMin = overboughtValue;
        this.rsiChart.options.plugins.annotation.annotations.overbought.yMax = overboughtValue;
        
        // Update the chart
        this.rsiChart.update('none');
        
        log(`RSI annotations updated: oversold=${oversoldValue}, overbought=${overboughtValue}`);
    }

    toggleAlarm(card) {
        const alarmType = card.dataset.alarmType;
        const isActive = card.classList.contains('active');
        
        // Define buying and selling signal types
        const buyingSignals = ['below', 'nweek-low', 'ma-crossover', 'daily-loss', 'rsi-oversold', 'bb-lower'];
        const sellingSignals = ['above', 'nweek-high', 'ma-crossover-2', 'daily-gain', 'rsi-overbought', 'bb-upper'];
        
        if (isActive) {
            // Deactivate alarm
            card.classList.remove('active');
            delete this.activeAlarms[alarmType];
            
            // Clear buy/sell button states
            const buyButton = card.querySelector('.alarm-action-btn.buy');
            const sellButton = card.querySelector('.alarm-action-btn.sell');
            if (buyButton) buyButton.classList.remove('active');
            if (sellButton) sellButton.classList.remove('active');
            
            // Remove from buy/sell conditions
            const buyIndex = this.buyConditions.indexOf(alarmType);
            if (buyIndex > -1) this.buyConditions.splice(buyIndex, 1);
            
            // Commented out for simplified buy & hold strategy
            /*
            const sellIndex = this.sellConditions.indexOf(alarmType);
            if (sellIndex > -1) this.sellConditions.splice(sellIndex, 1);
            */
            
            // Hide RSI chart if both RSI alarms are off
            if (alarmType === 'rsi-oversold' || alarmType === 'rsi-overbought') {
                this.updateRSIChartVisibility();
            }
            
            // Hide Bollinger Bands if both BB alarms are off
            if (alarmType === 'bb-lower' || alarmType === 'bb-upper') {
                this.updateBollingerBandsVisibility();
            }
            
            log(`Alarm deactivated: ${alarmType}`);
        } else {
            // Activate alarm
            card.classList.add('active');
            const input = card.querySelector('input');
            const value = input ? parseFloat(input.value) : null;
            
            // Get direction for daily-change alarm
            const directionSelect = card.querySelector('.direction-select');
            const direction = directionSelect ? directionSelect.value : null;
            
            // Get MA values for ma-crossover alarm
            const maSelect1 = card.querySelector('.ma-select-1');
            const maSelect2 = card.querySelector('.ma-select-2');
            const maDirectionSelect = card.querySelector('.ma-direction-select');
            const ma1 = maSelect1 ? parseInt(maSelect1.value) : null;
            const ma2 = maSelect2 ? parseInt(maSelect2.value) : null;
            const maDirection = maDirectionSelect ? maDirectionSelect.value : 'above';
            
            this.activeAlarms[alarmType] = {
                value: value,
                type: alarmType,
                direction: direction,
                ma1: ma1,
                ma2: ma2,
                maDirection: maDirection
            };
            
            // Automatically add to appropriate conditions list
            if (buyingSignals.includes(alarmType)) {
                if (!this.buyConditions.includes(alarmType)) {
                    this.buyConditions.push(alarmType);
                    log(`Automatically added to buy conditions: ${alarmType}`);
                }
            }
            
            log(`Alarm activated: ${alarmType} = ${value || (ma1 ? `MA${ma1} ${maDirection} MA${ma2}` : '')}${direction ? ` (${direction})` : ''}`);
            
            // Show RSI chart if any RSI alarm is activated
            if (alarmType === 'rsi-oversold' || alarmType === 'rsi-overbought') {
                this.updateRSIChartVisibility();
            }
            
            // Show Bollinger Bands if any BB alarm is activated
            if (alarmType === 'bb-lower' || alarmType === 'bb-upper') {
                this.updateBollingerBandsVisibility();
            }
        }
        
        // Update chart markers whenever alarm changes
        this.updateAlarmMarkers();
        
        // Refresh chart to update MA lines (if MA crossover alarm was toggled)
        if (alarmType === 'ma-crossover' || alarmType === 'ma-crossover-2') {
            this.refreshChart();
        }
        
        // Update trading conditions list
        this.updateTradingConditionsList();
        
        // Update selected alerts list for notifications
        this.updateSelectedAlertsList();
    }

    checkAlarms() {
        if (!this.currentData || this.currentData.length === 0) return;
        
        const latestPrice = this.currentData[this.currentData.length - 1].close;
        const symbol = this.currentData.symbol || 'Stock';
        
        // Check each active alarm
        for (const [type, alarm] of Object.entries(this.activeAlarms)) {
            let triggered = false;
            let message = '';
            
            switch(type) {
                case 'above':
                    if (latestPrice > alarm.value) {
                        triggered = true;
                        message = `🔔 ${symbol} is above $${alarm.value.toFixed(2)}! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'below':
                    if (latestPrice < alarm.value) {
                        triggered = true;
                        message = `🔔 ${symbol} is below $${alarm.value.toFixed(2)}! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'nweek-low':
                    const lowWeeks = alarm.value;
                    const lowDays = lowWeeks * 7;
                    const recentLowData = this.currentData.slice(-lowDays);
                    const lowestPrice = Math.min(...recentLowData.map(d => d.close));
                    
                    if (latestPrice === lowestPrice) {
                        triggered = true;
                        message = `🔔 ${symbol} hit ${lowWeeks}-week low! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'nweek-high':
                    const highWeeks = alarm.value;
                    const highDays = highWeeks * 7;
                    const recentHighData = this.currentData.slice(-highDays);
                    const highestPrice = Math.max(...recentHighData.map(d => d.close));
                    
                    if (latestPrice === highestPrice) {
                        triggered = true;
                        message = `🔔 ${symbol} hit ${highWeeks}-week high! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'daily-gain':
                    // Need at least 2 data points to calculate daily change
                    if (this.currentData.length < 2) break;
                    
                    const prevPriceGain = this.currentData[this.currentData.length - 2].close;
                    const gainPercent = ((latestPrice - prevPriceGain) / prevPriceGain) * 100;
                    
                    if (gainPercent >= alarm.value) {
                        triggered = true;
                        message = `📈 ${symbol} daily gain is +${gainPercent.toFixed(2)}%! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'daily-loss':
                    // Need at least 2 data points to calculate daily change
                    if (this.currentData.length < 2) break;
                    
                    const prevPriceLoss = this.currentData[this.currentData.length - 2].close;
                    const lossPercent = ((latestPrice - prevPriceLoss) / prevPriceLoss) * 100;
                    
                    // Note: lossPercent will be negative for losses
                    if (lossPercent <= -alarm.value) {
                        triggered = true;
                        message = `📉 ${symbol} daily loss is ${lossPercent.toFixed(2)}%! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'daily-change':
                    // Need at least 2 data points to calculate daily change
                    if (this.currentData.length < 2) break;
                    
                    const previousPrice = this.currentData[this.currentData.length - 2].close;
                    const changePercent = ((latestPrice - previousPrice) / previousPrice) * 100;
                    const direction = alarm.direction || 'both';
                    
                    // Check based on selected direction
                    if (direction === 'both') {
                        // Trigger on either positive or negative change
                        if (Math.abs(changePercent) >= alarm.value) {
                            triggered = true;
                        }
                    } else if (direction === 'up') {
                        // Only trigger on positive change
                        if (changePercent >= alarm.value) {
                            triggered = true;
                        }
                    } else if (direction === 'down') {
                        // Only trigger on negative change (note: changePercent will be negative)
                        if (changePercent <= -alarm.value) {
                            triggered = true;
                        }
                    }
                    
                    if (triggered) {
                        const directionText = changePercent > 0 ? 'up' : 'down';
                        const sign = changePercent > 0 ? '+' : '';
                        message = `💰 ${symbol} daily change is ${sign}${changePercent.toFixed(2)}% (${directionText})! Current: $${latestPrice.toFixed(2)}`;
                    }
                    break;
                    
                case 'ma-crossover':
                    // Need enough data points to calculate both MAs and check for crossover
                    const ma1Period = alarm.ma1;
                    const ma2Period = alarm.ma2;
                    const maxPeriod = Math.max(ma1Period, ma2Period);
                    const maDirection = alarm.maDirection || 'above';
                    
                    if (this.currentData.length < maxPeriod) break;
                    
                    const ma1Value = this.calculateMA(this.currentData, ma1Period);
                    const ma2Value = this.calculateMA(this.currentData, ma2Period);
                    
                    if (!ma1Value || !ma2Value) break;
                    
                    // Handle different direction types
                    if (maDirection === 'above') {
                        // MA1 is above MA2
                        if (ma1Value > ma2Value) {
                            triggered = true;
                            message = `📊 ${symbol} MA-${ma1Period} ($${ma1Value.toFixed(2)}) is above MA-${ma2Period} ($${ma2Value.toFixed(2)})!`;
                        }
                    } else if (maDirection === 'below') {
                        // MA1 is below MA2
                        if (ma1Value < ma2Value) {
                            triggered = true;
                            message = `📊 ${symbol} MA-${ma1Period} ($${ma1Value.toFixed(2)}) is below MA-${ma2Period} ($${ma2Value.toFixed(2)})!`;
                        }
                    } else if (maDirection === 'cross-up' || maDirection === 'cross-down') {
                        // Check for crossover - need previous MA values
                        if (this.currentData.length < maxPeriod + 1) break;
                        
                        const prevData = this.currentData.slice(0, -1);
                        const prevMA1 = this.calculateMA(prevData, ma1Period);
                        const prevMA2 = this.calculateMA(prevData, ma2Period);
                        
                        if (!prevMA1 || !prevMA2) break;
                        
                        if (maDirection === 'cross-up') {
                            // MA1 crosses up through MA2 (was below, now above)
                            if (prevMA1 <= prevMA2 && ma1Value > ma2Value) {
                                triggered = true;
                                message = `📊 ${symbol} MA-${ma1Period} ($${ma1Value.toFixed(2)}) crossed UP through MA-${ma2Period} ($${ma2Value.toFixed(2)})! 🚀`;
                            }
                        } else if (maDirection === 'cross-down') {
                            // MA1 crosses down through MA2 (was above, now below)
                            if (prevMA1 >= prevMA2 && ma1Value < ma2Value) {
                                triggered = true;
                                message = `📊 ${symbol} MA-${ma1Period} ($${ma1Value.toFixed(2)}) crossed DOWN through MA-${ma2Period} ($${ma2Value.toFixed(2)})! 📉`;
                            }
                        }
                    }
                    break;
                    
                case 'ma-crossover-2':
                    // Identical logic to ma-crossover, just a separate instance
                    const ma1Period2 = alarm.ma1;
                    const ma2Period2 = alarm.ma2;
                    const maxPeriod2 = Math.max(ma1Period2, ma2Period2);
                    const maDirection2 = alarm.maDirection || 'above';
                    
                    if (this.currentData.length < maxPeriod2) break;
                    
                    const ma1Value2 = this.calculateMA(this.currentData, ma1Period2);
                    const ma2Value2 = this.calculateMA(this.currentData, ma2Period2);
                    
                    if (!ma1Value2 || !ma2Value2) break;
                    
                    if (maDirection2 === 'above') {
                        if (ma1Value2 > ma2Value2) {
                            triggered = true;
                            message = `📊 ${symbol} MA-${ma1Period2} ($${ma1Value2.toFixed(2)}) is above MA-${ma2Period2} ($${ma2Value2.toFixed(2)})! [Setting 2]`;
                        }
                    } else if (maDirection2 === 'below') {
                        if (ma1Value2 < ma2Value2) {
                            triggered = true;
                            message = `📊 ${symbol} MA-${ma1Period2} ($${ma1Value2.toFixed(2)}) is below MA-${ma2Period2} ($${ma2Value2.toFixed(2)})! [Setting 2]`;
                        }
                    } else if (maDirection2 === 'cross-up' || maDirection2 === 'cross-down') {
                        if (this.currentData.length < maxPeriod2 + 1) break;
                        
                        const prevData2 = this.currentData.slice(0, -1);
                        const prevMA1_2 = this.calculateMA(prevData2, ma1Period2);
                        const prevMA2_2 = this.calculateMA(prevData2, ma2Period2);
                        
                        if (!prevMA1_2 || !prevMA2_2) break;
                        
                        if (maDirection2 === 'cross-up') {
                            if (prevMA1_2 <= prevMA2_2 && ma1Value2 > ma2Value2) {
                                triggered = true;
                                message = `📊 ${symbol} MA-${ma1Period2} ($${ma1Value2.toFixed(2)}) crossed UP through MA-${ma2Period2} ($${ma2Value2.toFixed(2)})! 🚀 [Setting 2]`;
                            }
                        } else if (maDirection2 === 'cross-down') {
                            if (prevMA1_2 >= prevMA2_2 && ma1Value2 < ma2Value2) {
                                triggered = true;
                                message = `📊 ${symbol} MA-${ma1Period2} ($${ma1Value2.toFixed(2)}) crossed DOWN through MA-${ma2Period2} ($${ma2Value2.toFixed(2)})! 📉 [Setting 2]`;
                            }
                        }
                    }
                    break;
                    
                case 'rsi-oversold':
                    // RSI below threshold indicates oversold (buy signal)
                    const rsiOversold = this.calculateRSI(this.currentData, this.rsiPeriod);
                    if (rsiOversold !== null && rsiOversold <= alarm.value) {
                        triggered = true;
                        message = `📊 ${symbol} RSI(${this.rsiPeriod}) is ${rsiOversold.toFixed(2)} (oversold ≤ ${alarm.value})! Potential BUY signal! 🟢`;
                    }
                    break;
                    
                case 'rsi-overbought':
                    // RSI above threshold indicates overbought (sell signal)
                    const rsiOverbought = this.calculateRSI(this.currentData, this.rsiPeriod);
                    if (rsiOverbought !== null && rsiOverbought >= alarm.value) {
                        triggered = true;
                        message = `📊 ${symbol} RSI(${this.rsiPeriod}) is ${rsiOverbought.toFixed(2)} (overbought ≥ ${alarm.value})! Potential SELL signal! 🔴`;
                    }
                    break;
                    
                case 'bb-lower':
                    // Price touches or crosses below lower Bollinger Band (buy signal)
                    const bbPeriodLower = 20;
                    if (this.currentData.length < bbPeriodLower) break;
                    
                    const bbLowerBand = this.calculateBollingerBands(this.currentData, bbPeriodLower);
                    const latestDataLower = this.currentData[this.currentData.length - 1];
                    
                    if (bbLowerBand && (latestDataLower.close <= bbLowerBand.lower || latestDataLower.low <= bbLowerBand.lower)) {
                        triggered = true;
                        message = `📊 ${symbol} touched Lower Bollinger Band! Price: $${latestPrice.toFixed(2)}, BB-Lower: $${bbLowerBand.lower.toFixed(2)} - Potential BUY signal! 🟢`;
                    }
                    break;
                    
                case 'bb-upper':
                    // Price touches or crosses above upper Bollinger Band (sell signal)
                    const bbPeriodUpper = 20;
                    if (this.currentData.length < bbPeriodUpper) break;
                    
                    const bbUpperBand = this.calculateBollingerBands(this.currentData, bbPeriodUpper);
                    const latestDataUpper = this.currentData[this.currentData.length - 1];
                    
                    if (bbUpperBand && (latestDataUpper.close >= bbUpperBand.upper || latestDataUpper.high >= bbUpperBand.upper)) {
                        triggered = true;
                        message = `📊 ${symbol} touched Upper Bollinger Band! Price: $${latestPrice.toFixed(2)}, BB-Upper: $${bbUpperBand.upper.toFixed(2)} - Potential SELL signal! 🔴`;
                    }
                    break;
            }
            
            if (triggered) {
                log(message);
                this.showAlarmNotification(message);
            }
        }
    }

    showAlarmNotification(message) {
        // Simple alert for now - could be replaced with a nice toast notification
        if (confirm(message + '\n\nClick OK to acknowledge.')) {
            log('Alarm acknowledged');
        }
    }

    updateAlarmValue(input) {
        const card = input.closest('.alarm-card');
        const alarmType = card.dataset.alarmType;
        const newValue = parseFloat(input.value);
        
        // Update the alarm value if it's active
        if (this.activeAlarms[alarmType]) {
            this.activeAlarms[alarmType].value = newValue;
            log(`Alarm ${alarmType} value updated to ${newValue}`);
            
            // Update markers immediately
            this.updateAlarmMarkers();
            
            // If it's an RSI alarm, update the annotation lines
            if (alarmType === 'rsi-oversold' || alarmType === 'rsi-overbought') {
                this.updateRSIAnnotations();
            }
        }
    }

    updateAlarmDirection(select) {
        const card = select.closest('.alarm-card');
        const alarmType = card.dataset.alarmType;
        const newDirection = select.value;
        
        // Update the alarm direction if it's active
        if (this.activeAlarms[alarmType]) {
            this.activeAlarms[alarmType].direction = newDirection;
            log(`Alarm ${alarmType} direction updated to ${newDirection}`);
            
            // Update markers immediately
            this.updateAlarmMarkers();
        }
    }

    updateMAValue(select) {
        const card = select.closest('.alarm-card');
        const alarmType = card.dataset.alarmType;
        
        // Update the MA values if it's active
        if (this.activeAlarms[alarmType]) {
            const maSelect1 = card.querySelector('.ma-select-1');
            const maSelect2 = card.querySelector('.ma-select-2');
            const maDirectionSelect = card.querySelector('.ma-direction-select');
            this.activeAlarms[alarmType].ma1 = parseInt(maSelect1.value);
            this.activeAlarms[alarmType].ma2 = parseInt(maSelect2.value);
            const directionText = maDirectionSelect ? maDirectionSelect.value : 'above';
            log(`Alarm ${alarmType} updated to MA${maSelect1.value} ${directionText} MA${maSelect2.value}`);
            
            // Update markers immediately
            this.updateAlarmMarkers();
            
            // Refresh chart to update MA lines
            this.refreshChart();
        }
    }

    updateMADirection(select) {
        const card = select.closest('.alarm-card');
        const alarmType = card.dataset.alarmType;
        const newDirection = select.value;
        
        // Update the MA direction if it's active
        if (this.activeAlarms[alarmType]) {
            this.activeAlarms[alarmType].maDirection = newDirection;
            const ma1 = this.activeAlarms[alarmType].ma1;
            const ma2 = this.activeAlarms[alarmType].ma2;
            log(`Alarm ${alarmType} updated to MA${ma1} ${newDirection} MA${ma2}`);
            
            // Update markers immediately
            this.updateAlarmMarkers();
        }
    }

    refreshChart() {
        // Re-render the chart with current data and MA lines
        if (!this.currentData || this.currentData.length === 0) return;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.selectedTimeRange);
        
        const filteredData = this.selectedTimeRange === 99999 
            ? this.currentData 
            : this.currentData.filter(d => new Date(d.date) >= cutoffDate);
        
        const chartData = filteredData.map(d => ({
            x: d.date,
            y: d.close
        }));
        
        this.chart.data.datasets[0].data = chartData;
        this.updateMALines(filteredData);
        this.updateBollingerBands(filteredData);
        this.updateRSIChart(filteredData);
        this.chart.update('none');
    }

    calculateMA(data, period) {
        if (data.length < period) return null;
        const sum = data.slice(-period).reduce((acc, d) => acc + d.close, 0);
        return sum / period;
    }

    // Calculate EMA (Exponential Moving Average)
    calculateEMA(data, period) {
        if (data.length < period) return null;
        
        const prices = data.map(d => d.close);
        const multiplier = 2 / (period + 1);
        
        // Start with SMA for the first EMA value
        let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        // Calculate EMA for remaining values
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }
        
        return ema;
    }

    // Calculate RSI (Relative Strength Index)
    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;
        
        const prices = data.map(d => d.close);
        const changes = [];
        
        // Calculate price changes
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }
        
        // Get recent changes for the period
        const recentChanges = changes.slice(-period);
        
        // Separate gains and losses
        let avgGain = 0;
        let avgLoss = 0;
        
        for (const change of recentChanges) {
            if (change > 0) {
                avgGain += change;
            } else {
                avgLoss += Math.abs(change);
            }
        }
        
        avgGain /= period;
        avgLoss /= period;
        
        // Avoid division by zero
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return rsi;
    }

    // Calculate Bollinger Bands
    calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (data.length < period) return null;
        
        // Calculate SMA (middle band)
        const sum = data.slice(-period).reduce((acc, d) => acc + d.close, 0);
        const sma = sum / period;
        
        // Calculate standard deviation
        const squaredDifferences = data.slice(-period).map(d => Math.pow(d.close - sma, 2));
        const variance = squaredDifferences.reduce((acc, val) => acc + val, 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        // Calculate bands
        return {
            middle: sma,
            upper: sma + (stdDev * standardDeviation),
            lower: sma - (stdDev * standardDeviation)
        };
    }

    updateAlarmMarkers() {
        if (!this.chart || !this.currentData || this.currentData.length === 0) return;
        
        // Get active alarms and categorize them
        const buyingSignals = ['below', 'nweek-low', 'ma-crossover', 'daily-loss', 'rsi-oversold', 'bb-lower']; // buying signal types
        const sellingSignals = ['above', 'nweek-high', 'ma-crossover-2', 'daily-gain', 'rsi-overbought', 'bb-upper']; // selling signal types
        
        const activeBuyingAlarms = {};
        const activeSellingAlarms = {};
        
        for (const [type, alarm] of Object.entries(this.activeAlarms)) {
            if (buyingSignals.includes(type)) {
                activeBuyingAlarms[type] = alarm;
            } else if (sellingSignals.includes(type)) {
                activeSellingAlarms[type] = alarm;
            }
        }
        
        const hasBuyingSignals = Object.keys(activeBuyingAlarms).length > 0;
        const hasSellingSignals = Object.keys(activeSellingAlarms).length > 0;
        
        log(`Active alarms: Buying=${Object.keys(activeBuyingAlarms).join(', ')}, Selling=${Object.keys(activeSellingAlarms).join(', ')}`);
        
        if (!hasBuyingSignals && !hasSellingSignals) {
            // No alarms active, clear markers
            if (this.chart.data.datasets[1]) {
                this.chart.data.datasets[1].data = [];
            }
            if (this.chart.data.datasets[2]) {
                this.chart.data.datasets[2].data = [];
            }
            this.chart.update('none');
            return;
        }
        
        // Filter data based on selected time range (same as chart)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.selectedTimeRange);
        
        const filteredData = this.selectedTimeRange === 99999 
            ? this.currentData 
            : this.currentData.filter(d => new Date(d.date) >= cutoffDate);
        
        // Find dates that match ALL buying conditions (AND relationship)
        const buyingPoints = [];
        // Find dates that match ALL selling conditions (AND relationship)
        const sellingPoints = [];
        
        filteredData.forEach((dataPoint, index) => {
            // Find the index of this dataPoint in the FULL dataset (not just filtered)
            const fullDataIndex = this.currentData.findIndex(d => d.date === dataPoint.date);
            
            if (fullDataIndex === -1) {
                console.error(`Could not find dataPoint in full dataset: ${dataPoint.date}`);
                return;
            }
            
            // Check buying signals (AND relationship)
            if (hasBuyingSignals) {
                let meetsAllBuyingConditions = true;
                
                for (const [type, alarm] of Object.entries(activeBuyingAlarms)) {
                    if (!this.checkAlarmCondition(type, alarm, dataPoint, fullDataIndex)) {
                        meetsAllBuyingConditions = false;
                        break;
                    }
                }
                
                if (meetsAllBuyingConditions) {
                    buyingPoints.push({
                        x: dataPoint.date,
                        y: dataPoint.close
                    });
                }
            }
            
            // Check selling signals (AND relationship)
            if (hasSellingSignals) {
                let meetsAllSellingConditions = true;
                
                for (const [type, alarm] of Object.entries(activeSellingAlarms)) {
                    const conditionMet = this.checkAlarmCondition(type, alarm, dataPoint, fullDataIndex);
                    if (!conditionMet) {
                        meetsAllSellingConditions = false;
                        break;
                    }
                }
                
                if (meetsAllSellingConditions) {
                    sellingPoints.push({
                        x: dataPoint.date,
                        y: dataPoint.close
                    });
                }
            }
        });
        
        // Ensure we have all three datasets initialized
        if (!this.chart.data.datasets[1]) {
            this.chart.data.datasets[1] = {
                label: 'Buying Signals',
                data: [],
                type: 'scatter',
                pointBackgroundColor: '#22c55e',
                pointBorderColor: '#16a34a',
                pointRadius: 8,
                pointHoverRadius: 12,
                pointBorderWidth: 2,
                showLine: false,
                order: 0
            };
        }
        
        if (!this.chart.data.datasets[2]) {
            this.chart.data.datasets[2] = {
                label: 'Selling Signals',
                data: [],
                type: 'scatter',
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#dc2626',
                pointRadius: 8,
                pointHoverRadius: 12,
                pointBorderWidth: 2,
                showLine: false,
                order: 0
            };
        }
        
        // Update marker datasets (buying = green, selling = red)
        this.chart.data.datasets[1].data = buyingPoints;
        this.chart.data.datasets[2].data = sellingPoints;
        
        this.chart.update('none');
        
        log(`Found ${buyingPoints.length} buying signal points and ${sellingPoints.length} selling signal points`);
    }
    
    checkAlarmCondition(type, alarm, dataPoint, fullDataIndex) {
        let conditionMet = false;
                
        switch(type) {
            case 'above':
                conditionMet = dataPoint.close > alarm.value;
                break;
                
            case 'below':
                conditionMet = dataPoint.close < alarm.value;
                break;
                
            case 'nweek-low':
                const lowWeeks = alarm.value;
                const lowDays = lowWeeks * 7;
                // Use full dataset index, not filtered index
                const startIdx = Math.max(0, fullDataIndex - lowDays);
                const recentData = this.currentData.slice(startIdx, fullDataIndex + 1);
                const lowestPrice = Math.min(...recentData.map(d => d.close));
                conditionMet = dataPoint.close === lowestPrice;
                break;
                
            case 'nweek-high':
                const highWeeks = alarm.value;
                const highDays = highWeeks * 7;
                // Use full dataset index, not filtered index
                const startIdxHigh = Math.max(0, fullDataIndex - highDays);
                const recentDataHigh = this.currentData.slice(startIdxHigh, fullDataIndex + 1);
                const highestPrice = Math.max(...recentDataHigh.map(d => d.close));
                conditionMet = dataPoint.close === highestPrice;
                break;
                
            case 'daily-gain':
                if (fullDataIndex < 1) {
                    conditionMet = false;
                    break;
                }
                const prevGainPrice = this.currentData[fullDataIndex - 1].close;
                const gainChange = ((dataPoint.close - prevGainPrice) / prevGainPrice) * 100;
                conditionMet = gainChange >= alarm.value;
                break;
                
            case 'daily-loss':
                if (fullDataIndex < 1) {
                    conditionMet = false;
                    break;
                }
                const prevLossPrice = this.currentData[fullDataIndex - 1].close;
                const lossChange = ((dataPoint.close - prevLossPrice) / prevLossPrice) * 100;
                conditionMet = lossChange <= -alarm.value;
                break;
                
            case 'daily-change':
                // Need previous day's data to calculate daily change
                if (fullDataIndex < 1) {
                    conditionMet = false;
                    break;
                }
                const prevDayPrice = this.currentData[fullDataIndex - 1].close;
                const dailyChangePercent = ((dataPoint.close - prevDayPrice) / prevDayPrice) * 100;
                const alarmDirection = alarm.direction || 'both';
                
                // Check based on selected direction
                if (alarmDirection === 'both') {
                    conditionMet = Math.abs(dailyChangePercent) >= alarm.value;
                } else if (alarmDirection === 'up') {
                    conditionMet = dailyChangePercent >= alarm.value;
                } else if (alarmDirection === 'down') {
                    conditionMet = dailyChangePercent <= -alarm.value;
                }
                break;
                
            case 'ma-crossover':
                // Need enough data to calculate both MAs
                const ma1Period = alarm.ma1;
                const ma2Period = alarm.ma2;
                const maxMAPeriod = Math.max(ma1Period, ma2Period);
                const markerMADirection = alarm.maDirection || 'above';
                
                if (fullDataIndex < maxMAPeriod - 1) {
                    conditionMet = false;
                    break;
                }
                
                // Calculate MAs up to this data point
                const dataUpToPoint = this.currentData.slice(0, fullDataIndex + 1);
                if (dataUpToPoint.length < maxMAPeriod) {
                    conditionMet = false;
                    break;
                }
                
                const ma1Val = this.calculateMA(dataUpToPoint, ma1Period);
                const ma2Val = this.calculateMA(dataUpToPoint, ma2Period);
                
                if (!ma1Val || !ma2Val) {
                    conditionMet = false;
                    break;
                }
                
                // Check based on direction
                if (markerMADirection === 'above') {
                    conditionMet = ma1Val > ma2Val;
                } else if (markerMADirection === 'below') {
                    conditionMet = ma1Val < ma2Val;
                } else if (markerMADirection === 'cross-up' || markerMADirection === 'cross-down') {
                    // For crossovers, check if this is the crossover point
                    if (fullDataIndex < maxMAPeriod) {
                        conditionMet = false;
                        break;
                    }
                    
                    const prevDataUpToPoint = this.currentData.slice(0, fullDataIndex);
                    const prevMA1 = this.calculateMA(prevDataUpToPoint, ma1Period);
                    const prevMA2 = this.calculateMA(prevDataUpToPoint, ma2Period);
                    
                    if (!prevMA1 || !prevMA2) {
                        conditionMet = false;
                        break;
                    }
                    
                    if (markerMADirection === 'cross-up') {
                        conditionMet = prevMA1 <= prevMA2 && ma1Val > ma2Val;
                    } else {
                        conditionMet = prevMA1 >= prevMA2 && ma1Val < ma2Val;
                    }
                }
                break;
                
            case 'ma-crossover-2':
                // Identical logic to ma-crossover for markers
                const ma1Period_2 = alarm.ma1;
                const ma2Period_2 = alarm.ma2;
                const maxMAPeriod_2 = Math.max(ma1Period_2, ma2Period_2);
                const markerMADirection_2 = alarm.maDirection || 'above';
                
                if (fullDataIndex < maxMAPeriod_2 - 1) {
                    conditionMet = false;
                    break;
                }
                
                const dataUpToPoint_2 = this.currentData.slice(0, fullDataIndex + 1);
                if (dataUpToPoint_2.length < maxMAPeriod_2) {
                    conditionMet = false;
                    break;
                }
                
                const ma1Val_2 = this.calculateMA(dataUpToPoint_2, ma1Period_2);
                const ma2Val_2 = this.calculateMA(dataUpToPoint_2, ma2Period_2);
                
                if (!ma1Val_2 || !ma2Val_2) {
                    conditionMet = false;
                    break;
                }
                
                if (markerMADirection_2 === 'above') {
                    conditionMet = ma1Val_2 > ma2Val_2;
                } else if (markerMADirection_2 === 'below') {
                    conditionMet = ma1Val_2 < ma2Val_2;
                } else if (markerMADirection_2 === 'cross-up' || markerMADirection_2 === 'cross-down') {
                    if (fullDataIndex < maxMAPeriod_2) {
                        conditionMet = false;
                        break;
                    }
                    
                    const prevDataUpToPoint_2 = this.currentData.slice(0, fullDataIndex);
                    const prevMA1_2 = this.calculateMA(prevDataUpToPoint_2, ma1Period_2);
                    const prevMA2_2 = this.calculateMA(prevDataUpToPoint_2, ma2Period_2);
                    
                    if (!prevMA1_2 || !prevMA2_2) {
                        conditionMet = false;
                        break;
                    }
                    
                    if (markerMADirection_2 === 'cross-up') {
                        conditionMet = prevMA1_2 <= prevMA2_2 && ma1Val_2 > ma2Val_2;
                    } else {
                        conditionMet = prevMA1_2 >= prevMA2_2 && ma1Val_2 < ma2Val_2;
                    }
                }
                break;
                
            case 'rsi-oversold':
                // Calculate RSI up to this data point
                const dataUpToPointRSIOversold = this.currentData.slice(0, fullDataIndex + 1);
                // Need enough data for RSI calculation
                if (dataUpToPointRSIOversold.length <= this.rsiPeriod) {
                    conditionMet = false;
                    break;
                }
                const rsiOversold = this.calculateRSI(dataUpToPointRSIOversold, this.rsiPeriod);
                conditionMet = rsiOversold !== null && rsiOversold <= alarm.value;
                if (conditionMet) {
                    console.log(`✅ RSI Oversold MATCH: Date=${dataPoint.date}, RSI=${rsiOversold.toFixed(2)}, Threshold≤${alarm.value}, Period=${this.rsiPeriod}, FullIndex=${fullDataIndex}`);
                } else if (rsiOversold !== null && Math.abs(rsiOversold - alarm.value) < 10) {
                    // Log near-misses to help debug
                    console.log(`❌ RSI Close but NO match: Date=${dataPoint.date}, RSI=${rsiOversold.toFixed(2)}, Threshold≤${alarm.value}`);
                }
                break;
                
            case 'rsi-overbought':
                // Calculate RSI up to this data point
                const dataUpToPointRSIOverbought = this.currentData.slice(0, fullDataIndex + 1);
                // Need enough data for RSI calculation
                if (dataUpToPointRSIOverbought.length <= this.rsiPeriod) {
                    conditionMet = false;
                    break;
                }
                const rsiOverbought = this.calculateRSI(dataUpToPointRSIOverbought, this.rsiPeriod);
                conditionMet = rsiOverbought !== null && rsiOverbought >= alarm.value;
                if (conditionMet) {
                    console.log(`RSI Overbought triggered: RSI=${rsiOverbought.toFixed(2)}, Threshold=${alarm.value}, Period=${this.rsiPeriod}, Date=${dataPoint.date}`);
                }
                break;
                
            case 'bb-lower':
                // Check if price touches or crosses below the lower Bollinger Band
                const bbPeriod = 20;
                if (fullDataIndex < bbPeriod - 1) {
                    conditionMet = false;
                    break;
                }
                const dataForBBLower = this.currentData.slice(0, fullDataIndex + 1);
                const bbLower = this.calculateBollingerBands(dataForBBLower, bbPeriod);
                if (bbLower) {
                    // Price touches or goes below lower band (using close or low price)
                    conditionMet = dataPoint.close <= bbLower.lower || dataPoint.low <= bbLower.lower;
                }
                break;
                
            case 'bb-upper':
                // Check if price touches or crosses above the upper Bollinger Band
                const bbPeriodUpper = 20;
                if (fullDataIndex < bbPeriodUpper - 1) {
                    conditionMet = false;
                    break;
                }
                const dataForBBUpper = this.currentData.slice(0, fullDataIndex + 1);
                const bbUpper = this.calculateBollingerBands(dataForBBUpper, bbPeriodUpper);
                if (bbUpper) {
                    // Price touches or goes above upper band (using close or high price)
                    conditionMet = dataPoint.close >= bbUpper.upper || dataPoint.high >= bbUpper.upper;
                }
                break;
        }
        
        return conditionMet;
    }

    updateTradingConditionsList() {
        const buyList = document.getElementById('buyConditionsList');
        
        const buyingSignals = ['below', 'nweek-low', 'ma-crossover', 'daily-loss'];
        
        const activeAlarmTypes = Object.keys(this.activeAlarms);
        const activeBuyingAlarms = activeAlarmTypes.filter(type => buyingSignals.includes(type));
        
        if (activeBuyingAlarms.length === 0) {
            buyList.innerHTML = '<div class="empty-state">👆 Activate buying signals above (left column)</div>';
        } else {
            buyList.innerHTML = activeBuyingAlarms.map(type => {
                const alarm = this.activeAlarms[type];
                const isSelected = this.buyConditions.includes(type);
                const icon = this.getAlarmIcon(type);
                const text = this.getAlarmText(type, alarm.value, alarm.direction, alarm.ma1, alarm.ma2, alarm.maDirection);
                
                return `
                    <div class="condition-item ${isSelected ? 'selected' : ''}" data-condition-type="${type}">
                        <div class="condition-item-content">
                            <input type="checkbox" class="condition-checkbox" 
                                   ${isSelected ? 'checked' : ''} 
                                   onchange="window.viewer.toggleBuyCondition('${type}')">
                            <span class="condition-icon">${icon}</span>
                            <span class="condition-text">${text}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    getAlarmIcon(type) {
        const icons = {
            'above': '📈',
            'below': '📉',
            'nweek-low': '⬇️',
            'nweek-high': '⬆️',
            'daily-change': '💰',
            'daily-gain': '📈',
            'daily-loss': '📉',
            'ma-crossover': '📊',
            'ma-crossover-2': '📊'
        };
        return icons[type] || '🔔';
    }

    getAlarmText(type, value, direction = null, ma1 = null, ma2 = null, maDirection = null) {
        if (type === 'daily-gain') {
            return `Daily Gain ≥ +${value.toFixed(1)}%`;
        }
        
        if (type === 'daily-loss') {
            return `Daily Loss ≥ ${value.toFixed(1)}%`;
        }
        
        if (type === 'daily-change') {
            const dir = direction || 'both';
            if (dir === 'up') {
                return `Daily Gain ≥ +${value.toFixed(1)}%`;
            } else if (dir === 'down') {
                return `Daily Loss ≤ -${value.toFixed(1)}%`;
            } else {
                return `Daily Change ≥ ±${value.toFixed(1)}%`;
            }
        }
        
        if (type === 'ma-crossover') {
            const dir = maDirection || 'above';
            const directionTexts = {
                'above': 'Above',
                'below': 'Below',
                'cross-up': 'Crosses Up',
                'cross-down': 'Crosses Down'
            };
            return `MA-${ma1} ${directionTexts[dir]} MA-${ma2} [Set 1]`;
        }
        
        if (type === 'ma-crossover-2') {
            const dir = maDirection || 'above';
            const directionTexts = {
                'above': 'Above',
                'below': 'Below',
                'cross-up': 'Crosses Up',
                'cross-down': 'Crosses Down'
            };
            return `MA-${ma1} ${directionTexts[dir]} MA-${ma2} [Set 2]`;
        }
        
        const texts = {
            'above': `Price Above $${value.toFixed(2)}`,
            'below': `Price Below $${value.toFixed(2)}`,
            'nweek-low': `${value}-Week Low`,
            'nweek-high': `${value}-Week High`
        };
        return texts[type] || 'Unknown';
    }

    toggleBuyCondition(type) {
        const index = this.buyConditions.indexOf(type);
        if (index > -1) {
            this.buyConditions.splice(index, 1);
            log(`Removed ${type} from buy conditions`);
        } else {
            this.buyConditions.push(type);
            log(`Added ${type} to buy conditions`);
        }
        
        this.updateTradingConditionsList();
        log(`Buy conditions: ${this.buyConditions.join(', ')}`);
    }

    toggleConditionFromAlarm(type, actionType) {
        // Check if alarm is active
        const card = document.querySelector(`[data-alarm-type="${type}"]`);
        if (!card || !card.classList.contains('active')) {
            log(`Cannot set ${actionType} condition: alarm ${type} is not active`);
            return;
        }

        // Find the button
        const button = card.querySelector(`.alarm-action-btn.${actionType}`);
        if (!button) return;

        // Toggle the condition
        if (actionType === 'buy') {
            const index = this.buyConditions.indexOf(type);
            if (index > -1) {
                this.buyConditions.splice(index, 1);
                button.classList.remove('active');
                log(`Removed ${type} from buy conditions`);
            } else {
                this.buyConditions.push(type);
                button.classList.add('active');
                log(`Added ${type} to buy conditions`);
            }
            log(`Buy conditions: ${this.buyConditions.join(', ')}`);
        } 
        // Commented out sell condition logic for simplified buy & hold strategy
        /*
        else if (actionType === 'sell') {
            const index = this.sellConditions.indexOf(type);
            if (index > -1) {
                this.sellConditions.splice(index, 1);
                button.classList.remove('active');
                log(`Removed ${type} from sell conditions`);
            } else {
                this.sellConditions.push(type);
                button.classList.add('active');
                log(`Added ${type} to sell conditions`);
            }
            log(`Sell conditions: ${this.sellConditions.join(', ')}`);
        }
        */

        // Update the trading conditions list
        this.updateTradingConditionsList();
    }

    updateSelectedAlertsList() {
        const listContainer = document.getElementById('selectedAlertsList');
        if (!listContainer) return;

        const activeAlarmTypes = Object.keys(this.activeAlarms);
        
        if (activeAlarmTypes.length === 0) {
            listContainer.innerHTML = '<span class="empty-alerts-message">No alarms selected for notifications</span>';
            return;
        }

        listContainer.innerHTML = '';
        activeAlarmTypes.forEach(type => {
            const tag = document.createElement('span');
            tag.className = 'alert-tag active';
            const alarm = this.activeAlarms[type];
            tag.innerHTML = `${this.getAlarmIcon(type)} ${this.getAlarmText(type, alarm.value, alarm.direction, alarm.ma1, alarm.ma2, alarm.maDirection)}`;
            listContainer.appendChild(tag);
        });
    }

    subscribeToNotifications() {
        const emailInput = document.getElementById('emailInput');
        const email = emailInput.value.trim();
        
        if (!email) {
            alert('⚠️ Please enter an email address');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('⚠️ Please enter a valid email address');
            return;
        }

        const activeAlarmTypes = Object.keys(this.activeAlarms);
        if (activeAlarmTypes.length === 0) {
            alert('⚠️ Please activate at least one alarm before subscribing');
            return;
        }

        // Simulate subscription (this is a fake button)
        const alarmNames = activeAlarmTypes.map(type => {
            const alarm = this.activeAlarms[type];
            return this.getAlarmText(type, alarm.value, alarm.direction, alarm.ma1, alarm.ma2, alarm.maDirection);
        }).join(', ');

        alert(`✅ Success!\n\nEmail notifications will be sent to:\n${email}\n\nFor the following alerts:\n${alarmNames}\n\n(This is a demo - no actual emails will be sent)`);
        
        log(`Subscribed to notifications: ${email} for alarms: ${activeAlarmTypes.join(', ')}`);
    }
}

// Initialize the viewer when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.viewer = new StockViewer();
});
