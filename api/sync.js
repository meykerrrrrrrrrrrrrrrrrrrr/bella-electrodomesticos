const { getDb, applyMutation, persistStore } = require('./_db');
const { verifyOwnerRequest, inspectObjectForPrototypePollution } = require('./_security');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bella-Owner-Token, X-Bella-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const rawStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (rawStr.length > 65536) {
      res.status(413).json({ ok: false, error: 'Payload demasiado grande. Bloqueado por seguridad.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (inspectObjectForPrototypePollution(body)) {
      res.status(400).json({ ok: false, error: 'Entrada rechazada: se detectaron patrones o caracteres prohibidos.' });
      return;
    }

    const ownerSession = verifyOwnerRequest(req);
    const isOwner = Boolean(ownerSession && ownerSession.owner);

    const db = getDb();
    let anyMutated = false;

    if (Array.isArray(body.events)) {
      if (body.events.length > 25) {
        res.status(400).json({ ok: false, error: 'Lote de eventos excede el límite permitido (25).' });
        return;
      }
      for (const ev of body.events) {
        if (applyMutation(db, ev.event, ev.payload, ev.eventId, isOwner)) {
          anyMutated = true;
        }
      }
    } else if (body.event) {
      anyMutated = applyMutation(db, body.event, body.payload, body.eventId, isOwner);
    }

    if (anyMutated) {
      persistStore(db, true);
    }

    res.status(200).json({
      success: true,
      mutated: anyMutated,
      stateVersion: db.stateVersion,
      lastUpdated: db.lastUpdated,
      scope: isOwner ? 'owner_private_vault' : 'public_catalog_only'
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
};
