using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StockApp.Shared;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Add HTTP extensions - This was missing!
builder.Services.AddHttpClient();

// Add CORS support
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Register CosmosDbService with logger factory
builder.Services.AddSingleton<CosmosDbService>(sp =>
{
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("CosmosDbService");
    return new CosmosDbService(logger);
});

// Register EmailNotificationService with logger factory
builder.Services.AddSingleton<EmailNotificationService>(sp =>
{
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("EmailNotificationService");
    return new EmailNotificationService(logger);
});

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

var host = builder.Build();

// Use CORS
host.Run();
