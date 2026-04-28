export function createPurchasesModule(context) {
  const {
    state,
    buildReceiptReferenceMarkup,
    escapeHtml,
    exportRowsToExcel,
    exportRowsToPdf,
    filterDateEndField,
    filterDateEndInput,
    filterDateModeInput,
    filterDateStartField,
    filterDateStartInput,
    filterDocumentInput,
    filterMethodInput,
    filterProductInput,
    filterSupplierInput,
    formatCurrency,
    formatDate,
    getActionIcon,
    getExportDateStamp,
    getLastRecordPayment,
    getNormalizedRecordPaymentHistory,
    getTodayInputValue,
    payablesCount,
    payablesFilterDateEndField,
    payablesFilterDateEndInput,
    payablesFilterDateModeInput,
    payablesFilterDateStartField,
    payablesFilterDateStartInput,
    payablesFilterDocumentInput,
    payablesFilterStatusInput,
    payablesFilterSupplierInput,
    payablesOverdue,
    payablesTotal,
    printPurchasePayableReceipt,
    purchasePayableAmountInput,
    purchasePayableDateInput,
    purchasePayableForm,
    purchasePayableHistory,
    purchasePayableMethodInput,
    purchasePayableModal,
    purchasePayableModalTitle,
    purchasePayableReferenceField,
    purchasePayableReferenceInput,
    purchasePayableStatus,
    purchasePayableSummary,
    purchasePayablesReport,
    purchaseRecords,
    purchaseStatus,
    renderAccountStatementTable,
    requiresPaymentReference,
    resolveAccountStatus,
    submitPurchasePayableButton,
  } = context;

  let payingPurchaseId = null;
  let editingPurchasePaymentEntryId = null;

  function setPurchasePayableStatus(message, options = {}) {
    const { error = false } = options;
    purchasePayableStatus.textContent = message;
    purchasePayableStatus.classList.toggle('error', error);
  }

  function resetPurchasePaymentEntryEditing() {
    editingPurchasePaymentEntryId = null;
  }

  function getEditingPurchasePaymentEntryId() {
    return editingPurchasePaymentEntryId;
  }

  function updatePurchasePayableReferenceVisibility() {
    const shouldShowReference = requiresPaymentReference(purchasePayableMethodInput.value);
    purchasePayableReferenceField.classList.toggle('field-hidden', !shouldShowReference);
    purchasePayableReferenceInput.required = shouldShowReference;
    if (!shouldShowReference) {
      purchasePayableReferenceInput.value = '';
    }
  }

  function calculateInvoiceTotal(compra) {
    if (!Array.isArray(compra?.items)) return 0;
    return compra.items.reduce((sum, item) => sum + Number(item.costo) * Number(item.cantidad), 0);
  }

  function isCreditPurchase(compra) {
    return String(compra?.originalPaymentType || compra?.paymentType || '').toLowerCase() === 'credito';
  }

  function isCashPurchase(compra) {
    return String(compra?.originalPaymentType || compra?.paymentType || '').toLowerCase() === 'contado';
  }

  function getPurchaseTotalAmount(compra) {
    return Math.max(Number(compra?.totalAmount || calculateInvoiceTotal(compra)), 0);
  }

  function getRecordTotalPaid(record, totalAmount = 0) {
    return Math.min(getNormalizedRecordPaymentHistory(record, totalAmount).reduce((sum, entry) => sum + Number(entry.amount || 0), 0), totalAmount);
  }

  function getPurchasePaidAmount(compra) {
    const totalAmount = getPurchaseTotalAmount(compra);
    return getRecordTotalPaid(compra, totalAmount);
  }

  function getPurchaseBalanceDue(compra) {
    if (!isCreditPurchase(compra)) return 0;
    return Math.max(getPurchaseTotalAmount(compra) - getPurchasePaidAmount(compra), 0);
  }

  function isPaidCreditPurchase(compra) {
    return isCreditPurchase(compra) && getPurchaseBalanceDue(compra) <= 0.0001;
  }

  function canManagePurchasePayment(compra) {
    return isCreditPurchase(compra) || isCashPurchase(compra);
  }

  function getPurchasePaymentActionLabel(compra) {
    if (isCreditPurchase(compra)) {
      const paidAmount = getPurchasePaidAmount(compra);
      const paymentHistory = getNormalizedRecordPaymentHistory(compra, getPurchaseTotalAmount(compra));
      if (isPaidCreditPurchase(compra)) return paymentHistory.length === 1 ? 'Editar abono' : 'Estado de cuenta';
      return paidAmount > 0 ? 'Registrar abono' : 'Aplicar pago';
    }
    return 'Editar pago';
  }

  function getPurchasePaymentTypeLabel(compra) {
    if (isPaidCreditPurchase(compra)) return 'Credito pagado';
    if (isCreditPurchase(compra) && getPurchasePaidAmount(compra) > 0) return 'Credito abonado';
    if (isCreditPurchase(compra)) return 'Credito';
    if (isCashPurchase(compra)) return 'Contado';
    return String(compra?.paymentType || '').trim() || 'N/A';
  }

  function getPurchaseAccountStatus(compra) {
    return resolveAccountStatus(getPurchaseBalanceDue(compra), getPurchasePaidAmount(compra), compra?.dueDate);
  }

  function getPurchaseById(purchaseId) {
    return state.purchases.find(compra => String(compra.id) === String(purchaseId)) || null;
  }

  function startEditPurchasePaymentEntry(paymentEntry) {
    if (!paymentEntry) {
      return;
    }
    editingPurchasePaymentEntryId = paymentEntry.id;
    purchasePayableMethodInput.value = paymentEntry.paymentMethod || 'efectivo';
    purchasePayableDateInput.value = paymentEntry.date ? new Date(paymentEntry.date).toISOString().slice(0, 10) : getTodayInputValue();
    purchasePayableAmountInput.value = Number(paymentEntry.amount || 0).toFixed(2);
    purchasePayableReferenceInput.value = paymentEntry.paymentReference || '';
    updatePurchasePayableReferenceVisibility();
    purchasePayableModalTitle.textContent = 'Editar abono';
    submitPurchasePayableButton.textContent = 'Guardar cambios';
    setPurchasePayableStatus('Corrige el metodo, la referencia o la fecha del abono seleccionado.');
  }

  function openPurchasePayableModalPanel(purchaseId) {
    resetPurchasePaymentEntryEditing();
    payingPurchaseId = purchaseId;
    const purchase = getPurchaseById(purchaseId);
    const totalAmount = getPurchaseTotalAmount(purchase);
    const paidAmount = getPurchasePaidAmount(purchase);
    const balanceDue = getPurchaseBalanceDue(purchase);
    const paymentHistory = getNormalizedRecordPaymentHistory(purchase, totalAmount);
    purchasePayableForm.reset();
    purchasePayableMethodInput.value = purchase?.paymentMethod || 'efectivo';
    purchasePayableDateInput.value = getLastRecordPayment(purchase, totalAmount)?.date
      ? new Date(getLastRecordPayment(purchase, totalAmount).date).toISOString().slice(0, 10)
      : purchase?.fecha
        ? new Date(purchase.fecha).toISOString().slice(0, 10)
        : getTodayInputValue();
    purchasePayableReferenceInput.value = purchase?.paymentReference || '';
    purchasePayableAmountInput.value = balanceDue > 0 ? balanceDue.toFixed(2) : totalAmount.toFixed(2);
    updatePurchasePayableReferenceVisibility();
    const actionLabel = purchase ? getPurchasePaymentActionLabel(purchase) : 'Aplicar pago';
    const isEditingPayment = actionLabel === 'Editar pago' || actionLabel === 'Editar abono';
    const isViewOnly = isCreditPurchase(purchase) && balanceDue <= 0.0001 && actionLabel !== 'Editar abono';
    const latestPayment = getLastRecordPayment(purchase, totalAmount);
    if (actionLabel === 'Editar abono' && paymentHistory.length === 1 && latestPayment) {
      startEditPurchasePaymentEntry(latestPayment);
    }
    purchasePayableModalTitle.textContent = actionLabel;
    submitPurchasePayableButton.textContent = isEditingPayment ? 'Guardar cambios' : 'Registrar abono';
    submitPurchasePayableButton.style.display = isViewOnly ? 'none' : 'inline-flex';
    [purchasePayableMethodInput, purchasePayableDateInput, purchasePayableAmountInput, purchasePayableReferenceInput].forEach(input => {
      input.disabled = isViewOnly;
    });
    purchasePayableSummary.textContent = purchase
      ? `Documento ${purchase.documento || purchase.document || '-'} · total ${formatCurrency(totalAmount)} · abonado ${formatCurrency(paidAmount)} · saldo ${formatCurrency(balanceDue)}.`
      : 'Aqui veras el saldo pendiente y el historial de abonos de esta compra.';
    renderAccountStatementTable(purchasePayableHistory, purchase, totalAmount, 'Aun no hay abonos registrados para esta compra.', {
      renderActions: entry => `
        <div class="purchase-row-actions">
          <button type="button" class="secondary-btn action-icon-btn" data-purchase-payment-entry-edit="${escapeHtml(entry.id)}" title="Editar abono">✎</button>
          <button type="button" class="secondary-btn action-icon-btn" data-purchase-payment-entry-print="${escapeHtml(entry.id)}" title="Imprimir recibo">🧾</button>
        </div>
      `
    });
    purchasePayableHistory.querySelectorAll('[data-purchase-payment-entry-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.purchasePaymentEntryEdit));
        if (!paymentEntry) return;
        startEditPurchasePaymentEntry(paymentEntry);
      });
    });
    purchasePayableHistory.querySelectorAll('[data-purchase-payment-entry-print]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.purchasePaymentEntryPrint));
        if (!paymentEntry) return;
        printPurchasePayableReceipt(purchase, paymentEntry);
      });
    });
    setPurchasePayableStatus(isViewOnly
      ? 'Esta cuenta ya está saldada. Aquí puedes consultar su estado de cuenta.'
      : isEditingPayment
        ? 'Corrige el método, la referencia o la fecha del pago registrado.'
        : 'Confirma el monto, el metodo y la fecha del abono.');
    purchasePayableModal.classList.remove('field-hidden');
    purchasePayableModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closePurchasePayableModalPanel() {
    resetPurchasePaymentEntryEditing();
    payingPurchaseId = null;
    purchasePayableModalTitle.textContent = 'Aplicar pago';
    submitPurchasePayableButton.textContent = 'Aplicar pago';
    submitPurchasePayableButton.style.display = 'inline-flex';
    [purchasePayableMethodInput, purchasePayableDateInput, purchasePayableAmountInput, purchasePayableReferenceInput].forEach(input => {
      input.disabled = false;
    });
    purchasePayableSummary.textContent = 'Aqui veras el saldo pendiente y el historial de abonos de esta compra.';
    purchasePayableHistory.innerHTML = '';
    purchasePayableModal.classList.add('field-hidden');
    purchasePayableModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function getPayingPurchaseId() {
    return payingPurchaseId;
  }

  function getFilteredPurchases() {
    const documentFilter = filterDocumentInput.value.trim().toLowerCase();
    const supplierFilter = filterSupplierInput.value.trim().toLowerCase();
    const productFilter = filterProductInput.value.trim().toLowerCase();
    const methodFilter = filterMethodInput.value;
    const useDateRange = filterDateModeInput.value === 'range';
    const startDate = useDateRange && filterDateStartInput.value ? new Date(filterDateStartInput.value) : null;
    const endDate = useDateRange && filterDateEndInput.value ? new Date(filterDateEndInput.value) : null;

    return state.purchases.filter(compra => {
      const matchesDocument = documentFilter ? String(compra.documento || compra.document || '').toLowerCase().includes(documentFilter) : true;
      const matchesSupplier = supplierFilter ? String(compra.proveedor || '').toLowerCase().includes(supplierFilter) : true;
      const matchesMethod = methodFilter === 'all' ? true : String(compra.paymentMethod || '').toLowerCase() === methodFilter;
      const purchaseDate = new Date(compra.fecha);
      const matchesStart = startDate ? purchaseDate >= startDate : true;
      const matchesEnd = endDate ? purchaseDate <= endDate : true;
      const matchesProduct = productFilter ? (Array.isArray(compra.items) ? compra.items.some(item => String(item.nombre || '').toLowerCase().includes(productFilter)) : String(compra.nombre || '').toLowerCase().includes(productFilter)) : true;
      return matchesDocument && matchesSupplier && matchesMethod && matchesStart && matchesEnd && matchesProduct;
    });
  }

  function updatePurchaseRegistroDateFilterVisibility() {
    const useRange = filterDateModeInput.value === 'range';
    filterDateStartField.classList.toggle('field-hidden', !useRange);
    filterDateEndField.classList.toggle('field-hidden', !useRange);
    if (!useRange) {
      filterDateStartInput.value = '';
      filterDateEndInput.value = '';
    }
  }

  function buildRegistroRows() {
    return getFilteredPurchases().flatMap(compra => {
      const lastPayment = getLastRecordPayment(compra, getPurchaseTotalAmount(compra));
      if (!Array.isArray(compra.items) || !compra.items.length) {
        return [{
          Documento: compra.documento || compra.document || '',
          Proveedor: compra.proveedor || '',
          Fecha: formatDate(compra.fecha),
          'Tipo de pago': getPurchasePaymentTypeLabel(compra),
          Metodo: compra.paymentMethod || '',
          Referencia: compra.paymentReference || '',
          'Fecha pago': lastPayment?.date ? formatDate(lastPayment.date) : '',
          Producto: 'Sin items',
          Cantidad: '',
          Precio: '',
          Total: ''
        }];
      }

      return compra.items.map(item => {
        const total = Number(item.costo) * Number(item.cantidad);
        const linkedLabel = item.flavorName || item.toppingName || item.sauceName || '';
        const productLabel = linkedLabel ? `${item.nombre || ''} · ${linkedLabel}` : item.nombre || '';
        return {
          Documento: compra.documento || compra.document || '',
          Proveedor: compra.proveedor || '',
          Fecha: formatDate(compra.fecha),
          'Tipo de pago': getPurchasePaymentTypeLabel(compra),
          Metodo: compra.paymentMethod || '',
          Referencia: compra.paymentReference || '',
          'Fecha pago': lastPayment?.date ? formatDate(lastPayment.date) : '',
          Producto: productLabel,
          Cantidad: Number(item.cantidad),
          Precio: formatCurrency(item.costo),
          Total: formatCurrency(total)
        };
      });
    });
  }

  function renderPurchaseHistory() {
    if (!purchaseRecords) return;
    const purchases = state.purchases;
    if (!purchases.length) {
      purchaseRecords.innerHTML = '<p class="history-empty">Aun no hay compras registradas.</p>';
      return;
    }
    purchaseRecords.innerHTML = `
      <h4>Historial de compras</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Proveedor</th>
            <th>Fecha</th>
            <th>Tipo de pago</th>
            <th>Metodo</th>
            <th>Referencia</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${purchases.slice().reverse().flatMap(compra => {
            if (!Array.isArray(compra.items) || !compra.items.length) {
              return [`
                <tr>
                  <td><button type="button" class="invoice-link-btn" data-purchase-id="${escapeHtml(String(compra.id || ''))}" title="Ver detalle de compra">${escapeHtml(compra.documento || compra.document)}</button></td>
                  <td>${escapeHtml(compra.proveedor || '')}</td>
                  <td>${formatDate(compra.fecha)}</td>
                  <td>${escapeHtml(compra.paymentType || '')}</td>
                  <td>${escapeHtml(compra.paymentMethod || '')}</td>
                  <td colspan="4">Sin items</td>
                </tr>
              `];
            }
            return compra.items.map(item => {
              const total = Number(item.costo) * Number(item.cantidad);
              const linkedLabel = item.flavorName || item.toppingName || item.sauceName || '';
              const productLabel = linkedLabel ? `${item.nombre} · ${linkedLabel}` : item.nombre;
              return `
                <tr>
                  <td><button type="button" class="invoice-link-btn" data-purchase-id="${escapeHtml(String(compra.id || ''))}" title="Ver detalle de compra">${escapeHtml(compra.documento || compra.document)}</button></td>
                  <td>${escapeHtml(compra.proveedor || '')}</td>
                  <td>${formatDate(compra.fecha)}</td>
                  <td>${escapeHtml(compra.paymentType || '')}</td>
                  <td>${escapeHtml(compra.paymentMethod || '')}</td>
                  <td>${buildReceiptReferenceMarkup(compra.paymentReference, 'purchase-history-receipt', compra.id)}</td>
                  <td>${escapeHtml(productLabel)}</td>
                  <td>${Number(item.cantidad)}</td>
                  <td>C$${Number(item.costo).toFixed(2).replace('.', ',')}</td>
                  <td>C$${total.toFixed(2).replace('.', ',')}</td>
                </tr>
              `;
            });
          }).join('')}
        </tbody>
      </table>
    `;

    purchaseRecords.querySelectorAll('[data-purchase-history-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const purchase = getPurchaseById(button.dataset.purchaseHistoryReceipt);
        if (!purchase) return;
        const lastPayment = getLastRecordPayment(purchase, getPurchaseTotalAmount(purchase));
        if (!lastPayment) return;
        printPurchasePayableReceipt(purchase, lastPayment);
      });
    });
  }

  function renderPurchaseRegistro() {
    const filtered = getFilteredPurchases();
    if (!purchaseRecords) return;
    if (!filtered.length) {
      purchaseRecords.innerHTML = '<p class="history-empty">No hay compras que coincidan con los filtros.</p>';
      return;
    }
    purchaseRecords.innerHTML = `
      <h4>Registro de compras</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Proveedor</th>
            <th>Fecha</th>
            <th>Tipo de pago</th>
            <th>Metodo</th>
            <th>Referencia</th>
            <th>Fecha pago</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.slice().reverse().flatMap(compra => compra.items.map(item => {
            const total = Number(item.costo) * Number(item.cantidad);
            const allowPaymentEditing = canManagePurchasePayment(compra);
            const actionLabel = getPurchasePaymentActionLabel(compra);
            const linkedLabel = item.flavorName || item.toppingName || item.sauceName || '';
            const productLabel = linkedLabel ? `${item.nombre} · ${linkedLabel}` : item.nombre;
            return `
              <tr>
                <td><button type="button" class="invoice-link-btn" data-purchase-id="${escapeHtml(String(compra.id || ''))}" title="Ver detalle de compra">${escapeHtml(compra.documento || compra.document)}</button></td>
                <td>${escapeHtml(compra.proveedor || '')}</td>
                <td>${formatDate(compra.fecha)}</td>
                <td>${escapeHtml(getPurchasePaymentTypeLabel(compra))}</td>
                <td>${escapeHtml(compra.paymentMethod || '')}</td>
                <td>${buildReceiptReferenceMarkup(compra.paymentReference, 'purchase-receipt', compra.id)}</td>
                <td>${compra.paidAt ? formatDate(compra.paidAt) : '-'}</td>
                <td>${escapeHtml(productLabel)}</td>
                <td>${Number(item.cantidad)}</td>
                <td>C$${Number(item.costo).toFixed(2).replace('.', ',')}</td>
                <td>C$${total.toFixed(2).replace('.', ',')}</td>
                <td>${allowPaymentEditing ? `<button type="button" class="secondary-btn action-icon-btn registro-payment-btn" data-registro-purchase-pay="${escapeHtml(String(compra.id))}" title="${escapeHtml(actionLabel)}">${getActionIcon(actionLabel)}</button>` : '-'}</td>
              </tr>
            `;
          })).join('')}
        </tbody>
      </table>
    `;

    purchaseRecords.querySelectorAll('[data-purchase-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const purchase = getPurchaseById(button.dataset.purchaseReceipt);
        if (!purchase) return;
        const lastPayment = getLastRecordPayment(purchase, getPurchaseTotalAmount(purchase));
        if (!lastPayment) return;
        printPurchasePayableReceipt(purchase, lastPayment);
      });
    });

    purchaseRecords.querySelectorAll('[data-registro-purchase-pay]').forEach(button => {
      button.addEventListener('click', () => openPurchasePayableModalPanel(button.dataset.registroPurchasePay));
    });
  }

  function getDueDayDifference(dueDate, today) {
    if (!dueDate) return null;
    const dueCopy = new Date(dueDate);
    dueCopy.setHours(0, 0, 0, 0);
    return Math.round((dueCopy.getTime() - today.getTime()) / 86400000);
  }

  function updatePayablesDateFilterVisibility() {
    const useRange = payablesFilterDateModeInput.value === 'range';
    payablesFilterDateStartField.classList.toggle('field-hidden', !useRange);
    payablesFilterDateEndField.classList.toggle('field-hidden', !useRange);
    if (!useRange) {
      payablesFilterDateStartInput.value = '';
      payablesFilterDateEndInput.value = '';
    }
  }

  function getCreditPayables() {
    const documentFilter = payablesFilterDocumentInput.value.trim().toLowerCase();
    const supplierFilter = payablesFilterSupplierInput.value.trim().toLowerCase();
    const statusFilter = payablesFilterStatusInput.value;
    const useDateRange = payablesFilterDateModeInput.value === 'range';
    const dateStart = useDateRange && payablesFilterDateStartInput.value ? new Date(payablesFilterDateStartInput.value) : null;
    const dateEnd = useDateRange && payablesFilterDateEndInput.value ? new Date(payablesFilterDateEndInput.value) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return state.purchases.filter(compra => {
      if (!isCreditPurchase(compra) || isPaidCreditPurchase(compra)) return false;
      const dueDate = compra.dueDate ? new Date(compra.dueDate) : null;
      const invoiceDate = compra.fecha ? new Date(compra.fecha) : null;
      if (invoiceDate) invoiceDate.setHours(0, 0, 0, 0);
      const invoiceDocument = String(compra.documento || compra.document || '').toLowerCase();
      const supplier = String(compra.proveedor || '').toLowerCase();
      const statusValue = getPurchaseAccountStatus(compra).key === 'overdue' ? 'overdue' : 'pending';
      const matchesDocument = documentFilter ? invoiceDocument.includes(documentFilter) : true;
      const matchesSupplier = supplierFilter ? supplier.includes(supplierFilter) : true;
      const matchesStatus = statusFilter === 'all' ? true : statusFilter === statusValue;
      const matchesDateStart = dateStart && invoiceDate ? invoiceDate >= dateStart : !dateStart;
      const matchesDateEnd = dateEnd && invoiceDate ? invoiceDate <= dateEnd : !dateEnd;
      return matchesDocument && matchesSupplier && matchesStatus && matchesDateStart && matchesDateEnd;
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
      return String(a.proveedor || '').localeCompare(String(b.proveedor || ''), 'es', { sensitivity: 'base' });
    });
  }

  function buildPayablesRows() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getCreditPayables().map(compra => {
      const dueDate = compra.dueDate ? new Date(compra.dueDate) : null;
      const dayDifference = getDueDayDifference(dueDate, today);
      const totalAmount = getPurchaseTotalAmount(compra);
      const paidAmount = getPurchasePaidAmount(compra);
      const balanceDue = getPurchaseBalanceDue(compra);
      const status = getPurchaseAccountStatus(compra);
      const isOverdue = status.key === 'overdue';
      const agingLabel = dayDifference === null
        ? 'Sin fecha'
        : isOverdue
          ? `${Math.abs(dayDifference)} vencidos`
          : dayDifference === 0
            ? 'Vence hoy'
            : `${dayDifference} por vencer`;

      return {
        Documento: compra.documento || compra.document || '',
        Proveedor: compra.proveedor || '',
        'Fecha compra': formatDate(compra.fecha),
        Vencimiento: dueDate ? formatDate(compra.dueDate) : 'Sin fecha',
        Estado: status.label,
        Dias: agingLabel,
        'Monto original': formatCurrency(totalAmount),
        Abonado: formatCurrency(paidAmount),
        Saldo: formatCurrency(balanceDue)
      };
    });
  }

  function exportRegistroExcel() {
    const rows = buildRegistroRows();
    const dateStamp = getExportDateStamp();
    if (!exportRowsToExcel(rows, `registro-compras-${dateStamp}.xlsx`, 'Registro Compras')) {
      purchaseStatus.className = 'status error';
      purchaseStatus.textContent = 'No hay datos en Registro para exportar.';
    }
  }

  function exportRegistroPdf() {
    const rows = buildRegistroRows();
    const headers = ['Documento', 'Proveedor', 'Fecha', 'Tipo de pago', 'Metodo', 'Referencia', 'Fecha pago', 'Producto', 'Cantidad', 'Precio', 'Total'];
    const body = rows.map(row => headers.map(header => row[header] ?? ''));
    const dateStamp = getExportDateStamp();
    if (!exportRowsToPdf('Registro de compras', headers, body, `registro-compras-${dateStamp}.pdf`)) {
      purchaseStatus.className = 'status error';
      purchaseStatus.textContent = 'No hay datos en Registro para exportar.';
    }
  }

  function exportPayablesExcel() {
    const rows = buildPayablesRows();
    const dateStamp = getExportDateStamp();
    if (!exportRowsToExcel(rows, `cuentas-por-pagar-${dateStamp}.xlsx`, 'Cuentas por Pagar')) {
      purchaseStatus.className = 'status error';
      purchaseStatus.textContent = 'No hay cuentas por pagar para exportar.';
    }
  }

  function exportPayablesPdf() {
    const rows = buildPayablesRows();
    const headers = ['Documento', 'Proveedor', 'Fecha compra', 'Vencimiento', 'Estado', 'Dias', 'Monto original', 'Abonado', 'Saldo'];
    const body = rows.map(row => headers.map(header => row[header] ?? ''));
    const dateStamp = getExportDateStamp();
    if (!exportRowsToPdf('Cuentas por pagar', headers, body, `cuentas-por-pagar-${dateStamp}.pdf`)) {
      purchaseStatus.className = 'status error';
      purchaseStatus.textContent = 'No hay cuentas por pagar para exportar.';
    }
  }

  function renderPurchasePayables() {
    if (!purchasePayablesReport) return;
    const payables = getCreditPayables();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCount = payables.filter(compra => getPurchaseAccountStatus(compra).key === 'overdue').length;
    const totalDebt = payables.reduce((sum, compra) => sum + getPurchaseBalanceDue(compra), 0);

    if (payablesCount) payablesCount.textContent = String(payables.length);
    if (payablesOverdue) payablesOverdue.textContent = String(overdueCount);
    if (payablesTotal) payablesTotal.textContent = formatCurrency(totalDebt);

    if (!payables.length) {
      purchasePayablesReport.innerHTML = '<p class="history-empty">No hay facturas de credito segun los filtros actuales.</p>';
      return;
    }

    purchasePayablesReport.innerHTML = `
      <h4>Facturas de credito</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Proveedor</th>
            <th>Fecha compra</th>
            <th>Vencimiento</th>
            <th>Estado</th>
            <th>Dias</th>
            <th>Monto</th>
            <th>Abonado</th>
            <th>Saldo</th>
            <th>Referencia</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${payables.map(compra => {
            const dueDate = compra.dueDate ? new Date(compra.dueDate) : null;
            const dayDifference = getDueDayDifference(dueDate, today);
            const totalAmount = getPurchaseTotalAmount(compra);
            const paidAmount = getPurchasePaidAmount(compra);
            const balanceDue = getPurchaseBalanceDue(compra);
            const status = getPurchaseAccountStatus(compra);
            const isOverdue = status.key === 'overdue';
            const agingLabel = dayDifference === null
              ? 'Sin fecha'
              : isOverdue
                ? `${Math.abs(dayDifference)} vencidos`
                : dayDifference === 0
                  ? 'Vence hoy'
                  : `${dayDifference} por vencer`;
            return `
              <tr>
                <td>${escapeHtml(compra.documento || compra.document)}</td>
                <td>${escapeHtml(compra.proveedor || '')}</td>
                <td>${formatDate(compra.fecha)}</td>
                <td>${dueDate ? formatDate(compra.dueDate) : 'Sin fecha'}</td>
                <td><span class="status-chip ${status.key}">${escapeHtml(status.label)}</span></td>
                <td><span class="aging-chip">${agingLabel}</span></td>
                <td>${formatCurrency(totalAmount)}</td>
                <td>${formatCurrency(paidAmount)}</td>
                <td>${formatCurrency(balanceDue)}</td>
                <td>${buildReceiptReferenceMarkup(compra.paymentReference, 'purchase-receipt', compra.id)}</td>
                <td><button type="button" class="secondary-btn action-icon-btn payables-apply-btn" data-purchase-pay="${escapeHtml(String(compra.id))}" title="${escapeHtml(getPurchasePaymentActionLabel(compra))}">${getActionIcon(getPurchasePaymentActionLabel(compra))}</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    purchasePayablesReport.querySelectorAll('[data-purchase-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const purchase = getPurchaseById(button.dataset.purchaseReceipt);
        if (!purchase) return;
        const lastPayment = getLastRecordPayment(purchase, getPurchaseTotalAmount(purchase));
        if (!lastPayment) return;
        printPurchasePayableReceipt(purchase, lastPayment);
      });
    });

    purchasePayablesReport.querySelectorAll('[data-purchase-pay]').forEach(button => {
      button.addEventListener('click', () => openPurchasePayableModalPanel(button.dataset.purchasePay));
    });
  }

  return {
    setPurchasePayableStatus,
    resetPurchasePaymentEntryEditing,
    getEditingPurchasePaymentEntryId,
    updatePurchasePayableReferenceVisibility,
    calculateInvoiceTotal,
    isCreditPurchase,
    isCashPurchase,
    getPurchaseTotalAmount,
    getPurchasePaidAmount,
    getPurchaseBalanceDue,
    isPaidCreditPurchase,
    canManagePurchasePayment,
    getPurchasePaymentActionLabel,
    getPurchasePaymentTypeLabel,
    getPurchaseAccountStatus,
    getPurchaseById,
    startEditPurchasePaymentEntry,
    openPurchasePayableModalPanel,
    closePurchasePayableModalPanel,
    getPayingPurchaseId,
    getFilteredPurchases,
    updatePurchaseRegistroDateFilterVisibility,
    buildRegistroRows,
    renderPurchaseHistory,
    renderPurchaseRegistro,
    updatePayablesDateFilterVisibility,
    getCreditPayables,
    buildPayablesRows,
    exportRegistroExcel,
    exportRegistroPdf,
    exportPayablesExcel,
    exportPayablesPdf,
    renderPurchasePayables,
  };
}
