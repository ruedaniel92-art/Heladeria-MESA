export function createDashboardModule(context) {
  const {
    state,
    dashboardIncomeStatementMonthInput,
    getCurrentMonthInputValue,
    isExpensePayment,
    getPaymentCategoryName,
    getExternalDebtOriginalAmount,
    calculateSaleInvoiceTotal,
    calculateSaleAddonsTotal,
    calculateSaleComponentsTotal,
    calculateInvoiceTotal,
    formatDate,
    dashboardCashflowFilterModeInput,
    dashboardCashflowDateStartInput,
    dashboardCashflowDateEndInput,
    dashboardCashflowFilterMonthInput,
    dashboardCashflowMonthField,
    dashboardCashflowDateStartField,
    dashboardCashflowDateEndField,
    buildFundMovements,
    getNormalizedFundSettings,
    formatCurrency,
    getFundMovementModuleLabel,
    escapeHtml,
    dashboardSummaryText,
    isCreditSale,
    isPaidCreditSale,
    isCreditPurchase,
    isPaidCreditPurchase,
    getSaleAccountStatus,
    getPurchaseAccountStatus,
    getSaleBalanceDue,
    getPurchaseBalanceDue,
    dashboardCashFlowSummary,
    dashboardIncomeStatementSummary,
    dashboardLastUpdated,
    dashboardSalesToday,
    dashboardSalesTodayMeta,
    dashboardSalesMonth,
    dashboardSalesMonthMeta,
    dashboardPurchasesMonth,
    dashboardPurchasesMonthMeta,
    dashboardProfitCard,
    dashboardProfitLabel,
    dashboardProfitMonth,
    dashboardProfitMonthMeta,
    dashboardInventoryValue,
    dashboardInventoryMeta,
    dashboardReceivablesTotal,
    dashboardReceivablesMeta,
    dashboardPayablesTotal,
    dashboardPayablesMeta,
    dashboardLowStockCount,
    dashboardLowStockMeta,
    dashboardActiveBuckets,
    dashboardActiveToppings,
    dashboardActiveSauces,
    dashboardSalesComparison,
    dashboardCashFlowGrid,
    dashboardIncomeStatementGrid,
    dashboardTopProducts,
    dashboardControlDetails,
    dashboardStockAlerts,
    renderInventoryModeLabel,
    formatInventoryQuantity,
    getEffectivePaymentOutflowDate,
    buildInventoryKardexMovements,
    getProductInventoryMode,
  } = context;

  function isSameCalendarDay(leftDate, rightDate) {
    return leftDate.getFullYear() === rightDate.getFullYear()
      && leftDate.getMonth() === rightDate.getMonth()
      && leftDate.getDate() === rightDate.getDate();
  }
  
  function buildDashboardTopProducts() {
    const productMap = new Map();
    state.sales.forEach(venta => {
      const items = Array.isArray(venta.items) ? venta.items : [];
      items.forEach(item => {
        const key = String(item.id || item.nombre || '').trim();
        if (!key) return;
        const current = productMap.get(key) || {
          name: item.nombre || 'Producto',
          quantity: 0,
          amount: 0
        };
        current.quantity += Number(item.cantidad || 0);
        current.amount += Number(item.cantidad || 0) * Number(item.precio || 0)
          + calculateSaleAddonsTotal(item.adicionales)
          + calculateSaleComponentsTotal(item.componentes, item.cantidad);
        productMap.set(key, current);
      });
    });
  
    return Array.from(productMap.values())
      .sort((left, right) => {
        if (right.quantity !== left.quantity) {
          return right.quantity - left.quantity;
        }
        return right.amount - left.amount;
      })
      .slice(0, 5);
  }
  
  function buildDashboardLowStockProducts() {
    return state.productos
      .map(producto => ({
        producto,
        minimum: Number(producto.stockMin ?? producto.stockMinimo ?? 0),
        current: Number(producto.stock || 0)
      }))
      .filter(entry => entry.minimum > 0 && entry.current <= entry.minimum)
      .sort((left, right) => {
        const leftGap = left.current - left.minimum;
        const rightGap = right.current - right.minimum;
        if (leftGap !== rightGap) {
          return leftGap - rightGap;
        }
        return String(left.producto.nombre || '').localeCompare(String(right.producto.nombre || ''), 'es', { sensitivity: 'base' });
      })
      .slice(0, 5);
  }
  
  function buildDashboardFinancialSnapshot(referenceDate = new Date()) {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const nextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    const saleMovementTypes = new Set(['Venta', 'Venta receta', 'Venta sabor', 'Adicional']);
    const snapshot = {
      inventoryCostValue: 0,
      inventoryExpectedSalesValue: 0,
      inventoryExpectedProfit: 0,
      stockedProducts: 0,
      monthCosts: 0,
      monthExpensePayments: 0
    };
  
    state.productos.forEach(producto => {
      const movements = buildInventoryKardexMovements(producto.id);
      const lastMovement = movements.length ? movements[movements.length - 1] : null;
      const balance = Number(lastMovement?.balance || 0);
      const balanceValue = Number(lastMovement?.balanceValue || 0);
      const salePrice = Number(producto?.precio || 0);
  
      snapshot.inventoryCostValue += balanceValue;
      if (balance > 0.0001) {
        snapshot.stockedProducts += 1;
      }
  
      if (balance > 0 && salePrice > 0 && getProductInventoryMode(producto) !== 'materia-prima') {
        const expectedSalesValue = balance * salePrice;
        snapshot.inventoryExpectedSalesValue += expectedSalesValue;
        snapshot.inventoryExpectedProfit += expectedSalesValue - balanceValue;
      }
  
      movements.forEach(movement => {
        if (!saleMovementTypes.has(String(movement.type || ''))) {
          return;
        }
        if (!movement.date) {
          return;
        }
        const movementDate = new Date(movement.date);
        if (Number.isNaN(movementDate.getTime())) {
          return;
        }
        if (movementDate >= monthStart && movementDate < nextMonthStart) {
          snapshot.monthCosts += Number(movement.totalCost || 0);
        }
      });
    });
  
    state.payments.forEach(payment => {
      if (!isExpensePayment(payment)) {
        return;
      }
      const outflowDate = getEffectivePaymentOutflowDate(payment);
      if (!outflowDate || Number.isNaN(outflowDate.getTime())) {
        return;
      }
      if (outflowDate >= monthStart && outflowDate < nextMonthStart) {
        snapshot.monthExpensePayments += Number(payment.monto || 0);
      }
    });
  
    return snapshot;
  }
  
  function buildDashboardSalesComparison(referenceDate = new Date()) {
    const months = [];
    for (let offset = 2; offset >= 0; offset -= 1) {
      const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
      const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const monthlySales = state.sales.filter(venta => {
        if (!venta.fecha) return false;
        const saleDate = new Date(venta.fecha);
        if (Number.isNaN(saleDate.getTime())) return false;
        return saleDate >= monthDate && saleDate < nextMonthDate;
      });
      const total = monthlySales.reduce((sum, venta) => sum + calculateSaleInvoiceTotal(venta), 0);
      months.push({
        key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
        label: monthDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
        invoices: monthlySales.length,
        total
      });
    }
  
    return months.map((month, index) => {
      const previous = index > 0 ? months[index - 1] : null;
      let trend = 'neutral';
      let trendLabel = 'Sin base';
      if (previous) {
        const delta = month.total - previous.total;
        if (previous.total > 0) {
          const percentage = (delta / previous.total) * 100;
          trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
          trendLabel = `${delta > 0 ? '+' : ''}${percentage.toFixed(1)}% vs mes anterior`;
        } else if (month.total > 0) {
          trend = 'up';
          trendLabel = 'Nuevo movimiento';
        }
      }
  
      return {
        ...month,
        trend,
        trendLabel
      };
    });
  }
  
  function getDashboardIncomeStatementReferenceMonth() {
    const monthValue = String(dashboardIncomeStatementMonthInput?.value || getCurrentMonthInputValue()).trim();
    const [yearText, monthText] = monthValue.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    if (Number.isInteger(year) && Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  
  function isDateWithinMonthRange(value, monthStart, nextMonthStart) {
    if (!value) {
      return false;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date >= monthStart && date < nextMonthStart;
  }
  
  function buildDashboardIncomeStatementMonth(monthDate) {
    // Declarar los límites del mes antes de usarlos
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const nextMonthStart = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    // Desglose de gastos: pagos y deudas externas
    const detalleGastosPagos = state.payments.filter(payment => isExpensePayment(payment) && isDateWithinMonthRange(payment.fecha || payment.createdAt, monthStart, nextMonthStart))
      .map(payment => ({
        fecha: payment.fecha || payment.createdAt,
        descripcion: payment.descripcion || payment.concepto || payment.nota || '',
        categoria: getPaymentCategoryName(payment),
        monto: Number(payment.monto || 0)
      }));
    const detalleGastosDeudas = state.externalDebts.filter(debt => String(debt?.type || '').trim().toLowerCase() === 'por-pagar' && (debt.categoria || debt.category || '').toLowerCase() === 'gasto' && isDateWithinMonthRange(debt.fecha || debt.createdAt, monthStart, nextMonthStart))
      .map(debt => ({
        fecha: debt.fecha,
        descripcion: debt.concepto || debt.nota || '',
        categoria: (debt.categoria || debt.category || 'gasto'),
        monto: getExternalDebtOriginalAmount(debt),
        tercero: debt.tercero || ''
      }));
    const ingresos = state.sales.reduce((sum, venta) => {
      return isDateWithinMonthRange(venta.fecha, monthStart, nextMonthStart)
        ? sum + calculateSaleInvoiceTotal(venta)
        : sum;
    }, 0);
    const costos = state.inventoryMovements.reduce((sum, movement) => {
      return String(movement?.tipo || '').trim().toLowerCase() === 'salida'
        && isDateWithinMonthRange(movement.fecha || movement.createdAt, monthStart, nextMonthStart)
        ? sum + Number(movement.costoTotal || 0)
        : sum;
    }, 0);
    // Solo pagos con categoría 'gasto'
    const gastosPagos = state.payments.reduce((sum, payment) => {
      return isExpensePayment(payment) && isDateWithinMonthRange(payment.fecha || payment.createdAt, monthStart, nextMonthStart)
        ? sum + Number(payment.monto || 0)
        : sum;
    }, 0);
    // Solo deudas externas 'por pagar' con categoría 'gasto'
    const gastosDeudasExternas = state.externalDebts.reduce((sum, debt) => {
      const debtType = String(debt?.type || '').trim().toLowerCase();
      const debtCategory = (debt.categoria || debt.category || '').toLowerCase();
      return debtType === 'por-pagar' && debtCategory === 'gasto' && isDateWithinMonthRange(debt.fecha || debt.createdAt, monthStart, nextMonthStart)
        ? sum + getExternalDebtOriginalAmount(debt)
        : sum;
    }, 0);
    const gastos = gastosPagos + gastosDeudasExternas;
    const utilidadBruta = ingresos - costos;
    const utilidadNeta = utilidadBruta - gastos;
  
    return {
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      label: monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      ingresos,
      costos,
      utilidadBruta,
      gastos,
      utilidadNeta,
      salesCount: state.sales.filter(venta => isDateWithinMonthRange(venta.fecha, monthStart, nextMonthStart)).length,
      costMovementsCount: state.inventoryMovements.filter(movement => String(movement?.tipo || '').trim().toLowerCase() === 'salida' && isDateWithinMonthRange(movement.fecha || movement.createdAt, monthStart, nextMonthStart)).length,
      expenseCount:
        state.payments.filter(payment => isExpensePayment(payment) && isDateWithinMonthRange(payment.fecha || payment.createdAt, monthStart, nextMonthStart)).length
        + state.externalDebts.filter(debt => String(debt?.type || '').trim().toLowerCase() === 'por-pagar' && (debt.categoria || debt.category || '').toLowerCase() === 'gasto' && isDateWithinMonthRange(debt.fecha || debt.createdAt, monthStart, nextMonthStart)).length,
      detalleGastosPagos,
      detalleGastosDeudas
    };
  }
  
  function buildDashboardIncomeStatement(referenceMonth = getDashboardIncomeStatementReferenceMonth()) {
    const months = [];
    for (let offset = 0; offset < 4; offset += 1) {
      months.push(buildDashboardIncomeStatementMonth(new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() - offset, 1)));
    }
    return months;
  }
  
  function getDashboardCashflowFilter() {
    const mode = dashboardCashflowFilterModeInput?.value === 'range' ? 'range' : 'month';
    if (mode === 'range') {
      const startDate = dashboardCashflowDateStartInput?.value ? new Date(dashboardCashflowDateStartInput.value) : null;
      const endDate = dashboardCashflowDateEndInput?.value ? new Date(dashboardCashflowDateEndInput.value) : null;
      if (startDate && !Number.isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
      }
      if (endDate && !Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
      }
      return {
        mode,
        startDate,
        endDate,
        label: startDate && endDate
          ? `${formatDate(startDate.toISOString())} al ${formatDate(endDate.toISOString())}`
          : 'Rango personalizado'
      };
    }
  
    const monthValue = String(dashboardCashflowFilterMonthInput?.value || getCurrentMonthInputValue()).trim();
    let year = NaN, monthIndex = NaN;
    if (monthValue && monthValue.includes('-')) {
      const [yearText, monthText] = monthValue.split('-');
      year = Number(yearText);
      monthIndex = Number(monthText) - 1;
    }
    let monthStart;
    if (Number.isInteger(year) && !Number.isNaN(monthIndex) && monthIndex >= 0 && monthIndex < 12) {
      monthStart = new Date(year, monthIndex, 1);
    } else {
      const now = new Date();
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    return {
      mode,
      startDate: monthStart,
      endDate: new Date(nextMonthStart.getTime() - 1),
      nextDate: nextMonthStart,
      label: monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    };
  }
  
  function updateDashboardCashflowFilterVisibility() {
    const useRange = dashboardCashflowFilterModeInput?.value === 'range';
    if (dashboardCashflowMonthField) {
      dashboardCashflowMonthField.classList.toggle('field-hidden', useRange);
    }
    if (dashboardCashflowDateStartField) {
      dashboardCashflowDateStartField.classList.toggle('field-hidden', !useRange);
    }
    if (dashboardCashflowDateEndField) {
      dashboardCashflowDateEndField.classList.toggle('field-hidden', !useRange);
    }
  }
  
  function buildDashboardCashFlowSnapshot(referenceDate = new Date(), filter = getDashboardCashflowFilter()) {
    const fallbackMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const fallbackNextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    const rangeStart = filter?.startDate && !Number.isNaN(filter.startDate.getTime()) ? filter.startDate : fallbackMonthStart;
    const exclusiveRangeEnd = filter?.mode === 'month'
      ? (filter?.nextDate && !Number.isNaN(filter.nextDate.getTime()) ? filter.nextDate : fallbackNextMonthStart)
      : null;
    const inclusiveRangeEnd = filter?.mode === 'range' && filter?.endDate && !Number.isNaN(filter.endDate.getTime())
      ? filter.endDate
      : new Date((exclusiveRangeEnd || fallbackNextMonthStart).getTime() - 1);
    const fundMovements = buildFundMovements();
    const fundSettings = getNormalizedFundSettings();
    const summaries = {
      efectivo: {
        key: 'efectivo',
        title: 'Efectivo',
        balance: 0,
        monthEntries: 0,
        monthExits: 0,
        monthNet: 0,
        note: '',
        exitDetails: [],
        exitGroups: []
      },
      banco: {
        key: 'banco',
        title: 'Bancos',
        balance: 0,
        monthEntries: 0,
        monthExits: 0,
        monthNet: 0,
        note: '',
        exitDetails: [],
        exitGroups: []
      }
    };
  
    fundMovements.forEach(movement => {
      const account = String(movement.account || '').trim().toLowerCase();
      if (!summaries[account]) {
        return;
      }
  
      summaries[account].balance = Number(movement.runningBalance || 0);
      if (String(movement.module || '').trim().toLowerCase() === 'configuracion') {
        return;
      }
  
      const movementDate = new Date(movement.date || 0);
      const isOutsideRange = filter?.mode === 'range'
        ? Number.isNaN(movementDate.getTime()) || movementDate < rangeStart || movementDate > inclusiveRangeEnd
        : Number.isNaN(movementDate.getTime()) || movementDate < rangeStart || movementDate >= (exclusiveRangeEnd || fallbackNextMonthStart);
      if (isOutsideRange) {
        return;
      }
  
      if (movement.direction === 'entrada') {
        summaries[account].monthEntries += Number(movement.amount || 0);
      } else {
        summaries[account].monthExits += Number(movement.amount || 0);
        summaries[account].exitDetails.push({
          id: String(movement.id || ''),
          date: movement.date,
          title: movement.title || 'Salida',
          detail: movement.detail || getFundMovementModuleLabel(movement.module),
          module: movement.module,
          amount: Number(movement.amount || 0)
        });
      }
    });
  
    summaries.efectivo.monthNet = summaries.efectivo.monthEntries - summaries.efectivo.monthExits;
    summaries.banco.monthNet = summaries.banco.monthEntries - summaries.banco.monthExits;
  
    const cashAvailable = Math.max(summaries.efectivo.balance - fundSettings.minimumCashReserve, 0);
    const cashDeficit = Math.max(fundSettings.minimumCashReserve - summaries.efectivo.balance, 0);
    summaries.efectivo.note = cashDeficit > 0
      ? `Faltan ${formatCurrency(cashDeficit)} para cubrir el fondo mínimo.`
      : `Disponible sobre mínimo: ${formatCurrency(cashAvailable)}.`;
    summaries.banco.note = `Saldo inicial bancos: ${formatCurrency(fundSettings.openingBankBalance)}.`;
  
    const combined = {
      key: 'combined',
      title: 'Ambos',
      balance: summaries.efectivo.balance + summaries.banco.balance,
      monthEntries: summaries.efectivo.monthEntries + summaries.banco.monthEntries,
      monthExits: summaries.efectivo.monthExits + summaries.banco.monthExits,
      monthNet: summaries.efectivo.monthNet + summaries.banco.monthNet,
      note: `Fondo mínimo de caja: ${formatCurrency(fundSettings.minimumCashReserve)}.`,
      exitDetails: [...summaries.efectivo.exitDetails, ...summaries.banco.exitDetails],
      exitGroups: []
    };
  
    summaries.efectivo.exitDetails.sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
    summaries.banco.exitDetails.sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
    combined.exitDetails.sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
  
    [summaries.efectivo, summaries.banco, combined].forEach(summary => {
      const grouped = summary.exitDetails.reduce((accumulator, detail) => {
        const label = getDashboardCashFlowExitGroup(detail);
        const existing = accumulator.get(label) || {
          label,
          amount: 0,
          count: 0,
          modules: new Set()
        };
        existing.amount += Number(detail.amount || 0);
        existing.count += 1;
        existing.modules.add(getFundMovementModuleLabel(detail.module));
        accumulator.set(label, existing);
        return accumulator;
      }, new Map());
  
      summary.exitGroups = Array.from(grouped.values())
        .map(group => ({
          label: group.label,
          amount: group.amount,
          meta: `${group.count} movimiento(s) · ${Array.from(group.modules).join(', ')}`
        }))
        .sort((left, right) => right.amount - left.amount);
    });
  
    return [summaries.efectivo, summaries.banco, combined];
  }
  
  function renderDashboardList(container, items, renderItem, emptyMessage) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<p class="dashboard-empty">${escapeHtml(emptyMessage)}</p>`;
      return;
    }
    container.innerHTML = items.map(renderItem).join('');
  }
  
  function renderDashboardTopProductsChart(container, items) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<p class="dashboard-empty">Todavía no hay ventas suficientes para mostrar productos destacados.</p>';
      return;
    }
  
    const maxQuantity = items.reduce((maxValue, item) => Math.max(maxValue, Number(item.quantity || 0)), 0);
    container.innerHTML = `
      <div class="dashboard-bar-chart">
        ${items.map(item => {
          const quantity = Number(item.quantity || 0);
          const fillWidth = maxQuantity > 0 ? Math.max(8, (quantity / maxQuantity) * 100) : 0;
          return `
            <div class="dashboard-bar-row">
              <div class="dashboard-bar-main">
                <div class="dashboard-bar-header">
                  <div class="dashboard-bar-title">${escapeHtml(item.name)}</div>
                  <div class="dashboard-bar-quantity">${escapeHtml(String(quantity))} unidad(es)</div>
                </div>
                <div class="dashboard-bar-track">
                  <div class="dashboard-bar-fill" style="width: ${fillWidth}%;"></div>
                </div>
              </div>
              <div class="dashboard-bar-side">
                ${escapeHtml(formatCurrency(item.amount))}
                <span>vendido</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  function renderDashboardSalesComparison(container, items) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<p class="dashboard-empty">Todavía no hay ventas para comparar.</p>';
      return;
    }
  
    const maxTotal = items.reduce((maxValue, item) => Math.max(maxValue, Number(item.total || 0)), 0);
    container.innerHTML = items.map(item => {
      const total = Number(item.total || 0);
      const fillWidth = maxTotal > 0 ? Math.max(8, (total / maxTotal) * 100) : 0;
      const trendClass = item.trend === 'up' ? 'up' : item.trend === 'down' ? 'down' : '';
      return `
        <div class="dashboard-sales-month-card">
          <div class="dashboard-sales-month-top">
            <div>
              <div class="dashboard-sales-month-name">${escapeHtml(item.label)}</div>
              <div class="dashboard-sales-month-meta">${escapeHtml(String(item.invoices))} factura(s)</div>
            </div>
            <div class="dashboard-sales-month-total">${escapeHtml(formatCurrency(total))}</div>
          </div>
          <div class="dashboard-sales-month-track">
            <div class="dashboard-sales-month-fill" style="width: ${fillWidth}%;"></div>
          </div>
          <div class="dashboard-sales-month-footer">
            <span>Ventas del mes</span>
            <span class="dashboard-trend-chip ${trendClass}">${escapeHtml(item.trendLabel)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function getDashboardCashFlowExitGroup(movement) {
    const moduleName = String(movement?.module || '').trim().toLowerCase();
    if (moduleName === 'compras') {
      const providerMatch = String(movement?.detail || '').match(/Proveedor:\s*(.+)$/i);
      return providerMatch?.[1]?.trim() || 'Proveedores';
    }
    if (moduleName === 'pagos') {
      return String(movement?.title || '').trim() || 'Pagos';
    }
    if (moduleName === 'traslados') {
      return 'Traslados';
    }
    return getFundMovementModuleLabel(movement?.module);
  }
  
  function renderDashboardCashFlow(container, items) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<p class="dashboard-empty">Todavía no hay flujo suficiente para mostrar.</p>';
      return;
    }
  
    function renderExitDetails(groups) {
      if (!Array.isArray(groups) || !groups.length) {
        return '<p class="dashboard-empty">No hay salidas agrupadas en este mes.</p>';
      }
  
      return `
        <div class="dashboard-flow-detail-list">
          ${groups.map(group => `
            <div class="dashboard-flow-detail-item">
              <div class="dashboard-flow-detail-main">
                <strong>${escapeHtml(group.label)}</strong>
                <span>${escapeHtml(group.meta)}</span>
              </div>
              <div class="dashboard-flow-detail-amount">${escapeHtml(formatCurrency(group.amount))}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  
    container.innerHTML = items.map(item => `
      <article class="dashboard-card dashboard-flow-column">
        <div class="dashboard-section-header">
          <h4>${escapeHtml(item.title)}</h4>
          <span>Mes actual</span>
        </div>
        <div class="dashboard-flow-metrics">
          <div class="dashboard-flow-metric">
            <span>Saldo actual</span>
            <strong>${escapeHtml(formatCurrency(item.balance))}</strong>
          </div>
          <div class="dashboard-flow-metric">
            <span>Entradas del mes</span>
            <strong>${escapeHtml(formatCurrency(item.monthEntries))}</strong>
          </div>
          <div class="dashboard-flow-metric">
            <span>Salidas del mes</span>
            <strong>${escapeHtml(formatCurrency(item.monthExits))}</strong>
          </div>
          <div class="dashboard-flow-metric">
            <span>Neto del mes</span>
            <strong>${escapeHtml(formatCurrency(item.monthNet))}</strong>
          </div>
        </div>
        <div class="dashboard-flow-note">${escapeHtml(item.note)}</div>
        <div class="dashboard-section-header" style="margin-top: 10px; margin-bottom: 8px;">
          <h4>Detalle de salidas</h4>
          <span>${escapeHtml(formatCurrency(item.monthExits))}</span>
        </div>
        ${renderExitDetails(item.exitGroups)}
      </article>
    `).join('');
  }

  function ensureDashboardExpenseModalSupport() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!document.getElementById('dashboard-expense-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'dashboard-expense-modal-styles';
      style.textContent = `
        .dashboard-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.42);
          backdrop-filter: blur(4px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .dashboard-modal {
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
          width: min(420px, 100%);
          max-height: min(78vh, 720px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        .dashboard-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 999px;
          background: #eef2ff;
          color: #334155;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
        }
        .dashboard-modal-header {
          padding: 20px 48px 12px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .dashboard-modal-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
        }
        .dashboard-modal-subtitle {
          margin-top: 4px;
          color: #64748b;
          font-size: 0.92rem;
        }
        .dashboard-modal-list {
          padding: 8px 20px 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dashboard-modal-list-item {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: start;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .dashboard-modal-list-date {
          color: #64748b;
          font-size: 0.88rem;
          white-space: nowrap;
        }
        .dashboard-modal-list-desc {
          color: #0f172a;
          font-size: 0.95rem;
        }
        .dashboard-modal-list-amount {
          color: #dc2626;
          font-weight: 700;
          white-space: nowrap;
        }
      `;
      document.head.appendChild(style);
    }

    if (typeof window.showExpenseModal !== 'function') {
      window.showExpenseModal = function showExpenseModal(groupKey) {
        const groups = window._dashboardExpenseGroups || {};
        const entry = groups[groupKey];
        const category = entry?.category || String(groupKey || '');
        const items = Array.isArray(entry?.items)
          ? entry.items
          : Array.isArray(entry)
            ? entry
            : [];
        const total = items.reduce((sum, item) => sum + Number(item?.monto || 0), 0);

        const overlay = document.createElement('div');
        overlay.className = 'dashboard-modal-overlay';
        overlay.tabIndex = -1;

        const modal = document.createElement('div');
        modal.className = 'dashboard-modal';

        const handleEscape = event => {
          if (event.key === 'Escape') {
            close();
          }
        };

        const close = () => {
          window.removeEventListener('keydown', handleEscape);
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        };

        overlay.addEventListener('click', event => {
          if (event.target === overlay) {
            close();
          }
        });

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'dashboard-modal-close';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', 'Cerrar detalle de gastos');
        closeButton.addEventListener('click', close);

        const header = document.createElement('div');
        header.className = 'dashboard-modal-header';

        const title = document.createElement('div');
        title.className = 'dashboard-modal-title';
        title.textContent = category;

        const subtitle = document.createElement('div');
        subtitle.className = 'dashboard-modal-subtitle';
        subtitle.textContent = `Total: ${formatCurrency(total)}`;

        header.appendChild(title);
        header.appendChild(subtitle);

        const list = document.createElement('div');
        list.className = 'dashboard-modal-list';

        if (!items.length) {
          const empty = document.createElement('span');
          empty.className = 'dashboard-expense-detail-empty';
          empty.textContent = 'Sin gastos registrados';
          list.appendChild(empty);
        } else {
          items.forEach(expense => {
            const row = document.createElement('div');
            row.className = 'dashboard-modal-list-item';

            const date = document.createElement('span');
            date.className = 'dashboard-modal-list-date';
            date.textContent = formatDate(expense.fecha);

            const description = document.createElement('span');
            description.className = 'dashboard-modal-list-desc';
            const safeDescription = escapeHtml(expense.descripcion || expense.categoria || expense.tercero || '-');
            const safeThirdParty = expense.tercero
              ? ` <span style="color:#94a3b8;font-size:0.92em;">· ${escapeHtml(expense.tercero)}</span>`
              : '';
            description.innerHTML = `${safeDescription}${safeThirdParty}`;

            const amount = document.createElement('span');
            amount.className = 'dashboard-modal-list-amount';
            amount.textContent = formatCurrency(expense.monto || 0);

            row.appendChild(date);
            row.appendChild(description);
            row.appendChild(amount);
            list.appendChild(row);
          });
        }

        modal.appendChild(closeButton);
        modal.appendChild(header);
        modal.appendChild(list);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        window.addEventListener('keydown', handleEscape);
        overlay.focus();
      };
    }
  }
  
  function renderDashboardIncomeStatement(container, items) {
    if (!container) return;
    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = '<p class="dashboard-empty">Todavia no hay datos suficientes para mostrar el estado de resultados.</p>';
      return;
    }

    ensureDashboardExpenseModalSupport();

    window._dashboardExpenseGroups = {};

    container.innerHTML = items.map(item => {
      const netClass = item.utilidadNeta < 0 ? 'is-loss' : '';
      const expenses = [...(item.detalleGastosPagos || []), ...(item.detalleGastosDeudas || [])];
      const expenseGroups = expenses.reduce((groups, expense) => {
        const category = expense.categoria || 'Otros';
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(expense);
        return groups;
      }, {});
      const expenseGroupEntries = Object.entries(expenseGroups).map(([category, group], index) => {
        const groupKey = `${item.label}-${category}-${index}`;
        window._dashboardExpenseGroups[groupKey] = { category, items: group };
        return { groupKey, category, group };
      });

      return `
        <article class="dashboard-income-card ${netClass}">
          <div class="dashboard-income-header">
            <div>
              <div class="dashboard-income-title">${escapeHtml(item.label)}</div>
              <div class="dashboard-income-meta">${escapeHtml(String(item.salesCount))} venta(s) · ${escapeHtml(String(item.costMovementsCount))} salida(s) costo · ${escapeHtml(String(item.expenseCount))} gasto(s)</div>
            </div>
            <div class="dashboard-income-net">${escapeHtml(formatCurrency(item.utilidadNeta))}</div>
          </div>
          <div class="dashboard-income-rows">
            <div class="dashboard-income-row">
              <span>Ingresos</span>
              <strong>${escapeHtml(formatCurrency(item.ingresos))}</strong>
            </div>
            <div class="dashboard-income-row">
              <span>Costos</span>
              <strong>${escapeHtml(formatCurrency(item.costos))}</strong>
            </div>
            <div class="dashboard-income-row ${item.utilidadBruta < 0 ? 'is-loss' : 'is-profit'}">
              <span>Utilidad bruta</span>
              <strong>${escapeHtml(formatCurrency(item.utilidadBruta))}</strong>
            </div>
            <div class="dashboard-income-row">
              <span>Gastos</span>
              <strong style="color:#e74c3c;">${escapeHtml(formatCurrency(item.gastos))}</strong>
            </div>
            <div class="dashboard-income-row dashboard-income-row-detail">
              <span>Gastos por clasificacion</span>
              <div class="dashboard-expense-summary-list">
                ${expenses.length
                  ? expenseGroupEntries.map(({ groupKey, category, group }) => `
                    <button
                      type="button"
                      class="dashboard-expense-summary-item"
                      style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 0;background:none;border:none;outline:none;cursor:pointer;border-radius:8px;transition:background 0.2s;gap:10px;"
                      onmouseover="this.style.background='#f9eaea'"
                      onmouseout="this.style.background='transparent'"
                      onclick='window.showExpenseModal(${JSON.stringify(groupKey)})'
                    >
                      <span style="color:#e74c3c;font-weight:600;font-size:1em;">${escapeHtml(category)}</span>
                      <span style="color:#e74c3c;font-weight:bold;font-size:1.1em;min-width:100px;text-align:right;">${escapeHtml(formatCurrency(group.reduce((sum, expense) => sum + Number(expense.monto || 0), 0)))}</span>
                    </button>
                  `).join('')
                  : '<span class="dashboard-expense-detail-empty">Sin gastos registrados</span>'}
              </div>
            </div>
            <div class="dashboard-income-row ${item.utilidadNeta < 0 ? 'is-loss' : 'is-profit'}">
              <span>${item.utilidadNeta < 0 ? 'Perdida' : 'Utilidad neta'}</span>
              <strong>${escapeHtml(formatCurrency(item.utilidadNeta))}</strong>
            </div>
          </div>
          <div class="dashboard-income-footnote">Base: ventas del mes, inventoryMovements tipo salida usando costoTotal, pagos y deudas externas por pagar clasificadas como gasto. Sin recalcular costos ni PEPS.</div>
        </article>
      `;
    }).join('');
  }
  function renderDashboard() {
    if (!dashboardSummaryText) return;
  
    const now = new Date();
    const cashflowFilter = getDashboardCashflowFilter();
    const incomeStatementReferenceMonth = getDashboardIncomeStatementReferenceMonth();
    const receivables = state.sales.filter(venta => isCreditSale(venta) && !isPaidCreditSale(venta));
    const payables = state.purchases.filter(compra => isCreditPurchase(compra) && !isPaidCreditPurchase(compra));
    const todaySales = state.sales.filter(venta => venta.fecha && isSameCalendarDay(new Date(venta.fecha), now));
    const monthSales = state.sales.filter(venta => {
      if (!venta.fecha) return false;
      const saleDate = new Date(venta.fecha);
      return saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth();
    });
    const monthPurchases = state.purchases.filter(compra => {
      if (!compra.fecha) return false;
      const purchaseDate = new Date(compra.fecha);
      return purchaseDate.getFullYear() === now.getFullYear() && purchaseDate.getMonth() === now.getMonth();
    });
    const overdueDate = new Date();
    overdueDate.setHours(0, 0, 0, 0);
    const overdueReceivables = receivables.filter(venta => getSaleAccountStatus(venta).key === 'overdue');
    const overduePayables = payables.filter(compra => getPurchaseAccountStatus(compra).key === 'overdue');
    const lowStockProducts = buildDashboardLowStockProducts();
    const activeBuckets = state.bucketControls.filter(bucket => String(bucket.estado) === 'abierto');
    const activeToppings = state.toppingControls.filter(control => String(control.estado) === 'abierto');
    const activeSauces = state.sauceControls.filter(control => String(control.estado) === 'abierto');
    const salesComparison = buildDashboardSalesComparison(now);
    const cashFlowSnapshot = buildDashboardCashFlowSnapshot(now, cashflowFilter);
    const incomeStatement = buildDashboardIncomeStatement(incomeStatementReferenceMonth);
    const topProducts = buildDashboardTopProducts();
    const financialSnapshot = buildDashboardFinancialSnapshot(now);
    const totalTodaySales = todaySales.reduce((sum, venta) => sum + calculateSaleInvoiceTotal(venta), 0);
    const totalMonthSales = monthSales.reduce((sum, venta) => sum + calculateSaleInvoiceTotal(venta), 0);
    const totalMonthPurchases = monthPurchases.reduce((sum, compra) => sum + calculateInvoiceTotal(compra), 0);
    const totalMonthProfit = totalMonthSales - financialSnapshot.monthCosts - financialSnapshot.monthExpensePayments;
    const totalReceivables = receivables.reduce((sum, venta) => sum + getSaleBalanceDue(venta), 0);
    const totalPayables = payables.reduce((sum, compra) => sum + getPurchaseBalanceDue(compra), 0);
  
    dashboardSummaryText.textContent = `Ventas, utilidad, inventario valorizado y alertas operativas en una sola vista.`;
    if (dashboardCashFlowSummary) {
      dashboardCashFlowSummary.textContent = `Revisa el flujo en efectivo, bancos y el consolidado con base en ventas, compras, pagos y traslados. Periodo: ${cashflowFilter.label}.`;
    }
    if (dashboardIncomeStatementSummary) {
      dashboardIncomeStatementSummary.textContent = `Estado de resultados desde ${incomeStatement[incomeStatement.length - 1]?.label || ''} hasta ${incomeStatement[0]?.label || ''}, usando ventas, inventoryMovements tipo salida y gastos existentes.`;
    }
    dashboardLastUpdated.textContent = `Actualizado ${now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    dashboardSalesToday.textContent = formatCurrency(totalTodaySales);
    dashboardSalesTodayMeta.textContent = `${todaySales.length} factura(s) registradas hoy`;
    dashboardSalesMonth.textContent = formatCurrency(totalMonthSales);
    dashboardSalesMonthMeta.textContent = `${monthSales.length} factura(s) este mes`;
    dashboardPurchasesMonth.textContent = formatCurrency(totalMonthPurchases);
    dashboardPurchasesMonthMeta.textContent = `${monthPurchases.length} compra(s) este mes`;
    const isLossMonth = totalMonthProfit < 0;
    if (dashboardProfitCard) {
      dashboardProfitCard.classList.toggle('is-loss', isLossMonth);
    }
    if (dashboardProfitLabel) {
      dashboardProfitLabel.textContent = isLossMonth ? 'Pérdida del mes' : 'Ganancia del mes';
    }
    dashboardProfitMonth.textContent = formatCurrency(totalMonthProfit);
    dashboardProfitMonthMeta.textContent = `Ventas ${formatCurrency(totalMonthSales)} · costos ${formatCurrency(financialSnapshot.monthCosts)} · gastos ${formatCurrency(financialSnapshot.monthExpensePayments)}`;
    dashboardInventoryValue.textContent = formatCurrency(financialSnapshot.inventoryCostValue);
    dashboardInventoryMeta.textContent = `${financialSnapshot.stockedProducts} producto(s) con stock · venta esperada ${formatCurrency(financialSnapshot.inventoryExpectedSalesValue)} · utilidad esperada ${formatCurrency(financialSnapshot.inventoryExpectedProfit)}`;
    dashboardReceivablesTotal.textContent = formatCurrency(totalReceivables);
    dashboardReceivablesMeta.textContent = `${receivables.length} pendiente(s) · ${overdueReceivables.length} vencida(s)`;
    dashboardPayablesTotal.textContent = formatCurrency(totalPayables);
    dashboardPayablesMeta.textContent = `${payables.length} pendiente(s) · ${overduePayables.length} vencida(s)`;
    dashboardLowStockCount.textContent = String(lowStockProducts.length);
    dashboardLowStockMeta.textContent = lowStockProducts.length
      ? `${lowStockProducts.length} producto(s) en o bajo mínimo`
      : 'Sin alertas críticas';
    dashboardActiveBuckets.textContent = String(activeBuckets.length);
    dashboardActiveToppings.textContent = String(activeToppings.length);
    dashboardActiveSauces.textContent = String(activeSauces.length);
  
    renderDashboardSalesComparison(dashboardSalesComparison, salesComparison);
    renderDashboardCashFlow(dashboardCashFlowGrid, cashFlowSnapshot);
    renderDashboardIncomeStatement(dashboardIncomeStatementGrid, incomeStatement);
  
    renderDashboardTopProductsChart(dashboardTopProducts, topProducts);
  
    renderDashboardList(
      dashboardControlDetails,
      [
        ...activeBuckets.map(bucket => ({ label: bucket.saborNombre || 'Balde', detail: 'Balde activo', meta: `${Number(bucket.porcionesVendidas || 0)} porciones` })),
        ...activeToppings.map(control => ({ label: control.toppingNombre || 'Topping', detail: 'Topping activo', meta: `${Number(control.porcionesVendidas || 0)} porciones` })),
        ...activeSauces.map(control => ({ label: control.sauceNombre || 'Salsa', detail: 'Salsa activa', meta: `${Number(control.porcionesVendidas || 0)} porciones` }))
      ].slice(0, 5),
      item => `
        <div class="dashboard-list-item">
          <div class="dashboard-list-main">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </div>
          <div class="dashboard-list-side">${escapeHtml(item.meta)}</div>
        </div>
      `,
      'No hay controles abiertos en este momento.'
    );
  
    renderDashboardList(
      dashboardStockAlerts,
      lowStockProducts,
      entry => `
        <div class="dashboard-list-item">
          <div class="dashboard-list-main">
            <strong>${escapeHtml(entry.producto.nombre || '')}</strong>
            <span>${escapeHtml(renderInventoryModeLabel(entry.producto))}</span>
          </div>
          <div class="dashboard-list-side">Stock ${escapeHtml(formatInventoryQuantity(entry.current))}<br>Mín. ${escapeHtml(formatInventoryQuantity(entry.minimum))}</div>
        </div>
      `,
      'No hay productos en stock bajo.'
    );
  }
  
  return {
    isSameCalendarDay,
    buildDashboardTopProducts,
    buildDashboardLowStockProducts,
    buildDashboardFinancialSnapshot,
    buildDashboardSalesComparison,
    getDashboardIncomeStatementReferenceMonth,
    isDateWithinMonthRange,
    buildDashboardIncomeStatementMonth,
    buildDashboardIncomeStatement,
    getDashboardCashflowFilter,
    updateDashboardCashflowFilterVisibility,
    buildDashboardCashFlowSnapshot,
    renderDashboardList,
    renderDashboardTopProductsChart,
    renderDashboardSalesComparison,
    getDashboardCashFlowExitGroup,
    renderDashboardCashFlow,
    renderDashboardIncomeStatement,
    renderDashboard,
  };
}

