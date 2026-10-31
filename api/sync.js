const { getDb, applyMutation, persistStore } = require('./_db');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const db = getDb();
    let anyMutated = false;

    // Soporta lote de eventos (batch) para reducir peticiones de red o evento individual
    if (Array.isArray(body.events)) {
      body.events.forEach(ev => {
        if (applyMutation(db, ev.event, ev.payload, ev.eventId)) {
          anyMutated = true;
        }
      });
    } else if (body.event) {
      anyMutated = applyMutation(db, body.event, body.payload, body.eventId);
    }

    if (anyMutated) {
      persistStore(db, true);
    }

    res.status(200).json({
      success: true,
      mutated: anyMutated,
      stateVersion: db.stateVersion,
      lastUpdated: db.lastUpdated,
      count: db.transactions.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
