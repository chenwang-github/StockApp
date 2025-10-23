# Stock Trading Strategy Dashboard

An interactive stock trading strategy testing platform with historical data analysis and custom buy/sell condition testing.

## 🚀 Current Features

### 📊 Core Functionality
- **Stock Selection**: Choose from 1000+ Forbes 2000 stocks with real-time search
- **Strategy Testing**: Test custom buy/sell conditions with historical data
- **Multiple Buy Conditions**: 
  - Time-based: Weekly, bi-weekly, monthly, quarterly
  - Price-based: 2-week, 4-week, 8-week, 12-week lows
- **Interactive Charts**: Drag to navigate, zoom, and analyze price movements
- **Performance Analytics**: ROI, profit/loss, total returns with detailed breakdowns

### 🎯 Trading Strategy Features
- **Custom Logic**: Combine different buy and sell conditions
- **Historical Backtesting**: Test strategies against years of historical data
- **Visual Markers**: See exact buy/sell points on price charts
- **Strategy History**: Save and compare multiple strategy tests
- **Export Functionality**: Export test results to CSV

### 📈 User Interface
- **Modern Design**: Clean, professional trading dashboard
- **Real-time Search**: Fast stock symbol lookup with autocomplete
- **Responsive Layout**: Works on desktop and mobile devices
- **Time Range Controls**: Flexible date range selection for backtesting

## 🏃‍♂️ Quick Start

### Method 1: Using Batch File (Recommended)
```bash
# Windows users
start_frontend.bat
```

### Method 2: Manual Start
```bash
# Navigate to project directory
cd "d:\Personal Project\StockApp"

# Start Python server
python -m SimpleHTTPServer 8000

# Open browser to: http://localhost:8000/frontend/viewer.html
```

## 📊 Data Sources & Recommendations

### Current Historical Data (Perfect for Backtesting)
- **Dataset**: Forbes 2000 company stock data  
- **Time Range**: 1980 - 2022 (Historical data)
- **Format**: CSV files with OHLCV data
- **Purpose**: ✅ Excellent for strategy backtesting and historical analysis

### 📈 Recommended APIs for Live/Recent Data

#### 🆓 Free Options (Great for Development)
1. **Alpha Vantage** - Free tier: 5 calls/minute, 500 calls/day
   ```javascript
   // Example: Get daily data
   const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL&apikey=YOUR_API_KEY`;
   ```

2. **Yahoo Finance (Unofficial)** - No API key needed, use with caution
   ```javascript
   // Example using yfinance-like approach
   const url = `https://query1.finance.yahoo.com/v8/finance/chart/AAPL`;
   ```

3. **Finnhub** - Free tier: 60 calls/minute
   ```javascript
   const url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=YOUR_API_KEY`;
   ```

4. **IEX Cloud** - Free tier: 50,000 requests/month
   ```javascript
   const url = `https://cloud.iexapis.com/stable/stock/AAPL/chart/1y?token=YOUR_TOKEN`;
   ```

#### 💰 Premium Options (Production Ready)
- **Polygon.io** - $99/month, real-time data
- **Quandl** - Various pricing, extensive datasets  
- **Bloomberg API** - Enterprise level
- **Reuters Eikon** - Professional traders

#### 🛠️ Implementation Recommendation
**Best Approach**: Create a data fetching service that can switch between sources:

```javascript
class DataService {
    constructor(source = 'alphavantage') {
        this.source = source;
        this.apiKey = 'YOUR_API_KEY';
    }
    
    async getStockData(symbol, timeframe = '1y') {
        switch(this.source) {
            case 'alphavantage':
                return await this.fetchAlphaVantage(symbol, timeframe);
            case 'finnhub':
                return await this.fetchFinnhub(symbol, timeframe);
            // Add more sources...
        }
    }
}
```

#### 📁 Hybrid Data Strategy (Recommended)
1. **Keep Historical Data** (your current CSV files) for backtesting 1980-2022
2. **Add Live API** for recent data (2023-present)
3. **Cache Recent Data** locally to minimize API calls
4. **Combine Sources** in your app for complete historical + current view

### 🔄 Data Update Strategy
```javascript
// Example: Check if we need recent data
const lastHistoricalDate = '2022-12-31';
const today = new Date();
const needsUpdate = today > new Date(lastHistoricalDate);

