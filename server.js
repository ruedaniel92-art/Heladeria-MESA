const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./firebase");
const {
  createAuthHandlers,
  DEFAULT_AUTH_PASSWORD_ITERATIONS,
  DEFAULT_AUTH_TOKEN_DURATION_MS
} = require("./backend/auth");
const { createControlHandlers } = require("./backend/controls");
const { createDebtHandlers } = require("./backend/debts");
const { createFlavorCatalogHandlers } = require("./backend/flavors");
const { createFundHandlers } = require("./backend/funds");
const { createInventoryHandlers } = require("./backend/inventory");
const { createPaymentHandlers } = require("./backend/payments");
const { createProductHandlers } = require("./backend/products");
const { createPurchaseHandlers } = require("./backend/purchases");
const { createSalesHandlers } = require("./backend/sales");
const {
  buildNextDocumentNumber,
  buildNextOutgoingReceiptNumber: buildNextOutgoingReceiptNumberFromRecords
} = require("./backend/shared/receipts");
const { createConsumableHelpers } = require("./backend/shared/consumables");
const { createFirestoreStore } = require("./backend/shared/store");
const {
  calculatePurchaseInvoiceTotal,
  calculateSaleInvoiceTotal,
  ensureExternalDebtFinancialState,
  ensurePurchaseFinancialState,
  ensureSaleFinancialState,
  getAccountFromPaymentMethod,
  normalizeFundAccount,
  normalizeNonNegativeAmount
} = require("./backend/shared/financial");
const {
  getMateriaPrimaStockIncrement,
  getProductInventoryMode,
  isPurchasableProduct,
  normalizeInventoryMode,
  normalizeNonNegativeNumber,
  normalizeProductType,
  productIdentityKey
} = require("./backend/shared/products");
const app = express();

app.disable("x-powered-by");

const COLLECTIONS = {
  productos: "productos",
  compras: "compras",
  ventas: "ventas",
  pagos: "pagos",
  paymentCategories: "paymentCategories",
  fundTransfers: "fundTransfers",
  fundSettings: "fundSettings",
  sabores: "sabores",
  toppings: "toppings",
  salsas: "salsas",
  users: "users",
  baldesControl: "baldesControl",
  toppingControls: "toppingControls",
  sauceControls: "sauceControls",
  inventoryMovements: "inventoryMovements",
  externalDebts: "externalDebts"
};

function buildAuthSecretSeed() {
  const seedParts = [];
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (serviceAccountJson) {
    try {
      const parsedServiceAccount = JSON.parse(serviceAccountJson);
      seedParts.push(parsedServiceAccount.project_id, parsedServiceAccount.client_email);
    } catch (error) {
      // Ignore malformed JSON here and fall back to the explicit env vars below.
    }
  }

  seedParts.push(
    process.env.FIREBASE_PROJECT_ID,
    process.env.FIREBASE_CLIENT_EMAIL,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT
  );

  const normalizedSeed = [...new Set(seedParts
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean))]
    .sort()
    .join("|");

  return normalizedSeed || "heladeria-mesa-auth-secret";
}

function getNormalizedEnvironment() {
  return String(process.env.APP_ENV || process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
}

function isProductionEnvironment() {
  const normalizedEnv = getNormalizedEnvironment();
  if (normalizedEnv) {
    return ["prod", "production", "produccion"].includes(normalizedEnv);
  }
  return process.env.VERCEL === "1";
}

function getBootstrapSecret() {
  return String(process.env.APP_BOOTSTRAP_SECRET || "").trim();
}

function isBootstrapSecretRequired() {
  return isProductionEnvironment() || Boolean(getBootstrapSecret());
}

function normalizeOrigin(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawValue.startsWith("http") ? rawValue : `https://${rawValue}`);
    return parsedUrl.origin.toLowerCase();
  } catch (error) {
    return "";
  }
}

