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

public class UpdateSingleStockIndicators
{
    private readonly ILogger _logger;
    private readonly CosmosClient _cosmosClient;
    private readonly BlobServiceClient _blobServiceClient;

    public UpdateSingleStockIndicators(ILoggerFactory loggerFactory)
    {
        _logger = loggerFactory.CreateLogger<UpdateSingleStockIndicators>();
        
        var connectionString = Environment.GetEnvironmentVariable("CosmosConnectionString") 
            ?? throw new InvalidOperationException("CosmosConnectionString not configured");
        _cosmosClient = new CosmosClient(connectionString);

        var storageConnectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage")
            ?? throw new InvalidOperationException("AzureWebJobsStorage not configured");
        _blobServiceClient = new BlobServiceClient(storageConnectionString);
    }

    [Function("UpdateSingleStockIndicators")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("UpdateSingleStockIndicators triggered");

        try
        {
            // Get symbol from query string or request body
            string? symbol = req.Query["symbol"];
            
            if (string.IsNullOrEmpty(symbol))
            {
                // Try to read from body
                var requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                if (!string.IsNullOrEmpty(requestBody))
                {
                    var bodyData = JsonSerializer.Deserialize<Dictionary<string, string>>(requestBody);
                    symbol = bodyData?.GetValueOrDefault("symbol");
                }
            }

            if (string.IsNullOrEmpty(symbol))
            {
                return await CreateResponse(req, HttpStatusCode.BadRequest, new { error = "Symbol parameter is required" });
            }

            symbol = symbol.ToUpper();
            _logger.LogInformation($"Processing indicators for {symbol}");

            // Get CSV data from blob
            var priceData = await GetStockDataFromBlobAsync(symbol);
            
            if (priceData.Count < 260) // Need at least 1 year of data
            {
                var message = $"{symbol}: Insufficient data ({priceData.Count} days). Need at least 260 days.";
                _logger.LogWarning(message);
                return await CreateResponse(req, HttpStatusCode.BadRequest, new { 
                    error = message,
                    symbol,
                    dataPoints = priceData.Count,
                    required = 260
                });
            }

            // Read existing triggers from Cosmos DB (to preserve dates)
            var existingIndicators = await GetExistingIndicatorsFromCosmosAsync(symbol);

            // Calculate indicators
            var indicators = CalculateTechnicalIndicators(priceData, existingIndicators);
            
            // Update Cosmos DB
            await UpdateIndicatorsInCosmosAsync(symbol, indicators);

            _logger.LogInformation($"✓ {symbol} indicators updated successfully");

            return await CreateResponse(req, HttpStatusCode.OK, new { 
                symbol,
                status = "success",
                indicators = new {
                    nWeekLowTriggers = indicators.n_week_low.triggers.Select(t => new {
                        weeks = t.weeks,
                        fluctuation = t.fluctuation,
                        triggeredDate = t.previousTriggeredDate
                    })
                }
            });
        }
        catch (FileNotFoundException ex)
        {
            _logger.LogError(ex, "CSV file not found");
            return await CreateResponse(req, HttpStatusCode.NotFound, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in UpdateSingleStockIndicators");
            return await CreateResponse(req, HttpStatusCode.InternalServerError, new { error = ex.Message });
        }
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
            if (parts.Length >= 7)  // CSV format: Date,Low,Open,Volume,High,Close,AdjClose
            {
                try
                {
                    // CSV format: Date(0), Low(1), Open(2), Volume(3), High(4), Close(5), AdjClose(6)
                    var volumeValue = decimal.Parse(parts[3].Trim(), CultureInfo.InvariantCulture);
                    
                    var stockPrice = new StockPrice
                    {
                        Date = DateTime.ParseExact(parts[0].Trim(), "dd-MM-yyyy", CultureInfo.InvariantCulture),
                        Open = decimal.Parse(parts[2].Trim(), CultureInfo.InvariantCulture),
                        High = decimal.Parse(parts[4].Trim(), CultureInfo.InvariantCulture),
                        Low = decimal.Parse(parts[1].Trim(), CultureInfo.InvariantCulture),
                        Close = decimal.Parse(parts[5].Trim(), CultureInfo.InvariantCulture),
                        Volume = (long)volumeValue
                    };
                    
                    // Debug: log 2025-08-01 data
                    if (stockPrice.Date.Year == 2025 && stockPrice.Date.Month == 8 && stockPrice.Date.Day == 1)
                    {
                        _logger.LogInformation($"[CSV PARSED] 2025-08-01: Open={stockPrice.Open}, High={stockPrice.High}, Low={stockPrice.Low}, Close={stockPrice.Close} (expected: Close=202.38)");
                    }
                    
                    prices.Add(stockPrice);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Skipping line {i} due to parse error: {ex.Message}");
                    continue;
                }
            }
        }

        return prices.OrderBy(p => p.Date).ToList();
    }

