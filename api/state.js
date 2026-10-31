const { getDb, getPublicCatalogProjection, getPrivateOwnerDatabase } = require('./_db');
const { verifyOwnerRequest } = require('./_security');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, Authorization, X-Bella-Owner-Token, X-Bella-Api-Key');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const db = getDb();
  const ownerSession = verifyOwnerRequest(req);
  const isOwner = Boolean(ownerSession && ownerSession.owner);
  const sinceVersion = Number((req.query && req.query.since) || 0);
  const requestedScope = (req.query && req.query.scope) || '';

  // Si ya tiene la misma versión y el mismo nivel de acceso, responder ligero (50 bytes)
  if (sinceVersion > 0 && sinceVersion === Number(db.stateVersion) && requestedScope !== 'force') {
    res.status(200).json({
      upToDate: true,
      scope: isOwner ? 'owner_private_vault' : 'public_catalog_only',
      databasePrivate: true,
      stateVersion: db.stateVersion,
      lastUpdated: db.lastUpdated
    });
    return;
  }

  // Si es el propietario autenticado, devuelve la base de datos privada completa.
  // Si es un visitante público, devuelve SOLO el catálogo público sin costos ni transacciones privadas.
  if (isOwner) {
    res.status(200).json(getPrivateOwnerDatabase(db));
  } else {
    res.status(200).json(getPublicCatalogProjection(db));
  }
};
