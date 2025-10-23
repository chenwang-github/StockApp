using System;
using System.Threading.Tasks;
using Azure;
using Azure.Communication.Email;
using Microsoft.Extensions.Logging;

namespace StockApp.Shared
{
    public class EmailNotificationService
    {
        private readonly ILogger _logger;
        private readonly EmailClient _emailClient;
        private readonly string _senderAddress;
        private readonly string _adminEmail;

        public EmailNotificationService(ILogger logger)
        {
            _logger = logger;
            
            // Configuration from environment variables
            var connectionString = Environment.GetEnvironmentVariable("AzureCommunicationServicesConnectionString");
            _senderAddress = Environment.GetEnvironmentVariable("SenderEmailAddress") ?? "DoNotReply@61aaed7f-b6c8-40e7-970c-1fa1fed6fd3e.azurecomm.net";
            _adminEmail = Environment.GetEnvironmentVariable("AdminEmail") ?? "chen.wang.ms@outlook.com";

            if (string.IsNullOrEmpty(connectionString))
            {
                _logger.LogWarning("Azure Communication Services connection string not configured. Email notifications will be skipped.");
                _emailClient = null!;
            }
            else
            {
                _emailClient = new EmailClient(connectionString);
            }
        }

        /// <summary>
        /// Send email notification for critical failures
        /// </summary>
        public async Task SendFailureNotificationAsync(
            string subject,
            string errorDetails,
            int totalStocks,
            int failedStocks,
            string failedSymbols)
        {
            try
            {
                if (_emailClient == null)
                {
                    _logger.LogWarning("Azure Communication Services not configured. Skipping email notification.");
                    return;
                }

                var htmlBody = GenerateFailureEmailHtml(errorDetails, totalStocks, failedStocks, failedSymbols);
                var plainTextBody = GenerateFailureEmailText(errorDetails, totalStocks, failedStocks, failedSymbols);

                await SendEmailAsync(_adminEmail, subject, plainTextBody, htmlBody);
                
                _logger.LogInformation($"Failure notification email sent to {_adminEmail}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email notification");
                // Don't throw - email failure shouldn't break the main flow
            }
        }

        /// <summary>
        /// Send email notification for complete failures
        /// </summary>
        public async Task SendCriticalFailureNotificationAsync(string errorMessage, string stackTrace)
        {
            try
            {
                if (_emailClient == null)
                {
                    _logger.LogWarning("Azure Communication Services not configured. Skipping email notification.");
                    return;
                }

                var subject = "🚨 CRITICAL: DailyStockUpdater Complete Failure";
                var htmlBody = GenerateCriticalFailureEmailHtml(errorMessage, stackTrace);
                var plainTextBody = GenerateCriticalFailureEmailText(errorMessage, stackTrace);

                await SendEmailAsync(_adminEmail, subject, plainTextBody, htmlBody);
                
                _logger.LogInformation($"Critical failure notification email sent to {_adminEmail}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send critical failure email notification");
            }
        }

        private async Task SendEmailAsync(string toEmail, string subject, string plainTextBody, string htmlBody)
        {
            var emailMessage = new EmailMessage(
                senderAddress: _senderAddress,
                content: new EmailContent(subject)
                {
                    PlainText = plainTextBody,
                    Html = htmlBody
                },
                recipients: new EmailRecipients(new[] { new EmailAddress(toEmail) }));

            _logger.LogInformation($"Sending email to {toEmail} from {_senderAddress}");

            EmailSendOperation emailSendOperation = await _emailClient.SendAsync(
                WaitUntil.Completed,
                emailMessage);

            _logger.LogInformation($"Email sent. Status: {emailSendOperation.Value.Status}");
        }

        private string GenerateFailureEmailHtml(string errorDetails, int totalStocks, int failedStocks, string failedSymbols)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss UTC");
            var failureRate = totalStocks > 0 ? (failedStocks * 100.0 / totalStocks) : 0;

