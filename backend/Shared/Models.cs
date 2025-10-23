using System.Text.Json.Serialization;

namespace StockApp.Shared;

public class StockDataPoint
{
    public DateTime Date { get; set; }
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public long Volume { get; set; }
}

public class ExistingDataInfo
{
    public bool HasNoData { get; set; }
    public DateTime? LastDate { get; set; }
    public bool NeedsUpdate { get; set; }
}

// Models for Daily Stock Updater Watch List
public class WatchListConfig
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "stock-watchlist";

    [JsonPropertyName("stocks")]
    public List<StockWatchItem> Stocks { get; set; } = new();

    [JsonPropertyName("lastModified")]
    public DateTime LastModified { get; set; }

    [JsonPropertyName("notes")]
    public string Notes { get; set; }
}

public class StockWatchItem
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("priority")]
    public string Priority { get; set; } // "high", "medium", "low"

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;
}