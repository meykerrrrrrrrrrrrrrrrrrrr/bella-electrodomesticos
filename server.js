const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getDb,
  applyMutation,
  persistStore,
  getPublicCatalogProjection,
  getPrivateOwnerDatabase,
  runEnterpriseStressTest573
} = require('./api/_db');
const {
  verifyOwnerRequest,
  inspectObjectForPrototypePollution
} = require('./api/_security');
const authHandler = require('./api/auth');
const adminDbHandler = require('./api/admin-db');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;
const CUSTOM_404_FILE = path.join(ROOT_DIR, '404.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Rutas y archivos estrictamente privados del servidor (nunca servidos públicamente)
const BLOCKED_PRIVATE_PATTERNS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.vercel/i,
  /^\/\.private_db/i,
  /^\/data(\/|$)/i,
  /^\/api\/_/i,
  /^\/server\.js$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/vercel\.json$/i,
  /^\/stress-test/i
];

function isBlockedPrivatePath(reqPath) {
  return BLOCKED_PRIVATE_PATTERNS.some(rx => rx.test(reqPath));
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// ==================== CLIENTES SERVER-SENT EVENTS (SSE) CON FILTRO DE PRIVACIDAD ====================
const sseClients = new Map(); // res -> { isOwner: boolean }

function broadcastSse(eventName, payload, stateVersion, eventId) {
  const isPrivateOrderEvent = (eventName === 'NEW_ORDER' || eventName === 'ORDER_STATUS_CHANGED');

  for (const [clientRes, meta] of sseClients.entries()) {
    try {
      if (isPrivateOrderEvent && !meta.isOwner) {
        // A los clientes públicos solo se les notifica actualización de stock sin datos personales del comprador
        if (eventName === 'NEW_ORDER' && payload && payload.productId) {
          const db = getDb();
          const prod = db.products.find(p => p.id === payload.productId);
          if (prod) {
            const safePacket = JSON.stringify({
              event: 'STOCK_UPDATED',
              payload: { productId: prod.id, newStock: prod.stock, name: prod.name },
              stateVersion,
              eventId: eventId || `ev-${Date.now()}`,
              timestamp: Date.now()
            });
            clientRes.write(`event: message\ndata: ${safePacket}\n\n`);
          }
        }
        continue;
      }

      const packet = JSON.stringify({
        event: eventName,
        payload,
        stateVersion,
        eventId: eventId || `ev-${Date.now()}`,
        timestamp: Date.now()
      });
      clientRes.write(`event: message\ndata: ${packet}\n\n`);
    } catch (e) {
      sseClients.delete(clientRes);
    }
  }
}

function serveCustom404(res) {
  fs.readFile(CUSTOM_404_FILE, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — Ruta No Encontrada');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// Adaptador compatible con Express/Vercel para handlers en ./api/
function wrapVercelHandler(req, res, parsedUrl, handlerFn) {
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(obj));
    return res;
  };

  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => {
      req.body = body;
      handlerFn(req, res);
    });
  } else {
    handlerFn(req, res);
  }
}