function getConfiguredCorsOrigins() {
  return String(process.env.APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function getRequestHostOrigin(req) {
  const host = String(req.headers.host || "").trim();
  if (!host) {
    return "";
  }
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    || (isProductionEnvironment() ? "https" : "http");
  return normalizeOrigin(`${protocol}://${host}`);
}

function isLocalDevelopmentOrigin(origin) {
  try {
    const parsedUrl = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  } catch (error) {
    return false;
  }
}

function getAllowedCorsOrigin(req) {
  const requestOrigin = normalizeOrigin(req.headers.origin);
  if (!requestOrigin) {
    return "";
  }

  const allowedOrigins = new Set([
    ...getConfiguredCorsOrigins(),
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    normalizeOrigin(process.env.VERCEL_URL),
    getRequestHostOrigin(req)
  ].filter(Boolean));

  if (!isProductionEnvironment() && isLocalDevelopmentOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins.has(requestOrigin) ? requestOrigin : "";
}

if (isProductionEnvironment() && !process.env.APP_AUTH_SECRET) {
  throw new Error('APP_AUTH_SECRET es obligatorio en producción');
}
const AUTH_SECRET = process.env.APP_AUTH_SECRET
  || crypto.createHash("sha256").update(buildAuthSecretSeed()).digest("hex");
const CREDIT_PAYMENT_METHODS = ["efectivo", "transferencia", "tarjeta"];
const OUTGOING_PAYMENT_METHODS = ["efectivo", "transferencia", "tarjeta-credito"];
const DEFAULT_COLLECTION_CACHE_MS = 2 * 60 * 1000;
const COLLECTION_CACHE_MS = {
  [COLLECTIONS.users]: 10 * 60 * 1000,
  [COLLECTIONS.paymentCategories]: 5 * 60 * 1000,
  [COLLECTIONS.sabores]: 5 * 60 * 1000,
  [COLLECTIONS.toppings]: 5 * 60 * 1000,
  [COLLECTIONS.salsas]: 5 * 60 * 1000
};

app.use((req, res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4);
  }
  next();
});

app.use(express.json());
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.use((req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "El cuerpo JSON de la solicitud no es válido." });
  }
  return next(err);
});

app.use((req, res, next) => {
  const allowedOrigin = getAllowedCorsOrigin(req);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "X-Auth-Token");
  if (req.method === "OPTIONS") {
    return allowedOrigin ? res.sendStatus(204) : res.sendStatus(403);
  }
  next();
});

// Base de datos temporal (memoria)
let productos = [];
let compras = [];
let ventas = [];
let pagos = [];
let paymentCategories = [];
let fundTransfers = [];
let fundSettings = [];
let sabores = [];
let toppings = [];
let salsas = [];
let users = [];
let baldesControl = [];
let toppingControls = [];
let sauceControls = [];
let inventoryMovements = [];
let externalDebts = [];

function assignCollectionData(collectionName, records) {
  switch (collectionName) {
    case COLLECTIONS.productos:
      productos = records;
      break;
    case COLLECTIONS.compras:
      compras = records;
      break;
    case COLLECTIONS.ventas:
      ventas = records;
      break;
    case COLLECTIONS.pagos:
      pagos = records;
      break;
    case COLLECTIONS.paymentCategories:
      paymentCategories = records;
      break;
    case COLLECTIONS.fundTransfers:
      fundTransfers = records;
      break;
    case COLLECTIONS.fundSettings:
      fundSettings = records;
      break;
    case COLLECTIONS.sabores:
      sabores = records;
      break;
    case COLLECTIONS.toppings:
      toppings = records;
      break;
    case COLLECTIONS.salsas:
      salsas = records;
      break;
    case COLLECTIONS.users:
      users = records;
      break;
    case COLLECTIONS.baldesControl:
      baldesControl = records;
      break;
    case COLLECTIONS.toppingControls:
      toppingControls = records;
      break;
    case COLLECTIONS.sauceControls:
      sauceControls = records;
      break;
    case COLLECTIONS.inventoryMovements:
      inventoryMovements = records;
      break;
    case COLLECTIONS.externalDebts:
      externalDebts = records;
      break;
    default:
      break;
  }
}