    private TechnicalIndicators CalculateTechnicalIndicators(List<StockPrice> prices, TechnicalIndicators? existingIndicators)
    {
        var today = prices[^1];

        var indicators = new TechnicalIndicators
        {
            n_week_low = CalculateNWeekLowTriggers(prices, today, existingIndicators?.n_week_low),
            n_week_high = new NWeekIndicator { triggers = new() },
            maCache = new MACache { price = new(), lines = new() },
            rsiCache = new RSICache { values = new() }
        };

        return indicators;
    }

    private NWeekIndicator CalculateNWeekLowTriggers(List<StockPrice> prices, StockPrice today, NWeekIndicator? existingIndicator)
    {
        var triggers = new List<NWeekTrigger>();
        
        _logger.LogInformation($"Starting N-week low calculation. Total prices: {prices.Count}, Today's close: ${today.Close}");
        
        // Define week periods to check: 4, 8, 12, 24, 32, 52
        int[] weekPeriods = { 4, 8, 12, 24, 32, 52 };
        
        // Define fluctuation percentages: 0%, 10%, 20%
        int[] fluctuations = { 0, 10, 20 };
        
        foreach (var weeks in weekPeriods)
        {
            // Convert calendar weeks to approximate trading days
            // 1 week = 5 trading days (Mon-Fri, excluding weekends/holidays)
            int days = weeks * 5; 
            
            if (prices.Count < days)
            {
                _logger.LogWarning($"Skipping {weeks}-week check: insufficient data ({prices.Count} < {days} trading days)");
                continue;
            }
            
            // Get the window of prices for this period (last N trading days including today)
            var window = prices.Skip(prices.Count - days).ToList();
            var windowLow = window.Min(p => p.Close);
            var windowHigh = window.Max(p => p.Close);
            
            _logger.LogInformation($"[{weeks}w = {days}d] Window: Low=${windowLow:F2}, High=${windowHigh:F2}, Range=${windowHigh - windowLow:F2}");
            
            foreach (var fluctuation in fluctuations)
            {
                // Calculate threshold using same logic as frontend (viewer.js)
                // threshold = lowest + (range × fluctuation%)
                // where range = highest - lowest in the window
                var range = windowHigh - windowLow;
                var threshold = windowLow + (range * (fluctuation / 100m));
                
                _logger.LogInformation($"[{weeks}w ±{fluctuation}%] Threshold=${threshold:F2}, Today=${today.Close:F2}, Triggered={today.Close <= threshold}");
                
                DateTime? mostRecentTriggerDate = null;
                
                // Scan backwards from today to find the most recent trigger date
                // We want the LATEST (most recent) day that triggered, not the earliest
                bool foundTrigger = false;
                
                for (int i = prices.Count - 1; i >= days; i--)
                {
                    // Calculate the N-week window for this historical day
                    // Window should include current day (same as frontend logic)
                    // Frontend: slice(fullDataIndex - lowDays, fullDataIndex + 1) = 21 elements for 4 weeks
                    int historicalStartIdx = i - days;
                    var historicalWindow = prices.Skip(historicalStartIdx).Take(days + 1).ToList();
                    
                    if (historicalWindow.Count < days + 1)
                        continue;
                    
                    var historicalLow = historicalWindow.Min(p => p.Close);
                    var historicalHigh = historicalWindow.Max(p => p.Close);
                    var historicalRange = historicalHigh - historicalLow;
                    var historicalThreshold = historicalLow + (historicalRange * (fluctuation / 100m));
                    
                    // Check if this day triggered the condition
                    if (prices[i].Close <= historicalThreshold)
                    {
                        // Found a trigger - record it and stop (we want the most recent one)
                        mostRecentTriggerDate = prices[i].Date;
                        foundTrigger = true;
                        
                        if (weeks == 4 && fluctuation == 0 && prices[i].Date >= new DateTime(2025, 7, 28) && prices[i].Date <= new DateTime(2025, 8, 10))
                        {
                            _logger.LogInformation($"✓ FOUND 4w 0% trigger on {prices[i].Date:yyyy-MM-dd}: Close=${prices[i].Close:F2}, WindowLow=${historicalLow:F2}, WindowHigh=${historicalHigh:F2}, Threshold=${historicalThreshold:F2}, Window=[{historicalStartIdx}..{i}]");
                        }
                        
                        // Stop here - we found the most recent trigger
                        break;
                    }
                    else
                    {
                        if (weeks == 4 && fluctuation == 0 && prices[i].Date >= new DateTime(2025, 7, 28) && prices[i].Date <= new DateTime(2025, 8, 10))
                        {
                            _logger.LogInformation($"✗ NOT triggered on {prices[i].Date:yyyy-MM-dd}: Close=${prices[i].Close:F2}, WindowLow=${historicalLow:F2}, Threshold=${historicalThreshold:F2}");
                        }
                    }
                }
                
                // Log the result
                if (foundTrigger && mostRecentTriggerDate != null)
                {
                    if (weeks == 4 && fluctuation == 0)
                    {
                        _logger.LogInformation($"✓ FOUND 4w 0% trigger on {mostRecentTriggerDate:yyyy-MM-dd}");
                    }
                    else
                    {
                        _logger.LogInformation($"✓ FOUND trigger: {weeks}-week low ±{fluctuation}% on {mostRecentTriggerDate:yyyy-MM-dd}");
                    }
                }
                
                // ALWAYS add the trigger to the list
                triggers.Add(new NWeekTrigger
                {
                    weeks = weeks,
                    fluctuation = fluctuation,
                    previousTriggeredDate = mostRecentTriggerDate // null if never triggered in history
                });
                
                var status = mostRecentTriggerDate.HasValue ? $"last triggered on {mostRecentTriggerDate:yyyy-MM-dd}" : "never triggered in history";
                _logger.LogDebug($"Added trigger: {weeks}-week low ±{fluctuation}% - {status}");
            }
        }
        
        _logger.LogInformation($"N-week low triggers found: {triggers.Count}");
        
        return new NWeekIndicator
        {
            triggers = triggers
        };
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

        var query = new QueryDefinition("SELECT * FROM c WHERE c.id = @id")
            .WithParameter("@id", symbol);
        
        var iterator = container.GetItemQueryIterator<Dictionary<string, object>>(query);
        
        if (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            var document = response.FirstOrDefault();
            
            if (document != null)
            {
                document["n_week_low"] = indicators.n_week_low;
                document["n_week_high"] = indicators.n_week_high;
                document["maCache"] = indicators.maCache;
                document["rsiCache"] = indicators.rsiCache;

                await container.UpsertItemAsync(document, new PartitionKey(symbol));
            }
        }
    }

