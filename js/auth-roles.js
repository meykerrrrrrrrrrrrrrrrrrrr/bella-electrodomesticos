/**
 * bella Electrodomésticos — Sistema de Roles, Permisos y Navegación Segmentada
 * Separa estrictamente la interfaz según el rol del usuario:
 * - Cliente: Solo ve Inicio, Tienda/Catálogo y Detalle del Producto.
 * - Administrador: Acceso total a todos los módulos.
 * - Facturero: Acceso exclusivo a Pedidos y Facturación de ventas.
 * - Administración / Inventario: Acceso a Inventario, Ofertas y Finanzas/Gráficas.
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

  // 1. Guardián de Acceso a Páginas Restringidas
  enforcePageGuard() {
    const roleId = AetherStore.getCurrentRole();
    const role = AetherStore.ROLES[roleId] || AetherStore.ROLES.cliente;
    const currentPage = this.getCurrentPage();

    const allowed = role.allowedPages;
    const isAllowed = allowed.some(p => currentPage === p || currentPage === '' || (currentPage === 'index.html' && p === 'index.html'));

    if (!isAllowed) {
      document.body.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#ebeadf; font-family:'DM Sans', sans-serif; padding:20px;">
          <div style="background:#ffffff; border-radius:12px; padding:36px; max-width:520px; width:100%; text-align:center;">
            <div style="font-size:48px; margin-bottom:12px;">🔒</div>
            <h1 style="font-size:24px; font-weight:700; margin-bottom:8px;">Acceso Restringido</h1>
            <p style="font-size:15px; color:#555; margin-bottom:20px; line-height:1.4;">
              Tu usuario se encuentra en <strong>${role.badge}</strong>. Esta sección requiere permisos especiales de acceso según la política de seguridad comercial.
            </p>
            <div style="background:#d5cec0; border-radius:12px; padding:16px; margin-bottom:24px; text-align:left; font-size:13px;">
              <div style="margin-bottom:4px;"><strong>Página solicitada:</strong> ${currentPage}</div>
              <div style="margin-bottom:4px;"><strong>Tu rol actual:</strong> ${role.label}</div>
              <div><strong>Permiso requerido:</strong> ${currentPage === 'pedidos.html' ? 'Facturero o Administrador' : 'Inventario o Administrador'}</div>
            </div>
            <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
              <button class="pill-btn coral" onclick="AuthRoles.openRoleModal()">Cambiar mi Rol de Acceso</button>
              <a href="${this.isInsidePagesFolder() ? 'tienda.html' : 'pages/tienda.html'}" class="pill-btn">Ir a la Tienda</a>
            </div>
          </div>
        </div>
      `;
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
      // Cliente: SOLO INICIO Y TIENDA
      linksHtml = `
        <li><a href="${root}index.html" class="nav-item-link ${this.getCurrentPage() === 'index.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link ${this.getCurrentPage() === 'tienda.html' ? 'active' : ''}">Tienda & Catálogo</a></li>
        <li><a href="${prefix}tienda.html?cat=televisores#sec-televisores" data-cat-nav="televisores" class="nav-item-link">Televisores</a></li>
        <li><a href="${prefix}tienda.html?cat=neveras#sec-neveras" data-cat-nav="neveras" class="nav-item-link">Neveras</a></li>
        <li><a href="${prefix}tienda.html?cat=parlantes#sec-parlantes" data-cat-nav="parlantes" class="nav-item-link">Parlantes</a></li>
        <li><a href="${prefix}tienda.html?cat=otros#sec-otros" data-cat-nav="otros" class="nav-item-link">Cocina</a></li>
      `;
    } else if (roleId === 'facturero') {
      // Facturero: PEDIDOS Y FACTURACIÓN
      linksHtml = `
        <li><a href="${prefix}pedidos.html" class="nav-item-link ${this.getCurrentPage() === 'pedidos.html' ? 'active' : ''}" style="color:var(--color-coral-pulse); font-weight:700;">🧾 Pedidos & Facturación</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link ${this.getCurrentPage() === 'tienda.html' ? 'active' : ''}">Catálogo de Consulta</a></li>
      `;
    } else if (roleId === 'inventario') {
      // Inventario: INVENTARIO, OFERTAS Y FINANZAS
      linksHtml = `
        <li><a href="${prefix}inventario.html" class="nav-item-link ${this.getCurrentPage() === 'inventario.html' ? 'active' : ''}" style="color:var(--color-coral-pulse); font-weight:700;">📦 Inventario & Ofertas</a></li>
        <li><a href="${prefix}finanzas.html" class="nav-item-link ${this.getCurrentPage() === 'finanzas.html' ? 'active' : ''}">Finanzas & Gráficas</a></li>
        <li><a href="${prefix}tienda.html?cat=all" data-cat-nav="all" class="nav-item-link">Vista Tienda</a></li>
      `;
    } else if (roleId === 'admin') {
      // Administrador: TODO
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

    // Crear backdrop para el menú móvil
    let backdrop = document.getElementById('mobileMenuBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'mobileMenuBackdrop';
      backdrop.className = 'mobile-menu-backdrop';
      document.body.appendChild(backdrop);
    }

    if (oldBtn && drawer) {
      // Clonar el botón para eliminar listeners inline duplicados en las páginas HTML
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

      // Cerrar el menú suavemente al pulsar cualquier opción
      drawer.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a) closeMenu();
      });
    }

    // Auto-ocultar la barra superior (.site-header) cuando el usuario baja haciendo scroll
    // para que los botones nunca estorben la vista, y mostrarla al subir
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
              // Usuario bajando: ocultar barra para no estorbar la vista
              header.classList.add('header-hidden');
            } else if (delta < -7) {
              // Usuario subiendo: volver a mostrar barra suavemente
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

  // 3. Inyectar botón de cambio de rol: pequeño círculo estético con iniciales
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
    roleBtn.title = `Cuenta activa: ${roleInfo.label} (${initials}) — Clic para cambiar perfil`;
    roleBtn.setAttribute('aria-label', `Perfil: ${roleInfo.label}`);
    roleBtn.innerHTML = `<span>${initials}</span>`;
  },

  // 4. Modal para seleccionar rol
  openRoleModal() {
    let modal = document.getElementById('roleSelectModal');
    if (modal) modal.remove();

    const currentRole = AetherStore.getCurrentRole();

    modal = document.createElement('div');
    modal.id = 'roleSelectModal';
    modal.className = 'bella-modal-backdrop';
    modal.innerHTML = `
      <div class="bella-modal-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <span class="bestseller-badge">Control de Acceso Comercial</span>
            <h3 style="font-size:22px; font-weight:700; margin-top:4px;">Seleccionar Rol de Usuario</h3>
          </div>
          <button class="pill-btn sm" id="btnCloseRoleModal">✕</button>
        </div>

        <p style="font-size:14px; color:#555; margin-bottom:20px; line-height:1.4;">
          El sistema adapta automáticamente la interfaz y protege las secciones según el perfil seleccionado:
        </p>

        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
          <!-- Rol 1: Cliente -->
          <div class="role-card-option ${currentRole === 'cliente' ? 'selected' : ''}" data-role="cliente">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">👤</span>
              <div>
                <strong style="font-size:15px; display:block;">Cliente / Consumidor</strong>
                <span style="font-size:12px; color:#555;">Solo visualiza la Presentación de Inicio y el Catálogo/Tienda. Bloquea inventarios y finanzas.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'cliente' ? 'coral' : ''}">
              ${currentRole === 'cliente' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 2: Facturero -->
          <div class="role-card-option ${currentRole === 'facturero' ? 'selected' : ''}" data-role="facturero">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">🧾</span>
              <div>
                <strong style="font-size:15px; display:block;">Facturación / Despacho</strong>
                <span style="font-size:12px; color:#555;">Acceso exclusivo a Pedidos en tiempo real, emisión de Facturas DIAN ($ COP) y cambios de estado.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'facturero' ? 'coral' : ''}">
              ${currentRole === 'facturero' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 3: Inventario & Finanzas -->
          <div class="role-card-option ${currentRole === 'inventario' ? 'selected' : ''}" data-role="inventario">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">📦</span>
              <div>
                <strong style="font-size:15px; display:block;">Administración / Inventario & Logística</strong>
                <span style="font-size:12px; color:#555;">Gestión de existencias en las 4 bodegas, asignación de ofertas por línea o producto y gráficas financieras.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'inventario' ? 'coral' : ''}">
              ${currentRole === 'inventario' ? 'Activo' : 'Elegir'}
            </button>
          </div>

          <!-- Rol 4: Administrador General -->
          <div class="role-card-option ${currentRole === 'admin' ? 'selected' : ''}" data-role="admin">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">🛡️</span>
              <div>
                <strong style="font-size:15px; display:block;">Administrador General</strong>
                <span style="font-size:12px; color:#555;">Acceso irrestricto a todos los módulos: Inicio, Tienda, Pedidos, Inventario, Ofertas y Finanzas.</span>
              </div>
            </div>
            <button class="pill-btn sm ${currentRole === 'admin' ? 'coral' : ''}">
              ${currentRole === 'admin' ? 'Activo' : 'Elegir'}
            </button>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <button class="pill-btn" id="btnCancelRoleModal">Cerrar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btnCloseRoleModal').addEventListener('click', () => modal.remove());
    modal.querySelector('#btnCancelRoleModal').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.role-card-option').forEach(card => {
      card.addEventListener('click', () => {
        const selectedRole = card.getAttribute('data-role');
        AetherStore.setCurrentRole(selectedRole);

        // Notificar en la nube que este dispositivo cambió de rol
        if (window.CloudSync && window.CloudSync.broadcast) {
          window.CloudSync.broadcast('ROLE_SWITCHED', { role: selectedRole, device: CloudSync.getDeviceId() });
        }

        modal.remove();

        // Redirigir a la vista por defecto de ese rol
        const isPages = AuthRoles.isInsidePagesFolder();
        const prefix = isPages ? '' : 'pages/';
        const root = isPages ? '../' : '';

        if (selectedRole === 'cliente') {
          window.location.href = `${prefix}tienda.html`;
        } else if (selectedRole === 'facturero') {
          window.location.href = `${prefix}pedidos.html`;
        } else if (selectedRole === 'inventario') {
          window.location.href = `${prefix}inventario.html`;
        } else if (selectedRole === 'admin') {
          window.location.reload();
        }
      });
    });
  }
};

window.AuthRoles = AuthRoles;
document.addEventListener('DOMContentLoaded', () => AuthRoles.init());