const {
  commitBatch,
  createDocId,
  deleteRecord,
  hydrateStore,
  sanitizeFirestoreValue,
  saveRecord
} = createFirestoreStore({
  db,
  collections: COLLECTIONS,
  assignCollectionData,
  collectionCacheMs: COLLECTION_CACHE_MS,
  defaultCollectionCacheMs: DEFAULT_COLLECTION_CACHE_MS
});

function getLinkedPurchaseCardPayments(compraId, paymentEntryId) {
  return pagos.filter(payment => String(payment.sourceModule || '') === 'compras'
    && String(payment.sourceRecordId || '') === String(compraId)
    && String(payment.sourcePaymentEntryId || '') === String(paymentEntryId));
}

function syncPurchaseCardPendingPaymentOperations(compra, paymentEntry, operations) {
  if (!compra || !paymentEntry || !Array.isArray(operations)) {
    return;
  }

  const linkedPayments = getLinkedPurchaseCardPayments(compra.id, paymentEntry.id);
  const normalizedMethod = String(paymentEntry.paymentMethod || '').trim().toLowerCase();

  if (normalizedMethod !== 'tarjeta') {
    linkedPayments.forEach(payment => {
      const paymentId = String(payment.id || '');
      pagos = pagos.filter(entry => String(entry.id || '') !== paymentId);
      operations.push({ type: 'delete', collection: COLLECTIONS.pagos, id: paymentId });
    });
    return;
  }

  const existingPayment = linkedPayments[0] || null;
  const now = new Date().toISOString();
  const linkedPayment = {
    ...(existingPayment || {}),
    id: existingPayment?.id || createDocId(COLLECTIONS.pagos),
    descripcion: compra.documento || 'Compra',
    beneficiario: compra.proveedor || null,
    categoriaId: existingPayment?.categoriaId || null,
    categoriaNombre: existingPayment?.categoriaNombre || 'Compra',
    monto: Number(paymentEntry.amount || 0),
    fecha: paymentEntry.date || compra.fecha || now,
    paymentMethod: 'tarjeta-credito',
    referencia: paymentEntry.paymentReference || null,
    receiptNumber: null,
    receiptIssuedAt: null,
    observacion: paymentEntry.note || null,
    status: existingPayment?.reimbursedAt ? 'reembolsado' : 'pendiente-reembolso',
    reimbursementMethod: existingPayment?.reimbursedAt ? (existingPayment.reimbursementMethod || 'transferencia') : 'transferencia',
    reimbursementReference: existingPayment?.reimbursementReference || null,
    reimbursedAt: existingPayment?.reimbursedAt || null,
    sourceModule: 'compras',
    sourceRecordId: String(compra.id || ''),
    sourcePaymentEntryId: String(paymentEntry.id || ''),
    sourceDocument: compra.documento || null,
    createdAt: existingPayment?.createdAt || now,
    updatedAt: now
  };

  const existingIndex = pagos.findIndex(payment => String(payment.id || '') === String(linkedPayment.id));
  if (existingIndex >= 0) {
    pagos[existingIndex] = linkedPayment;
  } else {
    pagos.push(linkedPayment);
  }

  operations.push({ type: 'set', collection: COLLECTIONS.pagos, id: linkedPayment.id, data: linkedPayment });

  linkedPayments.slice(1).forEach(payment => {
    const paymentId = String(payment.id || '');
    pagos = pagos.filter(entry => String(entry.id || '') !== paymentId);
    operations.push({ type: 'delete', collection: COLLECTIONS.pagos, id: paymentId });
  });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(error => {
      const errorDetails = String(error?.details || error?.message || '').toLowerCase();
      const isQuotaExceeded = Number(error?.code) === 8 || errorDetails.includes('quota exceeded') || errorDetails.includes('resource_exhausted');
      const status = Number(error?.status) || (isQuotaExceeded ? 503 : 500);
      const publicMessage = error?.publicMessage || (isQuotaExceeded
        ? 'Se alcanzó la cuota de Firestore. Debes esperar al reinicio de cuota o cambiar la configuración del proyecto.'
        : 'Error interno del servidor');

      console.error('ERROR:', {
        path: req.originalUrl,
        method: req.method,
        user: req.authUser?.id || req.user?.id || null,
        message: error?.message || 'Unexpected error'
      });

      if (!res.headersSent) {
        return res.status(status).json({
          error: publicMessage
        });
      }
    });
  };
}

