# Frontend Configuration

## Local Development

1. Copy `config.js` to `config.local.js`:
   ```bash
   copy frontend\config.js frontend\config.local.js
   ```

2. Edit `config.local.js` for local development:
   ```javascript
   const config = {
       apiBaseUrl: 'http://localhost:7071/api',
       environment: 'local'
   };
   ```

3. Update `viewer.html` to use local config:
   ```html
   <script src="config.local.js"></script>
   ```

## Production/Deployment

- Uses `config.js` (committed to git)
- Automatically uses `/api` path for Azure Static Web Apps
- `config.local.js` is ignored by git (in `.gitignore`)

## Files

- `config.js` - Production config (committed)
- `config.local.js` - Local dev config (gitignored, create from config.js)
