using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using StockApp.Shared;

namespace StockApp.Function;

public class StockAnalyze
{
    private readonly ILogger<StockAnalyze> _logger;
    private readonly CosmosDbService _cosmosDbService;

    public StockAnalyze(ILogger<StockAnalyze> logger)
    {
        _logger = logger;
        _cosmosDbService = new CosmosDbService(logger);
    }

    // Add your analysis functions here
}