const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (context, req) {
    context.log('CheckUserAlerts triggered');

    try {
        // Get userId from query string or request body
        let userId = req.query.userId || req.query.userid || (req.body && (req.body.userId || req.body.userid));
        
        if (!userId) {
            context.res = {
                status: 400,
                body: { error: 'userId parameter is required' }
            };
            return;
        }

        // Get optional date parameter for testing (format: YYYY-MM-DD)
        let checkDate = req.query.date || (req.body && req.body.date);
        
        // If no date provided, use today (UTC)
        if (!checkDate) {
            checkDate = getTodayDateStringUTC();
        } else {
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
                context.res = {
                    status: 400,
                    body: { error: 'Invalid date format. Use YYYY-MM-DD' }
                };
                return;
            }
        }

        context.log(`Checking alerts for user: ${userId}, date: ${checkDate}`);

        // Get user info from userDB
        const userInfo = await getUserInfo(userId, context);
        
        if (!userInfo || !userInfo.alertList || userInfo.alertList.length === 0) {
            context.res = {
                status: 200,
                body: {
                    userId,
                    checkDate,
                    message: 'No alerts configured for this user',
                    triggeredAlerts: []
                }
            };
            return;
        }

        // Check each alert in the user's alertList
        const triggeredAlerts = [];
        
        for (const alert of userInfo.alertList) {
            const { symbol, alertOption } = alert;
            
            if (!symbol || !alertOption || alertOption.length === 0) {
                continue;
            }

            // Get stock alarm data from watchlist
            const stockAlarms = await getStockAlarms(symbol, context);
            
            if (!stockAlarms || !stockAlarms.alarmList) {
                context.log.warn(`No alarm data found for symbol: ${symbol}`);
                continue;
            }

            // Check if all alertOptions are triggered on the check date
            const allTriggeredOnDate = checkIfAllAlarmsTriggeredOnDate(
                alertOption,
                stockAlarms.alarmList,
                checkDate,
                context
            );

            if (allTriggeredOnDate) {
                triggeredAlerts.push({
                    symbol: symbol,
                    alertOption: alertOption,
                    triggeredDate: checkDate
                });
            }
        }

        context.res = {
            status: 200,
            body: {
                userId,
                checkDate,
                totalAlerts: userInfo.alertList.length,
                triggeredCount: triggeredAlerts.length,
                triggeredAlerts: triggeredAlerts
            }
        };

    } catch (error) {
        context.log.error('Error in CheckUserAlerts:', error);
        context.res = {
            status: 500,
            body: { error: error.message }
        };
    }
};

/**
 * Get user info from userDB
 */
async function getUserInfo(userId, context) {
    const connectionString = process.env.CosmosConnectionString;
    const client = new CosmosClient(connectionString);
    const databaseName = 'userDB';
    const database = client.database(databaseName);
    const container = database.container('userInfo');

    try {
        const { resource } = await container.item(userId, userId).read();
        return resource;
    } catch (error) {
        if (error.code === 404) {
            context.log(`User not found: ${userId}`);
            return null;
        }
        throw error;
    }
}

/**
 * Get stock alarms from watchlist in stockDB
 */
async function getStockAlarms(symbol, context) {
    const connectionString = process.env.CosmosConnectionString;
    const client = new CosmosClient(connectionString);
    const databaseName = process.env.CosmosDatabaseName || 'stockDB';
    const database = client.database(databaseName);
    const container = database.container('watchlist');

    try {
        const { resource } = await container.item(symbol, symbol).read();
        return resource;
    } catch (error) {
        if (error.code === 404) {
            context.log(`Stock not found in watchlist: ${symbol}`);
            return null;
        }
        throw error;
    }
}

/**
 * Check if all alert options are triggered on the specified date
 */
function checkIfAllAlarmsTriggeredOnDate(alertOptions, alarmList, targetDate, context) {
    for (const alarmName of alertOptions) {
        // Find the alarm in the alarmList
        const alarm = alarmList.find(a => a.alarmName === alarmName);
        
        if (!alarm) {
            context.log.warn(`Alarm not found in alarmList: ${alarmName}`);
            return false;
        }

        // Check if this alarm was triggered on target date
        if (!alarm.previousTriggeredDate) {
            return false;
        }

        const triggeredDate = formatDateUTC(alarm.previousTriggeredDate);
        
        if (triggeredDate !== targetDate) {
            return false;
        }
    }

    // All alarms were triggered on the target date
    return true;
}

/**
 * Get today's date as YYYY-MM-DD string (UTC)
 */
function getTodayDateStringUTC() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format date to YYYY-MM-DD (UTC)
 */
function formatDateUTC(date) {
    if (!date) return null;
    
    if (typeof date === 'string') {
        // If it's ISO string, extract UTC date part
        // "2025-10-27T07:00:00.000Z" -> "2025-10-27"
        return date.split('T')[0];
    }
    
    if (date instanceof Date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return null;
}
