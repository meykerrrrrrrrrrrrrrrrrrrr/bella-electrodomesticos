const { runEnterpriseStressTest573 } = require('./_db');
const { inspectObjectForPrototypePollution, validateStrictNumber } = require('./_security');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bella-Owner-Token, X-Bella-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (inspectObjectForPrototypePollution(body)) {
      res.status(400).json({ error: 'Parámetros rechazados por validación de seguridad.' });
      return;
    }

    const clientesChk = body.clientes !== undefined ? validateStrictNumber(body.clientes, 1, 50000, true) : { valid: true, value: 10000 };
    const factChk = body.facturacion !== undefined ? validateStrictNumber(body.facturacion, 1, 5000, true) : { valid: true, value: 250 };
    const adminChk = body.administracion !== undefined ? validateStrictNumber(body.administracion, 1, 5000, true) : { valid: true, value: 350 };
    const rootChk = body.root !== undefined ? validateStrictNumber(body.root, 1, 500, true) : { valid: true, value: 25 };

    if (!clientesChk.valid || !factChk.valid || !adminChk.valid || !rootChk.valid) {
      res.status(400).json({ error: 'Parámetros numéricos fuera del rango permitido.' });
      return;
    }

    const report = runEnterpriseStressTest573({
      persistChanges: false,
      clientes: clientesChk.value,
      facturacion: factChk.value,
      administracion: adminChk.value,
      root: rootChk.value
    });
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
