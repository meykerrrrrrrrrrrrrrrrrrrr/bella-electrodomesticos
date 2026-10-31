/**
 * bella Electrodomésticos — Lógica de Inventario, Bodegas y Asignación de Ofertas
 * Soporte Multi-Almacén: Centro (Bogotá), Norte (Medellín), Sur (Cali), Costa (Barranquilla) o Consolidado Nacional.
 * Moneda Oficial: Pesos Colombianos ($ COP)
 */

document.addEventListener('DOMContentLoaded', () => {
  let products = AetherStore.getProducts();
  const hubs = AetherStore.getDistributionCenters();

  // Estado del Almacén Activo ('all', 'Centro', 'Norte', 'Sur', 'Costa')
  let activeWarehouse = 'all';

  // Referencias DOM de Métricas / KPIs
  const kpiTotalStock = document.getElementById('kpiTotalStock');
  const kpiTotalStockSub = document.getElementById('kpiTotalStockSub');
  const kpiStockRetailValuation = document.getElementById('kpiStockRetailValuation');
  const kpiStockRetailSub = document.getElementById('kpiStockRetailSub');
  const kpiStockCostValuation = document.getElementById('kpiStockCostValuation');
  const kpiStockCostSub = document.getElementById('kpiStockCostSub');
  const kpiStockProfitValuation = document.getElementById('kpiStockProfitValuation');
  const kpiStockProfitMargin = document.getElementById('kpiStockProfitMargin');

  // Selector de Bodega
  const activeWarehouseBadge = document.getElementById('activeWarehouseIndicatorBadge');
  const warehouseTabs = document.querySelectorAll('.warehouse-tab-btn');
  const invWarehouseFilter = document.getElementById('invWarehouseFilter');
  const thBodegaStock = document.getElementById('thBodegaStock');

  // Badges de conteo de unidades en pestañas
  const badgeCountAll = document.getElementById('badgeCountAll');
  const badgeCountCentro = document.getElementById('badgeCountCentro');
  const badgeCountNorte = document.getElementById('badgeCountNorte');
  const badgeCountSur = document.getElementById('badgeCountSur');
  const badgeCountCosta = document.getElementById('badgeCountCosta');

  // Contenedor de Hubs y Tablas
  const hubsContainer = document.getElementById('hubsContainer');
  const tableBody = document.getElementById('inventoryTableBody');
  const tableFoot = document.getElementById('inventoryTableFoot');
  const tableCounter = document.getElementById('tableCounterText');
  const activeOffersBadge = document.getElementById('activeOffersBadge');

  // Filtros de la Tabla
  const searchInput = document.getElementById('invSearchInput');
  const catFilter = document.getElementById('invCategoryFilter');
  const statusFilter = document.getElementById('invStockStatusFilter');
  const btnReset = document.getElementById('btnResetTableFilters');
  const btnExportCsv = document.getElementById('btnExportInventoryCsv');

  // Controles de Asignación de Ofertas
  const tabModeLine = document.getElementById('tabModeLine');
  const tabModeProduct = document.getElementById('tabModeProduct');
  const formSectionLine = document.getElementById('formSectionLine');
  const formSectionProduct = document.getElementById('formSectionProduct');

  const promoCategorySelect = document.getElementById('promoCategorySelect');
  const promoDiscountPctSelect = document.getElementById('promoDiscountPctSelect');
  const promoBadgeTextInput = document.getElementById('promoBadgeTextInput');
  const btnApplyOfferCategory = document.getElementById('btnApplyOfferCategory');
  const btnRemoveOfferCategory = document.getElementById('btnRemoveOfferCategory');

  const promoSpecificProductSelect = document.getElementById('promoSpecificProductSelect');
  const promoSpecificPctSelect = document.getElementById('promoSpecificPctSelect');
  const promoSpecificBadgeInput = document.getElementById('promoSpecificBadgeInput');
  const btnApplyOfferProduct = document.getElementById('btnApplyOfferProduct');
  const btnRemoveOfferProduct = document.getElementById('btnRemoveOfferProduct');

  // ==================== 1. GESTIÓN DE BODEGAS (SELECTOR) ====================
  const WAREHOUSE_LABELS = {
    all: 'Consolidado Nacional (Todas las 4 Bodegas)',
    Centro: 'Bodega Centro (Bogotá D.C. — Fontibón)',
    Norte: 'Bodega Norte (Medellín — Itagüí)',
    Sur: 'Bodega Sur (Cali — Yumbo)',
    Costa: 'Bodega Costa (Barranquilla — Portuario)'
  };

  window.setActiveWarehouse = function(hubKey) {
    activeWarehouse = hubKey || 'all';

    // A. Actualizar pestañas superiores
    warehouseTabs.forEach(btn => {
      const target = btn.getAttribute('data-warehouse');
      if (target === activeWarehouse) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // B. Sincronizar select desplegable de la tabla
    if (invWarehouseFilter) {
      invWarehouseFilter.value = activeWarehouse;
    }

    // C. Indicador de badge principal
    if (activeWarehouseBadge) {
      activeWarehouseBadge.textContent = activeWarehouse === 'all'
        ? '🏢 Consolidado: Todas las Bodegas'
        : `📍 Seleccionada: ${WAREHOUSE_LABELS[activeWarehouse] || activeWarehouse}`;
      activeWarehouseBadge.style.backgroundColor = activeWarehouse === 'all' ? '#1b5e20' : 'var(--color-coral-pulse)';
    }

    // D. Encabezado de la columna de stock
    if (thBodegaStock) {
      thBodegaStock.textContent = activeWarehouse === 'all'
        ? 'Stock Desglosado'
        : `Stock en ${activeWarehouse}`;
    }

    // E. Resaltar tarjeta Hub activa
    const hubCards = document.querySelectorAll('.hub-card');
    hubCards.forEach(card => {
      if (card.getAttribute('data-hub-region') === activeWarehouse) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // F. Recalcular y re-renderizar todo
    calculateKpis();
    renderTable();
  };

  // Escuchadores de clics en las pestañas de bodegas
  warehouseTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-warehouse');
      window.setActiveWarehouse(target);
    });
  });

  // Escuchador del selector desplegable de bodegas en la tabla
  if (invWarehouseFilter) {
    invWarehouseFilter.addEventListener('change', (e) => {
      window.setActiveWarehouse(e.target.value);
    });
  }

  // ==================== 2. CÁLCULOS DE KPIS Y MONTOS TOTALES ====================
  function calculateKpis() {
    products = AetherStore.getProducts();

    // 1. Conteo global para las insignias
    const globalStock = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
    const centroStock = products.reduce((acc, p) => acc + ((p.warehouseDistribution && Number(p.warehouseDistribution.Centro)) || 0), 0);
    const norteStock = products.reduce((acc, p) => acc + ((p.warehouseDistribution && Number(p.warehouseDistribution.Norte)) || 0), 0);
    const surStock = products.reduce((acc, p) => acc + ((p.warehouseDistribution && Number(p.warehouseDistribution.Sur)) || 0), 0);
    const costaStock = products.reduce((acc, p) => acc + ((p.warehouseDistribution && Number(p.warehouseDistribution.Costa)) || 0), 0);

    if (badgeCountAll) badgeCountAll.textContent = `${globalStock.toLocaleString()} uds.`;
    if (badgeCountCentro) badgeCountCentro.textContent = `${centroStock.toLocaleString()} uds.`;
    if (badgeCountNorte) badgeCountNorte.textContent = `${norteStock.toLocaleString()} uds.`;
    if (badgeCountSur) badgeCountSur.textContent = `${surStock.toLocaleString()} uds.`;
    if (badgeCountCosta) badgeCountCosta.textContent = `${costaStock.toLocaleString()} uds.`;

    // 2. Cálculos para la bodega seleccionada (o consolidado)
    let selectedUnits = 0;
    let selectedRetailTotal = 0;
    let selectedCostTotal = 0;

    products.forEach(p => {
      const units = (activeWarehouse === 'all')
        ? (Number(p.stock) || 0)
        : (p.warehouseDistribution && Number(p.warehouseDistribution[activeWarehouse])) || 0;

      const price = Number(p.price) || 0;
      const cost = Number(p.cost) || 0;

      selectedUnits += units;
      selectedRetailTotal += (units * price);
      selectedCostTotal += (units * cost);
    });

    const potentialProfit = selectedRetailTotal - selectedCostTotal;
    const profitMargin = selectedRetailTotal > 0 ? ((potentialProfit / selectedRetailTotal) * 100).toFixed(1) : '0.0';

    // Actualizar UI de Tarjetas
    if (kpiTotalStock) {
      kpiTotalStock.textContent = `${selectedUnits.toLocaleString()} uds.`;
    }
    if (kpiTotalStockSub) {
      kpiTotalStockSub.textContent = activeWarehouse === 'all'
        ? `Consolidado nacional en 4 bodegas`
        : `En Bodega ${activeWarehouse} (${((selectedUnits / (globalStock || 1)) * 100).toFixed(1)}% del inventario global)`;
    }

    if (kpiStockRetailValuation) {
      kpiStockRetailValuation.textContent = AetherStore.formatCOP(selectedRetailTotal);
    }
    if (kpiStockRetailSub) {
      kpiStockRetailSub.textContent = activeWarehouse === 'all'
        ? 'Valor comercial total de todo el catálogo al detal'
        : `Valor comercial al detal almacenado en ${activeWarehouse}`;
    }

    if (kpiStockCostValuation) {
      kpiStockCostValuation.textContent = AetherStore.formatCOP(selectedCostTotal);
    }
    if (kpiStockCostSub) {
      kpiStockCostSub.textContent = activeWarehouse === 'all'
        ? 'Valuación total al costo de reposición'
        : `Inversión al costo en Bodega ${activeWarehouse}`;
    }

    if (kpiStockProfitValuation) {
      kpiStockProfitValuation.textContent = AetherStore.formatCOP(potentialProfit);
    }
    if (kpiStockProfitMargin) {
      kpiStockProfitMargin.textContent = `Margen proyectado: ${profitMargin}% sobre precio de venta`;
    }

    const withOfferCount = products.filter(p => (Number(p.discountPercentage) || 0) > 0).length;
    if (activeOffersBadge) {
      activeOffersBadge.textContent = `${withOfferCount} ofertas activas en catálogo`;
      activeOffersBadge.style.backgroundColor = withOfferCount > 0 ? 'var(--color-coral-pulse)' : '#555';
    }
  }

  // ==================== 3. RENDERIZAR HUBS REGIONALES ====================
  window.renderHubs = function() {
    products = AetherStore.getProducts();
    if (!hubsContainer) return;
    hubsContainer.innerHTML = '';

    hubs.forEach(h => {
      let hubUnits = 0;
      let hubRetailVal = 0;
      let hubCostVal = 0;

      products.forEach(p => {
        const units = (p.warehouseDistribution && Number(p.warehouseDistribution[h.region])) || 0;
        hubUnits += units;
        hubRetailVal += (units * (Number(p.price) || 0));
        hubCostVal += (units * (Number(p.cost) || 0));
      });

      const isActive = activeWarehouse === h.region;
      const card = document.createElement('div');
      card.className = `hub-card ${isActive ? 'active' : ''}`;
      card.setAttribute('data-hub-region', h.region);
      card.style.cursor = 'pointer';

      card.innerHTML = `
        <div>
          <div class="hub-title-row">
            <span class="hub-name">${h.name}</span>
            <span class="bestseller-badge" style="background-color: #e2f5ea; color: #1b5e20;">${h.efficiency}% Efic.</span>
          </div>
          <p style="font-size:13px; color:#666; margin: 4px 0 10px 0;">Sede: ${h.city}</p>

          <span class="hub-active-badge">✓ Bodega Seleccionada</span>

          <div class="hub-stat-item" style="margin-top:6px;">
            <span>Stock en Bodega:</span>
            <strong>${hubUnits.toLocaleString()} uds.</strong>
          </div>
          <div class="hub-stat-item">
            <span>Valor al Detal:</span>
            <strong style="color:var(--color-coral-pulse);">${AetherStore.formatCOP(hubRetailVal)}</strong>
          </div>
          <div class="hub-stat-item">
            <span>Valuación al Costo:</span>
            <strong>${AetherStore.formatCOP(hubCostVal)}</strong>
          </div>
          <div class="hub-stat-item">
            <span>Rutas Troncales:</span>
            <span>${h.activeRoutes} rutas activas</span>
          </div>
          <div class="hub-stat-item" style="border-bottom:none;">
            <span>Gerente a Cargo:</span>
            <span>${h.manager}</span>
          </div>
        </div>
        <div style="margin-top:12px; padding-top:8px; border-top:1px dashed #ddd; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:700; color:${isActive ? 'var(--color-coral-pulse)' : '#555'};">
            ${isActive ? '● Viendo esta bodega' : 'Clic para filtrar'}
          </span>
          <button class="pill-btn sm ${isActive ? 'coral' : ''}" style="padding:4px 10px; font-size:11px;">
            ${isActive ? 'Activa' : 'Seleccionar →'}
          </button>
        </div>
      `;

      card.addEventListener('click', () => {
        window.setActiveWarehouse(h.region);
      });

      hubsContainer.appendChild(card);
    });
  };

  // ==================== 4. RENDERIZAR TABLA DE INVENTARIO CON MONTOS Y STOCKS ====================
  window.renderTable = function() {
    products = AetherStore.getProducts();
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (tableFoot) tableFoot.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const cat = catFilter?.value || 'all';
    const status = statusFilter?.value || 'all';

    const filtered = products.filter(p => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (status === 'promo' && (!p.discountPercentage || p.discountPercentage <= 0)) return false;

      const unitsInView = (activeWarehouse === 'all')
        ? (Number(p.stock) || 0)
        : (p.warehouseDistribution && Number(p.warehouseDistribution[activeWarehouse])) || 0;

      if (status === 'low' && unitsInView > (p.minStock || 10)) return false;
      if (status === 'ok' && unitsInView <= (p.minStock || 10)) return false;

      if (q) {
        const text = `${p.sku} ${p.name} ${p.lineName} ${p.categoryLabel} ${p.promoBadge || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    if (tableCounter) {
      const warehouseTitle = WAREHOUSE_LABELS[activeWarehouse] || activeWarehouse;
      tableCounter.textContent = `Mostrando ${filtered.length} de ${products.length} productos | Filtro: ${warehouseTitle}`;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center; padding: 36px; color:#666;">
            No se encontraron productos que coincidan con los filtros aplicados en esta bodega.
          </td>
        </tr>
      `;
      return;
    }

    // Acumuladores de totales para la fila final (tfoot)
    let totalUnitsInBodega = 0;
    let totalUnitsGlobal = 0;
    let grandTotalRetail = 0;
    let grandTotalCost = 0;
    let grandTotalProfit = 0;

    filtered.forEach(p => {
      const dist = p.warehouseDistribution || { Centro: 0, Norte: 0, Sur: 0, Costa: 0 };
      const unitsInBodega = (activeWarehouse === 'all')
        ? Number(p.stock || 0)
        : Number(dist[activeWarehouse] || 0);

      const totalGlobal = Number(p.stock || 0);
      const unitRetailPrice = Number(p.price || 0);
      const unitCost = Number(p.cost || 0);

      const retailSubtotal = unitsInBodega * unitRetailPrice;
      const costSubtotal = unitsInBodega * unitCost;
      const profitSubtotal = retailSubtotal - costSubtotal;

      // Acumular
      totalUnitsInBodega += unitsInBodega;
      totalUnitsGlobal += totalGlobal;
      grandTotalRetail += retailSubtotal;
      grandTotalCost += costSubtotal;
      grandTotalProfit += profitSubtotal;

      const isLow = unitsInBodega <= (activeWarehouse === 'all' ? (p.minStock || 10) : Math.ceil((p.minStock || 10) / 4));
      const hasDiscount = (Number(p.discountPercentage) || 0) > 0;
      const basePrice = p.basePrice || p.originalPrice || p.price;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong style="font-family:monospace; font-size:13px; color:#222;">${p.sku}</strong>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${p.image}" alt="${p.name}" style="width:48px; height:48px; object-fit:cover; border-radius:6px; background:#f0f0f0; border:1px solid #e5e5e5;" />
            <div>
              <strong style="display:block; font-size:14px; color:#000;">${p.name}</strong>
              <span style="font-size:12px; color:#666;">${p.lineName || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <span style="font-size:12px; font-weight:700; background:#f0ede4; padding:3px 8px; border-radius:4px;">
            ${p.categoryLabel}
          </span>
        </td>
        <td>
          <div>
            <strong style="color:var(--color-coral-pulse); font-size:14px; display:block;">
              ${AetherStore.formatCOP(unitRetailPrice)}
            </strong>
            ${hasDiscount ? `
              <span style="font-size:11px; color:#888; text-decoration:line-through;">
                ${AetherStore.formatCOP(basePrice)}
              </span>
              <span class="badge-promo-applied" style="margin-left:4px;">${p.discountPercentage}% OFF</span>
            ` : ''}
          </div>
        </td>
        <td style="font-size:13px; color:#444;">
          ${AetherStore.formatCOP(unitCost)}
        </td>
        <td>
          ${activeWarehouse === 'all' ? `
            <div>
              <span class="${isLow ? 'badge-stock-alert' : 'badge-stock-ok'}">
                ${unitsInBodega} uds.
              </span>
              <div style="font-size:10px; color:#666; margin-top:3px; line-height:1.3;">
                BOG:<strong>${dist.Centro || 0}</strong> | MED:<strong>${dist.Norte || 0}</strong><br>
                CALI:<strong>${dist.Sur || 0}</strong> | BAQ:<strong>${dist.Costa || 0}</strong>
              </div>
            </div>
          ` : `
            <div>
              <span class="${isLow ? 'badge-stock-alert' : 'badge-stock-ok'}">
                ${unitsInBodega} uds. ${isLow ? '⚠️' : '✓'}
              </span>
              <small style="display:block; font-size:10px; color:#666;">en ${activeWarehouse}</small>
            </div>
          `}
        </td>
        <td>
          <div style="font-size:13px; font-weight:700; color:#1b5e20;">
            ${totalGlobal} uds.
          </div>
          <small style="font-size:10px; color:#666;">Todas las bodegas</small>
        </td>
        <td>
          <strong style="color:var(--color-ink-black); font-size:14px; display:block;">
            ${AetherStore.formatCOP(retailSubtotal)}
          </strong>
          <small style="font-size:10px; color:#666;">${unitsInBodega} × Detal</small>
        </td>
        <td>
          <span style="font-size:13px; color:#555; display:block;">
            ${AetherStore.formatCOP(costSubtotal)}
          </span>
          <small style="font-size:10px; color:#666;">${unitsInBodega} × Costo</small>
        </td>
        <td>
          <strong style="color:#1b5e20; font-size:13px; display:block;">
            +${AetherStore.formatCOP(profitSubtotal)}
          </strong>
          <small style="font-size:10px; color:#1b5e20;">
            ${retailSubtotal > 0 ? ((profitSubtotal / retailSubtotal) * 100).toFixed(0) + '% margen' : '0%'}
          </small>
        </td>
        <td>
          <div class="inline-stock-edit">
            <input type="number" id="inputStock_${p.id}" value="${unitsInBodega}" min="0" max="999" title="Existencias en ${activeWarehouse === 'all' ? 'total' : activeWarehouse}" />
            <button class="pill-btn sm" data-stock-btn="${p.id}" title="Guardar stock">Guardar</button>
          </div>
        </td>
        <td>
          <a href="product-detail.html?id=${p.id}" class="pill-btn sm" style="white-space:nowrap;">Ver Ficha →</a>
        </td>
      `;

      // Event listener para guardar stock específico
      const saveBtn = tr.querySelector(`[data-stock-btn="${p.id}"]`);
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const input = tr.querySelector(`#inputStock_${p.id}`);
          const newVal = parseInt(input.value, 10);
          if (isNaN(newVal) || newVal < 0) {
            showToast('Por favor ingrese un stock válido mayor o igual a 0.', true);
            return;
          }

          if (activeWarehouse === 'all') {
            AetherStore.updateProductStock(p.id, newVal);
            showToast(`✓ Stock total actualizado para ${p.name}: ${newVal} unidades.`);
          } else {
            AetherStore.updateProductWarehouseStock(p.id, activeWarehouse, newVal);
            showToast(`✓ Stock actualizado en Bodega ${activeWarehouse} para ${p.name}: ${newVal} unidades.`);
          }
          refreshAll();
        });
      }

      tableBody.appendChild(tr);
    });

    // B. RENDERIZAR FILA DE TOTALES CONSOLIDADOS (TFOOT)
    if (tableFoot) {
      const warehouseTitle = activeWarehouse === 'all' ? 'CONSOLIDADO NACIONAL' : `BODEGA ${activeWarehouse.toUpperCase()}`;
      const grandProfitMargin = grandTotalRetail > 0 ? ((grandTotalProfit / grandTotalRetail) * 100).toFixed(1) : '0.0';

      const footTr = document.createElement('tr');
      footTr.className = 'table-total-row';
      footTr.innerHTML = `
        <td colspan="3" style="text-align:right;">
          <strong style="font-size:14px; text-transform:uppercase;">TOTALES [${warehouseTitle}]:</strong>
        </td>
        <td>
          <span style="font-size:11px; color:#555;">(Suma Precios)</span>
        </td>
        <td>
          <span style="font-size:11px; color:#555;">(Suma Costos)</span>
        </td>
        <td>
          <strong style="font-size:16px; color:#000;">${totalUnitsInBodega.toLocaleString()} uds.</strong>
          <small style="display:block; font-size:10px; color:#666;">En esta vista</small>
        </td>
        <td>
          <strong style="font-size:16px; color:#1b5e20;">${totalUnitsGlobal.toLocaleString()} uds.</strong>
          <small style="display:block; font-size:10px; color:#666;">Global todas</small>
        </td>
        <td>
          <strong style="color:var(--color-coral-pulse); font-size:16px;">
            ${AetherStore.formatCOP(grandTotalRetail)}
          </strong>
          <small style="display:block; font-size:10px; color:#666;">Monto Total al Detal</small>
        </td>
        <td>
          <strong style="font-size:15px; color:#333;">
            ${AetherStore.formatCOP(grandTotalCost)}
          </strong>
          <small style="display:block; font-size:10px; color:#666;">Monto Total al Costo</small>
        </td>
        <td>
          <strong style="color:#1b5e20; font-size:15px;">
            +${AetherStore.formatCOP(grandTotalProfit)}
          </strong>
          <small style="display:block; font-size:10px; color:#1b5e20; font-weight:700;">
            ${grandProfitMargin}% margen
          </small>
        </td>
        <td colspan="2" style="text-align:center;">
          <button class="pill-btn sm" id="btnExportTableQuickCsv" style="padding:6px 12px; font-size:12px;">
            📥 Exportar Vista
          </button>
        </td>
      `;

      const quickCsvBtn = footTr.querySelector('#btnExportTableQuickCsv');
      if (quickCsvBtn) {
        quickCsvBtn.addEventListener('click', exportInventoryCsv);
      }

      tableFoot.appendChild(footTr);
    }
  };

  // ==================== 5. MÓDULO DE OFERTAS & DESCUENTOS ====================
  if (tabModeLine && tabModeProduct) {
    tabModeLine.addEventListener('click', () => {
      tabModeLine.classList.add('active');
      tabModeProduct.classList.remove('active');
      formSectionLine.style.display = 'block';
      formSectionProduct.style.display = 'none';
    });

    tabModeProduct.addEventListener('click', () => {
      tabModeProduct.classList.add('active');
      tabModeLine.classList.remove('active');
      formSectionProduct.style.display = 'block';
      formSectionLine.style.display = 'none';
      populateSpecificProductsDropdown();
    });
  }

  function populateSpecificProductsDropdown() {
    products = AetherStore.getProducts();
    if (!promoSpecificProductSelect) return;
    promoSpecificProductSelect.innerHTML = '';
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const promoInfo = p.discountPercentage ? ` (Oferta actual: ${p.discountPercentage}% OFF)` : '';
      opt.textContent = `${p.name} — Base: ${AetherStore.formatCOP(p.basePrice || p.price)}${promoInfo}`;
      promoSpecificProductSelect.appendChild(opt);
    });
  }

  if (btnApplyOfferCategory) {
    btnApplyOfferCategory.addEventListener('click', () => {
      const cat = promoCategorySelect.value;
      const pct = parseInt(promoDiscountPctSelect.value, 10) || 0;
      const text = promoBadgeTextInput.value.trim() || `${pct}% OFF`;

      const count = AetherStore.applyOfferToCategory(cat, pct, text);
      const catNames = {
        all: 'Todo el Catálogo',
        televisores: 'Televisores',
        neveras: 'Neveras',
        parlantes: 'Parlantes',
        otros: 'Cocina & Hogar'
      };

      showToast(`🔥 ¡Oferta de ${pct}% asignada a ${catNames[cat] || cat}! (${count} modelos con descuento aplicado y sincronizado).`);
      refreshAll();
    });
  }

  if (btnRemoveOfferCategory) {
    btnRemoveOfferCategory.addEventListener('click', () => {
      const cat = promoCategorySelect.value;
      AetherStore.removeOfferFromCategory(cat);
      showToast(`Ofertas removidas de la línea seleccionada.`);
      refreshAll();
    });
  }

  if (btnApplyOfferProduct) {
    btnApplyOfferProduct.addEventListener('click', () => {
      const prodId = promoSpecificProductSelect.value;
      const pct = parseInt(promoSpecificPctSelect.value, 10) || 0;
      const text = promoSpecificBadgeInput.value.trim() || `${pct}% OFF`;

      const prod = AetherStore.applyOfferToProduct(prodId, pct, text);
      if (prod) {
        showToast(`🎯 ¡Oferta de ${pct}% aplicada a "${prod.name}"! Nuevo precio: ${AetherStore.formatCOP(prod.price)}.`);
        refreshAll();
      }
    });
  }

  if (btnRemoveOfferProduct) {
    btnRemoveOfferProduct.addEventListener('click', () => {
      const prodId = promoSpecificProductSelect.value;
      const prod = AetherStore.removeOfferFromProduct(prodId);
      if (prod) {
        showToast(`Oferta removida de "${prod.name}". Precio base restaurado.`);
        refreshAll();
      }
    });
  }

  // ==================== 6. EXPORTAR INVENTARIO AUDITADO A EXCEL (CSV) ====================
  function exportInventoryCsv() {
    products = AetherStore.getProducts();
    const warehouseTitle = WAREHOUSE_LABELS[activeWarehouse] || activeWarehouse;

    const headers = [
      'Bodega Consultada',
      'SKU',
      'Producto',
      'Línea Comercial',
      'Categoría',
      'Precio al Detal COP',
      'Costo Unitario COP',
      `Stock en Bodega (${activeWarehouse})`,
      'Stock Consolidado (Todos Juntos)',
      'Monto Total al Detal COP',
      'Monto Total al Costo COP',
      'Ganancia Potencial COP',
      'Margen Proyectado %',
      'Descuento % Activo',
      'Etiqueta Promocional',
      'Stock Bogotá (Centro)',
      'Stock Medellín (Norte)',
      'Stock Cali (Sur)',
      'Stock Barranquilla (Costa)'
    ];

    const rows = products.map(p => {
      const d = p.warehouseDistribution || {};
      const unitsInBodega = (activeWarehouse === 'all')
        ? Number(p.stock || 0)
        : Number(d[activeWarehouse] || 0);

      const retailSub = unitsInBodega * p.price;
      const costSub = unitsInBodega * p.cost;
      const profitSub = retailSub - costSub;
      const margin = retailSub > 0 ? ((profitSub / retailSub) * 100).toFixed(1) + '%' : '0%';

      return [
        `"${warehouseTitle}"`,
        `"${p.sku}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${(p.lineName || '').replace(/"/g, '""')}"`,
        `"${p.categoryLabel}"`,
        p.price,
        p.cost,
        unitsInBodega,
        p.stock,
        retailSub,
        costSub,
        profitSub,
        `"${margin}"`,
        p.discountPercentage || 0,
        `"${(p.promoBadge || '').replace(/"/g, '""')}"`,
        d.Centro || 0,
        d.Norte || 0,
        d.Sur || 0,
        d.Costa || 0
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inventario_${activeWarehouse}_bella_COP_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Archivo CSV de Inventario (${warehouseTitle}) exportado con éxito.`);
  }

  function showToast(msg, isError = false) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.backgroundColor = isError ? '#b00020' : 'var(--color-ink-black)';
    clearTimeout(window.__invToastTimeout);
    window.__invToastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  function refreshAll() {
    calculateKpis();
    renderHubs();
    renderTable();
    populateSpecificProductsDropdown();
  }

  // ==================== EVENT LISTENERS ====================
  if (searchInput) searchInput.addEventListener('input', renderTable);
  if (catFilter) catFilter.addEventListener('change', renderTable);
  if (statusFilter) statusFilter.addEventListener('change', renderTable);

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (catFilter) catFilter.value = 'all';
      if (statusFilter) statusFilter.value = 'all';
      window.setActiveWarehouse('all');
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportInventoryCsv);
  }

  // Inicialización
  refreshAll();
});
