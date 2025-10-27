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

// Models for Technical Indicators
public class WatchlistDocument
{
    public string id { get; set; }
    public List<StockWatchItem> Watchlist { get; set; }
}

public class TechnicalIndicators
{
    public NWeekIndicator n_week_low { get; set; }
    public NWeekIndicator n_week_high { get; set; }
    public MACache maCache { get; set; }
    public RSICache rsiCache { get; set; }
}

public class NWeekIndicator
{
    public int max_n { get; set; } = 52; // Maximum weeks to look back (fixed at 52)
    public int n { get; set; } // Current price is n-week low/high (0 if not applicable)
}

public class MACache
{
    public PricePoint price { get; set; }
    public Dictionary<string, MALine> lines { get; set; }
}

public class PricePoint
{
    public double today { get; set; }
    public double prev { get; set; }
}

public class MALine
{
    public double today { get; set; }
    public double prev { get; set; }
}

public class RSICache
{
    public int period { get; set; }
    public RSIValues values { get; set; }
}

public class RSIValues
{
    public double today { get; set; }
    public double prev { get; set; }
}