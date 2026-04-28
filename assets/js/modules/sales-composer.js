export function createSalesComposerModule(context) {
  const {
    state,
    addSaleExtraButton,
    addSaleLineButton,
    buildOptions,
    buildSaleExtraSelectOptions,
    buildToppingOptions,
    buildSauceOptions,
    escapeHtml,
    findProductById,
    findSaleExtraCatalogItem,
    formatCurrency,
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
    productUsesRecipe,
    requiresPaymentReference,
    saleCajaFloat,
    saleCashChangeText,
    saleCashMethodInput,
    saleCashReceivedInput,
    saleCashReferenceInput,
    saleCashReferenceRow,
    saleCashTotalText,
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
    const quantityInput = row.querySelector('.sale-quantity');
    const priceInput = row.querySelector('.sale-price');
    const name = String(nameInput?.value || '').trim();
    const quantityRaw = String(quantityInput?.value || '').trim();
    const priceRaw = String(priceInput?.value || '').trim().replace(',', '.');
    const quantity = Number(quantityRaw);
    const price = priceRaw === '' ? 0 : Number(priceRaw);
    const isEmpty = !name && !quantityRaw && !priceRaw;

    if (isEmpty) {
      return { isEmpty: true, isValid: true, addon: null };
    }

    const isValid = Boolean(name) && Number.isInteger(quantity) && quantity > 0 && !Number.isNaN(price) && price >= 0;
    const matchedTopping = getToppingByName(name);
    const matchedSauce = !matchedTopping ? getSauceByName(name) : null;
    const matchedAddon = matchedTopping || matchedSauce;
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
            tipo: 'extra',
            nombre: name,
            cantidad: quantity,
            precio: price,
            addonCategory: matchedTopping ? 'topping' : matchedSauce ? 'sauce' : null,
            materiaPrimaId: matchedAddon ? matchedAddon.materiaPrimaId : null,
            materiaPrimaNombre: matchedAddon ? matchedAddon.materiaPrimaNombre : null
          }
        : null
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
    const baseTotal = Number.isNaN(quantity) || Number.isNaN(price) ? 0 : quantity * price;
    return baseTotal + addonsTotal;
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
    const chips = [
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

    if (flavorSummary) {
      flavorSummary.innerHTML = buildSaleFlavorSummaryMarkup(row);
    }
    if (flavorToggleButton) {
      const isOpen = row.dataset.flavorEditorOpen === 'true';
      const detail = productUsesFlavors(producto)
        ? `${assignedScoops}/${expectedScoops} pelotas${addonsTotal ? ` y ${formatCurrency(addonsTotal)} en extras` : ''}`
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

  function updateSaleRowFlavorSection(row) {
    const select = row.querySelector('.sale-product-source');
    const flavorField = row.querySelector('.sale-flavor-field');
    const flavorEditor = row.querySelector('.sale-flavor-editor');
    const flavorToggleButton = row.querySelector('.toggle-sale-flavor-editor');
    const flavorSection = row.querySelector('.sale-flavor-section');
    const flavorRows = row.querySelector('.sale-flavor-rows');
    const addFlavorButton = row.querySelector('.add-sale-flavor-row');
    const addonContainers = Array.from(row.querySelectorAll('.sale-addon-rows'));
    const addAddonButton = row.querySelector('.add-sale-addon-row');
    const addSauceAddonButton = row.querySelector('.add-sale-sauce-addon-row');
    const producto = findProductById(select.value);
    const shouldShowCustomization = Boolean(producto) && (productUsesFlavors(producto) || productUsesRecipe(producto));
    const shouldShowFlavors = shouldShowSaleFlavorSection(producto);

    flavorField.classList.toggle('field-hidden', !shouldShowCustomization);
    flavorToggleButton.classList.toggle('field-hidden', !shouldShowCustomization);
    if (!shouldShowCustomization) {
      row.dataset.flavorEditorOpen = 'false';
      flavorRows.innerHTML = '';
      addonContainers.forEach(container => {
        container.innerHTML = '';
      });
      syncSaleFlavorSummary(row);
      syncSaleCustomizationWindowState();
      return;
    }

    flavorSection.classList.toggle('field-hidden', !shouldShowFlavors);
    flavorSection.hidden = !shouldShowFlavors;
    flavorSection.style.display = shouldShowFlavors ? '' : 'none';

    if (!shouldShowFlavors) {
      flavorRows.innerHTML = '';
      row.dataset.flavorEditorOpen = row.classList.contains('is-editing') ? 'true' : 'false';
    }

    if (!row.dataset.flavorEditorOpen) {
      row.dataset.flavorEditorOpen = 'false';
    }

    flavorToggleButton.disabled = false;

    if (shouldShowFlavors && !flavorRows.querySelector('.sale-flavor-row') && row.classList.contains('is-editing')) {
      addSaleFlavorRow(row);
    }

    flavorEditor.classList.toggle('field-hidden', row.dataset.flavorEditorOpen !== 'true');
    addFlavorButton.disabled = !row.classList.contains('is-editing') || !shouldShowFlavors || !getAvailableSaleFlavors().length;
    addAddonButton.disabled = !row.classList.contains('is-editing');
    addSauceAddonButton.disabled = !row.classList.contains('is-editing');
    flavorRows.querySelectorAll('.sale-flavor-row').forEach(flavorRow => {
      flavorRow.querySelector('.sale-flavor-select').disabled = !row.classList.contains('is-editing');
      flavorRow.querySelector('.sale-flavor-amount').disabled = !row.classList.contains('is-editing');
      flavorRow.querySelector('.remove-sale-flavor-row').disabled = !row.classList.contains('is-editing');
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

    syncSaleFlavorSummary(row);
    syncSaleCustomizationWindowState();
  }

  function setSaleRowEditing(row, isEditing) {
    if (isSaleExtraLineRow(row)) {
      row.classList.toggle('is-editing', isEditing);
      row.querySelector('.sale-extra-source').disabled = false;
      row.querySelector('.sale-quantity').disabled = false;
      row.querySelector('.sale-price').disabled = false;
      const toggleButton = row.querySelector('.toggle-sale-line');
      toggleButton.textContent = isEditing ? '✓' : '✎';
      toggleButton.title = isEditing ? 'Guardar extra' : 'Editar extra';
      toggleButton.setAttribute('aria-label', isEditing ? 'Guardar extra' : 'Editar extra');
      syncSearchablePickerTrigger(row.querySelector('.sale-extra-source'));
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
        updateSaleRowTotal(row);
        renderSaleInfo();
        return;
      }

      const previousCatalogName = row.dataset.extraCatalogName || '';
      const previousAutoPrice = row.dataset.extraAutoPrice || '';
      const currentPriceValue = String(priceInput.value || '').trim();
      const nextAutoPrice = Number(catalogItem.price || 0) ? Number(catalogItem.price).toFixed(2) : '';
      const shouldReplacePrice = !currentPriceValue || currentPriceValue === previousAutoPrice || previousCatalogName !== catalogItem.name;

      row.dataset.extraCatalogName = catalogItem.name;
      row.dataset.extraAutoPrice = nextAutoPrice;
      if (shouldReplacePrice) {
        priceInput.value = nextAutoPrice;
      }
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
    quantityInput.addEventListener('input', () => {
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
        if (!parsed.addon) {
          if (saleStatus) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Completa nombre, cantidad y precio del extra antes de guardarlo.';
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
          <button type="button" class="secondary-btn action-icon-btn toggle-sale-flavor-editor field-hidden" title="Abrir personalizacion" aria-label="Abrir personalizacion">⚙</button>
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
      row.dataset.flavorEditorOpen = 'false';
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
    const received = Number(saleCashReceivedInput.value);
    const safeReceived = Number.isNaN(received) ? 0 : received;
    const change = Math.max(safeReceived - totalAmount, 0);
    saleCashTotalText.textContent = formatCurrency(totalAmount);
    saleCashChangeText.textContent = formatCurrency(change);
  }

  function updateSaleReferenceVisibility() {
    const shouldShowReference = requiresPaymentReference(saleCashMethodInput.value);
    saleCashReferenceRow.classList.toggle('field-hidden', !shouldShowReference);
    saleCashReferenceInput.required = shouldShowReference;
    if (!shouldShowReference) {
      saleCashReferenceInput.value = '';
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
    const extraLinesTotal = extraRows.reduce((sum, row) => sum + calculateSaleLineTotal(row), 0);
    saleInfo.innerHTML = `<strong>${rows.length} líneas</strong> · Productos: ${productRows.length}${extraRows.length ? ` · Extras: ${extraRows.length}` : ''} · Total estimado: ${formattedTotal}${modalAddonsTotal || extraLinesTotal ? ` · Adicionales: ${formatCurrency(modalAddonsTotal + extraLinesTotal)}` : ''}${expectedScoops ? ` · Pelotas asignadas: ${assignedScoops}/${expectedScoops}` : ''}`;
    saleTotal.textContent = formattedTotal;
    updateSaleCashReconciliation();
  }

  function updateSalePaymentSection() {
    const paymentType = salePaymentTypeInput.value;
    saleDueDateField.classList.toggle('field-hidden', paymentType !== 'credito');
    if (paymentType === 'contado') {
      const selectedMethod = saleCashMethodInput.value || 'sin metodo';
      openSaleCajaButton.classList.remove('field-hidden');
      salePaymentSummary.textContent = `Contado activo: ${selectedMethod}. Abre CAJA para cuadre.`;
    } else {
      openSaleCajaButton.classList.add('field-hidden');
      saleCajaFloat.classList.add('field-hidden');
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
          if (!parseSaleExtraLine(editingRow).addon) {
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
    });
    saleCashReceivedInput.addEventListener('input', () => updateSaleCashReconciliation());
    saleDueDateInput?.addEventListener('change', () => updateSalePaymentSection());
  }

  return {
    getSaleLineSelectedFlavors,
    isSaleExtraLineRow,
    isSaleProductLineRow,
    parseSaleExtraLine,
    getSaleLineAddonState,
    getSaleLineAddons,
    calculateSaleAddonsTotal,
    calculateSaleTotalAmount,
    getTargetSaleRowForExtra,
    addSaleExtraLine,
    addSaleLine,
    refreshSaleLinesOptions,
    renderSaleInfo,
    updateSalePaymentSection,
    updateSaleCashReconciliation,
    updateSaleReferenceVisibility,
    closeActiveSaleCustomizationEditor,
    installListeners,
  };
}
