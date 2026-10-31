/**
 * bella Electrodomésticos — Lógica del Detalle de Producto
 * Moneda: Pesos Colombianos ($ COP)
 * Carga información técnica, selector interactivo de colores y transmisión de pedidos en vivo.
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id') || 'tv-01';

  let product = AetherStore.getProductById(productId);

  if (!product) {
    const all = AetherStore.getProducts();
    product = all[0] || null;
  }

  if (!product) {
    document.getElementById('productTitle').textContent = 'Producto no encontrado';
    return;
  }

  // Actualizar Título de la Pestaña
  document.title = `bella Electrodomésticos — ${product.name}`;

  // Breadcrumbs
  const breadcrumbCat = document.getElementById('breadcrumbCategory');
  if (breadcrumbCat) {
    breadcrumbCat.innerHTML = `<a href="tienda.html?cat=${product.category}#sec-${product.category}">${product.categoryLabel}</a>`;
  }
  const breadcrumbName = document.getElementById('breadcrumbProductName');
  if (breadcrumbName) {
    breadcrumbName.textContent = product.name;
  }

  // Tags & Badges
  const badgeTag = document.getElementById('productBadgeTag');
  if (badgeTag) {
    badgeTag.textContent = product.promoBadge || product.badge || 'Exclusivo';
    if (product.discountPercentage && product.discountPercentage > 0) {
      badgeTag.style.backgroundColor = 'var(--color-coral-pulse)';
    }
  }

  const skuTag = document.getElementById('productSkuTag');
  if (skuTag) skuTag.textContent = `SKU: ${product.sku}`;

  // Fotografía Principal y Selector de Colores
  const mainPhoto = document.getElementById('detailMainPhoto');
  const colorDisplay = document.getElementById('photoColorIndicator');
  const activeColorDisplay = document.getElementById('activeColorNameDisplay');
  const colorContainer = document.getElementById('colorOptionsWrap');

  let selectedColor = product.colors && product.colors.length > 0 ? product.colors[0] : { name: 'Estándar', hex: '#111', filter: 'none' };

  if (mainPhoto) {
    mainPhoto.src = product.image;
    mainPhoto.alt = product.name;
    mainPhoto.style.filter = selectedColor.filter || 'none';
  }

  if (colorDisplay) colorDisplay.textContent = `Color: ${selectedColor.name}`;
  if (activeColorDisplay) activeColorDisplay.textContent = selectedColor.name;

  // Renderizar Botones de Color
  if (colorContainer && product.colors) {
    colorContainer.innerHTML = '';
    product.colors.forEach((c, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `color-select-btn ${index === 0 ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="color-indicator-circle" style="background-color: ${c.hex};"></span>
        <span>${c.name}</span>
      `;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = c;

        if (colorDisplay) colorDisplay.textContent = `Color: ${c.name}`;
        if (activeColorDisplay) activeColorDisplay.textContent = c.name;

        // Efecto visual instantáneo en la fotografía real
        if (mainPhoto) {
          mainPhoto.style.transition = 'filter 0.35s ease, transform 0.2s ease';
          mainPhoto.style.transform = 'scale(0.98)';
          setTimeout(() => {
            mainPhoto.style.filter = c.filter || 'none';
            mainPhoto.style.transform = 'scale(1)';
          }, 150);
        }
      });

      colorContainer.appendChild(btn);
    });
  }

  // Encabezados y Textos
  const lineLabel = document.getElementById('productLineLabel');
  if (lineLabel) lineLabel.textContent = product.lineName ? product.lineName.toUpperCase() : product.categoryLabel.toUpperCase();

  const ratingEl = document.getElementById('productRatingText');
  if (ratingEl) ratingEl.textContent = `★ ${product.rating} (${product.reviews || 240} reseñas verificadas en Colombia)`;

  const titleEl = document.getElementById('productTitle');
  if (titleEl) titleEl.textContent = product.name;

  const descEl = document.getElementById('productDescription');
  if (descEl) descEl.textContent = product.description;

  // Precios en Pesos Colombianos (COP)
  const priceEl = document.getElementById('productPrice');
  const hasDiscount = (Number(product.discountPercentage) || 0) > 0;
  const basePrice = product.basePrice || product.originalPrice || product.price;

  if (priceEl) {
    if (hasDiscount) {
      priceEl.innerHTML = `
        <span>${AetherStore.formatCOP(product.price)}</span>
        <span style="font-size:18px; text-decoration:line-through; opacity:0.5; margin-left:10px; color:#555;">
          ${AetherStore.formatCOP(basePrice)}
        </span>
      `;
    } else {
      priceEl.textContent = AetherStore.formatCOP(product.price);
    }
  }

  window.updateStockDisplays = function() {
    const current = AetherStore.getProductById(product.id) || product;
    const stockEl = document.getElementById('productStockTotal');
    if (stockEl) {
      stockEl.textContent = `${current.stock} unidades disponibles`;
      stockEl.style.color = current.stock <= 10 ? 'var(--color-coral-pulse)' : 'inherit';
    }

    const whText = document.getElementById('productWarehousesText');
    if (whText && current.warehouseDistribution) {
      const d = current.warehouseDistribution;
      whText.textContent = `Bogotá: ${d.Centro || 0} | Medellín: ${d.Norte || 0} | Cali: ${d.Sur || 0} | Barranquilla: ${d.Costa || 0}`;
    }
  };
  window.updateStockDisplays();

  // Renderizar Tabla de Especificaciones Técnicas
  const specsContainer = document.getElementById('specsListWrap');
  if (specsContainer && product.specs) {
    specsContainer.innerHTML = '';
    Object.entries(product.specs).forEach(([specKey, specVal]) => {
      const row = document.createElement('div');
      row.className = 'spec-table-row';
      row.innerHTML = `
        <span>${specKey}</span>
        <strong>${specVal}</strong>
      `;
      specsContainer.appendChild(row);
    });
  }

  // Formulario de Pedido Directo con Validación Estricta Zero-Trust
  const customerNameInput = document.getElementById('orderCustomerName');
  const customerCityInput = document.getElementById('orderCustomerCity');
  const qtyInput = document.getElementById('orderQtyInput');
  const hubSelect = document.getElementById('orderHubSelect');
  const orderBtn = document.getElementById('btnPlaceOrder');

  // Filtro preventivo en tiempo real mientras el usuario escribe
  if (customerNameInput) {
    customerNameInput.addEventListener('input', e => {
      const sanitized = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]/g, '').slice(0, 50);
      if (sanitized !== e.target.value) e.target.value = sanitized;
    });
  }
  if (customerCityInput) {
    customerCityInput.addEventListener('input', e => {
      const sanitized = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.()\-]/g, '').slice(0, 40);
      if (sanitized !== e.target.value) e.target.value = sanitized;
    });
  }

  if (orderBtn) {
    orderBtn.addEventListener('click', () => {
      const rawQty = qtyInput?.value;
      const qty = parseInt(rawQty, 10);
      const hub = (hubSelect?.value || 'Centro').trim();
      const custName = (customerNameInput?.value || '').trim();
      const custCity = (customerCityInput?.value || '').trim();

      // Validación estricta Zero-Trust de inputs: no permitir patrones maliciosos ni valores fuera de rango
      const DANGEROUS_RX = /[<>{};$'"\\]|javascript:|data:/i;
      if (DANGEROUS_RX.test(custName) || DANGEROUS_RX.test(custCity)) {
        showToast('Entrada rechazada: caracteres especiales o comandos no permitidos en el formulario.', true);
        return;
      }

      if (!custName || custName.length < 3 || custName.length > 50 || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]{3,50}$/.test(custName)) {
        showToast('Nombre inválido: debe contener entre 3 y 50 letras y espacios (sin caracteres extraños).', true);
        customerNameInput?.focus();
        return;
      }

      if (!custCity || custCity.length < 2 || custCity.length > 40 || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.()\-]{2,40}$/.test(custCity)) {
        showToast('Ciudad inválida: debe contener entre 2 y 40 caracteres (solo letras y espacios).', true);
        customerCityInput?.focus();
        return;
      }

      if (isNaN(qty) || qty < 1 || qty > 10) {
        showToast('Cantidad inválida: la compra máxima por pedido en línea es de 1 a 10 unidades.', true);
        qtyInput?.focus();
        return;
      }

      const allowedHubs = ['Centro', 'Norte', 'Sur', 'Costa'];
      if (!allowedHubs.includes(hub)) {
        showToast('Bodega seleccionada no permitida.', true);
        return;
      }

      const current = AetherStore.getProductById(product.id);
      if (!current || current.stock < qty) {
        showToast(`Stock insuficiente. Quedan solo ${current ? current.stock : 0} unidades en total.`, true);
        return;
      }

      const res = AetherStore.recordPurchase(product.id, selectedColor.name, qty, hub, {
        name: custName,
        city: custCity,
        phone: '+57 31' + Math.floor(10000000 + Math.random() * 89999999),
        channel: window.innerWidth < 768 ? 'Celular (Datos Móviles/WiFi)' : 'Computador Web'
      });

      if (res) {
        window.updateStockDisplays();
        showToast(`¡Pedido ${res.transaction.id} confirmado con éxito! Despacho programado desde Bodega ${hub}. Total: ${AetherStore.formatCOP(res.transaction.total)}. Se ha transmitido por Internet al facturero.`);
      }
    });
  }

  function showToast(msg, isError = false) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.backgroundColor = isError ? '#b00020' : 'var(--color-ink-black)';
    clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, 4800);
  }
});
