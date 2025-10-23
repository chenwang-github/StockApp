using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text;
using Microsoft.Azure.Cosmos;
using System.Net;
using StockApp.Shared;

namespace StockApp.Function;

public class UpdateStockData
{
    private readonly ILogger<UpdateStockData> _logger;
    private readonly HttpClient _httpClient;
    private readonly CosmosDbService _cosmosDbService;

    public UpdateStockData(ILogger<UpdateStockData> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient();
        
        // Set user agent to mimic a browser (Yahoo Finance blocks default HttpClient)
        _httpClient.DefaultRequestHeaders.Add("User-Agent", 
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

        _cosmosDbService = new CosmosDbService(logger);
    }

    [Function("UpdateStockData")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequest req)
    {
        _logger.LogInformation("C# HTTP trigger function processed a request.");

        // Get parameters from query string or request body
        string symbol = req.Query["symbol"].FirstOrDefault() ?? "AAPL";
        
        try
        {
            // Check if stock data already exists in CosmosDB
            var existingDataInfo = await _cosmosDbService.CheckExistingData(symbol);
            
            List<StockDataPoint> newDataToFetch = new List<StockDataPoint>();
            
            if (existingDataInfo.HasNoData)
            {
                // No data found - fetch 1 year of historical data
                _logger.LogInformation("No existing data found for {Symbol}. Fetching 1 year of data.", symbol);
                newDataToFetch = await GetStockDataJson(symbol, 365*3) ?? new List<StockDataPoint>();
            }
            else if (existingDataInfo.NeedsUpdate)
            {
                // Partial data exists - fetch missing recent data
                _logger.LogInformation("Found existing data for {Symbol} up to {LastDate}. Fetching missing data.", 
                    symbol, existingDataInfo.LastDate?.ToString("yyyy-MM-dd"));
                
                var daysSinceLastData = (DateTime.Now.Date - existingDataInfo.LastDate!.Value.Date).Days;
                if (daysSinceLastData > 0)
                {
                    newDataToFetch = await GetStockDataJson(symbol, daysSinceLastData + 5) ?? new List<StockDataPoint>(); // +5 for buffer
                    
                    // Filter out existing data
                    newDataToFetch = newDataToFetch.Where(x => x.Date > existingDataInfo.LastDate.Value.Date).ToList();
                }
            }
            else
            {
                // Data is already up to date - return simple message
                _logger.LogInformation("Data for {Symbol} is already up to date.", symbol);
                
                var upToDateResponse = new
                {
                    symbol = symbol,
                    dataCount = 0,
                    message = "Data is already up to date",
                    data = new List<object>()
                };
                
                return new OkObjectResult(upToDateResponse);
            }

            if (!newDataToFetch.Any())
            {
                return new OkObjectResult(new List<object>());
            }

            // Format new data for CosmosDB storage
            var cosmosDbDocuments = newDataToFetch.Select(dataPoint => new
            {
                id = $"{symbol}_{dataPoint.Date:yyyy-MM-dd}",
                symbol = symbol,
                date = dataPoint.Date.ToString("yyyy-MM-dd"),
                open = dataPoint.Open,
                high = dataPoint.High,
                low = dataPoint.Low,
                close = dataPoint.Close,
                volume = dataPoint.Volume
            }).ToList();

            // Batch upsert to CosmosDB
            await _cosmosDbService.BulkUpsertToCosmosDB(cosmosDbDocuments.Cast<object>().ToList());

            _logger.LogInformation("Successfully prepared {Count} new data points for {Symbol}", cosmosDbDocuments.Count, symbol);
            
            // Return response with data count information
            var response = new
            {
                symbol = symbol,
                dataCount = cosmosDbDocuments.Count,
                dateRange = new
                {
                    from = cosmosDbDocuments.Any() ? cosmosDbDocuments.Min(x => x.date) : null,
                    to = cosmosDbDocuments.Any() ? cosmosDbDocuments.Max(x => x.date) : null
                },
                data = cosmosDbDocuments
            };
            
            return new OkObjectResult(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing stock data for {Symbol}", symbol);
            return new BadRequestObjectResult(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get historical stock data using Yahoo Finance Chart API (JSON format)
    /// This is the most reliable method - same API that Yahoo Finance website uses
    /// Returns structured OHLCV data ready for storage or analysis
    /// </summary>
    private async Task<List<StockDataPoint>?> GetStockDataJson(string symbol, int days = 90)
    {
        try
        {
            // Yahoo Finance Chart API endpoint with custom date range
            var endTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var startTime = endTime - (days * 24 * 60 * 60); // Specified days ago
            
            var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={startTime}&period2={endTime}&interval=1d&includePrePost=false";
            
            _logger.LogInformation("Fetching JSON data from: {Url}", url);
            
            var response = await _httpClient.GetStringAsync(url);
            var jsonDoc = JsonDocument.Parse(response);
            
            // Check if we got a valid response
            var chart = jsonDoc.RootElement.GetProperty("chart");
            if (chart.GetProperty("error").ValueKind != JsonValueKind.Null)
            {
                _logger.LogError("Yahoo Finance API returned error for symbol: {Symbol}", symbol);
                return null;
            }

            var result = chart.GetProperty("result")[0];
            var timestamps = result.GetProperty("timestamp").EnumerateArray().Select(x => x.GetInt64()).ToArray();
            var quotes = result.GetProperty("indicators").GetProperty("quote")[0];
            
            // Extract OHLCV data arrays
            var opens = quotes.GetProperty("open").EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? (decimal?)null : (decimal)x.GetDouble()).ToArray();
            var highs = quotes.GetProperty("high").EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? (decimal?)null : (decimal)x.GetDouble()).ToArray();
            var lows = quotes.GetProperty("low").EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? (decimal?)null : (decimal)x.GetDouble()).ToArray();
            var closes = quotes.GetProperty("close").EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? (decimal?)null : (decimal)x.GetDouble()).ToArray();
            var volumes = quotes.GetProperty("volume").EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? (long?)null : x.GetInt64()).ToArray();

            // Build structured data points
            var dataPoints = new List<StockDataPoint>();
            for (int i = 0; i < timestamps.Length; i++)
            {
                // Only include complete data points (skip weekends/holidays with null values)
                if (opens[i].HasValue && highs[i].HasValue && lows[i].HasValue && closes[i].HasValue)
                {
                    dataPoints.Add(new StockDataPoint
                    {
                        Date = DateTimeOffset.FromUnixTimeSeconds(timestamps[i]).DateTime.Date,
                        Open = Math.Round(opens[i].Value, 2),
                        High = Math.Round(highs[i].Value, 2),
                        Low = Math.Round(lows[i].Value, 2),
                        Close = Math.Round(closes[i].Value, 2),
                        Volume = volumes[i] ?? 0
                    });
                }
            }

            _logger.LogInformation("Successfully parsed {Count} data points for {Symbol}", dataPoints.Count, symbol);
            return dataPoints.OrderBy(x => x.Date).ToList(); // Ensure chronological order
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching JSON data for {Symbol}", symbol);
            return null;
        }
    }

}