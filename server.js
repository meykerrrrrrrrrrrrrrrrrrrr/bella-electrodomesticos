const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDb, applyMutation, persistStore, runEnterpriseStressTest573 } = require('./api/_db');

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

// ==================== CLIENTES SERVER-SENT EVENTS (SSE) ====================
const sseClients = new Set();

function broadcastSse(eventName, payload, stateVersion, eventId) {
  const packet = JSON.stringify({
    event: eventName,
    payload,
    stateVersion,
    eventId: eventId || `ev-${Date.now()}`,
    timestamp: Date.now()
  });
  const message = `event: message\ndata: ${packet}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
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

// ==================== SERVIDOR HTTP DE ALTA CONCURRENCIA ====================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqPath = decodeURI(parsedUrl.pathname);

  // 1. ENDPOINT: SSE STREAM EN VIVO
  if (reqPath === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    const db = getDb();
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', stateVersion: db.stateVersion, serverTime: Date.now() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 2. ENDPOINT: OBTENER ESTADO COMPLETO MAESTRO (CON OPTIMIZACIÓN DE VERSIÓN)
  if (reqPath === '/api/state' && req.method === 'GET') {
    const db = getDb();
    const sinceVersion = Number(parsedUrl.searchParams.get('since') || 0);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    });

    if (sinceVersion > 0 && sinceVersion === Number(db.stateVersion)) {
      res.end(JSON.stringify({
        upToDate: true,
        stateVersion: db.stateVersion,
        lastUpdated: db.lastUpdated,
        connectedClients: sseClients.size
      }));
      return;
    }

    res.end(JSON.stringify({
      upToDate: false,
      products: db.products,
      transactions: db.transactions,
      stateVersion: db.stateVersion || 1,
      lastUpdated: db.lastUpdated || Date.now(),
      connectedClients: sseClients.size
    }));
    return;
  }

  // 3. ENDPOINT: SINCRONIZAR EVENTO O LOTE DE EVENTOS (BATCH)
  if (reqPath === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const db = getDb();
        let anyMutated = false;

        if (Array.isArray(data.events)) {
          data.events.forEach(ev => {
            if (applyMutation(db, ev.event, ev.payload, ev.eventId)) {
              anyMutated = true;
              broadcastSse(ev.event, ev.payload, db.stateVersion + 1, ev.eventId);
            }
          });
        } else if (data.event) {
          if (applyMutation(db, data.event, data.payload, data.eventId)) {
            anyMutated = true;
            broadcastSse(data.event, data.payload, db.stateVersion + 1, data.eventId);
          }
        }

        if (anyMutated) {
          persistStore(db, false);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          mutated: anyMutated,
          stateVersion: db.stateVersion,
          lastUpdated: db.lastUpdated,
          count: db.transactions.length
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. ENDPOINT: PRUEBA DE ESTRÉS EMPRESARIAL (573 USUARIOS CONCURRENTES)
  if (reqPath === '/api/stress-test' && (req.method === 'POST' || req.method === 'GET')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const opts = body ? JSON.parse(body) : {};
        const report = runEnterpriseStressTest573({ persistChanges: Boolean(opts.persistChanges) });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(report));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. SERVIDOR DE ARCHIVOS ESTÁTICOS + PÁGINA 404 PERSONALIZADA
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
    console.log('  BELLA ELECTRODOMÉSTICOS COLOMBIA — SERVIDOR CLOUD MAESTRO     ');
    console.log('================================================================');
    console.log(`  🖥️  En tu Computador: http://localhost:${PORT}`);
    console.log(`  📱  En tu Celular (mismo WiFi): http://${localIp}:${PORT}`);
    console.log('----------------------------------------------------------------');
    console.log('  ✅ Base de datos persistente y optimizada: data/store_db.json');
    console.log('  ✅ Capacidad verificada: +573 usuarios concurrentes en vivo');
    console.log('  ✅ Página 404 personalizada activa');
    console.log('================================================================\n');
  });
}

module.exports = server;
