const { BlobServiceClient } = require('@azure/storage-blob');
const axios = require('axios');

const CONTAINER_NAME = 'stock-data';
const MAX_YEARS = 10;

module.exports = async function (context, req) {
    context.log('UpdateStockFromYahoo function triggered.');

    // Get symbol parameter
    const symbol = (req.query.symbol || '').toUpperCase();
    
    if (!symbol) {
        context.res = {
            status: 400,
            body: { error: 'Symbol parameter is required' }
        };
        return;
    }

    context.log(`Processing stock symbol: ${symbol}`);

    try {
        // Initialize Blob Service Client
        const connectionString = process.env.AzureWebJobsStorage;
        
        if (!connectionString) {
            context.log.error('AzureWebJobsStorage environment variable is not set');
            context.res = {
                status: 500,
                body: { error: 'Storage connection string is not configured' }
            };
            return;
        }
        
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        
        // Ensure container exists with public read access for blobs
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        await containerClient.createIfNotExists({ access: 'blob' });

        // Get blob reference
        const blobName = `${symbol}.csv`;
        const blobClient = containerClient.getBlobClient(blobName);

        let startDate;
        let lastDataDate = null;
        let isNewFile = false;

        // Check if blob exists and get the last date
        const blobExists = await blobClient.exists();
        
        if (blobExists) {
            context.log(`Existing CSV found for ${symbol}. Checking last date...`);
            lastDataDate = await getLastDateFromBlob(blobClient, context);
            
            if (lastDataDate) {
                // Update from the day after the last recorded date
                startDate = new Date(lastDataDate);
                startDate.setDate(startDate.getDate() + 1);
                context.log(`Last data date: ${lastDataDate.toISOString().split('T')[0]}. Will fetch from ${startDate.toISOString().split('T')[0]}`);
            } else {
                // File exists but couldn't parse date, fetch full history
                startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - MAX_YEARS);
                isNewFile = true;
                context.log('Could not parse last date from existing file. Fetching full history.');
            }
        } else {
            // New file - fetch up to 10 years of history
            startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - MAX_YEARS);
            isNewFile = true;
            context.log(`No existing data for ${symbol}. Fetching up to ${MAX_YEARS} years of history.`);
        }

        // Fetch stock data from Yahoo Finance
        const stockData = await fetchStockDataFromYahoo(symbol, startDate, new Date(), context);

        if (!stockData || stockData.length === 0) {
            context.res = {
                status: 200,
                body: {
                    symbol: symbol,
                    message: 'No new data available',
                    recordsAdded: 0
                }
            };
            return;
        }

        // Convert to CSV format
        const csvContent = convertToCsv(stockData);

        if (isNewFile) {
            // Upload new CSV file
            await uploadCsvToBlob(blobClient, csvContent);
            context.log(`Created new CSV for ${symbol} with ${stockData.length} records`);
        } else {
            // Append to existing CSV file
            await appendCsvToBlob(blobClient, csvContent, context);
            context.log(`Updated CSV for ${symbol} with ${stockData.length} new records`);
        }

        const dates = stockData.map(x => x.date);
        context.res = {
            status: 200,
            body: {
                symbol: symbol,
                message: isNewFile ? 'New file created' : 'File updated',
                recordsAdded: stockData.length,
                dateRange: {
                    from: new Date(Math.min(...dates)).toISOString().split('T')[0],
                    to: new Date(Math.max(...dates)).toISOString().split('T')[0]
                },
                blobPath: `${CONTAINER_NAME}/${blobName}`
            }
        };
    } catch (error) {
        context.log.error(`Error processing stock data for ${symbol}:`, error);
        context.log.error('Error stack:', error.stack);
        context.res = {
            status: 500,
            body: { 
                error: error.message,
                details: error.toString(),
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        };
    }
};

/**
 * Fetch stock data from Yahoo Finance API
 */
