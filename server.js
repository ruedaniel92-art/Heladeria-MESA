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
const collectionCacheState = Object.values(COLLECTIONS).reduce((accumulator, collectionName) => {
  accumulator[collectionName] = { loadedAt: 0, hasLoaded: false };
  return accumulator;
}, {});

function getCollectionCacheDuration(collectionName) {
  return Number(COLLECTION_CACHE_MS[collectionName] || DEFAULT_COLLECTION_CACHE_MS);
}

function markCollectionCache(collectionName, timestamp = Date.now()) {
  if (!collectionCacheState[collectionName]) {
    collectionCacheState[collectionName] = { loadedAt: 0, hasLoaded: false };
  }
  collectionCacheState[collectionName].loadedAt = timestamp;
  collectionCacheState[collectionName].hasLoaded = true;
}

function shouldHydrateCollection(collectionName, forceRefresh = false) {
  if (forceRefresh) {
    return true;
  }

  const cacheEntry = collectionCacheState[collectionName];
  if (!cacheEntry?.hasLoaded) {
    return true;
  }

  return Date.now() - Number(cacheEntry.loadedAt || 0) >= getCollectionCacheDuration(collectionName);
}

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

function sanitizeFirestoreValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
      if (nestedValue !== undefined) {
        accumulator[key] = sanitizeFirestoreValue(nestedValue);
      }
      return accumulator;
    }, {});
  }

  return value;
}

async function loadCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function hydrateStore(collectionNames = null, options = {}) {
  const { forceRefresh = false } = options;
  const targetCollections = Array.isArray(collectionNames) && collectionNames.length
    ? collectionNames
    : Object.values(COLLECTIONS);

  const uniqueCollections = [...new Set(targetCollections)].filter(collectionName => shouldHydrateCollection(collectionName, forceRefresh));
  if (!uniqueCollections.length) {
    return;
  }

  const loadedCollections = await Promise.all(uniqueCollections.map(async collectionName => ({
    collectionName,
    records: await loadCollection(collectionName)
  })));

  loadedCollections.forEach(({ collectionName, records }) => {
    assignCollectionData(collectionName, records);
    markCollectionCache(collectionName);
  });
}

function createDocId(collectionName) {
  return db.collection(collectionName).doc().id;
}

async function saveRecord(collectionName, record) {
  const id = String(record.id || createDocId(collectionName));
  const payload = sanitizeFirestoreValue({ ...record, id });
  await db.collection(collectionName).doc(id).set(payload);
  markCollectionCache(collectionName);
  return payload;
}

async function deleteRecord(collectionName, id) {
  await db.collection(collectionName).doc(String(id)).delete();
  markCollectionCache(collectionName);
}

async function commitBatch(operations) {
  const batch = db.batch();
  const touchedCollections = new Set();

  operations.forEach(operation => {
    if (!operation) return;
    touchedCollections.add(operation.collection);

    const docRef = db.collection(operation.collection).doc(String(operation.id));
    if (operation.type === 'delete') {
      batch.delete(docRef);
      return;
    }

    batch.set(docRef, sanitizeFirestoreValue({ ...operation.data, id: String(operation.id) }));
  });

  await batch.commit();
  const commitTime = Date.now();
  touchedCollections.forEach(collectionName => markCollectionCache(collectionName, commitTime));
}

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

function buildNextDocumentNumber(records, prefix) {
  const maxSequence = records.reduce((maxValue, record) => {
    const documentValue = String(record.documento || record.document || '').trim().toUpperCase();
    if (!documentValue.startsWith(`${prefix}-`)) {
      return maxValue;
    }
    const sequence = Number(documentValue.slice(prefix.length + 1));
    return Number.isNaN(sequence) ? maxValue : Math.max(maxValue, sequence);
  }, 0);

  return `${prefix}-${String(maxSequence + 1).padStart(4, "0")}`;
}

function normalizeFlavorName(value) {
  return String(value || '').trim();
}

function normalizeNonNegativeNumber(value) {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) || parsedValue < 0 ? NaN : parsedValue;
}

function normalizeInventoryMode(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (normalizedValue === 'directo') return 'directo';
  if (normalizedValue === 'receta') return 'receta';
  if (normalizedValue === 'helado-sabores') return 'helado-sabores';
  if (normalizedValue === 'mixto') return 'mixto';
  if (normalizedValue === 'materia-prima') return 'materia-prima';
  return '';
}

function normalizeProductType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
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

function normalizeIngredient(ing) {
  return {
    id: ing?.id !== undefined && ing?.id !== null ? String(ing.id) : '',
    nombre: String(ing?.nombre || '').trim().toLowerCase(),
    cantidad: Number(ing?.cantidad) || 0
  };
}

