using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Azure.Storage.Blobs;

namespace StockApp.Function;

public class GetStockCsv
{
    private readonly ILogger<GetStockCsv> _logger;
    private readonly BlobServiceClient _blobServiceClient;
    private const string CONTAINER_NAME = "stock-data";

    public GetStockCsv(ILogger<GetStockCsv> logger)
    {
        _logger = logger;
        
        var connectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
        _blobServiceClient = new BlobServiceClient(connectionString);
    }

    [Function("GetStockCsv")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequest req)
    {
        string? symbol = req.Query["symbol"].FirstOrDefault();
        
        if (string.IsNullOrEmpty(symbol))
        {
            return new BadRequestObjectResult(new { error = "Symbol parameter is required" });
        }

        symbol = symbol.ToUpper();

        try
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(CONTAINER_NAME);
            var blobClient = containerClient.GetBlobClient($"{symbol}.csv");

            if (!await blobClient.ExistsAsync())
            {
                return new NotFoundResult();
            }

            var download = await blobClient.DownloadContentAsync();
            var csvContent = download.Value.Content.ToString();

            return new ContentResult
            {
                Content = csvContent,
                ContentType = "text/csv",
                StatusCode = 200
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading CSV for {Symbol}", symbol);
            return new StatusCodeResult(500);
        }
    }
}
