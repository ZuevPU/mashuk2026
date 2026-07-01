export function errorHandler(err, _req, res, _next) {
    console.error('Unhandled error:', err);
    if (res.headersSent)
        return;
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
}
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