function normalizeFlavorName(value) {
  return String(value || '').trim();
}



function findProductoByIdOrName({ id, nombre }) {
  if (id !== undefined && id !== null) {
    const idString = String(id);
    const productoById = productos.find(p => String(p.id) === idString);
    if (productoById) return productoById;
  }
  if (nombre && typeof nombre === 'string') {
    return productos.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  }
  return undefined;
}

function buildInventoryMovement({ producto, tipo, direccion, cantidad, fecha, observacion, referencia, saldoAnterior, saldoNuevo, costoUnitario = null, costoTotal = null, extraFields = {} }) {
  return {
    id: createDocId(COLLECTIONS.inventoryMovements),
    productoId: String(producto.id),
    productoNombre: String(producto.nombre || '').trim(),
    productoTipo: getProductInventoryMode(producto),
    tipo,
    direccion,
    cantidad,
    fecha,
    observacion: observacion || null,
    referencia: referencia || null,
    saldoAnterior,
    saldoNuevo,
    costoUnitario: costoUnitario === null || costoUnitario === undefined || Number.isNaN(Number(costoUnitario)) ? null : Number(costoUnitario),
    costoTotal: costoTotal === null || costoTotal === undefined || Number.isNaN(Number(costoTotal)) ? null : Number(costoTotal),
    ...sanitizeFirestoreValue(extraFields),
    createdAt: new Date().toISOString()
  };
}



const {
  applyConsumableCostSnapshot,
  applyFinalCostToSalesForControl,
  ensureConsumableControlSnapshot,
  getActiveBucketForFlavor,
  getActiveSauceControlForSauce,
  getActiveToppingControlForTopping,
  getControlCostValues,
  getFlavorAvailableStock,
  getNextConsumableLayer,
  getSauceAvailableStock,
  getToppingAvailableStock,
  removeConsumableCloseInventoryMovements,
  repairConsumableControls
} = createConsumableHelpers({
  collections: COLLECTIONS,
  findProductoByIdOrName,
  getBaldesControl: () => baldesControl,
  getCompras: () => compras,
  getInventoryMovements: () => inventoryMovements,
  getMateriaPrimaStockIncrement,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSauceControls: () => sauceControls,
  getSabores: () => sabores,
  getToppingControls: () => toppingControls,
  getToppings: () => toppings,
  getVentas: () => ventas,
  setInventoryMovements: records => { inventoryMovements = records; }
});

function buildNextOutgoingReceiptNumber(prefix = 'REC-') {
  return buildNextOutgoingReceiptNumberFromRecords({ pagos, compras, externalDebts }, prefix);
}

function getDefaultFundSettings() {
  return {
    id: 'main',
    openingCashBalance: 0,
    openingBankBalance: 0,
    minimumCashReserve: 0,
    createdAt: null,
    updatedAt: null
  };
}

