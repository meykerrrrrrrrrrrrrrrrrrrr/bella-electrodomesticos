/**
 * bella Electrodomésticos — Lógica de Tienda, Categorías Directas y Filtro de Precio ($ 1.000 hasta ∞ Infinito)
 * Moneda: Pesos Colombianos ($ COP)
 */

const SECTIONS_CONFIG = [
  {
    key: 'televisores',
    id: 'sec-televisores',
    icon: '📺',
    eyebrow: 'Línea Visual & Entretenimiento',
    title: 'Televisores Smart 8K, QLED & Cuadros de Arte',
    desc: 'Paneles OLED con negros puros, curvatura Gaming 165Hz y pantallas antirreflejo Frame con marco intercambiable.'
  },
  {
    key: 'neveras',
    id: 'sec-neveras',
    icon: '🧊',
    eyebrow: 'Línea Refrigeración & Conservación',
    title: 'Neveras Inteligentes, InstaView & Cavas Sommelier',
    desc: 'French Door de 4 puertas con pantalla táctil, cristal templado Knock-Twice, cavas climatizadas y sistemas Bespoke.'
  },
  {
    key: 'parlantes',
    id: 'sec-parlantes',
    icon: '🔊',
    eyebrow: 'Línea Acústica de Alta Fidelidad',
    title: 'Parlantes Hi-Fi, Torres 360° & Dolby Atmos',
    desc: 'Torres electroacústicas de 1200W RMS, barras de cine 11.1.4 canales y esferas magnéticas de levitación real.'
  },
  {
    key: 'otros',
    id: 'sec-otros',
    icon: '☕',
    eyebrow: 'Línea Cocina & Cuidado del Hogar',
    title: 'Cafeteras Barista, Hornos de Vapor, Lavado & Robótica',
    desc: 'Máquinas espresso comerciales con PID doble caldera, hornos pirolíticos Dual-Cook, lavadoras AI y robots LiDAR.'
  }
];

let products = AetherStore.getProducts();
let filterState = {
  search: '',
  category: 'all',
  minPrice: 1000,
  maxPrice: Infinity,
  sort: 'featured'
};

function normalizeCategoryKey(raw) {
  if (!raw) return null;
  const clean = String(raw)
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^sec-/, '');
  if (clean === 'all' || clean === 'todas' || clean === 'todos') return 'all';
  if (clean === 'televisores' || clean === 'tv') return 'televisores';
  if (clean === 'neveras' || clean === 'refrigeracion') return 'neveras';
  if (clean === 'parlantes' || clean === 'audio' || clean === 'sonido') return 'parlantes';
  if (clean === 'otros' || clean === 'cocina' || clean === 'hogar') return 'otros';
  return null;
}

function parseCopDigits(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const str = String(rawValue).trim();
  if (!str || str === '∞' || /inf/i.test(str)) return null;
  const digits = str.replace(/[^\d]/g, '');
  if (!digits) return null;
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
}

function formatDigitsWithDots(num) {
  if (num === null || num === undefined || !Number.isFinite(num)) return '';
  return Math.max(0, Math.round(num)).toLocaleString('es-CO');
}

function updatePriceRangeBadge() {
  const badge = document.getElementById('priceMaxDisplay');
  const infBtn = document.getElementById('btnPriceInfinity');
  const minText = AetherStore.formatCOP(Math.max(1000, filterState.minPrice || 1000));
  const isInf = !Number.isFinite(filterState.maxPrice) || filterState.maxPrice === Infinity;
  const maxText = isInf ? '∞ Infinito (Sin límite)' : AetherStore.formatCOP(filterState.maxPrice);

  if (badge) {
    badge.textContent = `Rango: ${minText} → ${maxText}`;
  }
  if (infBtn) {
    infBtn.classList.toggle('active', isInf);
  }
}

