export function createPaymentsModule(context) {
  const {
    state,
    applyDefaultDateValues,
    buildApiError,
    buildApiUrl,
    buildPaymentEntryReceiptMarkup,
    buildReceiptReferenceMarkup,
    closeExternalDebtPaymentModalButton,
    closePaymentReimbursementModalButton,
    externalDebtAmountInput,
    externalDebtCategoryInput,
    externalDebtConceptInput,
    externalDebtDateInput,
    externalDebtDueDateInput,
    externalDebtForm,
    externalDebtNoteInput,
    externalDebtPartyInput,
    externalDebtPaymentAccountInput,
    externalDebtPaymentDateInput,
    externalDebtPaymentForm,
    externalDebtPaymentHistory,
    externalDebtPaymentModal,
    externalDebtPaymentModalTitle,
    externalDebtPaymentNoteInput,
    externalDebtPaymentReferenceInput,
    externalDebtPaymentStatus,
    externalDebtPaymentSummary,
    externalDebtStatus,
    externalDebtSubmitButton,
    externalDebtTypeInput,
    externalPayablesBalance,
    externalPayablesRecords,
    externalReceivablesBalance,
    externalReceivablesRecords,
    externalDebtsOverdue,
    escapeHtml,
    fetchExternalDebts,
    fetchPaymentCategories,
    formatCurrency,
    formatDate,
    fundBankBalance,
    fundBankRecords,
    fundCashAvailable,
    fundCashBalance,
    fundCashMinimum,
    fundCashRecords,
    fundCashReserveNote,
    fundOverviewPanel,
    fundCashPanel,
    fundBankPanel,
    fundExternalPanel,
    fundOpeningBankInput,
    fundOpeningCashInput,
    fundMinimumCashInput,
    fundTabs,
    getActionIcon,
    getDefaultFundSettings,
    getExportDateStamp,
    getExternalDebtBalanceDue,
    getExternalDebtOriginalAmount,
    getExternalDebtPaidAmount,
    getExternalDebtStatus,
    getFundAccountFromPaymentMethod,
    getLastRecordPayment,
    getNormalizedRecordPaymentHistory,
    getPurchaseTotalAmount,
    getSaleTotalAmount,
    getTodayInputValue,
    openPaymentReimbursementBatchButton,
    paymentBeneficiaryInput,
    paymentAmountInput,
    paymentCategoryDescriptionInput,
    paymentCategoryForm,
    paymentCategoryInput,
    paymentCategoryList,
    paymentCategoryNameInput,
    paymentCategoryStatus,
    paymentCategorySubmitButton,
    paymentDateInput,
    paymentDescriptionInput,
    paymentFilterCategoryInput,
    paymentFilterDescriptionInput,
    paymentFilterMethodInput,
    paymentFilterStatusInput,
    paymentForm,
    paymentInfo,
    paymentMethodInput,
    paymentMethodSummary,
    paymentNewPanel,
    paymentNoteInput,
    paymentPendingPanel,
    paymentPendingRecords,
    paymentRecords,
    paymentReferenceField,
    paymentReferenceInput,
    paymentRegistroPanel,
    paymentReimbursementDateInput,
    paymentReimbursementForm,
    paymentReimbursementModal,
    paymentReimbursementReferenceInput,
    paymentReimbursementSelectionSummary,
    paymentReimbursementStatus,
    paymentStatus,
    paymentSubmitButton,
    paymentTabs,
    printExternalDebtReceipt,
    printPaymentReceipt,
    renderAccountStatementTable,
    resolveAccountStatus,
    setLastRegisteredPaymentForPrint,
    submitExternalDebtPaymentButton,
    syncDynamicTableExport,
  } = context;

  let editingPaymentCategoryId = null;
  let editingPaymentId = null;
  let editingExternalDebtId = null;
  let editingExternalDebtPaymentEntryId = null;
  let payingExternalDebtId = null;
  let selectedPendingPaymentIds = [];

  function getEditingPaymentId() {
    return editingPaymentId;
  }

  function getEditingExternalDebtId() {
    return editingExternalDebtId;
  }

  function getEditingPaymentCategoryId() {
    return editingPaymentCategoryId;
  }

  function getEditingExternalDebtPaymentEntryId() {
    return editingExternalDebtPaymentEntryId;
  }

  function getPayingExternalDebtId() {
    return payingExternalDebtId;
  }

  function getSelectedPendingPaymentIds() {
    return selectedPendingPaymentIds.slice();
  }

  function clearSelectedPendingPaymentIds() {
    selectedPendingPaymentIds = [];
  }

  function getPaymentCategoryById(categoryId) {
    return state.paymentCategories.find(item => String(item.id) === String(categoryId)) || null;
  }

  function getPaymentCategoryName(payment) {
    return payment?.categoriaNombre || getPaymentCategoryById(payment?.categoriaId)?.nombre || 'Sin clasificacion';
  }

  function getPaymentCategoryDescription(payment) {
    return getPaymentCategoryById(payment?.categoriaId)?.descripcion || '';
  }

  function isExpensePayment(payment) {
    return String(getPaymentCategoryDescription(payment) || '').trim().toLowerCase() === 'gasto';
  }

  function getNormalizedFundSettings() {
    const source = state.fundSettings && typeof state.fundSettings === 'object'
      ? state.fundSettings
      : getDefaultFundSettings();
    const openingCashBalance = Number(source.openingCashBalance || 0);
    const openingBankBalance = Number(source.openingBankBalance || 0);
    const minimumCashReserve = Number(source.minimumCashReserve || 0);
    return {
      openingCashBalance: Number.isFinite(openingCashBalance) && openingCashBalance >= 0 ? openingCashBalance : 0,
      openingBankBalance: Number.isFinite(openingBankBalance) && openingBankBalance >= 0 ? openingBankBalance : 0,
      minimumCashReserve: Number.isFinite(minimumCashReserve) && minimumCashReserve >= 0 ? minimumCashReserve : 0
    };
  }

  function syncFundSettingsForm() {
    if (!fundOpeningCashInput || !fundOpeningBankInput || !fundMinimumCashInput) {
      return;
    }
    const settings = getNormalizedFundSettings();
    fundOpeningCashInput.value = settings.openingCashBalance.toFixed(2);
    fundOpeningBankInput.value = settings.openingBankBalance.toFixed(2);
    fundMinimumCashInput.value = settings.minimumCashReserve.toFixed(2);
  }

  function getFundMovementModuleLabel(moduleName) {
    switch (String(moduleName || '').trim().toLowerCase()) {
      case 'ventas':
        return 'Venta';
      case 'compras':
        return 'Compra';
      case 'pagos':
        return 'Pago';
      case 'traslados':
        return 'Traslado';
      case 'configuracion':
        return 'Configuracion';
      default:
        return 'Movimiento';
    }
  }

  function getFundMovementMethodLabel(method) {
    const normalizedMethod = String(method || '').trim().toLowerCase();
    if (!normalizedMethod) {
      return '-';
    }
    if (normalizedMethod === 'tarjeta-credito') {
      return 'Tarjeta de credito';
    }
    if (normalizedMethod === 'ajuste-inicial') {
      return 'Saldo inicial';
    }
    if (normalizedMethod === 'traslado') {
      return 'Traslado';
    }
    return normalizedMethod.charAt(0).toUpperCase() + normalizedMethod.slice(1);
  }

  function getFundMovementDisplayDate(movement) {
    return String(movement?.module || '').trim().toLowerCase() === 'configuracion'
      ? 'Inicial'
      : formatDate(movement?.date);
  }

  function buildFundMovements() {
    const movementEntries = [];
    const fundSettings = getNormalizedFundSettings();

    if (fundSettings.openingCashBalance > 0) {
      movementEntries.push({
        id: 'opening-cash-balance',
        account: 'efectivo',
        direction: 'entrada',
        amount: fundSettings.openingCashBalance,
        date: '1970-01-01T00:00:00.000Z',
        module: 'configuracion',
        title: 'Saldo inicial',
        detail: 'Saldo base registrado para efectivo.',
        reference: null,
        paymentMethod: 'ajuste-inicial'
      });
    }

    if (fundSettings.openingBankBalance > 0) {
      movementEntries.push({
        id: 'opening-bank-balance',
        account: 'banco',
        direction: 'entrada',
        amount: fundSettings.openingBankBalance,
        date: '1970-01-01T00:00:00.000Z',
        module: 'configuracion',
        title: 'Saldo inicial',
        detail: 'Saldo base registrado para bancos.',
        reference: null,
        paymentMethod: 'ajuste-inicial'
      });
    }

    state.sales.forEach(sale => {
      const totalAmount = getSaleTotalAmount(sale);
      getNormalizedRecordPaymentHistory(sale, totalAmount).forEach((payment, index) => {
        const account = getFundAccountFromPaymentMethod(payment.paymentMethod || payment.account);
        if (!account) {
          return;
        }
        movementEntries.push({
          id: `sale-${String(sale.id || '')}-${String(payment.id || index)}`,
          account,
          direction: 'entrada',
          amount: Number(payment.amount || 0),
          date: payment.date || sale.fecha,
          module: 'ventas',
          title: sale.documento || 'Venta',
          detail: sale.cliente ? `Cliente: ${sale.cliente}` : 'Ingreso por venta',
          reference: payment.paymentReference || sale.paymentReference || null,
          paymentMethod: payment.paymentMethod || payment.account || sale.paymentMethod || null
        });
      });
    });

    state.purchases.forEach(purchase => {
      const totalAmount = getPurchaseTotalAmount(purchase);
      getNormalizedRecordPaymentHistory(purchase, totalAmount).forEach((payment, index) => {
        const paymentMethod = String(payment.paymentMethod || payment.account || purchase.paymentMethod || '').trim().toLowerCase();
        if (paymentMethod === 'tarjeta') {
          return;
        }
        const account = getFundAccountFromPaymentMethod(payment.paymentMethod || payment.account);
        if (!account) {
          return;
        }
        movementEntries.push({
          id: `purchase-${String(purchase.id || '')}-${String(payment.id || index)}`,
          account,
          direction: 'salida',
          amount: Number(payment.amount || 0),
          date: payment.date || purchase.fecha,
          module: 'compras',
          title: purchase.documento || 'Compra',
          detail: purchase.proveedor ? `Proveedor: ${purchase.proveedor}` : 'Salida por compra',
          reference: payment.paymentReference || purchase.paymentReference || null,
          paymentMethod: payment.paymentMethod || payment.account || purchase.paymentMethod || null
        });
      });
    });

    state.externalDebts.forEach(debt => {
      const debtType = String(debt.type || '').trim().toLowerCase() === 'por-cobrar' ? 'por-cobrar' : 'por-pagar';
      getNormalizedRecordPaymentHistory(debt, getExternalDebtOriginalAmount(debt)).forEach((payment, index) => {
        const account = getFundAccountFromPaymentMethod(payment.paymentMethod || payment.account);
        if (!account) {
          return;
        }
        movementEntries.push({
          id: `external-debt-${String(debt.id || '')}-${String(payment.id || index)}`,
          account,
          direction: debtType === 'por-cobrar' ? 'entrada' : 'salida',
          amount: Number(payment.amount || 0),
          date: payment.date || debt.fecha,
          module: 'deudas-externas',
          title: debt.concepto || 'Deuda externa',
          detail: debt.tercero ? `${debtType === 'por-cobrar' ? 'Cobro a' : 'Pago a'} ${debt.tercero}` : 'Movimiento por deuda externa',
          reference: payment.paymentReference || null,
          paymentMethod: payment.paymentMethod || payment.account || null
        });
      });
    });

    state.payments.forEach(payment => {
      const paymentMethod = String(payment.paymentMethod || '').trim().toLowerCase();
      const account = paymentMethod === 'tarjeta-credito'
        ? (payment.reimbursedAt ? 'banco' : '')
        : getFundAccountFromPaymentMethod(paymentMethod);
      const movementDate = paymentMethod === 'tarjeta-credito'
        ? payment.reimbursedAt
        : payment.fecha;
      if (!account || !movementDate) {
        return;
      }
      movementEntries.push({
        id: `payment-${String(payment.id || '')}`,
        account,
        direction: 'salida',
        amount: Number(payment.monto || 0),
        date: movementDate,
        module: 'pagos',
        title: getPaymentCategoryName(payment),
        detail: [payment.descripcion, payment.beneficiario].filter(Boolean).join(' · ') || 'Salida por pago',
        reference: payment.reimbursementReference || payment.referencia || null,
        paymentMethod: paymentMethod === 'tarjeta-credito' ? (payment.reimbursementMethod || 'transferencia') : payment.paymentMethod
      });
    });

    state.fundTransfers.forEach(transfer => {
      const amount = Number(transfer.amount || 0);
      if (amount <= 0) {
        return;
      }
      const detail = transfer.description || `Traslado entre ${getFundAccountLabel(transfer.fromAccount)} y ${getFundAccountLabel(transfer.toAccount)}`;
      movementEntries.push({
        id: `transfer-out-${String(transfer.id || '')}`,
        account: String(transfer.fromAccount || ''),
        direction: 'salida',
        amount,
        date: transfer.fecha || transfer.createdAt,
        module: 'traslados',
        title: 'Traslado de fondos',
        detail,
        reference: transfer.reference || null,
        paymentMethod: 'traslado'
      });
      movementEntries.push({
        id: `transfer-in-${String(transfer.id || '')}`,
        account: String(transfer.toAccount || ''),
        direction: 'entrada',
        amount,
        date: transfer.fecha || transfer.createdAt,
        module: 'traslados',
        title: 'Traslado de fondos',
        detail,
        reference: transfer.reference || null,
        paymentMethod: 'traslado'
      });
    });

    const runningBalances = { efectivo: 0, banco: 0 };
    return movementEntries
      .filter(movement => ['efectivo', 'banco'].includes(String(movement.account || '')) && Number(movement.amount || 0) > 0)
      .sort((left, right) => {
        const leftTime = new Date(left.date || 0).getTime();
        const rightTime = new Date(right.date || 0).getTime();
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return String(left.id || '').localeCompare(String(right.id || ''));
      })
      .map(movement => {
        const signedAmount = movement.direction === 'entrada' ? Number(movement.amount || 0) : Number(movement.amount || 0) * -1;
        runningBalances[movement.account] += signedAmount;
        return {
          ...movement,
          signedAmount,
          runningBalance: runningBalances[movement.account]
        };
      });
  }

  function getFundAccountLabel(account) {
    return String(account || '').trim().toLowerCase() === 'efectivo' ? 'Efectivo' : 'Bancos';
  }

  function renderFundAccountTable(container, account, movements) {
    if (!container) {
      return;
    }
    const accountMovements = movements.filter(movement => String(movement.account || '') === String(account)).slice().reverse();
    if (!accountMovements.length) {
      container.innerHTML = `<p class="history-empty">Aun no hay movimientos en ${escapeHtml(getFundAccountLabel(account).toLowerCase())}.</p>`;
      return;
    }

    container.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Documento</th>
            <th>Detalle</th>
            <th>Metodo</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Saldo</th>
            <th>Referencia</th>
          </tr>
        </thead>
        <tbody>
          ${accountMovements.map(movement => `
            <tr>
              <td>${escapeHtml(getFundMovementDisplayDate(movement))}</td>
              <td>${escapeHtml(getFundMovementModuleLabel(movement.module))}</td>
              <td><strong>${escapeHtml(movement.title || 'Movimiento')}</strong></td>
              <td>${movement.detail ? `<div class="field-help">${escapeHtml(movement.detail)}</div>` : '-'}</td>
              <td>${escapeHtml(getFundMovementMethodLabel(movement.paymentMethod))}</td>
              <td>${movement.direction === 'entrada' ? formatCurrency(movement.amount) : '-'}</td>
              <td>${movement.direction === 'salida' ? formatCurrency(movement.amount) : '-'}</td>
              <td>${formatCurrency(movement.runningBalance)}</td>
              <td>${escapeHtml(movement.reference || 'N/A')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(container, {
      title: account === 'efectivo' ? 'Movimientos de efectivo' : 'Movimientos de bancos',
      fileBase: account === 'efectivo' ? 'movimientos-efectivo' : 'movimientos-bancos',
      sheetName: account === 'efectivo' ? 'Movimientos Efectivo' : 'Movimientos Bancos'
    });
  }

  function renderFundsModule() {
    const settings = getNormalizedFundSettings();
    const fundMovements = buildFundMovements();
    const cashBalance = fundMovements.filter(movement => movement.account === 'efectivo').reduce((last, movement) => movement.runningBalance, 0);
    const bankBalance = fundMovements.filter(movement => movement.account === 'banco').reduce((last, movement) => movement.runningBalance, 0);
    const cashAvailable = Math.max(cashBalance - settings.minimumCashReserve, 0);
    const cashDeficit = Math.max(settings.minimumCashReserve - cashBalance, 0);
    if (fundCashBalance) fundCashBalance.textContent = formatCurrency(cashBalance);
    if (fundCashMinimum) fundCashMinimum.textContent = formatCurrency(settings.minimumCashReserve);
    if (fundCashAvailable) fundCashAvailable.textContent = formatCurrency(cashAvailable);
    if (fundBankBalance) fundBankBalance.textContent = formatCurrency(bankBalance);
    if (fundCashReserveNote) {
      fundCashReserveNote.textContent = cashDeficit > 0
        ? `La caja esta ${formatCurrency(cashDeficit)} por debajo del fondo minimo configurado.`
        : `Puedes mover ${formatCurrency(cashAvailable)} de efectivo sin tocar el fondo minimo de caja.`;
    }
    syncFundSettingsForm();
    renderFundAccountTable(fundCashRecords, 'efectivo', fundMovements);
    renderFundAccountTable(fundBankRecords, 'banco', fundMovements);
    renderExternalDebtsPanel();
  }

  function setExternalDebtStatus(message, options = {}) {
    if (!externalDebtStatus) {
      return;
    }
    externalDebtStatus.className = options.error ? 'status error' : 'status';
    externalDebtStatus.textContent = message;
  }

  function setExternalDebtPaymentStatus(message, options = {}) {
    if (!externalDebtPaymentStatus) {
      return;
    }
    externalDebtPaymentStatus.className = options.error ? 'status error' : 'status';
    externalDebtPaymentStatus.textContent = message;
  }

  function resetPaymentFormEditing() {
    editingPaymentId = null;
    paymentForm.reset();
    applyDefaultDateValues();
    updatePaymentMethodSection();
    if (paymentSubmitButton) {
      paymentSubmitButton.textContent = 'Registrar pago';
    }
    if (context.cancelPaymentEditButton) {
      context.cancelPaymentEditButton.classList.add('field-hidden');
    }
  }

  function startEditPayment(paymentId) {
    const payment = state.payments.find(item => String(item.id) === String(paymentId));
    if (!payment) {
      paymentStatus.className = 'status error';
      paymentStatus.textContent = 'No se encontro el pago seleccionado.';
      return;
    }
    editingPaymentId = String(payment.id);
    paymentDateInput.value = payment.fecha ? new Date(payment.fecha).toISOString().slice(0, 10) : getTodayInputValue();
    paymentCategoryInput.value = String(payment.categoriaId || '');
    paymentMethodInput.value = String(payment.paymentMethod || 'efectivo');
    paymentAmountInput.value = Number(payment.monto || 0).toFixed(2);
    paymentDescriptionInput.value = payment.descripcion || '';
    paymentBeneficiaryInput.value = payment.beneficiario || '';
    paymentReferenceInput.value = payment.paymentMethod === 'efectivo' ? '' : (payment.referencia || '');
    paymentNoteInput.value = payment.observacion || '';
    updatePaymentMethodSection();
    if (paymentSubmitButton) {
      paymentSubmitButton.textContent = 'Guardar cambios';
    }
    if (context.cancelPaymentEditButton) {
      context.cancelPaymentEditButton.classList.remove('field-hidden');
    }
    paymentTabs.forEach(button => button.classList.toggle('active', button.dataset.paymentTab === 'new'));
    paymentNewPanel.classList.add('active');
    paymentRegistroPanel.classList.remove('active');
    paymentPendingPanel.classList.remove('active');
    context.paymentCatalogPanel.classList.remove('active');
    paymentStatus.className = 'status';
    paymentStatus.textContent = `Editando pago: ${payment.descripcion || 'registro'}.`;
  }

  function resetExternalDebtFormEditing() {
    editingExternalDebtId = null;
    externalDebtForm.reset();
    applyDefaultDateValues();
    if (externalDebtSubmitButton) {
      externalDebtSubmitButton.textContent = 'Registrar deuda externa';
    }
    if (context.cancelExternalDebtEditButton) {
      context.cancelExternalDebtEditButton.classList.add('field-hidden');
    }
  }

  function startEditExternalDebt(debtId) {
    const debt = state.externalDebts.find(item => String(item.id) === String(debtId));
    if (!debt) {
      setExternalDebtStatus('No se encontro la deuda externa seleccionada.', { error: true });
      return;
    }
    fundTabs.forEach(button => button.classList.toggle('active', button.dataset.fundTab === 'external'));
    fundOverviewPanel.classList.add('field-hidden');
    fundCashPanel.classList.remove('active');
    fundBankPanel.classList.remove('active');
    fundExternalPanel.classList.add('active');
    editingExternalDebtId = String(debt.id);
    externalDebtTypeInput.value = debt.type || 'por-pagar';
    externalDebtCategoryInput.value = debt.categoria || debt.category || 'gasto';
    externalDebtDateInput.value = debt.fecha ? new Date(debt.fecha).toISOString().slice(0, 10) : getTodayInputValue();
    externalDebtDueDateInput.value = debt.dueDate ? new Date(debt.dueDate).toISOString().slice(0, 10) : '';
    externalDebtAmountInput.value = Number(getExternalDebtOriginalAmount(debt) || 0).toFixed(2);
    externalDebtPartyInput.value = debt.tercero || '';
    externalDebtConceptInput.value = debt.concepto || '';
    externalDebtNoteInput.value = debt.observacion || '';
    if (externalDebtSubmitButton) {
      externalDebtSubmitButton.textContent = 'Guardar cambios';
    }
    if (context.cancelExternalDebtEditButton) {
      context.cancelExternalDebtEditButton.classList.remove('field-hidden');
    }
    setExternalDebtStatus(`Editando deuda externa: ${debt.concepto || 'registro'}.`);
  }

  function resetExternalDebtPaymentEntryEditing() {
    editingExternalDebtPaymentEntryId = null;
  }

  function startEditExternalDebtPaymentEntry(paymentEntry) {
    if (!paymentEntry) {
      return;
    }
    editingExternalDebtPaymentEntryId = paymentEntry.id;
    externalDebtPaymentAccountInput.value = paymentEntry.account || getFundAccountFromPaymentMethod(paymentEntry.paymentMethod) || 'efectivo';
    externalDebtPaymentDateInput.value = paymentEntry.date ? new Date(paymentEntry.date).toISOString().slice(0, 10) : getTodayInputValue();
    externalDebtPaymentAmountInput.value = Number(paymentEntry.amount || 0).toFixed(2);
    externalDebtPaymentReferenceInput.value = paymentEntry.paymentReference || '';
    externalDebtPaymentNoteInput.value = paymentEntry.note || '';
    externalDebtPaymentModalTitle.textContent = 'Editar abono';
    submitExternalDebtPaymentButton.textContent = 'Guardar cambios';
    setExternalDebtPaymentStatus('Corrige la cuenta, la referencia o la fecha del abono seleccionado.');
  }

  function openExternalDebtPaymentModalPanel(debtId) {
    resetExternalDebtPaymentEntryEditing();
    payingExternalDebtId = debtId;
    const debt = state.externalDebts.find(item => String(item.id) === String(debtId));
    const originalAmount = getExternalDebtOriginalAmount(debt);
    const paidAmount = getExternalDebtPaidAmount(debt);
    const balanceDue = getExternalDebtBalanceDue(debt);
    const status = getExternalDebtStatus(debt);
    const paymentHistory = getNormalizedRecordPaymentHistory(debt, originalAmount);
    const isViewOnly = balanceDue <= 0.0001 && paymentHistory.length === 0;
    externalDebtPaymentForm.reset();
    externalDebtPaymentDateInput.value = getTodayInputValue();
    externalDebtPaymentAmountInput.value = balanceDue > 0 ? balanceDue.toFixed(2) : originalAmount.toFixed(2);
    externalDebtPaymentAccountInput.value = 'efectivo';
    externalDebtPaymentModalTitle.textContent = isViewOnly ? 'Estado de cuenta' : 'Registrar abono';
    submitExternalDebtPaymentButton.textContent = 'Registrar abono';
    submitExternalDebtPaymentButton.style.display = isViewOnly ? 'none' : 'inline-flex';
    [externalDebtPaymentAccountInput, externalDebtPaymentDateInput, externalDebtPaymentAmountInput, externalDebtPaymentReferenceInput, externalDebtPaymentNoteInput].forEach(input => {
      input.disabled = isViewOnly;
    });
    externalDebtPaymentSummary.textContent = debt
      ? `${debt.type === 'por-cobrar' ? 'Por cobrar a' : 'Por pagar a'} ${debt.tercero || '-'} · total ${formatCurrency(originalAmount)} · abonado ${formatCurrency(paidAmount)} · saldo ${formatCurrency(balanceDue)} · estado ${status.label}.`
      : 'Consulta el estado de cuenta o registra un abono.';
    renderAccountStatementTable(externalDebtPaymentHistory, debt, originalAmount, 'Aun no hay abonos registrados para esta deuda externa.', {
      renderActions: entry => `
        <div class="purchase-row-actions">
          <button type="button" class="secondary-btn action-icon-btn" data-external-debt-payment-entry-edit="${escapeHtml(entry.id)}" title="Editar abono">${getActionIcon('Editar abono')}</button>
          <button type="button" class="secondary-btn action-icon-btn" data-external-debt-payment-entry-print="${escapeHtml(entry.id)}" title="Imprimir recibo">${getActionIcon('Imprimir recibo')}</button>
        </div>
      `
    });
    externalDebtPaymentHistory.querySelectorAll('[data-external-debt-payment-entry-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.externalDebtPaymentEntryEdit));
        if (!paymentEntry) {
          return;
        }
        startEditExternalDebtPaymentEntry(paymentEntry);
      });
    });
    externalDebtPaymentHistory.querySelectorAll('[data-external-debt-payment-entry-print]').forEach(button => {
      button.addEventListener('click', () => {
        const paymentEntry = paymentHistory.find(entry => String(entry.id) === String(button.dataset.externalDebtPaymentEntryPrint));
        if (!paymentEntry) {
          return;
        }
        printExternalDebtReceipt(debt, paymentEntry);
      });
    });
    if (balanceDue <= 0.0001 && paymentHistory.length === 1) {
      startEditExternalDebtPaymentEntry(paymentHistory[0]);
    }
    setExternalDebtPaymentStatus(isViewOnly ? 'La deuda ya esta saldada. Aqui puedes consultar su estado de cuenta.' : 'Confirma el monto, la cuenta y la fecha del abono.');
    externalDebtPaymentModal.classList.remove('field-hidden');
    externalDebtPaymentModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeExternalDebtPaymentModalPanel() {
    resetExternalDebtPaymentEntryEditing();
    payingExternalDebtId = null;
    externalDebtPaymentModalTitle.textContent = 'Registrar abono';
    submitExternalDebtPaymentButton.textContent = 'Registrar abono';
    submitExternalDebtPaymentButton.style.display = 'inline-flex';
    [externalDebtPaymentAccountInput, externalDebtPaymentDateInput, externalDebtPaymentAmountInput, externalDebtPaymentReferenceInput, externalDebtPaymentNoteInput].forEach(input => {
      input.disabled = false;
    });
    externalDebtPaymentSummary.textContent = 'Aplica un abono por efectivo o bancos y consulta el estado de cuenta.';
    externalDebtPaymentHistory.innerHTML = '';
    externalDebtPaymentModal.classList.add('field-hidden');
    externalDebtPaymentModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function renderExternalDebtTable(container, debts, emptyMessage) {
    if (!container) {
      return;
    }
    if (!debts.length) {
      container.innerHTML = `<p class="history-empty">${escapeHtml(emptyMessage)}</p>`;
      return;
    }

    container.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tercero</th>
            <th>Concepto</th>
            <th>Vencimiento</th>
            <th>Estado</th>
            <th>Monto</th>
            <th>Abonado</th>
            <th>Saldo</th>
            <th>Referencia</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${debts.map(debt => {
            const status = getExternalDebtStatus(debt);
            const lastPayment = getLastRecordPayment(debt, getExternalDebtOriginalAmount(debt));
            const actionLabel = getExternalDebtBalanceDue(debt) > 0.0001 ? 'Registrar abono' : 'Estado de cuenta';
            return `
              <tr>
                <td>${formatDate(debt.fecha)}</td>
                <td>${escapeHtml(debt.tercero || '')}</td>
                <td>${escapeHtml(debt.concepto || '')}</td>
                <td>${debt.dueDate ? formatDate(debt.dueDate) : 'Sin fecha'}</td>
                <td><span class="status-chip ${status.key}">${escapeHtml(status.label)}</span></td>
                <td>${formatCurrency(getExternalDebtOriginalAmount(debt))}</td>
                <td>${formatCurrency(getExternalDebtPaidAmount(debt))}</td>
                <td>${formatCurrency(getExternalDebtBalanceDue(debt))}</td>
                <td>${buildReceiptReferenceMarkup(lastPayment?.receiptNumber || lastPayment?.paymentReference, 'external-debt-receipt', debt.id)}</td>
                <td>
                  <div class="purchase-row-actions">
                    <button type="button" class="secondary-btn action-icon-btn" data-external-debt-edit="${escapeHtml(String(debt.id || ''))}" title="Editar registro">${getActionIcon('Editar')}</button>
                    <button type="button" class="secondary-btn action-icon-btn payables-apply-btn" data-external-debt-pay="${escapeHtml(String(debt.id || ''))}" title="${escapeHtml(actionLabel)}">${getActionIcon(actionLabel)}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('[data-external-debt-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const debt = state.externalDebts.find(item => String(item.id) === String(button.dataset.externalDebtReceipt));
        if (!debt) {
          return;
        }
        const lastPayment = getLastRecordPayment(debt, getExternalDebtOriginalAmount(debt));
        if (!lastPayment) {
          return;
        }
        printExternalDebtReceipt(debt, lastPayment);
      });
    });

    container.querySelectorAll('[data-external-debt-edit]').forEach(button => {
      button.addEventListener('click', () => startEditExternalDebt(button.dataset.externalDebtEdit));
    });

    container.querySelectorAll('[data-external-debt-pay]').forEach(button => {
      button.addEventListener('click', () => openExternalDebtPaymentModalPanel(button.dataset.externalDebtPay));
    });
  }

  function renderExternalDebtsPanel() {
    const debts = Array.isArray(state.externalDebts) ? state.externalDebts.slice() : [];
    const payables = debts.filter(debt => String(debt.type || '').trim().toLowerCase() !== 'por-cobrar');
    const receivables = debts.filter(debt => String(debt.type || '').trim().toLowerCase() === 'por-cobrar');
    if (externalPayablesBalance) {
      externalPayablesBalance.textContent = formatCurrency(payables.reduce((sum, debt) => sum + getExternalDebtBalanceDue(debt), 0));
    }
    if (externalReceivablesBalance) {
      externalReceivablesBalance.textContent = formatCurrency(receivables.reduce((sum, debt) => sum + getExternalDebtBalanceDue(debt), 0));
    }
    if (externalDebtsOverdue) {
      externalDebtsOverdue.textContent = String(debts.filter(debt => getExternalDebtStatus(debt).key === 'overdue').length);
    }
    renderExternalDebtTable(externalPayablesRecords, payables, 'No hay deudas externas por pagar registradas.');
    renderExternalDebtTable(externalReceivablesRecords, receivables, 'No hay deudas externas por cobrar registradas.');
  }

  function getPaymentMethodLabel(method) {
    switch (String(method || '').trim().toLowerCase()) {
      case 'efectivo':
        return 'Efectivo';
      case 'transferencia':
        return 'Transferencia';
      case 'tarjeta-credito':
        return 'Tarjeta de credito';
      default:
        return String(method || 'N/A') || 'N/A';
    }
  }

  function isPendingCardPayment(payment) {
    return String(payment?.paymentMethod || '') === 'tarjeta-credito' && !payment?.reimbursedAt;
  }

  function getPaymentStatusLabel(payment) {
    const status = String(payment?.status || '').trim().toLowerCase();
    if (status === 'reembolsado') return 'Reembolsado';
    if (status === 'pendiente-reembolso') return 'Pendiente';
    return 'Registrado';
  }

  function getPaymentStatusClass(payment) {
    const status = String(payment?.status || '').trim().toLowerCase();
    if (status === 'reembolsado') return 'success';
    if (status === 'pendiente-reembolso') return 'pending';
    return 'success';
  }

  function updatePaymentMethodSection() {
    if (!paymentMethodInput) {
      return;
    }
    const method = String(paymentMethodInput.value || '').trim().toLowerCase();
    const requiresReference = method === 'transferencia';
    paymentReferenceField.classList.toggle('field-hidden', !requiresReference);
    if (!requiresReference) {
      paymentReferenceInput.value = '';
    }
    if (paymentMethodSummary) {
      paymentMethodSummary.textContent = method === 'tarjeta-credito'
        ? 'Los pagos con tarjeta quedan pendientes hasta registrar el reembolso por transferencia.'
        : method === 'transferencia'
          ? 'Las salidas por transferencia requieren su referencia bancaria.'
          : 'Las salidas en efectivo se registran como pago inmediato y generan un numero automatico de recibo.';
    }
  }

  function renderPaymentCategoryOptions() {
    const categoryOptions = state.paymentCategories.slice().sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
    if (paymentCategoryInput) {
      const currentValue = paymentCategoryInput.value;
      paymentCategoryInput.innerHTML = categoryOptions.length
        ? `<option value="">Selecciona una clasificacion</option>${categoryOptions.map(category => `<option value="${escapeHtml(String(category.id))}">${escapeHtml(category.nombre)}</option>`).join('')}`
        : '<option value="">Crea primero una clasificacion</option>';
      paymentCategoryInput.value = categoryOptions.some(category => String(category.id) === String(currentValue)) ? currentValue : '';
    }

    if (paymentFilterCategoryInput) {
      const currentFilter = paymentFilterCategoryInput.value;
      paymentFilterCategoryInput.innerHTML = `<option value="all">Todas</option>${categoryOptions.map(category => `<option value="${escapeHtml(String(category.id))}">${escapeHtml(category.nombre)}</option>`).join('')}`;
      paymentFilterCategoryInput.value = categoryOptions.some(category => String(category.id) === String(currentFilter)) ? currentFilter : 'all';
    }
  }

  function renderPaymentInfo() {
    if (!paymentInfo) {
      return;
    }
    const totalPayments = state.payments.length;
    const immediateOutflow = state.payments.reduce((sum, payment) => {
      if (String(payment.paymentMethod || '') === 'tarjeta-credito' && !payment.reimbursedAt) {
        return sum;
      }
      return sum + Number(payment.monto || 0);
    }, 0);
    const pendingReimbursements = state.payments.reduce((sum, payment) => sum + (isPendingCardPayment(payment) ? Number(payment.monto || 0) : 0), 0);
    paymentInfo.textContent = totalPayments
      ? `${totalPayments} pago(s) registrados · salida efectiva ${formatCurrency(immediateOutflow)} · pendiente por tarjeta ${formatCurrency(pendingReimbursements)}.`
      : 'Aun no hay pagos registrados.';
  }

  function getFilteredPayments() {
    const descriptionFilter = String(paymentFilterDescriptionInput?.value || '').trim().toLowerCase();
    const categoryFilter = String(paymentFilterCategoryInput?.value || 'all');
    const methodFilter = String(paymentFilterMethodInput?.value || 'all');
    const statusFilter = String(paymentFilterStatusInput?.value || 'all');
    return state.payments.filter(payment => {
      const matchesDescription = descriptionFilter
        ? `${String(payment.descripcion || '')} ${String(payment.beneficiario || '')} ${String(payment.observacion || '')}`.toLowerCase().includes(descriptionFilter)
        : true;
      const matchesCategory = categoryFilter === 'all' ? true : String(payment.categoriaId || '') === categoryFilter;
      const matchesMethod = methodFilter === 'all' ? true : String(payment.paymentMethod || '') === methodFilter;
      const normalizedStatus = String(payment.status || '').trim().toLowerCase() || 'registrado';
      const matchesStatus = statusFilter === 'all' ? true : normalizedStatus === statusFilter;
      return matchesDescription && matchesCategory && matchesMethod && matchesStatus;
    });
  }

  function renderPaymentRegistro() {
    if (!paymentRecords) {
      return;
    }
    const filteredPayments = getFilteredPayments();
    if (!filteredPayments.length) {
      paymentRecords.innerHTML = '<p class="history-empty">No hay pagos registrados segun los filtros actuales.</p>';
      return;
    }

    paymentRecords.innerHTML = `
      <h4>Historial de pagos</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripcion</th>
            <th>Beneficiario</th>
            <th>Clasificacion</th>
            <th>Metodo</th>
            <th>Estado</th>
            <th>Monto</th>
            <th>Referencia</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${filteredPayments.map(payment => `
            <tr>
              <td>${formatDate(payment.fecha)}</td>
              <td>
                <strong>${escapeHtml(payment.descripcion || '')}</strong>
                ${payment.observacion ? `<div class="field-help">${escapeHtml(payment.observacion)}</div>` : ''}
              </td>
              <td>${escapeHtml(payment.beneficiario || 'N/A')}</td>
              <td>${escapeHtml(getPaymentCategoryName(payment))}</td>
              <td>${escapeHtml(getPaymentMethodLabel(payment.paymentMethod))}</td>
              <td><span class="status-chip ${getPaymentStatusClass(payment)}">${escapeHtml(getPaymentStatusLabel(payment))}</span></td>
              <td>${formatCurrency(payment.monto)}</td>
              <td>${(payment.receiptNumber || payment.reimbursementReference || payment.referencia)
                ? buildPaymentEntryReceiptMarkup({
                  receiptNumber: payment.receiptNumber,
                  paymentReference: payment.reimbursementReference || payment.referencia
                }, 'payment-receipt', payment.id)
                : 'N/A'}</td>
              <td><button type="button" class="secondary-btn action-icon-btn" data-payment-edit="${escapeHtml(String(payment.id || ''))}" title="Editar pago">${getActionIcon('Editar')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    paymentRecords.querySelectorAll('[data-payment-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const payment = state.payments.find(entry => String(entry.id) === String(button.dataset.paymentReceipt));
        if (!payment) {
          return;
        }
        setLastRegisteredPaymentForPrint(payment);
        printPaymentReceipt(payment);
      });
    });

    paymentRecords.querySelectorAll('[data-payment-edit]').forEach(button => {
      button.addEventListener('click', () => startEditPayment(button.dataset.paymentEdit));
    });

    syncDynamicTableExport(paymentRecords, {
      title: 'Historial de pagos',
      fileBase: 'historial-pagos',
      sheetName: 'Historial Pagos'
    });
  }

  function renderPendingPayments() {
    if (!paymentPendingRecords) {
      return;
    }
    const pendingPayments = state.payments.filter(isPendingCardPayment);
    const pendingIdSet = new Set(pendingPayments.map(payment => String(payment.id)));
    selectedPendingPaymentIds = selectedPendingPaymentIds.filter(id => pendingIdSet.has(String(id)));
    if (!pendingPayments.length) {
      if (openPaymentReimbursementBatchButton) {
        openPaymentReimbursementBatchButton.disabled = true;
        openPaymentReimbursementBatchButton.textContent = 'Registrar transferencia seleccionada';
      }
      paymentPendingRecords.innerHTML = '<p class="history-empty">No hay pagos con tarjeta pendientes de reembolso.</p>';
      return;
    }

    const selectedCount = selectedPendingPaymentIds.length;
    const selectedTotal = pendingPayments.reduce((sum, payment) => selectedPendingPaymentIds.includes(String(payment.id)) ? sum + Number(payment.monto || 0) : sum, 0);
    if (openPaymentReimbursementBatchButton) {
      openPaymentReimbursementBatchButton.disabled = selectedCount === 0;
      openPaymentReimbursementBatchButton.textContent = selectedCount
        ? `Registrar transferencia (${selectedCount}) · ${formatCurrency(selectedTotal)}`
        : 'Registrar transferencia seleccionada';
    }

    paymentPendingRecords.innerHTML = `
      <h4>Pendientes de reembolso</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>
              <input type="checkbox" id="payment-pending-select-all" ${selectedCount === pendingPayments.length ? 'checked' : ''} aria-label="Seleccionar todos los pagos pendientes" />
            </th>
            <th>Fecha</th>
            <th>Descripcion</th>
            <th>Beneficiario</th>
            <th>Clasificacion</th>
            <th>Monto</th>
            <th>Referencia tarjeta</th>
          </tr>
        </thead>
        <tbody>
          ${pendingPayments.map(payment => `
            <tr>
              <td><input type="checkbox" data-payment-pending-select="${escapeHtml(String(payment.id))}" ${selectedPendingPaymentIds.includes(String(payment.id)) ? 'checked' : ''} aria-label="Seleccionar pago ${escapeHtml(payment.descripcion || '')}" /></td>
              <td>${formatDate(payment.fecha)}</td>
              <td><strong>${escapeHtml(payment.descripcion || '')}</strong></td>
              <td>${escapeHtml(payment.beneficiario || 'N/A')}</td>
              <td>${escapeHtml(getPaymentCategoryName(payment))}</td>
              <td>${formatCurrency(payment.monto)}</td>
              <td>${escapeHtml(payment.referencia || 'N/A')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(paymentPendingRecords, {
      title: 'Pagos pendientes de reembolso',
      fileBase: 'pagos-pendientes-reembolso',
      sheetName: 'Pagos Pendientes'
    });

    const selectAllCheckbox = paymentPendingRecords.querySelector('#payment-pending-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', event => {
        selectedPendingPaymentIds = event.target.checked ? pendingPayments.map(payment => String(payment.id)) : [];
        renderPendingPayments();
      });
    }

    paymentPendingRecords.querySelectorAll('[data-payment-pending-select]').forEach(checkbox => {
      checkbox.addEventListener('change', event => {
        const paymentId = String(event.target.dataset.paymentPendingSelect || '');
        if (!paymentId) {
          return;
        }
        if (event.target.checked) {
          if (!selectedPendingPaymentIds.includes(paymentId)) {
            selectedPendingPaymentIds.push(paymentId);
          }
        } else {
          selectedPendingPaymentIds = selectedPendingPaymentIds.filter(id => id !== paymentId);
        }
        renderPendingPayments();
      });
    });
  }

  function resetPaymentCategoryForm() {
    editingPaymentCategoryId = null;
    if (paymentCategoryForm) {
      paymentCategoryForm.reset();
    }
    if (paymentCategorySubmitButton) {
      paymentCategorySubmitButton.textContent = 'Guardar clasificacion';
    }
    if (context.cancelPaymentCategoryEditButton) {
      context.cancelPaymentCategoryEditButton.style.display = 'none';
    }
  }

  function renderPaymentCategoryList() {
    if (!paymentCategoryList) {
      return;
    }
    const categories = state.paymentCategories.slice().sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
    if (!categories.length) {
      paymentCategoryList.innerHTML = '<p class="history-empty">Aun no hay clasificaciones para pagos.</p>';
      return;
    }

    paymentCategoryList.innerHTML = `
      <h4>Clasificaciones disponibles</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripcion</th>
            <th>Usos</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${categories.map(category => {
            const usageCount = state.payments.filter(payment => String(payment.categoriaId || '') === String(category.id)).length;
            return `
              <tr>
                <td>${escapeHtml(category.nombre || '')}</td>
                <td>${escapeHtml(category.descripcion || 'Sin descripcion')}</td>
                <td>${usageCount}</td>
                <td>
                  <div class="purchase-row-actions">
                    <button type="button" class="secondary-btn action-icon-btn" data-payment-category-edit="${escapeHtml(String(category.id))}" title="Editar clasificacion">${getActionIcon('Editar')}</button>
                    <button type="button" class="delete-product action-icon-btn" data-payment-category-delete="${escapeHtml(String(category.id))}" title="Eliminar clasificacion">${getActionIcon('Eliminar')}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(paymentCategoryList, {
      title: 'Clasificaciones de pagos',
      fileBase: 'clasificaciones-pagos',
      sheetName: 'Clasificaciones Pagos'
    });

    paymentCategoryList.querySelectorAll('[data-payment-category-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const category = getPaymentCategoryById(button.dataset.paymentCategoryEdit);
        if (!category) {
          return;
        }
        editingPaymentCategoryId = String(category.id);
        paymentCategoryNameInput.value = category.nombre || '';
        paymentCategoryDescriptionInput.value = category.descripcion || '';
        paymentCategorySubmitButton.textContent = 'Actualizar clasificacion';
        if (context.cancelPaymentCategoryEditButton) {
          context.cancelPaymentCategoryEditButton.style.display = 'inline-flex';
        }
        paymentCategoryStatus.textContent = `Editando clasificacion: ${category.nombre}.`;
      });
    });

    paymentCategoryList.querySelectorAll('[data-payment-category-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          const response = await fetch(buildApiUrl(`/pagos-categorias/${encodeURIComponent(button.dataset.paymentCategoryDelete)}`), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!response.ok) {
            throw new Error(await buildApiError(response, 'No se pudo eliminar la clasificacion.'));
          }
          await fetchPaymentCategories();
          paymentCategoryStatus.textContent = 'Clasificacion eliminada correctamente.';
        } catch (error) {
          console.error(error);
          paymentCategoryStatus.textContent = error.message;
        }
      });
    });
  }

  function openPaymentReimbursementModalPanel() {
    const selectedPayments = state.payments.filter(payment => selectedPendingPaymentIds.includes(String(payment.id)) && isPendingCardPayment(payment));
    if (!selectedPayments.length) {
      paymentStatus.className = 'status error';
      paymentStatus.textContent = 'Selecciona al menos un pago pendiente antes de registrar la transferencia.';
      return;
    }
    paymentReimbursementForm.reset();
    paymentReimbursementDateInput.value = getTodayInputValue();
    const total = selectedPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
    paymentReimbursementSelectionSummary.textContent = `${selectedPayments.length} pago(s) seleccionados · total ${formatCurrency(total)}. Esta transferencia se aplicara a todos.`;
    paymentReimbursementStatus.textContent = 'Confirma la transferencia que cerro los pagos seleccionados.';
    paymentReimbursementModal.classList.remove('field-hidden');
    paymentReimbursementModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closePaymentReimbursementModalPanel() {
    paymentReimbursementForm.reset();
    paymentReimbursementSelectionSummary.textContent = 'Selecciona uno o varios pagos pendientes para registrar una sola transferencia.';
    paymentReimbursementModal.classList.add('field-hidden');
    paymentReimbursementModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  if (closeExternalDebtPaymentModalButton) {
    closeExternalDebtPaymentModalButton.addEventListener('click', closeExternalDebtPaymentModalPanel);
  }

  if (closePaymentReimbursementModalButton) {
    closePaymentReimbursementModalButton.addEventListener('click', closePaymentReimbursementModalPanel);
  }

  return {
    getEditingPaymentId,
    getEditingExternalDebtId,
    getEditingPaymentCategoryId,
    getEditingExternalDebtPaymentEntryId,
    getPayingExternalDebtId,
    getSelectedPendingPaymentIds,
    clearSelectedPendingPaymentIds,
    resetPaymentFormEditing,
    resetExternalDebtFormEditing,
    updatePaymentMethodSection,
    getPaymentCategoryName,
    isExpensePayment,
    getNormalizedFundSettings,
    getFundMovementModuleLabel,
    buildFundMovements,
    renderFundsModule,
    setExternalDebtStatus,
    setExternalDebtPaymentStatus,
    openExternalDebtPaymentModalPanel,
    closeExternalDebtPaymentModalPanel,
    renderPaymentCategoryOptions,
    renderPaymentCategoryList,
    renderPaymentInfo,
    renderPaymentRegistro,
    renderPendingPayments,
    resetPaymentCategoryForm,
    openPaymentReimbursementModalPanel,
    closePaymentReimbursementModalPanel,
    isPendingCardPayment,
  };
}
