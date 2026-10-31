const { runEnterpriseStressTest573 } = require('./_db');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const persistChanges = Boolean(body.persistChanges);
    const report = runEnterpriseStressTest573({
      persistChanges,
      clientes: Number(body.clientes) || 10000,
      facturacion: Number(body.facturacion) || 250,
      administracion: Number(body.administracion) || 350,
      root: Number(body.root) || 25
    });
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
