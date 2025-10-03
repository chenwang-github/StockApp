/* =================================
   STOCK DASHBOARD - COMPLETE JAVASCRIPT APPLICATION
   =================================
   Trading strategy testing dashboard with Chart.js integration
   ================================= */

// Debug logging
function log(message) {
    console.log(message);
}

class StockDashboard {
    constructor() {
        this.chart = null;
        this.currentData = null;
        this.availableStocks = [];
        this.testHistory = JSON.parse(localStorage.getItem('strategyTestHistory')) || [];
        log('Dashboard initializing...');
        this.init();
    }

    async init() {
        try {
            log('Setting up chart...');
            await this.setupChart();
            
            log('Setting up event listeners...');
            this.setupEventListeners();
            
            log('Loading initial data...');
            await this.loadData();
            
            log('Updating history display...');
            this.updateHistoryDisplay();
            
            log('Dashboard ready!');
            
            // Load stocks in background (non-blocking)
            log('Loading available stocks in background...');
            this.loadAvailableStocks().catch(error => {
                log('Background stock loading failed: ' + error.message);
            });
        } catch (error) {
            log('Error during initialization: ' + error.message);
            this.showError('Initialization failed: ' + error.message);
        }
    }

    async setupChart() {
        return new Promise((resolve) => {
            const canvas = document.getElementById('stockChart');
            if (!canvas) {
                throw new Error('Canvas element not found');
            }

            const ctx = canvas.getContext('2d');
            
            // Register zoom plugin
            if (window.zoomPlugin) {
                Chart.register(window.zoomPlugin);
            } else if (window.ChartZoom) {
                Chart.register(window.ChartZoom);
            }

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
                            order: 1
                        },
                        {
                            label: 'Buy Transactions',
                            data: [],
                            borderColor: '#28a745',
                            backgroundColor: '#28a745',
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            showLine: false,
                            pointStyle: 'circle',
                            order: 0
                        },
                        {
                            label: 'Sell Transactions',
                            data: [],
                            borderColor: '#dc3545',
                            backgroundColor: '#dc3545',
                            pointRadius: 8,
                            pointHoverRadius: 10,
                            showLine: false,
                            pointStyle: 'circle',
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
                        y: { grid: { color: 'rgba(0,0,0,0.1)' } }
                    },
                    plugins: {
                        legend: { display: false },
                        zoom: {
                            pan: {
                                enabled: true,
                                mode: 'x',
                                onPanComplete: (context) => {
                                    if (window.dashboard) {
                                        window.dashboard.updateSliderFromChart(context.chart);
                                        window.dashboard.updateMetrics();
                                    }
                                }
                            },
                            zoom: { wheel: { enabled: false }, mode: 'x' }
                        }
                    }
                }
            });

            this.addManualDragSupport(canvas);
            log('Chart created successfully');
            resolve();
        });
    }

    async loadAvailableStocks() {
        // Start with fallback stocks immediately
        const majorStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'NFLX', 'JPM', 'BAC', 'WMT', 'XOM', 'JNJ', 'PG', 'KO', 'DIS', 'V', 'MA', 'UNH'];
        let allStocks = new Set(majorStocks);
        
        // Set fallback stocks immediately
        this.availableStocks = Array.from(allStocks).sort();
        this.populateStockDropdown();
        log(`Using ${this.availableStocks.length} fallback stocks`);
        
        try {
            const exchanges = ['forbes2000', 'nasdaq', 'nyse', 'sp500'];
            
            // Load with timeouts and parallel requests
            const loadPromises = exchanges.map(exchange => {
                return Promise.race([
                    fetch(`/data/stock_market_data/${exchange}/csv/`)
                        .then(response => {
                            if (response.ok) {
                                return response.text().then(text => {
                                    const csvFiles = text.match(/href="([A-Z][A-Z0-9-._]*\.csv)"/gi);
                                    if (csvFiles) {
                                        csvFiles.forEach(match => {
                                            const filename = match.match(/href="([^"]+)"/)[1];
                                            const symbol = filename.replace('.csv', '');
                                            allStocks.add(symbol);
                                        });
                                        log(`Loaded stocks from ${exchange}`);
                                    }
                                });
                            }
                        }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 2000)
                    )
                ]).catch(error => {
                    log(`Could not load stocks from ${exchange}: ${error.message}`);
                });
            });
            
            // Wait for all requests to complete or timeout
            await Promise.allSettled(loadPromises);
            
            // Update with any additional stocks found
            if (allStocks.size > majorStocks.length) {
                this.availableStocks = Array.from(allStocks).sort();
                this.populateStockDropdown();
                log(`Updated to ${this.availableStocks.length} total stocks`);
            }
        } catch (error) {
            log(`Stock loading error: ${error.message}`);
        }
    }

    populateStockDropdown() {
        this.companyNames = {
            'AAPL': 'Apple Inc.',
            'MSFT': 'Microsoft Corp.',
            'GOOGL': 'Alphabet Inc.',
            'AMZN': 'Amazon.com Inc.',
            'TSLA': 'Tesla Inc.',
            'META': 'Meta Platforms Inc.',
            'NVDA': 'NVIDIA Corp.',
            'AMD': 'Advanced Micro Devices',
            'NFLX': 'Netflix Inc.',
            'JPM': 'JPMorgan Chase & Co.',
            'BAC': 'Bank of America Corp.',
            'WMT': 'Walmart Inc.',
            'XOM': 'Exxon Mobil Corp.',
            'JNJ': 'Johnson & Johnson',
            'PG': 'Procter & Gamble Co.',
            'KO': 'The Coca-Cola Company',
            'DIS': 'The Walt Disney Company',
            'V': 'Visa Inc.',
            'MA': 'Mastercard Inc.',
            'UNH': 'UnitedHealth Group Inc.'
        };
        
        const stockSearch = document.getElementById('stockSearch');
        if (this.availableStocks.includes('AAPL')) {
            stockSearch.value = 'AAPL';
            this.selectedStock = 'AAPL';
        } else if (this.availableStocks.length > 0) {
            stockSearch.value = this.availableStocks[0];
            this.selectedStock = this.availableStocks[0];
        }
    }

    setupStockSearch() {
        const stockSearch = document.getElementById('stockSearch');
        const dropdown = document.getElementById('stockDropdown');
        
        stockSearch.addEventListener('input', (e) => {
            this.filterStocks(e.target.value.toLowerCase());
        });
        
        stockSearch.addEventListener('focus', () => {
            this.filterStocks(stockSearch.value.toLowerCase());
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.stock-search-container')) {
                dropdown.classList.remove('show');
            }
        });
    }

    filterStocks(query) {
        console.log('filterStocks called with query:', query);
        console.log('Available stocks:', this.availableStocks.length);
        
        const dropdown = document.getElementById('stockDropdown');
        dropdown.innerHTML = '';
        
        if (!query) {
            dropdown.classList.remove('show');
            return;
        }
        
        const filteredStocks = this.availableStocks.filter(symbol => {
            const companyName = this.companyNames[symbol] || '';
            return symbol.toLowerCase().includes(query) || companyName.toLowerCase().includes(query);
        }).slice(0, 10);
        
        console.log('Filtered stocks:', filteredStocks);
        
        if (filteredStocks.length === 0) {
            dropdown.innerHTML = '<div class="stock-option">No stocks found</div>';
        } else {
            filteredStocks.forEach(symbol => {
                const option = document.createElement('div');
                option.className = 'stock-option';
                const companyName = this.companyNames[symbol] || '';
                option.innerHTML = `<span class="stock-symbol">${symbol}</span><span class="stock-name">${companyName}</span>`;
                option.addEventListener('click', () => this.selectStock(symbol));
                dropdown.appendChild(option);
            });
        }
        
        dropdown.classList.add('show');
        console.log('Dropdown should now be visible');
    }

    selectStock(symbol) {
        const stockSearch = document.getElementById('stockSearch');
        const dropdown = document.getElementById('stockDropdown');
        
        stockSearch.value = symbol;
        this.selectedStock = symbol;
        dropdown.classList.remove('show');
        
        log(`Stock selected: ${symbol}`);
        this.loadData();
    }

    getCurrentStock() {
        return this.selectedStock || this.availableStocks[0] || 'AAPL';
    }

    setupEventListeners() {
        this.setupStockSearch();

        document.getElementById('timeRange').addEventListener('change', () => {
            this.loadData();
        });

        document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateChart();
            });
        });

        const timeSlider = document.getElementById('timeSlider');
        timeSlider.addEventListener('input', (e) => {
            this.handleTimeSlider(e.target.value);
        });
    }

    handleTimeSlider(value) {
        if (!this.currentData?.data) return;
        
        const data = this.currentData.data;
        const totalDataPoints = data.length;
        const viewportSize = Math.min(this.selectedWindowDays || 365, totalDataPoints);
        const maxStartIndex = Math.max(0, totalDataPoints - viewportSize);
        const startIndex = Math.floor((value / 100) * maxStartIndex);
        const endIndex = Math.min(startIndex + viewportSize, totalDataPoints);
        const windowData = data.slice(startIndex, endIndex);
        
        if (windowData.length > 0) {
            const startTime = new Date(windowData[0].date);
            const endTime = new Date(windowData[windowData.length - 1].date);
            
            if (this.chart) {
                this.chart.options.scales.x.min = startTime;
                this.chart.options.scales.x.max = endTime;
                this.chart.update('none');
            }
            
            const currentViewRange = document.getElementById('currentViewRange');
            if (currentViewRange) {
                currentViewRange.textContent = `${startTime.toISOString().split('T')[0]} to ${endTime.toISOString().split('T')[0]}`;
            }
            
            this.updateMetricsForWindow(windowData);
        }
    }

    async loadData() {
        try {
            const symbol = this.getCurrentStock();
            const days = parseInt(document.getElementById('timeRange').value);
            
            document.getElementById('metrics').innerHTML = '<div class="loading">Loading...</div>';
            
            const csvData = await this.loadCSVData(symbol);
            
            if (csvData && csvData.length > 0) {
                const allData = csvData.sort((a, b) => a.date - b.date);
                this.currentData = {
                    symbol: symbol,
                    data: allData,
                    startPrice: allData[0].price
                };
                this.selectedWindowDays = days;
            } else {
                this.currentData = this.generateStockData(symbol, days);
                this.selectedWindowDays = days;
            }
            
            this.timeSliderInitialized = false;
            this.updateChart();
            this.updateTimeSlider();
            
        } catch (error) {
            this.showError('Failed to load data: ' + error.message);
        }
    }

    async loadCSVData(symbol) {
        const exchanges = ['forbes2000', 'nasdaq', 'nyse', 'sp500'];
        
        for (const exchange of exchanges) {
            try {
                const response = await fetch(`/data/stock_market_data/${exchange}/csv/${symbol}.csv`);
                if (response.ok) {
                    const csvText = await response.text();
                    const parsedData = this.parseCSV(csvText, symbol);
                    if (parsedData.length > 0) {
                        return parsedData;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        return null;
    }

    parseCSV(csvText, symbol) {
        try {
            const lines = csvText.split('\n');
            const data = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const columns = line.split(',');
                if (columns.length >= 7) {
                    const dateStr = columns[0];
                    const close = parseFloat(columns[5]);
                    
                    if (!isNaN(close) && dateStr) {
                        const dateParts = dateStr.split('-');
                        if (dateParts.length === 3) {
                            const day = parseInt(dateParts[0]);
                            const month = parseInt(dateParts[1]) - 1;
                            const year = parseInt(dateParts[2]);
                            const date = new Date(year, month, day);
                            
                            if (!isNaN(date.getTime())) {
                                data.push({ date: date, price: close, originalPrice: close });
                            }
                        }
                    }
                }
            }
            
            return data.sort((a, b) => a.date - b.date);
        } catch (error) {
            return [];
        }
    }

    generateStockData(symbol, days) {
        const data = [];
        const now = new Date();
        let price = 100;

        for (let i = days; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);

            if (date.getDay() !== 0 && date.getDay() !== 6) {
                const random = (Math.random() - 0.5) * 0.02;
                price = Math.max(price * (1 + random), 1);
                data.push({ date: new Date(date), price: price, originalPrice: price });
            }
        }

        return { symbol, data, startPrice: data[0]?.price || 100 };
    }

    updateChart() {
        if (!this.chart || !this.currentData) return;

        const displayMode = document.querySelector('input[name="displayMode"]:checked').value;
        const data = this.currentData.data;
        let chartData;

        if (displayMode === 'percentage') {
            const basePrice = data[0].price;
            chartData = data.map((d, index) => ({
                x: d.date,
                y: index === 0 ? 0 : ((d.price - basePrice) / basePrice) * 100
            }));
            this.chart.options.scales.y.ticks = {
                callback: function(value) { return value.toFixed(1) + '%'; }
            };
        } else {
            chartData = data.map(d => ({ x: d.date, y: d.price }));
            this.chart.options.scales.y.ticks = {
                callback: function(value) { return '$' + value.toFixed(2); }
            };
        }

        this.chart.data.datasets[0].data = chartData;
        
        if (!this.timeSliderInitialized) {
            this.chart.resetZoom();
            this.timeSliderInitialized = true;
        }
        
        this.chart.update('none');
        this.updateMetrics();
    }

    updateTimeSlider() {
        if (!this.currentData?.data) return;
        
        const slider = document.getElementById('timeSlider');
        slider.value = 100;
        
        const data = this.currentData.data;
        const timeRange = parseInt(document.getElementById('timeRange').value);
        const viewportSize = Math.min(timeRange, data.length);
        const startIndex = Math.max(0, data.length - viewportSize);
        const windowData = data.slice(startIndex);
        
        document.getElementById('startTime').textContent = data[0].date.toLocaleDateString();
        document.getElementById('endTime').textContent = data[data.length - 1].date.toLocaleDateString();
        
        if (this.chart && windowData.length > 0) {
            const windowStartTime = new Date(windowData[0].date);
            const windowEndTime = new Date(windowData[windowData.length - 1].date);
            this.chart.options.scales.x.min = windowStartTime;
            this.chart.options.scales.x.max = windowEndTime;
            this.chart.update('none');
            
            const currentViewRange = document.getElementById('currentViewRange');
            if (currentViewRange) {
                currentViewRange.textContent = `${windowStartTime.toISOString().split('T')[0]} to ${windowEndTime.toISOString().split('T')[0]}`;
            }
        }
        
        this.updateMetricsForWindow(windowData);
    }

    updateMetrics() {
        if (!this.currentData) return;
        const visibleData = this.getVisibleChartData();
        this.updateMetricsForWindow(visibleData);
    }

    getVisibleChartData() {
        if (!this.chart?.scales.x) return this.currentData.data;
        
        const xScale = this.chart.scales.x;
        const visibleMin = xScale.min;
        const visibleMax = xScale.max;
        
        const visibleData = this.currentData.data.filter(point => {
            const pointTime = new Date(point.date).getTime();
            return pointTime >= visibleMin && pointTime <= visibleMax;
        });
        
        return visibleData.length > 0 ? visibleData : this.currentData.data;
    }

    updateMetricsForWindow(windowData) {
        if (!windowData?.length) return;

        const current = windowData[windowData.length - 1].price;
        const start = windowData[0].price;
        const change = current - start;
        const changePercent = (change / start * 100);
        const high = Math.max(...windowData.map(d => d.price));
        const low = Math.min(...windowData.map(d => d.price));

        const changeClass = change >= 0 ? 'positive' : 'negative';
        const changeSign = change >= 0 ? '+' : '';

        document.getElementById('metrics').innerHTML = `
            <div class="metric-card">
                <div class="metric-label">Current Price</div>
                <div class="metric-value">$${current.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Change</div>
                <div class="metric-value ${changeClass}">$${changeSign}${change.toFixed(2)}</div>
                <div class="metric-change ${changeClass}">${changeSign}${changePercent.toFixed(2)}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">High</div>
                <div class="metric-value">$${high.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Low</div>
                <div class="metric-value">$${low.toFixed(2)}</div>
            </div>
        `;
    }

    addManualDragSupport(canvas) {
        let isDragging = false;
        let lastX = 0;
        let startSliderValue = 0;
        
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            startSliderValue = parseFloat(document.getElementById('timeSlider').value);
            canvas.style.cursor = 'grabbing';
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - lastX;
            const sensitivity = 0.02;
            const newValue = startSliderValue - (deltaX * sensitivity);
            const clampedValue = Math.max(0, Math.min(100, newValue));
            
            document.getElementById('timeSlider').value = clampedValue;
            this.handleTimeSlider(clampedValue);
        });
        
        canvas.addEventListener('mouseup', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
        });
        
        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
        });
        
        canvas.style.cursor = 'grab';
    }

    updateSliderFromChart(chart) {
        // Simplified implementation for chart-to-slider sync
        if (!this.currentData?.data) return;
        
        const xAxis = chart.scales.x;
        const visibleStartTime = xAxis.min;
        
        let startIndex = 0;
        for (let i = 0; i < this.currentData.data.length; i++) {
            if (this.currentData.data[i].date >= visibleStartTime) {
                startIndex = i;
                break;
            }
        }
        
        const sliderValue = (startIndex / this.currentData.data.length) * 100;
        document.getElementById('timeSlider').value = Math.min(100, Math.max(0, sliderValue));
    }

    // Trading Strategy Methods
    clearStrategy() {
        const buyPlaceholder = document.getElementById('buyConditionPlaceholder');
        const buySelect = document.getElementById('buyCondition1');
        const sellPlaceholder = document.getElementById('sellConditionPlaceholder');
        const sellSelect = document.getElementById('sellCondition1');
        
        if (buyPlaceholder) {
            buyPlaceholder.innerHTML = 'Buy Condition 1';
            buyPlaceholder.className = 'condition-placeholder';
            buyPlaceholder.onclick = () => this.showBuyConditionMenu();
            buyPlaceholder.style.display = 'block';
        }
        
        if (buySelect) {
            buySelect.style.display = 'none';
            buySelect.value = '';
        }
        
        if (sellPlaceholder) {
            sellPlaceholder.innerHTML = 'Sell Condition 1';
            sellPlaceholder.className = 'condition-placeholder';
            sellPlaceholder.onclick = () => this.showSellConditionMenu();
            sellPlaceholder.style.display = 'block';
        }
        
        if (sellSelect) {
            sellSelect.style.display = 'none';
            sellSelect.value = '';
        }
        
        this.selectedBuyCondition = null;
        this.selectedSellCondition = null;
        
        const resultsElement = document.getElementById('strategyResults');
        if (resultsElement) {
            resultsElement.style.display = 'none';
        }
    }

    testStrategy() {
        if (!this.currentData?.data?.length) {
            alert('Please load stock data first!');
            return;
        }

        const startYear = parseInt(document.getElementById('strategyStartYear').value);
        const endYear = parseInt(document.getElementById('strategyEndYear').value);

        if (startYear >= endYear) {
            alert('Start year must be less than end year!');
            return;
        }

        if (!this.selectedBuyCondition || !this.selectedSellCondition) {
            alert('Please select both buy and sell conditions first!');
            return;
        }

        const filteredData = this.filterDataByYearRange(this.currentData.data, startYear, endYear);
        
        if (filteredData.length === 0) {
            alert(`No data available for ${startYear}-${endYear}!`);
            return;
        }

        const results = this.runSelectedStrategy(filteredData);
        
        // Save to history
        this.saveTestToHistory(results, startYear, endYear);
        
        this.displayStrategyResults(results);
        this.addTradeMarkersToChart(results);
        this.updateHistoryDisplay();
    }

    filterDataByYearRange(data, startYear, endYear) {
        if (!data?.length) return [];
        
        const startDate = new Date(startYear, 0, 1);
        const endDate = new Date(endYear, 11, 31);
        
        return data.filter(d => {
            if (!d?.date) return false;
            const pointDate = new Date(d.date);
            return pointDate >= startDate && pointDate <= endDate;
        });
    }

    runSelectedStrategy(data) {
        let totalInvested = 0;
        let shares = 0;
        let trades = [];
        const investmentAmount = 100;

        data.forEach((point, index) => {
            if (this.shouldBuy(point, index, data)) {
                const price = point.price;
                const sharesBought = investmentAmount / price;
                
                shares += sharesBought;
                totalInvested += investmentAmount;
                
                trades.push({
                    date: new Date(point.date),
                    type: 'buy',
                    price: price,
                    amount: investmentAmount,
                    shares: sharesBought
                });
            }
        });

        if (shares > 0) {
            const finalPrice = data[data.length - 1].price;
            const finalValue = shares * finalPrice;
            
            trades.push({
                date: new Date(data[data.length - 1].date),
                type: 'sell',
                price: finalPrice,
                amount: finalValue,
                shares: shares
            });
        }

        const finalValue = trades.length > 0 ? trades[trades.length - 1].amount : 0;
        const totalReturn = totalInvested > 0 ? ((finalValue - totalInvested) / totalInvested) * 100 : 0;

        return {
            totalInvested,
            finalValue,
            totalReturn,
            totalTrades: trades.length,
            buyTrades: trades.filter(t => t.type === 'buy').length,
            sellTrades: trades.filter(t => t.type === 'sell').length,
            profit: finalValue - totalInvested,
            strategy: `${this.getBuyConditionText()} + ${this.getSellConditionText()}`,
            buyMarkers: trades.filter(t => t.type === 'buy').map(t => ({ x: t.date, y: t.price })),
            sellMarkers: trades.filter(t => t.type === 'sell').map(t => ({ x: t.date, y: t.price }))
        };
    }

    // Helper function to check if current price is at N-week low
    isAtWeekLow(currentIndex, data, weeks) {
        // Need sufficient data points to look back
        const minDataPoints = weeks * 2; // Reduced minimum requirement
        if (currentIndex < minDataPoints) return false;
        
        const currentPoint = data[currentIndex];
        const currentPrice = currentPoint.close || currentPoint.price || currentPoint.y;
        
        if (currentPrice === undefined) {
            console.log("Warning: Could not determine current price from data point", currentPoint);
            return false;
        }
        
        // Look back N weeks of data points
        // Use actual data points rather than calendar days since data might be sparse
        const lookbackPoints = Math.min(weeks * 5, currentIndex); // Approximately 5 trading days per week
        const startIndex = currentIndex - lookbackPoints;
        
        // Find the actual lowest price in the lookback period (excluding current day)
        let lowestPrice = Infinity;
        
        // Check all previous prices in the lookback period
        for (let i = startIndex; i < currentIndex; i++) { // Note: < currentIndex, not <=
            const point = data[i];
            const price = point.close || point.price || point.y;
            if (price !== undefined && price < lowestPrice) {
                lowestPrice = price;
            }
        }
        
        if (lowestPrice === Infinity) {
            return false; // No valid price data found
        }
        
        // Current price should be lower than or equal to the previous lowest
        // This means we're at a new low or matching the previous low
        // Add small tolerance for floating point comparison
        const tolerance = 0.01; // 1 cent tolerance
        const isAtLow = currentPrice <= (lowestPrice + tolerance);
        
        // Add some debug logging for testing
        if (isAtLow && weeks === 4) {
            console.log(`4-week low detected at index ${currentIndex}: current=${currentPrice.toFixed(2)}, previous lowest=${lowestPrice.toFixed(2)}, lookback=${lookbackPoints} points`);
        }
        
        return isAtLow;
    }

    shouldBuy(point, index, data) {
        const date = new Date(point.date);
        
        switch (this.selectedBuyCondition) {
            case 'monday_buy':
                return date.getDay() === 1;
            case 'biweekly_buy':
                const day = date.getDate();
                return day === 1 || day === 15;
            case 'monthly_buy':
                return date.getDate() === 1;
            case 'bimonthly_buy':
                return date.getDate() === 1 && date.getMonth() % 2 === 0;
            case 'quarterly_buy':
                return date.getDate() === 1 && date.getMonth() % 3 === 0;
            case '2week_low':
                return this.isAtWeekLow(index, data, 2);
            case '4week_low':
                return this.isAtWeekLow(index, data, 4);
            case '8week_low':
                return this.isAtWeekLow(index, data, 8);
            case '12week_low':
                return this.isAtWeekLow(index, data, 12);
            default:
                return false;
        }
    }

    getBuyConditionText() {
        const select = document.getElementById('buyCondition1');
        return select.options[select.selectedIndex]?.text || 'Unknown Buy Condition';
    }

    getSellConditionText() {
        const select = document.getElementById('sellCondition1');
        return select.options[select.selectedIndex]?.text || 'Unknown Sell Condition';
    }

    displayStrategyResults(results) {
        const resultsDiv = document.getElementById('strategyResults');
        const contentDiv = document.getElementById('resultsContent');

        contentDiv.innerHTML = `
            <div class="strategy-info">
                <h3>📈 ${results.strategy}</h3>
            </div>
            
            <div class="results-grid">
                <div class="result-card">
                    <div class="result-label">💰 Total Invested</div>
                    <div class="result-value">$${results.totalInvested.toFixed(2)}</div>
                </div>
                <div class="result-card">
                    <div class="result-label">🎯 Final Value</div>
                    <div class="result-value">$${results.finalValue.toFixed(2)}</div>
                </div>
                <div class="result-card">
                    <div class="result-label">📊 Total Return</div>
                    <div class="result-value ${results.totalReturn >= 0 ? 'positive' : 'negative'}">${results.totalReturn.toFixed(2)}%</div>
                </div>
                <div class="result-card">
                    <div class="result-label">💵 Profit/Loss</div>
                    <div class="result-value ${results.profit >= 0 ? 'positive' : 'negative'}">$${results.profit.toFixed(2)}</div>
                </div>
                <div class="result-card">
                    <div class="result-label">🟢 Buy Trades</div>
                    <div class="result-value">${results.buyTrades}</div>
                </div>
                <div class="result-card">
                    <div class="result-label">🔴 Sell Trades</div>
                    <div class="result-value">${results.sellTrades}</div>
                </div>
            </div>
        `;

        resultsDiv.style.display = 'block';
        setTimeout(() => {
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

    addTradeMarkersToChart(results) {
        if (this.chart && results.buyMarkers && results.sellMarkers) {
            this.chart.data.datasets[1].data = results.buyMarkers;
            this.chart.data.datasets[2].data = results.sellMarkers;
            this.chart.update();
        }
    }

    showBuyConditionMenu() {
        const placeholder = document.getElementById('buyConditionPlaceholder');
        const select = document.getElementById('buyCondition1');
        
        if (!placeholder || !select) return;
        
        placeholder.style.display = 'none';
        select.style.display = 'block';
        select.focus();
        
        select.onchange = () => {
            if (select.value) {
                const selectedText = select.options[select.selectedIndex].text;
                placeholder.innerHTML = selectedText;
                placeholder.className = 'condition-active';
                placeholder.onclick = () => this.showBuyConditionMenu();
                select.style.display = 'none';
                placeholder.style.display = 'block';
                this.selectedBuyCondition = select.value;
            }
        };
        
        select.onblur = () => {
            if (!select.value) {
                select.style.display = 'none';
                placeholder.style.display = 'block';
            }
        };
    }

    showSellConditionMenu() {
        const placeholder = document.getElementById('sellConditionPlaceholder');
        const select = document.getElementById('sellCondition1');
        
        if (!placeholder || !select) return;
        
        placeholder.style.display = 'none';
        select.style.display = 'block';
        select.focus();
        
        select.onchange = () => {
            if (select.value) {
                const selectedText = select.options[select.selectedIndex].text;
                placeholder.innerHTML = selectedText;
                placeholder.className = 'condition-active-sell';
                placeholder.onclick = () => this.showSellConditionMenu();
                select.style.display = 'none';
                placeholder.style.display = 'block';
                this.selectedSellCondition = select.value;
            }
        };
        
        select.onblur = () => {
            if (!select.value) {
                select.style.display = 'none';
                placeholder.style.display = 'block';
            }
        };
    }

    showError(message) {
        document.getElementById('metrics').innerHTML = `<div class="error">${message}</div>`;
        log('Error shown: ' + message);
    }

    // Strategy History Methods
    saveTestToHistory(results, startYear, endYear) {
        const historyEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            stock: this.getCurrentStock(),
            strategy: results.strategy,
            buyCondition: this.selectedBuyCondition,
            sellCondition: this.selectedSellCondition,
            timeRange: `${startYear}-${endYear}`,
            totalInvested: results.totalInvested,
            finalValue: results.finalValue,
            totalReturn: results.totalReturn,
            profit: results.profit,
            buyTrades: results.buyTrades,
            sellTrades: results.sellTrades
        };

        this.testHistory.unshift(historyEntry); // Add to beginning
        
        // Keep only last 50 tests
        if (this.testHistory.length > 50) {
            this.testHistory = this.testHistory.slice(0, 50);
        }

        // Save to localStorage
        localStorage.setItem('strategyTestHistory', JSON.stringify(this.testHistory));
    }

    updateHistoryDisplay() {
        const historyContainer = document.getElementById('historyTable');
        
        if (this.testHistory.length === 0) {
            historyContainer.innerHTML = `
                <div class="history-empty">
                    <div class="history-empty-icon">📊</div>
                    <p>No strategy tests yet</p>
                    <p>Run a strategy test above to see results here</p>
                </div>
            `;
            return;
        }

        // Calculate statistics
        const totalTests = this.testHistory.length;
        const profitableTests = this.testHistory.filter(test => test.totalReturn > 0).length;
        const avgReturn = this.testHistory.reduce((sum, test) => sum + test.totalReturn, 0) / totalTests;
        const bestTest = this.testHistory.reduce((best, current) => 
            current.totalReturn > best.totalReturn ? current : best
        );

        let tableHTML = `
            <div class="history-stats">
                <h4>📈 History Summary</h4>
                <p><strong>Total Tests:</strong> ${totalTests} | <strong>Profitable:</strong> ${profitableTests} (${((profitableTests/totalTests)*100).toFixed(1)}%)</p>
                <p><strong>Average Return:</strong> ${avgReturn.toFixed(2)}% | <strong>Best Strategy:</strong> ${bestTest.strategy} (${bestTest.totalReturn.toFixed(2)}%)</p>
            </div>
            
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>Stock</th>
                        <th>Strategy</th>
                        <th>Time Range</th>
                        <th>Total Return</th>
                        <th>Profit/Loss</th>
                        <th>Buy Trades</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.testHistory.forEach((test, index) => {
            const date = new Date(test.timestamp);
            const formattedDate = date.toLocaleDateString();
            const formattedTime = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            tableHTML += `
                <tr>
                    <td class="test-timestamp">${formattedDate}<br/>${formattedTime}</td>
                    <td><span class="stock-symbol">${test.stock}</span></td>
                    <td class="strategy-name">${test.strategy}</td>
                    <td>${test.timeRange}</td>
                    <td class="metric-value ${test.totalReturn >= 0 ? 'positive' : 'negative'}">${test.totalReturn.toFixed(2)}%</td>
                    <td class="metric-value ${test.profit >= 0 ? 'positive' : 'negative'}">$${test.profit.toFixed(2)}</td>
                    <td class="metric-value">${test.buyTrades}</td>
                    <td>
                        <button onclick="window.dashboard.deleteHistoryEntry(${test.id})" class="secondary-btn" style="padding: 4px 8px; font-size: 12px;">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        historyContainer.innerHTML = tableHTML;
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all test history? This cannot be undone.')) {
            this.testHistory = [];
            localStorage.removeItem('strategyTestHistory');
            this.updateHistoryDisplay();
        }
    }

    deleteHistoryEntry(id) {
        this.testHistory = this.testHistory.filter(test => test.id !== id);
        localStorage.setItem('strategyTestHistory', JSON.stringify(this.testHistory));
        this.updateHistoryDisplay();
    }

    exportHistory() {
        if (this.testHistory.length === 0) {
            alert('No history to export!');
            return;
        }

        const headers = ['Date', 'Stock', 'Strategy', 'Time Range', 'Total Return (%)', 'Profit/Loss ($)', 'Buy Trades', 'Sell Trades'];
        const csvContent = [
            headers.join(','),
            ...this.testHistory.map(test => [
                new Date(test.timestamp).toLocaleString(),
                test.stock,
                `"${test.strategy}"`,
                test.timeRange,
                test.totalReturn.toFixed(2),
                test.profit.toFixed(2),
                test.buyTrades,
                test.sellTrades
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `strategy_history_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Initialize dashboard when page loads
window.addEventListener('load', () => {
    log('Page loaded, creating dashboard...');
    window.dashboard = new StockDashboard();
    console.log('Dashboard initialized successfully');
});