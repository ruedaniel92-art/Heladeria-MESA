export function createInventoryModule(context) {
  const {
    state,
    buildInventoryKardexProductOptions,
    buildInventoryMovementFilterOptions,
    buildInventoryTypeFilterOptions,
    consumeInventoryLayersPeps,
    escapeHtml,
    findProductById,
    findProductByIdOrName,
    formatCurrency,
    formatDate,
    formatInventoryQuantity,
    getInventoryMovementDisplayLabel,
    getInventoryStockIncrement,
    getInventoryUnitCostFromPurchaseItem,
    initializeSearchableProductPickers,
    inventoryKardexDateEndField,
    inventoryKardexDateEndInput,
    inventoryKardexDateModeInput,
    inventoryKardexDateStartField,
    inventoryKardexDateStartInput,
    inventoryKardexList,
    inventoryKardexMovementFilterInput,
    inventoryKardexPanel,
    inventoryKardexProductInput,
    inventoryKardexTypeFilterInput,
    inventorySummaryCutoffDateInput,
    inventorySummaryList,
    inventorySummaryMovementFilterInput,
    inventorySummarySearchInput,
    inventorySummaryTotals,
    inventorySummaryTypeFilterInput,
    movementAppliesToCutoff,
    movementMatchesInventoryFilter,
    productUsesRecipe,
    renderInventoryModeLabel,
    renderProductType,
    syncSearchablePickerTrigger,
  } = context;

  function normalizeInventoryMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'directo') return 'directo';
    if (mode === 'receta') return 'receta';
    if (mode === 'helado-sabores') return 'helado-sabores';
    if (mode === 'mixto') return 'mixto';
    if (['personalizado', 'personalizado-libre', 'armado-libre'].includes(mode)) return 'personalizado';
    if (mode === 'materia-prima') return 'materia-prima';
    return '';
  }

  function getProductInventoryMode(producto) {
    const explicitMode = normalizeInventoryMode(producto?.modoControl || producto?.inventoryMode);
    if (explicitMode) return explicitMode;
    const tipo = String(producto?.tipo || producto?.type || '').trim().toLowerCase();
    if (tipo === 'materia prima') return 'materia-prima';
    if (producto?.controlSabores && Array.isArray(producto?.ingredientes) && producto.ingredientes.length) return 'mixto';
    if (producto?.controlSabores) return 'helado-sabores';
    if (Array.isArray(producto?.ingredientes) && producto.ingredientes.length) return 'receta';
    return 'directo';
  }

  function updateInventoryKardexDateFilterVisibility() {
    const useRange = inventoryKardexDateModeInput?.value === 'range';
    inventoryKardexDateStartField.classList.toggle('field-hidden', !useRange);
    inventoryKardexDateEndField.classList.toggle('field-hidden', !useRange);
    if (!useRange) {
      inventoryKardexDateStartInput.value = '';
      inventoryKardexDateEndInput.value = '';
    }
  }

  function getInventoryKardexDateRange() {
    const useRange = inventoryKardexDateModeInput?.value === 'range';
    const startDate = useRange && inventoryKardexDateStartInput?.value ? new Date(inventoryKardexDateStartInput.value) : null;
    const endDate = useRange && inventoryKardexDateEndInput?.value ? new Date(inventoryKardexDateEndInput.value) : null;
    if (startDate && !Number.isNaN(startDate.getTime())) {
      startDate.setHours(0, 0, 0, 0);
    }
    if (endDate && !Number.isNaN(endDate.getTime())) {
      endDate.setHours(23, 59, 59, 999);
    }
    return {
      useRange,
      startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null
    };
  }

  function getInventoryCutoffDate() {
    if (!inventorySummaryCutoffDateInput?.value) {
      return null;
    }
    const cutoffDate = new Date(inventorySummaryCutoffDateInput.value);
    if (Number.isNaN(cutoffDate.getTime())) {
      return null;
    }
    cutoffDate.setHours(23, 59, 59, 999);
    return cutoffDate;
  }

  function buildInventoryKardexMovements(productId) {
    const producto = findProductById(productId);
    if (!producto) {
      return [];
    }

    const productKey = String(productId);
    const movements = [];
    const pushMovement = ({ date, type, document, detail, input = 0, output = 0, sortPriority = 50, unitCost = null, totalCost = null }) => {
      const entry = Number(input || 0);
      const exit = Number(output || 0);
      if (entry <= 0 && exit <= 0) {
        return;
      }
      movements.push({ date, type, document, detail, input: entry, output: exit, sortPriority, unitCost, totalCost });
    };

    state.purchases.forEach(compra => {
      const document = compra.documento || compra.document || 'Compra';
      const items = Array.isArray(compra.items) ? compra.items : [];
      items.forEach(item => {
        const purchasedProduct = findProductByIdOrName(item.id, item.nombre);
        if (!purchasedProduct || String(purchasedProduct.id) !== productKey) {
          return;
        }
        pushMovement({
          date: compra.fecha,
          type: 'Compra',
          document,
          detail: item.flavorName
            ? `Ingreso por compra de ${compra.proveedor || 'proveedor'} · sabor ${item.flavorName}`
            : compra.proveedor
              ? `Ingreso por compra de ${compra.proveedor}`
              : 'Ingreso por compra',
          input: getInventoryStockIncrement(purchasedProduct, Number(item.cantidad || 0)),
          unitCost: getInventoryUnitCostFromPurchaseItem(purchasedProduct, item),
          totalCost: Number(item.costo || 0) * Number(item.cantidad || 0),
          sortPriority: 10
        });
      });
    });

    state.sales.forEach(venta => {
      const document = venta.documento || 'Venta';
      const items = Array.isArray(venta.items) ? venta.items : [];
      items.forEach(item => {
        const soldProduct = findProductByIdOrName(item.id, item.nombre);
        const soldQuantity = Number(item.cantidad || 0);

        if (soldProduct && String(soldProduct.id) === productKey && getProductInventoryMode(soldProduct) === 'directo') {
          pushMovement({
            date: venta.fecha,
            type: 'Venta',
            document,
            detail: venta.cliente ? `Salida por venta a ${venta.cliente}` : 'Salida por venta',
            output: soldQuantity,
            sortPriority: 20
          });
        }

        if (soldProduct && productUsesRecipe(soldProduct)) {
          (soldProduct.ingredientes || []).forEach(ingredient => {
            const ingredientProduct = findProductByIdOrName(ingredient.id, ingredient.nombre);
            if (!ingredientProduct || String(ingredientProduct.id) !== productKey) {
              return;
            }
            pushMovement({
              date: venta.fecha,
              type: 'Venta receta',
              document,
              detail: `Consumo en ${soldProduct.nombre}`,
              output: Number(ingredient.cantidad || 0) * soldQuantity,
              sortPriority: 30
            });
          });
        }

        (item.componentes || []).forEach(component => {
          if (String(component.id || '') !== productKey) {
            return;
          }
          pushMovement({
            date: venta.fecha,
            type: 'Venta personalizada',
            document,
            detail: `Componente de ${soldProduct?.nombre || item.nombre || 'producto personalizado'}`,
            output: Number(component.cantidadTotal || (Number(component.cantidad || 0) * soldQuantity)),
            sortPriority: 35
          });
        });

        (item.sabores || []).forEach(flavor => {
          if (String(flavor.materiaPrimaId || '') !== productKey) {
            return;
          }
          const trackedCost = String(flavor.costoEstado || '').toLowerCase() === 'final'
            ? Number(flavor.costoTotalFinal || 0)
            : Number(flavor.costoTotalProvisional || 0);
          pushMovement({
            date: venta.fecha,
            type: 'Venta sabor',
            document,
            detail: `Consumo por sabor ${flavor.nombre || soldProduct?.nombre || ''}`.trim(),
            output: Number(flavor.porciones || 0),
            unitCost: Number(flavor.porciones || 0) > 0 ? trackedCost / Number(flavor.porciones || 1) : null,
            totalCost: trackedCost > 0 ? trackedCost : null,
            sortPriority: 40
          });
        });

        (item.adicionales || []).forEach(addon => {
          if (String(addon.materiaPrimaId || '') !== productKey) {
            return;
          }
          const trackedCost = String(addon.costoEstado || '').toLowerCase() === 'final'
            ? Number(addon.costoTotalFinal || 0)
            : Number(addon.costoTotalProvisional || 0);
          pushMovement({
            date: venta.fecha,
            type: 'Adicional',
            document,
            detail: `Salida por ${addon.nombre || 'adicional'}`,
            output: Number(addon.cantidad || 0),
            unitCost: Number(addon.cantidad || 0) > 0 ? trackedCost / Number(addon.cantidad || 1) : null,
            totalCost: trackedCost > 0 ? trackedCost : null,
            sortPriority: 50
          });
        });
      });
    });

    state.inventoryMovements.forEach(movement => {
      const movementProduct = findProductByIdOrName(movement.productoId, movement.productoNombre);
      if (!movementProduct || String(movementProduct.id) !== productKey) {
        return;
      }
      const movementType = String(movement.tipo || '').trim().toLowerCase();
      const movementDirection = String(movement.direccion || '').trim().toLowerCase();
      const quantity = Number(movement.cantidad || 0);
      if (quantity <= 0) {
        return;
      }
      const isInput = movementDirection === 'entrada' || movementType === 'inventario-inicial';
      const typeLabel = movementType === 'inventario-inicial'
        ? 'Inventario inicial'
        : movementType === 'cierre-control'
          ? 'Merma cierre control'
          : movementDirection === 'salida'
            ? 'Ajuste salida'
            : 'Ajuste entrada';
      pushMovement({
        date: movement.fecha || movement.createdAt,
        type: typeLabel,
        document: movement.referencia || '-',
        detail: movement.observacion || 'Movimiento manual de inventario',
        input: isInput ? quantity : 0,
        output: isInput ? 0 : quantity,
        unitCost: isInput ? Number(movement.costoUnitario || 0) : null,
        totalCost: isInput ? Number(movement.costoTotal || (quantity * Number(movement.costoUnitario || 0))) : null,
        sortPriority: movementType === 'inventario-inicial' ? 5 : 15
      });
    });

    const earliestTimestamp = movements.reduce((min, movement) => {
      const timestamp = movement.date ? new Date(movement.date).getTime() : Number.POSITIVE_INFINITY;
      return Math.min(min, Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp);
    }, Number.POSITIVE_INFINITY);

    const derivedBalance = movements.reduce((sum, movement) => sum + movement.input - movement.output, 0);
    const currentStock = Number(producto.stock || 0);
    const openingBalance = currentStock - derivedBalance;
    if (Math.abs(openingBalance) > 0.0001) {
      movements.push({
        date: Number.isFinite(earliestTimestamp) ? new Date(earliestTimestamp - 1).toISOString() : null,
        type: 'Saldo inicial',
        document: '-',
        detail: 'Ajuste inicial para cuadrar saldo actual',
        input: openingBalance > 0 ? openingBalance : 0,
        output: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        sortPriority: 0
      });
    }

    let runningBalance = 0;
    let runningValue = 0;
    const layers = [];
    return movements
      .map((movement, index) => ({
        ...movement,
        sortTimestamp: movement.date ? new Date(movement.date).getTime() : 0,
        index
      }))
      .sort((left, right) => {
        if (left.sortTimestamp !== right.sortTimestamp) {
          return left.sortTimestamp - right.sortTimestamp;
        }
        if (left.sortPriority !== right.sortPriority) {
          return left.sortPriority - right.sortPriority;
        }
        return left.index - right.index;
      })
      .map(movement => {
        let movementUnitCost = Number(movement.unitCost || 0);
        let movementTotalCost = Number(movement.totalCost || 0);

        if (movement.input > 0) {
          if ((Number.isNaN(movementUnitCost) || movementUnitCost < 0) && movementTotalCost > 0) {
            movementUnitCost = movementTotalCost / movement.input;
          }
          if ((Number.isNaN(movementTotalCost) || movementTotalCost < 0) && movementUnitCost >= 0) {
            movementTotalCost = movement.input * movementUnitCost;
          }
          layers.push({ quantity: movement.input, value: movementTotalCost });
          runningValue += movementTotalCost;
        }

        if (movement.output > 0) {
          const explicitOutputCost = movement.totalCost !== null && movement.totalCost !== undefined && !Number.isNaN(Number(movement.totalCost))
            ? Number(movement.totalCost)
            : null;
          const consumed = consumeInventoryLayersPeps(layers, movement.output, explicitOutputCost);
          movementTotalCost = consumed.totalCost;
          movementUnitCost = movement.output > 0 ? movementTotalCost / movement.output : 0;
          runningValue -= movementTotalCost;
        }

        runningBalance += movement.input - movement.output;
        runningValue = Math.max(runningValue, 0);
        return {
          ...movement,
          productId: String(producto.id),
          productName: producto.nombre || '',
          productType: renderInventoryModeLabel(producto),
          unitCost: movementUnitCost,
          totalCost: movementTotalCost,
          balance: runningBalance,
          balanceValue: runningValue
        };
      });
  }

  function buildInventoryKardexEntries() {
    const selectedProductId = inventoryKardexProductInput?.value || 'all';
    const selectedType = inventoryKardexTypeFilterInput?.value || 'all';
    const selectedMovement = inventoryKardexMovementFilterInput?.value || 'all';
    const { useRange, startDate, endDate } = getInventoryKardexDateRange();
    const products = selectedProductId === 'all'
      ? state.productos.slice()
      : state.productos.filter(producto => String(producto.id) === String(selectedProductId));

    return products
      .filter(producto => selectedType === 'all' || String(renderInventoryModeLabel(producto)) === String(selectedType))
      .flatMap(producto => buildInventoryKardexMovements(producto.id))
      .filter(movement => movementMatchesInventoryFilter(movement, selectedMovement))
      .filter(movement => {
        if (!useRange) return true;
        if (!movement.date) return true;
        const movementDate = new Date(movement.date);
        if (Number.isNaN(movementDate.getTime())) return false;
        const matchesStart = startDate ? movementDate >= startDate : true;
        const matchesEnd = endDate ? movementDate <= endDate : true;
        return matchesStart && matchesEnd;
      })
      .sort((left, right) => {
        const leftTime = left.date ? new Date(left.date).getTime() : 0;
        const rightTime = right.date ? new Date(right.date).getTime() : 0;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return String(left.productName || '').localeCompare(String(right.productName || ''), 'es', { sensitivity: 'base' });
      });
  }

  function getInventorySummaryMetrics(productId, cutoffDate = null) {
    const selectedMovement = inventorySummaryMovementFilterInput?.value || 'all';
    const allCutoffMovements = buildInventoryKardexMovements(productId)
      .filter(movement => movementAppliesToCutoff(movement, cutoffDate));
    const filteredMovements = allCutoffMovements.filter(movement => movementMatchesInventoryFilter(movement, selectedMovement));
    const movementTotals = filteredMovements.reduce((accumulator, movement) => {
      accumulator.inputs += Number(movement.input || 0);
      accumulator.outputs += Number(movement.output || 0);
      return accumulator;
    }, { inputs: 0, outputs: 0 });
    const lastMovement = allCutoffMovements.length ? allCutoffMovements[allCutoffMovements.length - 1] : null;
    return {
      inputs: movementTotals.inputs,
      outputs: movementTotals.outputs,
      balance: Number(lastMovement?.balance || 0),
      balanceValue: Number(lastMovement?.balanceValue || 0),
      balanceUnitCost: Number(lastMovement?.balance || 0) > 0 ? Number(lastMovement?.balanceValue || 0) / Number(lastMovement.balance || 1) : 0
    };
  }

  function buildInventorySummaryRows() {
    const searchTerm = String(inventorySummarySearchInput?.value || '').trim().toLowerCase();
    const selectedType = inventorySummaryTypeFilterInput?.value || 'all';
    const cutoffDate = getInventoryCutoffDate();
    return state.productos
      .filter(producto => {
        if (!searchTerm) return true;
        const searchableText = [producto.nombre, renderInventoryModeLabel(producto), renderProductType(producto)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(searchTerm);
      })
      .filter(producto => selectedType === 'all' || String(renderInventoryModeLabel(producto)) === String(selectedType))
      .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }))
      .map(producto => {
        const metrics = getInventorySummaryMetrics(producto.id, cutoffDate);
        return {
          Producto: producto.nombre || '',
          Tipo: renderInventoryModeLabel(producto),
          Entradas: formatInventoryQuantity(metrics.inputs),
          Salidas: formatInventoryQuantity(metrics.outputs),
          Saldo: formatInventoryQuantity(metrics.balance),
          'Costo unitario PEPS': formatCurrency(metrics.balanceUnitCost),
          'Valor inventario PEPS': formatCurrency(metrics.balanceValue)
        };
      });
  }

  function renderInventorySummary() {
    if (!inventorySummaryList) return;
    const searchTerm = String(inventorySummarySearchInput?.value || '').trim().toLowerCase();
    const selectedType = inventorySummaryTypeFilterInput?.value || 'all';
    const selectedMovement = inventorySummaryMovementFilterInput?.value || 'all';
    const cutoffDate = getInventoryCutoffDate();
    const products = state.productos
      .filter(producto => {
        if (!searchTerm) return true;
        const searchableText = [producto.nombre, renderInventoryModeLabel(producto), renderProductType(producto)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(searchTerm);
      })
      .filter(producto => selectedType === 'all' || String(renderInventoryModeLabel(producto)) === String(selectedType))
      .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));

    if (!products.length) {
      if (inventorySummaryTotals) {
        inventorySummaryTotals.textContent = cutoffDate
          ? `No hay productos que coincidan con la busqueda para el corte al ${formatDate(cutoffDate.toISOString())}.`
          : 'No hay productos que coincidan con la busqueda actual.';
      }
      inventorySummaryList.innerHTML = '<p class="history-empty">No hay productos que coincidan con la busqueda actual.</p>';
      return;
    }

    const summaryRows = products.map(producto => ({
      producto,
      metrics: getInventorySummaryMetrics(producto.id, cutoffDate)
    }));
    const totals = summaryRows.reduce((accumulator, row) => {
      accumulator.inputs += row.metrics.inputs;
      accumulator.outputs += row.metrics.outputs;
      accumulator.value += row.metrics.balanceValue;
      return accumulator;
    }, { inputs: 0, outputs: 0, value: 0 });

    if (inventorySummaryTotals) {
      const cutoffLabel = cutoffDate ? ` al ${formatDate(cutoffDate.toISOString())}` : '';
      const movementLabel = selectedMovement !== 'all' ? ` · Movimiento: <strong>${escapeHtml(selectedMovement)}</strong>` : '';
      inventorySummaryTotals.innerHTML = `Entradas${cutoffLabel}: <strong>${escapeHtml(formatInventoryQuantity(totals.inputs))}</strong> · Salidas${cutoffLabel}: <strong>${escapeHtml(formatInventoryQuantity(totals.outputs))}</strong> · Valor PEPS: <strong>${escapeHtml(formatCurrency(totals.value))}</strong>${movementLabel}`;
    }

    inventorySummaryList.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Tipo</th>
            <th>Entradas</th>
            <th>Salidas</th>
            <th>Saldo</th>
            <th>Costo unitario PEPS</th>
            <th>Valor inventario PEPS</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows.map(({ producto, metrics }) => `
            <tr>
              <td>${escapeHtml(producto.nombre || '')}</td>
              <td>${escapeHtml(renderInventoryModeLabel(producto))}</td>
              <td>${escapeHtml(formatInventoryQuantity(metrics.inputs))}</td>
              <td>${escapeHtml(formatInventoryQuantity(metrics.outputs))}</td>
              <td class="inventory-summary-value">${escapeHtml(formatInventoryQuantity(metrics.balance))}</td>
              <td>${escapeHtml(formatCurrency(metrics.balanceUnitCost))}</td>
              <td class="inventory-summary-value">${escapeHtml(formatCurrency(metrics.balanceValue))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderInventoryKardex() {
    if (!inventoryKardexProductInput || !inventoryKardexList) return;

    const currentSelection = inventoryKardexProductInput.value;
    inventoryKardexProductInput.innerHTML = buildInventoryKardexProductOptions(currentSelection);
    if (!inventoryKardexProductInput.value) {
      inventoryKardexProductInput.value = state.productos.length ? 'all' : '';
    }
    initializeSearchableProductPickers(inventoryKardexPanel);
    syncSearchablePickerTrigger(inventoryKardexProductInput);
    if (inventoryKardexTypeFilterInput) {
      const currentType = inventoryKardexTypeFilterInput.value || 'all';
      inventoryKardexTypeFilterInput.innerHTML = buildInventoryTypeFilterOptions(currentType);
    }
    if (inventoryKardexMovementFilterInput) {
      const currentMovement = inventoryKardexMovementFilterInput.value || 'all';
      inventoryKardexMovementFilterInput.innerHTML = buildInventoryMovementFilterOptions(currentMovement);
    }

    updateInventoryKardexDateFilterVisibility();

    const movements = buildInventoryKardexEntries();
    if (!movements.length) {
      inventoryKardexList.innerHTML = '<p class="inventory-kardex-empty">No hay movimientos para los filtros seleccionados.</p>';
      return;
    }

    const selectedProductId = inventoryKardexProductInput.value;
    const selectedProduct = selectedProductId && selectedProductId !== 'all' ? findProductById(selectedProductId) : null;
    const title = selectedProduct
      ? `Kardex de ${selectedProduct.nombre || ''}`
      : 'Kardex general';

    inventoryKardexList.innerHTML = `
      <h4>${escapeHtml(title)}</h4>
      <table class="history-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Tipo</th>
            <th>Movimiento</th>
            <th>Documento</th>
            <th>Detalle</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Saldo</th>
            <th>Costo unitario</th>
            <th>Costo movimiento</th>
            <th>Valor saldo</th>
          </tr>
        </thead>
        <tbody>
          ${movements.map(movement => `
            <tr>
              <td>${movement.date ? formatDate(movement.date) : '-'}</td>
              <td>${escapeHtml(movement.productName || '')}</td>
              <td>${escapeHtml(movement.productType || '')}</td>
              <td>${escapeHtml(getInventoryMovementDisplayLabel(movement.type))}</td>
              <td>${escapeHtml(movement.document || '-')}</td>
              <td>${escapeHtml(movement.detail || '-')}</td>
              <td>${movement.input > 0 ? escapeHtml(formatInventoryQuantity(movement.input)) : '-'}</td>
              <td>${movement.output > 0 ? escapeHtml(formatInventoryQuantity(movement.output)) : '-'}</td>
              <td class="inventory-summary-value">${escapeHtml(formatInventoryQuantity(movement.balance))}</td>
              <td>${escapeHtml(formatCurrency(movement.unitCost || 0))}</td>
              <td>${escapeHtml(formatCurrency(movement.totalCost || 0))}</td>
              <td class="inventory-summary-value">${escapeHtml(formatCurrency(movement.balanceValue || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildInventoryKardexRows() {
    return buildInventoryKardexEntries().map(movement => ({
      Fecha: movement.date ? formatDate(movement.date) : '-',
      Producto: movement.productName || '',
      Tipo: movement.productType || '',
      Movimiento: getInventoryMovementDisplayLabel(movement.type) || '',
      Documento: movement.document || '-',
      Detalle: movement.detail || '-',
      Entrada: movement.input > 0 ? formatInventoryQuantity(movement.input) : '-',
      Salida: movement.output > 0 ? formatInventoryQuantity(movement.output) : '-',
      Saldo: formatInventoryQuantity(movement.balance),
      'Costo unitario': formatCurrency(movement.unitCost || 0),
      'Costo movimiento': formatCurrency(movement.totalCost || 0),
      'Valor saldo': formatCurrency(movement.balanceValue || 0)
    }));
  }

  return {
    normalizeInventoryMode,
    getProductInventoryMode,
    updateInventoryKardexDateFilterVisibility,
    getInventoryKardexDateRange,
    getInventoryCutoffDate,
    buildInventoryKardexMovements,
    buildInventoryKardexEntries,
    getInventorySummaryMetrics,
    buildInventorySummaryRows,
    renderInventorySummary,
    renderInventoryKardex,
    buildInventoryKardexRows,
  };
}
