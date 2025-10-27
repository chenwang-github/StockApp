using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using System.Text.Json;
using StockApp.Shared;

namespace StockApp.Functions;

public class DailyWatchlistUpdater
{
    private readonly ILogger _logger;
    private readonly HttpClient _httpClient;
    private readonly CosmosClient _cosmosClient;

    public DailyWatchlistUpdater(ILoggerFactory loggerFactory, IHttpClientFactory httpClientFactory)
    {
        _logger = loggerFactory.CreateLogger<DailyWatchlistUpdater>();
        _httpClient = httpClientFactory.CreateClient();
        
        var connectionString = Environment.GetEnvironmentVariable("CosmosConnectionString") 
            ?? throw new InvalidOperationException("CosmosConnectionString not configured");
        _cosmosClient = new CosmosClient(connectionString);
    }

    /// <summary>
    /// Timer trigger that runs daily at 7:00 PM ET (after US/Canada market close at 4:00 PM ET)
    /// NCRONTAB format: {second} {minute} {hour} {day} {month} {day-of-week}
    /// 0 0 0 * * * = Every day at midnight UTC (7:00 PM ET during EST, 8:00 PM ET during EDT)
    /// </summary>
    [Function("DailyWatchlistUpdater")]
    public async Task Run([TimerTrigger("0 0 0 * * *")] TimerInfo myTimer)
    {
        _logger.LogInformation($"DailyWatchlistUpdater started at: {DateTime.UtcNow}");
        
        if (myTimer.ScheduleStatus is not null)
        {
            _logger.LogInformation($"Next timer schedule at: {myTimer.ScheduleStatus.Next}");
        }

        try
        {
            // Get watchlist from Cosmos DB
            var watchlist = await GetWatchlistFromCosmosAsync();
            
            if (watchlist == null || watchlist.Count == 0)
            {
                _logger.LogWarning("No stocks found in watchlist");
                return;
            }

            _logger.LogInformation($"Found {watchlist.Count} stocks in watchlist");

            // Get the UpdateStockFromYahoo function URL
            var functionUrl = GetUpdateFunctionUrl();
            
            // Update each stock in the watchlist
            int successCount = 0;
            int failCount = 0;

            foreach (var stock in watchlist)
            {
                try
                {
                    _logger.LogInformation($"Updating stock: {stock.Symbol} ({stock.Name})");
                    
                    var response = await _httpClient.GetAsync($"{functionUrl}?symbol={stock.Symbol}");
                    
                    if (response.IsSuccessStatusCode)
                    {
                        var content = await response.Content.ReadAsStringAsync();
                        _logger.LogInformation($"✓ Successfully updated {stock.Symbol}: {content}");
                        successCount++;
                    }
                    else
                    {
                        _logger.LogWarning($"✗ Failed to update {stock.Symbol}: {response.StatusCode}");
                        failCount++;
                    }

                    // Small delay to avoid overwhelming the API
                    await Task.Delay(1000);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error updating stock {stock.Symbol}");
                    failCount++;
                }
            }

            _logger.LogInformation($"Update completed: {successCount} succeeded, {failCount} failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in DailyWatchlistUpdater");
            throw;
        }
    }

    private async Task<List<StockWatchItem>> GetWatchlistFromCosmosAsync()
    {
        try
        {
            var databaseName = Environment.GetEnvironmentVariable("CosmosDatabaseName") ?? "stockDB";
            var database = _cosmosClient.GetDatabase(databaseName);
            var container = database.GetContainer("watchlist");

            // Each document in watchlist is a stock symbol (e.g., id: "AAPL")
            var query = new QueryDefinition("SELECT c.id FROM c");

            var iterator = container.GetItemQueryIterator<dynamic>(query);
            var watchlist = new List<StockWatchItem>();
            
            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                foreach (var document in response)
                {
                    string symbol = document.id?.ToString();
                    if (!string.IsNullOrEmpty(symbol))
                    {
                        watchlist.Add(new StockWatchItem 
                        { 
                            Symbol = symbol,
                            Name = symbol,
                            Priority = "medium"
                        });
                    }
                }
            }

            _logger.LogInformation($"Found {watchlist.Count} stocks in watchlist");
            return watchlist;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading watchlist from Cosmos DB");
            throw;
        }
    }

    private string GetUpdateFunctionUrl()
    {
        // In Azure, use the function app URL
        var functionAppUrl = Environment.GetEnvironmentVariable("WEBSITE_HOSTNAME");
        if (!string.IsNullOrEmpty(functionAppUrl))
        {
            return $"https://{functionAppUrl}/api/UpdateStockFromYahoo";
        }

        // For local development
        return "http://localhost:7071/api/UpdateStockFromYahoo";
    }
}
