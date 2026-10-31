/**
 * bella Electrodomésticos Colombia — Inspector de Base de Datos Privada del Servidor (/api/admin-db)
 * EXCLUSIVO PARA EL PROPIETARIO AUTENTICADO.
 * Cualquier intento sin token HMAC válido del servidor o API Key es bloqueado con HTTP 401/403.
 */

const { getDb, getPrivateOwnerDatabase } = require('./_db');
const { verifyOwnerRequest, getServerSecrets } = require('./_security');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bella-Owner-Token, X-Bella-Api-Key');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const ownerSession = verifyOwnerRequest(req);
  if (!ownerSession || !ownerSession.owner) {
    res.status(401).json({
      ok: false,
      databasePrivate: true,
      error: '🔒 ACCESO DENEGADO: La base de datos es privada del servidor y solo el propietario autenticado puede verla.'
    });
    return;
  }

  const db = getDb();
  const privateData = getPrivateOwnerDatabase(db);
  const secrets = getServerSecrets();

  res.status(200).json({
    ok: true,
    ownerVerified: true,
    role: ownerSession.role,
    securityAudit: {
      databaseVisibility: 'PRIVADA DEL SERVIDOR (Solo Propietario)',
      encryptionAtRest: 'AES-256-GCM',
      apiKeyInCode: false,
      envVarsSource: 'process.env (Servidor)',
      configuredKeys: {
        BELLA_API_KEY: secrets.apiKey ? 'Configurada en Servidor [OCULTA]' : 'No definida',
        BELLA_OWNER_SECRET: secrets.ownerSecret ? 'Configurada en Servidor [OCULTA]' : 'No definida',
        BELLA_DB_ENCRYPTION_KEY: secrets.dbEncryptionKey ? 'Configurada en Servidor [OCULTA]' : 'No definida',
        BELLA_OWNER_ACCESS_CODE: secrets.ownerAccessCode ? 'Configurada en Servidor [OCULTA]' : 'No definida'
      }
    },
    database: privateData
  });
};