    private async Task<TechnicalIndicators?> GetExistingIndicatorsFromCosmosAsync(string symbol)
    {
        try
        {
            var databaseName = Environment.GetEnvironmentVariable("CosmosDatabaseName") ?? "stockDB";
            var database = _cosmosClient.GetDatabase(databaseName);
            var container = database.GetContainer("watchlist");

            var query = new QueryDefinition("SELECT * FROM c WHERE c.id = @id")
                .WithParameter("@id", symbol);
            
            var iterator = container.GetItemQueryIterator<Dictionary<string, object>>(query);
            
            if (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                var document = response.FirstOrDefault();
                
                if (document != null)
                {
                    // Try to deserialize existing indicators
                    var indicators = new TechnicalIndicators
                    {
                        n_week_low = document.ContainsKey("n_week_low") 
                            ? System.Text.Json.JsonSerializer.Deserialize<NWeekIndicator>(
                                System.Text.Json.JsonSerializer.Serialize(document["n_week_low"])) 
                                ?? new NWeekIndicator { triggers = new() }
                            : new NWeekIndicator { triggers = new() },
                        n_week_high = new NWeekIndicator { triggers = new() },
                        maCache = new MACache { price = new(), lines = new() },
                        rsiCache = new RSICache { values = new() }
                    };
                    
                    return indicators;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Could not read existing indicators for {symbol}: {ex.Message}");
        }
        
        return null;
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