function updateCategoryBanner(filteredCount) {
  const banner = document.getElementById('activeCategoryBanner');
  if (!banner) return;

  if (filterState.category === 'all') {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const secInfo = SECTIONS_CONFIG.find(s => s.key === filterState.category);
  if (!secInfo) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  banner.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <span class="bestseller-badge coral">${secInfo.icon} Categoría Activa</span>
      <strong style="font-size:15px;">${secInfo.title}</strong>
      <span style="font-size:13px; color:#555;">(${filteredCount} modelos disponibles)</span>
    </div>
    <button type="button" class="pill-btn sm" onclick="window.selectShopCategory('all', false)">
      Ver Todas las Líneas (16) →
    </button>
  `;
}

function renderCatalog() {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('page-ready');
    document.body.classList.remove('page-leaving');
    document.body.style.opacity = '1';
  }

  products = AetherStore.getProducts();
  const container = document.getElementById('catalogDisplayContainer');
  if (!container) return;
  container.innerHTML = '';

  const q = (filterState.search || '').trim().toLowerCase();
  const minP = Math.max(0, Number(filterState.minPrice) || 0);
  const maxP = (filterState.maxPrice === Infinity || !Number.isFinite(filterState.maxPrice))
    ? Infinity
    : Number(filterState.maxPrice);

  // Si el usuario está escribiendo dígitos en el campo "Hasta $" y aún es menor que "Desde $",
  // permitir que filtre cuando maxP >= minP para no dejar la pantalla vacía a mitad de escritura
  const effectiveMaxP = (maxP < minP && maxP > 0) ? Infinity : maxP;

  const filtered = products.filter(p => {
    if (filterState.category !== 'all' && p.category !== filterState.category) return false;
    if (p.price < minP || p.price > effectiveMaxP) return false;
    if (q) {
      const specsStr = Object.values(p.specs || {}).join(' ').toLowerCase();
      const colorsStr = (p.colors || []).map(c => c.name).join(' ').toLowerCase();
      const haystack = `${p.name} ${p.subtitle} ${p.sku} ${p.lineName} ${p.categoryLabel} ${p.promoBadge || ''} ${p.description} ${specsStr} ${colorsStr}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sortFn = (a, b) => {
    if (filterState.sort === 'price-asc') return a.price - b.price;
    if (filterState.sort === 'price-desc') return b.price - a.price;
    if (filterState.sort === 'rating-desc') return b.rating - a.rating;
    if (filterState.sort === 'stock-desc') return b.stock - a.stock;
    if (filterState.sort === 'discount-desc') return (b.discountPercentage || 0) - (a.discountPercentage || 0);
    return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
  };

  updateCategoryBanner(filtered.length);
  updatePriceRangeBadge();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="pristine-card" style="text-align:center; padding:48px 24px; margin-bottom:48px; border:2px dashed var(--color-sand-beige);">
        <div style="font-size:42px; margin-bottom:12px;">🔍</div>
        <h3 style="font-size:22px; font-weight:700; margin-bottom:8px;">No se encontraron productos con estos filtros</h3>
        <p style="font-size:14px; color:#555; max-width:52ch; margin:0 auto 20px;">
          Ajusta el rango de precio personalizado (desde <strong>$ 1.000 COP</strong> hasta <strong>∞ Infinito</strong>) o restablece los filtros para ver todo el catálogo disponible.
        </p>
        <button type="button" class="pill-btn coral" onclick="window.resetShopFilters()">
          Restablecer Filtros ($ 1.000 a ∞) y Mostrar Todo
        </button>
      </div>
    `;
  } else {
    SECTIONS_CONFIG.forEach(sec => {
      const items = filtered.filter(p => p.category === sec.key).sort(sortFn);
      if (items.length === 0) return;

      const secEl = document.createElement('section');
      secEl.className = 'section-stack';
      secEl.id = sec.id;

      secEl.innerHTML = `
        <div class="section-title-row">
          <div>
            <span class="section-eyebrow">${sec.eyebrow}</span>
            <h2>${sec.title}</h2>
            <p style="font-size:14px; color:#555; max-width:65ch; margin-top:4px;">${sec.desc}</p>
          </div>
          <div style="font-size:13px; font-weight:700; color:#555;">
            ${items.length} modelos disponibles
          </div>
        </div>
        <div class="product-grid-4col" id="grid-${sec.key}"></div>
      `;

      const grid = secEl.querySelector(`#grid-${sec.key}`);

      items.forEach(prod => {
        const card = document.createElement('article');
        card.className = 'product-card';

        const swatchesHtml = prod.colors.map((c, idx) => `
          <span
            class="swatch-dot ${idx === 0 ? 'active' : ''}"
            data-color-idx="${idx}"
            style="background-color:${c.hex};"
            title="${c.name}"
          ></span>
        `).join('');

        const hasDiscount = (Number(prod.discountPercentage) || 0) > 0;
        const basePrice = prod.basePrice || prod.originalPrice || prod.price;

        card.innerHTML = `
          <div>
            <div class="card-badge-row">
              <span class="bestseller-badge ${hasDiscount ? 'coral' : ''}">
                ${prod.promoBadge || prod.badge}
              </span>
              <span class="sku-text">Stock: ${prod.stock} uds.</span>
            </div>

            <div class="product-img-wrapper" onclick="window.location.href='product-detail.html?id=${prod.id}'" title="Ver especificaciones y colores de ${prod.name}" style="cursor:pointer;">
              <img
                src="${prod.image}"
                alt="${prod.name}"
                loading="lazy"
                class="card-photo"
              />
            </div>

            <h3 class="product-title" onclick="window.location.href='product-detail.html?id=${prod.id}'" style="cursor:pointer;">
              ${prod.name}
            </h3>
            <p class="product-desc">${prod.subtitle}</p>

            <div class="price-display">
              <span class="price-main">${AetherStore.formatCOP(prod.price)}</span>
              ${hasDiscount ? `<span class="price-strikethrough">${AetherStore.formatCOP(basePrice)}</span>` : ''}
            </div>
          </div>

          <div>
            <div class="card-color-swatches">
              <span style="font-size:12px; font-weight:600; color:#555;" class="swatch-lbl">${prod.colors[0].name}</span>
              <div style="display:flex; gap:6px;">${swatchesHtml}</div>
            </div>

            <a href="product-detail.html?id=${prod.id}" class="pill-btn" style="width:100%; text-align:center;">
              Ver detalles del producto
            </a>
          </div>
        `;

        const imgEl = card.querySelector('.card-photo');
        const lblEl = card.querySelector('.swatch-lbl');

        card.querySelectorAll('.swatch-dot').forEach(dot => {
          dot.addEventListener('click', e => {
            e.stopPropagation();
            card.querySelectorAll('.swatch-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            const idx = Number(dot.dataset.colorIdx);
            const chosen = prod.colors[idx];
            lblEl.textContent = chosen.name;
            imgEl.style.filter = chosen.filter || 'none';
          });
        });

        grid.appendChild(card);
      });

      container.appendChild(secEl);
    });
  }

  const counter = document.getElementById('resultsCounter');
  if (counter) {
    counter.textContent = `${filtered.length} de ${products.length} productos`;
  }
}