if (needsUpdate) {
    // Fetch recent data from API
    const recentData = await dataService.getStockData(symbol, 'recent');
    // Combine with historical CSV data
    const completeData = [...historicalData, ...recentData];
}
```

## 🎮 How to Use

### 📈 Strategy Testing Workflow
1. **Select a Stock**: Use the search box to find and select a stock symbol
2. **Choose Time Range**: Set start/end years for backtesting (default: 2020-2022)
3. **Pick Buy Condition**: Select when to buy (weekly, monthly, or at price lows)
4. **Pick Sell Condition**: Choose when to sell (currently: end of range)
5. **Test Strategy**: Click "🚀 Test Strategy" to see results
6. **Analyze Results**: View ROI, profit/loss, and buy/sell points on the chart

### 🔧 Advanced Features
- **Chart Navigation**: Drag horizontally to scroll through time periods
- **Time Slider**: Use the slider below the chart for precise navigation  
- **Weekly Low Conditions**: Test buying at 2, 4, 8, or 12-week price lows
- **Strategy History**: All tests are automatically saved for comparison
- **Export Data**: Download test results as CSV files

### 📊 Understanding Results
- **Green Dots**: Buy points on the chart
- **Red Dots**: Sell points on the chart  
- **Total Return %**: Percentage gain/loss of the strategy
- **Final Value**: What your investment is worth at the end
- **Profit/Loss**: Absolute dollar amount gained/lost

## 🏗️ Project Structure

```
StockApp/
├── frontend/
│   ├── viewer.html         # Stock viewer dashboard
│   └── viewer.js           # Dashboard functionality
├── start_frontend.bat      # Quick start script
├── .gitignore             # Git ignore (excludes CSV files)
├── README.md              # This documentation
└── data/
    └── stock_market_data/
        ├── forbes2000/csv/     # Historical stock data (1980-2022)
        ├── nasdaq/csv/         # NASDAQ historical data
        ├── nyse/csv/           # NYSE historical data  
        └── sp500/csv/          # S&P 500 historical data
```

## 🛠️ Tech Stack

- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Charts**: Chart.js 4.4.0 for interactive visualizations
- **Server**: Python SimpleHTTPServer for local development
- **Data Format**: CSV files with OHLCV (Open, High, Low, Close, Volume)
- **Storage**: LocalStorage for strategy history persistence

## 🚀 Next Steps & Recommendations

### 📊 For Current Use (Historical Analysis)
- ✅ Perfect for backtesting trading strategies
- ✅ Ideal for learning about different investment approaches  
- ✅ Great for comparing time-based vs price-based buying strategies

### 🔄 For Live Trading (Add Recent Data)
1. **Choose an API**: Start with Alpha Vantage (free tier)
2. **Implement Data Service**: Add API integration to `viewer.js`
3. **Hybrid Approach**: Combine historical CSV + live API data
4. **Cache Strategy**: Store recent data locally to minimize API calls

### 💡 Future Enhancements
- Add more sell conditions (stop-loss, profit targets, technical indicators)
- Implement portfolio diversification testing  
- Add risk analysis metrics (Sharpe ratio, max drawdown)
- Include dividend reinvestment calculations

## ❓ Troubleshooting

**Q: Server won't start?**  
A: Make sure Python is installed and try `python --version`

**Q: Page loads slowly?**  
A: This is normal on first load while stock symbols are being loaded from directories

**Q: Stock not found?**  
A: Try typing the full symbol (e.g., "AAPL") or check if it exists in the data folder

**Q: Strategy shows no buy signals?**  
A: Try different time ranges or buy conditions - some strategies are more selective

**Q: Charts not displaying?**  
A: Ensure you're accessing via `http://localhost:8000/frontend/viewer.html`, not opening the HTML file directly

## 📜 License

MIT License - Free for educational and personal use

---

🎯 **Happy Strategy Testing!** Use your historical data to discover profitable trading patterns before applying them to real markets.