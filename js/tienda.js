/**
 * bella Electrodomésticos — Lógica de Tienda y Catálogo
 * Moneda: Pesos Colombianos ($ COP)
 */

const SECTIONS_CONFIG = [
  {
    key: 'televisores',
    id: 'sec-televisores',
    eyebrow: 'Línea Visual & Entretenimiento',
    title: 'Televisores Smart 8K, QLED & Cuadros de Arte',
    desc: 'Paneles OLED con negros puros, curvatura Gaming 165Hz y pantallas antirreflejo Frame con marco intercambiable.'
  },
  {
    key: 'neveras',
    id: 'sec-neveras',
    eyebrow: 'Línea Refrigeración & Conservación',
    title: 'Neveras Inteligentes, InstaView & Cavas Sommelier',
    desc: 'French Door de 4 puertas con pantalla táctil, cristal templado Knock-Twice, cavas climatizadas y sistemas Bespoke.'
  },
  {
    key: 'parlantes',
    id: 'sec-parlantes',
    eyebrow: 'Línea Acústica de Alta Fidelidad',
    title: 'Parlantes Hi-Fi, Torres 360° & Dolby Atmos',
    desc: 'Torres electroacústicas de 1200W RMS, barras de cine 11.1.4 canales y esferas magnéticas de levitación real.'
  },
  {
    key: 'otros',
    id: 'sec-otros',
    eyebrow: 'Línea Cocina & Cuidado del Hogar',
    title: 'Cafeteras Barista, Hornos de Vapor, Lavado & Robótica',
    desc: 'Máquinas espresso comerciales con PID doble caldera, hornos pirolíticos Dual-Cook, lavadoras AI y robots LiDAR.'
  }
];

let products = AetherStore.getProducts();
let filterState = {
  search: '',
  category: 'all',
  minPrice: 0,
  maxPrice: 25000000,
  sort: 'featured'
};

function renderCatalog() {
  products = AetherStore.getProducts();
  const container = document.getElementById('catalogDisplayContainer');
  if (!container) return;
  container.innerHTML = '';

  const q = filterState.search.trim().toLowerCase();

  const filtered = products.filter(p => {
    if (filterState.category !== 'all' && p.category !== filterState.category) return false;
    if (p.price < filterState.minPrice || p.price > filterState.maxPrice) return false;
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

  const counter = document.getElementById('resultsCounter');
  if (counter) {
    counter.textContent = `${filtered.length} de ${products.length} productos`;
  }
}

function resetShopFilters() {
  filterState = {
    search: '',
    category: 'all',
    minPrice: 0,
    maxPrice: 25000000,
    sort: 'featured'
  };

  document.getElementById('shopSearchInput').value = '';
  document.getElementById('priceRangeSlider').value = 25000000;
  document.getElementById('priceMaxDisplay').textContent = '$ 25.000.000 COP';
  document.getElementById('sortSelect').value = 'featured';

  document.querySelectorAll('#categoryChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === 'all');
  });
  document.querySelectorAll('#priceQuickChips .filter-chip').forEach((b, idx) => {
    b.classList.toggle('active', idx === 0);
  });

  renderCatalog();
}

window.renderCatalog = renderCatalog;

document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();

  const searchInput = document.getElementById('shopSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      filterState.search = e.target.value;
      renderCatalog();
    });
  }

  const slider = document.getElementById('priceRangeSlider');
  if (slider) {
    slider.addEventListener('input', e => {
      const val = Number(e.target.value);
      filterState.minPrice = 0;
      filterState.maxPrice = val;
      document.getElementById('priceMaxDisplay').textContent = AetherStore.formatCOP(val);
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      renderCatalog();
    });
  }

  const sortSel = document.getElementById('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', e => {
      filterState.sort = e.target.value;
      renderCatalog();
    });
  }

  document.querySelectorAll('#categoryChips .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#categoryChips .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.category = btn.dataset.cat;
      renderCatalog();
    });
  });

  document.querySelectorAll('#priceQuickChips .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#priceQuickChips .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.minPrice = Number(btn.dataset.min);
      filterState.maxPrice = Number(btn.dataset.max);
      if (slider) slider.value = filterState.maxPrice;
      document.getElementById('priceMaxDisplay').textContent = AetherStore.formatCOP(filterState.maxPrice);
      renderCatalog();
    });
  });

  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetShopFilters);
});
