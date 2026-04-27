export function getDomRefs() {
  const statusText = document.getElementById('status-text');
  const loadingText = document.createElement('p');
  loadingText.className = 'loading';
  loadingText.textContent = 'Cargando productos...';
  document.querySelector('.panel').appendChild(loadingText);

  const tabs = document.querySelectorAll('.module-tab');
  const modulePanels = document.querySelectorAll('.module-panel');
  const productForm = document.getElementById('product-form');
  const purchaseForm = document.getElementById('purchase-form');
  const saleForm = document.getElementById('sale-form');
  const ingresoProductFormPanel = document.querySelector('.ingreso-product-form');
  const productModal = document.getElementById('product-modal');
  const productModalTitle = document.getElementById('product-modal-title');
  const productFormStatus = document.getElementById('product-form-status');
  const openProductModalButton = document.getElementById('open-product-modal');
  const closeProductModalButton = document.getElementById('close-product-modal');
  const productPickerModal = document.getElementById('product-picker-modal');
  const productPickerTitle = document.getElementById('product-picker-title');
  const closeProductPickerModalButton = document.getElementById('close-product-picker-modal');
  const productPickerSearchInput = document.getElementById('product-picker-search');
  const productPickerList = document.getElementById('product-picker-list');
  const productSearchInput = document.getElementById('product-search');
  const purchaseStatus = document.getElementById('purchase-status');
  const saleStatus = document.getElementById('sale-status');
  const purchaseDocumentInput = document.getElementById('purchase-document');
  const purchaseSupplierInput = document.getElementById('purchase-supplier');
  const purchaseDateInput = document.getElementById('purchase-date');
  const purchasePaymentTypeInput = document.getElementById('purchase-payment-type');
  const purchaseDueDateField = document.getElementById('purchase-due-date-field');
  const purchaseDueDateInput = document.getElementById('purchase-due-date');
  const openCajaButton = document.getElementById('open-caja');
  const closeCajaButton = document.getElementById('close-caja');
  const purchaseCajaFloat = document.getElementById('purchase-caja-float');
  const purchasePaymentSummary = document.getElementById('purchase-payment-summary');
  const cashMethodInput = document.getElementById('cash-method');
  const cashTotalText = document.getElementById('cash-total');
  const cashOutInput = document.getElementById('cash-out');
  const cashReferenceRow = document.getElementById('cash-reference-row');
  const cashReferenceInput = document.getElementById('cash-reference');
  const purchaseInfo = document.getElementById('purchase-info');
  const purchaseTotal = document.getElementById('purchase-total');
  const purchaseRecords = document.getElementById('purchase-records');
  const purchaseLines = document.getElementById('purchase-lines');
  const addPurchaseLineButton = document.getElementById('add-purchase-line');
  const purchaseTabs = document.querySelectorAll('#module-compras .purchase-tab');
  const purchaseNewPanel = document.getElementById('purchase-new');
  const purchaseRegistroPanel = document.getElementById('purchase-registro');
  const purchasePayablesPanel = document.getElementById('purchase-payables');
  const filterDocumentInput = document.getElementById('filter-document');
  const filterSupplierInput = document.getElementById('filter-supplier');
  const filterProductInput = document.getElementById('filter-product');
  const filterMethodInput = document.getElementById('filter-method');
  const filterDateModeInput = document.getElementById('filter-date-mode');
  const filterDateStartField = document.getElementById('filter-date-start-field');
  const filterDateEndField = document.getElementById('filter-date-end-field');
  const filterDateStartInput = document.getElementById('filter-date-start');
  const filterDateEndInput = document.getElementById('filter-date-end');
  const clearFiltersButton = document.getElementById('clear-filters');
  const exportRegistroExcelButton = document.getElementById('export-registro-excel');
  const exportRegistroPdfButton = document.getElementById('export-registro-pdf');
  const payablesCount = document.getElementById('payables-count');
  const payablesOverdue = document.getElementById('payables-overdue');
  const payablesTotal = document.getElementById('payables-total');
  const payablesFilterDocumentInput = document.getElementById('payables-filter-document');
  const payablesFilterSupplierInput = document.getElementById('payables-filter-supplier');
  const payablesFilterStatusInput = document.getElementById('payables-filter-status');
  const payablesFilterDateModeInput = document.getElementById('payables-filter-date-mode');
  const payablesFilterDateStartField = document.getElementById('payables-filter-date-start-field');
  const payablesFilterDateEndField = document.getElementById('payables-filter-date-end-field');
  const payablesFilterDateStartInput = document.getElementById('payables-filter-date-start');
  const payablesFilterDateEndInput = document.getElementById('payables-filter-date-end');
  const clearPayablesFiltersButton = document.getElementById('clear-payables-filters');
  const exportPayablesExcelButton = document.getElementById('export-payables-excel');
  const exportPayablesPdfButton = document.getElementById('export-payables-pdf');
  const purchasePayablesReport = document.getElementById('purchase-payables-report');
  const purchasePayableModal = document.getElementById('purchase-payable-modal');
  const purchasePayableModalTitle = document.getElementById('purchase-payable-modal-title');
  const closePurchasePayableModalButton = document.getElementById('close-purchase-payable-modal');
  const purchasePayableForm = document.getElementById('purchase-payable-form');
  const purchasePayableMethodInput = document.getElementById('purchase-payable-method');
  const purchasePayableDateInput = document.getElementById('purchase-payable-date');
  const purchasePayableAmountInput = document.getElementById('purchase-payable-amount');
  const purchasePayableReferenceField = document.getElementById('purchase-payable-reference-field');
  const purchasePayableReferenceInput = document.getElementById('purchase-payable-reference');
  const purchasePayableSummary = document.getElementById('purchase-payable-summary');
  const purchasePayableHistory = document.getElementById('purchase-payable-history');
  const purchasePayableStatus = document.getElementById('purchase-payable-status');
  const submitPurchasePayableButton = document.getElementById('submit-purchase-payable');
  const saleDocumentInput = document.getElementById('sale-document');
  const saleCustomerInput = document.getElementById('sale-customer');
  const saleDateInput = document.getElementById('sale-date');
  const salePaymentTypeInput = document.getElementById('sale-payment-type');
  const saleDueDateField = document.getElementById('sale-due-date-field');
  const saleDueDateInput = document.getElementById('sale-due-date');
  const openSaleCajaButton = document.getElementById('open-sale-caja');
  const closeSaleCajaButton = document.getElementById('close-sale-caja');
  const saleCajaFloat = document.getElementById('sale-caja-float');
  const salePaymentSummary = document.getElementById('sale-payment-summary');
  const saleCashMethodInput = document.getElementById('sale-cash-method');
  const saleCashTotalText = document.getElementById('sale-cash-total');
  const saleCashReceivedInput = document.getElementById('sale-cash-received');
  const saleCashChangeText = document.getElementById('sale-cash-change');
  const saleCashReferenceRow = document.getElementById('sale-cash-reference-row');
  const saleCashReferenceInput = document.getElementById('sale-cash-reference');
  const salePrintActions = document.getElementById('sale-print-actions');
  const salePrintSummary = document.getElementById('sale-print-summary');
  const printLastSaleButton = document.getElementById('print-last-sale');
  const saleInfo = document.getElementById('sale-info');
  const saleTotal = document.getElementById('sale-total');
  const saleLines = document.getElementById('sale-lines');
  const addSaleLineButton = document.getElementById('add-sale-line');
  const addSaleExtraButton = document.getElementById('add-sale-extra');
  const saleExtraCatalog = document.getElementById('sale-extra-catalog');
  const saleTabs = document.querySelectorAll('.sale-tab');
  const saleNewPanel = document.getElementById('sale-new');
  const saleRegistroPanel = document.getElementById('sale-registro');
  const saleReceivablesPanel = document.getElementById('sale-receivables');
  const saleFilterDocumentInput = document.getElementById('sale-filter-document');
  const saleFilterCustomerInput = document.getElementById('sale-filter-customer');
  const saleFilterProductInput = document.getElementById('sale-filter-product');
  const saleFilterMethodInput = document.getElementById('sale-filter-method');
  const saleFilterDateModeInput = document.getElementById('sale-filter-date-mode');
  const saleFilterDateStartField = document.getElementById('sale-filter-date-start-field');
  const saleFilterDateEndField = document.getElementById('sale-filter-date-end-field');
  const saleFilterDateStartInput = document.getElementById('sale-filter-date-start');
  const saleFilterDateEndInput = document.getElementById('sale-filter-date-end');
  const clearSaleFiltersButton = document.getElementById('clear-sale-filters');
  const exportSaleRegistroExcelButton = document.getElementById('export-sale-registro-excel');
  const exportSaleRegistroPdfButton = document.getElementById('export-sale-registro-pdf');
  const saleRecords = document.getElementById('sale-records');
  const receivablesCount = document.getElementById('receivables-count');
  const receivablesOverdue = document.getElementById('receivables-overdue');
  const receivablesTotal = document.getElementById('receivables-total');
  const receivablesFilterDocumentInput = document.getElementById('receivables-filter-document');
  const receivablesFilterCustomerInput = document.getElementById('receivables-filter-customer');
  const receivablesFilterStatusInput = document.getElementById('receivables-filter-status');
  const receivablesFilterDateModeInput = document.getElementById('receivables-filter-date-mode');
  const receivablesFilterDateStartField = document.getElementById('receivables-filter-date-start-field');
  const receivablesFilterDateEndField = document.getElementById('receivables-filter-date-end-field');
  const receivablesFilterDateStartInput = document.getElementById('receivables-filter-date-start');
  const receivablesFilterDateEndInput = document.getElementById('receivables-filter-date-end');
  const clearReceivablesFiltersButton = document.getElementById('clear-receivables-filters');
  const exportReceivablesExcelButton = document.getElementById('export-receivables-excel');
  const exportReceivablesPdfButton = document.getElementById('export-receivables-pdf');
  const saleReceivablesReport = document.getElementById('sale-receivables-report');
  const salePayableModal = document.getElementById('sale-payable-modal');
  const salePayableModalTitle = document.getElementById('sale-payable-modal-title');
  const closeSalePayableModalButton = document.getElementById('close-sale-payable-modal');
  const salePayableForm = document.getElementById('sale-payable-form');
  const salePayableMethodInput = document.getElementById('sale-payable-method');
  const salePayableDateInput = document.getElementById('sale-payable-date');
  const salePayableAmountInput = document.getElementById('sale-payable-amount');
  const salePayableReferenceField = document.getElementById('sale-payable-reference-field');
  const salePayableReferenceInput = document.getElementById('sale-payable-reference');
  const salePayableSummary = document.getElementById('sale-payable-summary');
  const salePayableHistory = document.getElementById('sale-payable-history');
  const salePayableStatus = document.getElementById('sale-payable-status');
  const submitSalePayableButton = document.getElementById('submit-sale-payable');
  const paymentForm = document.getElementById('payment-form');
  const paymentDateInput = document.getElementById('payment-date');
  const paymentCategoryInput = document.getElementById('payment-category');
  const paymentMethodInput = document.getElementById('payment-method');
  const paymentAmountInput = document.getElementById('payment-amount');
  const paymentDescriptionInput = document.getElementById('payment-description');
  const paymentBeneficiaryInput = document.getElementById('payment-beneficiary');
  const paymentReferenceField = document.getElementById('payment-reference-field');
  const paymentReferenceInput = document.getElementById('payment-reference');
  const paymentNoteInput = document.getElementById('payment-note');
  const paymentSubmitButton = paymentForm?.querySelector('button[type="submit"]');
  const cancelPaymentEditButton = document.getElementById('cancel-payment-edit');
  const paymentMethodSummary = document.getElementById('payment-method-summary');
  const paymentStatus = document.getElementById('payment-status');
  const paymentInfo = document.getElementById('payment-info');
  const paymentTabs = document.querySelectorAll('.payment-tab');
  const paymentNewPanel = document.getElementById('payment-new');
  const paymentRegistroPanel = document.getElementById('payment-registro');
  const paymentPendingPanel = document.getElementById('payment-pending');
  const openPaymentReimbursementBatchButton = document.getElementById('open-payment-reimbursement-batch');
  const paymentCatalogPanel = document.getElementById('payment-catalog');
  const paymentFilterDescriptionInput = document.getElementById('payment-filter-description');
  const paymentFilterCategoryInput = document.getElementById('payment-filter-category');
  const paymentFilterMethodInput = document.getElementById('payment-filter-method');
  const paymentFilterStatusInput = document.getElementById('payment-filter-status');
  const clearPaymentFiltersButton = document.getElementById('clear-payment-filters');
  const paymentRecords = document.getElementById('payment-records');
  const paymentPendingRecords = document.getElementById('payment-pending-records');
  const paymentCategoryForm = document.getElementById('payment-category-form');
  const paymentCategoryNameInput = document.getElementById('payment-category-name');
  const paymentCategoryDescriptionInput = document.getElementById('payment-category-description');
  const paymentCategorySubmitButton = document.getElementById('payment-category-submit');
  const cancelPaymentCategoryEditButton = document.getElementById('cancel-payment-category-edit');
  const paymentCategoryStatus = document.getElementById('payment-category-status');
  const paymentCategoryList = document.getElementById('payment-category-list');
  const paymentReimbursementModal = document.getElementById('payment-reimbursement-modal');
  const closePaymentReimbursementModalButton = document.getElementById('close-payment-reimbursement-modal');
  const paymentReimbursementForm = document.getElementById('payment-reimbursement-form');
  const paymentReimbursementDateInput = document.getElementById('payment-reimbursement-date');
  const paymentReimbursementReferenceInput = document.getElementById('payment-reimbursement-reference');
  const paymentReimbursementSelectionSummary = document.getElementById('payment-reimbursement-selection-summary');
  const paymentReimbursementStatus = document.getElementById('payment-reimbursement-status');
  const fundTabs = document.querySelectorAll('.fund-tab');
  const fundCashPanel = document.getElementById('fund-cash-panel');
  const fundBankPanel = document.getElementById('fund-bank-panel');
  const fundExternalPanel = document.getElementById('fund-external-panel');
  const fundOverviewPanel = document.getElementById('fund-overview-panel');
  const fundCashBalance = document.getElementById('fund-cash-balance');
  const fundCashMinimum = document.getElementById('fund-cash-minimum');
  const fundCashAvailable = document.getElementById('fund-cash-available');
  const fundBankBalance = document.getElementById('fund-bank-balance');
  const fundCashReserveNote = document.getElementById('fund-cash-reserve-note');
  const fundSettingsForm = document.getElementById('fund-settings-form');
  const fundOpeningCashInput = document.getElementById('fund-opening-cash');
  const fundOpeningBankInput = document.getElementById('fund-opening-bank');
  const fundMinimumCashInput = document.getElementById('fund-minimum-cash');
  const fundSettingsStatus = document.getElementById('fund-settings-status');
  const fundTransferForm = document.getElementById('fund-transfer-form');
  const fundTransferDateInput = document.getElementById('fund-transfer-date');
  const fundTransferFromInput = document.getElementById('fund-transfer-from');
  const fundTransferToInput = document.getElementById('fund-transfer-to');
  const fundTransferAmountInput = document.getElementById('fund-transfer-amount');
  const fundTransferDescriptionInput = document.getElementById('fund-transfer-description');
  const fundTransferReferenceInput = document.getElementById('fund-transfer-reference');
  const fundTransferNoteInput = document.getElementById('fund-transfer-note');
  const fundTransferStatus = document.getElementById('fund-transfer-status');
  const fundCashRecords = document.getElementById('fund-cash-records');
  const fundBankRecords = document.getElementById('fund-bank-records');
  const externalDebtForm = document.getElementById('external-debt-form');
  const externalDebtTypeInput = document.getElementById('external-debt-type');
  const externalDebtCategoryInput = document.getElementById('external-debt-category');
  const externalDebtDateInput = document.getElementById('external-debt-date');
  const externalDebtDueDateInput = document.getElementById('external-debt-due-date');
  const externalDebtAmountInput = document.getElementById('external-debt-amount');
  const externalDebtPartyInput = document.getElementById('external-debt-party');
  const externalDebtConceptInput = document.getElementById('external-debt-concept');
  const externalDebtNoteInput = document.getElementById('external-debt-note');
  const externalDebtSubmitButton = externalDebtForm?.querySelector('button[type="submit"]');
  const cancelExternalDebtEditButton = document.getElementById('cancel-external-debt-edit');
  const externalDebtStatus = document.getElementById('external-debt-status');
  const externalPayablesBalance = document.getElementById('external-payables-balance');
  const externalReceivablesBalance = document.getElementById('external-receivables-balance');
  const externalDebtsOverdue = document.getElementById('external-debts-overdue');
  const externalPayablesRecords = document.getElementById('external-payables-records');
  const externalReceivablesRecords = document.getElementById('external-receivables-records');
  const externalDebtPaymentModal = document.getElementById('external-debt-payment-modal');
  const closeExternalDebtPaymentModalButton = document.getElementById('close-external-debt-payment-modal');
  const externalDebtPaymentModalTitle = document.getElementById('external-debt-payment-modal-title');
  const externalDebtPaymentForm = document.getElementById('external-debt-payment-form');
  const externalDebtPaymentSummary = document.getElementById('external-debt-payment-summary');
  const externalDebtPaymentAccountInput = document.getElementById('external-debt-payment-account');
  const externalDebtPaymentDateInput = document.getElementById('external-debt-payment-date');
  const externalDebtPaymentAmountInput = document.getElementById('external-debt-payment-amount');
  const externalDebtPaymentReferenceInput = document.getElementById('external-debt-payment-reference');
  const externalDebtPaymentNoteInput = document.getElementById('external-debt-payment-note');
  const externalDebtPaymentHistory = document.getElementById('external-debt-payment-history');
  const externalDebtPaymentStatus = document.getElementById('external-debt-payment-status');
  const submitExternalDebtPaymentButton = document.getElementById('submit-external-debt-payment');
  const dashboardTabs = document.querySelectorAll('.dashboard-tab');
  const dashboardOverviewPanel = document.getElementById('dashboard-overview-panel');
  const dashboardCashflowPanel = document.getElementById('dashboard-cashflow-panel');
  const dashboardIncomeStatementPanel = document.getElementById('dashboard-income-statement-panel');
  const dashboardSummaryText = document.getElementById('dashboard-summary-text');
  const dashboardCashFlowSummary = document.getElementById('dashboard-cash-flow-summary');
  const dashboardIncomeStatementSummary = document.getElementById('dashboard-income-statement-summary');
  const dashboardCashflowFilterModeInput = document.getElementById('dashboard-cashflow-filter-mode');
  const dashboardCashflowMonthField = document.getElementById('dashboard-cashflow-month-field');
  const dashboardCashflowFilterMonthInput = document.getElementById('dashboard-cashflow-filter-month');
  const dashboardCashflowDateStartField = document.getElementById('dashboard-cashflow-date-start-field');
  const dashboardCashflowDateEndField = document.getElementById('dashboard-cashflow-date-end-field');
  const dashboardCashflowDateStartInput = document.getElementById('dashboard-cashflow-date-start');
  const dashboardCashflowDateEndInput = document.getElementById('dashboard-cashflow-date-end');
  const dashboardCashflowClearFiltersButton = document.getElementById('dashboard-cashflow-clear-filters');
  const dashboardIncomeStatementMonthInput = document.getElementById('dashboard-income-statement-month');
  const dashboardIncomeStatementClearButton = document.getElementById('dashboard-income-statement-clear');
  const dashboardLastUpdated = document.getElementById('dashboard-last-updated');
  const dashboardSalesToday = document.getElementById('dashboard-sales-today');
  const dashboardSalesTodayMeta = document.getElementById('dashboard-sales-today-meta');
  const dashboardSalesMonth = document.getElementById('dashboard-sales-month');
  const dashboardSalesMonthMeta = document.getElementById('dashboard-sales-month-meta');
  const dashboardPurchasesMonth = document.getElementById('dashboard-purchases-month');
  const dashboardPurchasesMonthMeta = document.getElementById('dashboard-purchases-month-meta');
  const dashboardProfitCard = document.getElementById('dashboard-profit-card');
  const dashboardProfitLabel = document.getElementById('dashboard-profit-label');
  const dashboardProfitMonth = document.getElementById('dashboard-profit-month');
  const dashboardProfitMonthMeta = document.getElementById('dashboard-profit-month-meta');
  const dashboardInventoryValue = document.getElementById('dashboard-inventory-value');
  const dashboardInventoryMeta = document.getElementById('dashboard-inventory-meta');
  const dashboardReceivablesTotal = document.getElementById('dashboard-receivables-total');
  const dashboardReceivablesMeta = document.getElementById('dashboard-receivables-meta');
  const dashboardPayablesTotal = document.getElementById('dashboard-payables-total');
  const dashboardPayablesMeta = document.getElementById('dashboard-payables-meta');
  const dashboardLowStockCount = document.getElementById('dashboard-low-stock-count');
  const dashboardLowStockMeta = document.getElementById('dashboard-low-stock-meta');
  const dashboardSalesComparison = document.getElementById('dashboard-sales-comparison');
  const dashboardTopProducts = document.getElementById('dashboard-top-products');
  const dashboardCashFlowGrid = document.getElementById('dashboard-cash-flow-grid');
  const dashboardIncomeStatementGrid = document.getElementById('dashboard-income-statement-grid');
  const dashboardActiveBuckets = document.getElementById('dashboard-active-buckets');
  const dashboardActiveToppings = document.getElementById('dashboard-active-toppings');
  const dashboardActiveSauces = document.getElementById('dashboard-active-sauces');
  const dashboardControlDetails = document.getElementById('dashboard-control-details');
  const dashboardStockAlerts = document.getElementById('dashboard-stock-alerts');
  const flavorModuleTabs = document.querySelectorAll('.flavor-module-tab');
  const flavorModuleFlavorsPanel = document.getElementById('flavor-module-flavors-panel');
  const flavorModuleToppingsPanel = document.getElementById('flavor-module-toppings-panel');
  const flavorModuleSaucesPanel = document.getElementById('flavor-module-sauces-panel');
  const inventoryTabs = document.querySelectorAll('.inventory-tab');
  const inventorySummaryPanel = document.getElementById('inventory-summary-panel');
  const inventoryKardexPanel = document.getElementById('inventory-kardex-panel');
  const inventoryInitialPanel = document.getElementById('inventory-initial-panel');
  const inventoryAdjustmentsPanel = document.getElementById('inventory-adjustments-panel');
  const inventorySummarySearchInput = document.getElementById('inventory-summary-search');
  const inventorySummaryTypeFilterInput = document.getElementById('inventory-summary-type-filter');
  const inventorySummaryMovementFilterInput = document.getElementById('inventory-summary-movement-filter');
  const inventorySummaryCutoffDateInput = document.getElementById('inventory-summary-cutoff-date');
  const exportInventorySummaryExcelButton = document.getElementById('export-inventory-summary-excel');
  const exportInventorySummaryPdfButton = document.getElementById('export-inventory-summary-pdf');
  const inventorySummaryTotals = document.getElementById('inventory-summary-totals');
  const inventorySummaryList = document.getElementById('inventory-summary-list');
  const inventoryKardexProductInput = document.getElementById('inventory-kardex-product');
  const inventoryKardexTypeFilterInput = document.getElementById('inventory-kardex-type-filter');
  const inventoryKardexMovementFilterInput = document.getElementById('inventory-kardex-movement-filter');
  const inventoryKardexDateModeInput = document.getElementById('inventory-kardex-date-mode');
  const inventoryKardexDateStartField = document.getElementById('inventory-kardex-date-start-field');
  const inventoryKardexDateEndField = document.getElementById('inventory-kardex-date-end-field');
  const inventoryKardexDateStartInput = document.getElementById('inventory-kardex-date-start');
  const inventoryKardexDateEndInput = document.getElementById('inventory-kardex-date-end');
  const exportInventoryKardexExcelButton = document.getElementById('export-inventory-kardex-excel');
  const exportInventoryKardexPdfButton = document.getElementById('export-inventory-kardex-pdf');
  const inventoryKardexList = document.getElementById('inventory-kardex-list');
  const inventoryInitialForm = document.getElementById('inventory-initial-form');
  const inventoryInitialProductInput = document.getElementById('inventory-initial-product');
  const inventoryInitialDateInput = document.getElementById('inventory-initial-date');
  const inventoryInitialQuantityInput = document.getElementById('inventory-initial-quantity');
  const inventoryInitialUnitCostInput = document.getElementById('inventory-initial-unit-cost');
  const inventoryInitialNoteInput = document.getElementById('inventory-initial-note');
  const inventoryInitialStatus = document.getElementById('inventory-initial-status');
  const inventoryAdjustmentForm = document.getElementById('inventory-adjustment-form');
  const inventoryAdjustmentProductInput = document.getElementById('inventory-adjustment-product');
  const inventoryAdjustmentDateInput = document.getElementById('inventory-adjustment-date');
  const inventoryAdjustmentTypeInput = document.getElementById('inventory-adjustment-type');
  const inventoryAdjustmentQuantityInput = document.getElementById('inventory-adjustment-quantity');
  const inventoryAdjustmentUnitCostField = document.getElementById('inventory-adjustment-unit-cost-field');
  const inventoryAdjustmentUnitCostInput = document.getElementById('inventory-adjustment-unit-cost');
  const inventoryAdjustmentNoteInput = document.getElementById('inventory-adjustment-note');
  const inventoryAdjustmentStatus = document.getElementById('inventory-adjustment-status');
  const flavorForm = document.getElementById('flavor-form');
  const flavorNameInput = document.getElementById('flavor-name');
  const flavorSubmitButton = document.getElementById('flavor-submit');
  const cancelFlavorEditButton = document.getElementById('cancel-flavor-edit');
  const flavorStatus = document.getElementById('flavor-status');
  const flavorList = document.getElementById('flavor-list');
  const flavorRawMaterialInput = document.getElementById('flavor-raw-material');
  const toppingForm = document.getElementById('topping-form');
  const toppingNameInput = document.getElementById('topping-name');
  const toppingRawMaterialInput = document.getElementById('topping-raw-material');
  const toppingSubmitButton = document.getElementById('topping-submit');
  const cancelToppingEditButton = document.getElementById('cancel-topping-edit');
  const toppingStatus = document.getElementById('topping-status');
  const toppingList = document.getElementById('topping-list');
  const toppingControlOpenForm = document.getElementById('topping-control-open-form');
  const toppingControlOpenToppingInput = document.getElementById('topping-control-open-topping');
  const toppingControlOpenDateInput = document.getElementById('topping-control-open-date');
  const toppingControlOpenNoteInput = document.getElementById('topping-control-open-note');
  const toppingControlStatus = document.getElementById('topping-control-status');
  const toppingControlActiveList = document.getElementById('topping-control-active-list');
  const toppingControlHistoryList = document.getElementById('topping-control-history-list');
  const sauceForm = document.getElementById('sauce-form');
  const sauceNameInput = document.getElementById('sauce-name');
  const sauceRawMaterialInput = document.getElementById('sauce-raw-material');
  const sauceSubmitButton = document.getElementById('sauce-submit');
  const cancelSauceEditButton = document.getElementById('cancel-sauce-edit');
  const sauceStatus = document.getElementById('sauce-status');
  const sauceList = document.getElementById('sauce-list');
  const sauceControlOpenForm = document.getElementById('sauce-control-open-form');
  const sauceControlOpenSauceInput = document.getElementById('sauce-control-open-sauce');
  const sauceControlOpenDateInput = document.getElementById('sauce-control-open-date');
  const sauceControlOpenNoteInput = document.getElementById('sauce-control-open-note');
  const sauceControlStatus = document.getElementById('sauce-control-status');
  const sauceControlActiveList = document.getElementById('sauce-control-active-list');
  const sauceControlHistoryList = document.getElementById('sauce-control-history-list');
  const bucketOpenForm = document.getElementById('bucket-open-form');
  const bucketOpenFlavorInput = document.getElementById('bucket-open-flavor');
  const bucketOpenDateInput = document.getElementById('bucket-open-date');
  const bucketOpenNoteInput = document.getElementById('bucket-open-note');
  const bucketStatus = document.getElementById('bucket-status');
  const bucketActiveList = document.getElementById('bucket-active-list');
  const bucketHistoryList = document.getElementById('bucket-history-list');
  const controlModeInput = document.getElementById('control-mode');
  const typeSelect = document.getElementById('tipo');
  const stockMinField = document.getElementById('stockMin').closest('.field');
  const stockMinInput = document.getElementById('stockMin');
  const priceInput = document.getElementById('price');
  const salePriceInput = document.getElementById('sale-price');
  const priceField = priceInput.closest('.field');
  const measureField = document.getElementById('measure-field');
  const yieldField = document.getElementById('yield-field');
  const yieldPerPurchaseInput = document.getElementById('yield-per-purchase');
  const flavorControlField = document.getElementById('flavor-control-field');
  const controlSaboresInput = document.getElementById('control-sabores');
  const scoopsPerUnitInput = document.getElementById('scoops-per-unit');
  const recipeBuilder = document.getElementById('recipe-builder');
  const recipeRows = document.getElementById('recipe-rows');
  const addIngredientButton = document.getElementById('add-ingredient');
  const submitButton = document.getElementById('product-submit');
  const cancelEditButton = document.getElementById('cancel-edit');
  const authTitle = document.getElementById('auth-title');
  const authDescription = document.getElementById('auth-description');
  const authStatus = document.getElementById('auth-status');
  const authLoginForm = document.getElementById('auth-login-form');
  const authBootstrapForm = document.getElementById('auth-bootstrap-form');
  const authModeToggle = document.getElementById('auth-mode-toggle');
  const authSwitchBootstrapButton = document.getElementById('auth-switch-bootstrap');
  const authLoginUsernameInput = document.getElementById('auth-login-username');
  const authLoginPasswordInput = document.getElementById('auth-login-password');
  const authLoginShowPasswordInput = document.getElementById('auth-login-show-password');
  const authBootstrapNameInput = document.getElementById('auth-bootstrap-name');
  const authBootstrapUsernameInput = document.getElementById('auth-bootstrap-username');
  const authBootstrapPasswordInput = document.getElementById('auth-bootstrap-password');
  const authBootstrapPasswordConfirmInput = document.getElementById('auth-bootstrap-password-confirm');
  const authBootstrapSecretField = document.getElementById('auth-bootstrap-secret-field');
  const authBootstrapSecretInput = document.getElementById('auth-bootstrap-secret');
  const sessionUserName = document.getElementById('session-user-name');
  const sessionUserMeta = document.getElementById('session-user-meta');
  const mobileNavBackdrop = document.getElementById('mobile-nav-backdrop');
  const mobileNavToggleButton = document.getElementById('mobile-nav-toggle');
  const mobileNavCloseButton = document.getElementById('mobile-nav-close');
  const mobileNavCurrentModule = document.getElementById('mobile-nav-current-module');
  const logoutButton = document.getElementById('logout-button');
  const themeToggleButton = document.getElementById('theme-toggle');
  const environmentIndicator = document.getElementById('environment-indicator');
  const securityUserForm = document.getElementById('security-user-form');
  const securityUserNameInput = document.getElementById('security-user-name');
  const securityUserUsernameInput = document.getElementById('security-user-username');
  const securityUserPasswordInput = document.getElementById('security-user-password');
  const securityUserRoleInput = document.getElementById('security-user-role');
  const securityCreatePermissions = document.getElementById('security-create-permissions');
  const securityUserStatus = document.getElementById('security-user-status');
  const securityUsersList = document.getElementById('security-users-list');
  const securityRefreshUsersButton = document.getElementById('security-refresh-users');

  return {
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
    securityRefreshUsersButton,
  };
}