// Production/Azure deployment configuration
// For Azure Static Web Apps, the backend is at /api (relative path)
const config = {
    apiBaseUrl: '/api', // Azure Static Web Apps auto-routes /api to backend-js functions
    environment: 'production'
};
