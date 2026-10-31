/**
 * bella Electrodomésticos Colombia — Módulo Central de Seguridad, Variables de Entorno y Validación Zero-Trust
 * - Carga todas las credenciales y llaves exclusivamente desde variables de entorno del servidor (process.env / .env.local).
 * - Cifrado AES-256-GCM en reposo para la base de datos privada del servidor.
 * - Tokens HMAC-SHA256 de sesión para garantizar que SOLO el propietario pueda ver la base de datos completa.
 * - Validación y sanitización estricta de todos los inputs (bloqueo de XSS, SQLi, NoSQLi, Prototype Pollution y rangos inválidos).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ==================== 1. CARGADOR DE VARIABLES DE ENTORNO DEL SERVIDOR (.env.local / process.env) ====================
function loadServerEnvFiles() {
  const rootDir = path.resolve(__dirname, '..');
  const envFiles = ['.env.local', '.env'];

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx <= 0) return;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        });
      }
    } catch (e) {
      // Ignorar si no hay permisos de lectura en serverless
    }
  }
}

loadServerEnvFiles();

/**
 * Obtiene la configuración privada del servidor desde process.env.
 * NUNCA se expone ninguna llave en el código del navegador.
 */
function getServerSecrets() {
  const apiKey = process.env.BELLA_API_KEY || '';
  const ownerAccessCode = process.env.BELLA_OWNER_ACCESS_CODE || apiKey || '';
  const ownerSecret = process.env.BELLA_OWNER_SECRET || (apiKey ? crypto.createHash('sha256').update(apiKey + ':bella_secret').digest('hex') : '');
  const dbEncryptionKey = process.env.BELLA_DB_ENCRYPTION_KEY || (ownerSecret ? crypto.createHash('sha256').update(ownerSecret + ':bella_db_enc').digest('hex') : '');

  return {
    apiKey,
    ownerAccessCode,
    ownerSecret,
    dbEncryptionKey,
    hasConfiguredEnv: Boolean(process.env.BELLA_API_KEY || process.env.BELLA_OWNER_ACCESS_CODE)
  };
}

// ==================== 2. PROTECCIÓN CONTRA FUERZA BRUTA & RATE LIMITING ====================
const authAttemptsByIp = new Map();
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutos

function getClientIp(req) {
  const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'local';
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const record = authAttemptsByIp.get(ip);
  if (!record) return { allowed: true };
  if (Date.now() - record.lastAttempt > LOCKOUT_MS) {
    authAttemptsByIp.delete(ip);
    return { allowed: true };
  }
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((LOCKOUT_MS - (Date.now() - record.lastAttempt)) / 1000)
    };
  }
  return { allowed: true };
}

function recordFailedAuth(req) {
  const ip = getClientIp(req);
  const record = authAttemptsByIp.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = Date.now();
  authAttemptsByIp.set(ip, record);
}

function clearFailedAuth(req) {
  const ip = getClientIp(req);
  authAttemptsByIp.delete(ip);
}

