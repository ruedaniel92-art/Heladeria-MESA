    import {
      AUTH_ACTIVITY_WRITE_THROTTLE_MS,
      AUTH_INACTIVITY_LIMIT_MS,
      AUTH_LAST_ACTIVITY_STORAGE_KEY,
      AUTH_TOKEN_STORAGE_KEY,
      AUTH_USER_STORAGE_KEY,
      buildApiUrl,
      fetchRuntimeEnvironment,
      getSavedAuthToken,
      getSavedAuthUser,
      getSavedSessionLastActivity,
      installAuthenticatedFetch,
      readJsonResponseSafe
    } from './core/api.js';
    import { getDomRefs } from './core/dom.js';
    import {
      ACTIVE_TAB_STORAGE_KEY,
      MODULE_PERMISSION_KEYS,
      MODULE_PERMISSION_LABELS,
      THEME_STORAGE_KEY
    } from './core/config.js';
    import {
      exportRowsToExcel,
      exportRowsToPdf,
      getExportDateStamp,
      syncDynamicTableExport
    } from './core/export.js';
    import {
      buildDefaultModulePermissions,
      normalizeModulePermissions
    } from './core/permissions.js';
    import { createInitialState } from './core/state.js';
    import { createAuthModule } from './modules/auth.js';
    import { createDashboardModule } from './modules/dashboard.js';
    import { createFlavorsModule } from './modules/flavors.js';
    import { createInventoryModule } from './modules/inventory.js';
    import { createPaymentsModule } from './modules/payments.js';
    import { createSalesComposerModule } from './modules/sales-composer.js';
    import { createPurchasesModule } from './modules/purchases.js';
    import { createSalesModule } from './modules/sales.js';

    function getTodayInputValue() {
      return new Date().toISOString().slice(0, 10);
    }

    function getCurrentMonthInputValue() {
      return new Date().toISOString().slice(0, 7);
    }

    function applyDefaultDateValues() {
      const today = getTodayInputValue();
      if (purchaseDateInput) purchaseDateInput.value = today;
      if (purchaseDueDateInput) purchaseDueDateInput.value = today;
      if (saleDateInput) saleDateInput.value = today;
      if (saleDueDateInput) saleDueDateInput.value = today;
      if (paymentDateInput) paymentDateInput.value = today;
      if (paymentReimbursementDateInput) paymentReimbursementDateInput.value = today;
      if (fundTransferDateInput) fundTransferDateInput.value = today;
      if (externalDebtDateInput) externalDebtDateInput.value = today;
      if (externalDebtPaymentDateInput) externalDebtPaymentDateInput.value = today;
      if (bucketOpenDateInput) bucketOpenDateInput.value = today;
      if (dashboardCashflowFilterMonthInput) dashboardCashflowFilterMonthInput.value = getCurrentMonthInputValue();
      if (dashboardIncomeStatementMonthInput) dashboardIncomeStatementMonthInput.value = getCurrentMonthInputValue();
      if (dashboardCashflowDateStartInput) dashboardCashflowDateStartInput.value = today;
      if (dashboardCashflowDateEndInput) dashboardCashflowDateEndInput.value = today;
    }

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
      const separators = [' — ', ' · '];
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
      const trigger = select.parentElement?.querySelector('.searchable-picker-trigger');
      if (!trigger) return;
      const selectedOption = select.selectedOptions?.[0];
      const meta = getSearchablePickerMeta(select);
      const hasValue = Boolean(select.value && selectedOption);
      const text = hasValue ? String(selectedOption.textContent || '').trim() : meta.placeholder;
      trigger.querySelector('span').textContent = text;
      trigger.querySelector('span').classList.toggle('placeholder', !hasValue);
      trigger.disabled = select.disabled;
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

    async function readApiResponse(response) {
      const rawText = await response.text();
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const looksJson = contentType.includes('application/json');

      if (looksJson) {
        try {
          return rawText ? JSON.parse(rawText) : {};
        } catch (error) {
          throw new Error('El backend respondió JSON inválido.');
        }
      }

      if (!response.ok && response.status === 404) {
        throw new Error('La ruta de pago no está disponible en el backend actual. Reinicia el servidor local.');
      }

      if (!response.ok) {
        throw new Error(rawText.trim() || 'El backend devolvió una respuesta no válida.');
      }

      throw new Error('La respuesta del backend no llegó en formato JSON.');
    }

    const apiUrl = () => buildApiUrl('/productos');
    const {
      statusText,
      loadingText,
      tabs,
      modulePanels,
      productForm,
      purchaseForm,
      saleForm,
      ingresoProductFormPanel,
      productModal,
      productModalTitle,
      productFormStatus,
      openProductModalButton,
      closeProductModalButton,
      productPickerModal,
      productPickerTitle,
      closeProductPickerModalButton,
      productPickerSearchInput,
      productPickerList,
      productSearchInput,
      purchaseStatus,
      saleStatus,
      purchaseDocumentInput,
      purchaseSupplierInput,
      purchaseDateInput,
      purchasePaymentTypeInput,
      purchaseDueDateField,
      purchaseDueDateInput,
      openCajaButton,
      closeCajaButton,
      purchaseCajaFloat,
      purchasePaymentSummary,
      cashMethodInput,
      cashTotalText,
      cashOutInput,
      cashReferenceRow,
      cashReferenceInput,
      purchaseInfo,
      purchaseTotal,
      purchaseRecords,
      purchaseLines,
      addPurchaseLineButton,
      purchaseTabs,
      purchaseNewPanel,
      purchaseRegistroPanel,
      purchasePayablesPanel,
      filterDocumentInput,
      filterSupplierInput,
      filterProductInput,
      filterMethodInput,
      filterDateModeInput,
      filterDateStartField,
      filterDateEndField,
      filterDateStartInput,
      filterDateEndInput,
      clearFiltersButton,
      exportRegistroExcelButton,
      exportRegistroPdfButton,
      payablesCount,
      payablesOverdue,
      payablesTotal,
      payablesFilterDocumentInput,
      payablesFilterSupplierInput,
      payablesFilterStatusInput,
      payablesFilterDateModeInput,
      payablesFilterDateStartField,
      payablesFilterDateEndField,
      payablesFilterDateStartInput,
      payablesFilterDateEndInput,
      clearPayablesFiltersButton,
      exportPayablesExcelButton,
      exportPayablesPdfButton,
      purchasePayablesReport,
      purchasePayableModal,
      purchasePayableModalTitle,
      closePurchasePayableModalButton,
      purchasePayableForm,
      purchasePayableMethodInput,
      purchasePayableDateInput,
      purchasePayableAmountInput,
      purchasePayableReferenceField,
      purchasePayableReferenceInput,
      purchasePayableSummary,
      purchasePayableHistory,
      purchasePayableStatus,
      submitPurchasePayableButton,
      saleDocumentInput,
      saleCustomerInput,
      saleDateInput,
      salePaymentTypeInput,
      saleDueDateField,
      saleDueDateInput,
      openSaleCajaButton,
      closeSaleCajaButton,
      saleCajaFloat,
      salePaymentSummary,
      saleCashMethodInput,
      saleCashTotalText,
      saleCashReceivedInput,
      saleCashChangeText,
      saleCashReferenceRow,
      saleCashReferenceInput,
      salePrintActions,
      salePrintSummary,
      printLastSaleButton,
      saleInfo,
      saleTotal,
      saleLines,
      addSaleLineButton,
      addSaleExtraButton,
      saleExtraCatalog,
      saleTabs,
      saleNewPanel,
      saleRegistroPanel,
      saleReceivablesPanel,
      saleFilterDocumentInput,
      saleFilterCustomerInput,
      saleFilterProductInput,
      saleFilterMethodInput,
      saleFilterDateModeInput,
      saleFilterDateStartField,
      saleFilterDateEndField,
      saleFilterDateStartInput,
      saleFilterDateEndInput,
      clearSaleFiltersButton,
      exportSaleRegistroExcelButton,
      exportSaleRegistroPdfButton,
      saleRecords,
      receivablesCount,
      receivablesOverdue,
      receivablesTotal,
      receivablesFilterDocumentInput,
      receivablesFilterCustomerInput,
      receivablesFilterStatusInput,
      receivablesFilterDateModeInput,
      receivablesFilterDateStartField,
      receivablesFilterDateEndField,
      receivablesFilterDateStartInput,
      receivablesFilterDateEndInput,
      clearReceivablesFiltersButton,
      exportReceivablesExcelButton,
      exportReceivablesPdfButton,
      saleReceivablesReport,
      salePayableModal,
      salePayableModalTitle,
      closeSalePayableModalButton,
      salePayableForm,
      salePayableMethodInput,
      salePayableDateInput,
      salePayableAmountInput,
      salePayableReferenceField,
      salePayableReferenceInput,
      salePayableSummary,
      salePayableHistory,
      salePayableStatus,
      submitSalePayableButton,
      paymentForm,
      paymentDateInput,
      paymentCategoryInput,
      paymentMethodInput,
      paymentAmountInput,
      paymentDescriptionInput,
      paymentBeneficiaryInput,
      paymentReferenceField,
      paymentReferenceInput,
      paymentNoteInput,
      paymentSubmitButton,
      cancelPaymentEditButton,
      paymentMethodSummary,
      paymentStatus,
      paymentInfo,
      paymentTabs,
      paymentNewPanel,
      paymentRegistroPanel,
      paymentPendingPanel,
      openPaymentReimbursementBatchButton,
      paymentCatalogPanel,
      paymentFilterDescriptionInput,
      paymentFilterCategoryInput,
      paymentFilterMethodInput,
      paymentFilterStatusInput,
      clearPaymentFiltersButton,
      paymentRecords,
      paymentPendingRecords,
      paymentCategoryForm,
      paymentCategoryNameInput,
      paymentCategoryDescriptionInput,
      paymentCategorySubmitButton,
      cancelPaymentCategoryEditButton,
      paymentCategoryStatus,
      paymentCategoryList,
      paymentReimbursementModal,
      closePaymentReimbursementModalButton,
      paymentReimbursementForm,
      paymentReimbursementDateInput,
      paymentReimbursementReferenceInput,
      paymentReimbursementSelectionSummary,
      paymentReimbursementStatus,
      fundTabs,
      fundCashPanel,
      fundBankPanel,
      fundExternalPanel,
      fundOverviewPanel,
      fundCashBalance,
      fundCashMinimum,
      fundCashAvailable,
      fundBankBalance,
      fundCashReserveNote,
      fundSettingsForm,
      fundOpeningCashInput,
      fundOpeningBankInput,
      fundMinimumCashInput,
      fundSettingsStatus,
      fundTransferForm,
      fundTransferDateInput,
      fundTransferFromInput,
      fundTransferToInput,
      fundTransferAmountInput,
      fundTransferDescriptionInput,
      fundTransferReferenceInput,
      fundTransferNoteInput,
      fundTransferStatus,
      fundCashRecords,
      fundBankRecords,
      externalDebtForm,
      externalDebtTypeInput,
      externalDebtCategoryInput,
      externalDebtDateInput,
      externalDebtDueDateInput,
      externalDebtAmountInput,
      externalDebtPartyInput,
      externalDebtConceptInput,
      externalDebtNoteInput,
      externalDebtSubmitButton,
      cancelExternalDebtEditButton,
      externalDebtStatus,
      externalPayablesBalance,
      externalReceivablesBalance,
      externalDebtsOverdue,
      externalPayablesRecords,
      externalReceivablesRecords,
      externalDebtPaymentModal,
      closeExternalDebtPaymentModalButton,
      externalDebtPaymentModalTitle,
      externalDebtPaymentForm,
      externalDebtPaymentSummary,
      externalDebtPaymentAccountInput,
      externalDebtPaymentDateInput,
      externalDebtPaymentAmountInput,
      externalDebtPaymentReferenceInput,
      externalDebtPaymentNoteInput,
      externalDebtPaymentHistory,
      externalDebtPaymentStatus,
      submitExternalDebtPaymentButton,
      dashboardTabs,
      dashboardOverviewPanel,
      dashboardCashflowPanel,
      dashboardIncomeStatementPanel,
      dashboardSummaryText,
      dashboardCashFlowSummary,
      dashboardIncomeStatementSummary,
      dashboardCashflowFilterModeInput,
      dashboardCashflowMonthField,
      dashboardCashflowFilterMonthInput,
      dashboardCashflowDateStartField,
      dashboardCashflowDateEndField,
      dashboardCashflowDateStartInput,
      dashboardCashflowDateEndInput,
      dashboardCashflowClearFiltersButton,
      dashboardIncomeStatementMonthInput,
      dashboardIncomeStatementClearButton,
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
      dashboardSalesComparison,
      dashboardTopProducts,
      dashboardCashFlowGrid,
      dashboardIncomeStatementGrid,
      dashboardActiveBuckets,
      dashboardActiveToppings,
      dashboardActiveSauces,
      dashboardControlDetails,
      dashboardStockAlerts,
      flavorModuleTabs,
      flavorModuleFlavorsPanel,
      flavorModuleToppingsPanel,
      flavorModuleSaucesPanel,
      inventoryTabs,
      inventorySummaryPanel,
      inventoryKardexPanel,
      inventoryInitialPanel,
      inventoryAdjustmentsPanel,
      inventorySummarySearchInput,
      inventorySummaryTypeFilterInput,
      inventorySummaryMovementFilterInput,
      inventorySummaryCutoffDateInput,
      exportInventorySummaryExcelButton,
      exportInventorySummaryPdfButton,
      inventorySummaryTotals,
      inventorySummaryList,
      inventoryKardexProductInput,
      inventoryKardexTypeFilterInput,
      inventoryKardexMovementFilterInput,
      inventoryKardexDateModeInput,
      inventoryKardexDateStartField,
      inventoryKardexDateEndField,
      inventoryKardexDateStartInput,
      inventoryKardexDateEndInput,
      exportInventoryKardexExcelButton,
      exportInventoryKardexPdfButton,
      inventoryKardexList,
      inventoryInitialForm,
      inventoryInitialProductInput,
      inventoryInitialDateInput,
      inventoryInitialQuantityInput,
      inventoryInitialUnitCostInput,
      inventoryInitialNoteInput,
      inventoryInitialStatus,
      inventoryAdjustmentForm,
      inventoryAdjustmentProductInput,
      inventoryAdjustmentDateInput,
      inventoryAdjustmentTypeInput,
      inventoryAdjustmentQuantityInput,
      inventoryAdjustmentUnitCostField,
      inventoryAdjustmentUnitCostInput,
      inventoryAdjustmentNoteInput,
      inventoryAdjustmentStatus,
      flavorForm,
      flavorNameInput,
      flavorSubmitButton,
      cancelFlavorEditButton,
      flavorStatus,
      flavorList,
      flavorRawMaterialInput,
      toppingForm,
      toppingNameInput,
      toppingRawMaterialInput,
      toppingSubmitButton,
      cancelToppingEditButton,
      toppingStatus,
      toppingList,
      toppingControlOpenForm,
      toppingControlOpenToppingInput,
      toppingControlOpenDateInput,
      toppingControlOpenNoteInput,
      toppingControlStatus,
      toppingControlActiveList,
      toppingControlHistoryList,
      sauceForm,
      sauceNameInput,
      sauceRawMaterialInput,
      sauceSubmitButton,
      cancelSauceEditButton,
      sauceStatus,
      sauceList,
      sauceControlOpenForm,
      sauceControlOpenSauceInput,
      sauceControlOpenDateInput,
      sauceControlOpenNoteInput,
      sauceControlStatus,
      sauceControlActiveList,
      sauceControlHistoryList,
      bucketOpenForm,
      bucketOpenFlavorInput,
      bucketOpenDateInput,
      bucketOpenNoteInput,
      bucketStatus,
      bucketActiveList,
      bucketHistoryList,
      controlModeInput,
      typeSelect,
      stockMinField,
      stockMinInput,
      priceInput,
      salePriceInput,
      priceField,
      measureField,
      yieldField,
      yieldPerPurchaseInput,
      flavorControlField,
      controlSaboresInput,
      scoopsPerUnitInput,
      recipeBuilder,
      recipeRows,
      addIngredientButton,
      submitButton,
      cancelEditButton,
      authTitle,
      authDescription,
      authStatus,
      authLoginForm,
      authBootstrapForm,
      authModeToggle,
      authSwitchBootstrapButton,
      authLoginUsernameInput,
      authLoginPasswordInput,
      authLoginShowPasswordInput,
      authBootstrapNameInput,
      authBootstrapUsernameInput,
      authBootstrapPasswordInput,
      authBootstrapPasswordConfirmInput,
      authBootstrapSecretField,
      authBootstrapSecretInput,
      sessionUserName,
      sessionUserMeta,
      mobileNavBackdrop,
      mobileNavToggleButton,
      mobileNavCloseButton,
      mobileNavCurrentModule,
      logoutButton,
      themeToggleButton,
      environmentIndicator,
      securityUserForm,
      securityUserNameInput,
      securityUserUsernameInput,
      securityUserPasswordInput,
      securityUserRoleInput,
      securityCreatePermissions,
      securityUserStatus,
      securityUsersList,
      securityRefreshUsersButton
    } = getDomRefs();
    let editingProductId = null;
    let editingPurchasePaymentEntryId = null;
    let getEditingFlavorId = () => null;
    let getEditingToppingId = () => null;
    let getEditingSauceId = () => null;
    let startEditFlavor = () => {};
    let cancelEditFlavor = () => {};
    let startEditTopping = () => {};
    let cancelEditTopping = () => {};
    let startEditSauce = () => {};
    let cancelEditSauce = () => {};
    let renderFlavorList = () => {};
    let renderToppingList = () => {};
    let renderSauceList = () => {};
    let getEditingPurchasePaymentEntryId = () => null;
    let setPurchasePayableStatus = () => {};
    let updatePurchasePayableReferenceVisibility = () => {};
    let openPurchasePayableModalPanel = () => {};
    let closePurchasePayableModalPanel = () => {};
    let isCreditPurchase = () => false;
    let isPaidCreditPurchase = () => false;
    let getPurchaseTotalAmount = () => 0;
    let getPurchaseBalanceDue = () => 0;
    let getPurchaseAccountStatus = () => ({ key: 'pending', label: 'Pendiente' });
    let calculateInvoiceTotal = () => 0;
    let renderPurchaseHistory = () => {};
    let renderPurchaseRegistro = () => {};
    let renderPurchasePayables = () => {};
    let exportRegistroExcel = () => {};
    let exportRegistroPdf = () => {};
    let exportPayablesExcel = () => {};
    let exportPayablesPdf = () => {};
    let updatePurchaseRegistroDateFilterVisibility = () => {};
    let updatePayablesDateFilterVisibility = () => {};
    let getPurchaseById = () => null;
    let getPayingPurchaseId = () => null;
    let payingPurchaseId = null;
    let activeSaleRow = null;
    let activeProductPickerSelect = null;
    let saleLineSequence = 0;
    let lastRegisteredSale = null;
    let lastRegisteredPayment = null;
    let getEditingPaymentId = () => null;
    let getEditingExternalDebtId = () => null;
    let getEditingPaymentCategoryId = () => null;
    let getEditingExternalDebtPaymentEntryId = () => null;
    let getPayingExternalDebtId = () => null;
    let getSelectedPendingPaymentIds = () => [];
    let clearSelectedPendingPaymentIds = () => {};
    let resetPaymentFormEditing = () => {};
    let resetExternalDebtFormEditing = () => {};
    let updatePaymentMethodSection = () => {};
    let getPaymentCategoryName = () => 'Sin clasificacion';
    let isExpensePayment = () => false;
    let getNormalizedFundSettings = () => getDefaultFundSettings();
    let getFundMovementModuleLabel = () => 'Movimiento';
    let buildFundMovements = () => [];
    let renderFundsModule = () => {};
    let setExternalDebtStatus = () => {};
    let setExternalDebtPaymentStatus = () => {};
    let openExternalDebtPaymentModalPanel = () => {};
    let closeExternalDebtPaymentModalPanel = () => {};
    let renderPaymentCategoryOptions = () => {};
    let renderPaymentCategoryList = () => {};
    let renderPaymentInfo = () => {};
    let renderPaymentRegistro = () => {};
    let renderPendingPayments = () => {};
    let resetPaymentCategoryForm = () => {};
    let openPaymentReimbursementModalPanel = () => {};
    let closePaymentReimbursementModalPanel = () => {};
    let isPendingCardPayment = () => false;
    let setSalePayableStatus = () => {};
    let updateSalePayableReferenceVisibility = () => {};
    let openSalePayableModalPanel = () => {};
    let closeSalePayableModalPanel = () => {};
    let calculateSaleInvoiceTotal = () => 0;
    let getSaleTotalAmount = () => 0;
    let getSalePaidAmount = () => 0;
    let getSaleBalanceDue = () => 0;
    let isPaidCreditSale = () => false;
    let getSalePaymentActionLabel = () => 'Aplicar pago';
    let getSalePaymentTypeLabel = () => 'Contado';
    let getSaleAccountStatus = () => ({ key: 'pending', label: 'Pendiente' });
    let getSaleById = () => null;
    let resetSalePaymentEntryEditing = () => {};
    let getEditingSalePaymentEntryId = () => null;
    let getPayingSaleId = () => null;
    let startEditSalePaymentEntry = () => {};
    let updateSaleRegistroDateFilterVisibility = () => {};
    let getFilteredSales = () => [];
    let buildSaleRegistroRows = () => [];
    let buildSaleReceivablesRows = () => [];
    let exportSaleRegistroExcel = () => {};
    let exportSaleRegistroPdf = () => {};
    let updateReceivablesDateFilterVisibility = () => {};
    let getCreditReceivables = () => [];
    let exportReceivablesExcel = () => {};
    let exportReceivablesPdf = () => {};
    let renderSaleRegistro = () => {};
    let renderSaleReceivables = () => {};
    let salesComposer = null;
    const mobileNavMediaQuery = window.matchMedia('(max-width: 900px)');
    function getSavedActiveTab() {
      try {
        const savedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        const validTabs = ['dashboard', 'ingreso', 'compras', 'ventas', 'pagos', 'efectivo', 'sabores', 'inventario', 'seguridad'];
        return validTabs.includes(savedTab) ? savedTab : 'dashboard';
      } catch (error) {
        return 'dashboard';
      }
    }

    function getCurrentUserPermissions() {
      return normalizeModulePermissions(state.auth.user?.permissions, state.auth.user?.role || 'user');
    }

    function canAccessModule(moduleName) {
      return Boolean(getCurrentUserPermissions()[moduleName]);
    }

    function getFirstAccessibleModule(preferredTab = 'dashboard') {
      const permissions = getCurrentUserPermissions();
      if (permissions[preferredTab]) {
        return preferredTab;
      }
      return MODULE_PERMISSION_KEYS.find(key => permissions[key]) || 'dashboard';
    }

    function buildPermissionCheckboxMarkup(namePrefix, permissions, { disabled = false } = {}) {
      const normalizedPermissions = normalizeModulePermissions(permissions, 'user');
      return MODULE_PERMISSION_KEYS.map(key => `
        <label class="permission-option">
          <input type="checkbox" data-permission-key="${escapeHtml(key)}" name="${escapeHtml(namePrefix)}-${escapeHtml(key)}" ${normalizedPermissions[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
          <span>${escapeHtml(MODULE_PERMISSION_LABELS[key] || key)}</span>
        </label>
      `).join('');
    }

    function collectPermissionValues(scope) {
      return MODULE_PERMISSION_KEYS.reduce((accumulator, key) => {
        const input = scope?.querySelector(`[data-permission-key="${key}"]`);
        accumulator[key] = Boolean(input?.checked);
        return accumulator;
      }, {});
    }

    function syncPermissionInputsForRole(scope, role) {
      const isAdmin = String(role || 'user') === 'admin';
      MODULE_PERMISSION_KEYS.forEach(key => {
        const input = scope?.querySelector(`[data-permission-key="${key}"]`);
        if (!input) return;
        input.checked = isAdmin ? true : input.checked;
        input.disabled = isAdmin;
      });
    }

    function applyModulePermissions() {
      const fallbackTab = getFirstAccessibleModule(state.activeTab);
      tabs.forEach(tab => {
        const tabName = tab.dataset.tab;
        const allowed = canAccessModule(tabName);
        tab.classList.toggle('field-hidden', !allowed);
      });
      modulePanels.forEach(panel => {
        const panelName = String(panel.id || '').replace(/^module-/, '');
        const allowed = canAccessModule(panelName);
        panel.classList.toggle('field-hidden', !allowed);
      });
      if (!canAccessModule(state.activeTab)) {
        state.activeTab = fallbackTab;
      }
    }

    function renderEnvironmentIndicator() {
      if (!environmentIndicator) {
        return;
      }

      const environment = state.runtimeEnvironment || { mode: 'unknown', label: 'Detectando entorno...' };
      environmentIndicator.textContent = environment.label || 'Detectando entorno...';
      environmentIndicator.classList.toggle('is-test', environment.mode === 'test');
      environmentIndicator.classList.toggle('is-production', environment.mode === 'production');
      environmentIndicator.classList.toggle('is-loading', !['test', 'production'].includes(environment.mode));
    }

    function setRuntimeEnvironment(environment) {
      const normalizedMode = String(environment?.mode || '').trim().toLowerCase();
      if (normalizedMode === 'production') {
        state.runtimeEnvironment = { mode: 'production', label: 'PRODUCCION' };
      } else if (normalizedMode === 'test') {
        state.runtimeEnvironment = { mode: 'test', label: 'PRUEBA' };
      } else {
        state.runtimeEnvironment = { mode: 'unknown', label: 'Detectando entorno...' };
      }
      renderEnvironmentIndicator();
    }

    function getSavedTheme() {
      try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return savedTheme === 'dark' ? 'dark' : 'light';
      } catch (error) {
        return 'light';
      }
    }

    function applyTheme(theme) {
      const nextTheme = theme === 'dark' ? 'dark' : 'light';
      document.body.classList.toggle('theme-dark', nextTheme === 'dark');
      themeToggleButton.textContent = nextTheme === 'dark' ? 'Modo claro' : 'Modo oscuro';
      themeToggleButton.setAttribute('aria-pressed', nextTheme === 'dark' ? 'true' : 'false');
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (error) {
      }
    }

    let toastContainer = null;

    function getToastContainer() {
      if (toastContainer?.isConnected) {
        return toastContainer;
      }
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
      return toastContainer;
    }

    function renderToast(message, type = 'success', duration = 3600) {
      const content = String(message || '').trim();
      if (!content) {
        return;
      }

      const container = getToastContainer();
      const toast = document.createElement('div');
      toast.className = `toast-notification ${type === 'error' ? 'error' : 'success'}`;
      toast.textContent = content;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });

      const removeToast = () => {
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 240);
      };

      window.setTimeout(removeToast, duration);
    }

    function showError(message) {
      const normalizedMessage = String(message || '').trim() || 'No se pudo completar la acción. Intenta nuevamente.';
      renderToast(normalizedMessage, 'error');
    }

    function showSuccess(message) {
      const normalizedMessage = String(message || '').trim() || 'Guardado correctamente';
      renderToast(normalizedMessage, 'success');
    }

    function setLoadingState(target, isLoading, { label = 'Cargando...' } = {}) {
      const button = target instanceof HTMLButtonElement
        ? target
        : target?.querySelector?.('button[type="submit"]');

      if (!button) {
        return !isLoading;
      }

      if (isLoading) {
        if (button.dataset.loadingActive === 'true') {
          return false;
        }
        button.dataset.loadingActive = 'true';
        button.dataset.loadingLabel = label;
        if (!button.dataset.originalText) {
          button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        button.textContent = label;
        if (target?.dataset) {
          target.dataset.loading = 'true';
        }
        return true;
      }

      button.disabled = false;
      if (button.textContent === (button.dataset.loadingLabel || label) && button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
      delete button.dataset.loadingActive;
      delete button.dataset.loadingLabel;
      delete button.dataset.originalText;
      if (target?.dataset) {
        delete target.dataset.loading;
      }
      return true;
    }

    const state = createInitialState({
      getSavedActiveTab,
      getSavedAuthToken,
      getSavedAuthUser
    });

    const {
      setAuthStatus,
      persistAuthToken,
      persistAuthUser,
      clearSessionActivityTracking,
      hasSessionTimedOut,
      scheduleSessionInactivityCheck,
      markSessionActivity,
      renderSessionSummary,
      renderSecurityCreatePermissions,
      renderSecurityUsers,
      fetchAdminUsers,
      setAuthMode,
      setBootstrapSecretRequirement,
      setAuthenticatedShell,
      clearAuthenticatedState,
      handleUnauthorizedSession,
      fetchAuthStatus,
      restoreAuthenticatedUser,
      startAuthenticatedApp,
      initializeAuthentication
    } = createAuthModule({
      state,
      authStatus,
      AUTH_TOKEN_STORAGE_KEY,
      AUTH_USER_STORAGE_KEY,
      AUTH_LAST_ACTIVITY_STORAGE_KEY,
      AUTH_INACTIVITY_LIMIT_MS,
      AUTH_ACTIVITY_WRITE_THROTTLE_MS,
      getSavedSessionLastActivity,
      sessionUserName,
      sessionUserMeta,
      securityCreatePermissions,
      securityUserRoleInput,
      buildPermissionCheckboxMarkup,
      buildDefaultModulePermissions,
      syncPermissionInputsForRole,
      securityUsersList,
      normalizeModulePermissions,
      escapeHtml,
      formatDate,
      buildApiUrl,
      buildApiError,
      authLoginForm,
      authBootstrapForm,
      authModeToggle,
      authTitle,
      authDescription,
      authBootstrapSecretField,
      authBootstrapSecretInput,
      logoutButton,
      applyModulePermissions,
      setActiveTab,
      getFirstAccessibleModule,
      showError,
      installAuthenticatedFetch,
      fetchRuntimeEnvironment,
      setRuntimeEnvironment,
      fetchProductos,
      securityUserStatus
    });

    const {
      normalizeInventoryMode,
      getProductInventoryMode,
      buildInventoryKardexMovements,
      buildInventorySummaryRows,
      renderInventorySummary,
      renderInventoryKardex,
      buildInventoryKardexRows
    } = createInventoryModule({
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
    });

    ({
      getEditingPurchasePaymentEntryId,
      setPurchasePayableStatus,
      updatePurchasePayableReferenceVisibility,
      openPurchasePayableModalPanel,
      closePurchasePayableModalPanel,
      isCreditPurchase,
      isPaidCreditPurchase,
      getPurchaseTotalAmount,
      getPurchaseBalanceDue,
      getPurchaseAccountStatus,
      calculateInvoiceTotal,
      renderPurchaseHistory,
      renderPurchaseRegistro,
      renderPurchasePayables,
      exportRegistroExcel,
      exportRegistroPdf,
      exportPayablesExcel,
      exportPayablesPdf,
      updatePurchaseRegistroDateFilterVisibility,
      updatePayablesDateFilterVisibility,
      getPurchaseById,
      getPayingPurchaseId,
    } = createPurchasesModule({
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
    }));

    function calculateSaleAddonsTotal(addons) {
      return (Array.isArray(addons) ? addons : []).reduce((sum, addon) => sum + Number(addon.cantidad || 0) * Number(addon.precio || 0), 0);
    }

    ({
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
    } = createSalesModule({
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
    }));

    ({
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
    } = createPaymentsModule({
      state,
      applyDefaultDateValues,
      buildApiError,
      buildApiUrl,
      buildPaymentEntryReceiptMarkup,
      buildReceiptReferenceMarkup,
      cancelExternalDebtEditButton,
      cancelPaymentCategoryEditButton,
      cancelPaymentEditButton,
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
      paymentCatalogPanel,
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
    }));

    salesComposer = createSalesComposerModule({
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
    });

    renderEnvironmentIndicator();

    tabs.forEach(tab => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    if (mobileNavToggleButton) {
      mobileNavToggleButton.addEventListener('click', () => {
        toggleSidebar();
      });
    }

    if (mobileNavCloseButton) {
      mobileNavCloseButton.addEventListener('click', closeMobileNav);
    }

    if (mobileNavBackdrop) {
      mobileNavBackdrop.addEventListener('click', closeMobileNav);
    }

    if (mobileNavMediaQuery.addEventListener) {
      mobileNavMediaQuery.addEventListener('change', event => {
        if (!event.matches) {
          closeMobileNav();
        }
      });
    }

    authSwitchBootstrapButton.addEventListener('click', () => {
      setAuthMode('bootstrap', { configured: state.auth.configured });
    });

    if (authLoginShowPasswordInput && authLoginPasswordInput) {
      authLoginShowPasswordInput.addEventListener('change', () => {
        authLoginPasswordInput.type = authLoginShowPasswordInput.checked ? 'text' : 'password';
      });
    }

    authLoginForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!setLoadingState(authLoginForm, true, { label: 'Validando...' })) {
        return;
      }
      try {
        setAuthStatus('Validando acceso...');
        const response = await fetch(buildApiUrl('/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authLoginUsernameInput.value.trim(),
            password: authLoginPasswordInput.value
          })
        });
        const result = await readJsonResponseSafe(response);
        if (!response.ok) {
          throw new Error(result?.error || result?.message || 'No se pudo iniciar sesión. Verifica que la API esté disponible.');
        }
        if (!result) {
          throw new Error('La API respondió sin datos al iniciar sesión. Verifica que la API esté disponible.');
        }
        persistAuthToken(result.token || '');
        persistAuthUser(result.user || null);
        authLoginForm.reset();
        await startAuthenticatedApp();
        showSuccess(`Bienvenido, ${result.user?.nombre || result.user?.username || 'usuario'}.`);
      } catch (error) {
        setAuthStatus(error.message, { error: true });
        showError(error.message);
      } finally {
        setLoadingState(authLoginForm, false);
      }
    });

    authBootstrapForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (authBootstrapPasswordInput.value !== authBootstrapPasswordConfirmInput.value) {
        setAuthStatus('Las contraseñas no coinciden.', { error: true });
        showError('Las contraseñas no coinciden.');
        return;
      }

      if (!setLoadingState(authBootstrapForm, true, { label: 'Creando...' })) {
        return;
      }

      try {
        setAuthStatus('Creando administrador...');
        const response = await fetch(buildApiUrl('/auth/bootstrap'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: authBootstrapNameInput.value.trim(),
            username: authBootstrapUsernameInput.value.trim(),
            password: authBootstrapPasswordInput.value,
            bootstrapSecret: authBootstrapSecretInput ? authBootstrapSecretInput.value.trim() : ''
          })
        });
        const result = await readJsonResponseSafe(response);
        if (!response.ok) {
          throw new Error(result?.error || result?.message || 'No se pudo crear el administrador. Verifica que la API esté disponible.');
        }
        if (!result) {
          throw new Error('La API respondió sin datos al crear el administrador. Verifica que la API esté disponible.');
        }
        state.auth.configured = true;
        persistAuthToken(result.token || '');
        persistAuthUser(result.user || null);
        authBootstrapForm.reset();
        await startAuthenticatedApp();
        showSuccess('Administrador creado correctamente.');
      } catch (error) {
        setAuthStatus(error.message, { error: true });
        showError(error.message);
      } finally {
        setLoadingState(authBootstrapForm, false);
      }
    });

    if (securityUserRoleInput) {
      securityUserRoleInput.addEventListener('change', () => {
        syncPermissionInputsForRole(securityCreatePermissions, securityUserRoleInput.value);
      });
    }

    if (securityUserForm) {
      securityUserForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!setLoadingState(securityUserForm, true, { label: 'Guardando...' })) {
          return;
        }
        try {
          securityUserStatus.textContent = 'Creando usuario...';
          const role = securityUserRoleInput.value;
          const response = await fetch(buildApiUrl('/auth/users'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: securityUserNameInput.value.trim(),
              username: securityUserUsernameInput.value.trim(),
              password: securityUserPasswordInput.value,
              role,
              permissions: role === 'admin' ? buildDefaultModulePermissions('admin') : collectPermissionValues(securityCreatePermissions)
            })
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'No se pudo crear el usuario.');
          }
          securityUserForm.reset();
          if (securityUserRoleInput) {
            securityUserRoleInput.value = 'user';
          }
          renderSecurityCreatePermissions();
          securityUserStatus.textContent = `Usuario ${result.user?.username || ''} creado correctamente.`.trim();
          await fetchAdminUsers();
          showSuccess(securityUserStatus.textContent);
        } catch (error) {
          securityUserStatus.textContent = error.message || 'No se pudo crear el usuario.';
          showError(securityUserStatus.textContent);
        } finally {
          setLoadingState(securityUserForm, false);
        }
      });
    }

    if (securityRefreshUsersButton) {
      securityRefreshUsersButton.addEventListener('click', async () => {
        try {
          securityUserStatus.textContent = 'Actualizando usuarios...';
          await fetchAdminUsers();
          securityUserStatus.textContent = 'Lista de usuarios actualizada.';
        } catch (error) {
          securityUserStatus.textContent = error.message || 'No se pudo actualizar la lista de usuarios.';
        }
      });
    }

    if (securityUsersList) {
      securityUsersList.addEventListener('click', async event => {
        const button = event.target instanceof HTMLElement ? event.target.closest('[data-action="save-user"]') : null;
        if (!button) {
          return;
        }
        const card = button.closest('[data-user-id]');
        const userId = card?.dataset.userId;
        if (!userId || !card) {
          return;
        }
        const role = card.querySelector('[data-user-field="role"]')?.value || 'user';
        const payload = {
          nombre: card.querySelector('[data-user-field="nombre"]')?.value?.trim() || '',
          role,
          active: (card.querySelector('[data-user-field="active"]')?.value || 'true') === 'true',
          password: card.querySelector('[data-user-field="password"]')?.value || '',
          permissions: role === 'admin' ? buildDefaultModulePermissions('admin') : collectPermissionValues(card.querySelector('[data-user-permissions]'))
        };

        try {
          securityUserStatus.textContent = 'Guardando cambios del usuario...';
          const response = await fetch(buildApiUrl(`/auth/users/${encodeURIComponent(userId)}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'No se pudo actualizar el usuario.');
          }

          const updatedUser = result.user || null;
          state.auth.users = state.auth.users.map(item => String(item.id) === String(userId) ? updatedUser : item);
          if (String(state.auth.user?.id || '') === String(userId) && updatedUser) {
            persistAuthUser(updatedUser);
            renderSessionSummary();
            applyModulePermissions();
            setActiveTab(getFirstAccessibleModule(state.activeTab));
          }
          renderSecurityUsers();
          securityUserStatus.textContent = 'Usuario actualizado correctamente.';
        } catch (error) {
          securityUserStatus.textContent = error.message || 'No se pudo actualizar el usuario.';
        }
      });
    }

    ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart', 'focus'].forEach(eventName => {
      window.addEventListener(eventName, () => markSessionActivity(), { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        markSessionActivity({ forceWrite: true });
      }
    });

    renderSecurityCreatePermissions();
    renderSecurityUsers();

    openProductModalButton.addEventListener('click', openNewProductModal);
    closeProductModalButton.addEventListener('click', dismissProductModal);
    logoutButton.addEventListener('click', () => {
      clearAuthenticatedState({ message: 'Sesión cerrada correctamente.' });
    });
    themeToggleButton.addEventListener('click', () => {
      applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
    });
    productSearchInput.addEventListener('input', () => {
      state.productSearch = productSearchInput.value.trim().toLowerCase();
      renderIngresoList();
    });
    productModal.addEventListener('click', event => {
      if (event.target === productModal) {
        dismissProductModal();
      }
    });
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
    closePurchasePayableModalButton.addEventListener('click', () => closePurchasePayableModalPanel());
    purchasePayableModal.addEventListener('click', event => {
      if (event.target === purchasePayableModal) {
        closePurchasePayableModalPanel();
      }
    });
    closeSalePayableModalButton.addEventListener('click', closeSalePayableModalPanel);
    salePayableModal.addEventListener('click', event => {
      if (event.target === salePayableModal) {
        closeSalePayableModalPanel();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !productModal.classList.contains('field-hidden')) {
        dismissProductModal();
      } else if (event.key === 'Escape' && !productPickerModal.classList.contains('field-hidden')) {
        closeSearchableProductPicker();
      } else if (event.key === 'Escape' && !purchasePayableModal.classList.contains('field-hidden')) {
        closePurchasePayableModalPanel();
      } else if (event.key === 'Escape' && !salePayableModal.classList.contains('field-hidden')) {
        closeSalePayableModalPanel();
      } else if (event.key === 'Escape') {
        salesComposer?.closeActiveSaleCustomizationEditor?.();
      }
    });
    controlModeInput.addEventListener('change', updateFormFields);
    addIngredientButton.addEventListener('click', addRecipeIngredientRow);
    cancelEditButton.addEventListener('click', cancelEditProduct);
    cancelFlavorEditButton.addEventListener('click', () => cancelEditFlavor());
    cancelToppingEditButton.addEventListener('click', () => cancelEditTopping());
    cancelSauceEditButton.addEventListener('click', () => cancelEditSauce());

    function normalizeProductType(value) {
      const type = String(value || '').trim().toLowerCase();
      if (type.includes('materia') && type.includes('prima')) {
        return 'materia prima';
      }
      if (type.includes('terminado')) {
        return 'producto terminado';
      }
      if (type.includes('producto')) {
        return 'productos';
      }
      return type;
    }

    function setProductStatus(message, options = {}) {
      const { error = false } = options;
      [statusText, productFormStatus].forEach(element => {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('error', error);
      });
    }

    function openProductModalPanel() {
      productModal.classList.remove('field-hidden');
      productModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function closeProductModalPanel() {
      productModal.classList.add('field-hidden');
      productModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }

    function resetProductFormState() {
      editingProductId = null;
      productForm.reset();
      controlModeInput.value = 'directo';
      recipeRows.innerHTML = '';
      updateFormFields();
      submitButton.textContent = 'Agregar producto';
      cancelEditButton.style.display = 'none';
      productModalTitle.textContent = 'Nuevo producto';
    }

    function openNewProductModal() {
      resetProductFormState();
      setProductStatus('Completa los datos para registrar un nuevo producto.');
      openProductModalPanel();
    }

    function dismissProductModal() {
      if (editingProductId) {
        cancelEditProduct();
        return;
      }
      resetProductFormState();
      closeProductModalPanel();
      setProductStatus('Los productos se cargan automáticamente desde tu backend.');
    }

    function getMateriaPrimaProducts() {
      return state.productos.filter(producto => {
        const tipo = normalizeProductType(producto.tipo || producto.type);
        return tipo === 'materia prima' || (tipo === '' && producto.medida);
      });
    }

    function getPurchasableProducts() {
      return state.productos.filter(producto => {
        const mode = getProductInventoryMode(producto);
        return mode === 'materia-prima' || mode === 'directo';
      });
    }

    function canBePurchased(producto) {
      const mode = getProductInventoryMode(producto);
      return mode === 'materia-prima' || mode === 'directo';
    }

    function getSellableProducts() {
      return state.productos.filter(producto => getProductInventoryMode(producto) !== 'materia-prima');
    }

    function renderInventoryModeLabel(producto) {
      const mode = getProductInventoryMode(producto);
      if (mode === 'materia-prima') return 'Materia prima';
      if (mode === 'directo') return 'Directo';
      if (mode === 'receta') return 'Receta';
      if (mode === 'helado-sabores') return 'Helado por sabores';
      if (mode === 'mixto') return 'Mixto';
      return 'N/A';
    }

    function buildRawMaterialOptions(selectedId = '') {
      const materias = getMateriaPrimaProducts();
      if (!materias.length) {
        return '<option value="">No hay materias primas</option>';
      }
      return materias.map(producto => `
        <option value="${escapeHtml(producto.id)}" ${String(producto.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(producto.nombre)} (${Number(producto.stock || 0)} porciones)</option>
      `).join('');
    }

    function getActiveBucketForFlavorId(flavorId) {
      return state.bucketControls.find(bucket => String(bucket.saborId) === String(flavorId) && String(bucket.estado) === 'abierto');
    }

    function getActiveToppingControlForToppingId(toppingId) {
      return state.toppingControls.find(control => String(control.toppingId) === String(toppingId) && String(control.estado) === 'abierto');
    }

    function getActiveSauceControlForSauceId(sauceId) {
      return state.sauceControls.find(control => String(control.sauceId) === String(sauceId) && String(control.estado) === 'abierto');
    }

    function getFlavorRawMaterial(flavorId) {
      const flavor = state.sabores.find(item => String(item.id) === String(flavorId));
      if (!flavor) return null;
      return state.productos.find(producto => String(producto.id) === String(flavor.materiaPrimaId)) || null;
    }

    function getFlavorsByRawMaterialId(productId) {
      const id = String(productId || '').trim();
      if (!id) return [];
      return state.sabores
        .filter(flavor => String(flavor.materiaPrimaId || '') === id)
        .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
    }

    function getToppingsByRawMaterialId(productId) {
      const id = String(productId || '').trim();
      if (!id) return [];
      return state.toppings
        .filter(topping => String(topping.materiaPrimaId || '') === id)
        .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
    }

    function getSaucesByRawMaterialId(productId) {
      const id = String(productId || '').trim();
      if (!id) return [];
      return state.sauces
        .filter(sauce => String(sauce.materiaPrimaId || '') === id)
        .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
    }

    function getPurchaseLinkedTargets(producto) {
      if (!producto) {
        return [];
      }
      return [
        ...getFlavorsByRawMaterialId(producto.id).map(flavor => ({ type: 'flavor', id: flavor.id, name: flavor.nombre })),
        ...getToppingsByRawMaterialId(producto.id).map(topping => ({ type: 'topping', id: topping.id, name: topping.nombre })),
        ...getSaucesByRawMaterialId(producto.id).map(sauce => ({ type: 'sauce', id: sauce.id, name: sauce.nombre }))
      ];
    }

    function getPurchaseLinkedTargetLabel(producto) {
      const targets = getPurchaseLinkedTargets(producto);
      if (!targets.length) return 'Asignar a';
      const types = [...new Set(targets.map(target => target.type))];
      if (types.length === 1) {
        if (types[0] === 'flavor') return 'Sabor';
        if (types[0] === 'topping') return 'Topping';
        return 'Salsa / aderezo';
      }
      return 'Asignar a';
    }

    function productRequiresPurchaseLink(producto) {
      return getPurchaseLinkedTargets(producto).length > 0;
    }

    function buildPurchaseLinkedOptions(productId, selectedType = '', selectedId = '') {
      const producto = findProductById(productId);
      const targets = getPurchaseLinkedTargets(producto);
      if (!targets.length) {
        return '<option value="">Sin vínculos</option>';
      }
      return [`<option value="">Selecciona una opción</option>`, ...targets.map(target => {
        const value = `${target.type}:${target.id}`;
        const currentValue = selectedType && selectedId ? `${selectedType}:${selectedId}` : '';
        const label = target.type === 'flavor'
          ? `${target.name} · sabor`
          : target.type === 'topping'
            ? `${target.name} · topping`
            : `${target.name} · salsa/aderezo`;
        return `<option value="${escapeHtml(value)}" ${value === currentValue ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      })].join('');
    }

    function getToppingById(toppingId) {
      return state.toppings.find(item => String(item.id) === String(toppingId)) || null;
    }

    function getToppingByName(toppingName) {
      const normalizedName = String(toppingName || '').trim().toLowerCase();
      if (!normalizedName) return null;
      return state.toppings.find(item => String(item.nombre || '').trim().toLowerCase() === normalizedName) || null;
    }

    function getSauceById(sauceId) {
      return state.sauces.find(item => String(item.id) === String(sauceId)) || null;
    }

    function getSauceByName(sauceName) {
      const normalizedName = String(sauceName || '').trim().toLowerCase();
      if (!normalizedName) return null;
      return state.sauces.find(item => String(item.nombre || '').trim().toLowerCase() === normalizedName) || null;
    }

    function getToppingRawMaterial(toppingId) {
      const topping = getToppingById(toppingId);
      if (!topping) return null;
      return state.productos.find(producto => String(producto.id) === String(topping.materiaPrimaId)) || null;
    }

    function getFlavorPurchasedStock(flavorId) {
      const normalizedFlavorId = String(flavorId || '').trim();
      if (!normalizedFlavorId) {
        return 0;
      }

      const flavor = state.sabores.find(item => String(item.id) === normalizedFlavorId);
      if (!flavor) {
        return 0;
      }

      const linkedFlavors = getFlavorsByRawMaterialId(flavor.materiaPrimaId);
      return state.purchases.reduce((total, compra) => {
        const items = Array.isArray(compra.items) ? compra.items : [];
        return total + items.reduce((sum, item) => {
          if (String(item.id || '') !== String(flavor.materiaPrimaId)) {
            return sum;
          }

          const matchesFlavor = String(item.flavorId || '') === normalizedFlavorId;
          const isSingleFlavorRawMaterial = !item.flavorId && linkedFlavors.length === 1;
          if (!matchesFlavor && !isSingleFlavorRawMaterial) {
            return sum;
          }

          const materiaPrima = findProductById(item.id) || findProductByIdOrName(item.id, item.nombre);
          if (!materiaPrima) {
            return sum;
          }

          return sum + getInventoryStockIncrement(materiaPrima, Number(item.cantidad || 0));
        }, 0);
      }, 0);
    }

    function getFlavorConsumedStock(flavorId) {
      const normalizedFlavorId = String(flavorId || '').trim();
      if (!normalizedFlavorId) {
        return 0;
      }

      return state.sales.reduce((total, venta) => {
        const items = Array.isArray(venta.items) ? venta.items : [];
        return total + items.reduce((sum, item) => {
          const flavors = Array.isArray(item.sabores) ? item.sabores : [];
          return sum + flavors.reduce((flavorSum, flavor) => {
            return String(flavor.id || '') === normalizedFlavorId
              ? flavorSum + Number(flavor.porciones || 0)
              : flavorSum;
          }, 0);
        }, 0);
      }, 0);
    }

    function getFlavorAvailableStock(flavorId) {
      return Math.max(getFlavorPurchasedStock(flavorId) - getFlavorConsumedStock(flavorId), 0);
    }

    function hasFlavorAvailableStock(flavorId) {
      return getFlavorAvailableStock(flavorId) > 0;
    }

    function getToppingPurchasedStock(toppingId) {
      const normalizedToppingId = String(toppingId || '').trim();
      if (!normalizedToppingId) {
        return 0;
      }

      const topping = getToppingById(normalizedToppingId);
      if (!topping) {
        return 0;
      }

      const linkedToppings = getToppingsByRawMaterialId(topping.materiaPrimaId);
      return state.purchases.reduce((total, compra) => {
        const items = Array.isArray(compra.items) ? compra.items : [];
        return total + items.reduce((sum, item) => {
          if (String(item.id || '') !== String(topping.materiaPrimaId)) {
            return sum;
          }

          const matchesTopping = String(item.toppingId || '') === normalizedToppingId;
          const isSingleToppingRawMaterial = !item.toppingId && linkedToppings.length === 1;
          if (!matchesTopping && !isSingleToppingRawMaterial) {
            return sum;
          }

          const materiaPrima = findProductById(item.id) || findProductByIdOrName(item.id, item.nombre);
          if (!materiaPrima) {
            return sum;
          }

          return sum + getInventoryStockIncrement(materiaPrima, Number(item.cantidad || 0));
        }, 0);
      }, 0);
    }

    function getToppingConsumedStock(toppingId) {
      const normalizedToppingId = String(toppingId || '').trim();
      if (!normalizedToppingId) {
        return 0;
      }

      return state.sales.reduce((total, venta) => {
        const items = Array.isArray(venta.items) ? venta.items : [];
        return total + items.reduce((sum, item) => {
          const addons = Array.isArray(item.adicionales) ? item.adicionales : [];
          return sum + addons.reduce((addonSum, addon) => {
            return String(addon.id || '') === normalizedToppingId
              ? addonSum + Number(addon.cantidad || 0)
              : addonSum;
          }, 0);
        }, 0);
      }, 0);
    }

    function getToppingAvailableStock(toppingId) {
      return Math.max(getToppingPurchasedStock(toppingId) - getToppingConsumedStock(toppingId), 0);
    }

    function hasToppingAvailableStock(toppingId) {
      return getToppingAvailableStock(toppingId) > 0;
    }

    function getSaucePurchasedStock(sauceId) {
      const normalizedSauceId = String(sauceId || '').trim();
      if (!normalizedSauceId) {
        return 0;
      }

      const sauce = getSauceById(normalizedSauceId);
      if (!sauce) {
        return 0;
      }

      const linkedSauces = getSaucesByRawMaterialId(sauce.materiaPrimaId);
      return state.purchases.reduce((total, compra) => {
        const items = Array.isArray(compra.items) ? compra.items : [];
        return total + items.reduce((sum, item) => {
          if (String(item.id || '') !== String(sauce.materiaPrimaId)) {
            return sum;
          }

          const matchesSauce = String(item.sauceId || '') === normalizedSauceId;
          const isSingleSauceRawMaterial = !item.sauceId && linkedSauces.length === 1;
          if (!matchesSauce && !isSingleSauceRawMaterial) {
            return sum;
          }

          const materiaPrima = findProductById(item.id) || findProductByIdOrName(item.id, item.nombre);
          if (!materiaPrima) {
            return sum;
          }

          return sum + getInventoryStockIncrement(materiaPrima, Number(item.cantidad || 0));
        }, 0);
      }, 0);
    }

    function getSauceConsumedStock(sauceId) {
      const normalizedSauceId = String(sauceId || '').trim();
      if (!normalizedSauceId) {
        return 0;
      }

      return state.sales.reduce((total, venta) => {
        const items = Array.isArray(venta.items) ? venta.items : [];
        return total + items.reduce((sum, item) => {
          const addons = Array.isArray(item.adicionales) ? item.adicionales : [];
          return sum + addons.reduce((addonSum, addon) => {
            return String(addon.id || '') === normalizedSauceId
              ? addonSum + Number(addon.cantidad || 0)
              : addonSum;
          }, 0);
        }, 0);
      }, 0);
    }

    function getSauceAvailableStock(sauceId) {
      return Math.max(getSaucePurchasedStock(sauceId) - getSauceConsumedStock(sauceId), 0);
    }

    function hasSauceAvailableStock(sauceId) {
      return getSauceAvailableStock(sauceId) > 0;
    }

    function buildBucketFlavorOptions(selectedId = '') {
      if (!state.sabores.length) {
        return '<option value="">No hay sabores registrados</option>';
      }
      return state.sabores.map(flavor => {
        const activeBucket = getActiveBucketForFlavorId(flavor.id);
        const availableStock = hasFlavorAvailableStock(flavor.id);
        const availableFlavorStock = getFlavorAvailableStock(flavor.id);
        const materiaPrima = getFlavorRawMaterial(flavor.id);
        const stockLabel = materiaPrima ? `· stock ${formatInventoryQuantity(availableFlavorStock)}` : '· sin materia prima';
        const statusLabel = activeBucket
          ? '· abierto'
          : availableStock
            ? '· listo para abrir'
            : '· sin compra disponible';
        return `<option value="${escapeHtml(flavor.id)}" ${String(flavor.id) === String(selectedId) ? 'selected' : ''} ${activeBucket || availableStock ? '' : 'disabled'}>${escapeHtml(flavor.nombre)} ${statusLabel} ${stockLabel}</option>`;
      }).join('');
    }

    function buildToppingOptions(selectedId = '') {
      const availableToppings = state.toppings.filter(topping => {
        const isSelected = String(topping.id) === String(selectedId);
        return (hasToppingAvailableStock(topping.id) && getActiveToppingControlForToppingId(topping.id)) || isSelected;
      });
      if (!availableToppings.length) {
        return '<option value="">No hay toppings abiertos con stock</option>';
      }

      return `
        <option value="">Seleccionar topping</option>
        ${availableToppings.map(topping => {
          const activeControl = getActiveToppingControlForToppingId(topping.id);
          const statusLabel = activeControl ? 'abierto' : 'cerrado';
          return `<option value="${escapeHtml(topping.id)}" data-name="${escapeHtml(topping.nombre)}" ${String(topping.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(topping.nombre)} · ${statusLabel} · stock ${formatInventoryQuantity(getToppingAvailableStock(topping.id))}</option>`;
        }).join('')}
      `;
    }

    function buildSauceOptions(selectedId = '') {
      const availableSauces = state.sauces.filter(sauce => {
        const isSelected = String(sauce.id) === String(selectedId);
        return (hasSauceAvailableStock(sauce.id) && getActiveSauceControlForSauceId(sauce.id)) || isSelected;
      });
      if (!availableSauces.length) {
        return '<option value="">No hay salsas abiertas con stock</option>';
      }

      return `
        <option value="">Seleccionar salsa</option>
        ${availableSauces.map(sauce => {
          const activeControl = getActiveSauceControlForSauceId(sauce.id);
          const statusLabel = activeControl ? 'abierta' : 'cerrada';
          return `<option value="${escapeHtml(sauce.id)}" data-name="${escapeHtml(sauce.nombre)}" ${String(sauce.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(sauce.nombre)} · ${statusLabel} · stock ${formatInventoryQuantity(getSauceAvailableStock(sauce.id))}</option>`;
        }).join('')}
      `;
    }

    function buildToppingControlOpenOptions(selectedId = '') {
      if (!state.toppings.length) {
        return '<option value="">No hay toppings registrados</option>';
      }

      const sortedToppings = state.toppings.slice().sort((left, right) => {
        const leftAvailable = getToppingAvailableStock(left.id) > 0 && !getActiveToppingControlForToppingId(left.id);
        const rightAvailable = getToppingAvailableStock(right.id) > 0 && !getActiveToppingControlForToppingId(right.id);
        if (leftAvailable !== rightAvailable) {
          return leftAvailable ? -1 : 1;
        }
        return String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' });
      });

      return sortedToppings.map(topping => {
        const activeControl = getActiveToppingControlForToppingId(topping.id);
        const availableStock = getToppingAvailableStock(topping.id);
        const isAvailable = availableStock > 0;
        const statusLabel = activeControl
          ? '· abierto'
          : isAvailable
            ? '· listo para abrir'
            : '· sin compra disponible';
        return `<option value="${escapeHtml(topping.id)}" ${String(topping.id) === String(selectedId) ? 'selected' : ''} ${!activeControl && isAvailable ? '' : 'disabled'}>${escapeHtml(topping.nombre)} ${statusLabel} · stock ${formatInventoryQuantity(availableStock)}</option>`;
      }).join('');
    }

    function getSaleExtraCatalogItems() {
      const flavorProducts = state.productos.filter(producto => getProductInventoryMode(producto) === 'helado-sabores');
      const catalog = [
        ...getMateriaPrimaProducts().map(producto => ({
          label: `${producto.nombre} · materia prima${getProductCurrentStockLabel(producto)}`,
          value: String(producto.nombre || '').trim(),
          price: Number(producto.precio || 0),
          kind: 'materia-prima',
          id: producto.id
        })),
        ...flavorProducts.map(producto => ({
          label: `${producto.nombre} · helado por sabores${getProductCurrentStockLabel(producto)}`,
          value: String(producto.nombre || '').trim(),
          price: Number(producto.precio || 0),
          kind: 'flavor-product',
          id: producto.id
        })),
        ...state.toppings.filter(topping => hasToppingAvailableStock(topping.id) && getActiveToppingControlForToppingId(topping.id)).map(topping => ({
          label: `${topping.nombre} · topping`,
          value: String(topping.nombre || '').trim(),
          price: 0,
          kind: 'topping',
          id: topping.id
        })),
        ...state.sauces.filter(sauce => hasSauceAvailableStock(sauce.id) && getActiveSauceControlForSauceId(sauce.id)).map(sauce => ({
          label: `${sauce.nombre} · salsa/aderezo`,
          value: String(sauce.nombre || '').trim(),
          price: 0,
          kind: 'sauce',
          id: sauce.id
        }))
      ].filter(item => item.value);

      const uniqueItems = [];
      const seen = new Set();
      catalog.forEach(item => {
        const key = item.value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        uniqueItems.push(item);
      });
      return uniqueItems.sort((left, right) => left.value.localeCompare(right.value, 'es', { sensitivity: 'base' }));
    }

    function refreshSaleExtraCatalogOptions() {
      if (!saleExtraCatalog) return;
      saleExtraCatalog.innerHTML = getSaleExtraCatalogItems().map(item => `<option value="${escapeHtml(item.value)}" label="${escapeHtml(item.label)}"></option>`).join('');
    }

    function buildSaleExtraSelectOptions(selectedValue = '') {
      const items = getSaleExtraCatalogItems();
      if (!items.length) {
        return '<option value="">No hay extras disponibles</option>';
      }
      return `
        <option value="">Seleccionar extra</option>
        ${items.map(item => `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(selectedValue) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      `;
    }

    function findSaleExtraCatalogItem(name) {
      const normalizedName = String(name || '').trim().toLowerCase();
      if (!normalizedName) return null;
      return getSaleExtraCatalogItems().find(item => item.value.toLowerCase() === normalizedName) || null;
    }

    function getProductCurrentStockLabel(producto) {
      return ` · stock actual ${formatInventoryQuantity(producto?.stock || 0)}`;
    }

    function productUsesFlavors(producto) {
      const mode = getProductInventoryMode(producto);
      return (mode === 'helado-sabores' || mode === 'mixto') && Number(producto?.pelotasPorUnidad || 0) > 0;
    }

    function productUsesRecipe(producto) {
      const mode = getProductInventoryMode(producto);
      return mode === 'receta' || mode === 'mixto';
    }

    function shouldShowSaleFlavorSection(producto) {
      const mode = getProductInventoryMode(producto);
      return mode !== 'directo' && mode !== 'materia-prima';
    }

    function findProductById(productId) {
      return state.productos.find(producto => String(producto.id) === String(productId));
    }

    // Legacy DOM-heavy sales-composer helpers kept temporarily while the remaining
    // sale editor internals are migrated out of main.js. New interactive bindings
    // and external entry points now live in sales-composer.js.
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
        return '<span class="sale-flavor-summary-empty">Los extras se agregan ahora como líneas independientes en la hoja principal.</span>';
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
        return '<span class="sale-flavor-summary-empty">Sin personalización todavía.</span>';
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
        <input type="number" class="sale-addon-price" min="0" step="0.01" placeholder="Precio" value="${addon.precio !== undefined ? escapeHtml(addon.precio) : ''}" />
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

    function calculateFlavorUsageCount(flavorId) {
      return state.sales.reduce((sum, venta) => sum + (Array.isArray(venta.items)
        ? venta.items.reduce((itemSum, item) => itemSum + (Array.isArray(item.sabores)
          ? item.sabores.reduce((flavorSum, flavor) => flavorSum + (String(flavor.id) === String(flavorId) ? Number(flavor.porciones || 0) : 0), 0)
          : 0), 0)
        : 0), 0);
    }

    function buildMateriaPrimaOptions(selectedId = '') {
      const materias = getMateriaPrimaProducts();
      if (!materias.length) {
        return '<option value="">No hay materias primas</option>';
      }
      return materias.map(producto => `
        <option value="${escapeHtml(producto.id)}" data-name="${escapeHtml(producto.nombre)}" data-medida="${escapeHtml(producto.medida || '')}" ${String(producto.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(producto.nombre)} (${escapeHtml(producto.medida || 'unidad')})</option>
      `).join('');
    }

    function updateIngredientUnit(event) {
      const select = event.currentTarget;
      const unit = select.selectedOptions[0]?.dataset.medida || '';
      const unitLabel = select.closest('.recipe-row').querySelector('.ingredient-unit');
      unitLabel.textContent = unit ? `${unit}` : '';
    }

    function addRecipeIngredientRow() {
      const materias = getMateriaPrimaProducts();
      const row = document.createElement('div');
      row.className = 'recipe-row';
      if (!materias.length) {
        row.innerHTML = `
          <div class="field" style="grid-column: 1 / -1;">
            <p style="color: var(--danger); font-weight: 700;">No hay materias primas registradas. Registra al menos una materia prima primero.</p>
          </div>
        `;
        recipeRows.appendChild(row);
        return;
      }
      row.innerHTML = `
          <div class="field">
          <select class="ingredient-source" required>
            ${buildMateriaPrimaOptions()}
          </select>
        </div>
        <div class="field">
          <input type="number" class="ingredient-amount" min="0.01" step="0.01" placeholder="Ej. 1.5" required />
          <span class="ingredient-unit"></span>
        </div>
        <div class="field">
          <button type="button" class="secondary-btn remove-ingredient">Eliminar</button>
        </div>
      `;
      const select = row.querySelector('.ingredient-source');
      const removeButton = row.querySelector('.remove-ingredient');
      select.addEventListener('change', updateIngredientUnit);
      removeButton.addEventListener('click', () => row.remove());
      recipeRows.appendChild(row);
      updateIngredientUnit({ currentTarget: select });
    }

    function refreshRecipeRowsOptions() {
      recipeRows.querySelectorAll('.ingredient-source').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = buildMateriaPrimaOptions(currentValue);
        select.value = currentValue;
        if (!select.value && currentValue) {
          select.value = currentValue;
        }
      });
    }

    function setPurchaseRowEditing(row, isEditing) {
      row.classList.toggle('is-editing', isEditing);
      row.querySelector('.purchase-product-source').disabled = !isEditing;
      const linkedSelect = row.querySelector('.purchase-line-flavor-select');
      if (linkedSelect) {
        const field = row.querySelector('.purchase-line-flavor');
        linkedSelect.disabled = !isEditing || field.classList.contains('field-hidden');
      }
      row.querySelector('.purchase-quantity').disabled = !isEditing;
      row.querySelector('.purchase-price').disabled = !isEditing;
      const toggleButton = row.querySelector('.toggle-purchase-line');
      toggleButton.textContent = isEditing ? '✓' : '✎';
      toggleButton.title = isEditing ? 'Guardar fila' : 'Editar fila';
      toggleButton.setAttribute('aria-label', isEditing ? 'Guardar fila' : 'Editar fila');
      syncSearchablePickerTrigger(row.querySelector('.purchase-product-source'));
    }

    function updatePurchaseRowFlavorField(row, preferredLink = null) {
      const productSelect = row.querySelector('.purchase-product-source');
      const flavorField = row.querySelector('.purchase-line-flavor');
      const flavorSelect = row.querySelector('.purchase-line-flavor-select');
      const flavorLabel = row.querySelector('.purchase-line-flavor-label');
      if (!productSelect || !flavorField || !flavorSelect) {
        return;
      }
      const product = findProductById(productSelect.value);
      const requiresLink = productRequiresPurchaseLink(product);
      const preferredValue = preferredLink && preferredLink.type && preferredLink.id
        ? `${preferredLink.type}:${preferredLink.id}`
        : flavorSelect.value;
      if (flavorLabel) {
        flavorLabel.textContent = getPurchaseLinkedTargetLabel(product);
      }
      flavorField.classList.toggle('field-hidden', !requiresLink);
      flavorSelect.innerHTML = buildPurchaseLinkedOptions(product?.id || '', preferredLink?.type || '', preferredLink?.id || '');
      flavorSelect.value = preferredValue;
      if (!flavorSelect.value && preferredValue) {
        flavorSelect.value = '';
      }
      flavorSelect.required = requiresLink;
      flavorSelect.disabled = !requiresLink || !row.classList.contains('is-editing');
    }

    function parsePurchaseRow(row) {
      const select = row.querySelector('.purchase-product-source');
      const flavorSelect = row.querySelector('.purchase-line-flavor-select');
      const quantity = Number(row.querySelector('.purchase-quantity').value);
      const price = Number(row.querySelector('.purchase-price').value);
      const id = select.value;
      const nombre = select.selectedOptions[0]?.dataset.name || '';
      const linkRawValue = String(flavorSelect?.value || '').trim();
      const [linkedType = '', linkedId = ''] = linkRawValue.split(':');
      const linkedLabel = linkedId ? String(flavorSelect.selectedOptions[0]?.textContent || '').trim() : '';
      const linkedName = linkedLabel.split('·')[0]?.trim() || linkedLabel;
      return {
        id,
        nombre,
        cantidad: quantity,
        costo: price,
        linkedType,
        linkedId,
        linkedName,
        flavorId: linkedType === 'flavor' ? linkedId : '',
        flavorName: linkedType === 'flavor' ? linkedName : '',
        toppingId: linkedType === 'topping' ? linkedId : '',
        toppingName: linkedType === 'topping' ? linkedName : '',
        sauceId: linkedType === 'sauce' ? linkedId : '',
        sauceName: linkedType === 'sauce' ? linkedName : ''
      };
    }

    function updatePurchaseRowTotal(row) {
      const quantityValue = Number(row.querySelector('.purchase-quantity')?.value || 0);
      const priceValue = Number(row.querySelector('.purchase-price')?.value || 0);
      const lineTotal = quantityValue > 0 && !Number.isNaN(priceValue) ? quantityValue * priceValue : 0;
      const totalCell = row.querySelector('.purchase-line-total');
      if (totalCell) {
        totalCell.textContent = formatCurrency(lineTotal);
      }
    }

    function addPurchaseLine(selectedId = '', initialQuantity = '', initialPrice = '', startEditing = true) {
      const row = document.createElement('div');
      row.className = 'purchase-row';
      row.innerHTML = `
        <div class="field purchase-product-field">
          <select class="purchase-product-source" required>
            ${buildPurchaseOptions(selectedId)}
          </select>
          <div class="field purchase-line-flavor field-hidden">
            <label class="purchase-line-flavor-label">Asignar a</label>
            <select class="purchase-line-flavor-select">
              <option value="">Selecciona una opción</option>
            </select>
          </div>
        </div>
        <div class="field">
          <input type="number" class="purchase-quantity" min="1" step="1" placeholder="Ej. 20" value="${initialQuantity}" required />
        </div>
        <div class="field">
          <input type="number" class="purchase-price" min="0" step="0.01" placeholder="Ej. 80" value="${initialPrice}" required />
        </div>
        <div class="field">
          <div class="purchase-line-total">C$0,00</div>
        </div>
        <div class="field">
          <div class="purchase-row-actions">
            <button type="button" class="secondary-btn action-icon-btn toggle-purchase-line" title="Guardar fila" aria-label="Guardar fila">✓</button>
            <button type="button" class="delete-product action-icon-btn remove-purchase-line" title="Eliminar fila" aria-label="Eliminar fila">🗑</button>
          </div>
        </div>
      `;
      const select = row.querySelector('.purchase-product-source');
      const removeButton = row.querySelector('.remove-purchase-line');
      const toggleButton = row.querySelector('.toggle-purchase-line');
      const inputs = row.querySelectorAll('.purchase-quantity, .purchase-price');
      const purchasePriceInput = row.querySelector('.purchase-price');
      const flavorSelect = row.querySelector('.purchase-line-flavor-select');
      initializeSearchableProductPickers(row);
      select.addEventListener('change', () => {
        updatePurchaseRowFlavorField(row);
        renderPurchaseInfo();
      });
      flavorSelect.addEventListener('change', renderPurchaseInfo);
      inputs.forEach(input => input.addEventListener('input', () => {
        updatePurchaseRowTotal(row);
        renderPurchaseInfo();
      }));
      purchasePriceInput.addEventListener('blur', () => {
        normalizeMoneyInputValue(purchasePriceInput);
        updatePurchaseRowTotal(row);
        renderPurchaseInfo();
      });
      toggleButton.addEventListener('click', () => {
        const isEditing = row.classList.contains('is-editing');
        if (isEditing) {
          const parsedRow = parsePurchaseRow(row);
          const product = findProductById(parsedRow.id);
          if (!parsedRow.id || parsedRow.cantidad <= 0 || Number.isNaN(parsedRow.costo)) {
            purchaseStatus.className = 'status error';
            purchaseStatus.textContent = 'Completa producto, cantidad y precio antes de guardar la fila.';
            return;
          }
          if (productRequiresPurchaseLink(product) && !parsedRow.linkedId) {
            purchaseStatus.className = 'status error';
            purchaseStatus.textContent = 'Selecciona el destino correcto de la materia prima comprada antes de guardar la fila.';
            return;
          }
          purchaseStatus.className = 'status';
          purchaseStatus.textContent = 'Producto listo en la tabla de compra.';
        }
        setPurchaseRowEditing(row, !isEditing);
      });
      removeButton.addEventListener('click', () => {
        row.remove();
        if (!purchaseLines.querySelector('.purchase-row')) {
          addPurchaseLine();
        }
        renderPurchaseInfo();
      });
      purchaseLines.appendChild(row);
      updatePurchaseRowFlavorField(row);
      updatePurchaseRowTotal(row);
      setPurchaseRowEditing(row, startEditing);
      renderPurchaseInfo();
    }

    function refreshPurchaseLinesOptions() {
      purchaseLines.querySelectorAll('.purchase-row').forEach(row => {
        const select = row.querySelector('.purchase-product-source');
        const currentValue = select.value;
        select.innerHTML = buildPurchaseOptions(currentValue);
        select.value = currentValue;
        syncSearchablePickerTrigger(select);
        const parsedRow = parsePurchaseRow(row);
        updatePurchaseRowFlavorField(row, parsedRow.linkedId ? { type: parsedRow.linkedType, id: parsedRow.linkedId } : null);
      });
    }

    function updateFormFields() {
      const mode = normalizeInventoryMode(controlModeInput.value) || 'directo';
      const isMateriaPrima = mode === 'materia-prima';
      const usesRecipe = mode === 'receta' || mode === 'mixto';
      const usesFlavors = mode === 'helado-sabores' || mode === 'mixto';
      const hasExtraFields = isMateriaPrima || usesRecipe || usesFlavors;

      if (ingresoProductFormPanel) {
        ingresoProductFormPanel.classList.toggle('has-extra-fields', hasExtraFields);
      }

      typeSelect.value = isMateriaPrima
        ? 'materia prima'
        : usesRecipe
          ? 'producto terminado'
          : 'productos';

      recipeBuilder.style.display = usesRecipe ? 'block' : 'none';
      measureField.style.display = isMateriaPrima ? 'block' : 'none';
      yieldField.style.display = isMateriaPrima ? 'block' : 'none';
      priceField.style.display = isMateriaPrima ? 'none' : 'block';
      flavorControlField.classList.toggle('field-hidden', !usesFlavors);
      priceInput.disabled = isMateriaPrima;
      priceInput.required = !isMateriaPrima;
      yieldPerPurchaseInput.disabled = !isMateriaPrima;
      yieldPerPurchaseInput.required = isMateriaPrima;
      if (isMateriaPrima) {
        priceInput.value = '';
      }
      controlSaboresInput.checked = usesFlavors;
      if (!usesFlavors) {
        scoopsPerUnitInput.value = '';
      }
      if (usesRecipe || usesFlavors) {
        stockMinField.style.display = 'none';
        stockMinInput.disabled = true;
        stockMinInput.required = false;
        stockMinInput.value = 0;
      } else {
        stockMinField.style.display = 'block';
        stockMinInput.disabled = false;
        stockMinInput.required = true;
      }
      addIngredientButton.disabled = !usesRecipe;
      scoopsPerUnitInput.disabled = !usesFlavors;
      scoopsPerUnitInput.required = usesFlavors;
      if (usesRecipe && !recipeRows.querySelector('.recipe-row')) {
        addRecipeIngredientRow();
      }
      if (!usesRecipe) {
        recipeRows.innerHTML = '';
      }
    }

    updateFormFields();

    function isMobileNavLayout() {
      return Boolean(mobileNavMediaQuery.matches);
    }

    function setMobileNavOpen(isOpen) {
      const sidebar = document.querySelector('.sidebar');
      const shouldOpen = Boolean(isOpen) && isMobileNavLayout() && !document.body.classList.contains('auth-locked');
      document.body.classList.toggle('mobile-nav-open', shouldOpen);
      if (sidebar) {
        sidebar.classList.toggle('active', shouldOpen);
      } else if (shouldOpen) {
        console.warn('No se encontró el sidebar para el menú móvil.');
      }
      if (mobileNavToggleButton) {
        mobileNavToggleButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      }
    }

    function toggleSidebar() {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) {
        console.warn('No se encontró el sidebar para alternar el menú móvil.');
        return;
      }
      setMobileNavOpen(!sidebar.classList.contains('active'));
    }

    function closeMobileNav() {
      setMobileNavOpen(false);
    }

    function syncMobileNavCurrentModule(tabName) {
      if (!mobileNavCurrentModule) {
        return;
      }
      const activeTabButton = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
      mobileNavCurrentModule.textContent = activeTabButton ? activeTabButton.textContent.trim() : 'Menú';
    }

    function setActiveTab(tabName) {
      if (!canAccessModule(tabName)) {
        tabName = getFirstAccessibleModule();
      }
      state.activeTab = tabName;
      try {
        window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);
      } catch (error) {
      }
      tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
      modulePanels.forEach(panel => panel.classList.toggle('active', panel.id === `module-${tabName}`));
      syncMobileNavCurrentModule(tabName);
      closeMobileNav();
      if (tabName === 'dashboard') {
        renderDashboard();
      }
      if (tabName === 'inventario') {
        renderInventario();
      }
      if (tabName === 'sabores') {
        renderFlavorList();
      }
    }

    function buildOptions(selectedId = '') {
      const sellableProducts = getSellableProducts();
      if (!sellableProducts.length) {
        return '<option value="">No hay productos</option>';
      }
      return sellableProducts.map(producto => `
        <option value="${escapeHtml(producto.id)}" data-name="${escapeHtml(producto.nombre)}" ${String(producto.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(producto.nombre)} — ${escapeHtml(renderInventoryModeLabel(producto))}${productUsesFlavors(producto) ? ` · ${Number(producto.pelotasPorUnidad || 0)} porciones` : ''}${escapeHtml(getProductCurrentStockLabel(producto))}</option>
      `).join('');
    }

    function buildPurchaseOptions(selectedId = '') {
      if (!state.productos.length) {
        return '<option value="">No hay productos registrados</option>';
      }
      const purchasableProducts = getPurchasableProducts();
      if (!purchasableProducts.length) {
        return state.productos.map(producto => `
        <option value="${escapeHtml(producto.id)}" data-name="${escapeHtml(producto.nombre)}" disabled>${escapeHtml(producto.nombre)} — ${escapeHtml(renderInventoryModeLabel(producto))}${escapeHtml(getProductCurrentStockLabel(producto))} · no se compra por este módulo</option>
      `).join('');
      }
      return state.productos.map(producto => `
        <option value="${escapeHtml(producto.id)}" data-name="${escapeHtml(producto.nombre)}" ${String(producto.id) === String(selectedId) ? 'selected' : ''} ${canBePurchased(producto) ? '' : 'disabled'}>${escapeHtml(producto.nombre)} — ${escapeHtml(renderInventoryModeLabel(producto))}${escapeHtml(getProductCurrentStockLabel(producto))}${canBePurchased(producto) ? '' : ' · no se compra por este módulo'}</option>
      `).join('');
    }

    function hasProductMovements(productId) {
      const idStr = String(productId);
      const purchaseMatch = state.purchases.some(invoice => Array.isArray(invoice.items) && invoice.items.some(item => String(item.id) === idStr));
      const saleMatch = state.sales.some(invoice => Array.isArray(invoice.items)
        ? invoice.items.some(item => String(item.id) === idStr)
        : String(invoice.id) === idStr);
      const inventoryMatch = state.inventoryMovements.some(movement => String(movement.productoId) === idStr);
      return purchaseMatch || saleMatch || inventoryMatch;
    }

    function populateSelects() {
      refreshRecipeRowsOptions();
      refreshPurchaseLinesOptions();
      refreshSaleLinesOptions();
      refreshSaleExtraCatalogOptions();
      renderDashboard();
      initializeSearchableProductPickers(document);
      if (flavorRawMaterialInput) {
        flavorRawMaterialInput.innerHTML = buildRawMaterialOptions(flavorRawMaterialInput.value);
      }
      if (toppingRawMaterialInput) {
        toppingRawMaterialInput.innerHTML = buildRawMaterialOptions(toppingRawMaterialInput.value);
      }
      if (sauceRawMaterialInput) {
        sauceRawMaterialInput.innerHTML = buildRawMaterialOptions(sauceRawMaterialInput.value);
      }
      if (bucketOpenFlavorInput) {
        bucketOpenFlavorInput.innerHTML = buildBucketFlavorOptions(bucketOpenFlavorInput.value);
      }
      renderInventoryMovementForms();
      if (!purchaseLines.querySelector('.purchase-row')) {
        addPurchaseLine();
      }
      if (!saleLines.querySelector('.purchase-row')) {
        addSaleLine();
      }
      renderPurchaseInfo();
      renderPurchaseHistory();
      renderPurchaseRegistro();
      renderPurchasePayables();
      renderSaleInfo();
      renderSaleRegistro();
      renderSaleReceivables();
      renderPaymentCategoryOptions();
      renderPaymentCategoryList();
      renderPaymentInfo();
      renderPaymentRegistro();
      renderPendingPayments();
      renderFundsModule();
      renderFlavorList();
      renderToppingList();
      renderSauceList();
      renderBucketControls();
      renderToppingControls();
      renderSauceControls();
      renderIngresoList();
      updateFormFields();
    }

    function formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function isCreditSale(venta) {
      return String(venta.originalPaymentType || venta.paymentType || '').toLowerCase() === 'credito';
    }

    function isCashSale(venta) {
      return String(venta.originalPaymentType || venta.paymentType || '').toLowerCase() === 'contado';
    }

    function canManageSalePayment(venta) {
      return isCreditSale(venta) || isCashSale(venta);
    }

    function getNormalizedRecordPaymentHistory(record, totalAmount = 0) {
      const source = Array.isArray(record?.paymentHistory) ? record.paymentHistory : [];
      const normalized = source
        .map(entry => {
          const amount = Number(entry?.amount || 0);
          const date = entry?.date ? new Date(entry.date) : null;
          if (Number.isNaN(amount) || amount <= 0 || !date || Number.isNaN(date.getTime())) {
            return null;
          }
          return {
            id: String(entry.id || `${date.toISOString()}-${amount}`),
            amount,
            date: date.toISOString(),
            paymentMethod: String(entry.paymentMethod || '').trim().toLowerCase() || null,
            paymentReference: String(entry.paymentReference || '').trim() || null,
            receiptNumber: String(entry.receiptNumber || '').trim() || null,
            account: String(entry.account || '').trim().toLowerCase() || getFundAccountFromPaymentMethod(entry.paymentMethod),
            note: String(entry.note || '').trim() || null
          };
        })
        .filter(Boolean)
        .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0));

      if (normalized.length) {
        return normalized;
      }

      if (record?.paidAt && totalAmount > 0) {
        return [{
          id: `legacy-${String(record.id || '')}`,
          amount: totalAmount,
          date: record.paidAt,
          paymentMethod: String(record.paymentMethod || '').trim().toLowerCase() || null,
          paymentReference: String(record.paymentReference || '').trim() || null,
          receiptNumber: String(record.receiptNumber || '').trim() || null,
          account: getFundAccountFromPaymentMethod(record.paymentMethod),
          note: null
        }];
      }

      return [];
    }

    function getRecordTotalPaid(record, totalAmount = 0) {
      return Math.min(
        getNormalizedRecordPaymentHistory(record, totalAmount).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
        totalAmount
      );
    }

    function getLastRecordPayment(record, totalAmount = 0) {
      const history = getNormalizedRecordPaymentHistory(record, totalAmount);
      return history.length ? history[history.length - 1] : null;
    }

    function resolveAccountStatus(balanceDue, totalPaid, dueDateValue) {
      if (balanceDue <= 0.0001) {
        return { key: 'success', label: 'Pagada' };
      }
      const dueDate = dueDateValue ? new Date(dueDateValue) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < today) {
        return { key: 'overdue', label: totalPaid > 0 ? 'Abonada vencida' : 'Vencida' };
      }
      return { key: 'pending', label: totalPaid > 0 ? 'Abonada' : 'Pendiente' };
    }

    function getExternalDebtOriginalAmount(debt) {
      return Math.max(Number(debt?.originalAmount || debt?.totalAmount || debt?.amount || 0), 0);
    }

    function getExternalDebtPaidAmount(debt) {
      return getRecordTotalPaid(debt, getExternalDebtOriginalAmount(debt));
    }

    function getExternalDebtBalanceDue(debt) {
      return Math.max(getExternalDebtOriginalAmount(debt) - getExternalDebtPaidAmount(debt), 0);
    }

    function getExternalDebtStatus(debt) {
      return resolveAccountStatus(getExternalDebtBalanceDue(debt), getExternalDebtPaidAmount(debt), debt?.dueDate);
    }

    function renderAccountStatementTable(container, record, totalAmount, emptyMessage = 'Aún no hay abonos registrados.', options = {}) {
      if (!container) {
        return;
      }
      const history = getNormalizedRecordPaymentHistory(record, totalAmount).slice().reverse();
      const showActions = typeof options.renderActions === 'function';
      if (!history.length) {
        container.innerHTML = `<p class="history-empty">${escapeHtml(emptyMessage)}</p>`;
        return;
      }

      container.innerHTML = `
        <table class="history-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Método</th>
              <th>Cuenta</th>
              <th>Monto</th>
              <th>Referencia</th>
              <th>Observación</th>
              ${showActions ? '<th>Acción</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${history.map(entry => `
              <tr>
                <td>${formatDate(entry.date)}</td>
                <td>${escapeHtml(formatInvoicePaymentMethod(entry.paymentMethod || entry.account || '-'))}</td>
                <td>${escapeHtml(getFundAccountLabel(entry.account || getFundAccountFromPaymentMethod(entry.paymentMethod)))}</td>
                <td>${formatCurrency(entry.amount)}</td>
                <td>${escapeHtml(entry.paymentReference || '-')}</td>
                <td>${escapeHtml(entry.note || '-')}</td>
                ${showActions ? `<td>${options.renderActions(entry) || '-'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    function buildNextDocumentNumber(records, prefix) {
      const maxSequence = records.reduce((maxValue, record) => {
        const documentValue = String(record.documento || record.document || '').trim().toUpperCase();
        if (!documentValue.startsWith(`${prefix}-`)) {
          return maxValue;
        }
        const sequence = Number(documentValue.slice(prefix.length + 1));
        return Number.isNaN(sequence) ? maxValue : Math.max(maxValue, sequence);
      }, 0);

      return `${prefix}-${String(maxSequence + 1).padStart(4, '0')}`;
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
      setPurchasePayableStatus('Corrige el método, la referencia o la fecha del abono seleccionado.');
    }

    function updateNextSaleDocumentNumber() {
      if (!saleDocumentInput) return;
      saleDocumentInput.value = buildNextDocumentNumber(state.sales, 'FV');
    }

    function calculatePurchaseTotalAmount() {
      const rows = Array.from(purchaseLines.querySelectorAll('.purchase-row'));
      if (!rows.length) {
        return 0;
      }
      return rows.reduce((sum, row) => {
        const quantity = Number(row.querySelector('.purchase-quantity').value);
        const price = Number(row.querySelector('.purchase-price').value);
        return sum + (Number.isNaN(quantity) || Number.isNaN(price) ? 0 : quantity * price);
      }, 0);
    }

    function formatCurrency(value) {
      return `C$${Number(value || 0).toFixed(2).replace('.', ',')}`;
    }

    function setLastRegisteredPaymentForPrint(payment) {
      lastRegisteredPayment = payment || null;
    }

    function printOutgoingReceipt(receipt, options = {}) {
      if (!receipt) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'No hay un comprobante listo para imprimir.';
        return;
      }

      const { autoPrint = false } = options;
      const printWindow = window.open('', '_blank', 'width=900,height=720');
      if (!printWindow) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'El navegador bloqueó la ventana del recibo. Permite ventanas emergentes e inténtalo de nuevo.';
        return;
      }

      const receiptNumber = receipt.receiptNumber || receipt.reference || `REC-${String(receipt.recordId || receipt.id || '').slice(-6).toUpperCase()}`;
      const issueDate = receipt.issueDate || receipt.date;
      const html = `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Recibo ${escapeHtml(receiptNumber)}</title>
            <style>
              * { box-sizing: border-box; }
              @page {
                size: 8.5in 5.5in;
                margin: 0.35in;
              }
              body {
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                color: #0f172a;
                background: #f8fafc;
              }
              .preview-actions {
                position: sticky;
                top: 0;
                z-index: 10;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px 16px;
                border-bottom: 1px solid #dbe2f0;
                background: #ffffff;
              }
              .preview-btn {
                border: 1px solid #9db4ff;
                background: #4f67ff;
                color: #ffffff;
                border-radius: 999px;
                padding: 8px 14px;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
              }
              .preview-hint {
                margin-right: auto;
                align-self: center;
                color: #64748b;
                font-size: 12px;
              }
              .sheet {
                width: 100%;
                max-width: 7.8in;
                min-height: 4.6in;
                margin: 18px auto;
                padding: 20px 24px;
                background: #ffffff;
                border: 1px solid #dbe2f0;
                border-radius: 24px;
                box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
              }
              .header {
                display: flex;
                justify-content: space-between;
                gap: 18px;
                align-items: flex-start;
                padding-bottom: 18px;
                border-bottom: 2px solid #e2e8f0;
              }
              .eyebrow {
                display: inline-flex;
                padding: 6px 12px;
                border-radius: 999px;
                background: #e0e7ff;
                color: #374151;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              h1 {
                margin: 14px 0 8px;
                font-size: 28px;
                line-height: 1.1;
              }
              .header-meta {
                text-align: right;
                font-size: 13px;
                color: #475569;
              }
              .summary {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 14px;
                margin: 18px 0;
              }
              .summary-card {
                padding: 14px 16px;
                border: 1px solid #dbe2f0;
                border-radius: 18px;
                background: #f8fafc;
              }
              .summary-card span {
                display: block;
                font-size: 12px;
                color: #64748b;
                margin-bottom: 6px;
              }
              .summary-card strong {
                font-size: 18px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
              }
              th,
              td {
                border-bottom: 1px solid #e2e8f0;
                padding: 10px 8px;
                vertical-align: top;
                text-align: left;
              }
              th {
                width: 32%;
                color: #64748b;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
              }
              .receipt-grid {
                display: grid;
                grid-template-columns: 1.15fr 0.85fr;
                gap: 18px;
                align-items: start;
              }
              .amount-box {
                margin-top: 0;
                padding: 18px 20px;
                border-radius: 20px;
                background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%);
                border: 1px solid #c7d2fe;
              }
              .amount-box span {
                display: block;
                font-size: 12px;
                color: #64748b;
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
              }
              .amount-box strong {
                font-size: 30px;
              }
              .footer {
                margin-top: 18px;
                padding-top: 18px;
                border-top: 1px dashed #cbd5e1;
                color: #64748b;
                font-size: 12px;
              }
              .signatures {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 28px;
                margin-top: 24px;
              }
              .signature-line {
                border-top: 1px solid #94a3b8;
                padding-top: 8px;
                text-align: center;
                font-size: 12px;
                color: #475569;
              }
              @media print {
                .preview-actions { display: none; }
                body { background: #ffffff; }
                .sheet {
                  margin: 0 auto;
                  border: none;
                  border-radius: 0;
                  box-shadow: none;
                  max-width: none;
                  min-height: auto;
                  padding: 0;
                }
              }
            </style>
          </head>
          <body>
            <div class="preview-actions">
              <span class="preview-hint">Recibo listo para media carta.</span>
              <button class="preview-btn" onclick="window.print()">Imprimir recibo</button>
            </div>
            <main class="sheet">
              <header class="header">
                <div>
                  <span class="eyebrow">Recibo de pago</span>
                  <h1>${escapeHtml(receiptNumber)}</h1>
                  <div>${escapeHtml(receipt.title || 'Comprobante de pago')}</div>
                </div>
                <div class="header-meta">
                  <div><strong>Fecha:</strong> ${escapeHtml(formatDate(receipt.date))}</div>
                  <div><strong>Emitido:</strong> ${escapeHtml(formatDate(issueDate))}</div>
                  <div><strong>Estado:</strong> ${escapeHtml(receipt.statusLabel || 'Registrado')}</div>
                </div>
              </header>

              <section class="summary">
                <article class="summary-card">
                  <span>Tercero</span>
                  <strong>${escapeHtml(receipt.counterparty || 'No especificado')}</strong>
                </article>
                <article class="summary-card">
                  <span>Concepto</span>
                  <strong>${escapeHtml(receipt.category || 'Sin clasificación')}</strong>
                </article>
                <article class="summary-card">
                  <span>Método</span>
                  <strong>${escapeHtml(receipt.methodLabel || '-')}</strong>
                </article>
                <article class="summary-card">
                  <span>Referencia</span>
                  <strong>${escapeHtml(receipt.reference || 'Sin referencia')}</strong>
                </article>
              </section>

              <section class="receipt-grid">
                <table>
                  <tbody>
                    <tr>
                      <th>Descripción</th>
                      <td>${escapeHtml(receipt.description || 'N/A')}</td>
                    </tr>
                    <tr>
                      <th>Observación</th>
                      <td>${escapeHtml(receipt.note || 'Sin observación')}</td>
                    </tr>
                    <tr>
                      <th>ID de registro</th>
                      <td>${escapeHtml(String(receipt.recordId || receipt.id || 'N/A'))}</td>
                    </tr>
                  </tbody>
                </table>

                <section class="amount-box">
                  <span>Monto pagado</span>
                  <strong>${escapeHtml(formatCurrency(receipt.amount))}</strong>
                </section>
              </section>

              <div class="signatures">
                <div class="signature-line">Entregado por</div>
                <div class="signature-line">Recibido por</div>
              </div>

              <footer class="footer">
                ${escapeHtml(receipt.footerText || 'Documento generado desde el módulo Pagos. Conserva este recibo como respaldo de la salida registrada.')}
              </footer>
            </main>
            <script>
              ${autoPrint ? 'window.addEventListener("load", () => window.print());' : ''}
            <\/script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    }

    function printPaymentReceipt(payment = lastRegisteredPayment, options = {}) {
      if (!payment) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'No hay un pago registrado listo para imprimir.';
        return;
      }
      return printOutgoingReceipt({
        id: payment.id,
        recordId: payment.id,
        receiptNumber: payment.receiptNumber,
        reference: payment.reimbursementReference || payment.referencia || null,
        date: payment.fecha,
        issueDate: payment.receiptIssuedAt || payment.createdAt || payment.fecha,
        statusLabel: getPaymentStatusLabel(payment),
        title: 'Salida registrada en pagos',
        counterparty: payment.beneficiario || 'No especificado',
        category: getPaymentCategoryName(payment),
        methodLabel: getPaymentMethodLabel(payment.paymentMethod),
        description: payment.descripcion || 'Pago registrado',
        note: payment.observacion || '',
        amount: Number(payment.monto || 0)
      }, options);
    }

    function printPurchasePayableReceipt(compra, paymentEntry, options = {}) {
      if (!compra || !paymentEntry) {
        return;
      }
      return printOutgoingReceipt({
        id: paymentEntry.id,
        recordId: compra.id,
        receiptNumber: paymentEntry.receiptNumber || paymentEntry.paymentReference || null,
        reference: paymentEntry.paymentReference || null,
        date: paymentEntry.date,
        issueDate: paymentEntry.date,
        statusLabel: getPurchaseAccountStatus(compra).label,
        title: `Abono a cuenta por pagar ${compra.documento || compra.document || ''}`.trim(),
        counterparty: compra.proveedor || 'Proveedor no especificado',
        category: 'Cuenta por pagar',
        methodLabel: getPaymentMethodLabel(paymentEntry.paymentMethod),
        description: `Documento ${compra.documento || compra.document || '-'} · ${compra.proveedor || 'Proveedor'}`,
        note: paymentEntry.note || 'Abono aplicado a compra del negocio.',
        amount: Number(paymentEntry.amount || 0)
      }, options);
    }

    function printSalePayableReceipt(venta, paymentEntry, options = {}) {
      if (!venta || !paymentEntry) {
        return;
      }
      return printOutgoingReceipt({
        id: paymentEntry.id,
        recordId: venta.id,
        receiptNumber: paymentEntry.receiptNumber || paymentEntry.paymentReference || null,
        reference: paymentEntry.paymentReference || null,
        date: paymentEntry.date,
        issueDate: paymentEntry.date,
        statusLabel: getSaleAccountStatus(venta).label,
        title: `Cobro de cuenta por cobrar ${venta.documento || ''}`.trim(),
        counterparty: venta.cliente || 'Cliente no especificado',
        category: 'Cuenta por cobrar',
        methodLabel: getPaymentMethodLabel(paymentEntry.paymentMethod),
        description: `Factura ${venta.documento || '-'} · ${venta.cliente || 'Cliente'}`,
        note: paymentEntry.note || 'Cobro aplicado a venta a crédito.',
        amount: Number(paymentEntry.amount || 0),
        footerText: 'Documento generado desde el módulo de cuentas por cobrar. Conserva este recibo como respaldo del cobro registrado.'
      }, options);
    }

    function printExternalDebtReceipt(debt, paymentEntry, options = {}) {
      if (!debt || !paymentEntry) {
        return;
      }
      return printOutgoingReceipt({
        id: paymentEntry.id,
        recordId: debt.id,
        receiptNumber: paymentEntry.receiptNumber || paymentEntry.paymentReference || null,
        reference: paymentEntry.paymentReference || null,
        date: paymentEntry.date,
        issueDate: paymentEntry.date,
        statusLabel: getExternalDebtStatus(debt).label,
        title: debt.type === 'por-cobrar' ? 'Abono a deuda externa por cobrar' : 'Abono a deuda externa por pagar',
        counterparty: debt.tercero || 'Tercero no especificado',
        category: debt.concepto || 'Deuda externa',
        methodLabel: getPaymentMethodLabel(paymentEntry.paymentMethod || paymentEntry.account),
        description: `${debt.type === 'por-cobrar' ? 'Cobro' : 'Pago'} externo: ${debt.concepto || 'Sin concepto'}`,
        note: paymentEntry.note || debt.observacion || '',
        amount: Number(paymentEntry.amount || 0)
      }, options);
    }

    function isReceiptReference(reference) {
      return /^REC-\d+$/i.test(String(reference || '').trim());
    }

    function buildReceiptReferenceMarkup(reference, datasetName, datasetValue) {
      const normalizedReference = String(reference || '').trim();
      if (!normalizedReference) {
        return 'N/A';
      }
      if (!isReceiptReference(normalizedReference)) {
        return escapeHtml(normalizedReference);
      }
      return `<button type="button" class="invoice-link-btn" data-${datasetName}="${escapeHtml(String(datasetValue || ''))}" title="Reimprimir recibo">${escapeHtml(normalizedReference)}</button>`;
    }

    function buildPaymentEntryReceiptMarkup(paymentEntry, datasetName, datasetValue) {
      if (!paymentEntry) {
        return 'N/A';
      }
      const label = String(paymentEntry.receiptNumber || paymentEntry.paymentReference || 'Ver recibo').trim();
      return `<button type="button" class="invoice-link-btn" data-${datasetName}="${escapeHtml(String(datasetValue || ''))}" title="Reimprimir recibo">${escapeHtml(label)}</button>`;
    }

    function getActionIcon(label) {
      const normalizedLabel = String(label || '').trim().toLowerCase();
      if (normalizedLabel.includes('estado de cuenta') || normalizedLabel.includes('recibo')) return '🧾';
      if (normalizedLabel.includes('abono') || normalizedLabel.includes('pago')) return '💵';
      if (normalizedLabel.includes('editar')) return '✎';
      return '⚙';
    }

    function startEditPayment(paymentId) {
      const payment = state.payments.find(item => String(item.id) === String(paymentId));
      if (!payment) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'No se encontró el pago seleccionado.';
        return;
      }
      editingPaymentId = String(payment.id);
      paymentDateInput.value = payment.fecha ? new Date(payment.fecha).toISOString().slice(0, 10) : getTodayInputValue();
      paymentCategoryInput.value = String(payment.categoriaId || '');
      paymentMethodInput.value = String(payment.paymentMethod || 'efectivo');
      paymentAmountInput.value = Number(payment.monto || 0).toFixed(2);
      paymentDescriptionInput.value = payment.descripcion || '';
      paymentBeneficiaryInput.value = payment.beneficiario || '';
      paymentReferenceInput.value = payment.paymentMethod === 'efectivo'
        ? ''
        : (payment.referencia || '');
      paymentNoteInput.value = payment.observacion || '';
      updatePaymentMethodSection();
      if (paymentSubmitButton) {
        paymentSubmitButton.textContent = 'Guardar cambios';
      }
      if (cancelPaymentEditButton) {
        cancelPaymentEditButton.classList.remove('field-hidden');
      }
      paymentTabs.forEach(button => button.classList.toggle('active', button.dataset.paymentTab === 'new'));
      paymentNewPanel.classList.add('active');
      paymentRegistroPanel.classList.remove('active');
      paymentPendingPanel.classList.remove('active');
      paymentCatalogPanel.classList.remove('active');
      paymentStatus.className = 'status';
      paymentStatus.textContent = `Editando pago: ${payment.descripcion || 'registro'}.`;
    }

    function legacyResetExternalDebtFormEditing() {
      editingExternalDebtId = null;
      externalDebtForm.reset();
      applyDefaultDateValues();
      if (externalDebtSubmitButton) {
        externalDebtSubmitButton.textContent = 'Registrar deuda externa';
      }
      if (cancelExternalDebtEditButton) {
        cancelExternalDebtEditButton.classList.add('field-hidden');
      }
    }

    function startEditExternalDebt(debtId) {
      const debt = state.externalDebts.find(item => String(item.id) === String(debtId));
      if (!debt) {
        setExternalDebtStatus('No se encontró la deuda externa seleccionada.', { error: true });
        return;
      }
      fundTabs.forEach(button => button.classList.toggle('active', button.dataset.fundTab === 'external'));
      fundOverviewPanel.classList.add('field-hidden');
      fundCashPanel.classList.remove('active');
      fundBankPanel.classList.remove('active');
      fundExternalPanel.classList.add('active');
      editingExternalDebtId = String(debt.id);
      externalDebtTypeInput.value = debt.type || 'por-pagar';
      externalDebtCategoryInput.value = (debt.categoria || debt.category || 'gasto');
      externalDebtDateInput.value = debt.fecha ? new Date(debt.fecha).toISOString().slice(0, 10) : getTodayInputValue();
      externalDebtDueDateInput.value = debt.dueDate ? new Date(debt.dueDate).toISOString().slice(0, 10) : '';
      externalDebtAmountInput.value = Number(getExternalDebtOriginalAmount(debt) || 0).toFixed(2);
      externalDebtPartyInput.value = debt.tercero || '';
      externalDebtConceptInput.value = debt.concepto || '';
      externalDebtNoteInput.value = debt.observacion || '';
      if (externalDebtSubmitButton) {
        externalDebtSubmitButton.textContent = 'Guardar cambios';
      }
      if (cancelExternalDebtEditButton) {
        cancelExternalDebtEditButton.classList.remove('field-hidden');
      }
      setExternalDebtStatus(`Editando deuda externa: ${debt.concepto || 'registro'}.`);
    }

    function normalizeMoneyInputValue(input) {
      const rawValue = String(input.value || '').trim().replace(',', '.');
      if (!rawValue) return;
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) return;
      input.value = numericValue.toFixed(2);
    }

    function bindMoneyNormalization() {
      const moneyInputs = [priceInput, salePriceInput, cashOutInput];
      moneyInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('blur', () => normalizeMoneyInputValue(input));
      });
    }

    function requiresPaymentReference(method) {
      return method === 'transferencia' || method === 'tarjeta';
    }

    purchasePayableMethodInput.addEventListener('change', () => updatePurchasePayableReferenceVisibility());
    salePayableMethodInput.addEventListener('change', updateSalePayableReferenceVisibility);

    purchasePayableForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payingPurchaseId = getPayingPurchaseId();
      const editingPurchasePaymentEntryId = getEditingPurchasePaymentEntryId();

      if (!payingPurchaseId) {
        setPurchasePayableStatus('No se encontró la cuenta por pagar seleccionada.', { error: true });
        showError('No se encontró la cuenta por pagar seleccionada.');
        return;
      }

      const payload = {
        paymentMethod: purchasePayableMethodInput.value,
        paymentReference: purchasePayableReferenceInput.value.trim(),
        paidAt: purchasePayableDateInput.value,
        amount: Number(purchasePayableAmountInput.value || 0),
        paymentEntryId: editingPurchasePaymentEntryId || null
      };

      if (!payload.paymentMethod || !payload.paidAt || Number.isNaN(payload.amount) || payload.amount <= 0) {
        setPurchasePayableStatus('Selecciona un método y una fecha de pago válidos.', { error: true });
        showError('Selecciona un método y una fecha de pago válidos.');
        return;
      }

      if (requiresPaymentReference(payload.paymentMethod) && !payload.paymentReference) {
        setPurchasePayableStatus('La referencia es obligatoria para tarjeta o transferencia.', { error: true });
        showError('La referencia es obligatoria para tarjeta o transferencia.');
        return;
      }

      if (!setLoadingState(purchasePayableForm, true, { label: 'Aplicando...' })) {
        return;
      }

      try {
        setPurchasePayableStatus('Aplicando pago...');
        const response = await fetch(buildApiUrl(`/compras/${encodeURIComponent(payingPurchaseId)}/pagar`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(result.error || 'No se pudo aplicar el pago.');
        }
        const updatedPurchase = result.compra || null;
        const latestPayment = updatedPurchase ? getLastRecordPayment(updatedPurchase, getPurchaseTotalAmount(updatedPurchase)) : null;

        purchaseStatus.className = 'status';
        purchaseStatus.textContent = result.message || 'Pago aplicado correctamente.';
  showSuccess(result.message || 'Pago aplicado correctamente.');
        closePurchasePayableModalPanel();
        await Promise.all([fetchCompras(), fetchPayments()]);
        renderPurchaseRegistro();
        renderPurchasePayables();
        renderPaymentInfo();
        renderPaymentRegistro();
        renderPendingPayments();
        renderFundsModule();
        if (latestPayment) {
          printPurchasePayableReceipt(updatedPurchase, latestPayment, { autoPrint: true });
        }
      } catch (error) {
        setPurchasePayableStatus(error.message, { error: true });
        showError(error.message);
        console.error(error);
      } finally {
        setLoadingState(purchasePayableForm, false);
      }
    });

    salePayableForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payingSaleId = getPayingSaleId();
      const editingSalePaymentEntryId = getEditingSalePaymentEntryId();

      if (!payingSaleId) {
        setSalePayableStatus('No se encontr? la cuenta por cobrar seleccionada.', { error: true });
        showError('No se encontr? la cuenta por cobrar seleccionada.');
        return;
      }

      const payload = {
        paymentMethod: salePayableMethodInput.value,
        paymentReference: salePayableReferenceInput.value.trim(),
        paidAt: salePayableDateInput.value,
        amount: Number(salePayableAmountInput.value || 0),
        paymentEntryId: editingSalePaymentEntryId || null
      };

      if (!payload.paymentMethod || !payload.paidAt || Number.isNaN(payload.amount) || payload.amount <= 0) {
        setSalePayableStatus('Selecciona un método y una fecha de pago válidos.', { error: true });
        showError('Selecciona un método y una fecha de pago válidos.');
        return;
      }

      if (requiresPaymentReference(payload.paymentMethod) && !payload.paymentReference) {
        setSalePayableStatus('La referencia es obligatoria para tarjeta o transferencia.', { error: true });
        showError('La referencia es obligatoria para tarjeta o transferencia.');
        return;
      }

      if (!setLoadingState(salePayableForm, true, { label: 'Aplicando...' })) {
        return;
      }

      try {
        setSalePayableStatus('Aplicando pago...');
        const response = await fetch(buildApiUrl(`/ventas/${encodeURIComponent(payingSaleId)}/pagar`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(result.error || 'No se pudo aplicar el pago.');
        }

        const updatedSale = result.venta || null;
        const latestPayment = updatedSale ? getLastRecordPayment(updatedSale, getSaleTotalAmount(updatedSale)) : null;

        saleStatus.className = 'status';
        saleStatus.textContent = result.message || 'Pago aplicado correctamente.';
        showSuccess(result.message || 'Pago aplicado correctamente.');
        closeSalePayableModalPanel();
        await fetchVentas();
        renderSaleRegistro();
        renderSaleReceivables();
        if (latestPayment) {
          printSalePayableReceipt(updatedSale, latestPayment, { autoPrint: true });
        }
      } catch (error) {
        setSalePayableStatus(error.message, { error: true });
        showError(error.message);
        console.error(error);
      } finally {
        setLoadingState(salePayableForm, false);
      }
    });

    function updateCashReconciliation() {
      const totalAmount = calculatePurchaseTotalAmount();
      cashTotalText.textContent = formatCurrency(totalAmount);
    }

    function updateCashReferenceVisibility() {
      const shouldShowReference = requiresPaymentReference(cashMethodInput.value);
      cashReferenceRow.classList.toggle('field-hidden', !shouldShowReference);
      cashReferenceInput.required = shouldShowReference;
      if (!shouldShowReference) {
        cashReferenceInput.value = '';
      }
    }

    function renderPurchaseInfo() {
      const rows = Array.from(purchaseLines.querySelectorAll('.purchase-row'));
      if (!rows.length) {
        purchaseInfo.textContent = 'Agrega al menos un producto a la factura.';
        if (purchaseTotal) purchaseTotal.textContent = 'C$0,00';
        updateCashReconciliation();
        return;
      }
      const totalAmount = calculatePurchaseTotalAmount();
      const formattedTotal = `C$${totalAmount.toFixed(2).replace('.', ',')}`;
      purchaseInfo.innerHTML = `
        <strong>${rows.length} productos</strong> · Total estimado: ${formattedTotal}
      `;
      if (purchaseTotal) {
        purchaseTotal.textContent = formattedTotal;
      }
      updateCashReconciliation();
    }

    function updatePurchasePaymentSection() {
      const paymentType = purchasePaymentTypeInput.value;

      purchaseDueDateField.classList.toggle('field-hidden', paymentType !== 'credito');
      if (paymentType === 'contado') {
        const selectedMethod = cashMethodInput.value || 'sin método';
        openCajaButton.classList.remove('field-hidden');
        purchasePaymentSummary.textContent = `Contado activo: ${selectedMethod}. Abre CAJA para cuadre de salida.`;
      } else {
        openCajaButton.classList.add('field-hidden');
        purchaseCajaFloat.classList.add('field-hidden');
        purchasePaymentSummary.textContent = 'Compra a crédito: define fecha de vencimiento.';
      }
      updateCashReferenceVisibility();
      updateCashReconciliation();
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
      const row = document.createElement('div');
      row.className = 'purchase-row sale-line-row sale-extra-line-row';
      row.dataset.parentLineId = parentLineId;
      row.dataset.lineId = createSaleLineId();
      row.innerHTML = `
        <div class="field">
          <div class="sale-extra-source-wrap">
            <select class="sale-extra-source" required>
              ${buildSaleExtraSelectOptions(addon.nombre || '')}
            </select>
          </div>
        </div>
        <div class="field">
          <input type="number" class="sale-quantity" min="1" step="1" placeholder="Cant." value="${addon.cantidad !== undefined ? escapeHtml(addon.cantidad) : ''}" required />
        </div>
        <div class="field">
          <input type="number" class="sale-price" min="0" step="0.01" placeholder="Precio" value="${addon.precio !== undefined ? escapeHtml(addon.precio) : ''}" required />
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

      sourceInput.addEventListener('change', () => {
        syncExtraCatalogSelection();
      });
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
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Completa nombre, cantidad y precio del extra antes de guardarlo.';
            return;
          }
          saleStatus.className = 'status';
          saleStatus.textContent = 'Extra, salsa o aderezo listo en la hoja de venta.';
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
            <button type="button" class="secondary-btn action-icon-btn toggle-sale-flavor-editor field-hidden" title="Abrir personalización" aria-label="Abrir personalización">⚙</button>
            <button type="button" class="delete-product action-icon-btn remove-sale-line" title="Eliminar fila" aria-label="Eliminar fila">🗑</button>
          </div>
        </div>
        <div class="field sale-flavor-field field-hidden">
          <div class="sale-flavor-editor field-hidden">
            <div class="sale-flavor-editor-header">
              <div class="sale-flavor-editor-title">
                <strong>Personalización del producto</strong>
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
                <span>Agrega salsas o aderezos desde este cuadro de personalización</span>
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
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Completa producto, cantidad y precio antes de guardar la fila.';
            return;
          }
          if (addonState.hasInvalid) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Cada topping incluido, salsa, aderezo o extra debe tener nombre, cantidad y precio válidos cuando corresponda.';
            return;
          }
          if (productUsesFlavors(producto) && !selectedFlavors.length) {
            saleStatus.className = 'status error';
            saleStatus.textContent = 'Selecciona al menos un sabor para los productos vendidos por pelotitas.';
            return;
          }
          if (productUsesFlavors(producto) && assignedScoops !== expectedScoops) {
            saleStatus.className = 'status error';
            saleStatus.textContent = `Debes distribuir exactamente ${expectedScoops} pelotas entre los sabores.`;
            return;
          }
          saleStatus.className = 'status';
          saleStatus.textContent = 'Producto listo en la tabla de venta.';
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
        const selectedMethod = saleCashMethodInput.value || 'sin método';
        openSaleCajaButton.classList.remove('field-hidden');
        salePaymentSummary.textContent = `Contado activo: ${selectedMethod}. Abre CAJA para cuadre.`;
      } else {
        openSaleCajaButton.classList.add('field-hidden');
        saleCajaFloat.classList.add('field-hidden');
        salePaymentSummary.textContent = 'Venta a crédito: define fecha de vencimiento.';
      }
      updateSaleReferenceVisibility();
      updateSaleCashReconciliation();
    }

    function getCostStateLabel(state) {
      return String(state || '').toLowerCase() === 'final' ? 'Final' : String(state || '').toLowerCase() === 'provisional' ? 'Provisional' : 'Sin costo';
    }

    function getSaleItemTrackedCostSummary(item) {
      const flavors = Array.isArray(item?.sabores) ? item.sabores : [];
      const addons = Array.isArray(item?.adicionales) ? item.adicionales : [];
      const trackedEntries = [
        ...flavors.map(flavor => ({
          provisional: Number(flavor.costoTotalProvisional || 0),
          final: Number(flavor.costoTotalFinal || 0),
          state: String(flavor.costoEstado || '')
        })),
        ...addons.map(addon => ({
          provisional: Number(addon.costoTotalProvisional || 0),
          final: Number(addon.costoTotalFinal || 0),
          state: String(addon.costoEstado || '')
        }))
      ].filter(entry => entry.state || entry.provisional > 0 || entry.final > 0);

      if (!trackedEntries.length) {
        return {
          hasTrackedCost: false,
          totalCost: 0,
          utility: null,
          state: 'none'
        };
      }

      const allFinal = trackedEntries.every(entry => entry.state === 'final');
      const totalCost = trackedEntries.reduce((sum, entry) => sum + (allFinal ? entry.final : (entry.final > 0 ? entry.final : entry.provisional)), 0);
      const totalSale = Number(item?.precio || 0) * Number(item?.cantidad || 0) + calculateSaleAddonsTotal(item?.adicionales);

      return {
        hasTrackedCost: true,
        totalCost,
        utility: totalSale - totalCost,
        state: allFinal ? 'final' : 'provisional'
      };
    }

    function formatTrackedCostValue(value, { empty = '-' } = {}) {
      return value === null || value === undefined ? empty : formatCurrency(value);
    }

    function buildControlCostStatusChip(state) {
      const normalized = String(state || '').toLowerCase();
      const chipClass = normalized === 'final' ? 'success' : normalized === 'provisional' ? 'pending' : 'overdue';
      return `<span class="status-chip ${chipClass}">${escapeHtml(getCostStateLabel(normalized))}</span>`;
    }

    function buildControlCloseFields(control, controlKind) {
      const safeId = escapeHtml(String(control?.id || ''));
      const soldPortions = Number(control?.porcionesVendidas || 0);
      return `
        <div class="table-inline-fields" data-control-close-kind="${escapeHtml(controlKind)}" data-control-id="${safeId}">
          <button type="button" class="secondary-btn" data-control-close-submit="${safeId}" data-control-close-yield="${escapeHtml(String(soldPortions || 0))}">Cerrar</button>
        </div>
      `;
    }

    function formatSalePersonalization(item) {
      const flavorSummary = Array.isArray(item?.sabores) && item.sabores.length
        ? item.sabores.map(flavor => `${flavor.nombre} (${Number(flavor.porciones || 0)})`).join(', ')
        : '';
      const addonSummary = Array.isArray(item?.adicionales) && item.adicionales.length
        ? item.adicionales.map(addon => `${formatSaleAddonTypeLabel(addon.tipo, addon)}: ${addon.nombre} x${Number(addon.cantidad || 0)}${Number(addon.precio || 0) > 0 ? ` (${formatCurrency(Number(addon.cantidad || 0) * Number(addon.precio || 0))})` : ''}`).join(', ')
        : '';

      if (flavorSummary && addonSummary) {
        return `${flavorSummary} | ${addonSummary}`;
      }
      return flavorSummary || addonSummary || 'Sin personalización';
    }

    function formatInvoicePaymentType(type) {
      return String(type || '').toLowerCase() === 'credito' ? 'Crédito' : 'Contado';
    }

    function formatInvoicePaymentMethod(method) {
      const normalized = String(method || '').trim().toLowerCase();
      if (!normalized) return '-';
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function setLastRegisteredSaleForPrint(venta) {
      lastRegisteredSale = venta || null;
      if (!salePrintActions || !salePrintSummary) {
        return;
      }
      if (!venta) {
        salePrintActions.classList.add('field-hidden');
        salePrintSummary.textContent = 'Factura lista para impresión.';
        return;
      }
      salePrintActions.classList.remove('field-hidden');
      salePrintSummary.textContent = `Factura ${venta.documento || 'registrada'} lista para impresión.`;
    }

    function buildPrintablePurchaseItemsMarkup(compra) {
      if (!Array.isArray(compra?.items) || !compra.items.length) {
        return '<tr><td colspan="3" style="padding: 10px; text-align: center; color: #64748b;">No hay productos en esta compra.</td></tr>';
      }

      return compra.items.map((item, index) => {
        const quantity = Number(item.cantidad || 0);
        const lineTotal = quantity * Number(item.costo || 0);
        const linkedLabel = item.flavorName || item.toppingName || item.sauceName || '';
        const compactDetail = linkedLabel
          ? `<span class="detail-note">${escapeHtml(linkedLabel)}</span>`
          : '';

        return `
          <tr>
            <td>
              <strong>${escapeHtml(String(quantity))} x ${escapeHtml(item.nombre || 'Producto')}</strong>
              ${compactDetail}
            </td>
            <td class="text-right">${escapeHtml(formatCurrency(lineTotal))}</td>
            <td class="text-right">${String(index + 1).padStart(2, '0')}</td>
          </tr>
        `;
      }).join('');
    }

    function printPurchaseInvoice(compra) {
      if (!compra) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'No se encontró la compra seleccionada.';
        return;
      }

      const printWindow = window.open('', '_blank', 'width=980,height=760');
      if (!printWindow) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'El navegador bloqueó la ventana de vista previa. Permite ventanas emergentes e inténtalo de nuevo.';
        return;
      }

      const totalAmount = calculateInvoiceTotal(compra);
      const paymentTypeLabel = getPurchasePaymentTypeLabel(compra);
      const paymentMethodLabel = formatInvoicePaymentMethod(compra.paymentMethod);
      const paidAtLabel = compra.paidAt ? formatDate(compra.paidAt) : 'Pendiente';
      const dueDateLabel = compra.dueDate ? formatDate(compra.dueDate) : 'No aplica';
      const referenceLabel = compra.paymentReference ? escapeHtml(compra.paymentReference) : 'Sin referencia';
      const compactPaymentDetail = [`${paymentTypeLabel} · ${paymentMethodLabel}`];
      if (String(compra.paymentType || '').toLowerCase() === 'credito' && compra.dueDate) {
        compactPaymentDetail.push(`Vence ${dueDateLabel}`);
      }
      if (compra.paymentReference) {
        compactPaymentDetail.push(`Ref. ${referenceLabel}`);
      }

      const html = `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Compra ${escapeHtml(compra.documento || 'documento')}</title>
            <style>
              * { box-sizing: border-box; }
              body {
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                color: #111827;
                background: #ffffff;
              }
              .preview-actions {
                position: sticky;
                top: 0;
                z-index: 10;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px 16px;
                border-bottom: 1px solid #d1d5db;
                background: #f9fafb;
              }
              .preview-btn {
                border: 1px solid #9ca3af;
                background: #ffffff;
                color: #111827;
                border-radius: 8px;
                padding: 8px 12px;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
              }
              .preview-hint {
                margin-right: auto;
                align-self: center;
                color: #4b5563;
                font-size: 12px;
              }
              .sheet {
                max-width: 860px;
                margin: 0 auto;
                padding: 24px;
              }
              .header {
                display: flex;
                justify-content: space-between;
                gap: 24px;
                padding-bottom: 14px;
                border-bottom: 1px solid #111827;
              }
              .company h1,
              .invoice-box h2 {
                margin: 0 0 6px;
              }
              .company p,
              .invoice-box p,
              .meta p,
              .footer p {
                margin: 4px 0;
                line-height: 1.45;
              }
              .meta {
                margin: 18px 0;
                padding: 12px 0;
                border-bottom: 1px dashed #9ca3af;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
              }
              th, td {
                border-bottom: 1px solid #d1d5db;
                padding: 8px 6px;
                vertical-align: top;
              }
              th {
                text-align: left;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                background: #f9fafb;
              }
              .text-right { text-align: right; }
              .detail-note {
                display: block;
                margin-top: 2px;
                color: #4b5563;
                font-size: 12px;
              }
              .summary {
                margin-top: 16px;
                padding-top: 10px;
                border-top: 1px solid #111827;
              }
              .summary td {
                border: none;
                padding: 4px 2px;
              }
              .summary .grand-total td {
                font-weight: 700;
                font-size: 18px;
              }
              .footer {
                margin-top: 18px;
                padding-top: 12px;
                border-top: 1px dashed #9ca3af;
                color: #4b5563;
                text-align: center;
              }
              @media print {
                .preview-actions { display: none; }
                .sheet { max-width: none; padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="preview-actions">
              <span class="preview-hint">Detalle completo de la compra para revisar, imprimir o guardar en PDF.</span>
              <button type="button" class="preview-btn" onclick="window.print()">Imprimir</button>
              <button type="button" class="preview-btn" onclick="window.print()">Guardar PDF</button>
              <button type="button" class="preview-btn" onclick="window.close()">Cerrar</button>
            </div>
            <main class="sheet">
              <section class="header">
                <div class="company">
                  <h1>Heladería MESA</h1>
                  <p>Detalle de compra</p>
                </div>
                <div class="invoice-box">
                  <h2>${escapeHtml(compra.documento || 'Compra')}</h2>
                  <p>${escapeHtml(formatDate(compra.fecha))}</p>
                </div>
              </section>

              <section class="meta">
                <p><strong>Proveedor:</strong> ${escapeHtml(compra.proveedor || 'Sin proveedor')}</p>
                <p><strong>Pago:</strong> ${escapeHtml(compactPaymentDetail.join(' · '))}</p>
                <p><strong>Fecha de pago:</strong> ${escapeHtml(paidAtLabel)}</p>
              </section>

              <section>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style="width: 18%;" class="text-right">Costo</th>
                      <th style="width: 18%;" class="text-right">Total</th>
                      <th style="width: 12%;" class="text-right">#</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${Array.isArray(compra.items) && compra.items.length ? compra.items.map((item, index) => {
                      const quantity = Number(item.cantidad || 0);
                      const lineTotal = quantity * Number(item.costo || 0);
                      const linkedLabel = item.flavorName || item.toppingName || item.sauceName || '';
                      return `
                        <tr>
                          <td>
                            <strong>${escapeHtml(String(quantity))} x ${escapeHtml(item.nombre || 'Producto')}</strong>
                            ${linkedLabel ? `<span class="detail-note">${escapeHtml(linkedLabel)}</span>` : ''}
                          </td>
                          <td class="text-right">${escapeHtml(formatCurrency(item.costo || 0))}</td>
                          <td class="text-right">${escapeHtml(formatCurrency(lineTotal))}</td>
                          <td class="text-right">${String(index + 1).padStart(2, '0')}</td>
                        </tr>
                      `;
                    }).join('') : '<tr><td colspan="4" style="padding: 10px; text-align: center; color: #64748b;">No hay productos en esta compra.</td></tr>'}
                  </tbody>
                </table>
              </section>

              <section class="summary">
                <table>
                  <tbody>
                    <tr>
                      <td>Items</td>
                      <td class="text-right">${escapeHtml(String(Array.isArray(compra.items) ? compra.items.length : 0))}</td>
                    </tr>
                    <tr class="grand-total">
                      <td>Total</td>
                      <td class="text-right">${escapeHtml(formatCurrency(totalAmount))}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <footer class="footer">
                <p>Documento de compra</p>
              </footer>
            </main>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    }

    function buildPrintableSaleItemsMarkup(venta) {
      if (!Array.isArray(venta?.items) || !venta.items.length) {
        return '<tr><td colspan="3" style="padding: 10px; text-align: center; color: #64748b;">No hay productos en esta factura.</td></tr>';
      }

      return venta.items.map((item, index) => {
        const quantity = Number(item.cantidad || 0);
        const addonsTotal = calculateSaleAddonsTotal(item.adicionales);
        const lineTotal = quantity * Number(item.precio || 0) + addonsTotal;
        const personalization = formatSalePersonalization(item);
        const compactPersonalization = personalization && personalization !== 'Sin personalización'
          ? `<span class="detail-note">${escapeHtml(personalization)}</span>`
          : '';

        return `
          <tr>
            <td>
              <strong>${escapeHtml(String(quantity))} x ${escapeHtml(item.nombre || 'Producto')}</strong>
              ${compactPersonalization}
            </td>
            <td class="text-right">${escapeHtml(formatCurrency(lineTotal))}</td>
            <td class="text-right">${String(index + 1).padStart(2, '0')}</td>
          </tr>
        `;
      }).join('');
    }

    function printSaleInvoice(venta = lastRegisteredSale, options = {}) {
      if (!venta) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'No hay una factura registrada lista para imprimir.';
        return;
      }

      const { autoPrint = false } = options;

      const printWindow = window.open('', '_blank', 'width=980,height=760');
      if (!printWindow) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.';
        return;
      }

      const totalAmount = calculateSaleInvoiceTotal(venta);
      const paymentTypeLabel = formatInvoicePaymentType(venta.paymentType);
      const paymentMethodLabel = formatInvoicePaymentMethod(venta.paymentMethod);
      const dueDateLabel = venta.dueDate ? formatDate(venta.dueDate) : 'No aplica';
      const referenceLabel = venta.paymentReference ? escapeHtml(venta.paymentReference) : 'Sin referencia';
      const compactPaymentDetail = [`${paymentTypeLabel} · ${paymentMethodLabel}`];
      if (venta.paymentType === 'credito' && venta.dueDate) {
        compactPaymentDetail.push(`Vence ${dueDateLabel}`);
      }
      if (venta.paymentReference) {
        compactPaymentDetail.push(`Ref. ${referenceLabel}`);
      }
      const html = `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Factura ${escapeHtml(venta.documento || 'venta')}</title>
            <style>
              * { box-sizing: border-box; }
              @page {
                size: 3.5in 5in;
                margin: 0.14in;
              }
              body {
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 10px;
                color: #111827;
                background: #ffffff;
              }
              .preview-actions {
                position: sticky;
                top: 0;
                z-index: 10;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px 16px;
                border-bottom: 1px solid #d1d5db;
                background: #f9fafb;
              }
              .preview-btn {
                border: 1px solid #9ca3af;
                background: #ffffff;
                color: #111827;
                border-radius: 8px;
                padding: 8px 12px;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
              }
              .preview-hint {
                margin-right: auto;
                align-self: center;
                color: #4b5563;
                font-size: 12px;
              }
              .sheet {
                width: 3.22in;
                min-height: 4.72in;
                margin: 0 auto;
                padding: 0.04in 0;
              }
              .header {
                display: block;
                text-align: center;
                padding-bottom: 8px;
                border-bottom: 1px solid #111827;
              }
              .company h1 {
                margin: 0 0 4px;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 0.02em;
              }
              .company p,
              .invoice-box p,
              .footer p {
                margin: 1px 0;
                line-height: 1.45;
              }
              .invoice-box {
                margin-top: 6px;
                text-align: center;
              }
              .invoice-box h2 {
                margin: 0 0 4px;
                font-size: 14px;
                font-weight: 700;
              }
              .meta {
                margin: 10px 0;
                padding: 8px 0;
                border-bottom: 1px dashed #9ca3af;
              }
              .meta p {
                margin: 2px 0;
                line-height: 1.35;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 6px;
              }
              th,
              td {
                border-bottom: 1px solid #d1d5db;
                padding: 6px 4px;
                vertical-align: top;
              }
              th {
                background: #ffffff;
                text-align: left;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
              }
              .text-right {
                text-align: right;
              }
              .detail-note {
                display: block;
                margin-top: 2px;
                color: #4b5563;
                font-size: 9px;
                line-height: 1.4;
              }
              .summary {
                margin-top: 10px;
                padding-top: 6px;
                border-top: 1px solid #111827;
              }
              .summary table {
                margin-top: 0;
              }
              .summary td {
                padding: 4px 2px;
                border: none;
              }
              .summary .grand-total td {
                font-weight: 700;
                font-size: 13px;
              }
              .footer {
                margin-top: 10px;
                padding-top: 8px;
                border-top: 1px dashed #9ca3af;
                text-align: center;
                color: #4b5563;
              }
              @media print {
                .preview-actions {
                  display: none;
                }
                body {
                  background: #ffffff;
                }
                .sheet {
                  width: auto;
                  min-height: auto;
                }
              }
            </style>
          </head>
          <body>
            <div class="preview-actions">
              <span class="preview-hint">Formato 3.5 x 5 pulg. para imprimir o guardar como PDF.</span>
              <button type="button" class="preview-btn" onclick="window.print()">Imprimir</button>
              <button type="button" class="preview-btn" onclick="window.print()">Guardar PDF</button>
              <button type="button" class="preview-btn" onclick="window.close()">Cerrar</button>
            </div>
            <main class="sheet">
              <section class="header">
                <div class="company">
                  <h1>Heladería MESA</h1>
                  <p>Comprobante de venta</p>
                </div>
                <div class="invoice-box">
                  <h2>${escapeHtml(venta.documento || 'Factura')}</h2>
                  <p>${escapeHtml(formatDate(venta.fecha))}</p>
                </div>
              </section>

              <section class="meta">
                <p><strong>Cliente:</strong> ${escapeHtml(venta.cliente || 'Cliente general')}</p>
                <p><strong>Pago:</strong> ${escapeHtml(compactPaymentDetail.join(' · '))}</p>
              </section>

              <section>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style="width: 28%;" class="text-right">Total</th>
                      <th style="width: 12%;" class="text-right">#</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildPrintableSaleItemsMarkup(venta)}
                  </tbody>
                </table>
              </section>

              <section class="summary">
                <table>
                  <tbody>
                    <tr>
                      <td>Items</td>
                      <td class="text-right">${escapeHtml(String(Array.isArray(venta.items) ? venta.items.length : 0))}</td>
                    </tr>
                    <tr class="grand-total">
                      <td>Total</td>
                      <td class="text-right">${escapeHtml(formatCurrency(totalAmount))}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <footer class="footer">
                <p>Gracias por su compra</p>
              </footer>
            </main>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      if (autoPrint) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }

    function exportInventorySummaryPdf() {
      const rows = buildInventorySummaryRows();
      const headers = ['Producto', 'Tipo', 'Entradas', 'Salidas', 'Saldo', 'Costo unitario PEPS', 'Valor inventario PEPS'];
      const body = rows.map(row => headers.map(header => row[header] ?? ''));
      const dateStamp = getExportDateStamp();
      exportRowsToPdf('Resumen de inventario', headers, body, `inventario-resumen-${dateStamp}.pdf`);
    }

    function exportInventorySummaryExcel() {
      const rows = buildInventorySummaryRows();
      const dateStamp = getExportDateStamp();
      exportRowsToExcel(rows, `inventario-resumen-${dateStamp}.xlsx`, 'Inventario Resumen');
    }

    function exportInventoryKardexExcel() {
      const rows = buildInventoryKardexRows();
      const dateStamp = getExportDateStamp();
      exportRowsToExcel(rows, `inventario-kardex-${dateStamp}.xlsx`, 'Inventario Kardex');
    }

    function exportInventoryKardexPdf() {
      const rows = buildInventoryKardexRows();
      const headers = ['Fecha', 'Producto', 'Tipo', 'Movimiento', 'Documento', 'Detalle', 'Entrada', 'Salida', 'Saldo', 'Costo unitario', 'Costo movimiento', 'Valor saldo'];
      const body = rows.map(row => headers.map(header => row[header] ?? ''));
      const dateStamp = getExportDateStamp();
      exportRowsToPdf('Kardex de inventario', headers, body, `inventario-kardex-${dateStamp}.pdf`);
    }

    function getPaymentCategoryById(categoryId) {
      return state.paymentCategories.find(item => String(item.id) === String(categoryId)) || null;
    }

    function legacyGetPaymentCategoryName(payment) {
      return payment?.categoriaNombre || getPaymentCategoryById(payment?.categoriaId)?.nombre || 'Sin clasificación';
    }

    function getPaymentCategoryDescription(payment) {
      return getPaymentCategoryById(payment?.categoriaId)?.descripcion || '';
    }

    function legacyIsExpensePayment(payment) {
      return String(getPaymentCategoryDescription(payment) || '').trim().toLowerCase() === 'gasto';
    }

    function getEffectivePaymentOutflowDate(payment) {
      const method = String(payment?.paymentMethod || '').trim().toLowerCase();
      if (method === 'tarjeta-credito') {
        return payment?.reimbursedAt ? new Date(payment.reimbursedAt) : null;
      }
      return payment?.fecha ? new Date(payment.fecha) : null;
    }

    function getFundAccountLabel(account) {
      return String(account || '').trim().toLowerCase() === 'efectivo' ? 'Efectivo' : 'Bancos';
    }

    function getDefaultFundSettings() {
      return {
        openingCashBalance: 0,
        openingBankBalance: 0,
        minimumCashReserve: 0
      };
    }

    function legacyGetNormalizedFundSettings() {
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

    function getFundAccountFromPaymentMethod(method) {
      const normalizedMethod = String(method || '').trim().toLowerCase();
      if (normalizedMethod === 'efectivo') {
        return 'efectivo';
      }
      if (['transferencia', 'tarjeta', 'tarjeta-credito'].includes(normalizedMethod)) {
        return 'banco';
      }
      return '';
    }

    function legacyGetFundMovementModuleLabel(moduleName) {
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
          return 'Configuración';
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
        return 'Tarjeta de crédito';
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

    function legacyBuildFundMovements() {
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
        getNormalizedRecordPaymentHistory(sale, getSaleTotalAmount(sale)).forEach((payment, index) => {
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
        getNormalizedRecordPaymentHistory(purchase, getPurchaseTotalAmount(purchase)).forEach((payment, index) => {
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

    function renderFundAccountTable(container, account, movements) {
      if (!container) {
        return;
      }
      const accountMovements = movements.filter(movement => String(movement.account || '') === String(account)).slice().reverse();
      if (!accountMovements.length) {
        container.innerHTML = `<p class="history-empty">Aún no hay movimientos en ${escapeHtml(getFundAccountLabel(account).toLowerCase())}.</p>`;
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
              <th>Método</th>
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

    function legacyRenderFundsModule() {
      const settings = getNormalizedFundSettings();
      const fundMovements = buildFundMovements();
      const cashBalance = fundMovements.filter(movement => movement.account === 'efectivo').reduce((last, movement) => movement.runningBalance, 0);
      const bankBalance = fundMovements.filter(movement => movement.account === 'banco').reduce((last, movement) => movement.runningBalance, 0);
      const cashAvailable = Math.max(cashBalance - settings.minimumCashReserve, 0);
      const cashDeficit = Math.max(settings.minimumCashReserve - cashBalance, 0);
      if (fundCashBalance) {
        fundCashBalance.textContent = formatCurrency(cashBalance);
      }
      if (fundCashMinimum) {
        fundCashMinimum.textContent = formatCurrency(settings.minimumCashReserve);
      }
      if (fundCashAvailable) {
        fundCashAvailable.textContent = formatCurrency(cashAvailable);
      }
      if (fundBankBalance) {
        fundBankBalance.textContent = formatCurrency(bankBalance);
      }
      if (fundCashReserveNote) {
        fundCashReserveNote.textContent = cashDeficit > 0
          ? `La caja está ${formatCurrency(cashDeficit)} por debajo del fondo mínimo configurado.`
          : `Puedes mover ${formatCurrency(cashAvailable)} de efectivo sin tocar el fondo mínimo de caja.`;
      }
      syncFundSettingsForm();
      renderFundAccountTable(fundCashRecords, 'efectivo', fundMovements);
      renderFundAccountTable(fundBankRecords, 'banco', fundMovements);
      renderExternalDebtsPanel();
    }

    function legacySetExternalDebtStatus(message, options = {}) {
      if (!externalDebtStatus) {
        return;
      }
      externalDebtStatus.className = options.error ? 'status error' : 'status';
      externalDebtStatus.textContent = message;
    }

    function legacySetExternalDebtPaymentStatus(message, options = {}) {
      if (!externalDebtPaymentStatus) {
        return;
      }
      externalDebtPaymentStatus.className = options.error ? 'status error' : 'status';
      externalDebtPaymentStatus.textContent = message;
    }

    function legacyOpenExternalDebtPaymentModalPanel(debtId) {
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
      renderAccountStatementTable(externalDebtPaymentHistory, debt, originalAmount, 'Aún no hay abonos registrados para esta deuda externa.', {
        renderActions: entry => `
          <div class="purchase-row-actions">
            <button type="button" class="secondary-btn action-icon-btn" data-external-debt-payment-entry-edit="${escapeHtml(entry.id)}" title="Editar abono">✎</button>
            <button type="button" class="secondary-btn action-icon-btn" data-external-debt-payment-entry-print="${escapeHtml(entry.id)}" title="Imprimir recibo">🧾</button>
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
      setExternalDebtPaymentStatus(isViewOnly ? 'La deuda ya está saldada. Aquí puedes consultar su estado de cuenta.' : 'Confirma el monto, la cuenta y la fecha del abono.');
      externalDebtPaymentModal.classList.remove('field-hidden');
      externalDebtPaymentModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function legacyCloseExternalDebtPaymentModalPanel() {
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
              <th>Acción</th>
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
                      <button type="button" class="secondary-btn action-icon-btn" data-external-debt-edit="${escapeHtml(String(debt.id || ''))}" title="Editar registro">✎</button>
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
          return 'Tarjeta de crédito';
        default:
          return String(method || 'N/A') || 'N/A';
      }
    }

    function legacyIsPendingCardPayment(payment) {
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

    function legacyUpdatePaymentMethodSection() {
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
            : 'Las salidas en efectivo se registran como pago inmediato y generan un número automático de recibo.';
      }
    }

    function legacyRenderPaymentCategoryOptions() {
      const categoryOptions = state.paymentCategories.slice().sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
      if (paymentCategoryInput) {
        const currentValue = paymentCategoryInput.value;
        paymentCategoryInput.innerHTML = categoryOptions.length
          ? `<option value="">Selecciona una clasificación</option>${categoryOptions.map(category => `<option value="${escapeHtml(String(category.id))}">${escapeHtml(category.nombre)}</option>`).join('')}`
          : '<option value="">Crea primero una clasificación</option>';
        paymentCategoryInput.value = categoryOptions.some(category => String(category.id) === String(currentValue)) ? currentValue : '';
      }

      if (paymentFilterCategoryInput) {
        const currentFilter = paymentFilterCategoryInput.value;
        paymentFilterCategoryInput.innerHTML = `<option value="all">Todas</option>${categoryOptions.map(category => `<option value="${escapeHtml(String(category.id))}">${escapeHtml(category.nombre)}</option>`).join('')}`;
        paymentFilterCategoryInput.value = categoryOptions.some(category => String(category.id) === String(currentFilter)) ? currentFilter : 'all';
      }
    }

    function legacyRenderPaymentInfo() {
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
        : 'Aún no hay pagos registrados.';
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

    function legacyRenderPaymentRegistro() {
      if (!paymentRecords) {
        return;
      }
      const filteredPayments = getFilteredPayments();
      if (!filteredPayments.length) {
        paymentRecords.innerHTML = '<p class="history-empty">No hay pagos registrados según los filtros actuales.</p>';
        return;
      }

      paymentRecords.innerHTML = `
        <h4>Historial de pagos</h4>
        <table class="history-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Beneficiario</th>
              <th>Clasificación</th>
              <th>Método</th>
              <th>Estado</th>
              <th>Monto</th>
              <th>Referencia</th>
              <th>Acción</th>
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
                <td><button type="button" class="secondary-btn action-icon-btn" data-payment-edit="${escapeHtml(String(payment.id || ''))}" title="Editar pago">✎</button></td>
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

    function legacyRenderPendingPayments() {
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
              <th>Descripción</th>
              <th>Beneficiario</th>
              <th>Clasificación</th>
              <th>Monto</th>
              <th>Referencia tarjeta</th>
            </tr>
          </thead>
          <tbody>
            ${pendingPayments.map(payment => `
              <tr>
                <td><input type="checkbox" data-payment-pending-select="${escapeHtml(String(payment.id))}" ${selectedPendingPaymentIds.includes(String(payment.id)) ? 'checked' : ''} aria-label="Seleccionar pago ${escapeHtml(payment.descripcion || '')}" /></td>
                <td>${formatDate(payment.fecha)}</td>
                <td>
                  <strong>${escapeHtml(payment.descripcion || '')}</strong>
                </td>
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

    function legacyResetPaymentCategoryForm() {
      editingPaymentCategoryId = null;
      if (paymentCategoryForm) {
        paymentCategoryForm.reset();
      }
      if (paymentCategorySubmitButton) {
        paymentCategorySubmitButton.textContent = 'Guardar clasificación';
      }
      if (cancelPaymentCategoryEditButton) {
        cancelPaymentCategoryEditButton.style.display = 'none';
      }
    }

    function legacyRenderPaymentCategoryList() {
      if (!paymentCategoryList) {
        return;
      }
      const categories = state.paymentCategories.slice().sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
      if (!categories.length) {
        paymentCategoryList.innerHTML = '<p class="history-empty">Aún no hay clasificaciones para pagos.</p>';
        return;
      }

      paymentCategoryList.innerHTML = `
        <h4>Clasificaciones disponibles</h4>
        <table class="history-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
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
                  <td>${escapeHtml(category.descripcion || 'Sin descripción')}</td>
                  <td>${usageCount}</td>
                  <td>
                    <div class="purchase-row-actions">
                      <button type="button" class="secondary-btn action-icon-btn" data-payment-category-edit="${escapeHtml(String(category.id))}" title="Editar clasificación">✎</button>
                      <button type="button" class="delete-product action-icon-btn" data-payment-category-delete="${escapeHtml(String(category.id))}" title="Eliminar clasificación">🗑</button>
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
          paymentCategorySubmitButton.textContent = 'Actualizar clasificación';
          cancelPaymentCategoryEditButton.style.display = 'inline-flex';
          paymentCategoryStatus.textContent = `Editando clasificación: ${category.nombre}.`;
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
              throw new Error(await buildApiError(response, 'No se pudo eliminar la clasificación.'));
            }
            await fetchPaymentCategories();
            paymentCategoryStatus.textContent = 'Clasificación eliminada correctamente.';
          } catch (error) {
            console.error(error);
            paymentCategoryStatus.textContent = error.message;
          }
        });
      });
    }

    function legacyOpenPaymentReimbursementModalPanel() {
      const selectedPayments = state.payments.filter(payment => selectedPendingPaymentIds.includes(String(payment.id)) && isPendingCardPayment(payment));
      if (!selectedPayments.length) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'Selecciona al menos un pago pendiente antes de registrar la transferencia.';
        return;
      }
      paymentReimbursementForm.reset();
      paymentReimbursementDateInput.value = getTodayInputValue();
      const total = selectedPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
      paymentReimbursementSelectionSummary.textContent = `${selectedPayments.length} pago(s) seleccionados · total ${formatCurrency(total)}. Esta transferencia se aplicará a todos.`;
      paymentReimbursementStatus.textContent = 'Confirma la transferencia que cerró los pagos seleccionados.';
      paymentReimbursementModal.classList.remove('field-hidden');
      paymentReimbursementModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function legacyClosePaymentReimbursementModalPanel() {
      paymentReimbursementForm.reset();
      paymentReimbursementSelectionSummary.textContent = 'Selecciona uno o varios pagos pendientes para registrar una sola transferencia.';
      paymentReimbursementModal.classList.add('field-hidden');
      paymentReimbursementModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }

    async function fetchPaymentCategories() {
      try {
        const response = await fetch(buildApiUrl('/pagos-categorias'), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('No se pudieron cargar las clasificaciones de pagos.');
        }
        const categories = await response.json();
        state.paymentCategories = Array.isArray(categories) ? categories : [];
      } catch (error) {
        console.error(error);
        state.paymentCategories = [];
      } finally {
        renderPaymentCategoryOptions();
        renderPaymentCategoryList();
      }
    }

    async function fetchPayments() {
      try {
        const response = await fetch(buildApiUrl('/pagos'), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('No se pudieron cargar los pagos.');
        }
        const payments = await response.json();
        state.payments = Array.isArray(payments) ? payments : [];
      } catch (error) {
        console.error(error);
        state.payments = [];
      } finally {
        renderPaymentInfo();
        renderPaymentRegistro();
        renderPendingPayments();
        renderFundsModule();
        renderDashboard();
      }
    }

    async function fetchFundTransfers() {
      try {
        const response = await fetch(buildApiUrl('/efectivo/traslados'), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('No se pudieron cargar los traslados de fondos.');
        }
        const transfers = await response.json();
        state.fundTransfers = Array.isArray(transfers) ? transfers : [];
      } catch (error) {
        console.error(error);
        state.fundTransfers = [];
      } finally {
        renderFundsModule();
      }
    }

    async function fetchFundSettings() {
      try {
        const response = await fetch(buildApiUrl('/efectivo/configuracion'), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('No se pudo cargar la configuración de efectivo y bancos.');
        }
        const settings = await response.json();
        state.fundSettings = settings && typeof settings === 'object' ? settings : getDefaultFundSettings();
      } catch (error) {
        console.error(error);
        state.fundSettings = getDefaultFundSettings();
      } finally {
        renderFundsModule();
      }
    }

    async function fetchExternalDebts() {
      try {
        const response = await fetch(buildApiUrl('/deudas-externas'), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('No se pudieron cargar las deudas externas.');
        }
        const debts = await response.json();
        state.externalDebts = Array.isArray(debts) ? debts : [];
      } catch (error) {
        console.error(error);
        state.externalDebts = [];
      } finally {
        renderFundsModule();
        renderDashboard();
      }
    }

    async function fetchVentas() {
      try {
        const response = await fetch(buildApiUrl('/ventas'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar las ventas.');
        state.sales = await response.json();
        updateNextSaleDocumentNumber();
      } catch (error) {
        console.error(error);
        state.sales = [];
        updateNextSaleDocumentNumber();
      } finally {
        renderFundsModule();
        renderDashboard();
      }
    }

    async function fetchCompras() {
      try {
        const response = await fetch(buildApiUrl('/compras'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar las compras.');
        state.purchases = await response.json();
      } catch (error) {
        console.error(error);
        state.purchases = [];
      } finally {
        renderPurchaseHistory();
        renderPurchaseRegistro();
        renderPurchasePayables();
        renderFundsModule();
        renderDashboard();
      }
    }

    async function deleteProduct(productId) {
      try {
        const response = await fetch(buildApiUrl(`/productos/${encodeURIComponent(productId)}`), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el producto.');
        setProductStatus(result.message || 'Producto eliminado correctamente.');
        await fetchProductos();
      } catch (error) {
        setProductStatus(error.message, { error: true });
        console.error(error);
      }
    }

    function renderRecipeDetail(producto) {
      if (productUsesRecipe(producto)) {
        const ingredientes = Array.isArray(producto.ingredientes) ? producto.ingredientes : [];
        const lista = ingredientes.map(ing => {
          const materia = ing.id
            ? state.productos.find(p => String(p.id) === String(ing.id))
            : state.productos.find(p => p.nombre === ing.nombre);
          const unidad = materia?.medida ? ` ${escapeHtml(materia.medida)}` : '';
          const costo = materia ? Number(materia.precio) * Number(ing.cantidad) : 0;
          return `<li>${escapeHtml(ing.nombre)}: ${Number(ing.cantidad)}${unidad}${materia ? ` — C$${costo.toFixed(2).replace('.', ',')}` : ''}</li>`;
        }).join('');
        const costoTotal = ingredientes.reduce((sum, ing) => {
          const materia = ing.id
            ? state.productos.find(p => String(p.id) === String(ing.id))
            : state.productos.find(p => p.nombre === ing.nombre);
          return sum + (materia ? Number(materia.precio) * Number(ing.cantidad) : 0);
        }, 0);
        const flavorBadge = productUsesFlavors(producto)
          ? `<div class="flavor-tag-list" style="margin-top:8px;"><span class="flavor-tag">${Number(producto.pelotasPorUnidad || 0)} porciones variables</span><span class="flavor-tag">Mixto</span></div>`
          : '';
        return `
          <details>
            <summary>Receta</summary>
            <ul>${lista || '<li>No hay ingredientes definidos.</li>'}</ul>
            <p>Costo estimado: C$${costoTotal.toFixed(2).replace('.', ',')}</p>
          </details>
          ${flavorBadge}
        `;
      }
      if (normalizeProductType(producto.tipo || producto.type) === 'materia prima') {
        return `<span>Medición: ${escapeHtml(producto.medida || 'N/A')} · Rendimiento: ${Number(producto.rendimientoPorCompra || 0)} porciones</span>`;
      }
      if (productUsesFlavors(producto)) {
        return `<div class="flavor-tag-list"><span class="flavor-tag">${Number(producto.pelotasPorUnidad || 0)} porciones variables</span><span class="flavor-tag">${getProductInventoryMode(producto) === 'mixto' ? 'Mixto' : 'Sabores'}</span></div>`;
      }
      return 'Sin receta';
    }

    function renderProductType(producto) {
      const tipo = String(producto.tipo || producto.type || '').trim();
      if (tipo) {
        return tipo;
      }
      if (Array.isArray(producto.ingredientes) && producto.ingredientes.length) {
        return 'producto terminado';
      }
      if (producto.medida) {
        return 'materia prima';
      }
      return 'N/A';
    }

    function getInventoryStockIncrement(producto, cantidadCompra) {
      const amount = Number(cantidadCompra || 0);
      const performance = Number(producto?.rendimientoPorCompra || 0);
      if (!Number.isNaN(performance) && performance > 0) {
        return amount * performance;
      }
      return amount;
    }

    function formatInventoryQuantity(value) {
      const amount = Number(value || 0);
      if (Number.isNaN(amount)) {
        return '0';
      }
      return Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2).replace('.', ',');
    }

    function getInventoryUnitCostFromPurchaseItem(producto, item) {
      const quantity = Number(item?.cantidad || 0);
      const lineUnitCost = Number(item?.costo || 0);
      const stockIncrement = getInventoryStockIncrement(producto, quantity);
      if (Number.isNaN(stockIncrement) || stockIncrement <= 0) {
        return 0;
      }
      return (lineUnitCost * quantity) / stockIncrement;
    }

    function consumeInventoryLayersPeps(layers, quantity, explicitTotalCost = null) {
      let remaining = Number(quantity || 0);
      const requestedQuantity = Number(quantity || 0);
      let totalCost = 0;
      const hasExplicitCost = explicitTotalCost !== null && explicitTotalCost !== undefined && !Number.isNaN(Number(explicitTotalCost));
      const targetTotalCost = hasExplicitCost ? Math.max(Number(explicitTotalCost), 0) : null;

      while (remaining > 0 && layers.length) {
        const currentLayer = layers[0];
        const currentQuantity = Number(currentLayer.quantity || 0);
        const currentValue = Number(currentLayer.value || 0);
        const consumable = Math.min(currentQuantity, remaining);
        const costShare = hasExplicitCost
          ? targetTotalCost * (consumable / Math.max(requestedQuantity, 1))
          : (currentQuantity > 0 ? currentValue * (consumable / currentQuantity) : 0);
        const appliedCost = Math.min(Math.max(costShare, 0), currentValue);

        totalCost += appliedCost;
        currentLayer.quantity = Math.max(currentQuantity - consumable, 0);
        currentLayer.value = Math.max(currentValue - appliedCost, 0);
        remaining -= consumable;
        if (currentLayer.quantity <= 0.0000001) {
          layers.shift();
        }
      }

      return {
        totalCost,
        remaining
      };
    }

    function movementAppliesToCutoff(movement, cutoffDate) {
      if (!cutoffDate) {
        return true;
      }
      if (!movement?.date) {
        return true;
      }
      const movementDate = new Date(movement.date);
      if (Number.isNaN(movementDate.getTime())) {
        return false;
      }
      return movementDate <= cutoffDate;
    }

    function findProductByIdOrName(productId, productName = '') {
      if (productId !== undefined && productId !== null && String(productId).trim()) {
        const product = findProductById(productId);
        if (product) {
          return product;
        }
      }
      const normalizedName = String(productName || '').trim().toLowerCase();
      if (!normalizedName) {
        return null;
      }
      return state.productos.find(producto => String(producto.nombre || '').trim().toLowerCase() === normalizedName) || null;
    }

    function buildInventoryKardexProductOptions(selectedId = '') {
      if (!state.productos.length) {
        return '<option value="">No hay productos registrados</option>';
      }
      return [`<option value="all" ${selectedId === 'all' ? 'selected' : ''}>Todos los productos</option>`, ...state.productos
        .slice()
        .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }))
        .map(producto => `<option value="${escapeHtml(producto.id)}" ${String(producto.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(producto.nombre)} — ${escapeHtml(renderInventoryModeLabel(producto))}</option>`)]
        .join('');
    }

    function buildInventoryMovementProductOptions(selectedId = '') {
      if (!state.productos.length) {
        return '<option value="">No hay productos registrados</option>';
      }
      return [`<option value="">Selecciona un producto</option>`, ...state.productos
        .slice()
        .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }))
        .map(producto => `<option value="${escapeHtml(producto.id)}" ${String(producto.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(producto.nombre)} — ${escapeHtml(renderInventoryModeLabel(producto))}</option>`)]
        .join('');
    }

    function buildInventoryTypeFilterOptions(selectedValue = 'all') {
      const types = [...new Set(state.productos
        .map(producto => String(renderInventoryModeLabel(producto) || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));

      return [`<option value="all" ${String(selectedValue) === 'all' ? 'selected' : ''}>Todos</option>`, ...types.map(type => `
        <option value="${escapeHtml(type)}" ${String(selectedValue) === String(type) ? 'selected' : ''}>${escapeHtml(type)}</option>
      `)].join('');
    }

    function getInventoryMovementDisplayLabel(movementType) {
      const normalizedType = String(movementType || '').trim();
      if (!normalizedType) {
        return '';
      }
      if (['Venta', 'Venta receta', 'Venta sabor', 'Adicional'].includes(normalizedType)) {
        return 'Venta';
      }
      if (normalizedType === 'Compra') {
        return 'Compra';
      }
      return normalizedType;
    }

    function getAllInventoryMovementLabels() {
      return [...new Set(state.productos
        .flatMap(producto => buildInventoryKardexMovements(producto.id))
        .map(movement => getInventoryMovementDisplayLabel(movement.type))
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
    }

    function buildInventoryMovementFilterOptions(selectedValue = 'all') {
      const movementLabels = getAllInventoryMovementLabels();
      return [`<option value="all" ${String(selectedValue) === 'all' ? 'selected' : ''}>Todos</option>`, ...movementLabels.map(label => `
        <option value="${escapeHtml(label)}" ${String(selectedValue) === String(label) ? 'selected' : ''}>${escapeHtml(label)}</option>
      `)].join('');
    }

    function refreshInventoryFilterOptions() {
      if (inventorySummaryTypeFilterInput) {
        const currentValue = inventorySummaryTypeFilterInput.value || 'all';
        inventorySummaryTypeFilterInput.innerHTML = buildInventoryTypeFilterOptions(currentValue);
      }
      if (inventoryKardexTypeFilterInput) {
        const currentValue = inventoryKardexTypeFilterInput.value || 'all';
        inventoryKardexTypeFilterInput.innerHTML = buildInventoryTypeFilterOptions(currentValue);
      }
      if (inventorySummaryMovementFilterInput) {
        const currentValue = inventorySummaryMovementFilterInput.value || 'all';
        inventorySummaryMovementFilterInput.innerHTML = buildInventoryMovementFilterOptions(currentValue);
      }
      if (inventoryKardexMovementFilterInput) {
        const currentValue = inventoryKardexMovementFilterInput.value || 'all';
        inventoryKardexMovementFilterInput.innerHTML = buildInventoryMovementFilterOptions(currentValue);
      }
    }

    function movementMatchesInventoryFilter(movement, selectedMovement = 'all') {
      if (!selectedMovement || selectedMovement === 'all') {
        return true;
      }
      return getInventoryMovementDisplayLabel(movement?.type) === String(selectedMovement).trim();
    }

    function setInventoryInitialStatus(message, { error = false } = {}) {
      if (!inventoryInitialStatus) return;
      inventoryInitialStatus.textContent = message;
      inventoryInitialStatus.classList.toggle('error', error);
    }

    function setInventoryAdjustmentStatus(message, { error = false } = {}) {
      if (!inventoryAdjustmentStatus) return;
      inventoryAdjustmentStatus.textContent = message;
      inventoryAdjustmentStatus.classList.toggle('error', error);
    }

    function updateInventoryAdjustmentCostVisibility() {
      const requiresCost = inventoryAdjustmentTypeInput?.value === 'entrada';
      inventoryAdjustmentUnitCostField?.classList.toggle('field-hidden', !requiresCost);
      if (inventoryAdjustmentUnitCostInput) {
        inventoryAdjustmentUnitCostInput.required = requiresCost;
        if (!requiresCost) {
          inventoryAdjustmentUnitCostInput.value = '';
        }
      }
    }

    function resetInventoryMovementForms() {
      const today = new Date().toISOString().split('T')[0];
      if (inventoryInitialForm) inventoryInitialForm.reset();
      if (inventoryAdjustmentForm) inventoryAdjustmentForm.reset();
      if (inventoryInitialDateInput) inventoryInitialDateInput.value = today;
      if (inventoryAdjustmentDateInput) inventoryAdjustmentDateInput.value = today;
      if (inventoryAdjustmentTypeInput) inventoryAdjustmentTypeInput.value = 'entrada';
      if (inventoryInitialUnitCostInput) inventoryInitialUnitCostInput.value = '';
      if (inventoryAdjustmentUnitCostInput) inventoryAdjustmentUnitCostInput.value = '';
      setInventoryInitialStatus('Registra una carga inicial para sumar existencias al inventario actual.');
      setInventoryAdjustmentStatus('Usa los ajustes para corregir diferencias por entrada o salida de stock.');
      updateInventoryAdjustmentCostVisibility();
      syncSearchablePickerTrigger(inventoryInitialProductInput);
      syncSearchablePickerTrigger(inventoryAdjustmentProductInput);
    }

    function renderInventoryMovementForms() {
      if (inventoryInitialProductInput) {
        const selectedInitialProduct = inventoryInitialProductInput.value;
        inventoryInitialProductInput.innerHTML = buildInventoryMovementProductOptions(selectedInitialProduct);
      }
      if (inventoryAdjustmentProductInput) {
        const selectedAdjustmentProduct = inventoryAdjustmentProductInput.value;
        inventoryAdjustmentProductInput.innerHTML = buildInventoryMovementProductOptions(selectedAdjustmentProduct);
      }
      initializeSearchableProductPickers(inventoryInitialPanel || document);
      initializeSearchableProductPickers(inventoryAdjustmentsPanel || document);
      syncSearchablePickerTrigger(inventoryInitialProductInput);
      syncSearchablePickerTrigger(inventoryAdjustmentProductInput);
      if (!inventoryInitialDateInput?.value || !inventoryAdjustmentDateInput?.value) {
        resetInventoryMovementForms();
      }
    }

    function renderIngresoList() {
      const container = document.getElementById('ingreso-product-list');
      const searchTerm = state.productSearch;
      const filteredProducts = state.productos.filter(producto => {
        if (!searchTerm) return true;
        const searchableText = [
          producto.nombre,
          renderInventoryModeLabel(producto),
          renderProductType(producto),
          producto.medida,
          producto.modoControl,
          producto.type,
          producto.tipo
        ].filter(Boolean).join(' ').toLowerCase();
        return searchableText.includes(searchTerm);
      });

      if (!state.productos.length) {
        container.innerHTML = '<p class="product-list-empty">Aún no hay productos ingresados. Agrega tu primer helado para que aparezca en la lista.</p>';
        return;
      }

      if (!filteredProducts.length) {
        container.innerHTML = '<p class="product-list-empty">No hay productos registrados que coincidan con la búsqueda.</p>';
        return;
      }

      container.innerHTML = `
        <div class="product-table-shell">
          <div class="product-table-head">
            <table class="product-table" aria-hidden="true">
              <colgroup>
                <col class="product-col-name" />
                <col class="product-col-type" />
                <col class="product-col-price" />
                <col class="product-col-stock-min" />
                <col class="product-col-recipe" />
                <col class="product-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Precio</th>
                  <th>Stock mínimo</th>
                  <th>Receta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
            </table>
          </div>
          <div class="product-table-body">
            <table class="product-table">
              <colgroup>
                <col class="product-col-name" />
                <col class="product-col-type" />
                <col class="product-col-price" />
                <col class="product-col-stock-min" />
                <col class="product-col-recipe" />
                <col class="product-col-actions" />
              </colgroup>
              <tbody>
                ${filteredProducts.map(producto => {
                  const locked = hasProductMovements(producto.id);
                  return `
                  <tr>
                    <td>${escapeHtml(producto.nombre)}</td>
                    <td>${escapeHtml(renderInventoryModeLabel(producto))}</td>
                    <td>${producto.precio !== undefined && !Number.isNaN(Number(producto.precio)) ? `C$${Number(producto.precio).toFixed(2).replace('.', ',')}` : 'N/A'}</td>
                    <td>${Number(producto.stockMin ?? producto.stockMinimo ?? 0)}</td>
                    <td>${renderRecipeDetail(producto)}</td>
                    <td>
                      <div class="action-buttons">
                        <button type="button" class="secondary-btn action-icon-btn edit-product" data-id="${escapeHtml(producto.id)}" title="Editar producto" aria-label="Editar producto">✎</button>
                        <button type="button" class="delete-product action-icon-btn" data-id="${escapeHtml(producto.id)}" title="Eliminar producto" aria-label="Eliminar producto" ${locked ? 'disabled' : ''}>🗑</button>
                      </div>
                    </td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      syncDynamicTableExport(container, {
        title: 'Productos registrados',
        fileBase: 'productos-registrados',
        sheetName: 'Productos'
      });

      container.querySelectorAll('.edit-product').forEach(button => {
        button.addEventListener('click', () => startEditProduct(button.dataset.id));
      });
      container.querySelectorAll('.delete-product').forEach(button => {
        button.addEventListener('click', async () => {
          const productId = button.dataset.id;
          if (button.disabled) return;
          await deleteProduct(productId);
        });
      });
    }

    function startEditProduct(productId) {
      const producto = state.productos.find(p => String(p.id) === String(productId));
      if (!producto) {
        setProductStatus('Producto no encontrado para editar.', { error: true });
        return;
      }
      editingProductId = producto.id;
      recipeRows.innerHTML = '';
      document.getElementById('name').value = producto.nombre;
      priceInput.value = producto.precio !== undefined ? producto.precio : '';
      controlModeInput.value = getProductInventoryMode(producto);
      yieldPerPurchaseInput.value = producto.rendimientoPorCompra !== undefined ? Number(producto.rendimientoPorCompra) : '';
      scoopsPerUnitInput.value = producto.pelotasPorUnidad !== undefined ? Number(producto.pelotasPorUnidad) : '';
      updateFormFields();
      const tipo = normalizeProductType(producto.tipo || producto.type || renderProductType(producto));
      if (tipo === 'materia prima' || (tipo === '' && producto.medida)) {
        document.getElementById('medida').value = producto.medida || '';
      }
      if (productUsesRecipe(producto)) {
        recipeRows.innerHTML = '';
        (producto.ingredientes || []).forEach(ing => {
          addRecipeIngredientRow();
          const lastRow = recipeRows.lastElementChild;
          const ingSelect = lastRow.querySelector('.ingredient-source');
          ingSelect.value = ing.id || ing.nombre;
          lastRow.querySelector('.ingredient-amount').value = Number(ing.cantidad);
          updateIngredientUnit({ currentTarget: ingSelect });
        });
      }
      productModalTitle.textContent = 'Editar producto';
      submitButton.textContent = 'Guardar cambios';
      cancelEditButton.style.display = 'inline-flex';
      setProductStatus(`Editando producto ${producto.nombre}. Haz cambios y guarda.`);
      openProductModalPanel();
    }

    function cancelEditProduct() {
      resetProductFormState();
      closeProductModalPanel();
      setProductStatus('Edición cancelada. Puedes agregar un nuevo producto.');
    }

    function renderInventario() {
      refreshInventoryFilterOptions();
      renderInventorySummary();
      renderInventoryKardex();
      renderInventoryMovementForms();
    }

    const {
      updateDashboardCashflowFilterVisibility,
      renderDashboard
    } = createDashboardModule({
      state,
      dashboardIncomeStatementMonthInput,
      getCurrentMonthInputValue,
      isExpensePayment,
      getPaymentCategoryName,
      getExternalDebtOriginalAmount,
      calculateSaleInvoiceTotal,
      calculateSaleAddonsTotal,
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
      getProductInventoryMode
    });

    ({
      getEditingFlavorId,
      getEditingToppingId,
      getEditingSauceId,
      startEditFlavor,
      cancelEditFlavor,
      startEditTopping,
      cancelEditTopping,
      startEditSauce,
      cancelEditSauce,
      renderFlavorList,
      renderToppingList,
      renderSauceList
    } = createFlavorsModule({
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
      refreshSaleLinesOptions: (...args) => salesComposer?.refreshSaleLinesOptions?.(...args),
      renderSaleInfo: (...args) => salesComposer?.renderSaleInfo?.(...args),
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
    }));

    function getSauceControlDaysOpen(control) {
      const openDate = control.fechaApertura ? new Date(control.fechaApertura) : null;
      const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : new Date();
      if (!openDate || Number.isNaN(openDate.getTime()) || Number.isNaN(closeDate.getTime())) {
        return 'N/A';
      }
      const diff = Math.max(Math.ceil((closeDate.getTime() - openDate.getTime()) / 86400000), 0);
      return `${diff || 1} dia(s)`;
    }

    function buildSauceControlOpenOptions(selectedId = '') {
      if (!state.sauces.length) {
        return '<option value="">No hay salsas registradas</option>';
      }

      const sortedSauces = state.sauces.slice().sort((left, right) => {
        const leftAvailable = getSauceAvailableStock(left.id) > 0 && !getActiveSauceControlForSauceId(left.id);
        const rightAvailable = getSauceAvailableStock(right.id) > 0 && !getActiveSauceControlForSauceId(right.id);
        if (leftAvailable !== rightAvailable) {
          return leftAvailable ? -1 : 1;
        }
        return String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' });
      });

      return sortedSauces.map(sauce => {
        const activeControl = getActiveSauceControlForSauceId(sauce.id);
        const availableStock = getSauceAvailableStock(sauce.id);
        const isAvailable = availableStock > 0;
        const statusLabel = activeControl
          ? '· abierto'
          : isAvailable
            ? '· listo para abrir'
            : '· sin compra disponible';
        return `<option value="${escapeHtml(sauce.id)}" ${String(sauce.id) === String(selectedId) ? 'selected' : ''} ${!activeControl && isAvailable ? '' : 'disabled'}>${escapeHtml(sauce.nombre)} ${statusLabel} · stock ${formatInventoryQuantity(availableStock)}</option>`;
      }).join('');
    }

    async function closeSauceControl(controlId, { rendimientoReal, observacion = '' } = {}) {
      try {
        const response = await fetch(buildApiUrl(`/salsas-control/${encodeURIComponent(controlId)}/cerrar`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaCierre: new Date().toISOString(), rendimientoReal, observacion })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo cerrar el control de salsa/aderezo.');
        sauceControlStatus.textContent = result.message || 'Control de salsa/aderezo cerrado correctamente.';
        await fetchProductos();
        await fetchInventoryMovements();
        await fetchVentas();
        await fetchSauceControls();
        renderSauceControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        sauceControlStatus.textContent = error.message || 'No se pudo cerrar la salsa/aderezo.';
        console.error(error);
      }
    }

    function renderSauceControls() {
      if (sauceControlOpenSauceInput) {
        sauceControlOpenSauceInput.innerHTML = buildSauceControlOpenOptions(sauceControlOpenSauceInput.value);
        const selectedOption = sauceControlOpenSauceInput.selectedOptions[0];
        if (!selectedOption || selectedOption.disabled || !sauceControlOpenSauceInput.value) {
          const firstEnabledOption = Array.from(sauceControlOpenSauceInput.options).find(option => !option.disabled && option.value);
          sauceControlOpenSauceInput.value = firstEnabledOption ? firstEnabledOption.value : '';
        }
      }
      if (sauceControlOpenDateInput && !sauceControlOpenDateInput.value) {
        sauceControlOpenDateInput.value = getTodayInputValue();
      }

      const activeControls = state.sauceControls.filter(control => String(control.estado) === 'abierto');
      const historyControls = state.sauceControls.slice().sort((a, b) => new Date(b.fechaApertura || 0) - new Date(a.fechaApertura || 0));

      if (sauceControlActiveList) {
        if (!activeControls.length) {
          sauceControlActiveList.innerHTML = '<p class="history-empty">No hay salsas abiertas en este momento.</p>';
        } else {
          sauceControlActiveList.innerHTML = `
            <table class="history-table control-active-table">
              <thead>
                <tr>
                  <th>Salsa / aderezo</th>
                  <th>Materia prima</th>
                  <th>Apertura</th>
                  <th>Rend. teórico</th>
                  <th>Costo prov.</th>
                  <th>Porciones vendidas</th>
                  <th>Ventas</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${activeControls.map(control => `
                  <tr>
                    <td>${escapeHtml(control.sauceNombre || '')}</td>
                    <td>${escapeHtml(control.materiaPrimaNombre || '')}</td>
                    <td>${formatDate(control.fechaApertura)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatCurrency(control.costoPorcionProvisional || 0))}</td>
                    <td>${Number(control.porcionesVendidas || 0)}</td>
                    <td>${Number(control.ventasAsociadas || 0)}</td>
                    <td>${buildControlCloseFields(control, 'sauce')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(sauceControlActiveList, {
            title: 'Controles activos de salsas',
            fileBase: 'controles-salsas-activos',
            sheetName: 'Salsas Activas'
          });
          sauceControlActiveList.querySelectorAll('[data-control-close-submit]').forEach(button => {
            button.addEventListener('click', async () => {
              await closeSauceControl(button.dataset.controlCloseSubmit || button.getAttribute('data-control-close-submit'), {
                rendimientoReal: Number(button.dataset.controlCloseYield || 0)
              });
            });
          });
        }
      }

      if (sauceControlHistoryList) {
        if (!historyControls.length) {
          sauceControlHistoryList.innerHTML = '<p class="history-empty">Aún no hay historial de salsas.</p>';
        } else {
          sauceControlHistoryList.innerHTML = `
            <table class="history-table control-active-table">
              <thead>
                <tr>
                  <th>Salsa / aderezo</th>
                  <th>Estado</th>
                  <th>Costo</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Días abierto</th>
                  <th>Rend. teórico</th>
                  <th>Rend. real</th>
                  <th>Merma</th>
                </tr>
              </thead>
              <tbody>
                ${historyControls.map(control => `
                  <tr>
                    <td>${escapeHtml(control.sauceNombre || '')}</td>
                    <td><span class="status-chip ${control.estado === 'abierto' ? 'pending' : 'overdue'}">${control.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
                    <td>${buildControlCostStatusChip(control.costoEstado)}</td>
                    <td>${formatDate(control.fechaApertura)}</td>
                    <td>${control.fechaCierre ? formatDate(control.fechaCierre) : 'Abierto'}</td>
                    <td>${getSauceControlDaysOpen(control)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity((control.rendimientoReal ?? control.porcionesVendidas) || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.mermaReal || 0))}<br><small>${escapeHtml(formatCurrency((control.costoPorcionFinal ?? control.costoPorcionProvisional) || 0))}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(sauceControlHistoryList, {
            title: 'Historial de salsas y aderezos',
            fileBase: 'historial-salsas-aderezos',
            sheetName: 'Historial Salsas'
          });
        }
      }
    }

    function getToppingControlDaysOpen(control) {
      const openDate = control.fechaApertura ? new Date(control.fechaApertura) : null;
      const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : new Date();
      if (!openDate || Number.isNaN(openDate.getTime()) || Number.isNaN(closeDate.getTime())) {
        return 'N/A';
      }
      const diff = Math.max(Math.ceil((closeDate.getTime() - openDate.getTime()) / 86400000), 0);
      return `${diff || 1} dia(s)`;
    }

    async function closeToppingControl(controlId, { rendimientoReal, observacion = '' } = {}) {
      try {
        const response = await fetch(buildApiUrl(`/toppings-control/${encodeURIComponent(controlId)}/cerrar`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaCierre: new Date().toISOString(), rendimientoReal, observacion })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo cerrar el control de topping.');
        toppingControlStatus.textContent = result.message || 'Control de topping cerrado correctamente.';
        await fetchProductos();
        await fetchInventoryMovements();
        await fetchVentas();
        await fetchToppingControls();
        renderToppingControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        toppingControlStatus.textContent = error.message || 'No se pudo cerrar el topping.';
        console.error(error);
      }
    }

    function renderToppingControls() {
      if (toppingControlOpenToppingInput) {
        toppingControlOpenToppingInput.innerHTML = buildToppingControlOpenOptions(toppingControlOpenToppingInput.value);
        const selectedOption = toppingControlOpenToppingInput.selectedOptions[0];
        if (!selectedOption || selectedOption.disabled || !toppingControlOpenToppingInput.value) {
          const firstEnabledOption = Array.from(toppingControlOpenToppingInput.options).find(option => !option.disabled && option.value);
          toppingControlOpenToppingInput.value = firstEnabledOption ? firstEnabledOption.value : '';
        }
      }
      if (toppingControlOpenDateInput && !toppingControlOpenDateInput.value) {
        toppingControlOpenDateInput.value = getTodayInputValue();
      }

      const activeControls = state.toppingControls.filter(control => String(control.estado) === 'abierto');
      const historyControls = state.toppingControls.slice().sort((a, b) => new Date(b.fechaApertura || 0) - new Date(a.fechaApertura || 0));

      if (toppingControlActiveList) {
        if (!activeControls.length) {
          toppingControlActiveList.innerHTML = '<p class="history-empty">No hay toppings abiertos en este momento.</p>';
        } else {
          toppingControlActiveList.innerHTML = `
            <table class="history-table control-active-table">
              <thead>
                <tr>
                  <th>Topping</th>
                  <th>Materia prima</th>
                  <th>Apertura</th>
                  <th>Rend. teórico</th>
                  <th>Costo prov.</th>
                  <th>Porciones vendidas</th>
                  <th>Ventas</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${activeControls.map(control => `
                  <tr>
                    <td>${escapeHtml(control.toppingNombre || '')}</td>
                    <td>${escapeHtml(control.materiaPrimaNombre || '')}</td>
                    <td>${formatDate(control.fechaApertura)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatCurrency(control.costoPorcionProvisional || 0))}</td>
                    <td>${Number(control.porcionesVendidas || 0)}</td>
                    <td>${Number(control.ventasAsociadas || 0)}</td>
                    <td>${buildControlCloseFields(control, 'topping')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(toppingControlActiveList, {
            title: 'Controles activos de toppings',
            fileBase: 'controles-toppings-activos',
            sheetName: 'Toppings Activos'
          });
          toppingControlActiveList.querySelectorAll('[data-control-close-submit]').forEach(button => {
            button.addEventListener('click', async () => {
              await closeToppingControl(button.dataset.controlCloseSubmit || button.getAttribute('data-control-close-submit'), {
                rendimientoReal: Number(button.dataset.controlCloseYield || 0)
              });
            });
          });
        }
      }

      if (toppingControlHistoryList) {
        if (!historyControls.length) {
          toppingControlHistoryList.innerHTML = '<p class="history-empty">Aún no hay historial de toppings.</p>';
        } else {
          toppingControlHistoryList.innerHTML = `
            <table class="history-table">
              <thead>
                <tr>
                  <th>Topping</th>
                  <th>Estado</th>
                  <th>Costo</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Días abierto</th>
                  <th>Rend. teórico</th>
                  <th>Rend. real</th>
                  <th>Merma</th>
                </tr>
              </thead>
              <tbody>
                ${historyControls.map(control => `
                  <tr>
                    <td>${escapeHtml(control.toppingNombre || '')}</td>
                    <td><span class="status-chip ${control.estado === 'abierto' ? 'pending' : 'overdue'}">${control.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
                    <td>${buildControlCostStatusChip(control.costoEstado)}</td>
                    <td>${formatDate(control.fechaApertura)}</td>
                    <td>${control.fechaCierre ? formatDate(control.fechaCierre) : 'Abierto'}</td>
                    <td>${getToppingControlDaysOpen(control)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity((control.rendimientoReal ?? control.porcionesVendidas) || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity(control.mermaReal || 0))}<br><small>${escapeHtml(formatCurrency((control.costoPorcionFinal ?? control.costoPorcionProvisional) || 0))}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(toppingControlHistoryList, {
            title: 'Historial de toppings',
            fileBase: 'historial-toppings',
            sheetName: 'Historial Toppings'
          });
        }
      }
    }

    function getBucketDaysOpen(bucket) {
      const openDate = bucket.fechaApertura ? new Date(bucket.fechaApertura) : null;
      const closeDate = bucket.fechaCierre ? new Date(bucket.fechaCierre) : new Date();
      if (!openDate || Number.isNaN(openDate.getTime()) || Number.isNaN(closeDate.getTime())) {
        return 'N/A';
      }
      const diff = Math.max(Math.ceil((closeDate.getTime() - openDate.getTime()) / 86400000), 0);
      return `${diff || 1} dia(s)`;
    }

    async function closeBucketControl(bucketId, { rendimientoReal, observacion = '' } = {}) {
      try {
        const response = await fetch(buildApiUrl(`/baldes-control/${encodeURIComponent(bucketId)}/cerrar`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaCierre: new Date().toISOString(), rendimientoReal, observacion })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo cerrar el balde.');
        bucketStatus.textContent = result.message || 'Balde cerrado correctamente.';
        await fetchProductos();
        await fetchInventoryMovements();
        await fetchVentas();
        await fetchBucketControls();
        renderBucketControls();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        bucketStatus.textContent = error.message || 'No se pudo cerrar el balde.';
        console.error(error);
      }
    }

    function renderBucketControls() {
      if (bucketOpenFlavorInput) {
        bucketOpenFlavorInput.innerHTML = buildBucketFlavorOptions(bucketOpenFlavorInput.value);
      }
      if (bucketOpenDateInput && !bucketOpenDateInput.value) {
        bucketOpenDateInput.value = getTodayInputValue();
      }

      const activeBuckets = state.bucketControls.filter(bucket => String(bucket.estado) === 'abierto');
      const historyBuckets = state.bucketControls.slice().sort((a, b) => new Date(b.fechaApertura || 0) - new Date(a.fechaApertura || 0));

      if (bucketActiveList) {
        if (!activeBuckets.length) {
          bucketActiveList.innerHTML = '<p class="history-empty">No hay baldes abiertos en este momento.</p>';
        } else {
          bucketActiveList.innerHTML = `
            <table class="history-table">
              <thead>
                <tr>
                  <th>Sabor</th>
                  <th>Balde</th>
                  <th>Apertura</th>
                  <th>Rend. teórico</th>
                  <th>Costo prov.</th>
                  <th>Porciones vendidas</th>
                  <th>Ventas</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${activeBuckets.map(bucket => `
                  <tr>
                    <td>${escapeHtml(bucket.saborNombre || '')}</td>
                    <td>${escapeHtml(bucket.materiaPrimaNombre || '')}</td>
                    <td>${formatDate(bucket.fechaApertura)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(bucket.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatCurrency(bucket.costoPorcionProvisional || 0))}</td>
                    <td>${Number(bucket.porcionesVendidas || 0)}</td>
                    <td>${Number(bucket.ventasAsociadas || 0)}</td>
                    <td>${buildControlCloseFields(bucket, 'bucket')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(bucketActiveList, {
            title: 'Baldes activos',
            fileBase: 'baldes-activos',
            sheetName: 'Baldes Activos'
          });
          bucketActiveList.querySelectorAll('[data-control-close-submit]').forEach(button => {
            button.addEventListener('click', async () => {
              await closeBucketControl(button.dataset.controlCloseSubmit || button.getAttribute('data-control-close-submit'), {
                rendimientoReal: Number(button.dataset.controlCloseYield || 0)
              });
            });
          });
        }
      }

      if (bucketHistoryList) {
        if (!historyBuckets.length) {
          bucketHistoryList.innerHTML = '<p class="history-empty">Aún no hay historial de baldes.</p>';
        } else {
          bucketHistoryList.innerHTML = `
            <table class="history-table">
              <thead>
                <tr>
                  <th>Sabor</th>
                  <th>Estado</th>
                  <th>Costo</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Días abierto</th>
                  <th>Rend. teórico</th>
                  <th>Rend. real</th>
                  <th>Merma</th>
                </tr>
              </thead>
              <tbody>
                ${historyBuckets.map(bucket => `
                  <tr>
                    <td>${escapeHtml(bucket.saborNombre || '')}</td>
                    <td><span class="status-chip ${bucket.estado === 'abierto' ? 'pending' : 'overdue'}">${bucket.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
                    <td>${buildControlCostStatusChip(bucket.costoEstado)}</td>
                    <td>${formatDate(bucket.fechaApertura)}</td>
                    <td>${bucket.fechaCierre ? formatDate(bucket.fechaCierre) : 'Abierto'}</td>
                    <td>${getBucketDaysOpen(bucket)}</td>
                    <td>${escapeHtml(formatInventoryQuantity(bucket.rendimientoTeorico || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity((bucket.rendimientoReal ?? bucket.porcionesVendidas) || 0))}</td>
                    <td>${escapeHtml(formatInventoryQuantity(bucket.mermaReal || 0))}<br><small>${escapeHtml(formatCurrency((bucket.costoPorcionFinal ?? bucket.costoPorcionProvisional) || 0))}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          syncDynamicTableExport(bucketHistoryList, {
            title: 'Historial de baldes',
            fileBase: 'historial-baldes',
            sheetName: 'Historial Baldes'
          });
        }
      }
    }

    async function fetchSabores() {
      try {
        const response = await fetch(buildApiUrl('/sabores'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar los sabores.');
        const sabores = await response.json();
        state.sabores = Array.isArray(sabores) ? sabores : [];
        if (flavorRawMaterialInput) {
          flavorRawMaterialInput.innerHTML = buildRawMaterialOptions(flavorRawMaterialInput.value);
        }
      } catch (error) {
        console.error(error);
        state.sabores = [];
      }
    }

    async function fetchToppings() {
      try {
        const response = await fetch(buildApiUrl('/toppings'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar los toppings.');
        const toppings = await response.json();
        state.toppings = Array.isArray(toppings) ? toppings : [];
        if (toppingRawMaterialInput) {
          toppingRawMaterialInput.innerHTML = buildRawMaterialOptions(toppingRawMaterialInput.value);
        }
      } catch (error) {
        console.error(error);
        state.toppings = [];
      }
    }

    async function fetchSauces() {
      try {
        const response = await fetch(buildApiUrl('/salsas'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar las salsas/aderezos.');
        const sauces = await response.json();
        state.sauces = Array.isArray(sauces) ? sauces : [];
        if (sauceRawMaterialInput) {
          sauceRawMaterialInput.innerHTML = buildRawMaterialOptions(sauceRawMaterialInput.value);
        }
      } catch (error) {
        console.error(error);
        state.sauces = [];
      }
    }

    async function fetchToppingControls() {
      try {
        const response = await fetch(buildApiUrl('/toppings-control'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudo cargar el control de toppings.');
        const toppingControls = await response.json();
        state.toppingControls = Array.isArray(toppingControls) ? toppingControls : [];
      } catch (error) {
        console.error(error);
        state.toppingControls = [];
      }
    }

    async function fetchSauceControls() {
      try {
        const response = await fetch(buildApiUrl('/salsas-control'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudo cargar el control de salsas/aderezos.');
        const sauceControls = await response.json();
        state.sauceControls = Array.isArray(sauceControls) ? sauceControls : [];
      } catch (error) {
        console.error(error);
        state.sauceControls = [];
      }
    }

    async function fetchBucketControls() {
      try {
        const response = await fetch(buildApiUrl('/baldes-control'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudo cargar el control de baldes.');
        const bucketControls = await response.json();
        state.bucketControls = Array.isArray(bucketControls) ? bucketControls : [];
      } catch (error) {
        console.error(error);
        state.bucketControls = [];
      }
    }

    async function fetchInventoryMovements() {
      try {
        const response = await fetch(buildApiUrl('/inventario/movimientos'), { cache: 'no-cache' });
        if (!response.ok) throw new Error('No se pudieron cargar los movimientos de inventario.');
        const inventoryMovements = await response.json();
        state.inventoryMovements = Array.isArray(inventoryMovements) ? inventoryMovements : [];
      } catch (error) {
        console.error(error);
        state.inventoryMovements = [];
      }
    }

    async function fetchProductos() {
      try {
        if (!state.auth.token || !state.auth.user) {
          return;
        }
        loadingText.textContent = 'Cargando productos...';
        const response = await fetch(apiUrl(), { mode: 'cors', cache: 'no-cache' });
        if (!response.ok) {
          if (response.status === 401) {
            clearAuthenticatedState();
            return;
          }
          const message = await response.text();
          throw new Error(`Error ${response.status}: ${message}`);
        }
        const productos = await response.json();
        state.productos = Array.isArray(productos) ? productos : [];
        await Promise.all([fetchCompras(), fetchVentas(), fetchPaymentCategories(), fetchPayments(), fetchFundTransfers(), fetchFundSettings(), fetchExternalDebts(), fetchSabores(), fetchToppings(), fetchSauces(), fetchBucketControls(), fetchToppingControls(), fetchSauceControls(), fetchInventoryMovements()]);
        populateSelects();
        renderInventario();
        setProductStatus('Productos sincronizados con el backend.');
      } catch (error) {
        console.error(error);
        setProductStatus(`No se pudo obtener los productos. ${error.message}.`, { error: true });
      } finally {
        loadingText.textContent = '';
      }
    }

    function escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    async function buildApiError(response, fallbackMessage) {
      if (response.status === 401) {
        return 'Sesión expirada';
      }

      let parsedMessage = '';
      const rawText = await response.text();
      if (rawText) {
        try {
          const result = JSON.parse(rawText);
          parsedMessage = result?.error || result?.message || '';
        } catch {
          parsedMessage = rawText;
        }
      }

      const cleanMessage = String(parsedMessage || '').trim();
      if (response.status === 400 && !cleanMessage) {
        return 'Datos incompletos';
      }
      return cleanMessage ? `Error ${response.status}: ${cleanMessage}` : fallbackMessage;
    }

    function buildConnectionErrorMessage(actionLabel, error) {
      if (error instanceof TypeError && /fetch/i.test(String(error.message || ''))) {
        return `No se pudo ${actionLabel}. Verifica que la API esté disponible.`;
      }
      return `No se pudo ${actionLabel}. ${error.message}`;
    }

    productForm.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(productForm);
      const controlMode = normalizeInventoryMode(controlModeInput.value);
      const tipo = controlMode === 'materia-prima'
        ? 'materia prima'
        : controlMode === 'receta' || controlMode === 'mixto'
          ? 'producto terminado'
          : 'productos';
      const ingredientes = [];

      if (controlMode === 'receta' || controlMode === 'mixto') {
        recipeRows.querySelectorAll('.recipe-row').forEach(row => {
          const select = row.querySelector('.ingredient-source');
          const cantidad = Number(row.querySelector('.ingredient-amount').value);
          const id = select.value;
          const nombre = select.selectedOptions[0]?.dataset.name || select.value;
          if (id && nombre) {
            ingredientes.push({ id, nombre, cantidad });
          }
        });
      }

      const precioValue = formData.get('price');
      const newProduct = {
        nombre: formData.get('name').trim(),
        precio: tipo === 'materia prima' ? undefined : Number(precioValue),
        tipo,
        modoControl: controlMode,
        stockMin: tipo === 'producto terminado' ? 0 : Number(formData.get('stockMin')),
        medida: formData.get('medida')?.trim() || undefined,
        ingredientes: controlMode === 'receta' || controlMode === 'mixto' ? ingredientes : undefined,
        controlSabores: controlMode === 'helado-sabores' || controlMode === 'mixto',
        rendimientoPorCompra: tipo === 'materia prima' ? Number(yieldPerPurchaseInput.value) : undefined,
        pelotasPorUnidad: controlMode === 'helado-sabores' || controlMode === 'mixto' ? Number(scoopsPerUnitInput.value) : undefined,
        stock: 0,
        originalId: editingProductId || undefined
      };

      const priceInvalid = tipo !== 'materia prima' && Number.isNaN(newProduct.precio);
      if (!newProduct.nombre || priceInvalid || Number.isNaN(newProduct.stockMin) || !newProduct.tipo) {
        setProductStatus('Completa todos los campos con valores válidos.', { error: true });
        showError('Completa todos los campos con valores válidos.');
        return;
      }
      if (!controlMode) {
        setProductStatus('Selecciona el modo de control del producto.', { error: true });
        showError('Selecciona el modo de control del producto.');
        return;
      }
      if (tipo === 'materia prima' && !newProduct.medida) {
        setProductStatus('Agrega la medición para la materia prima.', { error: true });
        showError('Agrega la medición para la materia prima.');
        return;
      }
      if (tipo === 'materia prima' && (!Number.isInteger(newProduct.rendimientoPorCompra) || newProduct.rendimientoPorCompra <= 0)) {
        setProductStatus('Define cuántas porciones rinde cada unidad comprada de la materia prima.', { error: true });
        showError('Define cuántas porciones rinde cada unidad comprada de la materia prima.');
        return;
      }
      if ((controlMode === 'receta' || controlMode === 'mixto') && !newProduct.ingredientes.length) {
        setProductStatus('Agrega al menos un ingrediente para los productos con receta.', { error: true });
        showError('Agrega al menos un ingrediente para los productos con receta.');
        return;
      }
      if ((controlMode === 'helado-sabores' || controlMode === 'mixto') && (!Number.isInteger(newProduct.pelotasPorUnidad) || newProduct.pelotasPorUnidad <= 0)) {
        setProductStatus('Define cuántas porciones o pelotas variables lleva por unidad este producto.', { error: true });
        showError('Define cuántas porciones o pelotas variables lleva por unidad este producto.');
        return;
      }

      const wasEditing = Boolean(editingProductId);
      if (!setLoadingState(productForm, true, { label: wasEditing ? 'Guardando...' : 'Guardando...' })) {
        return;
      }
      try {
        setProductStatus(wasEditing ? 'Actualizando producto...' : 'Agregando producto...');
        const response = await fetch(apiUrl(), {
          method: 'POST',
          mode: 'cors',
          cache: 'no-cache',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProduct)
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo guardar el producto.'));
        }
        resetProductFormState();
        closeProductModalPanel();
        setProductStatus(wasEditing ? 'Producto actualizado con éxito.' : 'Producto agregado con éxito.');
        await fetchProductos();
        showSuccess(wasEditing ? 'Producto actualizado con éxito.' : 'Producto agregado con éxito.');
      } catch (error) {
        console.error(error);
        setProductStatus(buildConnectionErrorMessage('crear el producto', error), { error: true });
        showError(buildConnectionErrorMessage('crear el producto', error));
      } finally {
        setLoadingState(productForm, false);
      }
    });

    flavorForm.addEventListener('submit', async event => {
      event.preventDefault();
      const editingFlavorId = getEditingFlavorId();
      const payload = {
        nombre: flavorNameInput.value.trim(),
        materiaPrimaId: flavorRawMaterialInput.value,
        originalId: editingFlavorId || undefined
      };

      if (!payload.nombre || !payload.materiaPrimaId) {
        flavorStatus.textContent = 'Ingresa un nombre válido y selecciona el balde del sabor.';
        return;
      }

      try {
        flavorStatus.textContent = editingFlavorId ? 'Actualizando sabor...' : 'Agregando sabor...';
        const response = await fetch(buildApiUrl('/sabores'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el sabor.');

        cancelEditFlavor();
        flavorStatus.textContent = result.message || 'Sabor guardado correctamente.';
        await fetchSabores();
        renderFlavorList();
        renderBucketControls();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        flavorStatus.textContent = error.message;
        console.error(error);
      }
    });

    toppingForm.addEventListener('submit', async event => {
      event.preventDefault();
      const editingToppingId = getEditingToppingId();
      const payload = {
        nombre: toppingNameInput.value.trim(),
        materiaPrimaId: toppingRawMaterialInput.value,
        originalId: editingToppingId || undefined
      };

      if (!payload.nombre || !payload.materiaPrimaId) {
        toppingStatus.textContent = 'Ingresa un nombre válido y selecciona la materia prima del topping.';
        return;
      }

      try {
        toppingStatus.textContent = editingToppingId ? 'Actualizando topping...' : 'Agregando topping...';
        const response = await fetch(buildApiUrl('/toppings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el topping.');

        cancelEditTopping();
        toppingStatus.textContent = result.message || 'Topping guardado correctamente.';
        await fetchToppings();
        renderToppingList();
        renderToppingControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        toppingStatus.textContent = error.message;
        console.error(error);
      }
    });

    sauceForm.addEventListener('submit', async event => {
      event.preventDefault();
      const editingSauceId = getEditingSauceId();
      const payload = {
        nombre: sauceNameInput.value.trim(),
        materiaPrimaId: sauceRawMaterialInput.value,
        originalId: editingSauceId || undefined
      };

      if (!payload.nombre || !payload.materiaPrimaId) {
        sauceStatus.textContent = 'Ingresa un nombre válido y selecciona la materia prima de la salsa/aderezo.';
        return;
      }

      try {
        sauceStatus.textContent = editingSauceId ? 'Actualizando salsa/aderezo...' : 'Agregando salsa/aderezo...';
        const response = await fetch(buildApiUrl('/salsas'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar la salsa/aderezo.');

        cancelEditSauce();
        sauceStatus.textContent = result.message || 'Salsa/aderezo guardado correctamente.';
        await fetchSauces();
        renderSauceList();
        renderSauceControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        sauceStatus.textContent = error.message;
        console.error(error);
      }
    });

    bucketOpenForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        saborId: bucketOpenFlavorInput.value,
        fechaApertura: bucketOpenDateInput.value,
        observacion: bucketOpenNoteInput.value.trim()
      };

      if (!payload.saborId || !payload.fechaApertura) {
        bucketStatus.textContent = 'Selecciona un sabor y una fecha de apertura válidos.';
        return;
      }

      try {
        bucketStatus.textContent = 'Abriendo balde...';
        const response = await fetch(buildApiUrl('/baldes-control/abrir'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo abrir el balde.');

        bucketStatus.textContent = result.message || 'Balde abierto correctamente.';
        bucketOpenForm.reset();
        bucketOpenDateInput.value = getTodayInputValue();
        await fetchBucketControls();
        renderBucketControls();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        bucketStatus.textContent = error.message;
        console.error(error);
      }
    });

    toppingControlOpenForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        toppingId: toppingControlOpenToppingInput.value,
        fechaApertura: toppingControlOpenDateInput.value,
        observacion: toppingControlOpenNoteInput.value.trim()
      };

      if (!payload.toppingId || !payload.fechaApertura) {
        toppingControlStatus.textContent = 'Selecciona un topping y una fecha de apertura válidos.';
        return;
      }

      try {
        toppingControlStatus.textContent = 'Abriendo topping...';
        const response = await fetch(buildApiUrl('/toppings-control/abrir'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo abrir el control de topping.');

        toppingControlStatus.textContent = result.message || 'Control de topping abierto correctamente.';
        toppingControlOpenForm.reset();
        toppingControlOpenDateInput.value = getTodayInputValue();
        await fetchToppingControls();
        renderToppingControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        toppingControlStatus.textContent = error.message;
        console.error(error);
      }
    });

    sauceControlOpenForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        sauceId: sauceControlOpenSauceInput.value,
        fechaApertura: sauceControlOpenDateInput.value,
        observacion: sauceControlOpenNoteInput.value.trim()
      };

      if (!payload.sauceId || !payload.fechaApertura) {
        sauceControlStatus.textContent = 'Selecciona una salsa/aderezo y una fecha de apertura válidas.';
        return;
      }

      try {
        sauceControlStatus.textContent = 'Abriendo salsa/aderezo...';
        const response = await fetch(buildApiUrl('/salsas-control/abrir'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo abrir el control de salsa/aderezo.');

        sauceControlStatus.textContent = result.message || 'Control de salsa/aderezo abierto correctamente.';
        sauceControlOpenForm.reset();
        sauceControlOpenDateInput.value = getTodayInputValue();
        await fetchSauceControls();
        renderSauceControls();
        refreshSaleExtraCatalogOptions();
        salesComposer?.refreshSaleLinesOptions?.();
        salesComposer?.renderSaleInfo?.();
      } catch (error) {
        sauceControlStatus.textContent = error.message;
        console.error(error);
      }
    });

    purchaseForm.addEventListener('submit', async event => {
      event.preventDefault();
      const documentValue = purchaseDocumentInput.value.trim();
      const supplierValue = purchaseSupplierInput.value.trim();
      const dateValue = purchaseDateInput.value;
      const lines = Array.from(purchaseLines.querySelectorAll('.purchase-row'));
      const items = lines.map(parsePurchaseRow).filter(item => item.id && item.cantidad > 0 && !Number.isNaN(item.costo));

      if (!documentValue || !supplierValue || !dateValue || !items.length) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'Completa todos los campos de la compra correctamente.';
        showError('Completa todos los campos de la compra correctamente.');
        return;
      }

      if (items.some(item => item.cantidad <= 0 || Number.isNaN(item.costo))) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'Cada línea debe tener cantidad y precio válidos.';
        showError('Cada línea debe tener cantidad y precio válidos.');
        return;
      }

      const missingLinkedItem = items.find(item => {
        const product = findProductById(item.id);
        return productRequiresPurchaseLink(product) && !item.linkedId;
      });

      if (missingLinkedItem) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'Selecciona el sabor o topping correspondiente en cada compra de materia prima vinculada.';
        showError('Selecciona el sabor o topping correspondiente en cada compra de materia prima vinculada.');
        return;
      }

      try {
        purchaseStatus.className = 'status';
        purchaseStatus.textContent = 'Registrando compra...';
        const paymentTypeValue = purchasePaymentTypeInput.value;
        const paymentMethodValue = paymentTypeValue === 'contado'
          ? cashMethodInput.value
          : 'credito';
        const dueDateValue = purchaseDueDateInput.value;
        const cashOutValue = Number(cashOutInput.value || 0);
        const cashReferenceValue = cashReferenceInput.value.trim();

        if (!setLoadingState(purchaseForm, true, { label: 'Registrando...' })) {
          return;
        }

        if (!paymentMethodValue) {
          purchaseStatus.className = 'status error';
          purchaseStatus.textContent = 'El método de pago es obligatorio.';
          showError('El método de pago es obligatorio.');
          return;
        }

        if (paymentTypeValue === 'contado' && (Number.isNaN(cashOutValue) || cashOutValue <= 0)) {
          purchaseStatus.className = 'status error';
          purchaseStatus.textContent = 'En contado, el monto de salida debe ser mayor que cero.';
          showError('En contado, el monto de salida debe ser mayor que cero.');
          return;
        }

        if (paymentTypeValue === 'contado' && requiresPaymentReference(paymentMethodValue) && !cashReferenceValue) {
          purchaseStatus.className = 'status error';
          purchaseStatus.textContent = 'La referencia es obligatoria para tarjeta o transferencia.';
          showError('La referencia es obligatoria para tarjeta o transferencia.');
          return;
        }

        if (paymentTypeValue === 'credito' && !dueDateValue) {
          purchaseStatus.className = 'status error';
          purchaseStatus.textContent = 'La fecha de vencimiento es obligatoria para compras a crédito.';
          showError('La fecha de vencimiento es obligatoria para compras a crédito.');
          return;
        }

        purchaseStatus.className = 'status';
        purchaseStatus.textContent = 'Registrando compra...';
        const response = await fetch(buildApiUrl('/compras'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documento: documentValue,
            proveedor: supplierValue,
            fecha: dateValue,
            paymentType: paymentTypeValue,
            paymentMethod: paymentMethodValue,
            dueDate: dueDateValue,
            cashOut: paymentTypeValue === 'contado' ? cashOutValue : null,
            paymentReference: paymentTypeValue === 'contado' ? (cashReferenceValue || null) : null,
            items
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo registrar la compra.');

        purchaseStatus.textContent = `Compra registrada: ${items.length} productos.`;
  showSuccess(`Compra registrada: ${items.length} productos.`);
        purchaseForm.reset();
        purchaseLines.innerHTML = '';
        addPurchaseLine();
        applyDefaultDateValues();
        purchaseDueDateField.classList.add('field-hidden');
        cashMethodInput.value = '';
        cashOutInput.value = '';
        cashReferenceInput.value = '';
        purchaseCajaFloat.classList.add('field-hidden');
        updatePurchasePaymentSection();
        renderPurchaseInfo();
        await Promise.all([fetchProductos(), fetchCompras(), fetchPayments()]);
        renderPurchaseRegistro();
        renderPurchasePayables();
        renderPaymentInfo();
        renderPaymentRegistro();
        renderPendingPayments();
        renderFundsModule();
      } catch (error) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = error.message;
        showError(error.message);
        console.error(error);
      } finally {
        setLoadingState(purchaseForm, false);
      }
    });

    addPurchaseLineButton.addEventListener('click', () => {
      const editingRow = Array.from(purchaseLines.querySelectorAll('.purchase-row')).find(row => row.classList.contains('is-editing'));
      if (editingRow) {
        const parsedRow = parsePurchaseRow(editingRow);
        const product = findProductById(parsedRow.id);
        if (!parsedRow.id || parsedRow.cantidad <= 0 || Number.isNaN(parsedRow.costo)) {
          purchaseStatus.className = 'status error';
          purchaseStatus.textContent = 'Completa la fila actual antes de agregar otro producto.';
          return;
        }
          if (productRequiresPurchaseLink(product) && !parsedRow.linkedId) {
          purchaseStatus.className = 'status error';
            purchaseStatus.textContent = 'Selecciona el sabor o topping de la materia prima antes de agregar otra fila.';
          return;
        }
        setPurchaseRowEditing(editingRow, false);
      }
      addPurchaseLine();
    });
    purchasePaymentTypeInput.addEventListener('change', updatePurchasePaymentSection);
    openCajaButton.addEventListener('click', () => {
      purchaseCajaFloat.classList.toggle('field-hidden');
    });
    closeCajaButton.addEventListener('click', () => {
      purchaseCajaFloat.classList.add('field-hidden');
    });
    cashMethodInput.addEventListener('change', () => {
      updateCashReferenceVisibility();
      updatePurchasePaymentSection();
    });
    cashOutInput.addEventListener('input', updateCashReconciliation);
    purchaseDueDateInput.addEventListener('change', updatePurchasePaymentSection);
    filterDocumentInput.addEventListener('input', renderPurchaseRegistro);
    filterSupplierInput.addEventListener('input', renderPurchaseRegistro);
    filterProductInput.addEventListener('input', renderPurchaseRegistro);
    filterMethodInput.addEventListener('change', renderPurchaseRegistro);
    filterDateModeInput.addEventListener('change', () => {
      updatePurchaseRegistroDateFilterVisibility();
      renderPurchaseRegistro();
    });
    filterDateStartInput.addEventListener('change', renderPurchaseRegistro);
    filterDateEndInput.addEventListener('change', renderPurchaseRegistro);
    payablesFilterDocumentInput.addEventListener('input', renderPurchasePayables);
    payablesFilterSupplierInput.addEventListener('input', renderPurchasePayables);
    payablesFilterStatusInput.addEventListener('change', renderPurchasePayables);
    payablesFilterDateModeInput.addEventListener('change', () => {
      updatePayablesDateFilterVisibility();
      renderPurchasePayables();
    });
    payablesFilterDateStartInput.addEventListener('change', renderPurchasePayables);
    payablesFilterDateEndInput.addEventListener('change', renderPurchasePayables);
    clearFiltersButton.addEventListener('click', () => {
      filterDocumentInput.value = '';
      filterSupplierInput.value = '';
      filterProductInput.value = '';
      filterMethodInput.value = 'all';
      filterDateModeInput.value = 'all';
      updatePurchaseRegistroDateFilterVisibility();
      filterDateStartInput.value = '';
      filterDateEndInput.value = '';
      renderPurchaseRegistro();
    });
    exportRegistroExcelButton.addEventListener('click', exportRegistroExcel);
    exportRegistroPdfButton.addEventListener('click', exportRegistroPdf);
    clearPayablesFiltersButton.addEventListener('click', () => {
      payablesFilterDocumentInput.value = '';
      payablesFilterSupplierInput.value = '';
      payablesFilterStatusInput.value = 'all';
      payablesFilterDateModeInput.value = 'all';
      updatePayablesDateFilterVisibility();
      renderPurchasePayables();
    });
    exportPayablesExcelButton.addEventListener('click', exportPayablesExcel);
    exportPayablesPdfButton.addEventListener('click', exportPayablesPdf);

    purchaseTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        purchaseTabs.forEach(button => button.classList.toggle('active', button === tab));
        purchaseNewPanel.classList.toggle('active', tabName === 'new');
        purchaseRegistroPanel.classList.toggle('active', tabName === 'registro');
        purchasePayablesPanel.classList.toggle('active', tabName === 'payables');
      });
    });

    saleForm.addEventListener('submit', async event => {
      event.preventDefault();
      const documentValue = saleDocumentInput.value.trim();
      const customerValue = saleCustomerInput.value.trim();
      const dateValue = saleDateInput.value;
      const lines = Array.from(saleLines.querySelectorAll('.purchase-row'));
      const productRows = lines.filter(row => salesComposer.isSaleProductLineRow(row));
      const extraRows = lines.filter(row => salesComposer.isSaleExtraLineRow(row));
      const extraLinesByParent = extraRows.reduce((map, row) => {
        const parentLineId = String(row.dataset.parentLineId || '');
        const parsed = salesComposer.parseSaleExtraLine(row);
        const bucket = map.get(parentLineId) || [];
        if (parsed.addon) {
          bucket.push(parsed.addon);
        }
        map.set(parentLineId, bucket);
        return map;
      }, new Map());
      const items = productRows.map(row => {
        const select = row.querySelector('.sale-product-source');
        const quantity = Number(row.querySelector('.sale-quantity').value);
        const price = Number(row.querySelector('.sale-price').value);
        const id = select.value;
        const nombre = select.selectedOptions[0]?.dataset.name || '';
        const sabores = salesComposer.getSaleLineSelectedFlavors(row);
        const adicionales = [
          ...salesComposer.getSaleLineAddons(row),
          ...(extraLinesByParent.get(String(row.dataset.lineId || '')) || [])
        ];
        return { id, nombre, cantidad: quantity, precio: price, sabores, adicionales };
      }).filter(item => item.id && item.cantidad > 0 && !Number.isNaN(item.precio));

      if (!documentValue || !customerValue || !dateValue || !items.length) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'Completa todos los campos de la venta correctamente.';
        showError('Completa todos los campos de la venta correctamente.');
        return;
      }

      if (items.some(item => item.cantidad <= 0 || Number.isNaN(item.precio))) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'Cada línea debe tener cantidad y precio válidos.';
        showError('Cada línea debe tener cantidad y precio válidos.');
        return;
      }

      const invalidAddons = productRows.some(row => salesComposer.getSaleLineAddonState(row).hasInvalid)
        || extraRows.some(row => {
          const parsed = salesComposer.parseSaleExtraLine(row);
          return !parsed.isEmpty && !parsed.isValid;
        });
      if (invalidAddons) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'Revisa los extras y toppings: cada fila debe tener nombre, cantidad y precio válidos.';
        showError('Revisa los extras y toppings: cada fila debe tener nombre, cantidad y precio válidos.');
        return;
      }

      const missingFlavors = items.find(item => {
        const producto = findProductById(item.id);
        return productUsesFlavors(producto) && (!Array.isArray(item.sabores) || !item.sabores.length);
      });

      const invalidFlavorDistribution = items.find(item => {
        const producto = findProductById(item.id);
        if (!productUsesFlavors(producto)) return false;
        const expectedScoops = Number(producto.pelotasPorUnidad || 0) * Number(item.cantidad || 0);
        const assignedScoops = item.sabores.reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
        return assignedScoops !== expectedScoops;
      });

      if (missingFlavors) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'Las líneas de pelotitas deben llevar al menos un sabor seleccionado.';
        showError('Las líneas de pelotitas deben llevar al menos un sabor seleccionado.');
        return;
      }

      if (invalidFlavorDistribution) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'Cada línea debe distribuir exactamente las pelotas que lleva el producto entre los sabores elegidos.';
        showError('Cada línea debe distribuir exactamente las pelotas que lleva el producto entre los sabores elegidos.');
        return;
      }

      try {
        saleStatus.className = 'status';
        saleStatus.textContent = 'Registrando venta...';
        const paymentTypeValue = salePaymentTypeInput.value;
        const paymentMethodValue = paymentTypeValue === 'contado' ? saleCashMethodInput.value : 'credito';
        const dueDateValue = saleDueDateInput.value;
        const totalAmount = salesComposer.calculateSaleTotalAmount();
        const cashReceivedValue = Number(saleCashReceivedInput.value || 0);
        const cashChangeValue = Math.max(cashReceivedValue - totalAmount, 0);
        const cashReferenceValue = saleCashReferenceInput.value.trim();

        if (!setLoadingState(saleForm, true, { label: 'Registrando...' })) {
          return;
        }

        if (!paymentMethodValue) {
          saleStatus.className = 'status error';
          saleStatus.textContent = 'El método de pago es obligatorio.';
          showError('El método de pago es obligatorio.');
          return;
        }

        if (paymentTypeValue === 'contado' && (Number.isNaN(cashReceivedValue) || cashReceivedValue < totalAmount)) {
          saleStatus.className = 'status error';
          saleStatus.textContent = 'En contado, el monto recibido debe cubrir el total de la factura.';
          showError('En contado, el monto recibido debe cubrir el total de la factura.');
          return;
        }

        if (paymentTypeValue === 'contado' && requiresPaymentReference(paymentMethodValue) && !cashReferenceValue) {
          saleStatus.className = 'status error';
          saleStatus.textContent = 'La referencia es obligatoria para tarjeta o transferencia.';
          showError('La referencia es obligatoria para tarjeta o transferencia.');
          return;
        }

        if (paymentTypeValue === 'credito' && !dueDateValue) {
          saleStatus.className = 'status error';
          saleStatus.textContent = 'La fecha de vencimiento es obligatoria para ventas a crédito.';
          showError('La fecha de vencimiento es obligatoria para ventas a crédito.');
          return;
        }

        const response = await fetch(buildApiUrl('/ventas'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documento: documentValue,
            cliente: customerValue,
            fecha: dateValue,
            paymentType: paymentTypeValue,
            paymentMethod: paymentMethodValue,
            dueDate: dueDateValue,
            cashReceived: paymentTypeValue === 'contado' ? cashReceivedValue : null,
            cashChange: paymentTypeValue === 'contado' ? cashChangeValue : null,
            paymentReference: paymentTypeValue === 'contado' ? (cashReferenceValue || null) : null,
            items
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo registrar la venta.');

        saleStatus.textContent = `Venta registrada: ${items.length} productos.`;
  showSuccess(`Venta registrada: ${items.length} productos.`);
        setLastRegisteredSaleForPrint(result.venta || null);
        saleForm.reset();
        saleLines.innerHTML = '';
        salesComposer.addSaleLine();
        applyDefaultDateValues();
        saleDueDateField.classList.add('field-hidden');
        saleCashMethodInput.value = '';
        saleCashReceivedInput.value = '';
        saleCashReferenceInput.value = '';
        saleCajaFloat.classList.add('field-hidden');
        salesComposer.updateSalePaymentSection();
        salesComposer.renderSaleInfo();
        await fetchProductos();
        updateNextSaleDocumentNumber();
        renderSaleRegistro();
        renderSaleReceivables();
      } catch (error) {
        saleStatus.className = 'status error';
        saleStatus.textContent = error.message;
        showError(error.message);
        console.error(error);
      } finally {
        setLoadingState(saleForm, false);
      }
    });

    salesComposer.installListeners();
    openSaleCajaButton.addEventListener('click', () => {
      saleCajaFloat.classList.toggle('field-hidden');
    });
    closeSaleCajaButton.addEventListener('click', () => {
      saleCajaFloat.classList.add('field-hidden');
    });
    saleFilterDocumentInput.addEventListener('input', renderSaleRegistro);
    saleFilterCustomerInput.addEventListener('input', renderSaleRegistro);
    saleFilterProductInput.addEventListener('input', renderSaleRegistro);
    saleFilterMethodInput.addEventListener('change', renderSaleRegistro);
    saleFilterDateModeInput.addEventListener('change', () => {
      updateSaleRegistroDateFilterVisibility();
      renderSaleRegistro();
    });
    saleFilterDateStartInput.addEventListener('change', renderSaleRegistro);
    saleFilterDateEndInput.addEventListener('change', renderSaleRegistro);
    clearSaleFiltersButton.addEventListener('click', () => {
      saleFilterDocumentInput.value = '';
      saleFilterCustomerInput.value = '';
      saleFilterProductInput.value = '';
      saleFilterMethodInput.value = 'all';
      saleFilterDateModeInput.value = 'all';
      updateSaleRegistroDateFilterVisibility();
      saleFilterDateStartInput.value = '';
      saleFilterDateEndInput.value = '';
      renderSaleRegistro();
    });
    exportSaleRegistroExcelButton.addEventListener('click', exportSaleRegistroExcel);
    exportSaleRegistroPdfButton.addEventListener('click', exportSaleRegistroPdf);
    purchaseRecords.addEventListener('click', event => {
      const purchaseButton = event.target.closest('[data-purchase-id]');
      if (!purchaseButton) {
        return;
      }
      const compra = getPurchaseById(purchaseButton.dataset.purchaseId);
      if (!compra) {
        purchaseStatus.className = 'status error';
        purchaseStatus.textContent = 'No se encontró la compra seleccionada.';
        return;
      }
      printPurchaseInvoice(compra);
    });
    printLastSaleButton.addEventListener('click', () => printSaleInvoice());
    saleRecords.addEventListener('click', event => {
      const invoiceButton = event.target.closest('.invoice-link-btn');
      if (!invoiceButton) {
        return;
      }
      const venta = getSaleById(invoiceButton.dataset.saleId);
      if (!venta) {
        saleStatus.className = 'status error';
        saleStatus.textContent = 'No se encontró la factura seleccionada.';
        return;
      }
      printSaleInvoice(venta);
    });
    inventoryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.inventoryTab;
        inventoryTabs.forEach(button => button.classList.toggle('active', button === tab));
        inventorySummaryPanel.classList.toggle('active', tabName === 'summary');
        inventoryKardexPanel.classList.toggle('active', tabName === 'kardex');
        inventoryInitialPanel.classList.toggle('active', tabName === 'initial');
        inventoryAdjustmentsPanel.classList.toggle('active', tabName === 'adjustments');
        renderInventario();
      });
    });
    inventorySummarySearchInput.addEventListener('input', renderInventorySummary);
    inventorySummaryTypeFilterInput.addEventListener('change', renderInventorySummary);
    inventorySummaryMovementFilterInput.addEventListener('change', renderInventorySummary);
    inventorySummaryCutoffDateInput.addEventListener('change', renderInventorySummary);
    exportInventorySummaryExcelButton.addEventListener('click', exportInventorySummaryExcel);
    exportInventorySummaryPdfButton.addEventListener('click', exportInventorySummaryPdf);
    inventoryKardexTypeFilterInput.addEventListener('change', renderInventoryKardex);
    inventoryKardexMovementFilterInput.addEventListener('change', renderInventoryKardex);
    inventoryKardexDateModeInput.addEventListener('change', renderInventoryKardex);
    inventoryKardexDateStartInput.addEventListener('change', renderInventoryKardex);
    inventoryKardexDateEndInput.addEventListener('change', renderInventoryKardex);
    inventoryKardexProductInput.addEventListener('change', renderInventoryKardex);
    exportInventoryKardexExcelButton.addEventListener('click', exportInventoryKardexExcel);
    exportInventoryKardexPdfButton.addEventListener('click', exportInventoryKardexPdf);
    inventoryAdjustmentTypeInput.addEventListener('change', updateInventoryAdjustmentCostVisibility);
    inventoryInitialForm.addEventListener('submit', async event => {
      event.preventDefault();
      setInventoryInitialStatus('Guardando inventario inicial...');
      if (!setLoadingState(inventoryInitialForm, true, { label: 'Guardando...' })) {
        return;
      }
      try {
        const response = await fetch(buildApiUrl('/inventario/inicial'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: inventoryInitialProductInput.value,
            date: inventoryInitialDateInput.value,
            quantity: Number(inventoryInitialQuantityInput.value),
            unitCost: Number(inventoryInitialUnitCostInput.value),
            note: inventoryInitialNoteInput.value.trim()
          })
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo guardar el inventario inicial.'));
        }
        await fetchProductos();
        resetInventoryMovementForms();
        setInventoryInitialStatus('Inventario inicial registrado correctamente.');
        showSuccess('Inventario inicial registrado correctamente.');
      } catch (error) {
        console.error(error);
        setInventoryInitialStatus(error.message, { error: true });
        showError(error.message);
      } finally {
        setLoadingState(inventoryInitialForm, false);
      }
    });
    inventoryAdjustmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      setInventoryAdjustmentStatus('Guardando ajuste de inventario...');
      if (!setLoadingState(inventoryAdjustmentForm, true, { label: 'Guardando...' })) {
        return;
      }
      try {
        const response = await fetch(buildApiUrl('/inventario/ajustes'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: inventoryAdjustmentProductInput.value,
            date: inventoryAdjustmentDateInput.value,
            adjustmentType: inventoryAdjustmentTypeInput.value,
            quantity: Number(inventoryAdjustmentQuantityInput.value),
            unitCost: inventoryAdjustmentTypeInput.value === 'entrada' ? Number(inventoryAdjustmentUnitCostInput.value) : null,
            note: inventoryAdjustmentNoteInput.value.trim()
          })
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo guardar el ajuste de inventario.'));
        }
        await fetchProductos();
        resetInventoryMovementForms();
        setInventoryAdjustmentStatus('Ajuste de inventario registrado correctamente.');
        showSuccess('Ajuste de inventario registrado correctamente.');
      } catch (error) {
        console.error(error);
        setInventoryAdjustmentStatus(error.message, { error: true });
        showError(error.message);
      } finally {
        setLoadingState(inventoryAdjustmentForm, false);
      }
    });
    receivablesFilterDocumentInput.addEventListener('input', renderSaleReceivables);
    receivablesFilterCustomerInput.addEventListener('input', renderSaleReceivables);
    receivablesFilterStatusInput.addEventListener('change', renderSaleReceivables);
    receivablesFilterDateModeInput.addEventListener('change', () => {
      updateReceivablesDateFilterVisibility();
      renderSaleReceivables();
    });
    receivablesFilterDateStartInput.addEventListener('change', renderSaleReceivables);
    receivablesFilterDateEndInput.addEventListener('change', renderSaleReceivables);
    clearReceivablesFiltersButton.addEventListener('click', () => {
      receivablesFilterDocumentInput.value = '';
      receivablesFilterCustomerInput.value = '';
      receivablesFilterStatusInput.value = 'all';
      receivablesFilterDateModeInput.value = 'all';
      updateReceivablesDateFilterVisibility();
      renderSaleReceivables();
    });
    exportReceivablesExcelButton.addEventListener('click', exportReceivablesExcel);
    exportReceivablesPdfButton.addEventListener('click', exportReceivablesPdf);
    if (dashboardCashflowFilterModeInput) {
      dashboardCashflowFilterModeInput.addEventListener('change', () => {
        updateDashboardCashflowFilterVisibility();
        renderDashboard();
      });
    }
    if (dashboardCashflowFilterMonthInput) {
      dashboardCashflowFilterMonthInput.addEventListener('change', renderDashboard);
    }
    if (dashboardCashflowDateStartInput) {
      dashboardCashflowDateStartInput.addEventListener('change', renderDashboard);
    }
    if (dashboardCashflowDateEndInput) {
      dashboardCashflowDateEndInput.addEventListener('change', renderDashboard);
    }
    if (dashboardCashflowClearFiltersButton) {
      dashboardCashflowClearFiltersButton.addEventListener('click', () => {
        if (dashboardCashflowFilterModeInput) {
          dashboardCashflowFilterModeInput.value = 'month';
        }
        if (dashboardCashflowFilterMonthInput) {
          dashboardCashflowFilterMonthInput.value = getCurrentMonthInputValue();
        }
        if (dashboardCashflowDateStartInput) {
          dashboardCashflowDateStartInput.value = getTodayInputValue();
        }
        if (dashboardCashflowDateEndInput) {
          dashboardCashflowDateEndInput.value = getTodayInputValue();
        }
        updateDashboardCashflowFilterVisibility();
        renderDashboard();
      });
    }
    if (dashboardIncomeStatementMonthInput) {
      dashboardIncomeStatementMonthInput.addEventListener('change', renderDashboard);
    }
    if (dashboardIncomeStatementClearButton) {
      dashboardIncomeStatementClearButton.addEventListener('click', () => {
        if (dashboardIncomeStatementMonthInput) {
          dashboardIncomeStatementMonthInput.value = getCurrentMonthInputValue();
        }
        renderDashboard();
      });
    }
    dashboardTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.dashboardTab;
        dashboardTabs.forEach(button => button.classList.toggle('active', button === tab));
        dashboardOverviewPanel.classList.toggle('active', tabName === 'overview');
        dashboardCashflowPanel.classList.toggle('active', tabName === 'cashflow');
        dashboardIncomeStatementPanel.classList.toggle('active', tabName === 'income-statement');
      });
    });
    saleTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.saleTab;
        saleTabs.forEach(button => button.classList.toggle('active', button === tab));
        saleNewPanel.classList.toggle('active', tabName === 'new');
        saleRegistroPanel.classList.toggle('active', tabName === 'registro');
        saleReceivablesPanel.classList.toggle('active', tabName === 'receivables');
      });
    });

    paymentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        fecha: paymentDateInput.value,
        categoriaId: paymentCategoryInput.value,
        paymentMethod: paymentMethodInput.value,
        monto: Number(paymentAmountInput.value),
        descripcion: paymentDescriptionInput.value.trim(),
        beneficiario: paymentBeneficiaryInput.value.trim(),
        referencia: paymentReferenceInput.value.trim(),
        observacion: paymentNoteInput.value.trim()
      };

      if (!payload.fecha || !payload.categoriaId || !payload.descripcion || Number.isNaN(payload.monto) || payload.monto <= 0) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'Completa correctamente la fecha, clasificación, descripción y monto del pago.';
        showError('Completa correctamente la fecha, clasificación, descripción y monto del pago.');
        return;
      }

      if (payload.paymentMethod === 'transferencia' && !payload.referencia) {
        paymentStatus.className = 'status error';
        paymentStatus.textContent = 'La referencia es obligatoria para pagos por transferencia.';
        showError('La referencia es obligatoria para pagos por transferencia.');
        return;
      }

      try {
        const editingPaymentId = getEditingPaymentId();
        const isEditingPayment = Boolean(editingPaymentId);
        if (!setLoadingState(paymentForm, true, { label: isEditingPayment ? 'Guardando...' : 'Registrando...' })) {
          return;
        }
        paymentStatus.className = 'status';
        paymentStatus.textContent = isEditingPayment ? 'Actualizando pago...' : 'Registrando pago...';
        const response = await fetch(buildApiUrl(isEditingPayment ? `/pagos/${encodeURIComponent(editingPaymentId)}` : '/pagos'), {
          method: isEditingPayment ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo registrar el pago.'));
        }
        const result = await response.json();

        resetPaymentFormEditing();
        setLastRegisteredPaymentForPrint(result.payment || null);
        await fetchPayments();
        const successMessage = result.message || (isEditingPayment
          ? 'Pago actualizado correctamente.'
          : payload.paymentMethod === 'tarjeta-credito'
            ? 'Pago con tarjeta registrado como pendiente de reembolso.'
            : 'Pago registrado correctamente.');
        paymentStatus.textContent = successMessage;
        showSuccess(successMessage);
        if (payload.paymentMethod === 'efectivo' && result.payment) {
          printPaymentReceipt(result.payment, { autoPrint: true });
        }
      } catch (error) {
        console.error(error);
        paymentStatus.className = 'status error';
        paymentStatus.textContent = error.message;
        showError(error.message);
      } finally {
        setLoadingState(paymentForm, false);
      }
    });

    paymentMethodInput.addEventListener('change', updatePaymentMethodSection);
    if (cancelPaymentEditButton) {
      cancelPaymentEditButton.addEventListener('click', () => {
        resetPaymentFormEditing();
        paymentStatus.className = 'status';
        paymentStatus.textContent = 'Registra aquí los egresos operativos y administrativos del negocio.';
      });
    }
    paymentFilterDescriptionInput.addEventListener('input', renderPaymentRegistro);
    paymentFilterCategoryInput.addEventListener('change', renderPaymentRegistro);
    paymentFilterMethodInput.addEventListener('change', renderPaymentRegistro);
    paymentFilterStatusInput.addEventListener('change', renderPaymentRegistro);
    clearPaymentFiltersButton.addEventListener('click', () => {
      paymentFilterDescriptionInput.value = '';
      paymentFilterCategoryInput.value = 'all';
      paymentFilterMethodInput.value = 'all';
      paymentFilterStatusInput.value = 'all';
      renderPaymentRegistro();
    });

    paymentTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.paymentTab;
        paymentTabs.forEach(button => button.classList.toggle('active', button === tab));
        paymentNewPanel.classList.toggle('active', tabName === 'new');
        paymentRegistroPanel.classList.toggle('active', tabName === 'registro');
        paymentPendingPanel.classList.toggle('active', tabName === 'pending');
        paymentCatalogPanel.classList.toggle('active', tabName === 'catalog');
      });
    });

    fundTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.fundTab;
        fundTabs.forEach(button => button.classList.toggle('active', button === tab));
        fundOverviewPanel.classList.toggle('field-hidden', tabName === 'external');
        fundCashPanel.classList.toggle('active', tabName === 'cash');
        fundBankPanel.classList.toggle('active', tabName === 'bank');
        fundExternalPanel.classList.toggle('active', tabName === 'external');
      });
    });

    if (externalDebtForm) {
      externalDebtForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
          type: externalDebtTypeInput.value,
          categoria: externalDebtCategoryInput.value,
          fecha: externalDebtDateInput.value,
          dueDate: externalDebtDueDateInput.value || null,
          originalAmount: Number(externalDebtAmountInput.value || 0),
          tercero: externalDebtPartyInput.value.trim(),
          concepto: externalDebtConceptInput.value.trim(),
          observacion: externalDebtNoteInput.value.trim()
        };

        if (!payload.fecha || !payload.tercero || !payload.concepto || Number.isNaN(payload.originalAmount) || payload.originalAmount <= 0) {
          setExternalDebtStatus('Completa fecha, tercero, concepto y un monto válido.', { error: true });
          showError('Completa fecha, tercero, concepto y un monto válido.');
          return;
        }

        try {
          const editingExternalDebtId = getEditingExternalDebtId();
          const isEditingExternalDebt = Boolean(editingExternalDebtId);
          if (!setLoadingState(externalDebtForm, true, { label: isEditingExternalDebt ? 'Guardando...' : 'Guardando...' })) {
            return;
          }
          setExternalDebtStatus(isEditingExternalDebt ? 'Actualizando deuda externa...' : 'Guardando deuda externa...');
          const response = await fetch(buildApiUrl(isEditingExternalDebt ? `/deudas-externas/${encodeURIComponent(editingExternalDebtId)}` : '/deudas-externas'), {
            method: isEditingExternalDebt ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            throw new Error(await buildApiError(response, isEditingExternalDebt ? 'No se pudo actualizar la deuda externa.' : 'No se pudo registrar la deuda externa.'));
          }
          resetExternalDebtFormEditing();
          await fetchExternalDebts();
          setExternalDebtStatus(isEditingExternalDebt ? 'Deuda externa actualizada correctamente.' : 'Deuda externa registrada correctamente.');
          showSuccess(isEditingExternalDebt ? 'Deuda externa actualizada correctamente.' : 'Deuda externa registrada correctamente.');
        } catch (error) {
          console.error(error);
          setExternalDebtStatus(error.message, { error: true });
          showError(error.message);
        } finally {
          setLoadingState(externalDebtForm, false);
        }
      });
    }

    if (cancelExternalDebtEditButton) {
      cancelExternalDebtEditButton.addEventListener('click', () => {
        resetExternalDebtFormEditing();
        setExternalDebtStatus('Registra deudas externas o cuentas por cobrar fuera del flujo comercial habitual.');
      });
    }

    if (externalDebtPaymentForm) {
      externalDebtPaymentForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payingExternalDebtId = getPayingExternalDebtId();
        if (!payingExternalDebtId) {
          setExternalDebtPaymentStatus('Selecciona una deuda externa válida.', { error: true });
          showError('Selecciona una deuda externa válida.');
          return;
        }
        const payload = {
          account: externalDebtPaymentAccountInput.value,
          date: externalDebtPaymentDateInput.value,
          amount: Number(externalDebtPaymentAmountInput.value || 0),
          paymentReference: externalDebtPaymentReferenceInput.value.trim(),
          note: externalDebtPaymentNoteInput.value.trim(),
          paymentEntryId: getEditingExternalDebtPaymentEntryId() || null
        };

        if (!payload.account || !payload.date || Number.isNaN(payload.amount) || payload.amount <= 0) {
          setExternalDebtPaymentStatus('Completa cuenta, fecha y un monto válido para el abono.', { error: true });
          showError('Completa cuenta, fecha y un monto válido para el abono.');
          return;
        }

        try {
          if (!setLoadingState(externalDebtPaymentForm, true, { label: 'Registrando...' })) {
            return;
          }
          setExternalDebtPaymentStatus('Registrando abono...');
          const response = await fetch(buildApiUrl(`/deudas-externas/${encodeURIComponent(payingExternalDebtId)}/abonos`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            throw new Error(await buildApiError(response, 'No se pudo registrar el abono de la deuda externa.'));
          }
          const result = await response.json();
          const updatedDebt = result.debt || null;
          const latestPayment = updatedDebt ? getLastRecordPayment(updatedDebt, getExternalDebtOriginalAmount(updatedDebt)) : null;
          await fetchExternalDebts();
          closeExternalDebtPaymentModalPanel();
          const successMessage = result.message || 'Abono registrado correctamente en la deuda externa.';
          setExternalDebtStatus(successMessage);
          showSuccess(successMessage);
          if (latestPayment) {
            printExternalDebtReceipt(updatedDebt, latestPayment, { autoPrint: true });
          }
        } catch (error) {
          console.error(error);
          setExternalDebtPaymentStatus(error.message, { error: true });
          showError(error.message);
        } finally {
          setLoadingState(externalDebtPaymentForm, false);
        }
      });
    }

    paymentCategoryForm.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        nombre: paymentCategoryNameInput.value.trim(),
        descripcion: paymentCategoryDescriptionInput.value.trim(),
        originalId: getEditingPaymentCategoryId() || undefined
      };

      if (!payload.nombre) {
        paymentCategoryStatus.className = 'status error';
        paymentCategoryStatus.textContent = 'El nombre de la clasificación es obligatorio.';
        showError('El nombre de la clasificación es obligatorio.');
        return;
      }

      try {
        if (!setLoadingState(paymentCategoryForm, true, { label: 'Guardando...' })) {
          return;
        }
        paymentCategoryStatus.className = 'status';
        paymentCategoryStatus.textContent = getEditingPaymentCategoryId() ? 'Actualizando clasificación...' : 'Guardando clasificación...';
        const response = await fetch(buildApiUrl('/pagos-categorias'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo guardar la clasificación.'));
        }
        resetPaymentCategoryForm();
        await Promise.all([fetchPaymentCategories(), fetchPayments()]);
        paymentCategoryStatus.textContent = 'Clasificación guardada correctamente.';
        showSuccess('Clasificación guardada correctamente.');
      } catch (error) {
        console.error(error);
        paymentCategoryStatus.className = 'status error';
        paymentCategoryStatus.textContent = error.message;
        showError(error.message);
      } finally {
        setLoadingState(paymentCategoryForm, false);
      }
    });

    cancelPaymentCategoryEditButton.addEventListener('click', () => {
      resetPaymentCategoryForm();
      paymentCategoryStatus.className = 'status';
      paymentCategoryStatus.textContent = 'Crea aquí el catálogo para clasificar cada pago.';
    });

    if (openPaymentReimbursementBatchButton) {
      openPaymentReimbursementBatchButton.addEventListener('click', openPaymentReimbursementModalPanel);
    }
    paymentReimbursementForm.addEventListener('submit', async event => {
      event.preventDefault();
      const paymentIds = getSelectedPendingPaymentIds().filter(id => state.payments.some(payment => String(payment.id) === String(id) && isPendingCardPayment(payment)));
      if (!paymentIds.length) {
        paymentReimbursementStatus.className = 'status error';
        paymentReimbursementStatus.textContent = 'Selecciona al menos un pago pendiente para registrar el reembolso.';
        showError('Selecciona al menos un pago pendiente para registrar el reembolso.');
        return;
      }

      try {
        if (!setLoadingState(paymentReimbursementForm, true, { label: 'Registrando...' })) {
          return;
        }
        paymentReimbursementStatus.className = 'status';
        paymentReimbursementStatus.textContent = 'Registrando transferencia...';
        const response = await fetch(buildApiUrl('/pagos/reembolsar-lote'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIds,
            reimbursedAt: paymentReimbursementDateInput.value,
            reimbursementReference: paymentReimbursementReferenceInput.value.trim()
          })
        });
        if (!response.ok) {
          throw new Error(await buildApiError(response, 'No se pudo registrar el reembolso.'));
        }
        closePaymentReimbursementModalPanel();
        clearSelectedPendingPaymentIds();
        await fetchPayments();
        paymentStatus.className = 'status';
        paymentStatus.textContent = paymentIds.length === 1
          ? 'Reembolso por transferencia registrado correctamente.'
          : `Transferencia registrada correctamente para ${paymentIds.length} pagos.`;
        showSuccess(paymentStatus.textContent);
      } catch (error) {
        console.error(error);
        paymentReimbursementStatus.className = 'status error';
        paymentReimbursementStatus.textContent = error.message;
        showError(error.message);
      } finally {
        setLoadingState(paymentReimbursementForm, false);
      }
    });

    if (fundTransferForm) {
      fundTransferForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
          fecha: fundTransferDateInput.value,
          fromAccount: fundTransferFromInput.value,
          toAccount: fundTransferToInput.value,
          amount: Number(fundTransferAmountInput.value),
          description: fundTransferDescriptionInput.value.trim(),
          reference: fundTransferReferenceInput.value.trim(),
          note: fundTransferNoteInput.value.trim()
        };

        if (!payload.fecha || !payload.fromAccount || !payload.toAccount || Number.isNaN(payload.amount) || payload.amount <= 0 || !payload.description) {
          fundTransferStatus.className = 'status error';
          fundTransferStatus.textContent = 'Completa correctamente la fecha, cuentas, descripción y monto del traslado.';
          showError('Completa correctamente la fecha, cuentas, descripción y monto del traslado.');
          return;
        }
        if (payload.fromAccount === payload.toAccount) {
          fundTransferStatus.className = 'status error';
          fundTransferStatus.textContent = 'El origen y el destino del traslado deben ser distintos.';
          showError('El origen y el destino del traslado deben ser distintos.');
          return;
        }

        try {
          if (!setLoadingState(fundTransferForm, true, { label: 'Registrando...' })) {
            return;
          }
          fundTransferStatus.className = 'status';
          fundTransferStatus.textContent = 'Registrando traslado...';
          const response = await fetch(buildApiUrl('/efectivo/traslados'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            throw new Error(await buildApiError(response, 'No se pudo registrar el traslado de fondos.'));
          }
          fundTransferForm.reset();
          applyDefaultDateValues();
          await fetchFundTransfers();
          fundTransferStatus.textContent = 'Traslado de fondos registrado correctamente.';
          showSuccess('Traslado de fondos registrado correctamente.');
        } catch (error) {
          console.error(error);
          fundTransferStatus.className = 'status error';
          fundTransferStatus.textContent = error.message;
          showError(error.message);
        } finally {
          setLoadingState(fundTransferForm, false);
        }
      });
    }

    if (fundSettingsForm) {
      fundSettingsForm.addEventListener('submit', async event => {
        event.preventDefault();

        const openingCashBalance = Number(fundOpeningCashInput.value || 0);
        const openingBankBalance = Number(fundOpeningBankInput.value || 0);
        const minimumCashReserve = Number(fundMinimumCashInput.value || 0);

        if ([openingCashBalance, openingBankBalance, minimumCashReserve].some(value => Number.isNaN(value) || value < 0)) {
          fundSettingsStatus.className = 'status error';
          fundSettingsStatus.textContent = 'Los saldos iniciales y el fondo mínimo deben ser mayores o iguales a cero.';
          showError('Los saldos iniciales y el fondo mínimo deben ser mayores o iguales a cero.');
          return;
        }

        try {
          if (!setLoadingState(fundSettingsForm, true, { label: 'Guardando...' })) {
            return;
          }
          fundSettingsStatus.className = 'status';
          fundSettingsStatus.textContent = 'Guardando configuración...';
          const response = await fetch(buildApiUrl('/efectivo/configuracion'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openingCashBalance,
              openingBankBalance,
              minimumCashReserve
            })
          });
          const result = await readApiResponse(response);
          if (!response.ok) {
            throw new Error(result.error || 'No se pudo guardar la configuración de efectivo y bancos.');
          }

          state.fundSettings = result.settings && typeof result.settings === 'object' ? result.settings : getDefaultFundSettings();
          renderFundsModule();
          fundSettingsStatus.textContent = result.message || 'Configuración guardada correctamente.';
          showSuccess(fundSettingsStatus.textContent);
        } catch (error) {
          fundSettingsStatus.className = 'status error';
          fundSettingsStatus.textContent = error.message;
          showError(error.message);
        } finally {
          setLoadingState(fundSettingsForm, false);
        }
      });
    }

    flavorModuleTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.flavorModuleTab;
        flavorModuleTabs.forEach(button => button.classList.toggle('active', button === tab));
        flavorModuleFlavorsPanel.classList.toggle('active', tabName === 'flavors');
        flavorModuleToppingsPanel.classList.toggle('active', tabName === 'toppings');
        flavorModuleSaucesPanel.classList.toggle('active', tabName === 'sauces');
      });
    });

    applyTheme(getSavedTheme());
    setActiveTab(state.activeTab);
    applyDefaultDateValues();
    updateDashboardCashflowFilterVisibility();
    setLastRegisteredSaleForPrint(null);
    updatePurchasePaymentSection();
    updatePurchaseRegistroDateFilterVisibility();
    updatePayablesDateFilterVisibility();
    salesComposer.updateSalePaymentSection();
    updateSaleRegistroDateFilterVisibility();
    updateReceivablesDateFilterVisibility();
    updatePaymentMethodSection();
    resetPaymentCategoryForm();
    resetInventoryMovementForms();
    bindMoneyNormalization();
    initializeAuthentication();





