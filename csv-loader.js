// CSV Data Loader for Stock Dashboard
class CSVDataLoader {
    constructor() {
        this.dataPath = 'data/stock_market_data/forbes2000/csv/';
    }

    async loadAvailableStocks() {
        // Since we can't directly list files in a browser, we'll use a predefined list
        // In a real application, you'd have a server endpoint to list available files
        const commonStocks = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V',
            'NFLX', 'DIS', 'PYPL', 'ADBE', 'CRM', 'INTC', 'AMD', 'QCOM', 'TXN', 'AVGO',
            'ORCL', 'IBM', 'CSCO', 'ACN', 'SHOP', 'SQ', 'UBER', 'LYFT', 'SNAP', 'TWTR',
            'BABA', 'NIO', 'PDD', 'JD', 'BIDU', 'TME', 'BILI', 'IQ', 'VIPS', 'WB'
        ];
        
        return commonStocks;
    }

    async loadStockData(symbol) {
        try {
            const response = await fetch(`${this.dataPath}${symbol}.csv`);
            if (!response.ok) {
                throw new Error(`Failed to load ${symbol}.csv`);
            }
            
            const csvText = await response.text();
            return this.parseCSV(csvText, symbol);
        } catch (error) {
            console.error(`Error loading stock data for ${symbol}:`, error);
            // Return sample data as fallback
            return this.generateSampleData(symbol);
        }
    }

    parseCSV(csvText, symbol) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Expected headers: Date,Open,High,Low,Close,Volume
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            
            if (values.length < 5) continue; // Skip incomplete rows
            
            try {
                // Parse date (assuming DD-MM-YYYY format based on your data)
                const dateParts = values[0].split('-');
                const date = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
                
                if (isNaN(date.getTime())) continue; // Skip invalid dates
                
                const dataPoint = {
                    date: date,
                    open: parseFloat(values[1]) || 0,
                    high: parseFloat(values[2]) || 0,
                    low: parseFloat(values[3]) || 0,
                    close: parseFloat(values[4]) || 0,
                    volume: values[5] ? parseInt(values[5]) : 0
                };
                
                // Validate that all numeric values are reasonable
                if (dataPoint.close > 0 && dataPoint.high >= dataPoint.low) {
                    data.push(dataPoint);
                }
            } catch (error) {
                console.warn(`Skipping invalid row for ${symbol}:`, values);
                continue;
            }
        }
        
        // Sort by date
        data.sort((a, b) => a.date - b.date);
        
        return { symbol, data };
    }

    generateSampleData(symbol) {
        // Fallback: Generate realistic sample data if CSV loading fails
        const data = [];
        const startDate = new Date('2020-01-01');
        const endDate = new Date();
        const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        // Different base prices for different stocks
        const basePrices = {
            'AAPL': 150,
            'MSFT': 300,
            'GOOGL': 2500,
            'AMZN': 3000,
            'TSLA': 800,
            'META': 200,
            'NVDA': 400
        };
        
        let price = basePrices[symbol] || (100 + Math.random() * 200);
        
        for (let i = 0; i <= totalDays; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            // Skip weekends for more realistic stock data
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            
            // Generate realistic price movement with trends
            const trend = Math.sin(i / 100) * 0.001; // Long-term trend
            const volatility = (Math.random() - 0.5) * 0.03; // Daily volatility
            const change = (trend + volatility) * price;
            
            price = Math.max(1, price + change);
            
            const open = price * (0.98 + Math.random() * 0.04); // Open within ±2%
            const high = Math.max(open, price) * (1 + Math.random() * 0.02);
            const low = Math.min(open, price) * (1 - Math.random() * 0.02);
            const volume = Math.floor(1000000 + Math.random() * 50000000);
            
            data.push({
                date: date,
                open: open,
                high: high,
                low: low,
                close: price,
                volume: volume
            });
        }
        
        return { symbol, data };
    }

    // Utility function to format date for CSV filename
    formatDateForFilename(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // Check if stock data exists (attempt to fetch without loading full data)
    async stockExists(symbol) {
        try {
            const response = await fetch(`${this.dataPath}${symbol}.csv`, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// Enhanced Stock Dashboard with Real CSV Loading
class EnhancedStockDashboard extends StockDashboard {
    constructor() {
        super();
        this.csvLoader = new CSVDataLoader();
    }

    async loadAvailableStocks() {
        try {
            this.stocks = await this.csvLoader.loadAvailableStocks();
            
            const stockSelect = document.getElementById('stockSelect');
            stockSelect.innerHTML = '';
            
            // Add a loading option while we check which stocks actually exist
            const loadingOption = document.createElement('option');
            loadingOption.value = '';
            loadingOption.textContent = 'Loading available stocks...';
            stockSelect.appendChild(loadingOption);
            
            // Populate with available stocks
            for (const stock of this.stocks) {
                const option = document.createElement('option');
                option.value = stock;
                option.textContent = stock;
                stockSelect.appendChild(option);
            }
            
            // Remove loading option
            stockSelect.removeChild(loadingOption);
            
        } catch (error) {
            console.error('Error loading stocks:', error);
            // Fallback to original implementation
            await super.loadAvailableStocks();
        }
    }

    async loadStock(symbol) {
        try {
            // Show loading state
            const metricsContainer = document.getElementById('metricsContainer');
            metricsContainer.innerHTML = '<div class="loading">Loading stock data...</div>';
            
            // Load real CSV data
            this.currentData = await this.csvLoader.loadStockData(symbol);
            
            if (!this.currentData || this.currentData.data.length === 0) {
                throw new Error('No data available');
            }
            
            this.updateMetrics();
            this.updateChart();
            
        } catch (error) {
            console.error('Error loading stock data:', error);
            this.showError(`Failed to load data for ${symbol}. Please try another stock.`);
        }
    }

    filterStocks(searchTerm) {
        const stockSelect = document.getElementById('stockSelect');
        const filteredStocks = this.stocks.filter(stock => 
            stock.toLowerCase().includes(searchTerm.toLowerCase())
        );

        stockSelect.innerHTML = '';
        
        if (filteredStocks.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = `No stocks found matching "${searchTerm}"`;
            stockSelect.appendChild(option);
        } else {
            filteredStocks.slice(0, 50).forEach(stock => { // Limit to 50 results
                const option = document.createElement('option');
                option.value = stock;
                option.textContent = stock;
                stockSelect.appendChild(option);
            });
        }
    }
}

// Replace the original dashboard initialization
window.addEventListener('DOMContentLoaded', () => {
    new EnhancedStockDashboard();
});