module.exports = async function (context, req) {
    context.log('Echo API called');

    context.res = {
        status: 200,
        body: "hello"
    };
};
