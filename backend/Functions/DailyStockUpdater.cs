using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using StockApp.Shared;

namespace StockApp
{
    public class DailyStockUpdater
    {
        private readonly ILogger _logger;
        private readonly CosmosDbService _cosmosDbService;
        private readonly HttpClient _httpClient;
        private readonly EmailNotificationService _emailService;
        private const double CRITICAL_FAILURE_THRESHOLD = 0.5; // 50% failure rate triggers email

        public DailyStockUpdater(ILoggerFactory loggerFactory, CosmosDbService cosmosDbService, HttpClient httpClient)
        {
            _logger = loggerFactory.CreateLogger<DailyStockUpdater>();
            _cosmosDbService = cosmosDbService;
            _httpClient = httpClient;
            _emailService = new EmailNotificationService(_logger);
        }

        /// <summary>
        /// Timer Function that runs every weekday after US market closes
        /// CRON: "0 0 2 * * 1-5" = 2:00 AM UTC (9:00 PM EST previous day / 6:00 PM PST previous day)
        /// This ensures market has closed (4:00 PM EST) before updating
        /// </summary>
        [Function("DailyStockUpdater")]
        public async Task Run([TimerTrigger("0 0 2 * * 1-5")] TimerInfo timer)
        {
            _logger.LogInformation($"DailyStockUpdater triggered at: {DateTime.UtcNow}");
            _logger.LogInformation($"Next scheduled run: {timer.ScheduleStatus?.Next}");

            try
            {
                // 1. Load watch list from Cosmos DB
                var watchList = await LoadWatchListAsync();
                
                if (watchList == null || watchList.Count == 0)
                {
                    _logger.LogWarning("Watch list is empty or not found. Creating default list...");
                    await CreateDefaultWatchListAsync();
                    watchList = await LoadWatchListAsync();
                }

                _logger.LogInformation($"Loaded watch list with {watchList.Count} stocks");

                // 2. Filter active stocks
                var activeStocks = watchList
                    .Where(s => s.IsActive)
                    .OrderByDescending(s => GetPriorityValue(s.Priority))
                    .ToList();

                if (activeStocks.Count == 0)
                {
                    _logger.LogWarning("No active stocks to update");
                    return;
                }

                _logger.LogInformation($"Updating {activeStocks.Count} active stocks: {string.Join(", ", activeStocks.Select(s => s.Symbol))}");

                // 3. Update stocks with rate limiting
                var results = await UpdateStocksAsync(activeStocks);

                // 4. Log summary
                LogUpdateSummary(results);

                // 5. Check for critical failures and send email notification if needed
                await CheckAndNotifyFailuresAsync(results, activeStocks.Count);

                _logger.LogInformation("DailyStockUpdater completed successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Critical error in DailyStockUpdater");
                
                // Send critical failure notification
                await _emailService.SendCriticalFailureNotificationAsync(
                    ex.Message,
                    ex.StackTrace ?? "No stack trace available");
                
                throw; // Rethrow to let Azure Functions runtime handle retry
            }
        }

        private async Task<List<StockWatchItem>> LoadWatchListAsync()
        {
            try
            {
                var config = await _cosmosDbService.GetWatchListConfigAsync();
                return config?.Stocks ?? new List<StockWatchItem>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading watch list from Cosmos DB");
                return new List<StockWatchItem>();
            }
        }

        private async Task CreateDefaultWatchListAsync()
        {
            try
            {
                var defaultConfig = new WatchListConfig
                {
                    Id = "stock-watchlist",
                    Stocks = new List<StockWatchItem>
                    {
                        new StockWatchItem
                        {
                            Symbol = "AAPL",
                            Name = "Apple Inc.",
                            Priority = "high",
                            IsActive = true
                        },
                        new StockWatchItem
                        {
                            Symbol = "TSLA",
                            Name = "Tesla, Inc.",
                            Priority = "high",
                            IsActive = true
                        }
                    },
                    LastModified = DateTime.UtcNow,
                    Notes = "Auto-generated default watch list"
                };

                await _cosmosDbService.SaveWatchListConfigAsync(defaultConfig);
                _logger.LogInformation("Default watch list created successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating default watch list");
            }
        }

