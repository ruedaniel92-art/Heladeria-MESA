export function createFlavorsModule(context) {
  const {
    state,
    buildApiUrl,
    calculateFlavorUsageCount,
    cancelFlavorEditButton,
    cancelSauceEditButton,
    cancelToppingEditButton,
    fetchSabores,
    fetchSauces,
    fetchToppings,
    flavorForm,
    flavorList,
    flavorNameInput,
    flavorRawMaterialInput,
    flavorStatus,
    flavorSubmitButton,
    formatInventoryQuantity,
    getSauceAvailableStock,
    getToppingAvailableStock,
    populateRawMaterialSelect,
    refreshSaleExtraCatalogOptions,
    refreshSaleLinesOptions,
    renderBucketControls,
    renderSaleInfo,
    renderSauceControls,
    renderToppingControls,
    sauceForm,
    sauceList,
    sauceNameInput,
    sauceRawMaterialInput,
    sauceStatus,
    sauceSubmitButton,
    syncDynamicTableExport,
    toppingForm,
    toppingList,
    toppingNameInput,
    toppingRawMaterialInput,
    toppingStatus,
    toppingSubmitButton,
  } = context;

  let editingFlavorId = null;
  let editingToppingId = null;
  let editingSauceId = null;

  function getEditingFlavorId() {
    return editingFlavorId;
  }

  function getEditingToppingId() {
    return editingToppingId;
  }

  function getEditingSauceId() {
    return editingSauceId;
  }

  function getToppingById(toppingId) {
    return state.toppings.find(item => String(item.id) === String(toppingId)) || null;
  }

  function getSauceById(sauceId) {
    return state.sauces.find(item => String(item.id) === String(sauceId)) || null;
  }

  function renderEmptyList(container, message) {
    const paragraph = document.createElement('p');
    paragraph.className = 'product-list-empty';
    paragraph.textContent = message;
    container.replaceChildren(paragraph);
  }

  function createTextCell(value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    return cell;
  }

  function createActionButton({ className, title, label, onClick, disabled = false }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  function createTable(headers, rows, tableClassName = 'history-table') {
    const table = document.createElement('table');
    table.className = tableClassName;

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(label => {
      const cell = document.createElement('th');
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    rows.forEach(row => tbody.appendChild(row));
    table.append(thead, tbody);
    return table;
  }

  function startEditFlavor(flavorId) {
    const flavor = state.sabores.find(item => String(item.id) === String(flavorId));
    if (!flavor) {
      flavorStatus.textContent = 'Sabor no encontrado para editar.';
      return;
    }

    editingFlavorId = flavor.id;
    flavorNameInput.value = flavor.nombre;
    populateRawMaterialSelect(flavorRawMaterialInput, flavor.materiaPrimaId || '');
    flavorRawMaterialInput.value = flavor.materiaPrimaId || '';
    flavorSubmitButton.textContent = 'Guardar cambios';
    cancelFlavorEditButton.style.display = 'inline-flex';
    flavorStatus.textContent = `Editando sabor ${flavor.nombre}.`;
  }

  function cancelEditFlavor() {
    editingFlavorId = null;
    flavorForm.reset();
    populateRawMaterialSelect(flavorRawMaterialInput);
    flavorSubmitButton.textContent = 'Agregar sabor';
    cancelFlavorEditButton.style.display = 'none';
    flavorStatus.textContent = 'Registra aqui los sabores para usarlos en las ventas por pelotitas.';
  }

  async function deleteFlavor(flavorId) {
    try {
      const response = await fetch(buildApiUrl(`/sabores/${encodeURIComponent(flavorId)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el sabor.');
      flavorStatus.textContent = result.message || 'Sabor eliminado correctamente.';
      await fetchSabores();
    } catch (error) {
      flavorStatus.textContent = error.message;
      console.error(error);
    }
  }

  function startEditTopping(toppingId) {
    const topping = getToppingById(toppingId);
    if (!topping) {
      toppingStatus.textContent = 'Topping no encontrado para editar.';
      return;
    }

    editingToppingId = topping.id;
    toppingNameInput.value = topping.nombre;
    populateRawMaterialSelect(toppingRawMaterialInput, topping.materiaPrimaId || '');
    toppingRawMaterialInput.value = topping.materiaPrimaId || '';
    toppingSubmitButton.textContent = 'Guardar cambios';
    cancelToppingEditButton.style.display = 'inline-flex';
    toppingStatus.textContent = `Editando topping ${topping.nombre}.`;
  }

  function cancelEditTopping() {
    editingToppingId = null;
    toppingForm.reset();
    populateRawMaterialSelect(toppingRawMaterialInput);
    toppingSubmitButton.textContent = 'Agregar topping';
    cancelToppingEditButton.style.display = 'none';
    toppingStatus.textContent = 'Registra los toppings como materia prima para descontarlos en cada venta.';
  }

  async function deleteTopping(toppingId) {
    try {
      const response = await fetch(buildApiUrl(`/toppings/${encodeURIComponent(toppingId)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el topping.');
      toppingStatus.textContent = result.message || 'Topping eliminado correctamente.';
      await fetchToppings();
      renderToppingList();
      refreshSaleLinesOptions();
      renderSaleInfo();
    } catch (error) {
      toppingStatus.textContent = error.message;
      console.error(error);
    }
  }

  function startEditSauce(sauceId) {
    const sauce = getSauceById(sauceId);
    if (!sauce) {
      sauceStatus.textContent = 'Salsa/aderezo no encontrado para editar.';
      return;
    }

    editingSauceId = sauce.id;
    sauceNameInput.value = sauce.nombre;
    populateRawMaterialSelect(sauceRawMaterialInput, sauce.materiaPrimaId || '');
    sauceRawMaterialInput.value = sauce.materiaPrimaId || '';
    sauceSubmitButton.textContent = 'Guardar cambios';
    cancelSauceEditButton.style.display = 'inline-flex';
    sauceStatus.textContent = `Editando salsa/aderezo ${sauce.nombre}.`;
  }

  function cancelEditSauce() {
    editingSauceId = null;
    sauceForm.reset();
    populateRawMaterialSelect(sauceRawMaterialInput);
    sauceSubmitButton.textContent = 'Agregar salsa';
    cancelSauceEditButton.style.display = 'none';
    sauceStatus.textContent = 'Registra aqui las salsas, aderezos o crema batida como materia prima para descontarlos en cada venta.';
  }

  async function deleteSauce(sauceId) {
    try {
      const response = await fetch(buildApiUrl(`/salsas/${encodeURIComponent(sauceId)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar la salsa/aderezo.');
      sauceStatus.textContent = result.message || 'Salsa/aderezo eliminada correctamente.';
      await fetchSauces();
      renderSauceList();
      renderSauceControls();
      refreshSaleExtraCatalogOptions();
      refreshSaleLinesOptions();
      renderSaleInfo();
    } catch (error) {
      sauceStatus.textContent = error.message;
      console.error(error);
    }
  }

  function renderFlavorList() {
    if (!flavorList) return;
    if (!state.sabores.length) {
      renderEmptyList(flavorList, 'Aun no has registrado sabores. Crea sabores como vainilla, fresa o chocolate para usarlos en ventas de pelotitas.');
      return;
    }

    const rows = state.sabores.map(flavor => {
      const usageCount = calculateFlavorUsageCount(flavor.id);
      const row = document.createElement('tr');
      row.append(
        createTextCell(flavor.nombre || ''),
        createTextCell(flavor.materiaPrimaNombre || 'Sin balde'),
        createTextCell(String(usageCount))
      );

      const actionCell = document.createElement('td');
      const actionButtons = document.createElement('div');
      actionButtons.className = 'action-buttons';
      actionButtons.append(
        createActionButton({
          className: 'secondary-btn action-icon-btn edit-flavor',
          title: 'Editar sabor',
          label: '✎',
          onClick: () => startEditFlavor(flavor.id)
        }),
        createActionButton({
          className: 'delete-product action-icon-btn delete-flavor',
          title: 'Eliminar sabor',
          label: '🗑',
          disabled: usageCount > 0,
          onClick: () => deleteFlavor(flavor.id)
        })
      );
      actionCell.appendChild(actionButtons);
      row.appendChild(actionCell);
      return row;
    });

    flavorList.replaceChildren(createTable(['Sabor', 'Balde vinculado', 'Uso en ventas', 'Acciones'], rows, 'product-table'));
    syncDynamicTableExport(flavorList, {
      title: 'Sabores registrados',
      fileBase: 'sabores-registrados',
      sheetName: 'Sabores'
    });
  }

  function renderToppingList() {
    if (!toppingList) return;
    if (!state.toppings.length) {
      renderEmptyList(toppingList, 'Aun no has registrado toppings. Crea toppings como chispas, oreo o mani y enlazalos a su materia prima.');
      return;
    }

    const rows = state.toppings.map(topping => {
      const usageCount = state.sales.reduce((sum, venta) => sum + (Array.isArray(venta.items)
        ? venta.items.reduce((itemSum, item) => itemSum + (Array.isArray(item.adicionales)
          ? item.adicionales.reduce((addonSum, addon) => addonSum + (String(addon.id) === String(topping.id) ? Number(addon.cantidad || 0) : 0), 0)
          : 0), 0)
        : 0), 0);
      const toppingAvailableStock = getToppingAvailableStock(topping.id);
      const row = document.createElement('tr');
      row.append(
        createTextCell(topping.nombre || ''),
        createTextCell(topping.materiaPrimaNombre || ''),
        createTextCell(formatInventoryQuantity(toppingAvailableStock))
      );

      const actionCell = document.createElement('td');
      const actionButtons = document.createElement('div');
      actionButtons.className = 'action-buttons';
      actionButtons.append(
        createActionButton({
          className: 'secondary-btn action-icon-btn edit-topping',
          title: 'Editar topping',
          label: '✎',
          onClick: () => startEditTopping(topping.id)
        }),
        createActionButton({
          className: 'delete-product action-icon-btn delete-topping',
          title: 'Eliminar topping',
          label: '🗑',
          disabled: usageCount > 0,
          onClick: () => deleteTopping(topping.id)
        })
      );
      actionCell.appendChild(actionButtons);
      row.appendChild(actionCell);
      return row;
    });

    toppingList.replaceChildren(createTable(['Topping', 'Materia prima', 'Stock', 'Acciones'], rows));
    syncDynamicTableExport(toppingList, {
      title: 'Toppings registrados',
      fileBase: 'toppings-registrados',
      sheetName: 'Toppings'
    });
  }

  function renderSauceList() {
    if (!sauceList) return;
    if (!state.sauces.length) {
      renderEmptyList(sauceList, 'Aun no has registrado salsas, aderezos o crema batida. Crea sus nombres y enlazalos a su materia prima.');
      return;
    }

    const rows = state.sauces.map(sauce => {
      const usageCount = state.sales.reduce((sum, venta) => sum + (Array.isArray(venta.items)
        ? venta.items.reduce((itemSum, item) => itemSum + (Array.isArray(item.adicionales)
          ? item.adicionales.reduce((addonSum, addon) => addonSum + (String(addon.id) === String(sauce.id) ? Number(addon.cantidad || 0) : 0), 0)
          : 0), 0)
        : 0), 0);
      const sauceAvailableStock = getSauceAvailableStock(sauce.id);
      const row = document.createElement('tr');
      row.append(
        createTextCell(sauce.nombre || ''),
        createTextCell(sauce.materiaPrimaNombre || ''),
        createTextCell(formatInventoryQuantity(sauceAvailableStock))
      );

      const actionCell = document.createElement('td');
      const actionButtons = document.createElement('div');
      actionButtons.className = 'action-buttons';
      actionButtons.append(
        createActionButton({
          className: 'secondary-btn action-icon-btn edit-sauce',
          title: 'Editar salsa',
          label: '✎',
          onClick: () => startEditSauce(sauce.id)
        }),
        createActionButton({
          className: 'delete-product action-icon-btn delete-sauce',
          title: 'Eliminar salsa',
          label: '🗑',
          disabled: usageCount > 0,
          onClick: () => deleteSauce(sauce.id)
        })
      );
      actionCell.appendChild(actionButtons);
      row.appendChild(actionCell);
      return row;
    });

    sauceList.replaceChildren(createTable(['Salsa / aderezo', 'Materia prima', 'Stock', 'Acciones'], rows));
    syncDynamicTableExport(sauceList, {
      title: 'Salsas y aderezos registrados',
      fileBase: 'salsas-aderezos-registrados',
      sheetName: 'Salsas y Aderezos'
    });
  }

  return {
    getEditingFlavorId,
    getEditingToppingId,
    getEditingSauceId,
    getToppingById,
    getSauceById,
    startEditFlavor,
    cancelEditFlavor,
    deleteFlavor,
    startEditTopping,
    cancelEditTopping,
    deleteTopping,
    startEditSauce,
    cancelEditSauce,
    deleteSauce,
    renderFlavorList,
    renderToppingList,
    renderSauceList,
  };
}
