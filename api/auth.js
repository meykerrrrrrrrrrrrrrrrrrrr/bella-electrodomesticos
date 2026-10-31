/**
 * bella Electrodomésticos Colombia — Endpoint de Autenticación de Propietario (/api/auth)
 * Valida la clave privada / API Key contra las variables de entorno del servidor (process.env.BELLA_OWNER_ACCESS_CODE / BELLA_API_KEY)
 * sin exponer jamás ninguna credencial en el código cliente.
 */

const {
  getServerSecrets,
  checkRateLimit,
  recordFailedAuth,
  clearFailedAuth,
  verifyOwnerRequest,
  authenticateOwnerCredentials,
  hasMaliciousPattern
} = require('./_security');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bella-Owner-Token, X-Bella-Api-Key');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // GET /api/auth -> Consultar estado de sesión del propietario y salud de variables de entorno del servidor
  if (req.method === 'GET') {
    const ownerSession = verifyOwnerRequest(req);
    const secrets = getServerSecrets();
    res.status(200).json({
      authenticated: Boolean(ownerSession),
      owner: Boolean(ownerSession && ownerSession.owner),
      role: ownerSession ? ownerSession.role : 'cliente',
      databasePrivate: true,
      serverEnvStatus: {
        BELLA_API_KEY: secrets.apiKey ? 'Configurada en Servidor (Oculta)' : 'Pendiente',
        BELLA_OWNER_SECRET: secrets.ownerSecret ? 'Configurada en Servidor (Oculta)' : 'Pendiente',
        BELLA_DB_ENCRYPTION_KEY: secrets.dbEncryptionKey ? 'AES-256-GCM Activa en Servidor' : 'Pendiente',
        BELLA_OWNER_ACCESS_CODE: secrets.ownerAccessCode ? 'Configurada en Servidor (Oculta)' : 'Pendiente'
      }
    });
    return;
  }

  // DELETE /api/auth -> Cerrar sesión de propietario
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'bella_owner_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.status(200).json({ ok: true, authenticated: false, role: 'cliente' });
    return;
  }

  // POST /api/auth -> Iniciar sesión como Propietario validando contra process.env
  if (req.method === 'POST') {
    const limit = checkRateLimit(req);
    if (!limit.allowed) {
      res.status(429).json({
        ok: false,
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${limit.retryAfterSec} segundos.`
      });
      return;
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const accessCode = String(body.accessCode || body.apiKey || '').trim();
      const requestedRole = String(body.role || 'admin').trim();

      if (!accessCode || accessCode.length > 128 || hasMaliciousPattern(accessCode)) {
        recordFailedAuth(req);
        res.status(400).json({
          ok: false,
          error: 'Entrada bloqueada por el validador de seguridad: formato de clave no permitido.'
        });
        return;
      }

      const authResult = authenticateOwnerCredentials(accessCode, requestedRole);
      if (!authResult.ok) {
        recordFailedAuth(req);
        res.status(401).json({
          ok: false,
          error: authResult.error
        });
        return;
      }

      clearFailedAuth(req);
      res.setHeader(
        'Set-Cookie',
        `bella_owner_session=${encodeURIComponent(authResult.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`
      );
      res.status(200).json({
        ok: true,
        authenticated: true,
        owner: true,
        role: authResult.role,
        token: authResult.token,
        message: 'Autenticación de propietario verificada en el servidor. Base de datos privada desbloqueada.'
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: 'Solicitud de autenticación inválida.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method Not Allowed' });
};
