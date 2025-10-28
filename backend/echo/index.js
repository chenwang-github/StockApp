const { app } = require('@azure/functions');

app.http('echo', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Echo API called');

        return {
            status: 200,
            body: 'hello'
        };
    }
});