function selectShopCategory(rawCat, shouldScroll = false) {
  const cat = normalizeCategoryKey(rawCat) || 'all';
  filterState.category = cat;

  // Asegurar que ningún filtro previo oculte los productos de la categoría elegida
  const categoryMatches = AetherStore.getProducts().filter(p => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (p.price < filterState.minPrice || p.price > filterState.maxPrice) return false;
    if (filterState.search && !`${p.name} ${p.categoryLabel}`.toLowerCase().includes(filterState.search.toLowerCase())) return false;
    return true;
  });

  if (categoryMatches.length === 0) {
    filterState.search = '';
    filterState.minPrice = 1000;
    filterState.maxPrice = Infinity;
    const searchInput = document.getElementById('shopSearchInput');
    const minIn = document.getElementById('priceMinInput');
    const maxIn = document.getElementById('priceMaxInput');
    if (searchInput) searchInput.value = '';
    if (minIn) minIn.value = '1.000';
    if (maxIn) maxIn.value = '';
  }

  document.querySelectorAll('#categoryChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });

  // Actualizar estado activo en navbar si aplica
  document.querySelectorAll('[data-cat-nav]').forEach(link => {
    const linkCat = link.getAttribute('data-cat-nav');
    link.classList.toggle('active', linkCat === cat);
  });

  renderCatalog();

  if (shouldScroll) {
    requestAnimationFrame(() => {
      const targetEl = (cat !== 'all' && document.getElementById(`sec-${cat}`))
        || document.getElementById('activeCategoryBanner')
        || document.getElementById('catalogDisplayContainer');
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

function syncCategoryFromUrl(shouldScroll = false) {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCat = normalizeCategoryKey(params.get('cat') || params.get('category'));
    const hashCat = normalizeCategoryKey(window.location.hash);
    const resolved = urlCat || hashCat;
    if (resolved) {
      selectShopCategory(resolved, shouldScroll);
      return true;
    }
  } catch (e) {}
  return false;
}

function resetShopFilters() {
  filterState = {
    search: '',
    category: 'all',
    minPrice: 1000,
    maxPrice: Infinity,
    sort: 'featured'
  };

  const searchInput = document.getElementById('shopSearchInput');
  const minInput = document.getElementById('priceMinInput');
  const maxInput = document.getElementById('priceMaxInput');
  const sortSelect = document.getElementById('sortSelect');

  if (searchInput) searchInput.value = '';
  if (minInput) minInput.value = '1.000';
  if (maxInput) maxInput.value = '';
  if (sortSelect) sortSelect.value = 'featured';

  document.querySelectorAll('#categoryChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === 'all');
  });
  document.querySelectorAll('#priceQuickChips .filter-chip').forEach((b, idx) => {
    b.classList.toggle('active', idx === 0);
  });

  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch (e) {}

  renderCatalog();
}

window.renderCatalog = renderCatalog;
window.selectShopCategory = selectShopCategory;
window.resetShopFilters = resetShopFilters;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Verificar si la URL trae categoría (?cat=neveras o #sec-neveras)
  const hadUrlCat = syncCategoryFromUrl(Boolean(window.location.hash));
  if (!hadUrlCat) {
    renderCatalog();
  }

  window.addEventListener('hashchange', () => {
    syncCategoryFromUrl(true);
  });

  window.addEventListener('popstate', () => {
    if (!syncCategoryFromUrl(false)) {
      selectShopCategory('all', false);
    }
  });

  // 2. Buscador de texto
  const searchInput = document.getElementById('shopSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      filterState.search = e.target.value;
      renderCatalog();
    });
  }

  // 3. Filtro de Precio por Dígitos Personalizados ($ 1.000 hasta Infinito)
  const minInput = document.getElementById('priceMinInput');
  const maxInput = document.getElementById('priceMaxInput');
  const infBtn = document.getElementById('btnPriceInfinity');

  if (minInput) {
    minInput.addEventListener('input', e => {
      const parsed = parseCopDigits(e.target.value);
      if (parsed === null) {
        filterState.minPrice = 0;
      } else {
        filterState.minPrice = parsed;
        const formatted = formatDigitsWithDots(parsed);
        if (e.target.value !== formatted) {
          e.target.value = formatted;
        }
      }
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      renderCatalog();
    });

    minInput.addEventListener('blur', e => {
      const parsed = parseCopDigits(e.target.value);
      const safeMin = parsed === null ? 1000 : Math.max(1000, parsed);
      filterState.minPrice = safeMin;
      e.target.value = formatDigitsWithDots(safeMin);
      renderCatalog();
    });
  }

  if (maxInput) {
    maxInput.addEventListener('input', e => {
      const parsed = parseCopDigits(e.target.value);
      if (parsed === null) {
        filterState.maxPrice = Infinity;
      } else {
        filterState.maxPrice = parsed;
        const formatted = formatDigitsWithDots(parsed);
        if (e.target.value !== formatted) {
          e.target.value = formatted;
        }
      }
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      renderCatalog();
    });
  }

  if (infBtn) {
    infBtn.addEventListener('click', () => {
      filterState.maxPrice = Infinity;
      if (maxInput) maxInput.value = '';
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      renderCatalog();
    });
  }

  // 4. Ordenamiento
  const sortSel = document.getElementById('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', e => {
      filterState.sort = e.target.value;
      renderCatalog();
    });
  }

  // 5. Botones de Categoría (Televisores, Neveras, Parlantes, Cocina & Hogar)
  document.querySelectorAll('#categoryChips .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat || 'all';
      try {
        const nextUrl = cat === 'all'
          ? window.location.pathname
          : `${window.location.pathname}?cat=${cat}#sec-${cat}`;
        window.history.replaceState(null, '', nextUrl);
      } catch (e) {}
      selectShopCategory(cat, false);
    });
  });

  // 6. Chips Rápidos de Precio ($ 1.000 a ∞, etc.)
  document.querySelectorAll('#priceQuickChips .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const minVal = Math.max(1000, Number(btn.dataset.min) || 1000);
      const rawMax = btn.dataset.max;
      const maxVal = (!rawMax || rawMax === 'Infinity' || !Number.isFinite(Number(rawMax)))
        ? Infinity
        : Number(rawMax);

      filterState.minPrice = minVal;
      filterState.maxPrice = maxVal;

      if (minInput) minInput.value = formatDigitsWithDots(minVal);
      if (maxInput) maxInput.value = maxVal === Infinity ? '' : formatDigitsWithDots(maxVal);

      renderCatalog();
    });
  });

  // 7. Botón Limpiar Filtros
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetShopFilters);
});
