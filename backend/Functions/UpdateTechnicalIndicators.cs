using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Azure.Storage.Blobs;
using System.Net;
using System.Text.Json;
using System.Globalization;
using StockApp.Shared;

namespace StockApp.Functions;

public class UpdateTechnicalIndicators
{
    private readonly ILogger _logger;
    private readonly CosmosClient _cosmosClient;
    private readonly BlobServiceClient _blobServiceClient;

    public UpdateTechnicalIndicators(ILoggerFactory loggerFactory)
    {
        _logger = loggerFactory.CreateLogger<UpdateTechnicalIndicators>();
        
        var connectionString = Environment.GetEnvironmentVariable("CosmosConnectionString") 
            ?? throw new InvalidOperationException("CosmosConnectionString not configured");
        _cosmosClient = new CosmosClient(connectionString);

        var storageConnectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage")
            ?? throw new InvalidOperationException("AzureWebJobsStorage not configured");
        _blobServiceClient = new BlobServiceClient(storageConnectionString);
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

            foreach (var stock in watchlist)
            {
                try
                {
                    _logger.LogInformation($"Processing {stock.Symbol}...");

                    // Get CSV data from blob
                    var priceData = await GetStockDataFromBlobAsync(stock.Symbol);
                    
                    if (priceData.Count < 260) // Need at least 1 year of data (52 weeks * 5 days)
                    {
                        _logger.LogWarning($"{stock.Symbol}: Insufficient data ({priceData.Count} days)");
                        continue;
                    }

                    // Calculate indicators
                    var indicators = CalculateTechnicalIndicators(priceData);
                    
                    // Update Cosmos DB
                    await UpdateIndicatorsInCosmosAsync(stock.Symbol, indicators);

                    results.Add(new { 
                        symbol = stock.Symbol, 
                        status = "success",
                        nWeekLow = indicators.n_week_low.n,
                        nWeekHigh = indicators.n_week_high.n
                    });

                    _logger.LogInformation($"✓ {stock.Symbol} updated successfully");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error processing {stock.Symbol}");
                    results.Add(new { symbol = stock.Symbol, status = "error", message = ex.Message });
                }
            }

            return await CreateResponse(req, HttpStatusCode.OK, new { 
                message = "Technical indicators updated",
                results 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in UpdateTechnicalIndicators");
            return await CreateResponse(req, HttpStatusCode.InternalServerError, new { error = ex.Message });
        }
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

        return watchlist;
    }

    private async Task<List<StockPrice>> GetStockDataFromBlobAsync(string symbol)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient("stock-data");
        var blobClient = containerClient.GetBlobClient($"{symbol}.csv");

        if (!await blobClient.ExistsAsync())
        {
            throw new FileNotFoundException($"CSV file not found for {symbol}");
        }

        var download = await blobClient.DownloadContentAsync();
        var csvContent = download.Value.Content.ToString();
        
        var lines = csvContent.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var prices = new List<StockPrice>();

        // Skip header
        for (int i = 1; i < lines.Length; i++)
        {
            var parts = lines[i].Split(',');
            if (parts.Length >= 6)
            {
                try
                {
                    // Date format is dd-MM-yyyy (e.g., "21-10-2015")
                    // Volume might be a decimal or large number, parse as decimal then convert
                    var volumeValue = decimal.Parse(parts[5].Trim(), CultureInfo.InvariantCulture);
                    
                    prices.Add(new StockPrice
                    {
                        Date = DateTime.ParseExact(parts[0].Trim(), "dd-MM-yyyy", CultureInfo.InvariantCulture),
                        Open = decimal.Parse(parts[1].Trim(), CultureInfo.InvariantCulture),
                        High = decimal.Parse(parts[2].Trim(), CultureInfo.InvariantCulture),
                        Low = decimal.Parse(parts[3].Trim(), CultureInfo.InvariantCulture),
                        Close = decimal.Parse(parts[4].Trim(), CultureInfo.InvariantCulture),
                        Volume = (long)volumeValue
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Skipping line {i} due to parse error: {ex.Message}");
                    continue;
                }
            }
        }

        // Sort by date ascending (oldest first)
        return prices.OrderBy(p => p.Date).ToList();
    }

    private TechnicalIndicators CalculateTechnicalIndicators(List<StockPrice> prices)
    {
        var today = prices[^1]; // Last item (most recent)
        var prev = prices[^2];  // Second to last

        var indicators = new TechnicalIndicators
        {
            n_week_low = new NWeekIndicator
            {
                max_n = 52,
                n = 0 // Default to 0 (not a low)
            },
            n_week_high = new NWeekIndicator
            {
                max_n = 52,
                n = 0 // Default to 0 (not a high)
            },
            maCache = CalculateMA(prices),
            rsiCache = CalculateRSI(prices, 14)
        };

        // Find the maximum n-week low (how many weeks back is current price the lowest)
        for (int weeks = 52; weeks >= 1; weeks--) // Start from 52 down to 1
        {
            int days = weeks * 5; // Approximate trading days per week
            
            if (prices.Count >= days)
            {
                var window = prices.Skip(prices.Count - days).ToList();
                var windowLow = window.Min(p => p.Low);

                // Check if today's close is at or near the low (within 1%)
                if (today.Close <= windowLow * 1.01m)
                {
                    indicators.n_week_low.n = weeks; // Keep the largest week count
                }
            }
        }

        // Find the maximum n-week high (how many weeks back is current price the highest)
        for (int weeks = 52; weeks >= 1; weeks--) // Start from 52 down to 1
        {
            int days = weeks * 5;
            
            if (prices.Count >= days)
            {
                var window = prices.Skip(prices.Count - days).ToList();
                var windowHigh = window.Max(p => p.High);

                // Check if today's close is at or near the high (within 1%)
                if (today.Close >= windowHigh * 0.99m)
                {
                    indicators.n_week_high.n = weeks; // Keep the largest week count
                }
            }
        }

        return indicators;
    }

    private MACache CalculateMA(List<StockPrice> prices)
    {
        var today = prices[^1];
        var prev = prices[^2];

        return new MACache
        {
            price = new PricePoint
            {
                today = (double)today.Close,
                prev = (double)prev.Close
            },
            lines = new Dictionary<string, MALine>
            {
                ["10"] = CalculateMALine(prices, 10),
                ["50"] = CalculateMALine(prices, 50),
                ["100"] = CalculateMALine(prices, 100),
                ["200"] = CalculateMALine(prices, 200)
            }
        };
    }

    private MALine CalculateMALine(List<StockPrice> prices, int period)
    {
        if (prices.Count < period + 1)
        {
            return new MALine { today = 0, prev = 0 };
        }

        var todayMA = prices.Skip(prices.Count - period).Take(period).Average(p => (double)p.Close);
        var prevMA = prices.Skip(prices.Count - period - 1).Take(period).Average(p => (double)p.Close);

        return new MALine
        {
            today = Math.Round(todayMA, 2),
            prev = Math.Round(prevMA, 2)
        };
    }

    private RSICache CalculateRSI(List<StockPrice> prices, int period)
    {
        if (prices.Count < period + 2)
        {
            return new RSICache { period = period, values = new RSIValues { today = 0, prev = 0 } };
        }

        var todayRSI = ComputeRSI(prices, prices.Count - 1, period);
        var prevRSI = ComputeRSI(prices, prices.Count - 2, period);

        return new RSICache
        {
            period = period,
            values = new RSIValues
            {
                today = Math.Round(todayRSI, 1),
                prev = Math.Round(prevRSI, 1)
            }
        };
    }

    private double ComputeRSI(List<StockPrice> prices, int endIndex, int period)
    {
        var gains = new List<decimal>();
        var losses = new List<decimal>();

        for (int i = endIndex - period + 1; i <= endIndex; i++)
        {
            var change = prices[i].Close - prices[i - 1].Close;
            if (change > 0)
            {
                gains.Add(change);
                losses.Add(0);
            }
            else
            {
                gains.Add(0);
                losses.Add(Math.Abs(change));
            }
        }

        var avgGain = gains.Average();
        var avgLoss = losses.Average();

        if (avgLoss == 0) return 100;
        
        var rs = avgGain / avgLoss;
        var rsi = 100 - (100 / (1 + rs));

        return (double)rsi;
    }

    private async Task UpdateIndicatorsInCosmosAsync(string symbol, TechnicalIndicators indicators)
    {
        var databaseName = Environment.GetEnvironmentVariable("CosmosDatabaseName") ?? "stockDB";
        var database = _cosmosClient.GetDatabase(databaseName);
        var container = database.GetContainer("watchlist");

        // Read existing document
        var query = new QueryDefinition("SELECT * FROM c WHERE c.id = @id")
            .WithParameter("@id", symbol);
        
        var iterator = container.GetItemQueryIterator<Dictionary<string, object>>(query);
        
        if (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            var document = response.FirstOrDefault();
            
            if (document != null)
            {
                // Update the document with new indicators
                document["n_week_low"] = indicators.n_week_low;
                document["n_week_high"] = indicators.n_week_high;
                document["maCache"] = indicators.maCache;
                document["rsiCache"] = indicators.rsiCache;

                await container.UpsertItemAsync(document, new PartitionKey(symbol));
            }
        }
    }

    private async Task<HttpResponseData> CreateResponse(HttpRequestData req, HttpStatusCode statusCode, object content)
    {
        var response = req.CreateResponse(statusCode);
        await response.WriteAsJsonAsync(content);
        return response;
    }
}

// Model specific to this function
public class StockPrice
{
    public DateTime Date { get; set; }
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public long Volume { get; set; }
}