async function fetchStockDataFromYahoo(symbol, startDate, endDate, context) {
    try {
        const startTime = Math.floor(startDate.getTime() / 1000);
        const endTime = Math.floor(endDate.getTime() / 1000);
        
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTime}&period2=${endTime}&interval=1d&includePrePost=false`;
        
        context.log(`Fetching data: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data;
        
        // Check if we got a valid response
        if (data.chart.error) {
            const errorMsg = data.chart.error.description;
            context.log.error(`Yahoo Finance API error for ${symbol}: ${errorMsg}`);
            return null;
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        
        // Extract OHLCV data arrays
        const opens = quotes.open;
        const highs = quotes.high;
        const lows = quotes.low;
        const closes = quotes.close;
        const volumes = quotes.volume;

        // Build structured data points
        const dataPoints = [];
        for (let i = 0; i < timestamps.length; i++) {
            // Only include complete data points (skip weekends/holidays with null values)
            if (opens[i] != null && highs[i] != null && lows[i] != null && closes[i] != null) {
                dataPoints.push({
                    date: new Date(timestamps[i] * 1000).setHours(0, 0, 0, 0),
                    open: Math.round(opens[i] * 100) / 100,
                    high: Math.round(highs[i] * 100) / 100,
                    low: Math.round(lows[i] * 100) / 100,
                    close: Math.round(closes[i] * 100) / 100,
                    volume: volumes[i] || 0
                });
            }
        }

        context.log(`Successfully fetched ${dataPoints.length} data points for ${symbol}`);
        return dataPoints.sort((a, b) => a.date - b.date);
    } catch (error) {
        context.log.error(`Error fetching data from provider for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get the last date from existing blob CSV
 */
async function getLastDateFromBlob(blobClient, context) {
    try {
        const downloadResponse = await blobClient.download();
        const content = await streamToString(downloadResponse.readableStreamBody);
        
        const lines = content.split('\n').filter(line => line.trim());
        
        // Skip header and get last line
        if (lines.length > 1) {
            const lastLine = lines[lines.length - 1].trim();
            const columns = lastLine.split(',');
            
            // Assuming first column is date in DD-MM-YYYY format
            if (columns.length > 0) {
                const dateParts = columns[0].split('-');
                if (dateParts.length === 3) {
                    const day = parseInt(dateParts[0]);
                    const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
                    const year = parseInt(dateParts[2]);
                    const lastDate = new Date(year, month, day);
                    return lastDate;
                }
            }
        }
        
        return null;
    } catch (error) {
        context.log.error('Error reading last date from blob:', error);
        return null;
    }
}

/**
 * Convert stock data to CSV format (matching existing format: Date,Low,Open,Volume,High,Close,Adjusted Close)
 */
function convertToCsv(stockData) {
    let csv = 'Date,Low,Open,Volume,High,Close,Adjusted Close\n';
    
    // Add data rows in DD-MM-YYYY format to match existing CSV files
    for (const data of stockData) {
        const date = new Date(data.date);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        csv += `${day}-${month}-${year},${data.low},${data.open},${data.volume},${data.high},${data.close},${data.close}\n`;
    }
    
    return csv;
}

/**
 * Upload CSV content to blob (for new files)
 */
async function uploadCsvToBlob(blobClient, csvContent) {
    const blockBlobClient = blobClient.getBlockBlobClient();
    await blockBlobClient.upload(csvContent, csvContent.length);
}

/**
 * Append new data to existing CSV blob
 */
async function appendCsvToBlob(blobClient, newCsvContent, context) {
    // Download existing content
    const downloadResponse = await blobClient.download();
    const existingContent = await streamToString(downloadResponse.readableStreamBody);
    
    // Remove header from new content (skip first line)
    const newLines = newCsvContent.split('\n').filter(line => line.trim());
    const dataLines = newLines.slice(1).join('\n');
    
    // Append new data
    const updatedContent = existingContent.trimEnd() + '\n' + dataLines;
    
    // Upload updated content
    const blockBlobClient = blobClient.getBlockBlobClient();
    await blockBlobClient.upload(updatedContent, updatedContent.length);
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
