using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using System.Net;
using System.Text.Json;
using StockApp.Shared;

namespace StockApp.Functions;

public class UpdateTechnicalIndicators
{
    private readonly ILogger _logger;
    private readonly CosmosClient _cosmosClient;
    private readonly HttpClient _httpClient;

    public UpdateTechnicalIndicators(ILoggerFactory loggerFactory, IHttpClientFactory httpClientFactory)
    {
        _logger = loggerFactory.CreateLogger<UpdateTechnicalIndicators>();
        _httpClient = httpClientFactory.CreateClient();
        
        var connectionString = Environment.GetEnvironmentVariable("CosmosConnectionString") 
            ?? throw new InvalidOperationException("CosmosConnectionString not configured");
        _cosmosClient = new CosmosClient(connectionString);
    }

    [Function("UpdateTechnicalIndicators")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("UpdateTechnicalIndicators triggered");

        try
        {
            // Get watchlist from Cosmos DB
            var watchlist = await GetWatchlistAsync();
            
            if (watchlist.Count == 0)
            {
                return await CreateResponse(req, HttpStatusCode.OK, "No stocks in watchlist");
            }

            var results = new List<object>();
            var functionUrl = GetUpdateSingleStockFunctionUrl();

            foreach (var stock in watchlist)
            {
                try
                {
                    _logger.LogInformation($"Processing {stock.Symbol}...");

                    // Call UpdateSingleStockIndicators API
                    var requestBody = JsonSerializer.Serialize(new { symbol = stock.Symbol });
                    var content = new StringContent(requestBody, System.Text.Encoding.UTF8, "application/json");
                    
                    var response = await _httpClient.PostAsync(functionUrl, content);
                    var responseContent = await response.Content.ReadAsStringAsync();

                    if (response.IsSuccessStatusCode)
                    {
                        var result = JsonSerializer.Deserialize<Dictionary<string, object>>(responseContent);
                        results.Add(new { 
                            symbol = stock.Symbol, 
                            status = "success",
                            details = result
                        });
                        _logger.LogInformation($"✓ {stock.Symbol} updated successfully");
                    }
                    else
                    {
                        _logger.LogWarning($"Failed to update {stock.Symbol}: {responseContent}");
                        results.Add(new { 
                            symbol = stock.Symbol, 
                            status = "error", 
                            message = responseContent 
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error processing {stock.Symbol}");
                    results.Add(new { symbol = stock.Symbol, status = "error", message = ex.Message });
                }
            }

            return await CreateResponse(req, HttpStatusCode.OK, new { 
                message = "Technical indicators update completed",
                totalStocks = watchlist.Count,
                results 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in UpdateTechnicalIndicators");
            return await CreateResponse(req, HttpStatusCode.InternalServerError, new { error = ex.Message });
        }
    }

    private string GetUpdateSingleStockFunctionUrl()
    {
        // Try to get from environment variable first
        var customUrl = Environment.GetEnvironmentVariable("UpdateSingleStockFunctionUrl");
        if (!string.IsNullOrEmpty(customUrl))
        {
            return customUrl;
        }

        // Default for local development
        if (Environment.GetEnvironmentVariable("AZURE_FUNCTIONS_ENVIRONMENT") == "Development")
        {
            return "http://localhost:7071/api/UpdateSingleStockIndicators";
        }

        // For Azure deployment, construct URL from function app name
        var functionAppName = Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME");
        return $"https://{functionAppName}.azurewebsites.net/api/UpdateSingleStockIndicators";
    }

    private async Task<List<StockWatchItem>> GetWatchlistAsync()
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
                string? symbol = document.id?.ToString();
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

        return watchlist;
    }

    private async Task<HttpResponseData> CreateResponse(HttpRequestData req, HttpStatusCode statusCode, object content)
    {
        var response = req.CreateResponse(statusCode);
        await response.WriteAsJsonAsync(content);
        return response;
    }
}