function ingredientsKey(ingredientes) {
  const normalized = Array.isArray(ingredientes) ? ingredientes.map(normalizeIngredient).filter(ing => ing.nombre && ing.cantidad > 0) : [];
  normalized.sort((a, b) => {
    if (a.id && b.id) return a.id.localeCompare(b.id);
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre);
    return a.cantidad - b.cantidad;
  });
  return normalized.map(ing => `${ing.id}:${ing.nombre}:${ing.cantidad}`).join('|');
}

function productIdentityKey(product) {
  const tipo = normalizeProductType(product.tipo || product.type);
  const modoControl = normalizeInventoryMode(product.modoControl || product.inventoryMode || (tipo === 'materia prima' ? 'materia-prima' : ''));
  const nombre = String(product.nombre || '').trim().toLowerCase();
  const precio = tipo === 'materia prima' ? 0 : Number(product.precio || 0);
  const stockMin = Number(product.stockMin || product.stockMinimo || 0);
  const medida = (tipo === 'materia prima' ? String(product.medida || '').trim().toLowerCase() : '');
  const ingredientesKeyString = tipo === 'producto terminado' ? ingredientsKey(product.ingredientes) : '';
  const controlSabores = product.controlSabores ? '1' : '0';
  const rendimientoPorCompra = tipo === 'materia prima' ? Number(product.rendimientoPorCompra || 0) : 0;
  const pelotasPorUnidad = tipo === 'productos' ? Number(product.pelotasPorUnidad || 0) : 0;
  return `${nombre}::${tipo}::${modoControl}::${precio}::${stockMin}::${medida}::${ingredientesKeyString}::${controlSabores}::${rendimientoPorCompra}::${pelotasPorUnidad}`;
}

function getMateriaPrimaStockIncrement(producto, cantidadCompra) {
  const rendimientoPorCompra = normalizeNonNegativeNumber(producto?.rendimientoPorCompra);
  if (!Number.isNaN(rendimientoPorCompra) && rendimientoPorCompra > 0) {
    return cantidadCompra * rendimientoPorCompra;
  }
  return cantidadCompra;
}

function getProductInventoryMode(producto) {
  const tipo = normalizeProductType(producto?.tipo || producto?.type);
  const explicitMode = normalizeInventoryMode(producto?.modoControl || producto?.inventoryMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (tipo === 'materia prima') {
    return 'materia-prima';
  }
  if (producto?.controlSabores && Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return 'mixto';
  }
  if (producto?.controlSabores) {
    return 'helado-sabores';
  }
  if (Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return 'receta';
  }
  return 'directo';
}

function isPurchasableProduct(producto) {
  const modoControl = getProductInventoryMode(producto);
  return modoControl === 'materia-prima' || modoControl === 'directo';
}

function getActiveBucketForFlavor(flavorId) {
  return baldesControl.find(bucket => String(bucket.saborId) === String(flavorId) && bucket.estado === 'abierto');
}

function getActiveToppingControlForTopping(toppingId) {
  return toppingControls.find(control => String(control.toppingId) === String(toppingId) && control.estado === 'abierto');
}

function getActiveSauceControlForSauce(sauceId) {
  return sauceControls.find(control => String(control.sauceId) === String(sauceId) && control.estado === 'abierto');
}

function getFlavorPurchasedStock(flavorId) {
  const normalizedFlavorId = String(flavorId || '').trim();
  if (!normalizedFlavorId) {
    return 0;
  }

  const flavor = sabores.find(item => String(item.id) === normalizedFlavorId);
  if (!flavor) {
    return 0;
  }

  const linkedFlavors = sabores.filter(item => String(item.materiaPrimaId || '') === String(flavor.materiaPrimaId));

  return compras.reduce((total, compra) => {
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

      const materiaPrima = productos.find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
      if (!materiaPrima) {
        return sum;
      }

      return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
    }, 0);
  }, 0);
}

