const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const { calculateAllNWeekLowTriggers } = require('../shared/indicators/nWeekLow');
const { calculateAllNWeekHighTriggers } = require('../shared/indicators/nWeekHigh');
const { calculateAllMACrossTriggers } = require('../shared/indicators/movingAverage');
const { calculateAllDailyChangeTriggers } = require('../shared/indicators/dailyChange');
const { calculateAllRSITriggers } = require('../shared/indicators/rsi');
const { calculateAllBBTriggers } = require('../shared/indicators/bollingerBands');

module.exports = async function (context, req) {
    context.log('UpdateSingleStockIndicators triggered');

    try {
        // Get symbol from query string or request body (case-insensitive)
        let symbol = req.query.symbol || req.query.Symbol || (req.body && (req.body.symbol || req.body.Symbol));
        
        if (!symbol) {
            context.res = {
                status: 400,
                body: { error: 'Symbol parameter is required' }
            };
            return;
        }

        symbol = symbol.toUpperCase();
        context.log(`Processing indicators for ${symbol}`);

        // Get CSV data from blob
        const priceData = await getStockDataFromBlob(symbol, context);
        
        if (priceData.length < 260) { // Need at least 1 year of data
            const message = `${symbol}: Insufficient data (${priceData.length} days). Need at least 260 days.`;
            context.log.warn(message);
            context.res = {
                status: 400,
                body: {
                    error: message,
                    symbol,
                    dataPoints: priceData.length,
                    required: 260
                }
            };
            return;
        }

        // Read existing triggers from Cosmos DB (to preserve dates)
        const existingIndicators = await getExistingIndicatorsFromCosmos(symbol, context);

        // Calculate indicators
        const indicators = calculateTechnicalIndicators(priceData, existingIndicators, context);
        
        // Update Cosmos DB
        await updateIndicatorsInCosmos(symbol, indicators, context);

        context.log(`✓ ${symbol} indicators updated successfully`);

        context.res = {
            status: 200,
            body: {
                symbol,
                status: 'success',
                alarmCount: indicators.alarmList.length,
                alarms: indicators.alarmList.map(a => ({
                    alarmName: a.alarmName,
                    weeks: a.weeks,
                    fluctuation: a.fluctuation,
                    triggeredDate: a.previousTriggeredDate
                }))
            }
        };
    } catch (error) {
        context.log.error('Error in UpdateSingleStockIndicators:', error);
        
        if (error.message && error.message.includes('not found')) {
            context.res = {
                status: 404,
                body: { error: error.message }
            };
        } else {
            context.res = {
                status: 500,
                body: { error: error.message }
            };
        }
    }
};

/**
 * Get stock data from Azure Blob Storage
 */
async function getStockDataFromBlob(symbol, context) {
    const connectionString = process.env.AzureWebJobsStorage;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient('stock-data');
    const blobClient = containerClient.getBlobClient(`${symbol}.csv`);

    const exists = await blobClient.exists();
    if (!exists) {
        throw new Error(`CSV file not found for ${symbol}`);
    }

    const downloadResponse = await blobClient.download();
    const csvContent = await streamToString(downloadResponse.readableStreamBody);
    
    const lines = csvContent.split('\n').filter(line => line.trim());
    const prices = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 7) { // CSV format: Date,Low,Open,Volume,High,Close,AdjClose
            try {
                // CSV format: Date(0), Low(1), Open(2), Volume(3), High(4), Close(5), AdjClose(6)
                const dateParts = parts[0].trim().split('-');
                const date = new Date(
                    parseInt(dateParts[2]), // year
                    parseInt(dateParts[1]) - 1, // month (0-indexed)
                    parseInt(dateParts[0]) // day
                );
                
                const stockPrice = {
                    date: date,
                    open: parseFloat(parts[2].trim()),
                    high: parseFloat(parts[4].trim()),
                    low: parseFloat(parts[1].trim()),
                    close: parseFloat(parts[5].trim()),
                    volume: parseInt(parts[3].trim())
                };
                
                prices.push(stockPrice);
            } catch (error) {
                context.log.warn(`Skipping line ${i} due to parse error: ${error.message}`);
                continue;
            }
        }
    }

    return prices.sort((a, b) => a.date - b.date);
}

/**
 * Calculate technical indicators
 */
function calculateTechnicalIndicators(prices, existingIndicators, context) {
    const today = prices[prices.length - 1];

    const alarmList = calculateAlarmList(prices, existingIndicators?.alarmList, context);

    const indicators = {
        alarmList: alarmList
    };

    return indicators;
}

/**
 * Calculate alarm list with unique alarm names
 */
