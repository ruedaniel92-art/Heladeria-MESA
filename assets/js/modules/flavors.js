export function createFlavorsModule(context) {
  const {
    state,
    buildApiUrl,
    buildRawMaterialOptions,
    calculateFlavorUsageCount,
    cancelFlavorEditButton,
    cancelSauceEditButton,
    cancelToppingEditButton,
    escapeHtml,
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
    refreshSaleExtraCatalogOptions,
    refreshSaleLinesOptions,
    renderSaleInfo,
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
    renderBucketControls,
    renderSauceControls,
    renderToppingControls,
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

  function startEditFlavor(flavorId) {
    const flavor = state.sabores.find(item => String(item.id) === String(flavorId));
    if (!flavor) {
      flavorStatus.textContent = 'Sabor no encontrado para editar.';
      return;
    }

    editingFlavorId = flavor.id;
    flavorNameInput.value = flavor.nombre;
    flavorRawMaterialInput.innerHTML = buildRawMaterialOptions(flavor.materiaPrimaId || '');
    flavorRawMaterialInput.value = flavor.materiaPrimaId || '';
    flavorSubmitButton.textContent = 'Guardar cambios';
    cancelFlavorEditButton.style.display = 'inline-flex';
    flavorStatus.textContent = `Editando sabor ${flavor.nombre}.`;
  }

  function cancelEditFlavor() {
    editingFlavorId = null;
    flavorForm.reset();
    flavorRawMaterialInput.innerHTML = buildRawMaterialOptions();
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
    toppingRawMaterialInput.innerHTML = buildRawMaterialOptions(topping.materiaPrimaId || '');
    toppingRawMaterialInput.value = topping.materiaPrimaId || '';
    toppingSubmitButton.textContent = 'Guardar cambios';
    cancelToppingEditButton.style.display = 'inline-flex';
    toppingStatus.textContent = `Editando topping ${topping.nombre}.`;
  }

  function cancelEditTopping() {
    editingToppingId = null;
    toppingForm.reset();
    toppingRawMaterialInput.innerHTML = buildRawMaterialOptions();
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
    sauceRawMaterialInput.innerHTML = buildRawMaterialOptions(sauce.materiaPrimaId || '');
    sauceRawMaterialInput.value = sauce.materiaPrimaId || '';
    sauceSubmitButton.textContent = 'Guardar cambios';
    cancelSauceEditButton.style.display = 'inline-flex';
    sauceStatus.textContent = `Editando salsa/aderezo ${sauce.nombre}.`;
  }

  function cancelEditSauce() {
    editingSauceId = null;
    sauceForm.reset();
    sauceRawMaterialInput.innerHTML = buildRawMaterialOptions();
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
      flavorList.innerHTML = '<p class="product-list-empty">Aun no has registrado sabores. Crea sabores como vainilla, fresa o chocolate para usarlos en ventas de pelotitas.</p>';
      return;
    }

    flavorList.innerHTML = `
      <table class="product-table">
        <thead>
          <tr>
            <th>Sabor</th>
            <th>Balde vinculado</th>
            <th>Uso en ventas</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.sabores.map(flavor => {
            const usageCount = calculateFlavorUsageCount(flavor.id);
            return `
              <tr>
                <td>${escapeHtml(flavor.nombre)}</td>
                <td>${escapeHtml(flavor.materiaPrimaNombre || 'Sin balde')}</td>
                <td>${usageCount}</td>
                <td>
                  <div class="action-buttons">
                    <button type="button" class="secondary-btn action-icon-btn edit-flavor" data-id="${escapeHtml(flavor.id)}" title="Editar sabor">&#9998;</button>
                    <button type="button" class="delete-product action-icon-btn delete-flavor" data-id="${escapeHtml(flavor.id)}" ${usageCount > 0 ? 'disabled' : ''} title="Eliminar sabor">&#128465;</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(flavorList, {
      title: 'Sabores registrados',
      fileBase: 'sabores-registrados',
      sheetName: 'Sabores'
    });

    flavorList.querySelectorAll('.edit-flavor').forEach(button => {
      button.addEventListener('click', () => startEditFlavor(button.dataset.id));
    });
    flavorList.querySelectorAll('.delete-flavor').forEach(button => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        await deleteFlavor(button.dataset.id);
      });
    });
  }

  function renderToppingList() {
    if (!toppingList) return;
    if (!state.toppings.length) {
      toppingList.innerHTML = '<p class="product-list-empty">Aun no has registrado toppings. Crea toppings como chispas, oreo o mani y enlazalos a su materia prima.</p>';
      return;
    }

    toppingList.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Topping</th>
            <th>Materia prima</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.toppings.map(topping => {
            const usageCount = state.sales.reduce((sum, venta) => sum + (Array.isArray(venta.items)
              ? venta.items.reduce((itemSum, item) => itemSum + (Array.isArray(item.adicionales)
                ? item.adicionales.reduce((addonSum, addon) => addonSum + (String(addon.id) === String(topping.id) ? Number(addon.cantidad || 0) : 0), 0)
                : 0), 0)
              : 0), 0);
            const toppingAvailableStock = getToppingAvailableStock(topping.id);
            return `
              <tr>
                <td>${escapeHtml(topping.nombre)}</td>
                <td>${escapeHtml(topping.materiaPrimaNombre || '')}</td>
                <td>${formatInventoryQuantity(toppingAvailableStock)}</td>
                <td>
                  <div class="action-buttons">
                    <button type="button" class="secondary-btn action-icon-btn edit-topping" data-id="${escapeHtml(topping.id)}" title="Editar topping">&#9998;</button>
                    <button type="button" class="delete-product action-icon-btn delete-topping" data-id="${escapeHtml(topping.id)}" ${usageCount > 0 ? 'disabled' : ''} title="Eliminar topping">&#128465;</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(toppingList, {
      title: 'Toppings registrados',
      fileBase: 'toppings-registrados',
      sheetName: 'Toppings'
    });

    toppingList.querySelectorAll('.edit-topping').forEach(button => {
      button.addEventListener('click', () => startEditTopping(button.dataset.id));
    });
    toppingList.querySelectorAll('.delete-topping').forEach(button => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        await deleteTopping(button.dataset.id);
      });
    });
  }

  function renderSauceList() {
    if (!sauceList) return;
    if (!state.sauces.length) {
      sauceList.innerHTML = '<p class="product-list-empty">Aun no has registrado salsas, aderezos o crema batida. Crea sus nombres y enlazalos a su materia prima.</p>';
      return;
    }

    sauceList.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Salsa / aderezo</th>
            <th>Materia prima</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.sauces.map(sauce => {
            const usageCount = state.sales.reduce((sum, venta) => sum + (Array.isArray(venta.items)
              ? venta.items.reduce((itemSum, item) => itemSum + (Array.isArray(item.adicionales)
                ? item.adicionales.reduce((addonSum, addon) => addonSum + (String(addon.id) === String(sauce.id) ? Number(addon.cantidad || 0) : 0), 0)
                : 0), 0)
              : 0), 0);
            const sauceAvailableStock = getSauceAvailableStock(sauce.id);
            return `
              <tr>
                <td>${escapeHtml(sauce.nombre)}</td>
                <td>${escapeHtml(sauce.materiaPrimaNombre || '')}</td>
                <td>${formatInventoryQuantity(sauceAvailableStock)}</td>
                <td>
                  <div class="action-buttons">
                    <button type="button" class="secondary-btn action-icon-btn edit-sauce" data-id="${escapeHtml(sauce.id)}" title="Editar salsa">&#9998;</button>
                    <button type="button" class="delete-product action-icon-btn delete-sauce" data-id="${escapeHtml(sauce.id)}" ${usageCount > 0 ? 'disabled' : ''} title="Eliminar salsa">&#128465;</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    syncDynamicTableExport(sauceList, {
      title: 'Salsas y aderezos registrados',
      fileBase: 'salsas-aderezos-registrados',
      sheetName: 'Salsas y Aderezos'
    });

    sauceList.querySelectorAll('.edit-sauce').forEach(button => {
      button.addEventListener('click', () => startEditSauce(button.dataset.id));
    });
    sauceList.querySelectorAll('.delete-sauce').forEach(button => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        await deleteSauce(button.dataset.id);
      });
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