function getCurrentFundSettings() {
  const defaultSettings = getDefaultFundSettings();
  const storedSettings = Array.isArray(fundSettings) && fundSettings.length ? fundSettings[0] : null;
  return {
    ...defaultSettings,
    ...(storedSettings || {}),
    openingCashBalance: Number(storedSettings?.openingCashBalance || 0),
    openingBankBalance: Number(storedSettings?.openingBankBalance || 0),
    minimumCashReserve: Number(storedSettings?.minimumCashReserve || 0)
  };
}

function getRuntimeEnvironmentInfo() {
  const isProduction = isProductionEnvironment();

  return {
    mode: isProduction ? 'production' : 'test',
    label: isProduction ? 'PRODUCCION' : 'PRUEBA',
    bootstrapSecretRequired: isBootstrapSecretRequired(),
    bootstrapSecretConfigured: Boolean(getBootstrapSecret())
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "heladeria-mesa-api", environment: getRuntimeEnvironmentInfo() });
});

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

const { registerAuthRoutes, requireAuth, requirePermission } = createAuthHandlers({
  app,
  asyncHandler,
  authSecret: AUTH_SECRET,
  authTokenDurationMs: DEFAULT_AUTH_TOKEN_DURATION_MS,
  authPasswordIterations: DEFAULT_AUTH_PASSWORD_ITERATIONS,
  collections: COLLECTIONS,
  createDocId,
  getBootstrapSecret,
  getUsers: () => users,
  hydrateStore,
  isBootstrapSecretRequired,
  saveRecord
});

registerAuthRoutes();

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (["/health", "/", "/index.html"].includes(req.path) || req.path.startsWith("/auth/")) {
    return next();
  }

  return requireAuth(req, res, next);
});

function protectModuleRoutes(permissionKey, paths) {
  app.use(paths, requirePermission(permissionKey));
}

protectModuleRoutes("ingreso", ["/productos"]);
protectModuleRoutes("sabores", ["/sabores", "/toppings", "/salsas", "/baldes-control", "/toppings-control", "/salsas-control", "/controles"]);
protectModuleRoutes("compras", ["/compras"]);
protectModuleRoutes("ventas", ["/ventas"]);
protectModuleRoutes("pagos", ["/pagos", "/pagos-categorias", "/deudas-externas"]);
protectModuleRoutes("efectivo", ["/efectivo"]);
protectModuleRoutes("inventario", ["/inventario"]);

const { registerProductRoutes } = createProductHandlers({
  app,
  asyncHandler,
  collections: COLLECTIONS,
  createDocId,
  deleteRecord,
  findProductoByIdOrName,
  getCompras: () => compras,
  getInventoryMovements: () => inventoryMovements,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSabores: () => sabores,
  getToppings: () => toppings,
  getVentas: () => ventas,
  hydrateStore,
  normalizeInventoryMode,
  normalizeNonNegativeNumber,
  normalizeProductType,
  productIdentityKey,
  saveRecord,
  setProductos: value => {
    productos = value;
  }
});

registerProductRoutes();
const { registerFlavorCatalogRoutes } = createFlavorCatalogHandlers({
  app,
  asyncHandler,
  collections: COLLECTIONS,
  createDocId,
  deleteRecord,
  getBaldesControl: () => baldesControl,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSauceControls: () => sauceControls,
  getSabores: () => sabores,
  getToppingControls: () => toppingControls,
  getToppings: () => toppings,
  getVentas: () => ventas,
  hydrateStore,
  normalizeFlavorName,
  normalizeProductType,
  saveRecord,
  setSalsas: value => { salsas = value; },
  setSabores: value => { sabores = value; },
  setToppings: value => { toppings = value; }
});

registerFlavorCatalogRoutes();