            return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #dc3545; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .content {{ background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }}
        .stats {{ background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #dc3545; }}
        .footer {{ background: #e9ecef; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }}
        .error-box {{ background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 3px; }}
        .metric {{ display: inline-block; margin: 10px 20px 10px 0; }}
        .metric-label {{ font-weight: bold; color: #666; }}
        .metric-value {{ font-size: 24px; color: #dc3545; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h2 style='margin: 0;'>⚠️ Stock Update Failure Alert</h2>
            <p style='margin: 5px 0 0 0;'>DailyStockUpdater encountered errors</p>
        </div>
        
        <div class='content'>
            <p><strong>Timestamp:</strong> {timestamp}</p>
            
            <div class='stats'>
                <h3 style='margin-top: 0;'>Update Statistics</h3>
                <div class='metric'>
                    <div class='metric-label'>Total Stocks</div>
                    <div class='metric-value'>{totalStocks}</div>
                </div>
                <div class='metric'>
                    <div class='metric-label'>Failed</div>
                    <div class='metric-value'>{failedStocks}</div>
                </div>
                <div class='metric'>
                    <div class='metric-label'>Failure Rate</div>
                    <div class='metric-value'>{failureRate:F1}%</div>
                </div>
            </div>

            <div class='error-box'>
                <h4 style='margin-top: 0;'>Failed Stocks</h4>
                <p>{failedSymbols}</p>
            </div>

            <div style='margin-top: 20px;'>
                <h4>Error Details</h4>
                <pre style='background: white; padding: 10px; border: 1px solid #ddd; overflow-x: auto;'>{errorDetails}</pre>
            </div>

            <div style='margin-top: 20px; padding: 15px; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 3px;'>
                <strong>💡 Recommended Actions:</strong>
                <ul>
                    <li>Check Azure Function logs in Application Insights</li>
                    <li>Verify Cosmos DB connectivity</li>
                    <li>Check Yahoo Finance API availability</li>
                    <li>Review failed stock symbols for issues</li>
                </ul>
            </div>
        </div>
        
        <div class='footer'>
            <p>This is an automated notification from StockApp DailyStockUpdater</p>
            <p>To modify notification settings, update the Function App configuration</p>
        </div>
    </div>
</body>
</html>";
        }

        private string GenerateFailureEmailText(string errorDetails, int totalStocks, int failedStocks, string failedSymbols)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss UTC");
            var failureRate = totalStocks > 0 ? (failedStocks * 100.0 / totalStocks) : 0;

            return $@"
═══════════════════════════════════════
⚠️ STOCK UPDATE FAILURE ALERT
═══════════════════════════════════════

Timestamp: {timestamp}

UPDATE STATISTICS:
------------------
Total Stocks: {totalStocks}
Failed: {failedStocks}
Failure Rate: {failureRate:F1}%

FAILED STOCKS:
{failedSymbols}

ERROR DETAILS:
{errorDetails}

RECOMMENDED ACTIONS:
- Check Azure Function logs in Application Insights
- Verify Cosmos DB connectivity
- Check Yahoo Finance API availability
- Review failed stock symbols for issues

═══════════════════════════════════════
This is an automated notification from StockApp DailyStockUpdater
";
        }

        private string GenerateCriticalFailureEmailHtml(string errorMessage, string stackTrace)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss UTC");

            return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #721c24; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .content {{ background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }}
        .error-box {{ background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 15px 0; border-radius: 3px; }}
        .footer {{ background: #e9ecef; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h2 style='margin: 0;'>🚨 CRITICAL FAILURE</h2>
            <p style='margin: 5px 0 0 0;'>DailyStockUpdater has completely failed</p>
        </div>
        
        <div class='content'>
            <p><strong>Timestamp:</strong> {timestamp}</p>
            
            <div class='error-box'>
                <h3 style='margin-top: 0; color: #721c24;'>Error Message</h3>
                <p>{errorMessage}</p>
            </div>

            <div style='margin-top: 20px;'>
                <h4>Stack Trace</h4>
                <pre style='background: white; padding: 10px; border: 1px solid #ddd; overflow-x: auto; font-size: 11px;'>{stackTrace}</pre>
            </div>

            <div style='margin-top: 20px; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 3px;'>
                <strong>⚠️ IMMEDIATE ACTION REQUIRED:</strong>
                <ul>
                    <li><strong>Check Azure Function status immediately</strong></li>
                    <li>Review Application Insights for detailed logs</li>
                    <li>Verify all connection strings and configurations</li>
                    <li>Check Azure services health status</li>
                    <li>Function will retry automatically up to 5 times</li>
                </ul>
            </div>
        </div>
        
        <div class='footer'>
            <p><strong>This is a CRITICAL automated alert from StockApp DailyStockUpdater</strong></p>
            <p>Please investigate immediately</p>
        </div>
    </div>
</body>
</html>";
        }

        private string GenerateCriticalFailureEmailText(string errorMessage, string stackTrace)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss UTC");

            return $@"
═══════════════════════════════════════
🚨 CRITICAL FAILURE ALERT
═══════════════════════════════════════

Timestamp: {timestamp}

ERROR MESSAGE:
{errorMessage}

STACK TRACE:
{stackTrace}

⚠️ IMMEDIATE ACTION REQUIRED:
- Check Azure Function status immediately
- Review Application Insights for detailed logs
- Verify all connection strings and configurations
- Check Azure services health status
- Function will retry automatically up to 5 times

═══════════════════════════════════════
This is a CRITICAL automated alert from StockApp DailyStockUpdater
Please investigate immediately
";
        }
    }
}