function getFlavorConsumedStock(flavorId) {
  const normalizedFlavorId = String(flavorId || '').trim();
  if (!normalizedFlavorId) {
    return 0;
  }

  return ventas.reduce((total, venta) => {
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

function getToppingPurchasedStock(toppingId) {
  const normalizedToppingId = String(toppingId || '').trim();
  if (!normalizedToppingId) {
    return 0;
  }

  const topping = toppings.find(item => String(item.id) === normalizedToppingId);
  if (!topping) {
    return 0;
  }

  const linkedToppings = toppings.filter(item => String(item.materiaPrimaId || '') === String(topping.materiaPrimaId));
  return compras.reduce((total, compra) => {
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

      const materiaPrima = productos.find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
      if (!materiaPrima) {
        return sum;
      }

      return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
    }, 0);
  }, 0);
}

function getToppingConsumedStock(toppingId) {
  const normalizedToppingId = String(toppingId || '').trim();
  if (!normalizedToppingId) {
    return 0;
  }

  return ventas.reduce((total, venta) => {
    const items = Array.isArray(venta.items) ? venta.items : [];
    return total + items.reduce((sum, item) => {
      const adicionales = Array.isArray(item.adicionales) ? item.adicionales : [];
      return sum + adicionales.reduce((addonsSum, adicional) => {
        return String(adicional.id || '') === normalizedToppingId
          ? addonsSum + Number(adicional.cantidad || 0)
          : addonsSum;
      }, 0);
    }, 0);
  }, 0);
}

function getToppingAvailableStock(toppingId) {
  return Math.max(getToppingPurchasedStock(toppingId) - getToppingConsumedStock(toppingId), 0);
}

function getSaucePurchasedStock(sauceId) {
  const normalizedSauceId = String(sauceId || '').trim();
  if (!normalizedSauceId) {
    return 0;
  }

  const sauce = salsas.find(item => String(item.id) === normalizedSauceId);
  if (!sauce) {
    return 0;
  }

  const linkedSauces = salsas.filter(item => String(item.materiaPrimaId || '') === String(sauce.materiaPrimaId));
  return compras.reduce((total, compra) => {
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

      const materiaPrima = productos.find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
      if (!materiaPrima) {
        return sum;
      }

      return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
    }, 0);
  }, 0);
}

function getSauceConsumedStock(sauceId) {
  const normalizedSauceId = String(sauceId || '').trim();
  if (!normalizedSauceId) {
    return 0;
  }

  return ventas.reduce((total, venta) => {
    const items = Array.isArray(venta.items) ? venta.items : [];
    return total + items.reduce((sum, item) => {
      const adicionales = Array.isArray(item.adicionales) ? item.adicionales : [];
      return sum + adicionales.reduce((addonsSum, adicional) => {
        return String(adicional.id || '') === normalizedSauceId
          ? addonsSum + Number(adicional.cantidad || 0)
          : addonsSum;
      }, 0);
    }, 0);
  }, 0);
}

function getSauceAvailableStock(sauceId) {
  return Math.max(getSaucePurchasedStock(sauceId) - getSauceConsumedStock(sauceId), 0);
}