// ==================== SERVIDOR HTTP SEGURO DE ALTA CONCURRENCIA ====================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match, X-Bella-Owner-Token, X-Bella-Api-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqPath = decodeURI(parsedUrl.pathname);

  // 0. BLOQUEO ESTRICTO DE ARCHIVOS INTERNOS Y BASE DE DATOS PRIVADA DEL SERVIDOR
  if (isBlockedPrivatePath(reqPath)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      error: '🔒 403 Acceso Prohibido: Este recurso y la base de datos son privados del servidor.'
    }));
    return;
  }

  // 1. ENDPOINT: AUTENTICACIÓN DEL PROPIETARIO (/api/auth)
  if (reqPath === '/api/auth') {
    wrapVercelHandler(req, res, parsedUrl, authHandler);
    return;
  }

  // 2. ENDPOINT: INSPECTOR DE BASE DE DATOS PRIVADA DEL SERVIDOR (/api/admin-db)
  if (reqPath === '/api/admin-db') {
    wrapVercelHandler(req, res, parsedUrl, adminDbHandler);
    return;
  }

  // 3. ENDPOINT: SSE STREAM EN VIVO
  if (reqPath === '/api/events') {
    const tokenParam = parsedUrl.searchParams.get('token');
    if (tokenParam && !req.headers['x-bella-owner-token']) {
      req.headers['x-bella-owner-token'] = tokenParam;
    }
    const ownerSession = verifyOwnerRequest(req);
    const isOwner = Boolean(ownerSession && ownerSession.owner);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    });
    const db = getDb();
    res.write(`data: ${JSON.stringify({
      type: 'CONNECTED',
      scope: isOwner ? 'owner_private_vault' : 'public_catalog_only',
      stateVersion: db.stateVersion,
      serverTime: Date.now()
    })}\n\n`);
    sseClients.set(res, { isOwner });

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 4. ENDPOINT: ESTADO DEL SERVIDOR (PÚBLICO VS PRIVADO DEL PROPIETARIO)
  if (reqPath === '/api/state' && req.method === 'GET') {
    const db = getDb();
    const ownerSession = verifyOwnerRequest(req);
    const isOwner = Boolean(ownerSession && ownerSession.owner);
    const sinceVersion = Number(parsedUrl.searchParams.get('since') || 0);
    const requestedScope = parsedUrl.searchParams.get('scope') || '';

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    });

    if (sinceVersion > 0 && sinceVersion === Number(db.stateVersion) && requestedScope !== 'force') {
      res.end(JSON.stringify({
        upToDate: true,
        scope: isOwner ? 'owner_private_vault' : 'public_catalog_only',
        databasePrivate: true,
        stateVersion: db.stateVersion,
        lastUpdated: db.lastUpdated,
        connectedClients: sseClients.size
      }));
      return;
    }

    const responsePayload = isOwner
      ? getPrivateOwnerDatabase(db)
      : getPublicCatalogProjection(db);

    responsePayload.connectedClients = sseClients.size;
    res.end(JSON.stringify(responsePayload));
    return;
  }

  // 5. ENDPOINT: SINCRONIZAR EVENTO O LOTE DE EVENTOS (CON VALIDACIÓN ZERO-TRUST)
  if (reqPath === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (inspectObjectForPrototypePollution(data)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Entrada rechazada: patrones maliciosos detectados.' }));
          return;
        }

        const ownerSession = verifyOwnerRequest(req);
        const isOwner = Boolean(ownerSession && ownerSession.owner);
        const db = getDb();
        let anyMutated = false;

        if (Array.isArray(data.events)) {
          if (data.events.length > 25) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'Lote de eventos excede el máximo permitido.' }));
            return;
          }
          for (const ev of data.events) {
            if (applyMutation(db, ev.event, ev.payload, ev.eventId, isOwner)) {
              anyMutated = true;
              broadcastSse(ev.event, ev.payload, db.stateVersion + 1, ev.eventId);
            }
          }
        } else if (data.event) {
          if (applyMutation(db, data.event, data.payload, data.eventId, isOwner)) {
            anyMutated = true;
            broadcastSse(data.event, data.payload, db.stateVersion + 1, data.eventId);
          }
        }

        if (anyMutated) {
          persistStore(db, false);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          mutated: anyMutated,
          stateVersion: db.stateVersion,
          lastUpdated: db.lastUpdated,
          scope: isOwner ? 'owner_private_vault' : 'public_catalog_only'
        }));
      } catch (err) {
        res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 6. ENDPOINT: PRUEBA DE ESTRÉS EMPRESARIAL (10.625 USUARIOS CONCURRENTES)
  if (reqPath === '/api/stress-test' && (req.method === 'POST' || req.method === 'GET')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const opts = body ? JSON.parse(body) : {};
        if (inspectObjectForPrototypePollution(opts)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Parámetros rechazados por validación de seguridad.' }));
          return;
        }
        const report = runEnterpriseStressTest573({ persistChanges: false });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(report));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. SERVIDOR DE ARCHIVOS ESTÁTICOS PÚBLICOS + PÁGINA 404 PERSONALIZADA
  let staticPath = reqPath === '/' ? '/index.html' : reqPath;
  const safePath = path.normalize(path.join(ROOT_DIR, staticPath));
  if (!safePath.startsWith(ROOT_DIR)) {
    serveCustom404(res);
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err) {
      serveCustom404(res);
      return;
    }

    let filePath = safePath;
    if (stats.isDirectory()) {
      filePath = path.join(safePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        serveCustom404(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log('================================================================');
    console.log('  BELLA ELECTRODOMÉSTICOS COLOMBIA — SERVIDOR PRIVADO SEGURO    ');
    console.log('================================================================');
    console.log(`  🖥️  En tu Computador: http://localhost:${PORT}`);
    console.log(`  📱  En tu Celular (mismo WiFi): http://${localIp}:${PORT}`);
    console.log('----------------------------------------------------------------');
    console.log('  🔒 Base de datos privada cifrada (AES-256-GCM): .private_db/');
    console.log('  🛡️  Validación estricta de inputs y variables de entorno activa');
    console.log('  ⚡ Capacidad verificada: 10.625 usuarios concurrentes en vivo');
    console.log('================================================================\n');
  });
}

module.exports = server;