function calculateAlarmList(prices, existingAlarmList, context) {
    const alarmList = [];
    
    // Calculate N-week low triggers
    const lowTriggers = calculateAllNWeekLowTriggers(
        prices,
        [4, 8, 12, 24, 32, 52], // weekPeriods
        [0, 10, 20],             // fluctuations
        context.log              // logger
    );
    
    // Add low triggers to alarm list
    lowTriggers.forEach(trigger => {
        const alarmName = `${trigger.weeks}WeekLow${trigger.fluctuation}Fluctuation`;
        alarmList.push({
            alarmName: alarmName,
            weeks: trigger.weeks,
            fluctuation: trigger.fluctuation,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    // Calculate N-week high triggers
    const highTriggers = calculateAllNWeekHighTriggers(
        prices,
        [4, 8, 12, 24, 32, 52], // weekPeriods
        [0, 10, 20],             // fluctuations
        context.log              // logger
    );
    
    // Add high triggers to alarm list
    highTriggers.forEach(trigger => {
        const alarmName = `${trigger.weeks}WeekHigh${trigger.fluctuation}Fluctuation`;
        alarmList.push({
            alarmName: alarmName,
            weeks: trigger.weeks,
            fluctuation: trigger.fluctuation,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    // Calculate MA cross triggers
    const maTriggers = calculateAllMACrossTriggers(
        prices,
        [10, 50, 100, 200],      // maPeriods
        ['above', 'below', 'cross-up', 'cross-down'], // directions
        context.log              // logger
    );
    
    // Add MA triggers to alarm list
    maTriggers.forEach(trigger => {
        // Format: MA10AboveMA50, MA50CrossUpMA200, etc.
        const directionStr = trigger.direction
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
        const alarmName = `MA${trigger.ma1Period}${directionStr}MA${trigger.ma2Period}`;
        
        alarmList.push({
            alarmName: alarmName,
            ma1Period: trigger.ma1Period,
            ma2Period: trigger.ma2Period,
            direction: trigger.direction,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    // Calculate Daily Change triggers
    const dailyChangeTriggers = calculateAllDailyChangeTriggers(prices);
    
    // Add Daily Change triggers to alarm list
    dailyChangeTriggers.forEach(trigger => {
        alarmList.push({
            alarmName: trigger.alarmName,
            type: trigger.type,
            threshold: trigger.threshold,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    // Calculate RSI triggers
    const rsiTriggers = calculateAllRSITriggers(prices, 14); // 14-period RSI
    
    // Add RSI triggers to alarm list
    rsiTriggers.forEach(trigger => {
        alarmList.push({
            alarmName: trigger.alarmName,
            type: trigger.type,
            threshold: trigger.threshold,
            period: trigger.period,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    // Calculate Bollinger Bands triggers with distance thresholds
    // distancePercents: 0% = touch, 5% = close, 10% = near
    const bbTriggers = calculateAllBBTriggers(prices, 20, 2, [0, 5, 10]); // 20-period, 2 stdDev
    
    // Add BB triggers to alarm list
    bbTriggers.forEach(trigger => {
        alarmList.push({
            alarmName: trigger.alarmName,
            type: trigger.type,
            period: trigger.period,
            stdDev: trigger.stdDev,
            distancePercent: trigger.distancePercent,
            previousTriggeredDate: trigger.previousTriggeredDate
        });
    });
    
    return alarmList;
}

/**
 * Get existing indicators from Cosmos DB
 */
async function getExistingIndicatorsFromCosmos(symbol, context) {
    try {
        const connectionString = process.env.CosmosConnectionString;
        const client = new CosmosClient(connectionString);
        const databaseName = process.env.CosmosDatabaseName || 'stockDB';
        const database = client.database(databaseName);
        const container = database.container('watchlist');

        const { resource } = await container.item(symbol, symbol).read();
        
        // Extract indicators from the document
        if (resource) {
            return {
                alarmList: resource.alarmList || null
            };
        }
        return null;
    } catch (error) {
        if (error.code === 404) {
            context.log(`No existing indicators found for ${symbol}`);
            return null;
        }
        throw error;
    }
}

/**
 * Update indicators in Cosmos DB
 */
async function updateIndicatorsInCosmos(symbol, indicators, context) {
    const connectionString = process.env.CosmosConnectionString;
    const client = new CosmosClient(connectionString);
    const databaseName = process.env.CosmosDatabaseName || 'stockDB';
    const database = client.database(databaseName);
    const container = database.container('watchlist');

    // Read existing document first
    let document;
    try {
        const { resource } = await container.item(symbol, symbol).read();
        document = resource;
    } catch (error) {
        if (error.code === 404) {
            // Document doesn't exist, create new one
            document = {
                id: symbol,
                symbol: symbol
            };
        } else {
            throw error;
        }
    }

    // Update fields in the document
    document.alarmList = indicators.alarmList;

    await container.items.upsert(document);
    context.log(`Indicators saved to Cosmos DB for ${symbol}`);
}

/**
 * Helper function to convert stream to string
 */
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data.toString());
        });
        readableStream.on('end', () => {
            resolve(chunks.join(''));
        });
        readableStream.on('error', reject);
    });
}
