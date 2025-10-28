const { CosmosClient } = require('@azure/cosmos');
const axios = require('axios');

module.exports = async function (context, req) {
    context.log('DailyWatchlistUpdater started at:', new Date().toISOString());

    try {
        // Get watchlist from Cosmos DB
        const watchlist = await getWatchlistFromCosmos(context);
        
        if (!watchlist || watchlist.length === 0) {
            context.log.warn('No stocks found in watchlist');
            context.res = {
                status: 200,
                body: {
                    message: 'No stocks found in watchlist',
                    successCount: 0,
                    failCount: 0
                }
            };
            return;
        }

        context.log(`Found ${watchlist.length} stocks in watchlist`);

        // Get the UpdateStockFromYahoo function URL
        const functionUrl = getUpdateFunctionUrl();
        
        // Update each stock in the watchlist
        let successCount = 0;
        let failCount = 0;
        const results = [];

        for (const stock of watchlist) {
            try {
                context.log(`Updating stock: ${stock.symbol} (${stock.name})`);
                
                const response = await axios.get(`${functionUrl}?symbol=${stock.symbol}`, {
                    timeout: 30000 // 30 second timeout
                });
                
                if (response.status === 200) {
                    context.log(`✓ Successfully updated ${stock.symbol}`);
                    successCount++;
                    results.push({
                        symbol: stock.symbol,
                        status: 'success',
                        data: response.data
                    });
                } else {
                    context.log.warn(`✗ Failed to update ${stock.symbol}: ${response.status}`);
                    failCount++;
                    results.push({
                        symbol: stock.symbol,
                        status: 'failed',
                        error: `HTTP ${response.status}`
                    });
                }

                // Small delay to avoid overwhelming the API
                await sleep(1000);
            } catch (error) {
                context.log.error(`Error updating stock ${stock.symbol}:`, error.message);
                failCount++;
                results.push({
                    symbol: stock.symbol,
                    status: 'error',
                    error: error.message
                });
            }
        }

        context.log(`Update completed: ${successCount} succeeded, ${failCount} failed`);
        
        context.res = {
            status: 200,
            body: {
                message: 'Watchlist update completed',
                totalStocks: watchlist.length,
                successCount,
                failCount,
                results
            }
        };
    } catch (error) {
        context.log.error('Error in DailyWatchlistUpdater:', error);
        context.res = {
            status: 500,
            body: {
                error: error.message,
                details: error.toString()
            }
        };
    }
};

/**
 * Get watchlist from Cosmos DB
 */
async function getWatchlistFromCosmos(context) {
    try {
        const connectionString = process.env.CosmosConnectionString;
        if (!connectionString) {
            throw new Error('CosmosConnectionString not configured');
        }

        const client = new CosmosClient(connectionString);
        const databaseName = process.env.CosmosDatabaseName || 'stockDB';
        const database = client.database(databaseName);
        const container = database.container('watchlist');

        // Query all documents in watchlist container
        const querySpec = {
            query: 'SELECT c.id FROM c'
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        
        const watchlist = resources.map(doc => ({
            symbol: doc.id,
            name: doc.id,
            priority: 'medium'
        }));

        context.log(`Found ${watchlist.length} stocks in watchlist`);
        return watchlist;
    } catch (error) {
        context.log.error('Error reading watchlist from Cosmos DB:', error);
        throw error;
    }
}

/**
 * Get UpdateStockFromYahoo function URL
 */
function getUpdateFunctionUrl() {
    // First, check if FunctionAppUrl is explicitly configured (for local development)
    const configuredUrl = process.env.FunctionAppUrl;
    if (configuredUrl) {
        return `${configuredUrl}/api/UpdateStockFromYahoo`;
    }
    
    // In Azure, use the WEBSITE_HOSTNAME environment variable
    const functionAppUrl = process.env.WEBSITE_HOSTNAME;
    if (functionAppUrl) {
        return `https://${functionAppUrl}/api/UpdateStockFromYahoo`;
    }

    // Fallback to localhost for local development
    return 'http://localhost:7071/api/UpdateStockFromYahoo';
}

/**
 * Helper function to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
