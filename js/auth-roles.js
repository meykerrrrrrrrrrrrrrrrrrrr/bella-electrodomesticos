/**
 * bella Electrodomésticos — Sistema de Roles, Permisos y Navegación Segmentada
 * Protegido con Autenticación de Propietario en el Servidor (Zero-Trust):
 * - Cliente: Solo ve Inicio, Tienda/Catálogo y Detalle del Producto (Proyección pública sin costos ni órdenes).
 * - Administrador / Facturero / Inventario: Exige autenticación contra variables de entorno del servidor (/api/auth).
 * - La base de datos es 100% privada del servidor (cifrada con AES-256-GCM y accesible solo por el propietario).
 */

const AuthRoles = {
  init() {
    this.enforcePageGuard();
    this.updateNavigationLinks();
    this.injectRoleSwitcher();
    this.setupMobileMenuAndAutoHideHeader();
  },

  getCurrentPage() {
    const path = window.location.pathname;
    let filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    if (filename && !filename.includes('.')) {
      filename = filename + '.html';
    }
    return filename;
  },

  isInsidePagesFolder() {
    return window.location.pathname.includes('/pages/') || window.location.href.includes('/pages/');
  },

  getBasePath() {
    return this.isInsidePagesFolder() ? '' : 'pages/';
  },

  getRootPath() {
    return this.isInsidePagesFolder() ? '../' : '';
  },

  getApiBase() {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol.startsWith('http')) {
        return window.location.origin;
      }
    }
    return 'http://localhost:8080';
  },

  isOwnerSessionActive() {
    try {
      const token = sessionStorage.getItem('bella_owner_token') || localStorage.getItem('bella_owner_token');
      return Boolean(token && token.length > 20);
    } catch (e) {
      return false;
    }
  },

  // 1. Guardián de Acceso a Páginas Restringidas
  enforcePageGuard() {
    const roleId = AetherStore.getCurrentRole();
    const role = AetherStore.ROLES[roleId] || AetherStore.ROLES.cliente;
    const currentPage = this.getCurrentPage();

    const allowed = role.allowedPages;
    const isAllowed = allowed.some(p => currentPage === p || currentPage === '' || (currentPage === 'index.html' && p === 'index.html'));

    // Si intenta entrar a una página administrativa sin autenticación de propietario, mostrar formulario de desbloqueo
    const requiresOwnerAuth = (currentPage === 'pedidos.html' || currentPage === 'inventario.html' || currentPage === 'finanzas.html');

    if (!isAllowed || (requiresOwnerAuth && !this.isOwnerSessionActive() && roleId === 'cliente')) {
      document.body.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#ebeadf; font-family:'DM Sans', sans-serif; padding:20px;">
          <div style="background:#ffffff; border-radius:14px; padding:36px; max-width:540px; width:100%; text-align:center; box-shadow:0 12px 32px rgba(0,0,0,0.12);">
            <div style="font-size:48px; margin-bottom:12px;">🔒</div>
            <h1 style="font-size:24px; font-weight:700; margin-bottom:8px; letter-spacing:-0.5px;">Base de Datos Privada del Servidor</h1>
            <p style="font-size:14px; color:#555; margin-bottom:18px; line-height:1.5;">
              Esta sección contiene información confidencial de costos, facturación DIAN e inventarios protegidos con cifrado <strong>AES-256-GCM</strong>. Solo el propietario autenticado mediante variables de entorno del servidor tiene acceso.
            </p>

            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:16px; margin-bottom:20px; text-align:left;">
              <label for="guardOwnerKey" style="font-size:12px; font-weight:700; display:block; margin-bottom:6px; color:#1e293b;">
                Ingresa tu Clave de Propietario (Variable de entorno en servidor):
              </label>
              <div style="display:flex; gap:8px;">
                <input
                  type="password"
                  id="guardOwnerKey"
                  class="pill-input"
                  placeholder="Clave privada del servidor..."
                  style="width:100%; background:#fff;"
                />
                <button class="pill-btn coral" id="btnUnlockGuard" style="white-space:nowrap;">Desbloquear</button>
              </div>
              <div id="guardErrorMsg" style="color:#b91c1c; font-size:12px; margin-top:8px; display:none; font-weight:600;"></div>
            </div>

            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <a href="${this.isInsidePagesFolder() ? 'tienda.html' : 'pages/tienda.html'}" class="pill-btn">Ir al Catálogo Público</a>
              <button class="pill-btn" onclick="AuthRoles.openRoleModal()">Ver Roles Disponibles</button>
            </div>
          </div>
        </div>
      `;

      const unlockBtn = document.getElementById('btnUnlockGuard');
      const input = document.getElementById('guardOwnerKey');
      const errorDiv = document.getElementById('guardErrorMsg');

      const attemptUnlock = async () => {
        const key = (input?.value || '').trim();
        if (!key) {
          errorDiv.textContent = 'Ingresa la clave de propietario configurada en el servidor.';
          errorDiv.style.display = 'block';
          return;
        }

        const targetRole = currentPage === 'pedidos.html' ? 'facturero' : currentPage === 'inventario.html' ? 'inventario' : 'admin';
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Verificando...';

        try {
          const res = await fetch(`${AuthRoles.getApiBase()}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessCode: key, role: targetRole })
          });
          const data = await res.json();
          if (res.ok && data.ok && data.token) {
            if (window.CloudSync && window.CloudSync.setOwnerToken) {
              window.CloudSync.setOwnerToken(data.token);
            }
            AetherStore.setCurrentRole(targetRole);
            window.location.reload();
          } else {
            errorDiv.textContent = data.error || '🔒 Clave incorrecta: la base de datos es privada del servidor y solo el propietario puede verla.';
            errorDiv.style.display = 'block';
            unlockBtn.disabled = false;
            unlockBtn.textContent = 'Desbloquear';
          }
        } catch (e) {
          errorDiv.textContent = 'Error al comunicarse con el servidor seguro.';
          errorDiv.style.display = 'block';
          unlockBtn.disabled = false;
          unlockBtn.textContent = 'Desbloquear';
        }
      };

      if (unlockBtn) unlockBtn.addEventListener('click', attemptUnlock);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') attemptUnlock();
        });
      }

      throw new Error(`Acceso denegado a ${currentPage} para rol ${roleId}`);
    }
  },

  // 2. Filtrar enlaces de navegación dinámicamente según el rol
  updateNavigationLinks() {
    const roleId = AetherStore.getCurrentRole();
    const isPages = this.isInsidePagesFolder();
    const prefix = isPages ? '' : 'pages/';
    const root = isPages ? '../' : '';

    const desktopNav = document.querySelector('.nav-links-desktop');
    const mobileDrawer = document.getElementById('mobileDrawer');

    let linksHtml = '';

    if (roleId === 'cliente') {
      linksHtml = `
        <li><a href="${root}index.html" class="nav-item-link ${this.getCurrentPage() === 'index.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link ${this.getCurrentPage() === 'tienda.html' ? 'active' : ''}">Tienda & Catálogo</a></li>
        <li><a href="${prefix}tienda.html?cat=televisores#sec-televisores" data-cat-nav="televisores" class="nav-item-link">Televisores</a></li>
        <li><a href="${prefix}tienda.html?cat=neveras#sec-neveras" data-cat-nav="neveras" class="nav-item-link">Neveras</a></li>
        <li><a href="${prefix}tienda.html?cat=parlantes#sec-parlantes" data-cat-nav="parlantes" class="nav-item-link">Parlantes</a></li>
        <li><a href="${prefix}tienda.html?cat=otros#sec-otros" data-cat-nav="otros" class="nav-item-link">Cocina</a></li>
      `;
    } else if (roleId === 'facturero') {
      linksHtml = `
        <li><a href="${prefix}pedidos.html" class="nav-item-link ${this.getCurrentPage() === 'pedidos.html' ? 'active' : ''}" style="color:var(--color-coral-pulse); font-weight:700;">🧾 Pedidos & Facturación</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link ${this.getCurrentPage() === 'tienda.html' ? 'active' : ''}">Catálogo de Consulta</a></li>
      `;
    } else if (roleId === 'inventario') {
      linksHtml = `
        <li><a href="${prefix}inventario.html" class="nav-item-link ${this.getCurrentPage() === 'inventario.html' ? 'active' : ''}" style="color:var(--color-coral-pulse); font-weight:700;">📦 Inventario & Ofertas</a></li>
        <li><a href="${prefix}finanzas.html" class="nav-item-link ${this.getCurrentPage() === 'finanzas.html' ? 'active' : ''}">Finanzas & Gráficas</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link">Vista Tienda</a></li>
      `;
    } else if (roleId === 'admin') {
      linksHtml = `
        <li><a href="${root}index.html" class="nav-item-link ${this.getCurrentPage() === 'index.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link ${this.getCurrentPage() === 'tienda.html' ? 'active' : ''}">Tienda</a></li>
        <li><a href="${prefix}pedidos.html" class="nav-item-link ${this.getCurrentPage() === 'pedidos.html' ? 'active' : ''}">Pedidos</a></li>
        <li><a href="${prefix}inventario.html" class="nav-item-link ${this.getCurrentPage() === 'inventario.html' ? 'active' : ''}">Inventario & Ofertas</a></li>
        <li><a href="${prefix}finanzas.html" class="nav-item-link ${this.getCurrentPage() === 'finanzas.html' ? 'active' : ''}">Finanzas</a></li>
      `;
    }

    if (desktopNav) desktopNav.innerHTML = linksHtml;

    if (mobileDrawer) {
      if (roleId === 'cliente') {
        mobileDrawer.innerHTML = `
          <a href="${root}index.html"><span>🏠 Inicio</span></a>
          <a href="${prefix}tienda.html?cat=all" data-cat-nav="all"><span>🛍️ Tienda & Catálogo Completo</span></a>
          <a href="${prefix}tienda.html?cat=televisores#sec-televisores" data-cat-nav="televisores"><span>📺 Televisores OLED & QLED</span></a>
          <a href="${prefix}tienda.html?cat=neveras#sec-neveras" data-cat-nav="neveras"><span>🧊 Neveras & Refrigeración</span></a>
          <a href="${prefix}tienda.html?cat=parlantes#sec-parlantes" data-cat-nav="parlantes"><span>🔊 Parlantes & Audio Hi-Fi</span></a>
          <a href="${prefix}tienda.html?cat=otros#sec-otros" data-cat-nav="otros"><span>☕ Cocina & Hogar Inteligente</span></a>
        `;
      } else if (roleId === 'facturero') {
        mobileDrawer.innerHTML = `
          <a href="${prefix}pedidos.html"><span>🧾 Módulo de Pedidos & Facturas DIAN</span></a>
          <a href="${prefix}tienda.html?cat=all" data-cat-nav="all"><span>🛍️ Consulta de Catálogo</span></a>
        `;
      } else if (roleId === 'inventario') {
        mobileDrawer.innerHTML = `
          <a href="${prefix}inventario.html"><span>📦 Inventario, Bodegas & Ofertas</span></a>
          <a href="${prefix}finanzas.html"><span>📊 Finanzas & Gráficas</span></a>
          <a href="${prefix}tienda.html?cat=all" data-cat-nav="all"><span>🛍️ Vista Tienda</span></a>
        `;
      } else if (roleId === 'admin') {
        mobileDrawer.innerHTML = `
          <a href="${root}index.html"><span>🏠 Inicio</span></a>
          <a href="${prefix}tienda.html?cat=all" data-cat-nav="all"><span>🛍️ Tienda & Catálogo</span></a>
          <a href="${prefix}pedidos.html"><span>🧾 Pedidos & Facturación</span></a>
          <a href="${prefix}inventario.html"><span>📦 Inventario & Ofertas</span></a>
          <a href="${prefix}finanzas.html"><span>📊 Finanzas & Reportes</span></a>
        `;
      }
    }
  },

  // 2.5. Animación Fluida de Menú Móvil + Auto-Ocultamiento de Barra Superior al Bajar
  setupMobileMenuAndAutoHideHeader() {
    const oldBtn = document.getElementById('mobileNavBtn');
    const drawer = document.getElementById('mobileDrawer');
    const header = document.querySelector('.site-header');

    let backdrop = document.getElementById('mobileMenuBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'mobileMenuBackdrop';
      backdrop.className = 'mobile-menu-backdrop';
      document.body.appendChild(backdrop);
    }

    if (oldBtn && drawer) {
      const mobileBtn = oldBtn.cloneNode(false);
      mobileBtn.innerHTML = `
        <span class="hamburger-box" aria-hidden="true">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </span>
      `;
      oldBtn.parentNode.replaceChild(mobileBtn, oldBtn);

      const closeMenu = () => {
        drawer.classList.remove('open');
        mobileBtn.classList.remove('is-active');
        mobileBtn.setAttribute('aria-expanded', 'false');
        backdrop.classList.remove('open');
      };

      const toggleMenu = (e) => {
        if (e) e.stopPropagation();
        const willOpen = !drawer.classList.contains('open');
        drawer.classList.toggle('open', willOpen);
        mobileBtn.classList.toggle('is-active', willOpen);
        mobileBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        backdrop.classList.toggle('open', willOpen);
        if (willOpen && header) {
          header.classList.remove('header-hidden');
        }
      };

      mobileBtn.addEventListener('click', toggleMenu);
      backdrop.addEventListener('click', closeMenu);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });

      drawer.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a) closeMenu();
      });
    }

    if (header) {
      let lastScrollY = window.scrollY || 0;
      let ticking = false;

      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentY = window.scrollY || 0;
            const delta = currentY - lastScrollY;
            const isDrawerOpen = drawer && drawer.classList.contains('open');

            if (currentY <= 50) {
              header.classList.remove('header-hidden');
            } else if (delta > 5 && currentY > 65 && !isDrawerOpen) {
              header.classList.add('header-hidden');
            } else if (delta < -7) {
              header.classList.remove('header-hidden');
            }

            lastScrollY = currentY;
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }
  },

  // 3. Inyectar botón de cambio de rol: círculo estético con iniciales
  injectRoleSwitcher() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    const currentRole = AetherStore.getCurrentRole();
    const roleInfo = AetherStore.ROLES[currentRole] || AetherStore.ROLES.cliente;

    const initialsMap = {
      cliente: 'CL',
      facturero: 'FC',
      inventario: 'IN',
      admin: 'AD'
    };
    const initials = initialsMap[currentRole] || 'CL';

    let roleBtn = document.getElementById('btnRoleSwitcher');
    if (!roleBtn) {
      roleBtn = document.createElement('button');
      roleBtn.id = 'btnRoleSwitcher';
      roleBtn.className = 'role-avatar-circle';
      roleBtn.type = 'button';
      roleBtn.addEventListener('click', () => this.openRoleModal());
      navActions.appendChild(roleBtn);
    }

    roleBtn.className = 'role-avatar-circle';
    roleBtn.setAttribute('data-role', currentRole);
    roleBtn.title = `Cuenta activa: ${roleInfo.label} (${initials}) — Clic para cambiar perfil o autenticar propietario`;
    roleBtn.setAttribute('aria-label', `Perfil: ${roleInfo.label}`);
    roleBtn.innerHTML = `<span>${initials}</span>`;
  },

  // 4. Modal para seleccionar rol con Validación de Propietario en Servidor
  openRoleModal() {
    let modal = document.getElementById('roleSelectModal');
    if (modal) modal.remove();

    const currentRole = AetherStore.getCurrentRole();
    const isOwner = this.isOwnerSessionActive();

    modal = document.createElement('div');
    modal.id = 'roleSelectModal';
    modal.className = 'bella-modal-backdrop';
    modal.innerHTML = `
      <div class="bella-modal-box" style="max-width:540px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div>
            <span class="bestseller-badge">Seguridad & Base de Datos Privada</span>
            <h3 style="font-size:20px; font-weight:700; margin-top:4px;">Control de Acceso Comercial</h3>
          </div>
          <button class="pill-btn sm" id="btnCloseRoleModal">✕</button>
        </div>

        <p style="font-size:13px; color:#555; margin-bottom:16px; line-height:1.4;">
          La base de datos completa es <strong>privada del servidor</strong>. Los perfiles administrativos requieren la clave de propietario configurada en las variables de entorno del servidor.
        </p>

        <!-- Bloque de Clave de Propietario (Aparece si selecciona rol administrativo) -->
        <div id="modalOwnerUnlockBox" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-bottom:16px;">
          <label for="modalOwnerKeyInput" style="font-size:12px; font-weight:700; display:block; margin-bottom:6px; color:#0f172a;">
            🔒 Clave de Propietario (Variable de entorno BELLA_OWNER_ACCESS_CODE):
          </label>
          <div style="display:flex; gap:8px;">
            <input
              type="password"
              id="modalOwnerKeyInput"
              class="pill-input"
              placeholder="Escribe la clave de propietario..."
              style="width:100%; background:#fff;"
            />
            <button class="pill-btn coral" id="btnModalConfirmUnlock" style="white-space:nowrap;">Desbloquear</button>
          </div>
          <div id="modalAuthErrorMsg" style="color:#b91c1c; font-size:12px; margin-top:6px; display:none; font-weight:600;"></div>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
          <!-- Rol 1: Cliente -->
          <div class="role-card-option ${currentRole === 'cliente' ? 'selected' : ''}" data-role="cliente">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">👤</span>
              <div>
                <strong style="font-size:14px; display:block;">Cliente / Consumidor (Público)</strong>
                <span style="font-size:12px; color:#555;">Visualiza Inicio y Tienda. La base de datos privada queda oculta.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'cliente' ? 'coral' : ''}">
              ${currentRole === 'cliente' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 2: Facturero -->
          <div class="role-card-option ${currentRole === 'facturero' ? 'selected' : ''}" data-role="facturero">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">🧾</span>
              <div>
                <strong style="font-size:14px; display:block;">Facturación / Despacho 🔒</strong>
                <span style="font-size:12px; color:#555;">Acceso a Pedidos y Facturas DIAN. Requiere autenticación de propietario.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'facturero' ? 'coral' : ''}">
              ${currentRole === 'facturero' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 3: Inventario & Finanzas -->
          <div class="role-card-option ${currentRole === 'inventario' ? 'selected' : ''}" data-role="inventario">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">📦</span>
              <div>
                <strong style="font-size:14px; display:block;">Inventario & Analítica 🔒</strong>
                <span style="font-size:12px; color:#555;">Existencias en las 4 bodegas, ofertas y gráficas de costos.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'inventario' ? 'coral' : ''}">
              ${currentRole === 'inventario' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 4: Administrador General -->
          <div class="role-card-option ${currentRole === 'admin' ? 'selected' : ''}" data-role="admin">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">🛡️</span>
              <div>
                <strong style="font-size:14px; display:block;">Administrador General (Propietario) 🔒</strong>
                <span style="font-size:12px; color:#555;">Acceso irrestricto a la base de datos privada completa.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'admin' ? 'coral' : ''}">
              ${currentRole === 'admin' ? 'Activo' : 'Elegir'}
            </button>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          ${isOwner ? `
            <button class="pill-btn sm" id="btnLogoutOwner" style="background:#fef2f2; border-color:#ef4444; color:#b91c1c; font-size:12px;">
              🔒 Bloquear Base de Datos
            </button>
          ` : `<span></span>`}
          <button class="pill-btn" id="btnCancelRoleModal">Cerrar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const unlockBox = modal.querySelector('#modalOwnerUnlockBox');
    const keyInput = modal.querySelector('#modalOwnerKeyInput');
    const confirmUnlockBtn = modal.querySelector('#btnModalConfirmUnlock');
    const errorMsg = modal.querySelector('#modalAuthErrorMsg');
    let pendingRole = null;

    modal.querySelector('#btnCloseRoleModal').addEventListener('click', () => modal.remove());
    modal.querySelector('#btnCancelRoleModal').addEventListener('click', () => modal.remove());

    const logoutBtn = modal.querySelector('#btnLogoutOwner');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (window.CloudSync && window.CloudSync.clearOwnerToken) {
          window.CloudSync.clearOwnerToken();
        }
        try {
          await fetch(`${AuthRoles.getApiBase()}/api/auth`, { method: 'DELETE' });
        } catch (e) {}
        AetherStore.setCurrentRole('cliente');
        modal.remove();
        window.location.href = `${AuthRoles.getBasePath()}tienda.html`;
      });
    }

    const verifyAndApplyRole = async (roleToApply, accessCode) => {
      confirmUnlockBtn.disabled = true;
      confirmUnlockBtn.textContent = 'Verificando...';
      errorMsg.style.display = 'none';

      try {
        const res = await fetch(`${AuthRoles.getApiBase()}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode, role: roleToApply })
        });
        const data = await res.json();
        if (res.ok && data.ok && data.token) {
          if (window.CloudSync && window.CloudSync.setOwnerToken) {
            window.CloudSync.setOwnerToken(data.token);
          }
          AetherStore.setCurrentRole(roleToApply);

          if (window.CloudSync && window.CloudSync.syncWithServerState) {
            window.CloudSync.syncWithServerState(true);
          }

          modal.remove();
          const isPages = AuthRoles.isInsidePagesFolder();
          const prefix = isPages ? '' : 'pages/';
          if (roleToApply === 'facturero') {
            window.location.href = `${prefix}pedidos.html`;
          } else if (roleToApply === 'inventario') {
            window.location.href = `${prefix}inventario.html`;
          } else {
            window.location.reload();
          }
        } else {
          errorMsg.textContent = data.error || '🔒 Clave incorrecta: la base de datos es privada del servidor y solo el propietario puede verla.';
          errorMsg.style.display = 'block';
          confirmUnlockBtn.disabled = false;
          confirmUnlockBtn.textContent = 'Desbloquear';
        }
      } catch (e) {
        errorMsg.textContent = 'Error conectando con el servidor seguro.';
        errorMsg.style.display = 'block';
        confirmUnlockBtn.disabled = false;
        confirmUnlockBtn.textContent = 'Desbloquear';
      }
    };

    if (confirmUnlockBtn && keyInput) {
      confirmUnlockBtn.addEventListener('click', () => {
        const key = keyInput.value.trim();
        if (!key) {
          errorMsg.textContent = 'Ingresa la clave de propietario.';
          errorMsg.style.display = 'block';
          return;
        }
        verifyAndApplyRole(pendingRole || 'admin', key);
      });
      keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          confirmUnlockBtn.click();
        }
      });
    }

    modal.querySelectorAll('.role-card-option').forEach(card => {
      card.addEventListener('click', () => {
        const selectedRole = card.getAttribute('data-role');

        if (selectedRole === 'cliente') {
          if (window.CloudSync && window.CloudSync.clearOwnerToken) {
            window.CloudSync.clearOwnerToken();
          }
          AetherStore.setCurrentRole('cliente');
          modal.remove();
          const isPages = AuthRoles.isInsidePagesFolder();
          window.location.href = isPages ? 'tienda.html' : 'pages/tienda.html';
          return;
        }

        // Si ya cuenta con sesión de propietario verificada, aplicar directamente
        if (AuthRoles.isOwnerSessionActive()) {
          AetherStore.setCurrentRole(selectedRole);
          modal.remove();
          const isPages = AuthRoles.isInsidePagesFolder();
          const prefix = isPages ? '' : 'pages/';
          if (selectedRole === 'facturero') {
            window.location.href = `${prefix}pedidos.html`;
          } else if (selectedRole === 'inventario') {
            window.location.href = `${prefix}inventario.html`;
          } else {
            window.location.reload();
          }
          return;
        }

        // Solicitar clave de propietario al seleccionar roles administrativos
        pendingRole = selectedRole;
        if (unlockBox) {
          unlockBox.style.display = 'block';
          keyInput.focus();
        }
      });
    });
  }
};

window.AuthRoles = AuthRoles;
document.addEventListener('DOMContentLoaded', () => AuthRoles.init());
