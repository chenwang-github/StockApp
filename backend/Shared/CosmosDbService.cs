using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using StockApp.Shared;

namespace StockApp.Shared;

public class CosmosDbService
{
    private readonly CosmosClient _cosmosClient;
    private readonly Database _database;
    private readonly Container _container;
    private readonly ILogger _logger;

    public CosmosDbService(ILogger logger)
    {
        _logger = logger;
        
        // CosmosDB configuration - use environment variables only (no fallback for security)
        var connectionString = Environment.GetEnvironmentVariable("CosmosConnectionString") 
            ?? throw new InvalidOperationException("CosmosConnectionString environment variable is not set. Please configure it in local.settings.json or Azure App Settings.");
        var databaseName = Environment.GetEnvironmentVariable("CosmosDatabaseName") ?? "stockDB";
        var containerName = Environment.GetEnvironmentVariable("CosmosContainerName") ?? "stockContainer";
        
        _cosmosClient = new CosmosClient(connectionString);
        _database = _cosmosClient.GetDatabase(databaseName);
        _container = _database.GetContainer(containerName);
    }

    /// <summary>
    /// Get stock data for a specific symbol within a date range
    /// </summary>
    public async Task<List<StockDataPoint>> GetStockDataByDateRange(string symbol, DateTime startDate, DateTime endDate)
    {
        try
        {
            var query = $@"
                SELECT c.date, c.open, c.high, c.low, c.close, c.volume 
                FROM c 
                WHERE c.symbol = '{symbol}' 
                AND c.date >= '{startDate:yyyy-MM-dd}' 
                AND c.date <= '{endDate:yyyy-MM-dd}' 
                ORDER BY c.date ASC";
            
            var queryDefinition = new QueryDefinition(query);
            var iterator = _container.GetItemQueryIterator<dynamic>(queryDefinition, 
                requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(symbol) });

            var stockDataPoints = new List<StockDataPoint>();
            
            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                foreach (var item in response)
                {
                    stockDataPoints.Add(new StockDataPoint
                    {
                        Date = DateTime.Parse(item.date.ToString()),
                        Open = (decimal)item.open,
                        High = (decimal)item.high,
                        Low = (decimal)item.low,
                        Close = (decimal)item.close,
                        Volume = (long)item.volume
                    });
                }
            }
            
            _logger.LogInformation("Retrieved {Count} data points for {Symbol} between {StartDate} and {EndDate}", 
                stockDataPoints.Count, symbol, startDate.ToString("yyyy-MM-dd"), endDate.ToString("yyyy-MM-dd"));
            
            return stockDataPoints;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving stock data for {Symbol} between {StartDate} and {EndDate}", 
                symbol, startDate.ToString("yyyy-MM-dd"), endDate.ToString("yyyy-MM-dd"));
            return new List<StockDataPoint>();
        }
    }

    /// <summary>
    /// Check existing stock data in CosmosDB for the specified symbol
    /// </summary>
    public async Task<ExistingDataInfo> CheckExistingData(string symbol)
    {
        try
        {
            // Query for the latest data for this stock
            var query = $"SELECT TOP 1 c.date FROM c WHERE c.symbol = '{symbol}' ORDER BY c.date DESC";
            var queryDefinition = new QueryDefinition(query);
            
            var iterator = _container.GetItemQueryIterator<dynamic>(queryDefinition, 
                requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(symbol) });
            
            DateTime? lastDate = null;
            if (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                if (response.Any())
                {
                    var lastDateStr = response.First().date.ToString();
                    if (DateTime.TryParse(lastDateStr, out DateTime parsedDate))
                    {
                        lastDate = parsedDate;
                    }
                }
            }
            
            if (!lastDate.HasValue)
            {
                _logger.LogInformation("No existing data found for {Symbol} in CosmosDB", symbol);
                return new ExistingDataInfo { HasNoData = true };
            }
            
            // Check if update is needed (if last day is not today or yesterday, depending on market hours)
            var daysSinceLastData = (DateTime.Now.Date - lastDate.Value.Date).Days;
            var needsUpdate = daysSinceLastData > 0; // Need update if data is not from today
            
            _logger.LogInformation("Found existing data for {Symbol} up to {LastDate}. Days since last data: {Days}", 
                symbol, lastDate.Value.ToString("yyyy-MM-dd"), daysSinceLastData);
            
            return new ExistingDataInfo 
            { 
                HasNoData = false, 
                LastDate = lastDate, 
                NeedsUpdate = needsUpdate 
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking existing data for {Symbol}", symbol);
            // If query fails, assume no data exists
            return new ExistingDataInfo { HasNoData = true };
        }
    }

    /// <summary>
    /// Batch upsert data to CosmosDB (insert or update if exists)
    /// </summary>
    public async Task BulkUpsertToCosmosDB(List<object> documents)
    {
        try
        {
            var tasks = new List<Task>();
            
            foreach (var doc in documents)
            {
                // Use UpsertItemAsync to handle existing data gracefully
                // This will insert new documents or update existing ones with the same id
                tasks.Add(_container.UpsertItemAsync(doc, new PartitionKey(((dynamic)doc).symbol)));
            }
            
            await Task.WhenAll(tasks);
            _logger.LogInformation("Successfully upserted {Count} documents to CosmosDB", documents.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error upserting documents to CosmosDB");
            throw;
        }
    }

    /// <summary>
    /// Get the watch list configuration from Cosmos DB
    /// </summary>
    public async Task<WatchListConfig> GetWatchListConfigAsync()
    {
        try
        {
            var response = await _container.ReadItemAsync<WatchListConfig>(
                id: "stock-watchlist",
                partitionKey: new PartitionKey("stock-watchlist")
            );

            _logger.LogInformation("Successfully loaded watch list from Cosmos DB");
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogWarning("Watch list configuration not found in Cosmos DB");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading watch list from Cosmos DB");
            throw;
        }
    }

    /// <summary>
    /// Save or update the watch list configuration in Cosmos DB
    /// </summary>
    public async Task SaveWatchListConfigAsync(WatchListConfig config)
    {
        try
        {
            config.LastModified = DateTime.UtcNow;

            var response = await _container.UpsertItemAsync(
                item: config,
                partitionKey: new PartitionKey(config.Id)
            );

            _logger.LogInformation("Successfully saved watch list to Cosmos DB with {Count} stocks", config.Stocks.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving watch list to Cosmos DB");
            throw;
        }
    }
}