const { registerControlRoutes } = createControlHandlers({
  app,
  applyConsumableCostSnapshot,
  applyFinalCostToSalesForControl,
  asyncHandler,
  collections: COLLECTIONS,
  commitBatch,
  createDocId,
  ensureConsumableControlSnapshot,
  getActiveBucketForFlavor,
  getActiveSauceControlForSauce,
  getActiveToppingControlForTopping,
  getBaldesControl: () => baldesControl,
  getFlavorAvailableStock,
  getInventoryMovements: () => inventoryMovements,
  getNextConsumableLayer,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSauceAvailableStock,
  getSauceControls: () => sauceControls,
  getSabores: () => sabores,
  getToppingAvailableStock,
  getToppingControls: () => toppingControls,
  getToppings: () => toppings,
  getVentas: () => ventas,
  hydrateStore,
  removeConsumableCloseInventoryMovements,
  repairConsumableControls,
  saveRecord
});

registerControlRoutes();
const { registerPurchaseRoutes } = createPurchaseHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  calculatePurchaseInvoiceTotal,
  collections: COLLECTIONS,
  commitBatch,
  createDocId,
  creditPaymentMethods: CREDIT_PAYMENT_METHODS,
  ensurePurchaseFinancialState,
  getAccountFromPaymentMethod,
  getCompras: () => compras,
  getMateriaPrimaStockIncrement,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSabores: () => sabores,
  getToppings: () => toppings,
  hydrateStore,
  isPurchasableProduct,
  syncPurchaseCardPendingPaymentOperations
});

registerPurchaseRoutes();
const { registerSalesRoutes } = createSalesHandlers({
  app,
  asyncHandler,
  buildNextDocumentNumber,
  buildNextOutgoingReceiptNumber,
  calculateSaleInvoiceTotal,
  collections: COLLECTIONS,
  commitBatch,
  createDocId,
  creditPaymentMethods: CREDIT_PAYMENT_METHODS,
  ensureConsumableControlSnapshot,
  ensureSaleFinancialState,
  getAccountFromPaymentMethod,
  getActiveBucketForFlavor,
  getActiveSauceControlForSauce,
  getActiveToppingControlForTopping,
  getBaldesControl: () => baldesControl,
  getControlCostValues,
  getProductInventoryMode,
  getProductos: () => productos,
  getSalsas: () => salsas,
  getSauceAvailableStock,
  getSauceControls: () => sauceControls,
  getSabores: () => sabores,
  getToppingAvailableStock,
  getToppingControls: () => toppingControls,
  getToppings: () => toppings,
  getVentas: () => ventas,
  hydrateStore,
  normalizeFlavorName,
  saveRecord
});

registerSalesRoutes();

const { registerPaymentRoutes } = createPaymentHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  collections: COLLECTIONS,
  commitBatch,
  createDocId,
  deleteRecord,
  getPagos: () => pagos,
  getPaymentCategories: () => paymentCategories,
  hydrateStore,
  outgoingPaymentMethods: OUTGOING_PAYMENT_METHODS,
  saveRecord
});

registerPaymentRoutes();

const { registerFundRoutes } = createFundHandlers({
  app,
  asyncHandler,
  collections: COLLECTIONS,
  createDocId,
  getCurrentFundSettings,
  getFundTransfers: () => fundTransfers,
  hydrateStore,
  normalizeFundAccount,
  normalizeNonNegativeAmount,
  saveRecord,
  setFundSettings: nextSettings => {
    fundSettings = nextSettings;
  }
});

registerFundRoutes();

const { registerInventoryRoutes } = createInventoryHandlers({
  app,
  asyncHandler,
  buildInventoryMovement,
  collections: COLLECTIONS,
  commitBatch,
  getInventoryMovements: () => inventoryMovements,
  getProductos: () => productos,
  hydrateStore
});

registerInventoryRoutes();



const { registerDebtRoutes } = createDebtHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  collections: COLLECTIONS,
  createDocId,
  ensureExternalDebtFinancialState,
  getExternalDebts: () => externalDebts,
  hydrateStore,
  normalizeFundAccount,
  normalizeNonNegativeAmount,
  saveRecord
});

registerDebtRoutes();





module.exports = app;

// Iniciar servidor local
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Servidor en http://localhost:${port}`);
  });
}










