// Central error handler: never crashes, never leaks tokens.
function errorHandler(err, req, res, next) {
  console.error(new Date().toISOString(), '[unhandled]', err && err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Something went wrong: ' + String((err && err.message) || err).slice(0, 300) });
}
module.exports = errorHandler;