        private async Task<Dictionary<string, UpdateResult>> UpdateStocksAsync(List<StockWatchItem> stocks)
        {
            var results = new Dictionary<string, UpdateResult>();
            var semaphore = new SemaphoreSlim(3); // Max 3 concurrent requests to avoid rate limiting
            var baseUrl = Environment.GetEnvironmentVariable("FunctionAppUrl") ?? "http://localhost:7071";

            var updateTasks = stocks.Select(async stock =>
            {
                await semaphore.WaitAsync();
                try
                {
                    var startTime = DateTime.UtcNow;
                    var success = await CallUpdateApiAsync(stock.Symbol, baseUrl);
                    var duration = DateTime.UtcNow - startTime;

                    results[stock.Symbol] = new UpdateResult
                    {
                        Success = success,
                        Duration = duration,
                        Timestamp = DateTime.UtcNow
                    };

                    if (success)
                    {
                        _logger.LogInformation($"✓ Successfully updated {stock.Symbol} ({stock.Name}) in {duration.TotalSeconds:F1}s");
                    }
                    else
                    {
                        _logger.LogWarning($"✗ Failed to update {stock.Symbol} ({stock.Name})");
                    }

                    // Add delay to avoid rate limiting from Yahoo Finance
                    await Task.Delay(2000); // 2 seconds between requests
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Exception updating {stock.Symbol}");
                    results[stock.Symbol] = new UpdateResult
                    {
                        Success = false,
                        Duration = TimeSpan.Zero,
                        Timestamp = DateTime.UtcNow,
                        Error = ex.Message
                    };
                }
                finally
                {
                    semaphore.Release();
                }
            });

            await Task.WhenAll(updateTasks);
            return results;
        }

        private async Task<bool> CallUpdateApiAsync(string symbol, string baseUrl)
        {
            try
            {
                var url = $"{baseUrl}/api/UpdateStockData?symbol={symbol}";
                _logger.LogInformation($"Calling update API: {url}");

                var response = await _httpClient.GetAsync(url);
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    _logger.LogDebug($"Response for {symbol}: {content}");
                    return true;
                }
                else
                {
                    var content = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning($"Update API returned {response.StatusCode} for {symbol}: {content}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"HTTP request failed for {symbol}");
                return false;
            }
        }

        private void LogUpdateSummary(Dictionary<string, UpdateResult> results)
        {
            var successful = results.Count(r => r.Value.Success);
            var failed = results.Count(r => !r.Value.Success);
            var totalDuration = TimeSpan.FromSeconds(results.Sum(r => r.Value.Duration.TotalSeconds));
            var avgDuration = results.Any() ? totalDuration.TotalSeconds / results.Count : 0;

            _logger.LogInformation("═══════════════════════════════════════");
            _logger.LogInformation("📊 Daily Stock Update Summary");
            _logger.LogInformation("═══════════════════════════════════════");
            _logger.LogInformation($"✓ Successful: {successful}");
            _logger.LogInformation($"✗ Failed: {failed}");
            _logger.LogInformation($"⏱️ Total Duration: {totalDuration.TotalSeconds:F1}s");
            _logger.LogInformation($"📈 Average Duration: {avgDuration:F1}s per stock");
            _logger.LogInformation("═══════════════════════════════════════");

            if (failed > 0)
            {
                var failedSymbols = results
                    .Where(r => !r.Value.Success)
                    .Select(r => $"{r.Key} ({r.Value.Error ?? "Unknown error"})")
                    .ToList();
                
                _logger.LogWarning($"Failed stocks: {string.Join(", ", failedSymbols)}");
            }

            // Log detailed results
            foreach (var result in results.OrderBy(r => r.Key))
            {
                var status = result.Value.Success ? "✓" : "✗";
                var duration = result.Value.Duration.TotalSeconds;
                _logger.LogInformation($"{status} {result.Key}: {duration:F1}s");
            }
        }

        /// <summary>
        /// Check failure rate and send email notification if critical threshold exceeded
        /// </summary>
        private async Task CheckAndNotifyFailuresAsync(Dictionary<string, UpdateResult> results, int totalStocks)
        {
            var failedStocks = results.Where(r => !r.Value.Success).ToList();
            var failedCount = failedStocks.Count;

            if (failedCount == 0)
            {
                _logger.LogInformation("All stocks updated successfully. No notification needed.");
                return;
            }

            var failureRate = (double)failedCount / totalStocks;

            if (failureRate >= CRITICAL_FAILURE_THRESHOLD)
            {
                _logger.LogWarning($"Critical failure rate detected: {failureRate:P1} ({failedCount}/{totalStocks})");

                var failedSymbols = string.Join(", ", failedStocks.Select(f => f.Key));
                var errorDetails = string.Join("\n", failedStocks.Select(f => 
                    $"• {f.Key}: {f.Value.Error ?? "Unknown error"}"));

                var subject = $"⚠️ DailyStockUpdater: {failureRate:P0} Failure Rate ({failedCount}/{totalStocks} stocks failed)";

                await _emailService.SendFailureNotificationAsync(
                    subject,
                    errorDetails,
                    totalStocks,
                    failedCount,
                    failedSymbols);

                _logger.LogInformation($"Failure notification email sent for {failedCount} failed stocks");
            }
            else
            {
                _logger.LogInformation($"Failure rate {failureRate:P1} is below threshold ({CRITICAL_FAILURE_THRESHOLD:P0}). No notification sent.");
            }
        }

        private int GetPriorityValue(string priority)
        {
            return priority?.ToLower() switch
            {
                "high" => 3,
                "medium" => 2,
                "low" => 1,
                _ => 0
            };
        }

        private class UpdateResult
        {
            public bool Success { get; set; }
            public TimeSpan Duration { get; set; }
            public DateTime Timestamp { get; set; }
            public string Error { get; set; }
        }
    }
}