function sortRecordsByDate(records, dateField = 'fecha') {
  return records.slice().sort((left, right) => {
    const leftDate = new Date(left?.[dateField] || left?.createdAt || 0).getTime();
    const rightDate = new Date(right?.[dateField] || right?.createdAt || 0).getTime();
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
}

function normalizeFundAccount(rawAccount) {
  const normalizedAccount = String(rawAccount || '').trim().toLowerCase();
  if (normalizedAccount === 'efectivo') {
    return 'efectivo';
  }
  if (["banco", "bancos"].includes(normalizedAccount)) {
    return 'banco';
  }
  return '';
}

function normalizeNonNegativeAmount(value) {
  const amount = Number(value);
  if (Number.isNaN(amount) || amount < 0) {
    return null;
  }
  return amount;
}

function extractReceiptSequence(value, prefix = 'REC-') {
  const normalizedValue = String(value || '').trim().toUpperCase();
  if (!normalizedValue.startsWith(prefix)) {
    return 0;
  }
  const numericPart = normalizedValue.slice(prefix.length).replace(/[^0-9]/g, '');
  const sequence = Number(numericPart);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

function buildNextPaymentReceiptNumber(payments, prefix = 'REC-') {
  const highestSequence = (Array.isArray(payments) ? payments : []).reduce((maxValue, payment) => {
    const paymentSequence = Math.max(
      extractReceiptSequence(payment?.receiptNumber, prefix),
      extractReceiptSequence(payment?.referencia, prefix)
    );
    return Math.max(maxValue, paymentSequence);
  }, 0);

  return `${prefix}${String(highestSequence + 1).padStart(6, '0')}`;
}

function getHistoryReceiptSequence(historyEntries, prefix = 'REC-') {
  return (Array.isArray(historyEntries) ? historyEntries : []).reduce((maxValue, entry) => {
    const entrySequence = Math.max(
      extractReceiptSequence(entry?.receiptNumber, prefix),
      extractReceiptSequence(entry?.paymentReference, prefix)
    );
    return Math.max(maxValue, entrySequence);
  }, 0);
}

function buildNextOutgoingReceiptNumber(prefix = 'REC-') {
  const paymentMax = (Array.isArray(pagos) ? pagos : []).reduce((maxValue, payment) => {
    const paymentSequence = Math.max(
      extractReceiptSequence(payment?.receiptNumber, prefix),
      extractReceiptSequence(payment?.referencia, prefix)
    );
    return Math.max(maxValue, paymentSequence);
  }, 0);
  const purchaseMax = (Array.isArray(compras) ? compras : []).reduce((maxValue, compra) => Math.max(maxValue, getHistoryReceiptSequence(compra?.paymentHistory, prefix)), 0);
  const externalDebtMax = (Array.isArray(externalDebts) ? externalDebts : []).reduce((maxValue, debt) => Math.max(maxValue, getHistoryReceiptSequence(debt?.paymentHistory, prefix)), 0);
  const highestSequence = Math.max(paymentMax, purchaseMax, externalDebtMax);
  return `${prefix}${String(highestSequence + 1).padStart(6, '0')}`;
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

function calculatePurchaseInvoiceTotal(compra) {
  const items = Array.isArray(compra?.items) ? compra.items : [];
  return items.reduce((sum, item) => sum + Number(item.costo || 0) * Number(item.cantidad || 0), 0);
}

function calculateSaleInvoiceTotal(venta) {
  const items = Array.isArray(venta?.items) ? venta.items : [];
  return items.reduce((sum, item) => {
    const extrasTotal = Array.isArray(item.adicionales)
      ? item.adicionales.reduce((addonSum, adicional) => addonSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0)
      : 0;
    return sum + Number(item.precio || 0) * Number(item.cantidad || 0) + extrasTotal;
  }, 0);
}

function normalizePaymentHistoryEntries(entries, totalAmount, fallbackEntry = null) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const amount = normalizeNonNegativeAmount(entry?.amount);
      const date = entry?.date ? new Date(entry.date) : null;
      if (amount === null || amount <= 0 || !date || Number.isNaN(date.getTime())) {
        return null;
      }
      return {
        id: String(entry.id || crypto.randomUUID()),
        amount,
        date: date.toISOString(),
        paymentMethod: String(entry.paymentMethod || '').trim().toLowerCase() || null,
        paymentReference: String(entry.paymentReference || '').trim() || null,
        receiptNumber: String(entry.receiptNumber || '').trim() || null,
        note: String(entry.note || '').trim() || null,
        account: normalizeFundAccount(entry.account) || null,
        createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString()
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0));

  if (!normalizedEntries.length && fallbackEntry) {
    const fallbackAmount = normalizeNonNegativeAmount(fallbackEntry.amount);
    const fallbackDate = fallbackEntry.date ? new Date(fallbackEntry.date) : null;
    if (fallbackAmount !== null && fallbackAmount > 0 && fallbackDate && !Number.isNaN(fallbackDate.getTime())) {
      normalizedEntries.push({
        id: crypto.randomUUID(),
        amount: Math.min(fallbackAmount, Math.max(Number(totalAmount || 0), 0)),
        date: fallbackDate.toISOString(),
        paymentMethod: String(fallbackEntry.paymentMethod || '').trim().toLowerCase() || null,
        paymentReference: String(fallbackEntry.paymentReference || '').trim() || null,
        receiptNumber: String(fallbackEntry.receiptNumber || '').trim() || null,
        note: String(fallbackEntry.note || '').trim() || null,
        account: normalizeFundAccount(fallbackEntry.account) || null,
        createdAt: fallbackDate.toISOString()
      });
    }
  }

  return normalizedEntries;
}

function summarizePaymentHistory(record, totalAmount) {
  const normalizedTotal = Math.max(Number(totalAmount || 0), 0);
  const paymentHistory = normalizePaymentHistoryEntries(record?.paymentHistory, normalizedTotal, record?.paidAt ? {
    amount: normalizedTotal,
    date: record.paidAt,
    paymentMethod: record.paymentMethod,
    paymentReference: record.paymentReference,
    account: record.account
  } : null);
  const totalPaid = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return {
    paymentHistory,
    totalPaid: Math.min(totalPaid, normalizedTotal),
    balanceDue: Math.max(normalizedTotal - totalPaid, 0)
  };
}

function getAccountFromPaymentMethod(method) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  if (normalizedMethod === 'efectivo') {
    return 'efectivo';
  }
  if (['transferencia', 'tarjeta', 'tarjeta-credito'].includes(normalizedMethod)) {
    return 'banco';
  }
  return null;
}

function ensurePurchaseFinancialState(compra) {
  if (!compra) {
    return null;
  }
  const totalAmount = calculatePurchaseInvoiceTotal(compra);
  const paymentSummary = summarizePaymentHistory(compra, totalAmount);
  const lastPayment = paymentSummary.paymentHistory.length ? paymentSummary.paymentHistory[paymentSummary.paymentHistory.length - 1] : null;
  const originalPaymentType = String(compra.originalPaymentType || compra.paymentType || '').trim().toLowerCase() || 'contado';
  const isCredit = originalPaymentType === 'credito';

  compra.totalAmount = totalAmount;
  compra.paymentHistory = paymentSummary.paymentHistory;
  compra.totalPaid = paymentSummary.totalPaid;
  compra.balanceDue = isCredit ? paymentSummary.balanceDue : 0;
  compra.status = isCredit
    ? (compra.balanceDue <= 0 ? 'pagada' : compra.totalPaid > 0 ? 'abonada' : 'pendiente')
    : 'pagada';
  compra.paidAt = compra.status === 'pagada' ? (lastPayment?.date || compra.paidAt || compra.fecha || null) : null;
  compra.paymentMethod = lastPayment?.paymentMethod || (compra.paidAt ? compra.paymentMethod : compra.paymentMethod || null);
  compra.paymentReference = lastPayment?.paymentReference || (compra.paidAt ? compra.paymentReference : null);
  if (String(compra.paymentType || '').trim().toLowerCase() !== originalPaymentType) {
    compra.paymentType = originalPaymentType;
  }
  return compra;
}

function ensureSaleFinancialState(venta) {
  if (!venta) {
    return null;
  }
  const totalAmount = calculateSaleInvoiceTotal(venta);
  const paymentSummary = summarizePaymentHistory(venta, totalAmount);
  const lastPayment = paymentSummary.paymentHistory.length ? paymentSummary.paymentHistory[paymentSummary.paymentHistory.length - 1] : null;
  const originalPaymentType = String(venta.originalPaymentType || venta.paymentType || '').trim().toLowerCase() || 'contado';
  const isCredit = originalPaymentType === 'credito';

  venta.totalAmount = totalAmount;
  venta.paymentHistory = paymentSummary.paymentHistory;
  venta.totalPaid = paymentSummary.totalPaid;
  venta.balanceDue = isCredit ? paymentSummary.balanceDue : 0;
  venta.status = isCredit
    ? (venta.balanceDue <= 0 ? 'pagada' : venta.totalPaid > 0 ? 'abonada' : 'pendiente')
    : 'pagada';
  venta.paidAt = venta.status === 'pagada' ? (lastPayment?.date || venta.paidAt || venta.fecha || null) : null;
  venta.paymentMethod = lastPayment?.paymentMethod || (venta.paidAt ? venta.paymentMethod : venta.paymentMethod || null);
  venta.paymentReference = lastPayment?.paymentReference || (venta.paidAt ? venta.paymentReference : null);
  if (String(venta.paymentType || '').trim().toLowerCase() !== originalPaymentType) {
    venta.paymentType = originalPaymentType;
  }
  return venta;
}

function ensureExternalDebtFinancialState(debt) {
  if (!debt) {
    return null;
  }
  const originalAmount = Math.max(Number(debt.originalAmount || debt.totalAmount || debt.amount || 0), 0);
  const paymentHistory = normalizePaymentHistoryEntries(debt.paymentHistory, originalAmount);
  const totalPaid = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const balanceDue = Math.max(originalAmount - totalPaid, 0);
  const type = String(debt.type || '').trim().toLowerCase() === 'por-cobrar' ? 'por-cobrar' : 'por-pagar';
  const dueDate = debt.dueDate ? new Date(debt.dueDate) : null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const isOverdue = balanceDue > 0 && dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < now;

  debt.type = type;
  debt.originalAmount = originalAmount;
  debt.paymentHistory = paymentHistory;
  debt.totalPaid = Math.min(totalPaid, originalAmount);
  debt.balanceDue = balanceDue;
  debt.status = balanceDue <= 0 ? 'pagada' : totalPaid > 0 ? 'abonada' : isOverdue ? 'vencida' : 'pendiente';
  debt.paidAt = balanceDue <= 0 && paymentHistory.length ? paymentHistory[paymentHistory.length - 1].date : null;
  return debt;
}

function getConsumableConfig(kind) {
  if (kind === 'bucket') {
    return {
      entityList: sabores,
      controlList: baldesControl,
      entityIdField: 'saborId',
      entityNameField: 'saborNombre',
      rawMaterialIdField: 'materiaPrimaId',
      rawMaterialNameField: 'materiaPrimaNombre',
      purchaseLinkField: 'flavorId',
      purchaseLinkNameField: 'flavorName',
      controlLinkField: 'baldeControlId',
      controlCollection: COLLECTIONS.baldesControl,
      label: 'balde'
    };
  }

  if (kind === 'topping') {
    return {
      entityList: toppings,
      controlList: toppingControls,
      entityIdField: 'toppingId',
      entityNameField: 'toppingNombre',
      rawMaterialIdField: 'materiaPrimaId',
      rawMaterialNameField: 'materiaPrimaNombre',
      purchaseLinkField: 'toppingId',
      purchaseLinkNameField: 'toppingName',
      controlLinkField: 'toppingControlId',
      controlCollection: COLLECTIONS.toppingControls,
      label: 'topping'
    };
  }

  if (kind === 'sauce') {
    return {
      entityList: salsas,
      controlList: sauceControls,
      entityIdField: 'sauceId',
      entityNameField: 'sauceNombre',
      rawMaterialIdField: 'materiaPrimaId',
      rawMaterialNameField: 'materiaPrimaNombre',
      purchaseLinkField: 'sauceId',
      purchaseLinkNameField: 'sauceName',
      controlLinkField: 'sauceControlId',
      controlCollection: COLLECTIONS.sauceControls,
      label: 'salsa/aderezo'
    };
  }

  return null;
}

function getConsumableEntity(kind, entityId) {
  const config = getConsumableConfig(kind);
  if (!config) return null;
  return config.entityList.find(item => String(item.id) === String(entityId)) || null;
}

function getConsumableEntitiesByRawMaterial(kind, rawMaterialId) {
  const config = getConsumableConfig(kind);
  if (!config) return [];
  return config.entityList.filter(item => String(item[config.rawMaterialIdField] || '') === String(rawMaterialId || ''));
}

function buildConsumablePurchaseUnitLayers(kind, entityId) {
  const config = getConsumableConfig(kind);
  const entity = getConsumableEntity(kind, entityId);
  if (!config || !entity) {
    return [];
  }

  const rawMaterial = productos.find(producto => String(producto.id) === String(entity[config.rawMaterialIdField]));
  if (!rawMaterial) {
    return [];
  }

  const linkedEntities = getConsumableEntitiesByRawMaterial(kind, rawMaterial.id);
  const theoreticalYieldPerUnit = getMateriaPrimaStockIncrement(rawMaterial, 1);
  if (Number.isNaN(theoreticalYieldPerUnit) || theoreticalYieldPerUnit <= 0) {
    return [];
  }

  const layers = [];
  sortRecordsByDate(compras).forEach(compra => {
    const items = Array.isArray(compra.items) ? compra.items : [];
    items.forEach((item, itemIndex) => {
      if (String(item.id || '') !== String(rawMaterial.id)) {
        return;
      }

      const linkedId = String(item[config.purchaseLinkField] || '').trim();
      const matchesEntity = linkedId === String(entity.id) || (!linkedId && linkedEntities.length === 1);
      if (!matchesEntity) {
        return;
      }

      let remainingUnits = Number(item.cantidad || 0);
      const unitCost = Number(item.costo || 0);
      let sequence = 1;
      while (remainingUnits > 0.0000001) {
        const consumedUnits = remainingUnits >= 1 ? 1 : remainingUnits;
        const totalCost = unitCost * consumedUnits;
        const theoreticalYield = theoreticalYieldPerUnit * consumedUnits;
        layers.push({
          key: `${String(compra.id || 'purchase')}:${itemIndex}:${sequence}`,
          compraId: compra.id,
          documentoCompra: compra.documento || '',
          fechaCompra: compra.fecha || null,
          entidadId: entity.id,
          entidadNombre: entity.nombre || '',
          purchasedUnits: consumedUnits,
          costoTotal: totalCost,
          costoUnitarioTeorico: theoreticalYield > 0 ? totalCost / theoreticalYield : 0,
          rendimientoTeorico: theoreticalYield
        });
        remainingUnits -= consumedUnits;
        sequence += 1;
      }
    });
  });

  return layers;
}

function getAssignedConsumableLayer(kind, control) {
  const config = getConsumableConfig(kind);
  if (!config || !control) {
    return null;
  }

  const controlsForEntity = sortRecordsByDate(
    config.controlList.filter(item => String(item[config.entityIdField] || '') === String(control[config.entityIdField] || '')),
    'fechaApertura'
  );
  const controlIndex = controlsForEntity.findIndex(item => String(item.id) === String(control.id));
  if (controlIndex < 0) {
    return null;
  }

  const layers = buildConsumablePurchaseUnitLayers(kind, control[config.entityIdField]);
  return layers[controlIndex] || null;
}

function getNextConsumableLayer(kind, entityId) {
  const config = getConsumableConfig(kind);
  if (!config) {
    return null;
  }

  const controlsForEntity = config.controlList.filter(item => String(item[config.entityIdField] || '') === String(entityId || ''));
  const layers = buildConsumablePurchaseUnitLayers(kind, entityId);
  return layers[controlsForEntity.length] || null;
}

function applyConsumableCostSnapshot(control, layer) {
  if (!control || !layer) {
    return control;
  }

  control.capaCostoKey = layer.key;
  control.compraId = layer.compraId || null;
  control.documentoCompra = layer.documentoCompra || null;
  control.fechaCompra = layer.fechaCompra || null;
  control.unidadesApertura = Number(layer.purchasedUnits || 0);
  control.rendimientoTeorico = Number(layer.rendimientoTeorico || 0);
  control.costoAperturaTotal = Number(layer.costoTotal || 0);
  control.costoPorcionProvisional = Number(layer.costoUnitarioTeorico || 0);
  control.costoPorcionFinal = control.costoPorcionFinal === null || control.costoPorcionFinal === undefined
    ? null
    : Number(control.costoPorcionFinal || 0);
  control.rendimientoReal = control.rendimientoReal === null || control.rendimientoReal === undefined
    ? null
    : Number(control.rendimientoReal || 0);
  control.mermaReal = control.mermaReal === null || control.mermaReal === undefined
    ? null
    : Number(control.mermaReal || 0);
  control.costoEstado = control.costoPorcionFinal !== null ? 'final' : 'provisional';
  return control;
}

function ensureConsumableControlSnapshot(kind, control) {
  if (!control) {
    return null;
  }
  if (control.capaCostoKey && control.costoAperturaTotal !== undefined && control.costoAperturaTotal !== null) {
    return control;
  }
  const assignedLayer = getAssignedConsumableLayer(kind, control);
  if (!assignedLayer) {
    return control;
  }
  return applyConsumableCostSnapshot(control, assignedLayer);
}

function getControlCostValues(control, finalCost = false) {
  const finalUnitCost = Number(control?.costoPorcionFinal);
  const provisionalUnitCost = Number(control?.costoPorcionProvisional);
  const unitCost = finalCost && Number.isFinite(finalUnitCost) && finalUnitCost >= 0
    ? finalUnitCost
    : Number.isFinite(provisionalUnitCost) && provisionalUnitCost >= 0
      ? provisionalUnitCost
      : 0;
  return {
    unitCost,
    totalForQuantity(quantity) {
      return unitCost * Number(quantity || 0);
    }
  };
}

function applyFinalCostToSalesForControl(kind, control) {
  const config = getConsumableConfig(kind);
  if (!config || !control) {
    return [];
  }

  const affectedSales = [];
  ventas.forEach(venta => {
    let saleTouched = false;
    const items = Array.isArray(venta.items) ? venta.items : [];
    items.forEach(item => {
      if (kind === 'bucket') {
        const saboresItem = Array.isArray(item.sabores) ? item.sabores : [];
        saboresItem.forEach(flavor => {
          if (String(flavor[config.controlLinkField] || '') !== String(control.id)) {
            return;
          }
          const costValues = getControlCostValues(control, true);
          flavor.costoUnitarioFinal = costValues.unitCost;
          flavor.costoTotalFinal = costValues.totalForQuantity(flavor.porciones);
          if (flavor.costoUnitarioProvisional === undefined || flavor.costoUnitarioProvisional === null) {
            const provisionalValues = getControlCostValues(control, false);
            flavor.costoUnitarioProvisional = provisionalValues.unitCost;
            flavor.costoTotalProvisional = provisionalValues.totalForQuantity(flavor.porciones);
          }
          flavor.costoEstado = 'final';
          saleTouched = true;
        });
        return;
      }

      const addons = Array.isArray(item.adicionales) ? item.adicionales : [];
      addons.forEach(addon => {
        if (String(addon[config.controlLinkField] || '') !== String(control.id)) {
          return;
        }
        const costValues = getControlCostValues(control, true);
        addon.costoUnitarioFinal = costValues.unitCost;
        addon.costoTotalFinal = costValues.totalForQuantity(addon.cantidad);
        if (addon.costoUnitarioProvisional === undefined || addon.costoUnitarioProvisional === null) {
          const provisionalValues = getControlCostValues(control, false);
          addon.costoUnitarioProvisional = provisionalValues.unitCost;
          addon.costoTotalProvisional = provisionalValues.totalForQuantity(addon.cantidad);
        }
        addon.costoEstado = 'final';
        saleTouched = true;
      });
    });

    if (saleTouched) {
      affectedSales.push(venta);
    }
  });

  return affectedSales;
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

function findExistingConsumableCloseMovements(kind, control) {
  const config = getConsumableConfig(kind);
  if (!config || !control) {
    return [];
  }

  const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : null;
  const closeTime = closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate.getTime() : null;
  const expectedObservation = `Merma por cierre de ${config.label} ${control[config.entityNameField] || ''}`.trim();

  return inventoryMovements.filter(movement => {
    if (String(movement.tipo || '') !== 'cierre-control' || String(movement.direccion || '') !== 'salida') {
      return false;
    }
    if (String(movement.controlKind || '') === String(kind) && String(movement.controlId || '') === String(control.id)) {
      return true;
    }
    if (String(movement.productoId || '') !== String(control[config.rawMaterialIdField] || '')) {
      return false;
    }
    if (String(movement.observacion || '').trim() !== expectedObservation) {
      return false;
    }
    if (Number(movement.cantidad || 0) !== Number(control.mermaReal || 0)) {
      return false;
    }
    if (closeTime === null) {
      return true;
    }
    const movementTime = movement.fecha ? new Date(movement.fecha).getTime() : null;
    return movementTime === closeTime;
  });
}

function removeConsumableCloseInventoryMovements(kind, control) {
  const config = getConsumableConfig(kind);
  if (!config || !control) {
    return { removedMovements: [], affectedProduct: null, restoredQuantity: 0 };
  }

  const existingMovements = findExistingConsumableCloseMovements(kind, control);
  if (!existingMovements.length) {
    return { removedMovements: [], affectedProduct: null, restoredQuantity: 0 };
  }

  const producto = productos.find(item => String(item.id) === String(control[config.rawMaterialIdField] || ''));
  const restoredQuantity = existingMovements.reduce((sum, movement) => sum + Math.max(Number(movement.cantidad || 0), 0), 0);

  if (producto && restoredQuantity > 0) {
    producto.stock = Number(producto.stock || 0) + restoredQuantity;
  }

  const removedIds = new Set(existingMovements.map(movement => String(movement.id)));
  inventoryMovements = inventoryMovements.filter(movement => !removedIds.has(String(movement.id)));

  return {
    removedMovements: existingMovements,
    affectedProduct: producto || null,
    restoredQuantity
  };
}

function repairConsumableControls(kind) {
  const config = getConsumableConfig(kind);
  if (!config) {
    return { repairedControls: 0, createdMovements: 0, updatedSales: 0, updatedProducts: 0 };
  }

  let repairedControls = 0;
  let removedMovements = 0;
  const affectedSaleIds = new Set();
  const affectedProductIds = new Set();
  const removedMovementIds = new Set();

  sortRecordsByDate(config.controlList, 'fechaApertura').forEach(control => {
    ensureConsumableControlSnapshot(kind, control);
    if (String(control.estado || '') !== 'cerrado') {
      return;
    }

    const soldPortions = Number(control.porcionesVendidas || 0);
    const theoreticalYield = Number(control.rendimientoTeorico || 0);
    const rendimientoReal = Math.max(soldPortions, 0);
    const mermaReal = Math.max(theoreticalYield - rendimientoReal, 0);

    control.rendimientoReal = rendimientoReal;
    control.mermaReal = mermaReal;
    control.costoPorcionFinal = rendimientoReal > 0 ? Number(control.costoAperturaTotal || 0) / rendimientoReal : 0;
    control.costoEstado = 'final';
    repairedControls += 1;

    const affectedSales = applyFinalCostToSalesForControl(kind, control);
    affectedSales.forEach(venta => affectedSaleIds.add(String(venta.id)));

    const cleanupResult = removeConsumableCloseInventoryMovements(kind, control);
    if (cleanupResult.affectedProduct) {
      affectedProductIds.add(String(cleanupResult.affectedProduct.id));
    }
    removedMovements += cleanupResult.removedMovements.length;
    cleanupResult.removedMovements.forEach(movement => removedMovementIds.add(String(movement.id)));
  });

  return {
    repairedControls,
    removedMovements,
    removedMovementIds: Array.from(removedMovementIds),
    updatedSales: affectedSaleIds.size,
    updatedProducts: affectedProductIds.size
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

const { registerAuthRoutes, requireAuth } = createAuthHandlers({
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








