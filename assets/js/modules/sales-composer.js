export function createSalesComposerModule(context) {
  const {
    state,
    addSaleExtraButton,
    addSaleLineButton,
    buildOptions,
    buildPurchaseLinkedOptions,
    buildSaleComponentOptions,
    buildSaleExtraSelectOptions,
    buildToppingOptions,
    buildSauceOptions,
    escapeHtml,
    findProductById,
    findSaleExtraCatalogItem,
    formatCurrency,
    getPurchaseLinkedTargets,
    getActiveBucketForFlavorId,
    getActiveSauceControlForSauceId,
    getActiveToppingControlForToppingId,
    getSauceAvailableStock,
    getSauceById,
    getSauceByName,
    getToppingAvailableStock,
    getToppingById,
    getToppingByName,
    initializeSearchableProductPickers,
    normalizeMoneyInputValue,
    openSaleCajaButton,
    productUsesFlavors,
    productUsesFreeComponents,
    productUsesRecipe,
    requiresPaymentReference,
    saleCajaBackdrop,
    saleCajaFloat,
    saleCashChangeText,
    saleCashMethodInput,
    saleCashMixedCardInput,
    saleCashMixedCardReferenceInput,
    saleCashMixedCashInput,
    saleCashMixedRow,
    saleCashMixedTransferInput,
    saleCashMixedTransferReferenceInput,
    saleCashDraftStatus,
    saleCashReceivedInput,
    saleCashReferenceInput,
    saleCashReferenceRow,
    saleCashTotalText,
    saveSaleCajaConfigButton,
    saleDueDateField,
    saleDueDateInput,
    saleInfo,
    saleLines,
    salePaymentSummary,
    salePaymentTypeInput,
    saleStatus,
    saleTotal,
    shouldShowSaleFlavorSection,
    syncSearchablePickerTrigger,
  } = context;

  let activeSaleRow = null;
  let saleLineSequence = 0;
  let listenersInstalled = false;

  function parseAmount(value) {
    const normalized = Number(String(value ?? '').replace(',', '.'));
    return Number.isNaN(normalized) ? 0 : normalized;
  }

  function getSaleMixedSnapshot() {
    return {
      cash: Math.max(parseAmount(saleCashMixedCashInput?.value), 0),
      transfer: Math.max(parseAmount(saleCashMixedTransferInput?.value), 0),
      transferReference: String(saleCashMixedTransferReferenceInput?.value || '').trim(),
      card: Math.max(parseAmount(saleCashMixedCardInput?.value), 0),
      cardReference: String(saleCashMixedCardReferenceInput?.value || '').trim(),
    };
  }

  function buildSaleMixedReference(snapshot) {
    const parts = [];
    if (snapshot.cash > 0) {
      parts.push(`Efectivo ${formatCurrency(snapshot.cash)}`);
    }
    if (snapshot.transfer > 0) {
      const transferReference = snapshot.transferReference ? ` ref ${snapshot.transferReference}` : '';
      parts.push(`Transferencia ${formatCurrency(snapshot.transfer)}${transferReference}`);
    }
    if (snapshot.card > 0) {
      const cardReference = snapshot.cardReference ? ` ref ${snapshot.cardReference}` : '';
      parts.push(`Tarjeta ${formatCurrency(snapshot.card)}${cardReference}`);
    }
    return parts.length ? `Mixto: ${parts.join(' | ')}` : '';
  }

  function setSaleCashDraftMessage(message, isError = false) {
    if (!saleCashDraftStatus) {
      return;
    }
    saleCashDraftStatus.textContent = message;
    saleCashDraftStatus.classList.toggle('error-text', Boolean(isError));
  }

  function resolveSaleCashPayload(totalAmount, { forSubmit = false } = {}) {
    const paymentMethod = String(saleCashMethodInput?.value || '').trim();
    const isMixed = paymentMethod === 'mixto';

    if (!isMixed) {
      const received = parseAmount(saleCashReceivedInput?.value);
      const reference = String(saleCashReferenceInput?.value || '').trim();
      if (forSubmit && (Number.isNaN(received) || received < totalAmount)) {
        return { ok: false, error: 'En contado, el monto recibido debe cubrir el total de la factura.' };
      }
      if (forSubmit && requiresPaymentReference(paymentMethod) && !reference) {
        return { ok: false, error: 'La referencia es obligatoria para tarjeta o transferencia.' };
      }
      return {
        ok: true,
        cashReceived: received,
        cashChange: Math.max(received - totalAmount, 0),
        paymentReference: reference || null,
        paymentBreakdown: null,
      };
    }

    const snapshot = getSaleMixedSnapshot();
    const totalMixed = snapshot.cash + snapshot.transfer + snapshot.card;

    if (forSubmit && totalMixed <= 0) {
      return { ok: false, error: 'En método mixto debes indicar al menos un monto mayor a cero.' };
    }
    if (forSubmit && totalMixed < totalAmount) {
      return { ok: false, error: 'El total del detalle mixto debe cubrir el total de la factura.' };
    }
    if (forSubmit && snapshot.transfer > 0 && !snapshot.transferReference) {
      return { ok: false, error: 'Agrega la referencia de transferencia en el detalle mixto.' };
    }
    if (forSubmit && snapshot.card > 0 && !snapshot.cardReference) {
      return { ok: false, error: 'Agrega la referencia de tarjeta en el detalle mixto.' };
    }

    return {
      ok: true,
      cashReceived: totalMixed,
      cashChange: Math.max(totalMixed - totalAmount, 0),
      paymentReference: buildSaleMixedReference(snapshot) || null,
      paymentBreakdown: {
        efectivo: snapshot.cash,
        transferencia: snapshot.transfer,
        transferenciaReferencia: snapshot.transferReference || null,
        tarjeta: snapshot.card,
        tarjetaReferencia: snapshot.cardReference || null,
      },
    };
  }

  function getSaleLineSelectedFlavors(row) {
    const selectedMap = new Map();

    row.querySelectorAll('.sale-flavor-row').forEach(flavorRow => {
      const select = flavorRow.querySelector('.sale-flavor-select');
      const amountInput = flavorRow.querySelector('.sale-flavor-amount');
      const flavorId = String(select?.value || '');
      const flavorName = select?.selectedOptions?.[0]?.dataset.name || '';
      const porciones = Number(amountInput?.value);

      if (!flavorId || !Number.isInteger(porciones) || porciones <= 0) {
        return;
      }

      const existing = selectedMap.get(flavorId) || { id: flavorId, nombre: flavorName, porciones: 0 };
      existing.porciones += porciones;
      selectedMap.set(flavorId, existing);
    });

    return Array.from(selectedMap.values());
  }

  function formatSaleAddonTypeLabel(type, addon = null) {
    if (type === 'topping-incluido') return 'Topping incluido';
    if (type === 'extra' && String(addon?.addonCategory || '').toLowerCase() === 'sauce') return 'Salsa/aderezo';
    if (type === 'extra' && String(addon?.addonCategory || '').toLowerCase() === 'topping') return 'Topping extra';
    if (type === 'extra') return 'Extra';
    return 'Adicional';
  }

  function parseSaleAddonRow(addonRow) {
    const type = String(addonRow.querySelector('.sale-addon-type')?.value || 'extra').trim().toLowerCase();
    const toppingSelect = addonRow.querySelector('.sale-addon-topping');
    const sauceSelect = addonRow.querySelector('.sale-addon-sauce');
    const freeTextInput = addonRow.querySelector('.sale-addon-name');
    const toppingId = String(toppingSelect?.value || '');
    const sauceId = String(sauceSelect?.value || '');
    const explicitTopping = getToppingById(toppingId);
    const explicitSauce = getSauceById(sauceId);
    const catalogItem = type === 'extra' ? findSaleExtraCatalogItem(freeTextInput?.value) : null;
    const catalogTopping = catalogItem?.kind === 'topping' ? getToppingById(catalogItem.id) : null;
    const catalogSauce = catalogItem?.kind === 'sauce' ? getSauceById(catalogItem.id) : null;
    const matchedTopping = explicitTopping || catalogTopping || (type === 'extra' ? getToppingByName(freeTextInput?.value) : null);
    const matchedSauce = explicitSauce || (!matchedTopping ? (catalogSauce || (type === 'extra' ? getSauceByName(freeTextInput?.value) : null)) : null);
    const matchedAddon = matchedTopping || matchedSauce;
    const name = type === 'topping-incluido'
      ? String(matchedTopping?.nombre || '').trim()
      : type === 'sauce'
        ? String(matchedSauce?.nombre || '').trim()
        : String(freeTextInput?.value || '').trim();
    const quantityRaw = String(addonRow.querySelector('.sale-addon-quantity')?.value || '').trim();
    const priceRaw = String(addonRow.querySelector('.sale-addon-price')?.value || '').trim().replace(',', '.');
    const quantity = Number(quantityRaw);
    const isIncludedTopping = type === 'topping-incluido';
    const price = isIncludedTopping ? 0 : (priceRaw === '' ? 0 : Number(priceRaw));
    const isEmpty = !name && !toppingId && !quantityRaw && !priceRaw;
    const normalizedType = type === 'topping-incluido' ? 'topping-incluido' : 'extra';

    if (isEmpty) {
      return { isEmpty: true, isValid: true, addon: null };
    }

    const isValid = Boolean(name) && Number.isInteger(quantity) && quantity > 0 && !Number.isNaN(price) && price >= 0;
    const hasActiveControlForMatchedAddon = matchedTopping
      ? Boolean(getActiveToppingControlForToppingId(matchedTopping.id))
      : matchedSauce
        ? Boolean(getActiveSauceControlForSauceId(matchedSauce.id))
        : true;
    const hasStockForMatchedAddon = matchedTopping
      ? getToppingAvailableStock(matchedTopping.id) >= quantity
      : matchedSauce
        ? getSauceAvailableStock(matchedSauce.id) >= quantity
        : true;
    const isAddonValid = isValid && hasStockForMatchedAddon;
    return {
      isEmpty: false,
      isValid: isAddonValid && hasActiveControlForMatchedAddon,
      addon: isAddonValid && hasActiveControlForMatchedAddon
        ? {
            id: matchedAddon ? matchedAddon.id : null,
            tipo: normalizedType,
            nombre: name,
            cantidad: quantity,
            precio: price,
            addonCategory: matchedTopping ? 'topping' : matchedSauce ? 'sauce' : null,
            materiaPrimaId: matchedAddon ? matchedAddon.materiaPrimaId : null,
            materiaPrimaNombre: matchedAddon ? matchedAddon.materiaPrimaNombre : null,
            catalogLabel: catalogItem ? catalogItem.label : null
          }
        : null
    };
  }

  function createSaleLineId() {
    saleLineSequence += 1;
    return `sale-line-${saleLineSequence}`;
  }

  function isSaleExtraLineRow(row) {
    return Boolean(row?.classList?.contains('sale-extra-line-row'));
  }

  function isSaleProductLineRow(row) {
    return Boolean(row?.classList?.contains('sale-line-row')) && !isSaleExtraLineRow(row);
  }

  function parseSaleExtraLine(row) {
    const nameInput = row.querySelector('.sale-extra-source');
    const linkSelect = row.querySelector('.sale-extra-link-select');
    const quantityInput = row.querySelector('.sale-quantity');
    const priceInput = row.querySelector('.sale-price');
    const name = String(nameInput?.value || '').trim();
    const quantityRaw = String(quantityInput?.value || '').trim();
    const priceRaw = String(priceInput?.value || '').trim().replace(',', '.');
    const quantity = Number(quantityRaw);
    const price = priceRaw === '' ? 0 : Number(priceRaw);
    const isEmpty = !name && !quantityRaw && !priceRaw;

    if (isEmpty) {
      return { isEmpty: true, isValid: true, addon: null, item: null };
    }

    const isValid = Boolean(name) && Number.isInteger(quantity) && quantity > 0 && !Number.isNaN(price) && price >= 0;
    const catalogItem = findSaleExtraCatalogItem(name);
    const catalogRawMaterial = catalogItem?.kind === 'materia-prima' ? findProductById(catalogItem.id) : null;
    if (catalogRawMaterial && isValid) {
      const linkedTargets = getPurchaseLinkedTargets(catalogRawMaterial);
      const selectedLinkRawValue = String(linkSelect?.value || '').trim();
      const [linkedType = '', linkedId = ''] = selectedLinkRawValue.split(':');
      const selectedLinkedTarget = linkedId
        ? linkedTargets.find(target => String(target.type) === linkedType && String(target.id) === linkedId)
        : null;
      const requiresLinkedTarget = linkedTargets.length > 0;
      if (requiresLinkedTarget && !selectedLinkedTarget) {
        return {
          isEmpty: false,
          isValid: false,
          item: null,
          addon: null
        };
      }

      const flavorId = selectedLinkedTarget?.type === 'flavor' ? String(selectedLinkedTarget.id) : null;
      const flavorName = selectedLinkedTarget?.type === 'flavor' ? String(selectedLinkedTarget.name) : null;
      const toppingId = selectedLinkedTarget?.type === 'topping' ? String(selectedLinkedTarget.id) : null;
      const toppingName = selectedLinkedTarget?.type === 'topping' ? String(selectedLinkedTarget.name) : null;
      const sauceId = selectedLinkedTarget?.type === 'sauce' ? String(selectedLinkedTarget.id) : null;
      const sauceName = selectedLinkedTarget?.type === 'sauce' ? String(selectedLinkedTarget.name) : null;
      const hasStockForLinkedTarget = flavorId
        ? true
        : toppingId
          ? getToppingAvailableStock(toppingId) >= quantity
          : sauceId
            ? getSauceAvailableStock(sauceId) >= quantity
            : true;
      const hasActiveControlForLinkedTarget = flavorId
        ? true
        : toppingId
          ? Boolean(getActiveToppingControlForToppingId(toppingId))
          : sauceId
            ? Boolean(getActiveSauceControlForSauceId(sauceId))
            : true;
      const isRawMaterialValid = Number(catalogRawMaterial.stock || 0) >= quantity;
      const isAddonValid = isRawMaterialValid && hasStockForLinkedTarget && hasActiveControlForLinkedTarget;
      return {
        isEmpty: false,
        isValid: isAddonValid,
        item: null,
        addon: isAddonValid
          ? {
              id: toppingId || sauceId || null,
              tipo: 'extra',
              nombre: catalogRawMaterial.nombre,
              cantidad: quantity,
              precio: price,
              addonCategory: toppingId ? 'topping' : sauceId ? 'sauce' : 'materia-prima',
              materiaPrimaId: catalogRawMaterial.id,
              materiaPrimaNombre: catalogRawMaterial.nombre,
              flavorId,
              flavorName,
              toppingId,
              toppingName,
              sauceId,
              sauceName,
              linkedType: selectedLinkedTarget?.type || null,
              linkedId: selectedLinkedTarget?.id || null,
              linkedName: selectedLinkedTarget?.name || null
            }
          : null
      };
    }
    return {
      isEmpty: false,
      isValid: false,
      item: null,
      addon: null
    };
  }

  function getLinkedSaleExtraRows(parentRow) {
    const parentLineId = String(parentRow?.dataset?.lineId || '');
    if (!parentLineId) return [];
    return Array.from(saleLines.querySelectorAll('.sale-extra-line-row')).filter(row => String(row.dataset.parentLineId || '') === parentLineId);
  }

  function getSaleProductRowForExtraTarget(row) {
    if (!row) return null;
    if (isSaleProductLineRow(row)) {
      return row;
    }
    const parentLineId = String(row.dataset.parentLineId || '');
    return parentLineId ? saleLines.querySelector(`.sale-line-row[data-line-id="${parentLineId}"]`) : null;
  }

  function setActiveSaleRow(row) {
    activeSaleRow = row || null;
    saleLines.querySelectorAll('.sale-line-row').forEach(entry => entry.classList.toggle('is-selected', entry === activeSaleRow));
  }

  function syncSaleCustomizationWindowState() {
    const hasOpenEditor = Array.from(saleLines.querySelectorAll('.sale-line-row'))
      .some(entry => entry.dataset.flavorEditorOpen === 'true' && !entry.querySelector('.sale-flavor-field')?.classList.contains('field-hidden'));
    document.body.classList.toggle('sale-customization-open', hasOpenEditor);
  }

  function closeAllSaleCustomizationEditors(exceptRow = null) {
    saleLines.querySelectorAll('.sale-line-row').forEach(entry => {
      if (entry !== exceptRow && entry.dataset.flavorEditorOpen === 'true') {
        entry.dataset.flavorEditorOpen = 'false';
        updateSaleRowFlavorSection(entry);
      }
    });
    syncSaleCustomizationWindowState();
  }

  function closeActiveSaleCustomizationEditor() {
    const openRow = Array.from(saleLines.querySelectorAll('.sale-line-row'))
      .find(entry => entry.dataset.flavorEditorOpen === 'true');
    if (!openRow) {
      return false;
    }
    openRow.dataset.flavorEditorOpen = 'false';
    updateSaleRowFlavorSection(openRow);
    return true;
  }

  function getTargetSaleRowForExtra() {
    if (activeSaleRow && saleLines.contains(activeSaleRow)) {
      return getSaleProductRowForExtraTarget(activeSaleRow);
    }
    return Array.from(saleLines.querySelectorAll('.sale-line-row')).find(row => isSaleProductLineRow(row) && row.classList.contains('is-editing'))
      || Array.from(saleLines.querySelectorAll('.sale-line-row')).find(isSaleProductLineRow);
  }

  function getSaleLineAddonState(row) {
    if (isSaleExtraLineRow(row)) {
      const parsed = parseSaleExtraLine(row);
      return {
        addons: parsed.addon ? [parsed.addon] : [],
        hasInvalid: !parsed.isEmpty && !parsed.isValid
      };
    }
    const parsedRows = Array.from(row.querySelectorAll('.sale-addon-row')).map(parseSaleAddonRow);
    return {
      addons: parsedRows.filter(entry => entry.addon).map(entry => entry.addon),
      hasInvalid: parsedRows.some(entry => !entry.isEmpty && !entry.isValid)
    };
  }

  function getSaleLineAddons(row) {
    return getSaleLineAddonState(row).addons;
  }

  function getSaleLineComponents(row) {
    if (isSaleExtraLineRow(row)) {
      return [];
    }
    const selectedMap = new Map();
    row.querySelectorAll('.sale-component-row').forEach(componentRow => {
      const select = componentRow.querySelector('.sale-component-select');
      const amountInput = componentRow.querySelector('.sale-component-amount');
      const priceInput = componentRow.querySelector('.sale-component-price');
      const id = String(select?.value || '');
      const nombre = select?.selectedOptions?.[0]?.dataset.name || '';
      const selectedOption = select?.selectedOptions?.[0] || null;
      const sourceCategory = String(selectedOption?.dataset.sourceCategory || 'producto');
      const sourceId = String(selectedOption?.dataset.sourceId || id);
      const materiaPrimaId = String(selectedOption?.dataset.materiaPrimaId || '');
      const materiaPrimaNombre = String(selectedOption?.dataset.materiaPrimaNombre || '');
      const cantidad = Number(amountInput?.value);
      const precio = String(priceInput?.value || '').trim() === '' ? 0 : Number(priceInput?.value);

      if (!id || !nombre || Number.isNaN(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
        return;
      }

      const existing = selectedMap.get(id) || {
        id,
        nombre,
        cantidad: 0,
        precio,
        sourceCategory,
        sourceId,
        materiaPrimaId: materiaPrimaId || null,
        materiaPrimaNombre: materiaPrimaNombre || null
      };
      existing.cantidad += cantidad;
      existing.precio = Math.max(Number(existing.precio || 0), precio);
      selectedMap.set(id, existing);
    });
    return Array.from(selectedMap.values());
  }

  function calculateSaleComponentsTotal(row) {
    if (isSaleExtraLineRow(row)) {
      return 0;
    }
    const quantity = Number(row.querySelector('.sale-quantity')?.value);
    const lineQuantity = Number.isNaN(quantity) ? 0 : quantity;
    return getSaleLineComponents(row).reduce((sum, component) => sum + Number(component.cantidad || 0) * Number(component.precio || 0) * lineQuantity, 0);
  }

  function calculateSaleAddonsTotal(addons) {
    return (Array.isArray(addons) ? addons : []).reduce((sum, addon) => sum + Number(addon.cantidad || 0) * Number(addon.precio || 0), 0);
  }

  function calculateSaleLineTotal(row) {
    const quantity = Number(row.querySelector('.sale-quantity').value);
    const price = Number(row.querySelector('.sale-price').value);
    if (isSaleExtraLineRow(row)) {
      return Number.isNaN(quantity) || Number.isNaN(price) ? 0 : quantity * price;
    }
    const addonsTotal = calculateSaleAddonsTotal(getSaleLineAddons(row));
    const componentsTotal = calculateSaleComponentsTotal(row);
    const baseTotal = Number.isNaN(quantity) || Number.isNaN(price) ? 0 : quantity * price;
    return baseTotal + addonsTotal + componentsTotal;
  }

  function updateSaleRowTotal(row) {
    const totalCell = row.querySelector('.purchase-line-total');
    if (!totalCell) return;
    totalCell.textContent = formatCurrency(calculateSaleLineTotal(row));
  }

  function getExpectedScoopsForLine(row) {
    if (isSaleExtraLineRow(row)) {
      return 0;
    }
    const select = row.querySelector('.sale-product-source');
    const quantity = Number(row.querySelector('.sale-quantity').value);
    const producto = findProductById(select.value);
    if (!productUsesFlavors(producto)) {
      return 0;
    }
    return Math.max(Number(producto.pelotasPorUnidad || 0) * (Number.isNaN(quantity) ? 0 : quantity), 0);
  }

  function getAvailableSaleFlavors(selectedFlavorId = '') {
    return state.sabores.filter(sabor => getActiveBucketForFlavorId(sabor.id) || String(sabor.id) === String(selectedFlavorId));
  }

  function buildSaleFlavorSelectOptions(selectedFlavorId = '') {
    const availableFlavors = getAvailableSaleFlavors(selectedFlavorId);
    if (!availableFlavors.length) {
      return '<option value="">No hay sabores con balde abierto</option>';
    }

    return `
      <option value="">Seleccionar sabor</option>
      ${availableFlavors.map(sabor => {
        const activeBucket = getActiveBucketForFlavorId(sabor.id);
        return `<option value="${escapeHtml(sabor.id)}" data-name="${escapeHtml(sabor.nombre)}" ${String(sabor.id) === String(selectedFlavorId) ? 'selected' : ''}>${escapeHtml(sabor.nombre)}${activeBucket ? ' · balde abierto' : ' · no disponible'}</option>`;
      }).join('')}
    `;
  }

  function buildSaleFlavorSummaryMarkup(row) {
    if (isSaleExtraLineRow(row)) {
      return '<span class="sale-flavor-summary-empty">Los extras se agregan ahora como lineas independientes en la hoja principal.</span>';
    }
    const selectedFlavors = getSaleLineSelectedFlavors(row);
    const addons = getSaleLineAddons(row);
    const components = getSaleLineComponents(row);
    const chips = [
      ...components.map(component => `
        <span class="sale-flavor-chip">${escapeHtml(component.nombre)} <strong>x${Number(component.cantidad || 0)}</strong>${Number(component.precio || 0) > 0 ? ` Â· ${escapeHtml(formatCurrency(Number(component.cantidad || 0) * Number(component.precio || 0)))}` : ''}</span>
      `),
      ...selectedFlavors.map(flavor => `
        <span class="sale-flavor-chip">${escapeHtml(flavor.nombre)} <strong>${Number(flavor.porciones || 0)}</strong></span>
      `),
      ...addons.map(addon => `
        <span class="sale-flavor-chip">${escapeHtml(formatSaleAddonTypeLabel(addon.tipo, addon))}: ${escapeHtml(addon.nombre)} <strong>x${Number(addon.cantidad || 0)}</strong>${Number(addon.precio || 0) > 0 ? ` · ${escapeHtml(formatCurrency(Number(addon.cantidad || 0) * Number(addon.precio || 0)))}` : ''}</span>
      `)
    ];

    if (!chips.length) {
      return '<span class="sale-flavor-summary-empty">Sin personalizacion todavia.</span>';
    }

    return chips.join('');
  }

  function syncSaleFlavorSummary(row) {
    const flavorSummary = row.querySelector('.sale-flavor-summary');
    const flavorToggleButton = row.querySelector('.toggle-sale-flavor-editor');
    const producto = findProductById(row.querySelector('.sale-product-source')?.value);
    const expectedScoops = getExpectedScoopsForLine(row);
    const assignedScoops = getSaleLineSelectedFlavors(row).reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
    const addonsTotal = calculateSaleAddonsTotal(getSaleLineAddons(row));
    const components = getSaleLineComponents(row);
    const componentsTotal = calculateSaleComponentsTotal(row);

    if (flavorSummary) {
      flavorSummary.innerHTML = buildSaleFlavorSummaryMarkup(row);
    }
    if (flavorToggleButton) {
      const isOpen = row.dataset.flavorEditorOpen === 'true';
      const detail = productUsesFlavors(producto)
        ? `${assignedScoops}/${expectedScoops} pelotas${addonsTotal ? ` y ${formatCurrency(addonsTotal)} en extras` : ''}`
        : productUsesFreeComponents(producto)
          ? `${components.length} componente(s)${componentsTotal ? ` · ${formatCurrency(componentsTotal)}` : ''}`
        : addonsTotal
          ? formatCurrency(addonsTotal)
          : 'sin cambios';
      flavorToggleButton.textContent = isOpen ? '×' : '⚙';
      flavorToggleButton.title = isOpen ? 'Cerrar personalización' : `Abrir personalización${detail ? `: ${detail}` : ''}`;
      flavorToggleButton.setAttribute('aria-label', isOpen ? 'Cerrar personalización' : 'Abrir personalización');
      flavorToggleButton.classList.toggle('is-active', isOpen);
    }
  }

  function bindSaleFlavorRowEvents(row, flavorRow) {
    const select = flavorRow.querySelector('.sale-flavor-select');
    const amountInput = flavorRow.querySelector('.sale-flavor-amount');
    const removeButton = flavorRow.querySelector('.remove-sale-flavor-row');

    select.addEventListener('change', () => {
      const selectedValue = select.value;
      const selectedName = select.selectedOptions[0]?.dataset.name || '';
      select.dataset.name = selectedName;
      select.innerHTML = buildSaleFlavorSelectOptions(selectedValue);
      select.value = selectedValue;
      syncSaleFlavorSummary(row);
      renderSaleInfo();
    });

    amountInput.addEventListener('input', () => {
      syncSaleFlavorSummary(row);
      renderSaleInfo();
    });

    removeButton.addEventListener('click', () => {
      flavorRow.remove();
      if (!row.querySelector('.sale-flavor-row') && row.classList.contains('is-editing')) {
        addSaleFlavorRow(row);
      }
      syncSaleFlavorSummary(row);
      renderSaleInfo();
    });
  }

  function addSaleFlavorRow(row, selectedFlavorId = '', porciones = '') {
    const rowsContainer = row.querySelector('.sale-flavor-rows');
    const flavorRow = document.createElement('div');
    flavorRow.className = 'sale-flavor-row';
    flavorRow.innerHTML = `
      <select class="sale-flavor-select" data-name="">
        ${buildSaleFlavorSelectOptions(selectedFlavorId)}
      </select>
      <input type="number" class="sale-flavor-amount" min="0" step="1" placeholder="Porciones" value="${porciones}" />
      <button type="button" class="secondary-btn remove-sale-flavor-row">Quitar</button>
    `;

    rowsContainer.appendChild(flavorRow);
    const select = flavorRow.querySelector('.sale-flavor-select');
    select.value = selectedFlavorId;
    select.dataset.name = select.selectedOptions[0]?.dataset.name || '';
    bindSaleFlavorRowEvents(row, flavorRow);
    syncSaleFlavorSummary(row);
  }

  function bindSaleComponentRowEvents(row, componentRow) {
    componentRow.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => {
        syncSaleFlavorSummary(row);
        updateSaleRowTotal(row);
        renderSaleInfo();
      });
      input.addEventListener('change', () => {
        syncSaleFlavorSummary(row);
        updateSaleRowTotal(row);
        renderSaleInfo();
      });
    });

    componentRow.querySelector('.remove-sale-component-row').addEventListener('click', () => {
      componentRow.remove();
      syncSaleFlavorSummary(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
  }

  function addSaleComponentRow(row, component = {}) {
    const rowsContainer = row.querySelector('.sale-component-rows');
    const componentRow = document.createElement('div');
    componentRow.className = 'sale-component-row';
    componentRow.innerHTML = `
      <select class="sale-component-select">
        ${buildSaleComponentOptions(component.id || '')}
      </select>
      <input type="number" class="sale-component-amount" min="0.01" step="0.01" placeholder="Cant. por unidad" value="${component.cantidad !== undefined ? escapeHtml(component.cantidad) : ''}" />
      <input type="hidden" class="sale-component-price" value="0" />
      <button type="button" class="secondary-btn remove-sale-component-row">Quitar</button>
    `;
    rowsContainer.appendChild(componentRow);
    bindSaleComponentRowEvents(row, componentRow);
    syncSaleFlavorSummary(row);
  }

  function bindSaleAddonRowEvents(row, addonRow) {
    addonRow.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => {
        if (input.classList.contains('sale-addon-name')) {
          const catalogItem = findSaleExtraCatalogItem(input.value);
          const priceInput = addonRow.querySelector('.sale-addon-price');
          if (catalogItem && priceInput && !priceInput.value) {
            priceInput.value = Number(catalogItem.price || 0) ? Number(catalogItem.price).toFixed(2) : '';
          }
        }
        syncSaleFlavorSummary(row);
        updateSaleRowTotal(row);
        renderSaleInfo();
      });
      input.addEventListener('change', () => {
        syncSaleFlavorSummary(row);
        updateSaleRowTotal(row);
        renderSaleInfo();
      });
    });

    addonRow.querySelector('.remove-sale-addon-row').addEventListener('click', () => {
      addonRow.remove();
      syncSaleFlavorSummary(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
  }

  function addSaleIncludedToppingRow(row, addon = {}) {
    const rowsContainer = row.querySelector('.sale-topping-addon-rows');
    const addonRow = document.createElement('div');
    addonRow.className = 'sale-addon-row';
    addonRow.innerHTML = `
      <input type="hidden" class="sale-addon-type" value="topping-incluido" />
      <select class="sale-addon-topping">
        ${buildToppingOptions(addon.id || '')}
      </select>
      <input type="number" class="sale-addon-quantity" min="1" step="1" placeholder="Cant." value="${addon.cantidad !== undefined ? escapeHtml(addon.cantidad) : ''}" />
      <input type="number" class="sale-addon-price field-hidden" min="0" step="0.01" placeholder="Incluido" value="0" />
      <button type="button" class="secondary-btn remove-sale-addon-row">Quitar</button>
    `;
    rowsContainer.appendChild(addonRow);
    bindSaleAddonRowEvents(row, addonRow);
    syncSaleFlavorSummary(row);
  }

  function addSaleSauceAddonRow(row, addon = {}) {
    const rowsContainer = row.querySelector('.sale-sauce-addon-rows');
    const addonRow = document.createElement('div');
    addonRow.className = 'sale-addon-row';
    addonRow.innerHTML = `
      <input type="hidden" class="sale-addon-type" value="sauce" />
      <select class="sale-addon-sauce">
        ${buildSauceOptions(addon.id || '')}
      </select>
      <input type="number" class="sale-addon-quantity" min="1" step="1" placeholder="Cant." value="${addon.cantidad !== undefined ? escapeHtml(addon.cantidad) : ''}" />
      <input type="number" class="sale-addon-price field-hidden" min="0" step="0.01" placeholder="Incluido" value="0" />
      <button type="button" class="secondary-btn remove-sale-addon-row">Quitar</button>
    `;
    rowsContainer.appendChild(addonRow);
    bindSaleAddonRowEvents(row, addonRow);
    syncSaleFlavorSummary(row);
  }

  function updateSaleExtraLinkedField(row) {
    if (!isSaleExtraLineRow(row)) return;
    const linkField = row.querySelector('.sale-extra-link-field');
    const linkSelect = row.querySelector('.sale-extra-link-select');
    const linkLabel = row.querySelector('.sale-extra-link-label');
    if (!linkField || !linkSelect) return;

    const sourceInput = row.querySelector('.sale-extra-source');
    const catalogItem = findSaleExtraCatalogItem(sourceInput?.value);
    const catalogRawMaterial = catalogItem?.kind === 'materia-prima' ? findProductById(catalogItem.id) : null;
    const linkedTargets = catalogRawMaterial ? getPurchaseLinkedTargets(catalogRawMaterial) : [];
    const shouldShowLinkedTarget = linkedTargets.length > 0;
    const previousRawMaterialId = row.dataset.extraRawMaterialId || '';
    const nextRawMaterialId = catalogRawMaterial ? String(catalogRawMaterial.id || '') : '';
    const currentValue = previousRawMaterialId === nextRawMaterialId ? String(linkSelect.value || '') : '';

    if (linkLabel) {
      if (!catalogRawMaterial) {
        linkLabel.textContent = 'Asignar a';
      } else if (linkedTargets.length === 1) {
        const type = String(linkedTargets[0].type || '').trim().toLowerCase();
        linkLabel.textContent = type === 'flavor' ? 'Sabor' : type === 'topping' ? 'Topping' : type === 'sauce' ? 'Salsa / aderezo' : 'Asignar a';
      } else {
        linkLabel.textContent = 'Asignar a';
      }
    }

    row.dataset.extraRawMaterialId = nextRawMaterialId;
    linkField.classList.toggle('field-hidden', !shouldShowLinkedTarget);
    linkField.hidden = !shouldShowLinkedTarget;
    linkSelect.required = shouldShowLinkedTarget;
    if (shouldShowLinkedTarget && catalogRawMaterial) {
      const [selectedType = '', selectedId = ''] = currentValue.split(':');
      linkSelect.innerHTML = buildPurchaseLinkedOptions(catalogRawMaterial.id, selectedType, selectedId);
      linkSelect.value = currentValue;
    } else {
      linkSelect.innerHTML = '<option value="">Sin vínculos</option>';
      linkSelect.value = '';
    }
    linkSelect.disabled = !shouldShowLinkedTarget || !row.classList.contains('is-editing');
  }

  function updateSaleRowFlavorSection(row) {
    const select = row.querySelector('.sale-product-source');
    const flavorField = row.querySelector('.sale-flavor-field');
    const flavorEditor = row.querySelector('.sale-flavor-editor');
    const flavorToggleButton = row.querySelector('.toggle-sale-flavor-editor');
    const componentSection = row.querySelector('.sale-component-section');
    const componentRows = row.querySelector('.sale-component-rows');
    const addComponentButton = row.querySelector('.add-sale-component-row');
    const flavorSection = row.querySelector('.sale-flavor-section');
    const flavorRows = row.querySelector('.sale-flavor-rows');
    const addFlavorButton = row.querySelector('.add-sale-flavor-row');
    const addonContainers = Array.from(row.querySelectorAll('.sale-addon-rows'));
    const addAddonButton = row.querySelector('.add-sale-addon-row');
    const addSauceAddonButton = row.querySelector('.add-sale-sauce-addon-row');
    const producto = findProductById(select.value);
    const selectedLabel = String(select.selectedOptions?.[0]?.textContent || '');
    const looksLikeFreeCustomization = /personalizado\s*libre/i.test(selectedLabel);
    const shouldShowComponents = Boolean(producto) && (productUsesFreeComponents(producto) || looksLikeFreeCustomization);
    const shouldShowCustomization = Boolean(producto) && (shouldShowComponents || productUsesFlavors(producto) || productUsesRecipe(producto) || looksLikeFreeCustomization);
    const shouldShowFlavors = Boolean(producto) && productUsesFlavors(producto);

    flavorField.classList.toggle('field-hidden', !shouldShowCustomization);
    flavorToggleButton.classList.remove('field-hidden');
    if (!shouldShowCustomization) {
      row.dataset.flavorEditorOpen = 'false';
      componentRows.innerHTML = '';
      flavorRows.innerHTML = '';
      addonContainers.forEach(container => {
        container.innerHTML = '';
      });
      syncSaleFlavorSummary(row);
      syncSaleCustomizationWindowState();
      return;
    }

    componentSection.classList.toggle('field-hidden', !shouldShowComponents);
    componentSection.hidden = !shouldShowComponents;
    componentSection.style.display = shouldShowComponents ? '' : 'none';
    flavorSection.classList.toggle('field-hidden', !shouldShowFlavors);
    flavorSection.hidden = !shouldShowFlavors;
    flavorSection.style.display = shouldShowFlavors ? '' : 'none';

    if (!shouldShowFlavors) {
      flavorRows.innerHTML = '';
    }

    if (!row.dataset.flavorEditorOpen) {
      row.dataset.flavorEditorOpen = 'false';
    }

    flavorToggleButton.disabled = false;

    if (shouldShowComponents && !componentRows.querySelector('.sale-component-row') && row.classList.contains('is-editing')) {
      addSaleComponentRow(row);
    }

    if (shouldShowFlavors && !flavorRows.querySelector('.sale-flavor-row') && row.classList.contains('is-editing')) {
      addSaleFlavorRow(row);
    }

    flavorEditor.classList.toggle('field-hidden', row.dataset.flavorEditorOpen !== 'true');
    addComponentButton.disabled = !row.classList.contains('is-editing') || !shouldShowComponents;
    addFlavorButton.disabled = !row.classList.contains('is-editing') || !shouldShowFlavors || !getAvailableSaleFlavors().length;
    addAddonButton.disabled = !row.classList.contains('is-editing');
    addSauceAddonButton.disabled = !row.classList.contains('is-editing');
    flavorRows.querySelectorAll('.sale-flavor-row').forEach(flavorRow => {
      flavorRow.querySelector('.sale-flavor-select').disabled = !row.classList.contains('is-editing');
      flavorRow.querySelector('.sale-flavor-amount').disabled = !row.classList.contains('is-editing');
      flavorRow.querySelector('.remove-sale-flavor-row').disabled = !row.classList.contains('is-editing');
    });
    componentRows.querySelectorAll('.sale-component-row').forEach(componentRow => {
      const selectInput = componentRow.querySelector('.sale-component-select');
      const currentValue = selectInput.value;
      selectInput.innerHTML = buildSaleComponentOptions(currentValue);
      selectInput.value = currentValue;
      componentRow.querySelectorAll('input, select, button').forEach(control => {
        control.disabled = !row.classList.contains('is-editing');
      });
    });
    addonContainers.forEach(container => container.querySelectorAll('.sale-addon-row').forEach(addonRow => {
      const toppingSelect = addonRow.querySelector('.sale-addon-topping');
      const sauceSelect = addonRow.querySelector('.sale-addon-sauce');
      if (toppingSelect) {
        const currentValue = toppingSelect.value;
        toppingSelect.innerHTML = buildToppingOptions(currentValue);
        toppingSelect.value = currentValue;
      }
      if (sauceSelect) {
        const currentValue = sauceSelect.value;
        sauceSelect.innerHTML = buildSauceOptions(currentValue);
        sauceSelect.value = currentValue;
      }
      addonRow.querySelectorAll('input, select, button').forEach(control => {
        control.disabled = !row.classList.contains('is-editing');
      });
    }));

    if (!shouldShowFlavors) {
      flavorRows.querySelectorAll('.sale-flavor-row').forEach(flavorRow => flavorRow.remove());
    }
    if (!shouldShowComponents) {
      componentRows.querySelectorAll('.sale-component-row').forEach(componentRow => componentRow.remove());
    }

    syncSaleFlavorSummary(row);
    syncSaleCustomizationWindowState();
  }

  function setSaleRowEditing(row, isEditing) {
    if (isSaleExtraLineRow(row)) {
      row.classList.toggle('is-editing', isEditing);
      row.querySelector('.sale-extra-source').disabled = false;
      const linkedTargetSelect = row.querySelector('.sale-extra-link-select');
      if (linkedTargetSelect) {
        linkedTargetSelect.disabled = !isEditing || linkedTargetSelect.closest('.sale-extra-link-field')?.classList.contains('field-hidden');
      }
      row.querySelector('.sale-quantity').disabled = false;
      row.querySelector('.sale-price').disabled = false;
      const toggleButton = row.querySelector('.toggle-sale-line');
      toggleButton.textContent = isEditing ? '✓' : '✎';
      toggleButton.title = isEditing ? 'Guardar extra' : 'Editar extra';
      toggleButton.setAttribute('aria-label', isEditing ? 'Guardar extra' : 'Editar extra');
      syncSearchablePickerTrigger(row.querySelector('.sale-extra-source'));
      updateSaleExtraLinkedField(row);
      return;
    }
    row.classList.toggle('is-editing', isEditing);
    row.querySelector('.sale-product-source').disabled = !isEditing;
    row.querySelector('.sale-quantity').disabled = !isEditing;
    row.querySelector('.sale-price').disabled = !isEditing;
    row.dataset.flavorEditorOpen = isEditing ? (row.dataset.flavorEditorOpen || 'false') : 'false';
    const toggleButton = row.querySelector('.toggle-sale-line');
    toggleButton.textContent = isEditing ? '✓' : '✎';
    toggleButton.title = isEditing ? 'Guardar fila' : 'Editar fila';
    toggleButton.setAttribute('aria-label', isEditing ? 'Guardar fila' : 'Editar fila');
    syncSearchablePickerTrigger(row.querySelector('.sale-product-source'));
    updateSaleRowFlavorSection(row);
  }

  function addSaleExtraLine(parentRow, addon = {}, startEditing = true) {
    const parentLineId = String(parentRow?.dataset?.lineId || '');
    if (!parentLineId) {
      return null;
    }
    const row = document.createElement('div');
    row.className = 'purchase-row sale-extra-line-row';
    row.dataset.parentLineId = parentLineId;
    row.innerHTML = `
      <div class="field">
        <select class="sale-extra-source" required>
          ${buildSaleExtraSelectOptions(addon.nombre || '')}
        </select>
        <div class="field sale-extra-link-field field-hidden" hidden>
          <label class="sale-extra-link-label">Asignar a</label>
          <select class="sale-extra-link-select">
            <option value="">Selecciona una opción</option>
          </select>
        </div>
      </div>
      <div class="field">
        <input type="number" class="sale-quantity" min="1" step="1" placeholder="Ej. 1" value="${addon.cantidad ?? ''}" required />
      </div>
      <div class="field">
        <input type="number" class="sale-price" min="0" step="0.01" placeholder="Ej. 25" value="${addon.precio ?? ''}" required />
      </div>
      <div class="field">
        <div class="purchase-line-total">C$0,00</div>
      </div>
      <div class="field">
        <div class="purchase-row-actions">
          <button type="button" class="secondary-btn action-icon-btn toggle-sale-line" title="Guardar extra" aria-label="Guardar extra">✓</button>
          <button type="button" class="delete-product action-icon-btn remove-sale-line" title="Eliminar extra" aria-label="Eliminar extra">🗑</button>
        </div>
      </div>
    `;

    const sourceInput = row.querySelector('.sale-extra-source');
    const linkedTargetSelect = row.querySelector('.sale-extra-link-select');
    const quantityInput = row.querySelector('.sale-quantity');
    const priceInput = row.querySelector('.sale-price');
    const toggleButton = row.querySelector('.toggle-sale-line');
    const removeButton = row.querySelector('.remove-sale-line');
    initializeSearchableProductPickers(row);

    function syncExtraCatalogSelection() {
      const catalogItem = findSaleExtraCatalogItem(sourceInput.value);
      if (!catalogItem) {
        row.dataset.extraCatalogName = '';
        row.dataset.extraAutoPrice = '';
        updateSaleExtraLinkedField(row);
        updateSaleRowTotal(row);
        renderSaleInfo();
        return;
      }

      const previousCatalogName = row.dataset.extraCatalogName || '';
      const previousAutoPrice = row.dataset.extraAutoPrice || '';
      const currentPriceValue = String(priceInput.value || '').trim();
      const nextAutoPrice = Number(catalogItem.price || 0) ? Number(catalogItem.price).toFixed(2) : '';
      const shouldReplacePrice = !currentPriceValue || currentPriceValue === previousAutoPrice || previousCatalogName !== catalogItem.value;

      row.dataset.extraCatalogName = catalogItem.value;
      row.dataset.extraAutoPrice = nextAutoPrice;
      if (shouldReplacePrice) {
        priceInput.value = nextAutoPrice;
      }
      updateSaleExtraLinkedField(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    }

    row.addEventListener('click', event => {
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select')) {
        setActiveSaleRow(row);
        return;
      }
      setActiveSaleRow(row);
    });

    sourceInput.addEventListener('change', syncExtraCatalogSelection);
    linkedTargetSelect.addEventListener('change', () => {
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
    quantityInput.addEventListener('input', () => {
      updateSaleExtraLinkedField(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
    priceInput.addEventListener('input', () => {
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
    priceInput.addEventListener('blur', () => normalizeMoneyInputValue(priceInput));
    priceInput.addEventListener('blur', () => updateSaleRowTotal(row));
    toggleButton.addEventListener('click', () => {
      const isEditing = row.classList.contains('is-editing');
      if (isEditing) {
        const parsed = parseSaleExtraLine(row);
        if (!parsed.addon && !parsed.item) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Completa el extra. Si la materia prima está vinculada, debes elegir su sabor, topping o salsa/aderezo.';
          }
          return;
        }
        if (saleStatus) {
          saleStatus.className = 'status';
          saleStatus.textContent = 'Extra, salsa o aderezo listo en la hoja de venta.';
        }
      }
      setSaleRowEditing(row, !isEditing);
    });
    removeButton.addEventListener('click', () => {
      if (activeSaleRow === row) {
        activeSaleRow = getSaleProductRowForExtraTarget(row);
      }
      row.remove();
      renderSaleInfo();
    });

    saleLines.appendChild(row);
    setActiveSaleRow(row);
    setSaleRowEditing(row, startEditing);
    syncExtraCatalogSelection();
    updateSaleRowTotal(row);
    renderSaleInfo();
    return row;
  }

  function addSaleLine(selectedId = '', initialQuantity = '', initialPrice = '', startEditing = true) {
    const row = document.createElement('div');
    row.className = 'purchase-row sale-line-row';
    row.dataset.lineId = createSaleLineId();
    row.innerHTML = `
      <div class="field">
        <select class="sale-product-source" required>
          ${buildOptions(selectedId)}
        </select>
      </div>
      <div class="field">
        <input type="number" class="sale-quantity" min="1" step="1" placeholder="Ej. 2" value="${initialQuantity}" required />
      </div>
      <div class="field">
        <input type="number" class="sale-price" min="0" step="0.01" placeholder="Ej. 120" value="${initialPrice}" required />
      </div>
      <div class="field">
        <div class="purchase-line-total">C$0,00</div>
      </div>
      <div class="field">
        <div class="purchase-row-actions">
          <button type="button" class="secondary-btn action-icon-btn toggle-sale-line" title="Guardar fila" aria-label="Guardar fila">✓</button>
          <button type="button" class="secondary-btn action-icon-btn toggle-sale-flavor-editor" title="Abrir personalizacion" aria-label="Abrir personalizacion">⚙</button>
          <button type="button" class="delete-product action-icon-btn remove-sale-line" title="Eliminar fila" aria-label="Eliminar fila">🗑</button>
        </div>
      </div>
      <div class="field sale-flavor-field field-hidden">
        <div class="sale-flavor-editor field-hidden">
          <div class="sale-flavor-editor-header">
            <div class="sale-flavor-editor-title">
              <strong>Personalizacion del producto</strong>
              <span>Administra sabores, toppings incluidos y salsas o aderezos desde este cuadro.</span>
            </div>
            <button type="button" class="secondary-btn close-sale-flavor-editor">Cerrar</button>
          </div>
          <div class="sale-flavor-summary sale-flavor-modal-summary"></div>
          <div class="sale-customization-section sale-component-section field-hidden">
            <div class="sale-customization-section-header">
              <strong>Materia prima</strong>
              <span>Consume materia prima directa sin precio extra obligatorio.</span>
            </div>
            <div class="sale-component-rows"></div>
            <div class="sale-flavor-editor-actions">
              <button type="button" class="secondary-btn add-sale-component-row">Agregar componente</button>
            </div>
          </div>
          <div class="sale-customization-section sale-flavor-section field-hidden">
            <div class="sale-customization-section-header">
              <strong>Helado por sabores</strong>
              <span>Distribuye las pelotas del producto</span>
            </div>
            <div class="sale-flavor-rows"></div>
            <div class="sale-flavor-editor-actions">
              <button type="button" class="secondary-btn add-sale-flavor-row">Agregar sabor</button>
            </div>
          </div>
          <div class="sale-customization-section">
            <div class="sale-customization-section-header">
              <strong>Toppings incluidos</strong>
              <span>Estos ya van incluidos en el precio del producto</span>
            </div>
            <div class="sale-addon-rows sale-topping-addon-rows"></div>
            <div class="sale-flavor-editor-actions">
              <button type="button" class="secondary-btn add-sale-addon-row">Agregar topping</button>
            </div>
          </div>
          <div class="sale-customization-section">
            <div class="sale-customization-section-header">
              <strong>Salsas / aderezos</strong>
              <span>Agrega salsas o aderezos desde este cuadro de personalizacion</span>
            </div>
            <div class="sale-sauce-addon-rows sale-addon-rows"></div>
            <div class="sale-flavor-editor-actions">
              <button type="button" class="secondary-btn add-sale-sauce-addon-row">Agregar salsa</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const select = row.querySelector('.sale-product-source');
    const removeButton = row.querySelector('.remove-sale-line');
    const toggleButton = row.querySelector('.toggle-sale-line');
    const toggleFlavorEditorButton = row.querySelector('.toggle-sale-flavor-editor');
    const closeFlavorEditorButton = row.querySelector('.close-sale-flavor-editor');
    const addComponentButton = row.querySelector('.add-sale-component-row');
    const addFlavorButton = row.querySelector('.add-sale-flavor-row');
    const addAddonButton = row.querySelector('.add-sale-addon-row');
    const addSauceAddonButton = row.querySelector('.add-sale-sauce-addon-row');
    const salePriceField = row.querySelector('.sale-price');
    initializeSearchableProductPickers(row);
    row.addEventListener('click', event => {
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select')) {
        setActiveSaleRow(row);
        return;
      }
      setActiveSaleRow(row);
    });
    row.querySelectorAll('.sale-quantity, .sale-price').forEach(input => input.addEventListener('input', () => {
      syncSaleFlavorSummary(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    }));
    select.addEventListener('change', () => {
      setActiveSaleRow(row);
      const selectedProduct = findProductById(select.value);
      row.dataset.flavorEditorOpen = productUsesFreeComponents(selectedProduct) ? 'true' : 'false';
      row.querySelector('.sale-flavor-rows').innerHTML = '';
      row.querySelectorAll('.sale-addon-rows').forEach(container => {
        container.innerHTML = '';
      });
      updateSaleRowFlavorSection(row);
      updateSaleRowTotal(row);
      renderSaleInfo();
    });
    toggleFlavorEditorButton.addEventListener('click', () => {
      if (!findProductById(select.value)) {
        return;
      }
      setActiveSaleRow(row);
      if (row.dataset.flavorEditorOpen !== 'true') {
        closeAllSaleCustomizationEditors(row);
        if (!row.classList.contains('is-editing')) {
          setSaleRowEditing(row, true);
        }
        row.dataset.flavorEditorOpen = 'true';
      } else {
        row.dataset.flavorEditorOpen = 'false';
      }
      updateSaleRowFlavorSection(row);
    });
    closeFlavorEditorButton.addEventListener('click', () => {
      row.dataset.flavorEditorOpen = 'false';
      updateSaleRowFlavorSection(row);
    });
    addComponentButton.addEventListener('click', () => {
      setActiveSaleRow(row);
      addSaleComponentRow(row);
      updateSaleRowFlavorSection(row);
      renderSaleInfo();
    });
    addFlavorButton.addEventListener('click', () => {
      setActiveSaleRow(row);
      addSaleFlavorRow(row);
      updateSaleRowFlavorSection(row);
      renderSaleInfo();
    });
    addAddonButton.addEventListener('click', () => {
      setActiveSaleRow(row);
      addSaleIncludedToppingRow(row);
      updateSaleRowFlavorSection(row);
      renderSaleInfo();
    });
    addSauceAddonButton.addEventListener('click', () => {
      setActiveSaleRow(row);
      addSaleSauceAddonRow(row);
      updateSaleRowFlavorSection(row);
      renderSaleInfo();
    });
    salePriceField.addEventListener('blur', () => normalizeMoneyInputValue(salePriceField));
    salePriceField.addEventListener('blur', () => updateSaleRowTotal(row));
    toggleButton.addEventListener('click', () => {
      const isEditing = row.classList.contains('is-editing');
      if (isEditing) {
        const quantityValue = Number(row.querySelector('.sale-quantity').value);
        const priceValue = Number(row.querySelector('.sale-price').value);
        const producto = findProductById(select.value);
        const selectedComponents = getSaleLineComponents(row);
        const selectedFlavors = getSaleLineSelectedFlavors(row);
        const addonState = getSaleLineAddonState(row);
        const expectedScoops = getExpectedScoopsForLine(row);
        const assignedScoops = selectedFlavors.reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
        if (!select.value || quantityValue <= 0 || Number.isNaN(priceValue)) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Completa producto, cantidad y precio antes de guardar la fila.';
          }
          return;
        }
        if (addonState.hasInvalid) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Cada topping incluido, salsa, aderezo o extra debe tener nombre, cantidad y precio validos cuando corresponda.';
          }
          return;
        }
        if (productUsesFreeComponents(producto) && !selectedComponents.length) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Agrega al menos un componente elegido por el cliente.';
          }
          return;
        }
        if (productUsesFlavors(producto) && !selectedFlavors.length) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Selecciona al menos un sabor para los productos vendidos por pelotitas.';
          }
          return;
        }
        if (productUsesFlavors(producto) && assignedScoops !== expectedScoops) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = `Debes distribuir exactamente ${expectedScoops} pelotas entre los sabores.`;
          }
          return;
        }
        renderSaleStatus('Producto listo en la tabla de venta.');
      }
      setSaleRowEditing(row, !isEditing);
    });
    removeButton.addEventListener('click', () => {
      if (activeSaleRow === row) {
        activeSaleRow = null;
      }
      const linkedExtraRows = getLinkedSaleExtraRows(row);
      row.dataset.flavorEditorOpen = 'false';
      linkedExtraRows.forEach(extraRow => extraRow.remove());
      row.remove();
      if (!saleLines.querySelector('.purchase-row')) {
        addSaleLine();
      }
      syncSaleCustomizationWindowState();
      renderSaleInfo();
    });
    saleLines.appendChild(row);
    setActiveSaleRow(row);
    updateSaleRowFlavorSection(row);
    setSaleRowEditing(row, startEditing);
    updateSaleRowTotal(row);
    renderSaleInfo();
    return row;
  }

  function refreshSaleLinesOptions() {
    saleLines.querySelectorAll('.purchase-row').forEach(row => {
      if (isSaleExtraLineRow(row)) {
        const select = row.querySelector('.sale-extra-source');
        const currentValue = select.value;
        select.innerHTML = buildSaleExtraSelectOptions(currentValue);
        select.value = currentValue;
        updateSaleExtraLinkedField(row);
        syncSearchablePickerTrigger(select);
        return;
      }
      const select = row.querySelector('.sale-product-source');
      const currentValue = select.value;
      select.innerHTML = buildOptions(currentValue);
      select.value = currentValue;
      syncSearchablePickerTrigger(select);
      updateSaleRowFlavorSection(row);
    });
  }

  function calculateSaleTotalAmount() {
    const rows = Array.from(saleLines.querySelectorAll('.purchase-row'));
    return rows.reduce((sum, row) => sum + calculateSaleLineTotal(row), 0);
  }

  function updateSaleCashReconciliation() {
    const totalAmount = calculateSaleTotalAmount();
    const cashPayload = resolveSaleCashPayload(totalAmount);
    const safeReceived = cashPayload.ok ? Number(cashPayload.cashReceived || 0) : 0;
    if (saleCashMethodInput?.value === 'mixto' && saleCashReceivedInput) {
      saleCashReceivedInput.value = safeReceived > 0 ? safeReceived.toFixed(2) : '';
    }
    const change = Math.max(safeReceived - totalAmount, 0);
    saleCashTotalText.textContent = formatCurrency(totalAmount);
    saleCashChangeText.textContent = formatCurrency(change);
  }

  function updateSaleReferenceVisibility() {
    const isMixed = saleCashMethodInput.value === 'mixto';
    const shouldShowReference = !isMixed && requiresPaymentReference(saleCashMethodInput.value);
    saleCashReferenceRow.classList.toggle('field-hidden', !shouldShowReference);
    saleCashMixedRow?.classList.toggle('field-hidden', !isMixed);
    saleCashReferenceInput.required = shouldShowReference;
    if (!shouldShowReference) {
      saleCashReferenceInput.value = '';
    }
    if (!isMixed) {
      if (saleCashMixedCashInput) saleCashMixedCashInput.value = '';
      if (saleCashMixedTransferInput) saleCashMixedTransferInput.value = '';
      if (saleCashMixedTransferReferenceInput) saleCashMixedTransferReferenceInput.value = '';
      if (saleCashMixedCardInput) saleCashMixedCardInput.value = '';
      if (saleCashMixedCardReferenceInput) saleCashMixedCardReferenceInput.value = '';
    }
  }

  function renderSaleInfo() {
    const rows = Array.from(saleLines.querySelectorAll('.purchase-row'));
    if (!rows.length) {
      saleInfo.textContent = 'Agrega al menos un producto a la factura.';
      saleTotal.textContent = 'C$0,00';
      updateSaleCashReconciliation();
      return;
    }
    const productRows = rows.filter(isSaleProductLineRow);
    const extraRows = rows.filter(isSaleExtraLineRow);
    const totalAmount = calculateSaleTotalAmount();
    const formattedTotal = formatCurrency(totalAmount);
    const expectedScoops = productRows.reduce((sum, row) => sum + getExpectedScoopsForLine(row), 0);
    const assignedScoops = productRows.reduce((sum, row) => sum + getSaleLineSelectedFlavors(row).reduce((rowSum, flavor) => rowSum + Number(flavor.porciones || 0), 0), 0);
    const modalAddonsTotal = productRows.reduce((sum, row) => sum + calculateSaleAddonsTotal(getSaleLineAddons(row)), 0);
    const modalComponentsTotal = productRows.reduce((sum, row) => sum + calculateSaleComponentsTotal(row), 0);
    const extraLinesTotal = extraRows.reduce((sum, row) => sum + calculateSaleLineTotal(row), 0);
    saleInfo.innerHTML = `<strong>${rows.length} líneas</strong> · Productos: ${productRows.length}${extraRows.length ? ` · Extras: ${extraRows.length}` : ''} · Total estimado: ${formattedTotal}${modalAddonsTotal || extraLinesTotal ? ` · Adicionales: ${formatCurrency(modalAddonsTotal + extraLinesTotal)}` : ''}${expectedScoops ? ` · Pelotas asignadas: ${assignedScoops}/${expectedScoops}` : ''}`;
    saleInfo.innerHTML = `<strong>${rows.length} lineas</strong> - Productos: ${productRows.length}${extraRows.length ? ` - Extras: ${extraRows.length}` : ''} - Total estimado: ${formattedTotal}${modalAddonsTotal || modalComponentsTotal || extraLinesTotal ? ` - Personalizacion: ${formatCurrency(modalAddonsTotal + modalComponentsTotal + extraLinesTotal)}` : ''}${expectedScoops ? ` - Pelotas asignadas: ${assignedScoops}/${expectedScoops}` : ''}`;
    saleTotal.textContent = formattedTotal;
    updateSaleCashReconciliation();
  }

  function updateSalePaymentSection() {
    const paymentType = salePaymentTypeInput.value;
    saleDueDateField.classList.toggle('field-hidden', paymentType !== 'credito');
    if (paymentType === 'contado') {
      const selectedMethod = saleCashMethodInput.value || 'sin metodo';
      openSaleCajaButton.classList.remove('field-hidden');
      salePaymentSummary.textContent = selectedMethod === 'mixto'
        ? 'Contado activo: mixto. Define el desglose en CAJA y pulsa Guardar.'
        : `Contado activo: ${selectedMethod}. Abre CAJA para cuadre.`;
    } else {
      openSaleCajaButton.classList.add('field-hidden');
      saleCajaFloat.classList.add('field-hidden');
      saleCajaBackdrop?.classList.add('field-hidden');
      salePaymentSummary.textContent = 'Venta a credito: define fecha de vencimiento.';
    }
    updateSaleReferenceVisibility();
    updateSaleCashReconciliation();
  }

  function installListeners() {
    if (listenersInstalled) {
      return;
    }
    listenersInstalled = true;

    addSaleLineButton.addEventListener('click', () => {
      const editingRow = Array.from(saleLines.querySelectorAll('.purchase-row')).find(row => row.classList.contains('is-editing'));
      if (editingRow) {
        if (isSaleExtraLineRow(editingRow)) {
          const parsedExtra = parseSaleExtraLine(editingRow);
          if (!parsedExtra.addon && !parsedExtra.item) {
            if (saleStatus) {
              saleStatus.className = 'status error';
              saleStatus.textContent = 'Completa el extra actual antes de agregar otro producto.';
            }
            return;
          }
        } else {
          const select = editingRow.querySelector('.sale-product-source');
          const quantityValue = Number(editingRow.querySelector('.sale-quantity').value);
          const priceValue = Number(editingRow.querySelector('.sale-price').value);
          if (!select.value || quantityValue <= 0 || Number.isNaN(priceValue)) {
            if (saleStatus) {
              saleStatus.className = 'status error';
              saleStatus.textContent = 'Completa la fila actual antes de agregar otro producto.';
            }
            return;
          }
        }
        setSaleRowEditing(editingRow, false);
      }
      addSaleLine();
    });

    addSaleExtraButton.addEventListener('click', () => {
      const targetRow = getTargetSaleRowForExtra();
      if (!targetRow) {
        if (saleStatus) {
          saleStatus.className = 'status error';
          saleStatus.textContent = 'Agrega primero un producto para poder cargar extras.';
        }
        return;
      }
      setActiveSaleRow(targetRow);
      closeAllSaleCustomizationEditors(targetRow);
      if (!targetRow.classList.contains('is-editing')) {
        setSaleRowEditing(targetRow, true);
      }
      addSaleExtraLine(targetRow);
      renderSaleInfo();
      if (saleStatus) {
        saleStatus.className = 'status';
        saleStatus.textContent = 'Extra agregado como linea independiente en la hoja principal.';
      }
    });

    salePaymentTypeInput.addEventListener('change', () => updateSalePaymentSection());
    saleCashMethodInput.addEventListener('change', () => {
      updateSaleReferenceVisibility();
      updateSalePaymentSection();
      setSaleCashDraftMessage('Actualiza los datos de CAJA y pulsa Guardar para confirmar.', false);
    });
    saleCashReceivedInput.addEventListener('input', () => updateSaleCashReconciliation());
    [saleCashMixedCashInput, saleCashMixedTransferInput, saleCashMixedCardInput].forEach(input => {
      input?.addEventListener('input', () => {
        updateSaleCashReconciliation();
        setSaleCashDraftMessage('Cambios pendientes en CAJA. Pulsa Guardar para confirmar.', false);
      });
    });
    [saleCashMixedTransferReferenceInput, saleCashMixedCardReferenceInput, saleCashReferenceInput].forEach(input => {
      input?.addEventListener('input', () => {
        setSaleCashDraftMessage('Cambios pendientes en CAJA. Pulsa Guardar para confirmar.', false);
      });
    });
    saveSaleCajaConfigButton?.addEventListener('click', () => {
      const totalAmount = calculateSaleTotalAmount();
      const payload = resolveSaleCashPayload(totalAmount, { forSubmit: true });
      if (!payload.ok) {
        setSaleCashDraftMessage(payload.error, true);
        return;
      }
      setSaleCashDraftMessage('Datos de CAJA guardados para esta venta.', false);
      updateSaleCashReconciliation();
    });
    saleDueDateInput?.addEventListener('change', () => updateSalePaymentSection());
  }

  return {
    getSaleLineSelectedFlavors,
    getSaleLineComponents,
    isSaleExtraLineRow,
    isSaleProductLineRow,
    parseSaleExtraLine,
    getSaleLineAddonState,
    getSaleLineAddons,
    calculateSaleAddonsTotal,
    calculateSaleComponentsTotal,
    calculateSaleTotalAmount,
    getTargetSaleRowForExtra,
    addSaleExtraLine,
    addSaleLine,
    refreshSaleLinesOptions,
    renderSaleInfo,
    updateSalePaymentSection,
    updateSaleCashReconciliation,
    updateSaleReferenceVisibility,
    resolveSaleCashPayload,
    closeActiveSaleCustomizationEditor,
    installListeners,
  };
}
