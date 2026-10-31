const { getDb } = require('./_db');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const db = getDb();
  const sinceVersion = Number((req.query && req.query.since) || 0);

  // Optimización de ancho de banda: si el cliente ya tiene la misma versión, responder ligero (50 bytes)
  if (sinceVersion > 0 && sinceVersion === Number(db.stateVersion)) {
    res.status(200).json({
      upToDate: true,
      stateVersion: db.stateVersion,
      lastUpdated: db.lastUpdated
    });
    return;
  }

  res.status(200).json({
    upToDate: false,
    products: db.products,
    transactions: db.transactions,
    stateVersion: db.stateVersion || 1,
    lastUpdated: db.lastUpdated || Date.now()
  });
};
