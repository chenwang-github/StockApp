using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using StockApp.Shared;

namespace StockApp.Function;

public class UpdateStockFromYahoo
{
    private readonly ILogger<UpdateStockFromYahoo> _logger;
    private readonly HttpClient _httpClient;
    private readonly BlobServiceClient _blobServiceClient;
    private const string CONTAINER_NAME = "stock-data";
    private const int MAX_YEARS = 10;

    public UpdateStockFromYahoo(ILogger<UpdateStockFromYahoo> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient();
        
        // Set user agent to mimic a browser (Yahoo Finance blocks default HttpClient)
        _httpClient.DefaultRequestHeaders.Add("User-Agent", 
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

        // Initialize Blob Service Client
        var connectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
        _blobServiceClient = new BlobServiceClient(connectionString);
    }

    [Function("UpdateStockFromYahoo")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req)
    {
        _logger.LogInformation("UpdateStockFromYahoo function triggered.");

        // Get symbol parameter
        string? symbol = req.Query["symbol"].FirstOrDefault();
        
        if (string.IsNullOrEmpty(symbol))
        {
            return new BadRequestObjectResult(new { error = "Symbol parameter is required" });
        }

        symbol = symbol.ToUpper();
        _logger.LogInformation("Processing stock symbol: {Symbol}", symbol);

        try
        {
            // Ensure container exists with public read access for blobs
            var containerClient = _blobServiceClient.GetBlobContainerClient(CONTAINER_NAME);
            await containerClient.CreateIfNotExistsAsync(PublicAccessType.Blob);

            // Get blob reference
            var blobName = $"{symbol}.csv";
            var blobClient = containerClient.GetBlobClient(blobName);

            DateTime startDate;
            DateTime? lastDataDate = null;
            bool isNewFile = false;

            // Check if blob exists and get the last date
            if (await blobClient.ExistsAsync())
            {
                _logger.LogInformation("Existing CSV found for {Symbol}. Checking last date...", symbol);
                lastDataDate = await GetLastDateFromBlob(blobClient);
                
                if (lastDataDate.HasValue)
                {
                    // Update from the day after the last recorded date
                    startDate = lastDataDate.Value.AddDays(1);
                    _logger.LogInformation("Last data date: {LastDate}. Will fetch from {StartDate}", 
                        lastDataDate.Value.ToString("yyyy-MM-dd"), startDate.ToString("yyyy-MM-dd"));
                }
                else
                {
                    // File exists but couldn't parse date, fetch full history
                    startDate = DateTime.Now.AddYears(-MAX_YEARS);
                    isNewFile = true;
                    _logger.LogWarning("Could not parse last date from existing file. Fetching full history.");
                }
            }
            else
            {
                // New file - fetch up to 10 years of history
                startDate = DateTime.Now.AddYears(-MAX_YEARS);
                isNewFile = true;
                _logger.LogInformation("No existing data for {Symbol}. Fetching up to {Years} years of history.", 
                    symbol, MAX_YEARS);
            }

            // Fetch stock data from Yahoo Finance
            var stockData = await FetchStockDataFromYahoo(symbol, startDate, DateTime.Now);

            if (stockData == null || !stockData.Any())
            {
                return new OkObjectResult(new 
                { 
                    symbol = symbol,
                    message = "No new data available",
                    recordsAdded = 0
                });
            }

            // Convert to CSV format
            var csvContent = ConvertToCsv(stockData);

            if (isNewFile)
            {
                // Upload new CSV file
                await UploadCsvToBlob(blobClient, csvContent);
                _logger.LogInformation("Created new CSV for {Symbol} with {Count} records", 
                    symbol, stockData.Count);
            }
            else
            {
                // Append to existing CSV file
                await AppendCsvToBlob(blobClient, csvContent);
                _logger.LogInformation("Updated CSV for {Symbol} with {Count} new records", 
                    symbol, stockData.Count);
            }

            return new OkObjectResult(new
            {
                symbol = symbol,
                message = isNewFile ? "New file created" : "File updated",
                recordsAdded = stockData.Count,
                dateRange = new
                {
                    from = stockData.Min(x => x.Date).ToString("yyyy-MM-dd"),
                    to = stockData.Max(x => x.Date).ToString("yyyy-MM-dd")
                },
                blobPath = $"{CONTAINER_NAME}/{blobName}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing stock data for {Symbol}", symbol);
            return new BadRequestObjectResult(new { error = ex.Message, details = ex.ToString() });
        }
    }

    /// <summary>
    /// Fetch stock data from Yahoo Finance API
    /// </summary>
    private async Task<List<StockDataPoint>?> FetchStockDataFromYahoo(string symbol, DateTime startDate, DateTime endDate)
    {
        try
        {
            var startTime = new DateTimeOffset(startDate).ToUnixTimeSeconds();
            var endTime = new DateTimeOffset(endDate).ToUnixTimeSeconds();
            
            var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={startTime}&period2={endTime}&interval=1d&includePrePost=false";
            
            _logger.LogInformation("Fetching data: {Url}", url);
            
            var response = await _httpClient.GetStringAsync(url);
            var jsonDoc = JsonDocument.Parse(response);
            
            // Check if we got a valid response
            var chart = jsonDoc.RootElement.GetProperty("chart");
            if (chart.GetProperty("error").ValueKind != JsonValueKind.Null)
            {
                var errorMsg = chart.GetProperty("error").GetProperty("description").GetString();
                _logger.LogError("Yahoo Finance API error for {Symbol}: {Error}", symbol, errorMsg);
                return null;
            }

            var result = chart.GetProperty("result")[0];
            var timestamps = result.GetProperty("timestamp").EnumerateArray()
                .Select(x => x.GetInt64()).ToArray();
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

            _logger.LogInformation("Successfully fetched {Count} data points for {Symbol}", dataPoints.Count, symbol);
            return dataPoints.OrderBy(x => x.Date).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching data from provider for {Symbol}", symbol);
            return null;
        }
    }

    /// <summary>
    /// Get the last date from existing blob CSV
    /// </summary>
    private async Task<DateTime?> GetLastDateFromBlob(BlobClient blobClient)
    {
        try
        {
            var download = await blobClient.DownloadContentAsync();
            var content = download.Value.Content.ToString();
            
            var lines = content.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            
            // Skip header and get last line
            if (lines.Length > 1)
            {
                var lastLine = lines[^1].Trim();
                var columns = lastLine.Split(',');
                
                // Assuming first column is date in DD-MM-YYYY format
                if (columns.Length > 0 && DateTime.TryParseExact(
                    columns[0], 
                    "dd-MM-yyyy", 
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out DateTime lastDate))
                {
                    return lastDate;
                }
            }
            
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading last date from blob");
            return null;
        }
    }

    /// <summary>
    /// Convert stock data to CSV format (matching your existing format: Date,Low,Open,Volume,High,Close,Adjusted Close)
    /// </summary>
    private string ConvertToCsv(List<StockDataPoint> stockData)
    {
        var sb = new StringBuilder();
        
        // Add header
        sb.AppendLine("Date,Low,Open,Volume,High,Close,Adjusted Close");
        
        // Add data rows in DD-MM-YYYY format to match your existing CSV files
        foreach (var data in stockData)
        {
            sb.AppendLine($"{data.Date:dd-MM-yyyy},{data.Low},{data.Open},{data.Volume},{data.High},{data.Close},{data.Close}");
        }
        
        return sb.ToString();
    }

    /// <summary>
    /// Upload CSV content to blob (for new files)
    /// </summary>
    private async Task UploadCsvToBlob(BlobClient blobClient, string csvContent)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csvContent));
        await blobClient.UploadAsync(stream, overwrite: true);
    }

    /// <summary>
    /// Append new data to existing CSV blob
    /// </summary>
    private async Task AppendCsvToBlob(BlobClient blobClient, string newCsvContent)
    {
        // Download existing content
        var download = await blobClient.DownloadContentAsync();
        var existingContent = download.Value.Content.ToString();
        
        // Remove header from new content (skip first line)
        var newLines = newCsvContent.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var dataLines = string.Join('\n', newLines.Skip(1));
        
        // Append new data
        var updatedContent = existingContent.TrimEnd() + '\n' + dataLines;
        
        // Upload updated content
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(updatedContent));
        await blobClient.UploadAsync(stream, overwrite: true);
    }
}
