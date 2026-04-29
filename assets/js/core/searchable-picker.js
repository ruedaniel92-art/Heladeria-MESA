export function createSearchablePicker({
  closeProductPickerModalButton,
  document,
  escapeHtml,
  productPickerList,
  productPickerModal,
  productPickerSearchInput,
  productPickerTitle
}) {
  let activeProductPickerSelect = null;

  function getSearchablePickerMeta(select) {
    if (select.classList.contains('purchase-product-source')) {
      return {
        title: 'Seleccionar producto para compra',
        placeholder: 'Elegir producto de compra',
        emptyText: 'No hay productos disponibles para compra.'
      };
    }
    if (select.classList.contains('sale-product-source')) {
      return {
        title: 'Seleccionar producto para venta',
        placeholder: 'Elegir producto de venta',
        emptyText: 'No hay productos disponibles para venta.'
      };
    }
    if (select.classList.contains('sale-extra-source')) {
      return {
        title: 'Seleccionar extra',
        placeholder: 'Elegir extra',
        emptyText: 'No hay extras disponibles.'
      };
    }
    if (select.classList.contains('inventory-kardex-product')) {
      return {
        title: 'Filtrar Kardex por producto',
        placeholder: 'Elegir producto para Kardex',
        emptyText: 'No hay productos disponibles para Kardex.'
      };
    }
    if (select.classList.contains('inventory-movement-product-source')) {
      return {
        title: 'Seleccionar producto de inventario',
        placeholder: 'Elegir producto para inventario',
        emptyText: 'No hay productos disponibles para inventario.'
      };
    }
    return {
      title: 'Seleccionar producto',
      placeholder: 'Seleccionar',
      emptyText: 'No hay opciones disponibles.'
    };
  }

  function getSearchablePickerOptionSummary(option) {
    const text = String(option?.textContent || '').trim();
    if (!text) {
      return { title: '', subtitle: '' };
    }
    const separators = [' — ', ' · ', ' â€” ', ' Â· '];
    for (const separator of separators) {
      const index = text.indexOf(separator);
      if (index > -1) {
        return {
          title: text.slice(0, index).trim(),
          subtitle: text.slice(index + separator.length).trim()
        };
      }
    }
    return { title: text, subtitle: '' };
  }

  function syncSearchablePickerTrigger(select) {
    const trigger = select?.parentElement?.querySelector('.searchable-picker-trigger');
    if (!trigger) return;
    const selectedOption = select.selectedOptions?.[0];
    const meta = getSearchablePickerMeta(select);
    const hasValue = Boolean(select.value && selectedOption);
    const text = hasValue ? String(selectedOption.textContent || '').trim() : meta.placeholder;
    trigger.querySelector('span').textContent = text;
    trigger.querySelector('span').classList.toggle('placeholder', !hasValue);
    trigger.disabled = select.disabled;
  }

  function renderSearchableProductPickerOptions() {
    if (!activeProductPickerSelect) {
      productPickerList.innerHTML = '';
      return;
    }
    const meta = getSearchablePickerMeta(activeProductPickerSelect);
    const query = String(productPickerSearchInput.value || '').trim().toLowerCase();
    const options = Array.from(activeProductPickerSelect.options)
      .filter(option => option.value && !option.disabled)
      .filter(option => !query || String(option.textContent || '').toLowerCase().includes(query));

    if (!options.length) {
      productPickerList.innerHTML = `<div class="product-picker-empty">${escapeHtml(meta.emptyText)}</div>`;
      return;
    }

    productPickerList.innerHTML = options.map(option => {
      const summary = getSearchablePickerOptionSummary(option);
      return `
        <button type="button" class="secondary-btn product-picker-option" data-picker-value="${escapeHtml(option.value)}">
          <strong>${escapeHtml(summary.title || option.textContent || '')}</strong>
          <span>${escapeHtml(summary.subtitle || String(option.textContent || '').trim())}</span>
        </button>
      `;
    }).join('');
  }

  function openSearchableProductPicker(select) {
    activeProductPickerSelect = select;
    productPickerTitle.textContent = getSearchablePickerMeta(select).title;
    productPickerSearchInput.value = '';
    renderSearchableProductPickerOptions();
    productPickerModal.classList.remove('field-hidden');
    productPickerModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('product-picker-open');
    queueMicrotask(() => productPickerSearchInput.focus());
  }

  function closeSearchableProductPicker() {
    activeProductPickerSelect = null;
    productPickerSearchInput.value = '';
    productPickerList.innerHTML = '';
    productPickerModal.classList.add('field-hidden');
    productPickerModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('product-picker-open');
  }

  function enhanceSearchablePickerSelect(select) {
    if (!select || select.dataset.searchablePickerBound === 'true') {
      syncSearchablePickerTrigger(select);
      return;
    }
    select.dataset.searchablePickerBound = 'true';
    select.classList.add('searchable-picker-native-select');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'secondary-btn searchable-picker-trigger';
    trigger.innerHTML = '<span class="placeholder"></span><strong aria-hidden="true">▾</strong>';
    trigger.addEventListener('click', () => {
      if (!select.disabled) {
        openSearchableProductPicker(select);
      }
    });
    select.insertAdjacentElement('afterend', trigger);
    select.addEventListener('change', () => syncSearchablePickerTrigger(select));
    syncSearchablePickerTrigger(select);
  }

  function initializeSearchableProductPickers(scope = document) {
    scope.querySelectorAll('select.purchase-product-source, select.sale-product-source, select.sale-extra-source, select.inventory-kardex-product, select.inventory-movement-product-source').forEach(enhanceSearchablePickerSelect);
  }

  function bindSearchableProductPickerEvents() {
    closeProductPickerModalButton.addEventListener('click', closeSearchableProductPicker);
    productPickerModal.addEventListener('click', event => {
      if (event.target === productPickerModal) {
        closeSearchableProductPicker();
      }
    });
    productPickerSearchInput.addEventListener('input', renderSearchableProductPickerOptions);
    productPickerList.addEventListener('click', event => {
      const button = event.target instanceof HTMLElement ? event.target.closest('[data-picker-value]') : null;
      if (!button || !activeProductPickerSelect) {
        return;
      }
      const nextValue = button.getAttribute('data-picker-value') || '';
      activeProductPickerSelect.value = nextValue;
      activeProductPickerSelect.dispatchEvent(new Event('change', { bubbles: true }));
      syncSearchablePickerTrigger(activeProductPickerSelect);
      closeSearchableProductPicker();
    });
  }

  function isSearchableProductPickerOpen() {
    return !productPickerModal.classList.contains('field-hidden');
  }

  return {
    bindSearchableProductPickerEvents,
    closeSearchableProductPicker,
    initializeSearchableProductPickers,
    isSearchableProductPickerOpen,
    syncSearchablePickerTrigger
  };
}
