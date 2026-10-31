/**
 * bella Electrodomésticos — Lógica del Módulo de Pedidos y Facturación
 */

document.addEventListener('DOMContentLoaded', () => {
  const kpiTotalOrders = document.getElementById('kpiTotalOrders');
  const kpiPendingOrders = document.getElementById('kpiPendingOrders');
  const kpiTotalBilledCOP = document.getElementById('kpiTotalBilledCOP');
  const kpiDispatchedOrders = document.getElementById('kpiDispatchedOrders');

  const searchInput = document.getElementById('orderSearchInput');
  const statusFilter = document.getElementById('orderStatusFilter');
  const hubFilter = document.getElementById('orderHubFilter');
  const btnReset = document.getElementById('btnResetOrderFilters');
  const btnSimulate = document.getElementById('btnSimulateOrder');

  const ordersTableBody = document.getElementById('ordersTableBody');
  const counterText = document.getElementById('ordersCounterText');

  window.renderOrdersTable = function() {
    const transactions = AetherStore.getTransactions();

    // 1. Calcular KPIs
    const totalOrders = transactions.length;
    const pendingCount = transactions.filter(t => t.status === 'Pendiente').length;
    const dispatchedCount = transactions.filter(t => t.status === 'En Despacho' || t.status === 'Entregado').length;
    const totalBilled = transactions
      .filter(t => t.status !== 'Cancelado')
      .reduce((acc, t) => acc + (Number(t.total) || 0), 0);

    if (kpiTotalOrders) kpiTotalOrders.textContent = totalOrders;
    if (kpiPendingOrders) kpiPendingOrders.textContent = pendingCount;
    if (kpiTotalBilledCOP) kpiTotalBilledCOP.textContent = AetherStore.formatCOP(totalBilled);
    if (kpiDispatchedOrders) kpiDispatchedOrders.textContent = dispatchedCount;

    // 2. Filtrado de Órdenes
    const q = (searchInput?.value || '').trim().toLowerCase();
    const st = statusFilter?.value || 'all';
    const hb = hubFilter?.value || 'all';

    const filtered = transactions.filter(t => {
      if (st !== 'all' && t.status !== st) return false;
      if (hb !== 'all' && t.hub !== hb) return false;
      if (q) {
        const text = `${t.id} ${t.sku} ${t.product} ${t.customerName || ''} ${t.customerPhone || ''} ${t.customerCity || ''} ${t.invoiceNumber || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    if (counterText) {
      counterText.textContent = `Mostrando ${filtered.length} de ${transactions.length} pedidos`;
    }

    if (!ordersTableBody) return;
    ordersTableBody.innerHTML = '';

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:32px; color:#666;">
            No se encontraron pedidos con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(order => {
      const statusClass = (order.status || 'pendiente').toLowerCase().replace(/\s+/g, '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong style="font-family:monospace; font-size:14px; color:var(--color-coral-pulse);">${order.id}</strong><br>
          <span style="font-size:11px; font-family:monospace; color:#666;">Fac: ${order.invoiceNumber || 'FE-' + order.id.replace('ORD-', '')}</span>
        </td>
        <td style="font-size:12px; white-space:nowrap; color:#555;">
          ${order.date}
        </td>
        <td>
          <strong style="display:block; font-size:14px;">${order.customerName || 'Cliente Particular'}</strong>
          <span style="font-size:12px; color:#555;">${order.customerPhone || '+57 310 ...'}</span><br>
          <span style="font-size:12px; color:#777;">📍 ${order.customerCity || 'Colombia'}</span>
        </td>
        <td>
          <strong>${order.product}</strong><br>
          <span style="font-size:12px; color:#555;">Acabado: <strong>${order.color}</strong></span>
        </td>
        <td style="font-weight:700; text-align:center;">
          ${order.qty}
        </td>
        <td>
          <strong style="color:var(--color-coral-pulse); font-size:15px; display:block;">
            ${AetherStore.formatCOP(order.total)}
          </strong>
          <span style="font-size:11px; color:#666;">IVA 19%: ${AetherStore.formatCOP(order.tax || order.total * 0.19)}</span>
        </td>
        <td>
          <span style="font-size:13px; font-weight:600;">Bodega ${order.hub}</span>
        </td>
        <td>
          <span class="status-badge ${statusClass}">
            ● ${order.status}
          </span>
        </td>
        <td>
          <div class="order-actions-cell">
            <select class="pill-input" style="padding:6px 10px; font-size:12px; font-weight:700; width:auto; cursor:pointer;" data-status-select="${order.id}">
              <option value="Pendiente" ${order.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="Facturado" ${order.status === 'Facturado' ? 'selected' : ''}>Facturado (DIAN)</option>
              <option value="En Despacho" ${order.status === 'En Despacho' ? 'selected' : ''}>En Despacho</option>
              <option value="Entregado" ${order.status === 'Entregado' ? 'selected' : ''}>Entregado</option>
              <option value="Cancelado" ${order.status === 'Cancelado' ? 'selected' : ''}>Cancelar</option>
            </select>
            <button class="pill-btn sm" data-print-btn="${order.id}" title="Ver e imprimir factura electrónica DIAN">
              🧾 Factura
            </button>
          </div>
        </td>
      `;

      // Evento de cambio de estado de pedido por el Facturero
      const select = tr.querySelector(`[data-status-select="${order.id}"]`);
      if (select) {
        select.addEventListener('change', (e) => {
          const newSt = e.target.value;
          AetherStore.updateOrderStatus(order.id, newSt);
          showToast(`Pedido ${order.id} actualizado a estado "${newSt}". Transmitido a todos los dispositivos.`);
          renderOrdersTable();
        });
      }

      // Evento de ver factura electrónica
      const printBtn = tr.querySelector(`[data-print-btn="${order.id}"]`);
      if (printBtn) {
        printBtn.addEventListener('click', () => {
          openInvoiceModal(order);
        });
      }

      ordersTableBody.appendChild(tr);
    });
  };

  let currentModalOrder = null;

  // 3. Modal de Factura Electrónica
  function openInvoiceModal(order) {
    currentModalOrder = order;
    const modal = document.getElementById('invoiceModalBackdrop');
    if (!modal) return;

    document.getElementById('invModalNumber').textContent = order.invoiceNumber || ('FE-' + order.id.replace('ORD-', ''));
    document.getElementById('invModalDate').textContent = `Fecha: ${order.date}`;
    document.getElementById('invModalClient').textContent = order.customerName || 'Consumidor Final';
    document.getElementById('invModalPhone').textContent = order.customerPhone || '+57 310 000 0000';
    document.getElementById('invModalCity').textContent = order.customerCity || 'Bogotá D.C.';
    document.getElementById('invModalHub').textContent = `Bodega ${order.hub}`;
    document.getElementById('invModalChannel').textContent = order.channel || 'Tienda Online';

    const subtotal = order.subtotal || Math.round(order.total / 1.19);
    const tax = order.tax || (order.total - subtotal);

    document.getElementById('invModalSubtotal').textContent = AetherStore.formatCOP(subtotal);
    document.getElementById('invModalTax').textContent = AetherStore.formatCOP(tax);
    document.getElementById('invModalTotal').textContent = AetherStore.formatCOP(order.total);

    const tbody = document.getElementById('invModalItemsBody');
    tbody.innerHTML = `
      <tr>
        <td style="font-family:monospace;">${order.sku}</td>
        <td><strong>${order.product}</strong></td>
        <td>${order.color}</td>
        <td style="text-align:center;">${order.qty}</td>
        <td>${AetherStore.formatCOP(order.unitPrice || (order.total / order.qty))}</td>
        <td><strong>${AetherStore.formatCOP(order.total)}</strong></td>
      </tr>
    `;

    modal.style.display = 'flex';
  }

  // Descarga Directa en PDF de Factura DIAN Oficial (100% Nítido y Completo)
  const btnDownloadInvoicePdf = document.getElementById('btnDownloadInvoicePdf');
  if (btnDownloadInvoicePdf) {
    btnDownloadInvoicePdf.addEventListener('click', () => {
      const invoiceEl = document.getElementById('printableInvoiceArea');
      if (!invoiceEl) return;
      const invoiceId = currentModalOrder?.invoiceNumber || 'FE-9128';

      // Ocultar botones de acción durante la captura
      const actionRow = invoiceEl.querySelector('.no-print');
      if (actionRow) actionRow.style.display = 'none';

      showToast(`Generando y descargando Factura DIAN ${invoiceId} en PDF...`);

      if (typeof html2pdf !== 'undefined') {
        const opt = {
          margin: [8, 8, 8, 8],
          filename: `Factura_DIAN_${invoiceId}_bella_Electrodomesticos.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(invoiceEl).save().then(() => {
          if (actionRow) actionRow.style.display = 'flex';
          showToast(`¡Factura en PDF ${invoiceId} descargada con éxito!`);
        }).catch(err => {
          if (actionRow) actionRow.style.display = 'flex';
          console.warn('html2pdf fallback to window.print', err);
          window.print();
        });
      } else {
        if (actionRow) actionRow.style.display = 'flex';
        window.print();
      }
    });
  }

  // 4. Simulación de Pedido Móvil Entrante (Prueba de Sincronización)
  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      const products = AetherStore.getProducts();
      const randomProd = products[Math.floor(Math.random() * products.length)];
      const randomColor = randomProd.colors && randomProd.colors[0] ? randomProd.colors[0].name : 'Estándar';
      const hubs = ['Centro', 'Norte', 'Sur', 'Costa'];
      const randomHub = hubs[Math.floor(Math.random() * hubs.length)];

      const clients = [
        { name: 'Andrés Felipe Morales', phone: '+57 312 884 1920', city: 'Medellín (Laureles)' },
        { name: 'Diana Marcela Castro', phone: '+57 320 449 8123', city: 'Bogotá D.C. (Cedritos)' },
        { name: 'Carlos Mario Pineda', phone: '+57 300 782 9901', city: 'Barranquilla (Riomar)' },
        { name: 'Valentina Osorio', phone: '+57 316 230 4578', city: 'Cali (Ciudad Jardín)' }
      ];
      const randomClient = clients[Math.floor(Math.random() * clients.length)];

      const res = AetherStore.recordPurchase(randomProd.id, randomColor, 1, randomHub, {
        name: randomClient.name,
        phone: randomClient.phone,
        city: randomClient.city,
        channel: 'Celular Cliente (Datos Móviles 4G)'
      });

      if (res) {
        showToast(`📱 ¡Pedido entrante ${res.transaction.id} simulado con éxito desde celular!`);
        renderOrdersTable();
      }
    });
  }

  function showToast(msg, isError = false) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.backgroundColor = isError ? '#b00020' : 'var(--color-ink-black)';
    clearTimeout(window.__orderToastTimeout);
    window.__orderToastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  // Event Listeners con Validación Zero-Trust
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const sanitized = e.target.value.replace(/<[^>]*>/g, '').replace(/[;'"\\$]/g, '').slice(0, 50);
      if (sanitized !== e.target.value) e.target.value = sanitized;
      renderOrdersTable();
    });
  }
  if (statusFilter) statusFilter.addEventListener('change', renderOrdersTable);
  if (hubFilter) hubFilter.addEventListener('change', renderOrdersTable);
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = 'all';
      if (hubFilter) hubFilter.value = 'all';
      renderOrdersTable();
    });
  }

  // Inicializar tabla
  renderOrdersTable();
});
