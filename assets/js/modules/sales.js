export function createSalesModule(context) {
  const {
    state,
    buildPaymentEntryReceiptMarkup,
    canManageSalePayment,
    escapeHtml,
    exportRowsToExcel,
    exportRowsToPdf,
    formatCurrency,
    formatDate,
    formatSalePersonalization,
    getActionIcon,
    getCostStateLabel,
    getExportDateStamp,
    getLastRecordPayment,
    getNormalizedRecordPaymentHistory,
    getSaleItemTrackedCostSummary,
    getTodayInputValue,
    isCashSale,
    isCreditSale,
    printSalePayableReceipt,
    renderAccountStatementTable,
    requiresPaymentReference,
    resolveAccountStatus,
    saleFilterCustomerInput,
    saleFilterDateEndField,
    saleFilterDateEndInput,
    saleFilterDateModeInput,
    saleFilterDateStartField,
    saleFilterDateStartInput,
    saleFilterDocumentInput,
    saleFilterMethodInput,
    saleFilterProductInput,
    salePayableAmountInput,
    salePayableDateInput,
    salePayableForm,
    salePayableHistory,
    salePayableMethodInput,
    salePayableModal,
    salePayableModalTitle,
    salePayableReferenceField,
    salePayableReferenceInput,
    salePayableStatus,
    salePayableSummary,
    saleReceivablesReport,
    saleRecords,
    saleStatus,
    submitSalePayableButton,
    receivablesCount,
    receivablesFilterCustomerInput,
    receivablesFilterDateEndField,
    receivablesFilterDateEndInput,
    receivablesFilterDateModeInput,
    receivablesFilterDateStartField,
    receivablesFilterDateStartInput,
    receivablesFilterDocumentInput,
    receivablesFilterStatusInput,
    receivablesOverdue,
    receivablesTotal,
    calculateSaleAddonsTotal,
    calculateSaleComponentsTotal,
  } = context;

  let payingSaleId = null;
  let editingSalePaymentEntryId = null;

  function setSalePayableStatus(message, options = {}) {
    const { error = false } = options;
    salePayableStatus.textContent = message;
    salePayableStatus.classList.toggle('error', error);
  }

  function updateSalePayableReferenceVisibility() {
    const shouldShowReference = requiresPaymentReference(salePayableMethodInput.value);
    salePayableReferenceField.classList.toggle('field-hidden', !shouldShowReference);
    salePayableReferenceInput.required = shouldShowReference;
    if (!shouldShowReference) {
      salePayableReferenceInput.value = '';
    }
  }

  function calculateSaleInvoiceTotal(venta) {
    if (!Array.isArray(venta?.items)) {
      return Number(venta?.precio || 0) * Number(venta?.cantidad || 0);
    }
    return venta.items.reduce((sum, item) => {
      const itemQuantity = Number(item.cantidad || 0);
      return sum + Number(item.precio || 0) * itemQuantity
        + calculateSaleAddonsTotal(item.adicionales)
        + calculateSaleComponentsTotal(item.componentes, itemQuantity);
    }, 0);
  }

  function getSaleTotalAmount(venta) {
    return Math.max(Number(venta?.totalAmount || calculateSaleInvoiceTotal(venta)), 0);
  }

  function getSalePaidAmount(venta) {
    const totalAmount = getSaleTotalAmount(venta);
    return Math.min(
      getNormalizedRecordPaymentHistory(venta, totalAmount).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      totalAmount
    );
  }

  function getSaleBalanceDue(venta) {
    if (!isCreditSale(venta)) return 0;
    return Math.max(getSaleTotalAmount(venta) - getSalePaidAmount(venta), 0);
  }

  function isPaidCreditSale(venta) {
    return isCreditSale(venta) && getSaleBalanceDue(venta) <= 0.0001;
  }

  function getSalePaymentActionLabel(venta) {
    if (isCreditSale(venta)) {
      const paidAmount = getSalePaidAmount(venta);
      const paymentHistory = getNormalizedRecordPaymentHistory(venta, getSaleTotalAmount(venta));
      if (isPaidCreditSale(venta)) return paymentHistory.length === 1 ? 'Editar abono' : 'Estado de cuenta';
      return paidAmount > 0 ? 'Registrar abono' : 'Aplicar pago';
    }
    return 'Editar pago';
  }

  function getSalePaymentTypeLabel(venta) {
    if (isPaidCreditSale(venta)) return 'Crédito pagado';
    if (isCreditSale(venta) && getSalePaidAmount(venta) > 0) return 'Crédito abonado';
    if (isCreditSale(venta)) return 'Crédito';
    if (isCashSale(venta)) return 'Contado';
    return String(venta?.paymentType || '').trim() || 'N/A';
  }

  function getSaleAccountStatus(venta) {
    return resolveAccountStatus(getSaleBalanceDue(venta), getSalePaidAmount(venta), venta?.dueDate);
  }

  function getSaleById(saleId) {
    return state.sales.find(venta => String(venta.id) === String(saleId)) || null;
  }

  function resetSalePaymentEntryEditing() {
    editingSalePaymentEntryId = null;
  }

  function getEditingSalePaymentEntryId() {
    return editingSalePaymentEntryId;
  }

  function getPayingSaleId() {
    return payingSaleId;
  }

  function startEditSalePaymentEntry(paymentEntry) {
    if (!paymentEntry) return;
    editingSalePaymentEntryId = paymentEntry.id;
    salePayableMethodInput.value = paymentEntry.paymentMethod || 'efectivo';
    salePayableDateInput.value = paymentEntry.date
      ? new Date(paymentEntry.date).toISOString().slice(0, 10)
      : getTodayInputValue();
    salePayableAmountInput.value = Number(paymentEntry.amount || 0).toFixed(2);
    salePayableReferenceInput.value = paymentEntry.paymentReference || '';
    updateSalePayableReferenceVisibility();
    salePayableModalTitle.textContent = 'Editar abono';
    submitSalePayableButton.textContent = 'Guardar cambios';
    setSalePayableStatus('Corrige el método, la referencia o la fecha del pago registrado.');
  }

  function openSalePayableModalPanel(saleId) {
    resetSalePaymentEntryEditing();
    payingSaleId = saleId;
    const sale = getSaleById(saleId);
    const totalAmount = getSaleTotalAmount(sale);
    const paidAmount = getSalePaidAmount(sale);
    const balanceDue = getSaleBalanceDue(sale);
    salePayableForm.reset();
    salePayableMethodInput.value = sale?.paymentMethod || 'efectivo';
    salePayableDateInput.value = getLastRecordPayment(sale, totalAmount)?.date
      ? new Date(getLastRecordPayment(sale, totalAmount).date).toISOString().slice(0, 10)
      : sale?.fecha
        ? new Date(sale.fecha).toISOString().slice(0, 10)
        : getTodayInputValue();
    salePayableReferenceInput.value = sale?.paymentReference || '';
    salePayableAmountInput.value = balanceDue > 0 ? balanceDue.toFixed(2) : totalAmount.toFixed(2);
    const paymentHistory = getNormalizedRecordPaymentHistory(sale, totalAmount);
    updateSalePayableReferenceVisibility();
    const actionLabel = sale ? getSalePaymentActionLabel(sale) : 'Aplicar pago';
    const isEditingPayment = actionLabel === 'Editar pago' || actionLabel === 'Editar abono';
    const isViewOnly = isCreditSale(sale) && balanceDue <= 0.0001 && actionLabel !== 'Editar abono';
    const latestPayment = getLastRecordPayment(sale, totalAmount);
    if (actionLabel === 'Editar abono' && paymentHistory.length === 1 && latestPayment) {
      startEditSalePaymentEntry(latestPayment);
    }
    salePayableModalTitle.textContent = actionLabel;
    submitSalePayableButton.textContent = isEditingPayment ? 'Guardar cambios' : 'Registrar abono';
    submitSalePayableButton.style.display = isViewOnly ? 'none' : 'inline-flex';
    [salePayableMethodInput, salePayableDateInput, salePayableAmountInput, salePayableReferenceInput].forEach(input => {
      input.disabled = isViewOnly;
    });
    salePayableSummary.textContent = sale
      ? `Factura ${sale.documento || '-'} · total ${formatCurrency(totalAmount)} · cobrado ${formatCurrency(paidAmount)} · saldo ${formatCurrency(balanceDue)}.`
      : 'Aquí verás el saldo pendiente y el historial de cobros de esta venta.';
    renderAccountStatementTable(salePayableHistory, sale, totalAmount, 'Aún no hay cobros registrados para esta venta.', {
      renderActions: entry => `
        <div class="purchase-row-actions">
          <button type="button" class="secondary-btn action-icon-btn" data-sale-payment-entry-edit="${escapeHtml(entry.id)}" title="Editar abono">✎</button>
          <button type="button" class="secondary-btn action-icon-btn" data-sale-payment-entry-print="${escapeHtml(entry.id)}" title="Imprimir recibo">🧾</button>
        </div>
      `
    });
    salePayableHistory.querySelectorAll('[data-sale-payment-entry-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.salePaymentEntryEdit));
        if (!paymentEntry) return;
        startEditSalePaymentEntry(paymentEntry);
      });
    });
    salePayableHistory.querySelectorAll('[data-sale-payment-entry-print]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.salePaymentEntryPrint));
        if (!paymentEntry) return;
        printSalePayableReceipt(sale, paymentEntry);
      });
    });
    setSalePayableStatus(
      isViewOnly
        ? 'Esta cuenta ya está saldada. Aquí puedes consultar su estado de cuenta.'
        : isEditingPayment
          ? 'Corrige el método, la referencia o la fecha del pago registrado.'
          : 'Confirma el monto, el método y la fecha del cobro.'
    );
    salePayableModal.classList.remove('field-hidden');
    salePayableModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeSalePayableModalPanel() {
    resetSalePaymentEntryEditing();
    payingSaleId = null;
    salePayableModalTitle.textContent = 'Aplicar pago';
    submitSalePayableButton.textContent = 'Aplicar pago';
    submitSalePayableButton.style.display = 'inline-flex';
    [salePayableMethodInput, salePayableDateInput, salePayableAmountInput, salePayableReferenceInput].forEach(input => {
      input.disabled = false;
    });
    salePayableSummary.textContent = 'Aquí verás el saldo pendiente y el historial de cobros de esta venta.';
    salePayableHistory.innerHTML = '';
    salePayableModal.classList.add('field-hidden');
    salePayableModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function updateSaleRegistroDateFilterVisibility() {
    const useRange = saleFilterDateModeInput.value === 'range';
    saleFilterDateStartField.classList.toggle('field-hidden', !useRange);
    saleFilterDateEndField.classList.toggle('field-hidden', !useRange);
    if (!useRange) {
      saleFilterDateStartInput.value = '';
      saleFilterDateEndInput.value = '';
    }
  }

  function getFilteredSales() {
    const documentFilter = saleFilterDocumentInput.value.trim().toLowerCase();
    const customerFilter = saleFilterCustomerInput.value.trim().toLowerCase();
    const productFilter = saleFilterProductInput.value.trim().toLowerCase();
    const methodFilter = saleFilterMethodInput.value;
    const useDateRange = saleFilterDateModeInput.value === 'range';
    const startDate = useDateRange && saleFilterDateStartInput.value ? new Date(saleFilterDateStartInput.value) : null;
    const endDate = useDateRange && saleFilterDateEndInput.value ? new Date(saleFilterDateEndInput.value) : null;

    return state.sales.filter(venta => {
      const matchesDocument = documentFilter ? String(venta.documento || '').toLowerCase().includes(documentFilter) : true;
      const matchesCustomer = customerFilter ? String(venta.cliente || '').toLowerCase().includes(customerFilter) : true;
      const matchesMethod = methodFilter === 'all'
        ? true
        : String(venta.paymentMethod || '').toLowerCase() === methodFilter
          || (methodFilter === 'credito' && String(venta.paymentType || '').toLowerCase() === 'credito');
      const saleDate = new Date(venta.fecha);
      const matchesStart = startDate ? saleDate >= startDate : true;
      const matchesEnd = endDate ? saleDate <= endDate : true;
      const matchesProduct = productFilter
        ? (
          Array.isArray(venta.items)
            ? venta.items.some(item => String(item.nombre || '').toLowerCase().includes(productFilter))
            : String(venta.nombre || '').toLowerCase().includes(productFilter)
        )
        : true;
      return matchesDocument && matchesCustomer && matchesMethod && matchesStart && matchesEnd && matchesProduct;
    });
  }

  function buildSaleRegistroRows() {
    return getFilteredSales().flatMap(venta => {
      const items = Array.isArray(venta.items) ? venta.items : [{ nombre: venta.nombre, cantidad: venta.cantidad, precio: venta.precio }];
      const lastPayment = getLastRecordPayment(venta, getSaleTotalAmount(venta));
      return items.map(item => {
        const itemQuantity = Number(item.cantidad || 0);
        const total = Number(item.precio || 0) * itemQuantity
          + calculateSaleAddonsTotal(item.adicionales)
          + calculateSaleComponentsTotal(item.componentes, itemQuantity);
        const costSummary = getSaleItemTrackedCostSummary(item);
        return {
          Factura: venta.documento || '',
          Cliente: venta.cliente || '',
          Fecha: formatDate(venta.fecha),
          'Tipo de pago': getSalePaymentTypeLabel(venta),
          Metodo: venta.paymentMethod || '',
          Referencia: venta.paymentReference || '',
          'Fecha pago': lastPayment?.date ? formatDate(lastPayment.date) : '',
          Producto: item.nombre || '',
          Personalizacion: formatSalePersonalization(item),
          Cantidad: Number(item.cantidad || 0),
          Precio: formatCurrency(item.precio || 0),
          Total: formatCurrency(total),
          'Costo controlado': costSummary.hasTrackedCost ? formatCurrency(costSummary.totalCost) : '-',
          'Utilidad controlada': costSummary.hasTrackedCost ? formatCurrency(costSummary.utility) : '-',
          'Estado costo': costSummary.hasTrackedCost ? getCostStateLabel(costSummary.state) : '-'
        };
      });
    });
  }

  function getDueDayDifference(dueDate, today) {
    if (!dueDate) return null;
    const dueCopy = new Date(dueDate);
    dueCopy.setHours(0, 0, 0, 0);
    return Math.round((dueCopy.getTime() - today.getTime()) / 86400000);
  }

  function buildSaleReceivablesRows() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getCreditReceivables().map(venta => {
      const dueDate = venta.dueDate ? new Date(venta.dueDate) : null;
      const dayDifference = getDueDayDifference(dueDate, today);
      const totalAmount = getSaleTotalAmount(venta);
      const paidAmount = getSalePaidAmount(venta);
      const balanceDue = getSaleBalanceDue(venta);
      const status = getSaleAccountStatus(venta);
      const isOverdue = status.key === 'overdue';
      const agingLabel = dayDifference === null
        ? 'Sin fecha'
        : isOverdue
          ? `${Math.abs(dayDifference)} vencidos`
          : dayDifference === 0
            ? 'Vence hoy'
            : `${dayDifference} por vencer`;

      return {
        Factura: venta.documento || '',
        Cliente: venta.cliente || '',
        'Fecha venta': formatDate(venta.fecha),
        Vencimiento: dueDate ? formatDate(venta.dueDate) : 'Sin fecha',
        Estado: status.label,
        Dias: agingLabel,
        'Monto original': formatCurrency(totalAmount),
        Abonado: formatCurrency(paidAmount),
        Saldo: formatCurrency(balanceDue)
      };
    });
  }

  function exportSaleRegistroExcel() {
    const rows = buildSaleRegistroRows();
    const dateStamp = getExportDateStamp();
    if (!exportRowsToExcel(rows, `registro-ventas-${dateStamp}.xlsx`, 'Registro Ventas')) {
      saleStatus.className = 'status error';
      saleStatus.textContent = 'No hay datos en Registro para exportar.';
    }
  }

  function exportSaleRegistroPdf() {
    const rows = buildSaleRegistroRows();
    const headers = ['Factura', 'Cliente', 'Fecha', 'Tipo de pago', 'Metodo', 'Referencia', 'Producto', 'Personalizacion', 'Cantidad', 'Precio', 'Total', 'Costo controlado', 'Utilidad controlada', 'Estado costo'];
    const body = rows.map(row => headers.map(header => row[header] ?? ''));
    const dateStamp = getExportDateStamp();
    if (!exportRowsToPdf('Registro de ventas', headers, body, `registro-ventas-${dateStamp}.pdf`)) {
      saleStatus.className = 'status error';
      saleStatus.textContent = 'No hay datos en Registro para exportar.';
    }
  }

  function updateReceivablesDateFilterVisibility() {
    const useRange = receivablesFilterDateModeInput.value === 'range';
    receivablesFilterDateStartField.classList.toggle('field-hidden', !useRange);
    receivablesFilterDateEndField.classList.toggle('field-hidden', !useRange);
    if (!useRange) {
      receivablesFilterDateStartInput.value = '';
      receivablesFilterDateEndInput.value = '';
    }
  }

  function getCreditReceivables() {
    const documentFilter = receivablesFilterDocumentInput.value.trim().toLowerCase();
    const customerFilter = receivablesFilterCustomerInput.value.trim().toLowerCase();
    const statusFilter = receivablesFilterStatusInput.value;
    const useDateRange = receivablesFilterDateModeInput.value === 'range';
    const dateStart = useDateRange && receivablesFilterDateStartInput.value ? new Date(receivablesFilterDateStartInput.value) : null;
    const dateEnd = useDateRange && receivablesFilterDateEndInput.value ? new Date(receivablesFilterDateEndInput.value) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return state.sales.filter(venta => {
      if (!isCreditSale(venta) || isPaidCreditSale(venta)) return false;
      const invoiceDate = venta.fecha ? new Date(venta.fecha) : null;
      if (invoiceDate) invoiceDate.setHours(0, 0, 0, 0);
      const statusValue = getSaleAccountStatus(venta).key === 'overdue' ? 'overdue' : 'pending';
      const matchesDocument = documentFilter ? String(venta.documento || '').toLowerCase().includes(documentFilter) : true;
      const matchesCustomer = customerFilter ? String(venta.cliente || '').toLowerCase().includes(customerFilter) : true;
      const matchesStatus = statusFilter === 'all' ? true : statusFilter === statusValue;
      const matchesDateStart = dateStart && invoiceDate ? invoiceDate >= dateStart : !dateStart;
      const matchesDateEnd = dateEnd && invoiceDate ? invoiceDate <= dateEnd : !dateEnd;
      return matchesDocument && matchesCustomer && matchesStatus && matchesDateStart && matchesDateEnd;
    }).sort((a, b) => {
      const dueA = a.dueDate ? new Date(a.dueDate) : null;
      const dueB = b.dueDate ? new Date(b.dueDate) : null;
      const diffA = getDueDayDifference(dueA, today);
      const diffB = getDueDayDifference(dueB, today);
      const overdueRankA = diffA !== null && diffA < 0 ? 0 : 1;
      const overdueRankB = diffB !== null && diffB < 0 ? 0 : 1;
      if (overdueRankA !== overdueRankB) return overdueRankA - overdueRankB;
      if (diffA !== null && diffB !== null && diffA !== diffB) return diffA - diffB;
      if (diffA === null && diffB !== null) return 1;
      if (diffA !== null && diffB === null) return -1;
      return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'es', { sensitivity: 'base' });
    });
  }

  function exportReceivablesExcel() {
    const rows = buildSaleReceivablesRows();
    const dateStamp = getExportDateStamp();
    if (!exportRowsToExcel(rows, `cuentas-por-cobrar-${dateStamp}.xlsx`, 'Cuentas por Cobrar')) {
      saleStatus.className = 'status error';
      saleStatus.textContent = 'No hay cuentas por cobrar para exportar.';
    }
  }

  function exportReceivablesPdf() {
    const rows = buildSaleReceivablesRows();
    const headers = ['Factura', 'Cliente', 'Fecha venta', 'Vencimiento', 'Estado', 'Dias', 'Monto original', 'Abonado', 'Saldo'];
    const body = rows.map(row => headers.map(header => row[header] ?? ''));
    const dateStamp = getExportDateStamp();
    if (!exportRowsToPdf('Cuentas por cobrar', headers, body, `cuentas-por-cobrar-${dateStamp}.pdf`)) {
      saleStatus.className = 'status error';
      saleStatus.textContent = 'No hay cuentas por cobrar para exportar.';
    }
  }

  function renderSaleRegistro() {
    const sales = getFilteredSales();
    if (!saleRecords) return;
    if (!sales.length) {
      saleRecords.innerHTML = '<p class="history-empty">No hay ventas que coincidan con los filtros.</p>';
      return;
    }
    saleRecords.innerHTML = `
      <h4>Registro de ventas</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Factura</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Tipo de pago</th>
            <th>Método</th>
            <th>Referencia</th>
            <th>Fecha pago</th>
            <th>Producto</th>
            <th>Personalización</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
            <th>Costo controlado</th>
            <th>Utilidad controlada</th>
            <th>Estado costo</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${sales.slice().reverse().flatMap(venta => {
            const items = Array.isArray(venta.items) ? venta.items : [{ nombre: venta.nombre, cantidad: venta.cantidad, precio: venta.precio }];
            return items.map(item => {
              const itemQuantity = Number(item.cantidad || 0);
              const total = Number(item.precio || 0) * itemQuantity
                + calculateSaleAddonsTotal(item.adicionales)
                + calculateSaleComponentsTotal(item.componentes, itemQuantity);
              const personalization = formatSalePersonalization(item);
              const allowPaymentEditing = canManageSalePayment(venta);
              const actionLabel = getSalePaymentActionLabel(venta);
              const lastPayment = getLastRecordPayment(venta, getSaleTotalAmount(venta));
              const referenceMarkup = lastPayment
                ? buildPaymentEntryReceiptMarkup(lastPayment, 'sale-registro-receipt', venta.id)
                : escapeHtml(venta.paymentReference || '-');
              const costSummary = getSaleItemTrackedCostSummary(item);
              return `
                <tr>
                  <td><button type="button" class="invoice-link-btn" data-sale-id="${escapeHtml(String(venta.id || ''))}" title="Ver factura">${escapeHtml(venta.documento || '')}</button></td>
                  <td>${escapeHtml(venta.cliente || '')}</td>
                  <td>${formatDate(venta.fecha)}</td>
                  <td>${escapeHtml(getSalePaymentTypeLabel(venta))}</td>
                  <td>${escapeHtml(venta.paymentMethod || '')}</td>
                  <td>${referenceMarkup}</td>
                  <td>${venta.paidAt ? formatDate(venta.paidAt) : '-'}</td>
                  <td>${escapeHtml(item.nombre || '')}</td>
                  <td>${escapeHtml(personalization)}</td>
                  <td>${Number(item.cantidad || 0)}</td>
                  <td>${formatCurrency(item.precio || 0)}</td>
                  <td>${formatCurrency(total)}</td>
                  <td>${costSummary.hasTrackedCost ? formatCurrency(costSummary.totalCost) : '-'}</td>
                  <td>${costSummary.hasTrackedCost ? formatCurrency(costSummary.utility) : '-'}</td>
                  <td>${costSummary.hasTrackedCost ? `<span class="status-chip ${String(costSummary.state || '').toLowerCase() === 'final' ? 'success' : 'pending'}">${escapeHtml(getCostStateLabel(costSummary.state))}</span>` : '-'}</td>
                  <td>${allowPaymentEditing ? `<button type="button" class="secondary-btn action-icon-btn registro-payment-btn" data-registro-sale-pay="${escapeHtml(String(venta.id || ''))}" title="${escapeHtml(actionLabel)}">${getActionIcon(actionLabel)}</button>` : '-'}</td>
                </tr>
              `;
            });
          }).join('')}
        </tbody>
      </table>
    `;

    saleRecords.querySelectorAll('[data-sale-registro-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const sale = getSaleById(button.dataset.saleRegistroReceipt);
        if (!sale) return;
        const lastPayment = getLastRecordPayment(sale, getSaleTotalAmount(sale));
        if (!lastPayment) return;
        printSalePayableReceipt(sale, lastPayment);
      });
    });

    saleRecords.querySelectorAll('[data-registro-sale-pay]').forEach(button => {
      button.addEventListener('click', () => openSalePayableModalPanel(button.dataset.registroSalePay));
    });
  }

  function renderSaleReceivables() {
    if (!saleReceivablesReport) return;
    const receivables = getCreditReceivables();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (receivablesCount) {
      receivablesCount.textContent = String(receivables.length);
    }
    if (receivablesOverdue) {
      receivablesOverdue.textContent = String(receivables.filter(venta => getSaleAccountStatus(venta).key === 'overdue').length);
    }
    if (receivablesTotal) {
      receivablesTotal.textContent = formatCurrency(receivables.reduce((sum, venta) => sum + getSaleBalanceDue(venta), 0));
    }

    if (!receivables.length) {
      saleReceivablesReport.innerHTML = '<p class="history-empty">No hay facturas de crédito según los filtros actuales.</p>';
      return;
    }

    saleReceivablesReport.innerHTML = `
      <h4>Facturas de crédito</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Factura</th>
            <th>Cliente</th>
            <th>Fecha venta</th>
            <th>Vencimiento</th>
            <th>Estado</th>
            <th>Días</th>
            <th>Monto</th>
            <th>Abonado</th>
            <th>Saldo</th>
            <th>Recibo</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${receivables.map(venta => {
            const dueDate = venta.dueDate ? new Date(venta.dueDate) : null;
            const dayDifference = getDueDayDifference(dueDate, today);
            const totalAmount = getSaleTotalAmount(venta);
            const paidAmount = getSalePaidAmount(venta);
            const balanceDue = getSaleBalanceDue(venta);
            const lastPayment = getLastRecordPayment(venta, totalAmount);
            const status = getSaleAccountStatus(venta);
            const isOverdue = status.key === 'overdue';
            const agingLabel = dayDifference === null ? 'Sin fecha' : isOverdue ? `${Math.abs(dayDifference)} vencidos` : dayDifference === 0 ? 'Vence hoy' : `${dayDifference} por vencer`;
            return `
              <tr>
                <td>${escapeHtml(venta.documento || '')}</td>
                <td>${escapeHtml(venta.cliente || '')}</td>
                <td>${formatDate(venta.fecha)}</td>
                <td>${dueDate ? formatDate(venta.dueDate) : 'Sin fecha'}</td>
                <td><span class="status-chip ${status.key}">${escapeHtml(status.label)}</span></td>
                <td><span class="aging-chip">${agingLabel}</span></td>
                <td>${formatCurrency(totalAmount)}</td>
                <td>${formatCurrency(paidAmount)}</td>
                <td>${formatCurrency(balanceDue)}</td>
                <td>${buildPaymentEntryReceiptMarkup(lastPayment, 'sale-receipt', venta.id)}</td>
                <td><button type="button" class="secondary-btn action-icon-btn payables-apply-btn" data-sale-pay="${escapeHtml(String(venta.id || ''))}" title="${escapeHtml(getSalePaymentActionLabel(venta))}">${getActionIcon(getSalePaymentActionLabel(venta))}</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    saleReceivablesReport.querySelectorAll('[data-sale-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const sale = getSaleById(button.dataset.saleReceipt);
        if (!sale) return;
        const lastPayment = getLastRecordPayment(sale, getSaleTotalAmount(sale));
        if (!lastPayment) return;
        printSalePayableReceipt(sale, lastPayment);
      });
    });

    saleReceivablesReport.querySelectorAll('[data-sale-pay]').forEach(button => {
      button.addEventListener('click', () => openSalePayableModalPanel(button.dataset.salePay));
    });
  }

  return {
    setSalePayableStatus,
    updateSalePayableReferenceVisibility,
    openSalePayableModalPanel,
    closeSalePayableModalPanel,
    calculateSaleInvoiceTotal,
    getSaleTotalAmount,
    getSalePaidAmount,
    getSaleBalanceDue,
    isPaidCreditSale,
    getSalePaymentActionLabel,
    getSalePaymentTypeLabel,
    getSaleAccountStatus,
    getSaleById,
    resetSalePaymentEntryEditing,
    getEditingSalePaymentEntryId,
    getPayingSaleId,
    startEditSalePaymentEntry,
    updateSaleRegistroDateFilterVisibility,
    getFilteredSales,
    buildSaleRegistroRows,
    buildSaleReceivablesRows,
    exportSaleRegistroExcel,
    exportSaleRegistroPdf,
    updateReceivablesDateFilterVisibility,
    getCreditReceivables,
    exportReceivablesExcel,
    exportReceivablesPdf,
    renderSaleRegistro,
    renderSaleReceivables,
  };
}
