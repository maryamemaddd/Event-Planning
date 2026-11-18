import 'dotenv/config';
import app from '../app.js';
import dbConnection from '../db/dbConnection.js';

// Vercel may route a rewritten request to this file, exposing the internal
// path in req.url. Restore the public API path so Express routes keep working.
function normalizeUrl(url = '/') {
  if (!url.startsWith('/api/index')) return url;
  const rest = url.slice('/api/index'.length).replace(/^\.js/, '');
  return '/api' + rest;
}

export default async function handler(req, res) {
  req.url = normalizeUrl(req.url);

  try {
    await dbConnection();
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Database unavailable: ' + err.message,
    });
    return;
  }

  return app(req, res);
}