// ==================== 3. AUTENTICACIÓN DEL PROPIETARIO (HMAC-SHA256 + TIMING-SAFE) ====================
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createOwnerToken(role = 'admin') {
  const { ownerSecret } = getServerSecrets();
  if (!ownerSecret) {
    throw new Error('Variables de entorno del servidor no configuradas (BELLA_OWNER_SECRET / BELLA_API_KEY)');
  }
  const exp = Date.now() + (12 * 60 * 60 * 1000); // 12 horas
  const payload = JSON.stringify({
    owner: true,
    role: ['admin', 'facturero', 'inventario'].includes(role) ? role : 'admin',
    iat: Date.now(),
    exp
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', ownerSecret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyOwnerToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const { ownerSecret } = getServerSecrets();
  if (!ownerSecret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', ownerSecret).update(payloadB64).digest('base64url');

  if (!safeCompare(sig, expectedSig)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!decoded || !decoded.owner || Date.now() > Number(decoded.exp)) {
      return null;
    }
    return decoded;
  } catch (e) {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

/**
 * Verifica si la petición HTTP pertenece al propietario autenticado.
 * Acepta:
 * - Cookie HttpOnly `bella_owner_session`
 * - Header `Authorization: Bearer <token>`
 * - Header `X-Bella-Owner-Token: <token>`
 * - Header `X-Bella-Api-Key: <BELLA_API_KEY>` (solo para integraciones directas del propietario)
 */
function verifyOwnerRequest(req) {
  if (!req || !req.headers) return null;

  const { apiKey, ownerAccessCode } = getServerSecrets();

  // 1. Verificar API Key directa en cabecera
  const headerApiKey = req.headers['x-bella-api-key'];
  if (headerApiKey && ((apiKey && safeCompare(String(headerApiKey), apiKey)) || (ownerAccessCode && safeCompare(String(headerApiKey), ownerAccessCode)))) {
    return { owner: true, role: 'admin', via: 'api_key' };
  }

  // 2. Verificar Token Bearer o X-Bella-Owner-Token
  let token = '';
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-bella-owner-token']) {
    token = String(req.headers['x-bella-owner-token']).trim();
  }

  if (token) {
    const verified = verifyOwnerToken(token);
    if (verified) return verified;
  }

  // 3. Verificar Cookie HttpOnly del servidor
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.bella_owner_session) {
    const verified = verifyOwnerToken(cookies.bella_owner_session);
    if (verified) return verified;
  }

  return null;
}

function authenticateOwnerCredentials(submittedKey, requestedRole = 'admin') {
  const { apiKey, ownerAccessCode } = getServerSecrets();
  const cleanKey = String(submittedKey || '').trim();
  if (!cleanKey) return { ok: false, error: 'Debes ingresar la clave privada del propietario.' };

  const matchesAccessCode = ownerAccessCode && safeCompare(cleanKey, ownerAccessCode);
  const matchesApiKey = apiKey && safeCompare(cleanKey, apiKey);

  if (!matchesAccessCode && !matchesApiKey) {
    return { ok: false, error: 'Clave o API Key inválida. Acceso denegado a la base de datos privada del servidor.' };
  }

  const token = createOwnerToken(requestedRole);
  return {
    ok: true,
    token,
    role: ['admin', 'facturero', 'inventario'].includes(requestedRole) ? requestedRole : 'admin'
  };
}

// ==================== 4. CIFRADO AES-256-GCM DE LA BASE DE DATOS PRIVADA EN DISCO ====================
function encryptDatabasePayload(plainObject) {
  const { dbEncryptionKey } = getServerSecrets();
  const jsonStr = JSON.stringify(plainObject);
  if (!dbEncryptionKey) return jsonStr;

  const keyBuf = crypto.createHash('sha256').update(dbEncryptionKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    __encryptedVault: true,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: encrypted.toString('base64')
  });
}

function decryptDatabasePayload(rawContent) {
  if (!rawContent) return null;
  const parsed = JSON.parse(rawContent);
  if (!parsed || !parsed.__encryptedVault) {
    return parsed;
  }

  const { dbEncryptionKey } = getServerSecrets();
  const keyBuf = crypto.createHash('sha256').update(dbEncryptionKey).digest();
  const iv = Buffer.from(parsed.iv, 'base64');
  const authTag = Buffer.from(parsed.tag, 'base64');
  const encrypted = Buffer.from(parsed.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

// ==================== 5. VALIDACIÓN Y SANITIZACIÓN ZERO-TRUST DE TODOS LOS INPUTS ====================
const DANGEROUS_PATTERNS = [
  /<[^>]*>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /on(load|error|click|mouseover|focus|blur|input|change|submit)\s*=/i,
  /\b(eval|alert|prompt|confirm|Function|setTimeout|setInterval)\s*\(/i,
  /\b(DROP\s+TABLE|UNION\s+SELECT|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET|SELECT\s+.*\s+FROM)\b/i,
  /(--|\/\*|\*\/|;)/,
  /(\$\b(where|gt|lt|ne|eq|in|nin|regex|expr)\b)/i,
  /(__proto__|constructor|prototype)/i,
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/
];

function hasMaliciousPattern(val) {
  if (typeof val !== 'string') return false;
  return DANGEROUS_PATTERNS.some(rx => rx.test(val));
}

function inspectObjectForPrototypePollution(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return false;
  const rawKeys = Object.keys(obj);
  for (const k of rawKeys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k.startsWith('$')) {
      return true;
    }
    const val = obj[k];
    if (typeof val === 'string' && hasMaliciousPattern(val)) {
      return true;
    }
    if (val && typeof val === 'object' && inspectObjectForPrototypePollution(val, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Valida y limpia un texto según una lista blanca estricta por tipo de campo.
 */
function validateStrictString(value, fieldType = 'text', minLen = 1, maxLen = 80) {
  if (value === undefined || value === null) {
    return { valid: minLen === 0, value: '', error: `El campo ${fieldType} es obligatorio.` };
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { valid: false, value: '', error: `Formato de ${fieldType} inválido.` };
  }

  const raw = String(value).trim();
  if (hasMaliciousPattern(raw)) {
    return { valid: false, value: '', error: `Se detectaron caracteres o comandos prohibidos en ${fieldType}.` };
  }

  if (raw.length < minLen || raw.length > maxLen) {
    return { valid: false, value: '', error: `La longitud de ${fieldType} debe estar entre ${minLen} y ${maxLen} caracteres.` };
  }

  // Reglas estrictas por tipo de campo
  const rules = {
    // Solo letras (incluyendo tildes/ñ), espacios y puntos
    personName: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]{2,60}$/,
    // Ciudad: letras, espacios, puntos y paréntesis
    city: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.()\-]{2,50}$/,
    // Teléfono: dígitos, +, espacios y guiones
    phone: /^\+?[0-9\s\-]{7,18}$/,
    // ID / SKU / Código: alfanumérico y guiones
    code: /^[a-zA-Z0-9\-_]{2,40}$/,
    // Etiqueta promocional o título comercial: letras, números, espacios, %, &, ., -, °, "
    label: /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s%&.\-°"'+/()]{1,90}$/,
    // Bodega permitida
    hub: /^(Centro|Norte|Sur|Costa)$/,
    // Categoría permitida
    category: /^(all|televisores|neveras|parlantes|otros)$/,
    // Estado de orden permitido
    orderStatus: /^(Pendiente|Facturado|En Despacho|Entregado|Cancelado)$/
  };

  const regex = rules[fieldType];
  if (regex && raw.length > 0 && !regex.test(raw)) {
    return {
      valid: false,
      value: '',
      error: `El campo ${fieldType} contiene caracteres no permitidos.`
    };
  }

  return { valid: true, value: raw };
}

function validateStrictNumber(value, min = 0, max = 999999999, integerOnly = true) {
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return { valid: false, value: 0, error: 'El valor debe ser un número válido.' };
  }
  if (integerOnly && !Number.isInteger(num)) {
    return { valid: false, value: 0, error: 'El valor debe ser un número entero exacto.' };
  }
  if (num < min || num > max) {
    return { valid: false, value: 0, error: `El número debe estar entre ${min} y ${max}.` };
  }
  return { valid: true, value: num };
}

/**
 * Valida estrictamente cada mutación entrante antes de tocar la base de datos.
 */
function validateMutationEvent(event, payload, isOwnerAuthenticated = false) {
  if (!event || typeof event !== 'string') {
    return { valid: false, error: 'Tipo de evento no especificado.' };
  }

  const ALLOWED_EVENTS = [
    'NEW_ORDER',
    'ORDER_STATUS_CHANGED',
    'STOCK_UPDATED',
    'OFFER_APPLIED',
    'FULL_STATE_RECONCILE',
    'ROLE_SWITCHED'
  ];

  if (!ALLOWED_EVENTS.includes(event)) {
    return { valid: false, error: `Evento "${event}" bloqueado por política Zero-Trust.` };
  }

  if (!payload || typeof payload !== 'object' || inspectObjectForPrototypePollution(payload)) {
    return { valid: false, error: 'Payload rechazado: contiene patrones maliciosos o no permitidos.' };
  }

  // Solo NEW_ORDER y ROLE_SWITCHED están permitidos para clientes públicos;
  // cualquier cambio administrativo exige autenticación del propietario en el servidor.
  const ADMIN_ONLY_EVENTS = ['ORDER_STATUS_CHANGED', 'STOCK_UPDATED', 'OFFER_APPLIED', 'FULL_STATE_RECONCILE'];
  if (ADMIN_ONLY_EVENTS.includes(event) && !isOwnerAuthenticated) {
    return {
      valid: false,
      status: 403,
      error: 'Operación denegada: solo el propietario autenticado puede modificar la base de datos del servidor.'
    };
  }

  if (event === 'NEW_ORDER') {
    const idCheck = validateStrictString(payload.id, 'code', 4, 32);
    const prodIdCheck = validateStrictString(payload.productId || 'tv-01', 'code', 2, 24);
    const nameCheck = validateStrictString(payload.customerName || 'Cliente Particular', 'personName', 3, 60);
    const cityCheck = validateStrictString(payload.customerCity || 'Bogotá D.C.', 'city', 2, 50);
    const phoneCheck = validateStrictString(payload.customerPhone || '+57 310 000 0000', 'phone', 7, 18);
    const hubCheck = validateStrictString(payload.hub || 'Centro', 'hub', 3, 12);
    const qtyCheck = validateStrictNumber(payload.qty, 1, 10, true);
    const colorCheck = validateStrictString(payload.color || 'Estándar', 'label', 2, 40);

    for (const chk of [idCheck, prodIdCheck, nameCheck, cityCheck, phoneCheck, hubCheck, qtyCheck, colorCheck]) {
      if (!chk.valid) return { valid: false, error: chk.error };
    }

    return {
      valid: true,
      sanitizedPayload: {
        id: idCheck.value,
        productId: prodIdCheck.value,
        customerName: nameCheck.value,
        customerCity: cityCheck.value,
        customerPhone: phoneCheck.value,
        hub: hubCheck.value,
        qty: qtyCheck.value,
        color: colorCheck.value,
        channel: validateStrictString(payload.channel || 'Web Cloud', 'label', 2, 45).value || 'Web Cloud'
      }
    };
  }

  if (event === 'ORDER_STATUS_CHANGED') {
    const orderIdCheck = validateStrictString(payload.orderId, 'code', 4, 32);
    const statusCheck = validateStrictString(payload.newStatus, 'orderStatus', 5, 20);
    if (!orderIdCheck.valid) return { valid: false, error: orderIdCheck.error };
    if (!statusCheck.valid) return { valid: false, error: statusCheck.error };
    return {
      valid: true,
      sanitizedPayload: {
        orderId: orderIdCheck.value,
        newStatus: statusCheck.value
      }
    };
  }

  if (event === 'STOCK_UPDATED') {
    const prodIdCheck = validateStrictString(payload.productId, 'code', 2, 24);
    if (!prodIdCheck.valid) return { valid: false, error: prodIdCheck.error };

    if (payload.hub) {
      const hubCheck = validateStrictString(payload.hub, 'hub', 3, 12);
      const stockCheck = validateStrictNumber(payload.newHubStock, 0, 9999, true);
      if (!hubCheck.valid) return { valid: false, error: hubCheck.error };
      if (!stockCheck.valid) return { valid: false, error: stockCheck.error };
      return {
        valid: true,
        sanitizedPayload: {
          productId: prodIdCheck.value,
          hub: hubCheck.value,
          newHubStock: stockCheck.value
        }
      };
    } else {
      const stockCheck = validateStrictNumber(payload.newStock, 0, 39996, true);
      if (!stockCheck.valid) return { valid: false, error: stockCheck.error };
      return {
        valid: true,
        sanitizedPayload: {
          productId: prodIdCheck.value,
          newStock: stockCheck.value
        }
      };
    }
  }

  if (event === 'OFFER_APPLIED') {
    const rawPct = payload.discountPct !== undefined ? payload.discountPct : payload.pct;
    const pctCheck = validateStrictNumber(rawPct, 0, 90, true);
    if (!pctCheck.valid) return { valid: false, error: pctCheck.error };

    const badgeRaw = payload.promoBadgeText ? String(payload.promoBadgeText).trim() : (pctCheck.value > 0 ? `${pctCheck.value}% OFF` : '');
    if (badgeRaw) {
      const badgeCheck = validateStrictString(badgeRaw, 'label', 1, 36);
      if (!badgeCheck.valid) return { valid: false, error: badgeCheck.error };
    }

    if (payload.categoryKey) {
      const catCheck = validateStrictString(payload.categoryKey, 'category', 3, 20);
      if (!catCheck.valid) return { valid: false, error: catCheck.error };
      return {
        valid: true,
        sanitizedPayload: {
          categoryKey: catCheck.value,
          discountPct: pctCheck.value,
          promoBadgeText: badgeRaw || null
        }
      };
    } else if (payload.productId) {
      const prodCheck = validateStrictString(payload.productId, 'code', 2, 24);
      if (!prodCheck.valid) return { valid: false, error: prodCheck.error };
      return {
        valid: true,
        sanitizedPayload: {
          productId: prodCheck.value,
          discountPct: pctCheck.value,
          promoBadgeText: badgeRaw || null
        }
      };
    }
    return { valid: false, error: 'Se requiere categoría o producto válido para aplicar oferta.' };
  }

  return { valid: true, sanitizedPayload: payload };
}

module.exports = {
  getServerSecrets,
  checkRateLimit,
  recordFailedAuth,
  clearFailedAuth,
  verifyOwnerRequest,
  authenticateOwnerCredentials,
  encryptDatabasePayload,
  decryptDatabasePayload,
  validateStrictString,
  validateStrictNumber,
  validateMutationEvent,
  inspectObjectForPrototypePollution,
  hasMaliciousPattern
};
