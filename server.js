const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./firebase");
const {
  createAuthHandlers,
  DEFAULT_AUTH_PASSWORD_ITERATIONS,
  DEFAULT_AUTH_TOKEN_DURATION_MS
} = require("./backend/auth");
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

// Crear producto
app.post("/productos", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { nombre, precio, tipo, type, stockMin, medida, ingredientes, stock, originalId, originalName, controlSabores, rendimientoPorCompra, pelotasPorUnidad, modoControl, inventoryMode } = req.body;
  const rawType = (tipo || type || '').trim();
  const normalizedType = normalizeProductType(rawType);
  let normalizedMode = normalizeInventoryMode(modoControl || inventoryMode);
  const computedStockMin = !isNaN(Number(stockMin)) ? Number(stockMin) : (stock !== undefined ? Number(stock) : NaN);
  const computedPrecio = normalizedType === 'materia prima' ? undefined : (!isNaN(Number(precio)) ? Number(precio) : NaN);
  if (normalizedType === 'materia prima') {
    normalizedMode = 'materia-prima';
  }
  const shouldUseRecipe = normalizedMode === 'receta' || normalizedMode === 'mixto';
  const shouldControlFlavors = normalizedMode === 'helado-sabores' || normalizedMode === 'mixto' || Boolean(controlSabores);
  const computedYield = normalizedType === 'materia prima' ? normalizeNonNegativeNumber(rendimientoPorCompra) : 0;
  const computedScoops = shouldControlFlavors ? Number(pelotasPorUnidad) : 0;
  if (!nombre || typeof nombre !== "string" || !normalizedType || isNaN(computedStockMin) || (normalizedType !== 'materia prima' && isNaN(computedPrecio))) {
    return res.status(400).json({ error: "Campos inválidos. nombre, tipo y stockMin son obligatorios. Precio de venta es obligatorio para producto terminado y productos." });
  }

  if (normalizedType !== 'materia prima' && !normalizedMode) {
    return res.status(400).json({ error: "Selecciona el modo de control del producto." });
  }

  if (normalizedMode === 'directo' && normalizedType !== 'productos') {
    return res.status(400).json({ error: "Los productos de control directo deben registrarse como productos." });
  }

  if ((normalizedMode === 'receta' || normalizedMode === 'mixto') && normalizedType !== 'producto terminado') {
    return res.status(400).json({ error: "Los productos con receta o mixtos deben registrarse como producto terminado." });
  }

  if (normalizedMode === 'helado-sabores' && normalizedType !== 'productos') {
    return res.status(400).json({ error: "Los productos de helado por sabores deben registrarse como productos." });
  }

  if (normalizedType === "materia prima" && (!medida || typeof medida !== "string")) {
    return res.status(400).json({ error: "Materia prima necesita una medición." });
  }

  if (normalizedType === "materia prima" && (Number.isNaN(computedYield) || computedYield <= 0)) {
    return res.status(400).json({ error: "La materia prima debe indicar cuántas porciones rinde cada unidad comprada." });
  }

  if (shouldControlFlavors && (!Number.isInteger(computedScoops) || computedScoops <= 0)) {
    return res.status(400).json({ error: "El producto con sabores debe indicar cuántas porciones o pelotas lleva por unidad." });
  }

  if (shouldUseRecipe) {
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
      return res.status(400).json({ error: "Producto terminado necesita ingredientes." });
    }
    const invalidIngredient = ingredientes.find(ing => !ing || !ing.nombre || typeof ing.nombre !== "string" || isNaN(Number(ing.cantidad)) || Number(ing.cantidad) <= 0);
    if (invalidIngredient) {
      return res.status(400).json({ error: "Cada ingrediente debe tener nombre y cantidad válidos." });
    }
    const missingMateriaPrima = ingredientes.find(ing => {
      const materia = (ing.id !== undefined && ing.id !== null)
        ? productos.find(p => String(p.id) === String(ing.id))
        : productos.find(p => p.nombre.toLowerCase() === ing.nombre.trim().toLowerCase());
      const materiaTipo = String(materia?.tipo || materia?.type || '').trim().toLowerCase();
      return !materia || materiaTipo !== "materia prima";
    });
    if (missingMateriaPrima) {
      return res.status(400).json({ error: `La materia prima ${missingMateriaPrima.nombre} no está registrada.` });
    }
  }

  const newProductData = {
    id: null,
    nombre: nombre.trim(),
    precio: normalizedType === 'materia prima' ? undefined : computedPrecio,
    tipo: normalizedType,
    modoControl: normalizedMode,
    stockMin: computedStockMin,
    medida: normalizedType === "materia prima" ? medida : undefined,
    ingredientes: shouldUseRecipe ? ingredientes : undefined,
    controlSabores: shouldControlFlavors,
    rendimientoPorCompra: normalizedType === "materia prima" ? computedYield : undefined,
    pelotasPorUnidad: shouldControlFlavors ? computedScoops : undefined,
    stock: 0
  };

  const newProductKey = productIdentityKey(newProductData);
  const exactDuplicate = productos.find(p => productIdentityKey(p) === newProductKey);
  const editingProduct = findProductoByIdOrName({ id: originalId, nombre: originalName });

  if (editingProduct) {
    if (exactDuplicate && String(exactDuplicate.id) !== String(editingProduct.id)) {
      return res.status(400).json({ error: "Ya existe un producto idéntico con las mismas características." });
    }
    editingProduct.nombre = newProductData.nombre;
    editingProduct.precio = newProductData.precio;
    editingProduct.tipo = newProductData.tipo;
    editingProduct.modoControl = newProductData.modoControl;
    editingProduct.stockMin = newProductData.stockMin;
    editingProduct.medida = newProductData.medida;
    editingProduct.ingredientes = newProductData.ingredientes;
    editingProduct.controlSabores = newProductData.controlSabores;
    editingProduct.rendimientoPorCompra = newProductData.rendimientoPorCompra;
    editingProduct.pelotasPorUnidad = newProductData.pelotasPorUnidad;
    await saveRecord(COLLECTIONS.productos, editingProduct);
    return res.status(200).json({ message: "Producto actualizado.", producto: editingProduct });
  }

  if (exactDuplicate) {
    return res.status(400).json({ error: "Ya existe un producto idéntico con las mismas características." });
  }

  const producto = {
    ...newProductData,
    id: createDocId(COLLECTIONS.productos)
  };
  productos.push(producto);
  await saveRecord(COLLECTIONS.productos, producto);
  res.status(201).json({ message: "Producto creado.", producto });
}));

app.get("/sabores", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.sabores]);
  res.json(sabores);
}));

app.get("/toppings", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.toppings]);
  res.json(toppings);
}));

app.get("/salsas", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.salsas]);
  res.json(salsas);
}));

app.post("/sabores", asyncHandler(async (req, res) => {
  await hydrateStore();
  const normalizedName = normalizeFlavorName(req.body?.nombre);
  const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : '';
  const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : '';

  if (!normalizedName) {
    return res.status(400).json({ error: "El nombre del sabor es obligatorio." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === materiaPrimaId && normalizeProductType(producto.tipo || producto.type) === 'materia prima');
  if (!materiaPrima) {
    return res.status(400).json({ error: "Selecciona la materia prima del balde para este sabor." });
  }

  const duplicateFlavor = sabores.find(sabor => sabor.nombre.toLowerCase() === normalizedName.toLowerCase());
  const editingFlavor = sabores.find(sabor => String(sabor.id) === originalId);

  if (editingFlavor) {
    if (duplicateFlavor && String(duplicateFlavor.id) !== String(editingFlavor.id)) {
      return res.status(400).json({ error: "Ya existe un sabor con ese nombre." });
    }
    editingFlavor.nombre = normalizedName;
    editingFlavor.materiaPrimaId = materiaPrima.id;
    editingFlavor.materiaPrimaNombre = materiaPrima.nombre;
    await saveRecord(COLLECTIONS.sabores, editingFlavor);
    return res.status(200).json({ message: "Sabor actualizado.", sabor: editingFlavor });
  }

  if (duplicateFlavor) {
    return res.status(400).json({ error: "Ya existe un sabor con ese nombre." });
  }

  const sabor = {
    id: createDocId(COLLECTIONS.sabores),
    nombre: normalizedName,
    materiaPrimaId: materiaPrima.id,
    materiaPrimaNombre: materiaPrima.nombre
  };

  sabores.push(sabor);
  await saveRecord(COLLECTIONS.sabores, sabor);
  res.status(201).json({ message: "Sabor creado.", sabor });
}));

app.post("/toppings", asyncHandler(async (req, res) => {
  await hydrateStore();
  const normalizedName = normalizeFlavorName(req.body?.nombre);
  const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : '';
  const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : '';

  if (!normalizedName) {
    return res.status(400).json({ error: "El nombre del topping es obligatorio." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === materiaPrimaId && normalizeProductType(producto.tipo || producto.type) === 'materia prima');
  if (!materiaPrima) {
    return res.status(400).json({ error: "Selecciona la materia prima del topping." });
  }

  const duplicateTopping = toppings.find(topping => topping.nombre.toLowerCase() === normalizedName.toLowerCase());
  const editingTopping = toppings.find(topping => String(topping.id) === originalId);

  if (editingTopping) {
    if (duplicateTopping && String(duplicateTopping.id) !== String(editingTopping.id)) {
      return res.status(400).json({ error: "Ya existe un topping con ese nombre." });
    }
    editingTopping.nombre = normalizedName;
    editingTopping.materiaPrimaId = materiaPrima.id;
    editingTopping.materiaPrimaNombre = materiaPrima.nombre;
    await saveRecord(COLLECTIONS.toppings, editingTopping);
    return res.status(200).json({ message: "Topping actualizado.", topping: editingTopping });
  }

  if (duplicateTopping) {
    return res.status(400).json({ error: "Ya existe un topping con ese nombre." });
  }

  const topping = {
    id: createDocId(COLLECTIONS.toppings),
    nombre: normalizedName,
    materiaPrimaId: materiaPrima.id,
    materiaPrimaNombre: materiaPrima.nombre
  };

  toppings.push(topping);
  await saveRecord(COLLECTIONS.toppings, topping);
  res.status(201).json({ message: "Topping creado.", topping });
}));

app.post("/salsas", asyncHandler(async (req, res) => {
  await hydrateStore();
  const normalizedName = normalizeFlavorName(req.body?.nombre);
  const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : '';
  const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : '';

  if (!normalizedName) {
    return res.status(400).json({ error: "El nombre de la salsa/aderezo es obligatorio." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === materiaPrimaId && normalizeProductType(producto.tipo || producto.type) === 'materia prima');
  if (!materiaPrima) {
    return res.status(400).json({ error: "Selecciona la materia prima de la salsa/aderezo." });
  }

  const duplicateSauce = salsas.find(sauce => sauce.nombre.toLowerCase() === normalizedName.toLowerCase());
  const editingSauce = salsas.find(sauce => String(sauce.id) === originalId);

  if (editingSauce) {
    if (duplicateSauce && String(duplicateSauce.id) !== String(editingSauce.id)) {
      return res.status(400).json({ error: "Ya existe una salsa/aderezo con ese nombre." });
    }
    editingSauce.nombre = normalizedName;
    editingSauce.materiaPrimaId = materiaPrima.id;
    editingSauce.materiaPrimaNombre = materiaPrima.nombre;
    await saveRecord(COLLECTIONS.salsas, editingSauce);
    return res.status(200).json({ message: "Salsa/aderezo actualizado.", sauce: editingSauce });
  }

  if (duplicateSauce) {
    return res.status(400).json({ error: "Ya existe una salsa/aderezo con ese nombre." });
  }

  const sauce = {
    id: createDocId(COLLECTIONS.salsas),
    nombre: normalizedName,
    materiaPrimaId: materiaPrima.id,
    materiaPrimaNombre: materiaPrima.nombre
  };

  salsas.push(sauce);
  await saveRecord(COLLECTIONS.salsas, sauce);
  res.status(201).json({ message: "Salsa/aderezo creado.", sauce });
}));

app.get("/baldes-control", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.baldesControl]);
  res.json(baldesControl.map(bucket => ensureConsumableControlSnapshot('bucket', bucket)));
}));

app.post("/baldes-control/abrir", asyncHandler(async (req, res) => {
  await hydrateStore();
  const saborId = req.body?.saborId !== undefined && req.body?.saborId !== null ? String(req.body.saborId) : '';
  const observacion = String(req.body?.observacion || '').trim();
  const fechaApertura = req.body?.fechaApertura ? new Date(req.body.fechaApertura) : new Date();

  if (!saborId) {
    return res.status(400).json({ error: "Selecciona un sabor para abrir el balde." });
  }

  if (Number.isNaN(fechaApertura.getTime())) {
    return res.status(400).json({ error: "La fecha de apertura no es válida." });
  }

  const sabor = sabores.find(item => String(item.id) === saborId);
  if (!sabor) {
    return res.status(404).json({ error: "Sabor no encontrado." });
  }

  if (getActiveBucketForFlavor(saborId)) {
    return res.status(400).json({ error: "Ya hay un balde abierto para este sabor." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === String(sabor.materiaPrimaId));
  if (!materiaPrima) {
    return res.status(400).json({ error: "La materia prima vinculada al sabor no existe." });
  }

  const flavorAvailableStock = getFlavorAvailableStock(sabor.id);
  if (Number.isNaN(flavorAvailableStock) || flavorAvailableStock <= 0) {
    return res.status(400).json({ error: `No puedes abrir el balde de ${sabor.nombre} porque no hay compra disponible para ese sabor en ${materiaPrima.nombre}.` });
  }

  const assignedLayer = getNextConsumableLayer('bucket', sabor.id);
  if (!assignedLayer) {
    return res.status(400).json({ error: `No hay una unidad de compra disponible para abrir un nuevo balde de ${sabor.nombre}.` });
  }

  const bucket = {
    id: createDocId(COLLECTIONS.baldesControl),
    saborId: sabor.id,
    saborNombre: sabor.nombre,
    materiaPrimaId: sabor.materiaPrimaId,
    materiaPrimaNombre: sabor.materiaPrimaNombre,
    fechaApertura: fechaApertura.toISOString(),
    fechaCierre: null,
    estado: 'abierto',
    porcionesVendidas: 0,
    ventasAsociadas: 0,
    observacionApertura: observacion || null,
    observacionCierre: null,
    rendimientoReal: null,
    mermaReal: null,
    costoPorcionFinal: null,
    costoEstado: 'provisional'
  };

  applyConsumableCostSnapshot(bucket, assignedLayer);

  baldesControl.push(bucket);
  await saveRecord(COLLECTIONS.baldesControl, bucket);
  res.status(201).json({ message: "Balde abierto correctamente.", balde: bucket });
}));

app.post("/baldes-control/:id/cerrar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const bucket = baldesControl.find(item => String(item.id) === String(id));
  if (!bucket) {
    return res.status(404).json({ error: "Balde no encontrado." });
  }

  if (bucket.estado !== 'abierto') {
    return res.status(400).json({ error: "El balde ya está cerrado." });
  }

  const observacion = String(req.body?.observacion || '').trim();
  const fechaCierre = req.body?.fechaCierre ? new Date(req.body.fechaCierre) : new Date();
  const rendimientoRealRaw = req.body?.rendimientoReal;
  if (Number.isNaN(fechaCierre.getTime())) {
    return res.status(400).json({ error: "La fecha de cierre no es válida." });
  }

  ensureConsumableControlSnapshot('bucket', bucket);
  const rendimientoReal = rendimientoRealRaw === undefined || rendimientoRealRaw === null || rendimientoRealRaw === ''
    ? Math.max(Number(bucket.rendimientoTeorico || 0), Number(bucket.porcionesVendidas || 0), 1)
    : Number(rendimientoRealRaw);
  if (Number.isNaN(rendimientoReal) || rendimientoReal <= 0) {
    return res.status(400).json({ error: "El rendimiento real del balde debe ser mayor a cero." });
  }
  if (rendimientoReal < Number(bucket.porcionesVendidas || 0)) {
    return res.status(400).json({ error: "El rendimiento real no puede ser menor que las porciones ya vendidas." });
  }

  bucket.estado = 'cerrado';
  bucket.fechaCierre = fechaCierre.toISOString();
  bucket.observacionCierre = observacion || null;
  bucket.rendimientoReal = rendimientoReal;
  bucket.mermaReal = Math.max(Number(bucket.rendimientoTeorico || 0) - rendimientoReal, 0);
  bucket.costoPorcionFinal = rendimientoReal > 0 ? Number(bucket.costoAperturaTotal || 0) / rendimientoReal : 0;
  bucket.costoEstado = 'final';

  const affectedSales = applyFinalCostToSalesForControl('bucket', bucket);
  const cleanupResult = removeConsumableCloseInventoryMovements('bucket', bucket);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.baldesControl, id: bucket.id, data: bucket },
    ...(cleanupResult.affectedProduct ? [
      { type: 'set', collection: COLLECTIONS.productos, id: cleanupResult.affectedProduct.id, data: cleanupResult.affectedProduct }
    ] : []),
    ...cleanupResult.removedMovements.map(movement => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id: movement.id })),
    ...affectedSales.map(venta => ({ type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }))
  ]);
  res.json({ message: "Balde cerrado correctamente y costo final aplicado a las ventas asociadas.", balde: bucket });
}));

app.get("/toppings-control", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.toppingControls]);
  res.json(toppingControls.map(control => ensureConsumableControlSnapshot('topping', control)));
}));

app.post("/toppings-control/abrir", asyncHandler(async (req, res) => {
  await hydrateStore();
  const toppingId = req.body?.toppingId !== undefined && req.body?.toppingId !== null ? String(req.body.toppingId) : '';
  const observacion = String(req.body?.observacion || '').trim();
  const fechaApertura = req.body?.fechaApertura ? new Date(req.body.fechaApertura) : new Date();

  if (!toppingId) {
    return res.status(400).json({ error: "Selecciona un topping para abrir el control." });
  }

  if (Number.isNaN(fechaApertura.getTime())) {
    return res.status(400).json({ error: "La fecha de apertura no es válida." });
  }

  const topping = toppings.find(item => String(item.id) === toppingId);
  if (!topping) {
    return res.status(404).json({ error: "Topping no encontrado." });
  }

  if (getActiveToppingControlForTopping(toppingId)) {
    return res.status(400).json({ error: "Ya hay un control abierto para este topping." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === String(topping.materiaPrimaId));
  if (!materiaPrima) {
    return res.status(400).json({ error: "La materia prima vinculada al topping no existe." });
  }

  const toppingAvailableStock = getToppingAvailableStock(topping.id);
  if (Number.isNaN(toppingAvailableStock) || toppingAvailableStock <= 0) {
    return res.status(400).json({ error: `No puedes abrir ${topping.nombre} porque no hay compra disponible para ese topping en ${materiaPrima.nombre}.` });
  }

  const assignedLayer = getNextConsumableLayer('topping', topping.id);
  if (!assignedLayer) {
    return res.status(400).json({ error: `No hay una unidad de compra disponible para abrir ${topping.nombre}.` });
  }

  const control = {
    id: createDocId(COLLECTIONS.toppingControls),
    toppingId: topping.id,
    toppingNombre: topping.nombre,
    materiaPrimaId: topping.materiaPrimaId,
    materiaPrimaNombre: topping.materiaPrimaNombre,
    fechaApertura: fechaApertura.toISOString(),
    fechaCierre: null,
    estado: 'abierto',
    porcionesVendidas: 0,
    ventasAsociadas: 0,
    observacionApertura: observacion || null,
    observacionCierre: null,
    rendimientoReal: null,
    mermaReal: null,
    costoPorcionFinal: null,
    costoEstado: 'provisional'
  };

  applyConsumableCostSnapshot(control, assignedLayer);

  toppingControls.push(control);
  await saveRecord(COLLECTIONS.toppingControls, control);
  res.status(201).json({ message: "Control de topping abierto correctamente.", control });
}));

app.post("/toppings-control/:id/cerrar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const control = toppingControls.find(item => String(item.id) === String(id));
  if (!control) {
    return res.status(404).json({ error: "Control de topping no encontrado." });
  }

  if (control.estado !== 'abierto') {
    return res.status(400).json({ error: "El control de topping ya está cerrado." });
  }

  const observacion = String(req.body?.observacion || '').trim();
  const fechaCierre = req.body?.fechaCierre ? new Date(req.body.fechaCierre) : new Date();
  const rendimientoRealRaw = req.body?.rendimientoReal;
  if (Number.isNaN(fechaCierre.getTime())) {
    return res.status(400).json({ error: "La fecha de cierre no es válida." });
  }

  ensureConsumableControlSnapshot('topping', control);
  const rendimientoReal = rendimientoRealRaw === undefined || rendimientoRealRaw === null || rendimientoRealRaw === ''
    ? Math.max(Number(control.rendimientoTeorico || 0), Number(control.porcionesVendidas || 0), 1)
    : Number(rendimientoRealRaw);
  if (Number.isNaN(rendimientoReal) || rendimientoReal <= 0) {
    return res.status(400).json({ error: "El rendimiento real del topping debe ser mayor a cero." });
  }
  if (rendimientoReal < Number(control.porcionesVendidas || 0)) {
    return res.status(400).json({ error: "El rendimiento real no puede ser menor que las porciones ya vendidas." });
  }

  control.estado = 'cerrado';
  control.fechaCierre = fechaCierre.toISOString();
  control.observacionCierre = observacion || null;
  control.rendimientoReal = rendimientoReal;
  control.mermaReal = Math.max(Number(control.rendimientoTeorico || 0) - rendimientoReal, 0);
  control.costoPorcionFinal = rendimientoReal > 0 ? Number(control.costoAperturaTotal || 0) / rendimientoReal : 0;
  control.costoEstado = 'final';

  const affectedSales = applyFinalCostToSalesForControl('topping', control);
  const cleanupResult = removeConsumableCloseInventoryMovements('topping', control);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.toppingControls, id: control.id, data: control },
    ...(cleanupResult.affectedProduct ? [
      { type: 'set', collection: COLLECTIONS.productos, id: cleanupResult.affectedProduct.id, data: cleanupResult.affectedProduct }
    ] : []),
    ...cleanupResult.removedMovements.map(movement => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id: movement.id })),
    ...affectedSales.map(venta => ({ type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }))
  ]);
  res.json({ message: "Control de topping cerrado correctamente y costo final aplicado a las ventas asociadas.", control });
}));

app.get("/salsas-control", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.sauceControls]);
  res.json(sauceControls.map(control => ensureConsumableControlSnapshot('sauce', control)));
}));

app.post("/salsas-control/abrir", asyncHandler(async (req, res) => {
  await hydrateStore();
  const sauceId = req.body?.sauceId !== undefined && req.body?.sauceId !== null ? String(req.body.sauceId) : '';
  const observacion = String(req.body?.observacion || '').trim();
  const fechaApertura = req.body?.fechaApertura ? new Date(req.body.fechaApertura) : new Date();

  if (!sauceId) {
    return res.status(400).json({ error: "Selecciona una salsa/aderezo para abrir el control." });
  }

  if (Number.isNaN(fechaApertura.getTime())) {
    return res.status(400).json({ error: "La fecha de apertura no es válida." });
  }

  const sauce = salsas.find(item => String(item.id) === sauceId);
  if (!sauce) {
    return res.status(404).json({ error: "Salsa/aderezo no encontrado." });
  }

  if (getActiveSauceControlForSauce(sauceId)) {
    return res.status(400).json({ error: "Ya hay un control abierto para esta salsa/aderezo." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === String(sauce.materiaPrimaId));
  if (!materiaPrima) {
    return res.status(400).json({ error: "La materia prima vinculada a la salsa/aderezo no existe." });
  }

  const sauceAvailableStock = getSauceAvailableStock(sauce.id);
  if (Number.isNaN(sauceAvailableStock) || sauceAvailableStock <= 0) {
    return res.status(400).json({ error: `No puedes abrir ${sauce.nombre} porque no hay compra disponible para esa salsa/aderezo en ${materiaPrima.nombre}.` });
  }

  const assignedLayer = getNextConsumableLayer('sauce', sauce.id);
  if (!assignedLayer) {
    return res.status(400).json({ error: `No hay una unidad de compra disponible para abrir ${sauce.nombre}.` });
  }

  const control = {
    id: createDocId(COLLECTIONS.sauceControls),
    sauceId: sauce.id,
    sauceNombre: sauce.nombre,
    materiaPrimaId: sauce.materiaPrimaId,
    materiaPrimaNombre: sauce.materiaPrimaNombre,
    fechaApertura: fechaApertura.toISOString(),
    fechaCierre: null,
    estado: 'abierto',
    porcionesVendidas: 0,
    ventasAsociadas: 0,
    observacionApertura: observacion || null,
    observacionCierre: null,
    rendimientoReal: null,
    mermaReal: null,
    costoPorcionFinal: null,
    costoEstado: 'provisional'
  };

  applyConsumableCostSnapshot(control, assignedLayer);

  sauceControls.push(control);
  await saveRecord(COLLECTIONS.sauceControls, control);
  res.status(201).json({ message: "Control de salsa/aderezo abierto correctamente.", control });
}));

app.post("/salsas-control/:id/cerrar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const control = sauceControls.find(item => String(item.id) === String(id));
  if (!control) {
    return res.status(404).json({ error: "Control de salsa/aderezo no encontrado." });
  }

  if (control.estado !== 'abierto') {
    return res.status(400).json({ error: "El control de salsa/aderezo ya está cerrado." });
  }

  const observacion = String(req.body?.observacion || '').trim();
  const fechaCierre = req.body?.fechaCierre ? new Date(req.body.fechaCierre) : new Date();
  const rendimientoRealRaw = req.body?.rendimientoReal;
  if (Number.isNaN(fechaCierre.getTime())) {
    return res.status(400).json({ error: "La fecha de cierre no es válida." });
  }

  ensureConsumableControlSnapshot('sauce', control);
  const rendimientoReal = rendimientoRealRaw === undefined || rendimientoRealRaw === null || rendimientoRealRaw === ''
    ? Math.max(Number(control.rendimientoTeorico || 0), Number(control.porcionesVendidas || 0), 1)
    : Number(rendimientoRealRaw);
  if (Number.isNaN(rendimientoReal) || rendimientoReal <= 0) {
    return res.status(400).json({ error: "El rendimiento real de la salsa/aderezo debe ser mayor a cero." });
  }
  if (rendimientoReal < Number(control.porcionesVendidas || 0)) {
    return res.status(400).json({ error: "El rendimiento real no puede ser menor que las porciones ya vendidas." });
  }

  control.estado = 'cerrado';
  control.fechaCierre = fechaCierre.toISOString();
  control.observacionCierre = observacion || null;
  control.rendimientoReal = rendimientoReal;
  control.mermaReal = Math.max(Number(control.rendimientoTeorico || 0) - rendimientoReal, 0);
  control.costoPorcionFinal = rendimientoReal > 0 ? Number(control.costoAperturaTotal || 0) / rendimientoReal : 0;
  control.costoEstado = 'final';

  const affectedSales = applyFinalCostToSalesForControl('sauce', control);
  const cleanupResult = removeConsumableCloseInventoryMovements('sauce', control);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.sauceControls, id: control.id, data: control },
    ...(cleanupResult.affectedProduct ? [
      { type: 'set', collection: COLLECTIONS.productos, id: cleanupResult.affectedProduct.id, data: cleanupResult.affectedProduct }
    ] : []),
    ...cleanupResult.removedMovements.map(movement => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id: movement.id })),
    ...affectedSales.map(venta => ({ type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }))
  ]);
  res.json({ message: "Control de salsa/aderezo cerrado correctamente y costo final aplicado a las ventas asociadas.", control });
}));

app.post("/controles/reparar-historico", asyncHandler(async (req, res) => {
  await hydrateStore();

  const bucketSummary = repairConsumableControls('bucket');
  const toppingSummary = repairConsumableControls('topping');
  const sauceSummary = repairConsumableControls('sauce');

  await commitBatch([
    ...baldesControl.map(bucket => ({ type: 'set', collection: COLLECTIONS.baldesControl, id: bucket.id, data: bucket })),
    ...toppingControls.map(control => ({ type: 'set', collection: COLLECTIONS.toppingControls, id: control.id, data: control })),
    ...sauceControls.map(control => ({ type: 'set', collection: COLLECTIONS.sauceControls, id: control.id, data: control })),
    ...productos.map(producto => ({ type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto })),
    ...bucketSummary.removedMovementIds.map(id => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id })),
    ...toppingSummary.removedMovementIds.map(id => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id })),
    ...sauceSummary.removedMovementIds.map(id => ({ type: 'delete', collection: COLLECTIONS.inventoryMovements, id })),
    ...inventoryMovements.map(movement => ({ type: 'set', collection: COLLECTIONS.inventoryMovements, id: movement.id, data: movement })),
    ...ventas.map(venta => ({ type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }))
  ]);

  const summary = {
    baldes: bucketSummary,
    toppings: toppingSummary,
    salsas: sauceSummary,
    totals: {
      controles: bucketSummary.repairedControls + toppingSummary.repairedControls + sauceSummary.repairedControls,
      movimientosEliminados: bucketSummary.removedMovements + toppingSummary.removedMovements + sauceSummary.removedMovements,
      ventasActualizadas: bucketSummary.updatedSales + toppingSummary.updatedSales + sauceSummary.updatedSales,
      productosActualizados: bucketSummary.updatedProducts + toppingSummary.updatedProducts + sauceSummary.updatedProducts
    }
  };

  res.json({
    message: 'Reparación histórica completada correctamente.',
    summary
  });
}));

// Ver productos
app.get("/productos", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.productos]);
  res.json(productos);
}));

// Registrar compra
app.post("/compras", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { documento, proveedor, fecha, items, id, nombre, cantidad, costo, paymentType, paymentMethod, dueDate, cashOut, cashReceived, paymentReference } = req.body;
  const invoiceItems = Array.isArray(items)
    ? items
    : (id || nombre || cantidad !== undefined || costo !== undefined)
      ? [{ id, nombre, cantidad, costo }]
      : [];

  if (!documento || !proveedor || !fecha || !invoiceItems.length) {
    return res.status(400).json({ error: "Campos inválidos. Documento, proveedor, fecha e items son obligatorios." });
  }

  const parsedDate = new Date(fecha);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "La fecha de la compra no es válida." });
  }

  const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || "").trim();

  if (!normalizedPaymentType || !normalizedPaymentMethod) {
    return res.status(400).json({ error: "Tipo de pago y método de pago son obligatorios." });
  }

  if (!["credito", "contado"].includes(normalizedPaymentType)) {
    return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
  }

  if (normalizedPaymentType === 'credito' && !dueDate) {
    return res.status(400).json({ error: "Fecha de vencimiento obligatoria para compras a crédito." });
  }

  const normalizedCashOut = cashOut === null || cashOut === undefined || cashOut === ""
    ? (cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived))
    : Number(cashOut);
  const normalizedPaymentReference = String(paymentReference || "").trim();

  if (normalizedPaymentType === 'contado' && (normalizedCashOut === null || Number.isNaN(normalizedCashOut) || normalizedCashOut <= 0)) {
    return res.status(400).json({ error: "Monto de salida inválido para compras de contado." });
  }

  if (normalizedPaymentType === 'contado' && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }

  const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === ""
    ? null
    : Number(cashReceived);

  const validatedItems = invoiceItems.map(item => {
    const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
    const itemNombre = String(item.nombre || '').trim();
    const itemCantidad = Number(item.cantidad);
    const itemCosto = Number(item.costo);
    const itemFlavorId = item.flavorId !== undefined && item.flavorId !== null ? String(item.flavorId).trim() : '';
    const itemToppingId = item.toppingId !== undefined && item.toppingId !== null ? String(item.toppingId).trim() : '';
    const itemSauceId = item.sauceId !== undefined && item.sauceId !== null ? String(item.sauceId).trim() : '';

    if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemCosto) || itemCosto < 0) {
      return null;
    }

    const producto = itemId
      ? productos.find(p => String(p.id) === itemId)
      : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

    if (!producto || !isPurchasableProduct(producto)) {
      return null;
    }

    const linkedFlavors = sabores.filter(flavor => String(flavor.materiaPrimaId || '') === String(producto.id));
    const linkedToppings = toppings.filter(topping => String(topping.materiaPrimaId || '') === String(producto.id));
    const linkedSauces = salsas.filter(sauce => String(sauce.materiaPrimaId || '') === String(producto.id));
    let selectedFlavor = null;
    let selectedTopping = null;
    let selectedSauce = null;
    if (linkedFlavors.length || linkedToppings.length || linkedSauces.length) {
      const selectedLinksCount = [itemFlavorId, itemToppingId, itemSauceId].filter(Boolean).length;
      if (selectedLinksCount !== 1) {
        return null;
      }

      if (itemFlavorId) {
        selectedFlavor = linkedFlavors.find(flavor => String(flavor.id) === itemFlavorId) || null;
        if (!selectedFlavor) {
          return null;
        }
      }

      if (itemToppingId) {
        selectedTopping = linkedToppings.find(topping => String(topping.id) === itemToppingId) || null;
        if (!selectedTopping) {
          return null;
        }
      }

      if (itemSauceId) {
        selectedSauce = linkedSauces.find(sauce => String(sauce.id) === itemSauceId) || null;
        if (!selectedSauce) {
          return null;
        }
      }

      if (!selectedFlavor && !selectedTopping && !selectedSauce) {
        return null;
      }
    }

    return {
      id: producto.id,
      nombre: producto.nombre,
      cantidad: itemCantidad,
      costo: itemCosto,
      flavorId: selectedFlavor ? selectedFlavor.id : null,
      flavorName: selectedFlavor ? selectedFlavor.nombre : null,
      toppingId: selectedTopping ? selectedTopping.id : null,
      toppingName: selectedTopping ? selectedTopping.nombre : null,
      sauceId: selectedSauce ? selectedSauce.id : null,
      sauceName: selectedSauce ? selectedSauce.nombre : null
    };
  });

  if (validatedItems.some(item => item === null)) {
    return res.status(400).json({ error: "Cada item debe tener producto válido, cantidad, precio y un sabor, topping o salsa/aderezo válido cuando la materia prima esté vinculada." });
  }

  validatedItems.forEach(item => {
    const producto = productos.find(p => String(p.id) === String(item.id));
    if (producto) {
      producto.stock += getMateriaPrimaStockIncrement(producto, item.cantidad);
    }
  });

  const totalAmount = validatedItems.reduce((sum, item) => sum + Number(item.costo || 0) * Number(item.cantidad || 0), 0);
  const initialPaymentHistory = normalizedPaymentType === "contado"
    ? [{
      id: crypto.randomUUID(),
      amount: totalAmount,
      date: parsedDate.toISOString(),
      paymentMethod: normalizedPaymentMethod,
      paymentReference: normalizedPaymentReference || null,
      note: 'Pago inicial de compra',
      account: getAccountFromPaymentMethod(normalizedPaymentMethod),
      createdAt: parsedDate.toISOString()
    }]
    : [];

  const compra = {
    id: createDocId(COLLECTIONS.compras),
    documento: String(documento).trim(),
    proveedor: String(proveedor).trim(),
    fecha: parsedDate.toISOString(),
    paymentType: normalizedPaymentType,
    originalPaymentType: normalizedPaymentType,
    paymentMethod: normalizedPaymentMethod,
    paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
    dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
    cashOut: normalizedPaymentType === "contado" ? normalizedCashOut : null,
    cashReceived: normalizedPaymentType === "contado" ? (normalizedCashReceived ?? normalizedCashOut) : null,
    cashChange: null,
    paidAt: normalizedPaymentType === "contado" ? parsedDate.toISOString() : null,
    paymentHistory: initialPaymentHistory,
    totalAmount,
    totalPaid: normalizedPaymentType === "contado" ? totalAmount : 0,
    balanceDue: normalizedPaymentType === "credito" ? totalAmount : 0,
    status: normalizedPaymentType === "credito" ? 'pendiente' : 'pagada',
    items: validatedItems
  };
  ensurePurchaseFinancialState(compra);
  compras.push(compra);
  const purchaseOperations = [
    ...validatedItems.map(item => {
      const producto = productos.find(p => String(p.id) === String(item.id));
      return producto ? { type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto } : null;
    }),
    { type: 'set', collection: COLLECTIONS.compras, id: compra.id, data: compra }
  ];
  if (normalizedPaymentType === 'contado') {
    initialPaymentHistory.forEach(paymentEntry => {
      syncPurchaseCardPendingPaymentOperations(compra, paymentEntry, purchaseOperations);
    });
  }
  await commitBatch([
    ...purchaseOperations
  ]);
  res.status(201).json({ message: "Compra registrada.", compra });
}));

// Registrar venta
app.post("/ventas", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { documento, cliente, fecha, items, id, nombre, cantidad, precio, paymentType, paymentMethod, dueDate, cashReceived, cashChange, paymentReference } = req.body;
  const invoiceItems = Array.isArray(items)
    ? items
    : (id || nombre || cantidad !== undefined || precio !== undefined)
      ? [{ id, nombre, cantidad, precio }]
      : [];

  if (!cliente || !fecha || !invoiceItems.length) {
    return res.status(400).json({ error: "Campos inválidos. Cliente, fecha e items son obligatorios." });
  }

  const normalizedDocument = String(documento || '').trim() || buildNextDocumentNumber(ventas, 'FV');

  const parsedDate = new Date(fecha);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "La fecha de la venta no es válida." });
  }

  const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || "").trim();
  const normalizedPaymentReference = String(paymentReference || "").trim();

  if (!normalizedPaymentType || !normalizedPaymentMethod) {
    return res.status(400).json({ error: "Tipo de pago y método de pago son obligatorios." });
  }

  if (!["credito", "contado"].includes(normalizedPaymentType)) {
    return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
  }

  if (normalizedPaymentType === "credito" && !dueDate) {
    return res.status(400).json({ error: "Fecha de vencimiento obligatoria para ventas a crédito." });
  }

  if (normalizedPaymentType === "contado" && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }

  const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived);
  const normalizedCashChange = cashChange === null || cashChange === undefined || cashChange === "" ? null : Number(cashChange);

  if (normalizedPaymentType === "contado" && (normalizedCashReceived === null || Number.isNaN(normalizedCashReceived) || normalizedCashReceived < 0)) {
    return res.status(400).json({ error: "Monto recibido inválido para ventas de contado." });
  }

  const validatedItems = invoiceItems.map(item => {
    const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
    const itemNombre = String(item.nombre || '').trim();
    const itemCantidad = Number(item.cantidad);
    const itemPrecio = Number(item.precio);
    const itemSabores = Array.isArray(item.sabores) ? item.sabores : [];
    const itemAdicionales = Array.isArray(item.adicionales) ? item.adicionales : [];

    if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemPrecio) || itemPrecio < 0) {
      return null;
    }

    const producto = itemId
      ? productos.find(p => String(p.id) === itemId)
      : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

    if (!producto) {
      return null;
    }

    const inventoryMode = getProductInventoryMode(producto);
    const requiresFlavorControl = inventoryMode === 'helado-sabores' || inventoryMode === 'mixto';
    const requiresRecipeControl = inventoryMode === 'receta' || inventoryMode === 'mixto';
    const pelotasPorUnidad = requiresFlavorControl ? Number(producto.pelotasPorUnidad || 0) : 0;
    const totalPelotasRequeridas = requiresFlavorControl ? itemCantidad * pelotasPorUnidad : 0;

    const normalizedSabores = itemSabores.map(sabor => {
      const saborId = sabor?.id !== undefined && sabor?.id !== null ? String(sabor.id) : '';
      const saborNombre = normalizeFlavorName(sabor?.nombre);
      const porciones = Number(sabor?.porciones);
      const registeredFlavor = saborId
        ? sabores.find(entry => String(entry.id) === saborId)
        : sabores.find(entry => entry.nombre.toLowerCase() === saborNombre.toLowerCase());

      if (!registeredFlavor || !Number.isInteger(porciones) || porciones <= 0) {
        return null;
      }

      return {
        id: registeredFlavor.id,
        nombre: registeredFlavor.nombre,
        porciones,
        materiaPrimaId: registeredFlavor.materiaPrimaId,
        materiaPrimaNombre: registeredFlavor.materiaPrimaNombre
      };
    }).filter(Boolean);

    const groupedSabores = normalizedSabores.reduce((accumulator, flavor) => {
      const existingFlavor = accumulator.find(entry => String(entry.id) === String(flavor.id));
      if (existingFlavor) {
        existingFlavor.porciones += flavor.porciones;
      } else {
        accumulator.push({ ...flavor });
      }
      return accumulator;
    }, []);

    if (requiresFlavorControl && !groupedSabores.length) {
      return null;
    }

    if (requiresFlavorControl && (!Number.isInteger(pelotasPorUnidad) || pelotasPorUnidad <= 0)) {
      return null;
    }

    const totalPorcionesAsignadas = groupedSabores.reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
    if (requiresFlavorControl && totalPorcionesAsignadas !== totalPelotasRequeridas) {
      return null;
    }

    if (inventoryMode === 'directo' && Number(producto.stock || 0) < itemCantidad) {
      return null;
    }

    let normalizedIngredientes = [];
    if (requiresRecipeControl) {
      const ingredientesProducto = Array.isArray(producto.ingredientes) ? producto.ingredientes : [];
      if (!ingredientesProducto.length) {
        return null;
      }
      normalizedIngredientes = ingredientesProducto.map(ingredient => {
        const materiaPrima = ingredient.id
          ? productos.find(entry => String(entry.id) === String(ingredient.id))
          : productos.find(entry => entry.nombre.toLowerCase() === String(ingredient.nombre || '').trim().toLowerCase());
        const consumoUnitario = Number(ingredient.cantidad || 0);
        if (!materiaPrima || Number.isNaN(consumoUnitario) || consumoUnitario <= 0) {
          return null;
        }
        return {
          id: materiaPrima.id,
          nombre: materiaPrima.nombre,
          cantidad: consumoUnitario * itemCantidad
        };
      });

      if (normalizedIngredientes.some(ingredient => ingredient === null)) {
        return null;
      }

      const insufficientIngredient = normalizedIngredientes.find(ingredient => {
        const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
        return !materiaPrima || Number(materiaPrima.stock || 0) < Number(ingredient.cantidad || 0);
      });
      if (insufficientIngredient) {
        return null;
      }
    }

    if (requiresFlavorControl) {
      const missingActiveBucket = groupedSabores.find(flavor => !getActiveBucketForFlavor(flavor.id));
      if (missingActiveBucket) {
        return null;
      }

      const insufficientFlavorStock = groupedSabores.find(flavor => {
        const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
        return !materiaPrimaFlavor || Number(materiaPrimaFlavor.stock || 0) < Number(flavor.porciones || 0);
      });

      if (insufficientFlavorStock) {
        return null;
      }
    }

    const normalizedAdicionales = itemAdicionales.map(adicional => {
      const tipoRaw = String(adicional?.tipo || '').trim().toLowerCase();
      const tipo = tipoRaw === 'topping-incluido' ? 'topping-incluido' : tipoRaw === 'topping' ? 'topping' : tipoRaw === 'extra' ? 'extra' : '';
      const adicionalId = adicional?.id !== undefined && adicional?.id !== null ? String(adicional.id) : '';
      const toppingRegistrado = tipo === 'topping' || tipo === 'topping-incluido' || tipo === 'extra'
        ? (adicionalId
          ? toppings.find(entry => String(entry.id) === adicionalId)
          : toppings.find(entry => entry.nombre.toLowerCase() === String(adicional?.nombre || '').trim().toLowerCase()))
        : null;
      const sauceRegistrada = tipo === 'extra'
        ? (adicionalId
          ? salsas.find(entry => String(entry.id) === adicionalId)
          : salsas.find(entry => entry.nombre.toLowerCase() === String(adicional?.nombre || '').trim().toLowerCase()))
        : null;
      const nombre = toppingRegistrado ? toppingRegistrado.nombre : sauceRegistrada ? sauceRegistrada.nombre : String(adicional?.nombre || '').trim();
      const cantidad = Number(adicional?.cantidad);
      const precio = tipo === 'topping-incluido' ? 0 : Number(adicional?.precio);

      if (!tipo || !nombre || !Number.isInteger(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
        return null;
      }

      if ((tipo === 'topping' || tipo === 'topping-incluido') && !toppingRegistrado) {
        return null;
      }

      if (toppingRegistrado) {
        const activeToppingControl = getActiveToppingControlForTopping(toppingRegistrado.id);
        if (!activeToppingControl) {
          return null;
        }

        if (getToppingAvailableStock(toppingRegistrado.id) < cantidad) {
          return null;
        }

        ensureConsumableControlSnapshot('topping', activeToppingControl);
        const provisionalCosts = getControlCostValues(activeToppingControl, false);
        return {
          id: toppingRegistrado.id,
          tipo,
          nombre,
          cantidad,
          precio,
          materiaPrimaId: toppingRegistrado.materiaPrimaId,
          materiaPrimaNombre: toppingRegistrado.materiaPrimaNombre,
          toppingControlId: activeToppingControl.id,
          sauceControlId: null,
          addonCategory: 'topping',
          costoUnitarioProvisional: provisionalCosts.unitCost,
          costoTotalProvisional: provisionalCosts.totalForQuantity(cantidad),
          costoUnitarioFinal: null,
          costoTotalFinal: null,
          costoEstado: 'provisional'
        };
      }

      if (sauceRegistrada) {
        const activeSauceControl = getActiveSauceControlForSauce(sauceRegistrada.id);
        if (!activeSauceControl) {
          return null;
        }

        if (getSauceAvailableStock(sauceRegistrada.id) < cantidad) {
          return null;
        }

        ensureConsumableControlSnapshot('sauce', activeSauceControl);
        const provisionalCosts = getControlCostValues(activeSauceControl, false);
        return {
          id: sauceRegistrada.id,
          tipo,
          nombre,
          cantidad,
          precio,
          materiaPrimaId: sauceRegistrada.materiaPrimaId,
          materiaPrimaNombre: sauceRegistrada.materiaPrimaNombre,
          toppingControlId: null,
          sauceControlId: activeSauceControl.id,
          addonCategory: 'sauce',
          costoUnitarioProvisional: provisionalCosts.unitCost,
          costoTotalProvisional: provisionalCosts.totalForQuantity(cantidad),
          costoUnitarioFinal: null,
          costoTotalFinal: null,
          costoEstado: 'provisional'
        };
      }

      return {
        id: null,
        tipo,
        nombre,
        cantidad,
        precio,
        materiaPrimaId: null,
        materiaPrimaNombre: null,
        toppingControlId: null,
        sauceControlId: null,
        addonCategory: null,
        costoUnitarioProvisional: null,
        costoTotalProvisional: null,
        costoUnitarioFinal: null,
        costoTotalFinal: null,
        costoEstado: 'pendiente'
      };
    });

    if (normalizedAdicionales.some(adicional => adicional === null)) {
      return null;
    }

    return {
      id: producto.id,
      nombre: producto.nombre,
      modoControl: inventoryMode,
      cantidad: itemCantidad,
      precio: itemPrecio,
      ingredientes: normalizedIngredientes,
      pelotasPorUnidad: requiresFlavorControl ? pelotasPorUnidad : null,
      adicionales: normalizedAdicionales,
      sabores: groupedSabores.map(flavor => {
        const activeBucket = getActiveBucketForFlavor(flavor.id);
        const bucketControl = activeBucket ? ensureConsumableControlSnapshot('bucket', activeBucket) : null;
        const provisionalCosts = getControlCostValues(bucketControl, false);
        return {
          ...flavor,
          baldeControlId: activeBucket ? activeBucket.id : null,
          costoUnitarioProvisional: activeBucket ? provisionalCosts.unitCost : null,
          costoTotalProvisional: activeBucket ? provisionalCosts.totalForQuantity(flavor.porciones) : null,
          costoUnitarioFinal: null,
          costoTotalFinal: null,
          costoEstado: activeBucket ? 'provisional' : 'pendiente'
        };
      })
    };
  });

  if (validatedItems.some(item => item === null)) {
    return res.status(400).json({ error: "Cada item debe tener producto válido, stock suficiente, cantidad y precio." });
  }

  const totalFactura = validatedItems.reduce((sum, item) => sum + item.cantidad * item.precio + (Array.isArray(item.adicionales) ? item.adicionales.reduce((addonsSum, adicional) => addonsSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0) : 0), 0);
  if (normalizedPaymentType === "contado" && normalizedCashReceived < totalFactura) {
    return res.status(400).json({ error: "El monto recibido debe cubrir el total de la factura." });
  }

  validatedItems.forEach(item => {
    const producto = productos.find(p => String(p.id) === String(item.id));
    const inventoryMode = item.modoControl || getProductInventoryMode(producto);
    if (producto && inventoryMode === 'directo') {
      producto.stock -= item.cantidad;
    }

    if (inventoryMode === 'receta' || inventoryMode === 'mixto') {
      (item.ingredientes || []).forEach(ingredient => {
        const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
        if (materiaPrima) {
          materiaPrima.stock -= Number(ingredient.cantidad || 0);
        }
      });
    }

    if (inventoryMode === 'helado-sabores' || inventoryMode === 'mixto') {
      item.sabores.forEach(flavor => {
        const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
        if (materiaPrimaFlavor) {
          materiaPrimaFlavor.stock -= Number(flavor.porciones || 0);
        }
        const activeBucket = flavor.baldeControlId
          ? baldesControl.find(bucket => String(bucket.id) === String(flavor.baldeControlId) && bucket.estado === 'abierto')
          : getActiveBucketForFlavor(flavor.id);
        if (activeBucket) {
          activeBucket.porcionesVendidas += Number(flavor.porciones || 0);
        }
      });

      const bucketIds = [...new Set(item.sabores.map(flavor => String(flavor.baldeControlId || '')).filter(Boolean))];
      bucketIds.forEach(bucketId => {
        const activeBucket = baldesControl.find(bucket => String(bucket.id) === bucketId && bucket.estado === 'abierto');
        if (activeBucket) {
          activeBucket.ventasAsociadas += 1;
        }
      });
    }

    (item.adicionales || []).forEach(adicional => {
      if (adicional.materiaPrimaId) {
        const materiaPrimaAdicional = productos.find(entry => String(entry.id) === String(adicional.materiaPrimaId));
        if (materiaPrimaAdicional) {
          materiaPrimaAdicional.stock -= Number(adicional.cantidad || 0);
        }
      }

      const activeToppingControl = adicional.toppingControlId
        ? toppingControls.find(control => String(control.id) === String(adicional.toppingControlId) && control.estado === 'abierto')
        : (adicional.id ? getActiveToppingControlForTopping(adicional.id) : null);
      if (activeToppingControl) {
        activeToppingControl.porcionesVendidas += Number(adicional.cantidad || 0);
      }

      const activeSauceControl = adicional.sauceControlId
        ? sauceControls.find(control => String(control.id) === String(adicional.sauceControlId) && control.estado === 'abierto')
        : (adicional.id ? getActiveSauceControlForSauce(adicional.id) : null);
      if (activeSauceControl) {
        activeSauceControl.porcionesVendidas += Number(adicional.cantidad || 0);
      }
    });

    const toppingControlIds = [...new Set((item.adicionales || []).map(adicional => String(adicional.toppingControlId || '')).filter(Boolean))];
    toppingControlIds.forEach(controlId => {
      const activeToppingControl = toppingControls.find(control => String(control.id) === controlId && control.estado === 'abierto');
      if (activeToppingControl) {
        activeToppingControl.ventasAsociadas += 1;
      }
    });

    const sauceControlIds = [...new Set((item.adicionales || []).map(adicional => String(adicional.sauceControlId || '')).filter(Boolean))];
    sauceControlIds.forEach(controlId => {
      const activeSauceControl = sauceControls.find(control => String(control.id) === controlId && control.estado === 'abierto');
      if (activeSauceControl) {
        activeSauceControl.ventasAsociadas += 1;
      }
    });
  });

  const venta = {
    id: createDocId(COLLECTIONS.ventas),
    documento: normalizedDocument,
    cliente: String(cliente).trim(),
    fecha: parsedDate.toISOString(),
    paymentType: normalizedPaymentType,
    originalPaymentType: normalizedPaymentType,
    paymentMethod: normalizedPaymentMethod,
    paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
    dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
    cashReceived: normalizedPaymentType === "contado" ? normalizedCashReceived : null,
    cashChange: normalizedPaymentType === "contado" ? (normalizedCashChange ?? (normalizedCashReceived - totalFactura)) : null,
    paidAt: normalizedPaymentType === "contado" ? parsedDate.toISOString() : null,
    paymentHistory: normalizedPaymentType === 'contado'
      ? [{
        id: crypto.randomUUID(),
        amount: totalFactura,
        date: parsedDate.toISOString(),
        paymentMethod: normalizedPaymentMethod,
        paymentReference: normalizedPaymentReference || null,
        note: 'Pago inicial de venta',
        account: getAccountFromPaymentMethod(normalizedPaymentMethod),
        createdAt: parsedDate.toISOString()
      }]
      : [],
    totalAmount: totalFactura,
    totalPaid: normalizedPaymentType === 'contado' ? totalFactura : 0,
    balanceDue: normalizedPaymentType === 'credito' ? totalFactura : 0,
    status: normalizedPaymentType === 'credito' ? 'pendiente' : 'pagada',
    items: validatedItems
  };
  ensureSaleFinancialState(venta);
  ventas.push(venta);
  await commitBatch([
    ...productos.map(producto => ({ type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto })),
    ...baldesControl.map(bucket => ({ type: 'set', collection: COLLECTIONS.baldesControl, id: bucket.id, data: bucket })),
    ...toppingControls.map(control => ({ type: 'set', collection: COLLECTIONS.toppingControls, id: control.id, data: control })),
    ...sauceControls.map(control => ({ type: 'set', collection: COLLECTIONS.sauceControls, id: control.id, data: control })),
    { type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }
  ]);
  res.status(201).json({ message: "Venta registrada.", venta });
}));

// Historial de compras
app.get("/compras", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.compras]);
  res.json(compras.map(compra => ensurePurchaseFinancialState(compra)));
}));

app.post("/compras/:id/pagar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const compra = compras.find(item => String(item.id) === String(id));

  if (!compra) {
    return res.status(404).json({ error: "Compra no encontrada." });
  }

  const currentPaymentType = String(compra.paymentType || '').toLowerCase();
  const originalPaymentType = String(compra.originalPaymentType || compra.paymentType || '').toLowerCase();
  const isCreditPurchase = currentPaymentType === 'credito' || originalPaymentType === 'credito';
  const isCashPurchase = currentPaymentType === 'contado' || originalPaymentType === 'contado';

  if (!isCreditPurchase && !isCashPurchase) {
    return res.status(400).json({ error: "Solo se pueden aplicar o editar pagos de compras registradas a crédito o contado." });
  }

  const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
  const paymentReference = String(req.body?.paymentReference || '').trim();
  const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();

  if (!paymentMethod) {
    return res.status(400).json({ error: "El método de pago es obligatorio." });
  }
  if (!CREDIT_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }

  if (Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "La fecha de pago no es válida." });
  }

  if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  ensurePurchaseFinancialState(compra);
  const totalAmount = Number(compra.totalAmount || calculatePurchaseInvoiceTotal(compra));
  const existingPaymentHistory = Array.isArray(compra.paymentHistory) ? compra.paymentHistory : [];
  const requestedPaymentEntryId = String(req.body?.paymentEntryId || '').trim();
  const canEditSingleSettledCreditPayment = isCreditPurchase && Number(compra.balanceDue || 0) <= 0.0001 && existingPaymentHistory.length === 1;
  const existingPayment = isCreditPurchase
    ? (requestedPaymentEntryId
      ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
      : (canEditSingleSettledCreditPayment ? existingPaymentHistory[0] : null))
    : null;
  const paymentAmount = isCreditPurchase
    ? Number(req.body?.amount)
    : totalAmount;

  if (requestedPaymentEntryId && isCreditPurchase && !existingPayment) {
    return res.status(404).json({ error: "No se encontró el abono seleccionado para esta compra." });
  }

  if (isCreditPurchase) {
    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
    }
    const maxAllowedAmount = existingPayment
      ? Number(compra.balanceDue || 0) + Number(existingPayment.amount || 0)
      : Number(compra.balanceDue || 0);
    if (paymentAmount - maxAllowedAmount > 0.0001) {
      return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
    }
  }

  const receiptNumber = paymentMethod === 'efectivo'
    ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
    : null;
  const resolvedPaymentReference = paymentMethod === 'efectivo'
    ? receiptNumber
    : (paymentReference || null);

  compra.originalPaymentType = originalPaymentType || (isCashPurchase ? 'contado' : 'credito');
  compra.paymentType = isCashPurchase ? 'contado' : 'credito';
  compra.cashOut = totalAmount;
  compra.cashReceived = totalAmount;
  compra.cashChange = 0;
  const cashPurchasePaymentId = existingPaymentHistory[0]?.id || crypto.randomUUID();
  compra.paymentHistory = isCashPurchase
    ? [{
      id: cashPurchasePaymentId,
      amount: totalAmount,
      date: paidAt.toISOString(),
      paymentMethod,
      paymentReference: resolvedPaymentReference,
      receiptNumber,
      note: 'Pago actualizado de compra de contado',
      account: getAccountFromPaymentMethod(paymentMethod),
      createdAt: new Date().toISOString()
    }]
    : existingPayment
      ? existingPaymentHistory.map(entry => String(entry.id) === String(existingPayment.id)
        ? {
          id: existingPayment.id || crypto.randomUUID(),
          amount: paymentAmount,
          date: paidAt.toISOString(),
          paymentMethod,
          paymentReference: resolvedPaymentReference,
          receiptNumber,
          note: existingPayment.note || 'Abono a compra a crédito',
          account: getAccountFromPaymentMethod(paymentMethod),
          createdAt: existingPayment.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        : entry)
    : [
      ...(Array.isArray(compra.paymentHistory) ? compra.paymentHistory : []),
      {
        id: crypto.randomUUID(),
        amount: paymentAmount,
        date: paidAt.toISOString(),
        paymentMethod,
        paymentReference: resolvedPaymentReference,
        receiptNumber,
        note: 'Abono a compra a crédito',
        account: getAccountFromPaymentMethod(paymentMethod),
        createdAt: new Date().toISOString()
      }
    ];

  ensurePurchaseFinancialState(compra);
  const purchaseOperations = [
    { type: 'set', collection: COLLECTIONS.compras, id: compra.id, data: compra }
  ];
  const syncedPaymentEntries = Array.isArray(compra.paymentHistory) ? compra.paymentHistory : [];
  syncedPaymentEntries.forEach(paymentEntry => {
    syncPurchaseCardPendingPaymentOperations(compra, paymentEntry, purchaseOperations);
  });

  await commitBatch(purchaseOperations);
  res.json({
    message: isCashPurchase
      ? "Pago actualizado correctamente."
      : existingPayment
        ? compra.balanceDue <= 0
          ? "Abono actualizado y cuenta saldada correctamente."
          : "Abono actualizado correctamente."
      : compra.balanceDue <= 0
        ? "Abono aplicado y cuenta saldada correctamente."
        : "Abono aplicado correctamente.",
    compra
  });
}));

// Historial de ventas
app.get("/ventas", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.ventas]);
  res.json(ventas.map(venta => ensureSaleFinancialState(venta)));
}));

app.get("/pagos-categorias", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.paymentCategories]);
  const sortedCategories = paymentCategories.slice().sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es', { sensitivity: 'base' }));
  res.json(sortedCategories);
}));

app.post("/pagos-categorias", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.paymentCategories, COLLECTIONS.pagos]);
  const originalId = String(req.body?.originalId || '').trim();
  const nombre = String(req.body?.nombre || '').trim();
  const descripcion = String(req.body?.descripcion || '').trim();
  const normalizedName = nombre.toLowerCase();

  if (!nombre) {
    return res.status(400).json({ error: "El nombre de la clasificación es obligatorio." });
  }

  const duplicatedCategory = paymentCategories.find(item => String(item.nombre || '').trim().toLowerCase() === normalizedName && String(item.id) !== originalId);
  if (duplicatedCategory) {
    return res.status(409).json({ error: "Ya existe una clasificación con ese nombre." });
  }

  const now = new Date().toISOString();
  if (originalId) {
    const category = paymentCategories.find(item => String(item.id) === originalId);
    if (!category) {
      return res.status(404).json({ error: "Clasificación no encontrada." });
    }

    category.nombre = nombre;
    category.descripcion = descripcion || null;
    category.updatedAt = now;

    pagos.forEach(payment => {
      if (String(payment.categoriaId || '') === originalId) {
        payment.categoriaNombre = nombre;
        payment.updatedAt = now;
      }
    });

    await commitBatch([
      { type: 'set', collection: COLLECTIONS.paymentCategories, id: category.id, data: category },
      ...pagos
        .filter(payment => String(payment.categoriaId || '') === originalId)
        .map(payment => ({ type: 'set', collection: COLLECTIONS.pagos, id: payment.id, data: payment }))
    ]);

    return res.json({ message: "Clasificación actualizada correctamente.", category });
  }

  const category = {
    id: createDocId(COLLECTIONS.paymentCategories),
    nombre,
    descripcion: descripcion || null,
    createdAt: now,
    updatedAt: now
  };

  paymentCategories.push(category);
  await saveRecord(COLLECTIONS.paymentCategories, category);
  res.status(201).json({ message: "Clasificación creada correctamente.", category });
}));

app.delete("/pagos-categorias/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const categoryIndex = paymentCategories.findIndex(item => String(item.id) === String(id));
  if (categoryIndex < 0) {
    return res.status(404).json({ error: "Clasificación no encontrada." });
  }

  const categoryInUse = pagos.some(payment => String(payment.categoriaId || '') === String(id));
  if (categoryInUse) {
    return res.status(409).json({ error: "No se puede eliminar una clasificación que ya tiene pagos registrados." });
  }

  paymentCategories.splice(categoryIndex, 1);
  await deleteRecord(COLLECTIONS.paymentCategories, id);
  res.json({ message: "Clasificación eliminada correctamente." });
}));

app.get("/pagos", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.pagos]);
  const sortedPayments = pagos.slice().sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
  res.json(sortedPayments);
}));

app.post("/pagos", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.pagos, COLLECTIONS.paymentCategories, COLLECTIONS.compras, COLLECTIONS.externalDebts]);
  const descripcion = String(req.body?.descripcion || '').trim();
  const beneficiario = String(req.body?.beneficiario || '').trim();
  const categoriaId = String(req.body?.categoriaId || '').trim();
  const observacion = String(req.body?.observacion || '').trim();
  const referencia = String(req.body?.referencia || '').trim();
  const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
  const amount = Number(req.body?.monto);
  const paymentDate = req.body?.fecha ? new Date(req.body.fecha) : new Date();
  const category = paymentCategories.find(item => String(item.id) === categoriaId);

  if (!descripcion) {
    return res.status(400).json({ error: "La descripción del pago es obligatoria." });
  }
  if (!category) {
    return res.status(400).json({ error: "Selecciona una clasificación válida para el pago." });
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "El monto del pago debe ser mayor a cero." });
  }
  if (Number.isNaN(paymentDate.getTime())) {
    return res.status(400).json({ error: "La fecha del pago no es válida." });
  }
  if (!OUTGOING_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }
  if (paymentMethod === 'transferencia' && !referencia) {
    return res.status(400).json({ error: "La referencia es obligatoria para pagos por transferencia." });
  }

  const receiptNumber = paymentMethod === 'efectivo'
    ? buildNextOutgoingReceiptNumber()
    : null;
  const resolvedReference = paymentMethod === 'efectivo'
    ? receiptNumber
    : (referencia || null);

  const now = new Date().toISOString();
  const payment = {
    id: createDocId(COLLECTIONS.pagos),
    descripcion,
    beneficiario: beneficiario || null,
    categoriaId: category.id,
    categoriaNombre: category.nombre,
    monto: amount,
    fecha: paymentDate.toISOString(),
    paymentMethod,
    referencia: resolvedReference,
    receiptNumber,
    receiptIssuedAt: receiptNumber ? now : null,
    observacion: observacion || null,
    status: paymentMethod === 'tarjeta-credito' ? 'pendiente-reembolso' : 'registrado',
    reimbursementMethod: paymentMethod === 'tarjeta-credito' ? 'transferencia' : null,
    reimbursementReference: null,
    reimbursedAt: null,
    createdAt: now,
    updatedAt: now
  };

  pagos.push(payment);
  await saveRecord(COLLECTIONS.pagos, payment);
  res.status(201).json({
    message: paymentMethod === 'tarjeta-credito'
      ? 'Pago con tarjeta registrado como pendiente de reembolso.'
      : paymentMethod === 'efectivo'
        ? `Pago registrado correctamente. Recibo ${receiptNumber} generado.`
        : 'Pago registrado correctamente.',
    payment
  });
}));

app.patch("/pagos/:id", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.pagos, COLLECTIONS.paymentCategories, COLLECTIONS.compras, COLLECTIONS.externalDebts]);
  const { id } = req.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const payment = pagos.find(item => String(item.id) === String(id));
  if (!payment) {
    return res.status(404).json({ error: "Pago no encontrado." });
  }

  const descripcion = String(req.body?.descripcion || '').trim();
  const beneficiario = String(req.body?.beneficiario || '').trim();
  const categoriaId = String(req.body?.categoriaId || '').trim();
  const observacion = String(req.body?.observacion || '').trim();
  const referencia = String(req.body?.referencia || '').trim();
  const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
  const amount = Number(req.body?.monto);
  const paymentDate = req.body?.fecha ? new Date(req.body.fecha) : new Date(payment.fecha || payment.createdAt || Date.now());
  const category = paymentCategories.find(item => String(item.id) === categoriaId);

  if (!descripcion) {
    return res.status(400).json({ error: "La descripción del pago es obligatoria." });
  }
  if (!category) {
    return res.status(400).json({ error: "Selecciona una clasificación válida para el pago." });
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "El monto del pago debe ser mayor a cero." });
  }
  if (Number.isNaN(paymentDate.getTime())) {
    return res.status(400).json({ error: "La fecha del pago no es válida." });
  }
  if (!OUTGOING_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }
  if (paymentMethod === 'transferencia' && !referencia) {
    return res.status(400).json({ error: "La referencia es obligatoria para pagos por transferencia." });
  }

  const receiptNumber = paymentMethod === 'efectivo'
    ? (payment.receiptNumber || buildNextOutgoingReceiptNumber())
    : null;

  payment.descripcion = descripcion;
  payment.beneficiario = beneficiario || null;
  payment.categoriaId = category.id;
  payment.categoriaNombre = category.nombre;
  payment.monto = amount;
  payment.fecha = paymentDate.toISOString();
  payment.paymentMethod = paymentMethod;
  payment.referencia = paymentMethod === 'efectivo' ? receiptNumber : (referencia || null);
  payment.receiptNumber = receiptNumber;
  payment.receiptIssuedAt = paymentMethod === 'efectivo'
    ? (payment.receiptIssuedAt || new Date().toISOString())
    : null;
  payment.observacion = observacion || null;
  if (paymentMethod === 'tarjeta-credito') {
    payment.status = payment.reimbursedAt ? 'reembolsado' : 'pendiente-reembolso';
    payment.reimbursementMethod = payment.reimbursedAt ? (payment.reimbursementMethod || 'transferencia') : 'transferencia';
  } else {
    payment.status = 'registrado';
    payment.reimbursementMethod = null;
    payment.reimbursementReference = null;
    payment.reimbursedAt = null;
  }
  payment.updatedAt = new Date().toISOString();

  await saveRecord(COLLECTIONS.pagos, payment);
  res.json({
    message: paymentMethod === 'efectivo'
      ? `Pago actualizado correctamente. Recibo ${receiptNumber} listo.`
      : 'Pago actualizado correctamente.',
    payment
  });
}));

app.post("/pagos/:id/reembolsar", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.pagos]);
  const { id } = req.params;
  const payment = pagos.find(item => String(item.id) === String(id));
  if (!payment) {
    return res.status(404).json({ error: "Pago no encontrado." });
  }
  if (String(payment.paymentMethod || '') !== 'tarjeta-credito') {
    return res.status(400).json({ error: "Solo los pagos con tarjeta de crédito pueden marcarse como reembolsados por transferencia." });
  }
  if (payment.reimbursedAt) {
    return res.status(409).json({ error: "Este pago ya fue reembolsado." });
  }

  const reimbursementReference = String(req.body?.reimbursementReference || '').trim();
  const reimbursementDate = req.body?.reimbursedAt ? new Date(req.body.reimbursedAt) : new Date();

  if (!reimbursementReference) {
    return res.status(400).json({ error: "La referencia de la transferencia es obligatoria para cerrar el reembolso." });
  }
  if (Number.isNaN(reimbursementDate.getTime())) {
    return res.status(400).json({ error: "La fecha del reembolso no es válida." });
  }

  payment.reimbursementMethod = 'transferencia';
  payment.reimbursementReference = reimbursementReference;
  payment.reimbursedAt = reimbursementDate.toISOString();
  payment.status = 'reembolsado';
  payment.updatedAt = new Date().toISOString();

  await saveRecord(COLLECTIONS.pagos, payment);
  res.json({ message: "Reembolso por transferencia registrado correctamente.", payment });
}));

app.post("/pagos/reembolsar-lote", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.pagos]);
  const paymentIds = Array.isArray(req.body?.paymentIds)
    ? req.body.paymentIds.map(id => String(id || '').trim()).filter(Boolean)
    : [];
  const uniqueIds = Array.from(new Set(paymentIds));
  const reimbursementReference = String(req.body?.reimbursementReference || '').trim();
  const reimbursementDate = req.body?.reimbursedAt ? new Date(req.body.reimbursedAt) : new Date();

  if (!uniqueIds.length) {
    return res.status(400).json({ error: "Selecciona al menos un pago pendiente para registrar el reembolso." });
  }
  if (!reimbursementReference) {
    return res.status(400).json({ error: "La referencia de la transferencia es obligatoria para cerrar el reembolso." });
  }
  if (Number.isNaN(reimbursementDate.getTime())) {
    return res.status(400).json({ error: "La fecha del reembolso no es válida." });
  }

  const selectedPayments = uniqueIds.map(id => pagos.find(item => String(item.id) === id));
  if (selectedPayments.some(payment => !payment)) {
    return res.status(404).json({ error: "Uno o más pagos no fueron encontrados." });
  }
  if (selectedPayments.some(payment => String(payment.paymentMethod || '') !== 'tarjeta-credito')) {
    return res.status(400).json({ error: "Solo los pagos con tarjeta de crédito pueden marcarse como reembolsados por transferencia." });
  }
  if (selectedPayments.some(payment => payment.reimbursedAt)) {
    return res.status(409).json({ error: "Uno o más pagos seleccionados ya fueron reembolsados." });
  }

  const updatedAt = new Date().toISOString();
  selectedPayments.forEach(payment => {
    payment.reimbursementMethod = 'transferencia';
    payment.reimbursementReference = reimbursementReference;
    payment.reimbursedAt = reimbursementDate.toISOString();
    payment.status = 'reembolsado';
    payment.updatedAt = updatedAt;
  });

  await commitBatch(selectedPayments.map(payment => ({
    type: 'set',
    collection: COLLECTIONS.pagos,
    id: payment.id,
    data: payment
  })));

  res.json({
    message: uniqueIds.length === 1
      ? 'Reembolso por transferencia registrado correctamente.'
      : `Transferencia registrada correctamente para ${uniqueIds.length} pagos.`,
    payments: selectedPayments
  });
}));

app.get("/efectivo/traslados", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.fundTransfers]);
  const sortedTransfers = fundTransfers
    .slice()
    .sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
  res.json(sortedTransfers);
}));

app.get("/efectivo/configuracion", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.fundSettings]);
  res.json(getCurrentFundSettings());
}));

app.post("/efectivo/configuracion", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.fundSettings]);

  const openingCashBalance = normalizeNonNegativeAmount(req.body?.openingCashBalance);
  const openingBankBalance = normalizeNonNegativeAmount(req.body?.openingBankBalance);
  const minimumCashReserve = normalizeNonNegativeAmount(req.body?.minimumCashReserve);

  if (openingCashBalance === null || openingBankBalance === null || minimumCashReserve === null) {
    return res.status(400).json({ error: "Los saldos iniciales y el fondo mínimo deben ser números mayores o iguales a cero." });
  }

  const currentSettings = getCurrentFundSettings();
  const now = new Date().toISOString();
  const nextSettings = {
    ...currentSettings,
    id: currentSettings.id || 'main',
    openingCashBalance,
    openingBankBalance,
    minimumCashReserve,
    createdAt: currentSettings.createdAt || now,
    updatedAt: now
  };

  fundSettings = [nextSettings];
  await saveRecord(COLLECTIONS.fundSettings, nextSettings);
  res.json({ message: "Configuración de efectivo y bancos guardada correctamente.", settings: nextSettings });
}));

app.post("/efectivo/traslados", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.fundTransfers]);
  const fromAccount = normalizeFundAccount(req.body?.fromAccount);
  const toAccount = normalizeFundAccount(req.body?.toAccount);
  const amount = Number(req.body?.amount);
  const transferDate = req.body?.fecha ? new Date(req.body.fecha) : new Date();
  const description = String(req.body?.description || '').trim();
  const reference = String(req.body?.reference || '').trim();
  const note = String(req.body?.note || '').trim();

  if (!fromAccount || !toAccount) {
    return res.status(400).json({ error: "Debes seleccionar una cuenta origen y una cuenta destino válidas." });
  }
  if (fromAccount === toAccount) {
    return res.status(400).json({ error: "El origen y el destino del traslado deben ser distintos." });
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "El monto del traslado debe ser mayor a cero." });
  }
  if (Number.isNaN(transferDate.getTime())) {
    return res.status(400).json({ error: "La fecha del traslado no es válida." });
  }

  const now = new Date().toISOString();
  const transfer = {
    id: createDocId(COLLECTIONS.fundTransfers),
    fromAccount,
    toAccount,
    amount,
    fecha: transferDate.toISOString(),
    description: description || `Traslado de ${fromAccount} a ${toAccount}`,
    reference: reference || null,
    note: note || null,
    createdAt: now,
    updatedAt: now
  };

  fundTransfers.push(transfer);
  await saveRecord(COLLECTIONS.fundTransfers, transfer);
  res.status(201).json({ message: "Traslado de fondos registrado correctamente.", transfer });
}));

app.get("/inventario/movimientos", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.inventoryMovements]);
  const sortedMovements = inventoryMovements.slice().sort((a, b) => new Date(a.fecha || a.createdAt || 0) - new Date(b.fecha || b.createdAt || 0));
  res.json(sortedMovements);
}));

app.post("/inventario/inicial", asyncHandler(async (req, res) => {
  await hydrateStore();
  const productId = String(req.body?.productId || '').trim();
  const quantity = Number(req.body?.quantity);
  const unitCost = Number(req.body?.unitCost);
  const note = String(req.body?.note || '').trim();
  const movementDate = req.body?.date ? new Date(req.body.date) : new Date();

  if (!productId) {
    return res.status(400).json({ error: "Selecciona un producto válido." });
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "La cantidad inicial debe ser mayor a cero." });
  }
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return res.status(400).json({ error: "El costo unitario del inventario inicial no es válido." });
  }
  if (Number.isNaN(movementDate.getTime())) {
    return res.status(400).json({ error: "La fecha del inventario inicial no es válida." });
  }

  const producto = productos.find(item => String(item.id) === productId);
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const previousStock = Number(producto.stock || 0);
  const nextStock = previousStock + quantity;
  producto.stock = nextStock;

  const movement = buildInventoryMovement({
    producto,
    tipo: 'inventario-inicial',
    direccion: 'entrada',
    cantidad: quantity,
    fecha: movementDate.toISOString(),
    observacion: note || 'Carga de inventario inicial',
    referencia: 'Inventario inicial',
    saldoAnterior: previousStock,
    saldoNuevo: nextStock,
    costoUnitario: unitCost,
    costoTotal: quantity * unitCost
  });

  inventoryMovements.push(movement);
  await commitBatch([
    { type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto },
    { type: 'set', collection: COLLECTIONS.inventoryMovements, id: movement.id, data: movement }
  ]);
  res.status(201).json({ message: 'Inventario inicial registrado correctamente.', movement, producto });
}));

app.post("/inventario/ajustes", asyncHandler(async (req, res) => {
  await hydrateStore();
  const productId = String(req.body?.productId || '').trim();
  const quantity = Number(req.body?.quantity);
  const adjustmentType = String(req.body?.adjustmentType || '').trim().toLowerCase();
  const unitCostRaw = req.body?.unitCost;
  const unitCost = unitCostRaw === null || unitCostRaw === undefined || unitCostRaw === '' ? null : Number(unitCostRaw);
  const note = String(req.body?.note || '').trim();
  const movementDate = req.body?.date ? new Date(req.body.date) : new Date();

  if (!productId) {
    return res.status(400).json({ error: "Selecciona un producto válido." });
  }
  if (!['entrada', 'salida'].includes(adjustmentType)) {
    return res.status(400).json({ error: "El tipo de ajuste debe ser entrada o salida." });
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "La cantidad del ajuste debe ser mayor a cero." });
  }
  if (adjustmentType === 'entrada' && (unitCost === null || Number.isNaN(unitCost) || unitCost < 0)) {
    return res.status(400).json({ error: "El costo unitario es obligatorio para ajustes de entrada." });
  }
  if (Number.isNaN(movementDate.getTime())) {
    return res.status(400).json({ error: "La fecha del ajuste no es válida." });
  }

  const producto = productos.find(item => String(item.id) === productId);
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const previousStock = Number(producto.stock || 0);
  const stockDelta = adjustmentType === 'entrada' ? quantity : -quantity;
  const nextStock = previousStock + stockDelta;
  if (nextStock < 0) {
    return res.status(400).json({ error: "El ajuste no puede dejar el stock en negativo." });
  }

  producto.stock = nextStock;
  const movement = buildInventoryMovement({
    producto,
    tipo: 'ajuste',
    direccion: adjustmentType,
    cantidad: quantity,
    fecha: movementDate.toISOString(),
    observacion: note || null,
    referencia: 'Ajuste de inventario',
    saldoAnterior: previousStock,
    saldoNuevo: nextStock,
    costoUnitario: adjustmentType === 'entrada' ? unitCost : null,
    costoTotal: adjustmentType === 'entrada' ? quantity * unitCost : null
  });

  inventoryMovements.push(movement);
  await commitBatch([
    { type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto },
    { type: 'set', collection: COLLECTIONS.inventoryMovements, id: movement.id, data: movement }
  ]);
  res.status(201).json({ message: 'Ajuste de inventario registrado correctamente.', movement, producto });
}));

app.post("/ventas/:id/pagar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const venta = ventas.find(item => String(item.id) === String(id));

  if (!venta) {
    return res.status(404).json({ error: "Venta no encontrada." });
  }

  const currentPaymentType = String(venta.paymentType || '').toLowerCase();
  const originalPaymentType = String(venta.originalPaymentType || venta.paymentType || '').toLowerCase();
  const isCreditSale = currentPaymentType === 'credito' || originalPaymentType === 'credito';
  const isCashSale = currentPaymentType === 'contado' || originalPaymentType === 'contado';

  if (!isCreditSale && !isCashSale) {
    return res.status(400).json({ error: "Solo se pueden aplicar o editar pagos de ventas registradas a crédito o contado." });
  }

  const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
  const paymentReference = String(req.body?.paymentReference || '').trim();
  const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();

  if (!paymentMethod) {
    return res.status(400).json({ error: "El método de pago es obligatorio." });
  }
  if (!CREDIT_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }

  if (Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "La fecha de pago no es válida." });
  }

  if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  ensureSaleFinancialState(venta);
  const totalAmount = Number(venta.totalAmount || calculateSaleInvoiceTotal(venta));
  const existingPaymentHistory = Array.isArray(venta.paymentHistory) ? venta.paymentHistory : [];
  const requestedPaymentEntryId = String(req.body?.paymentEntryId || '').trim();
  const canEditSingleSettledCreditPayment = isCreditSale && Number(venta.balanceDue || 0) <= 0.0001 && existingPaymentHistory.length === 1;
  const existingPayment = isCreditSale
    ? (requestedPaymentEntryId
      ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
      : (canEditSingleSettledCreditPayment ? existingPaymentHistory[0] : null))
    : null;
  const paymentAmount = isCreditSale
    ? Number(req.body?.amount)
    : totalAmount;

  if (requestedPaymentEntryId && isCreditSale && !existingPayment) {
    return res.status(404).json({ error: "No se encontró el abono seleccionado para esta venta." });
  }

  if (isCreditSale) {
    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
    }
    const maxAllowedAmount = existingPayment
      ? Number(venta.balanceDue || 0) + Number(existingPayment.amount || 0)
      : Number(venta.balanceDue || 0);
    if (paymentAmount - maxAllowedAmount > 0.0001) {
      return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
    }
  }

  const currentCashReceived = Number(venta.cashReceived);
  const currentCashChange = Number(venta.cashChange);
  const receiptNumber = paymentMethod === 'efectivo'
    ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
    : null;
  const resolvedPaymentReference = paymentMethod === 'efectivo'
    ? receiptNumber
    : (paymentReference || null);

  venta.originalPaymentType = originalPaymentType || (isCashSale ? 'contado' : 'credito');
  venta.paymentType = isCashSale ? 'contado' : 'credito';
  venta.cashReceived = Number.isFinite(currentCashReceived) && currentCashReceived >= 0 ? currentCashReceived : totalAmount;
  venta.cashChange = Number.isFinite(currentCashChange) && currentCashChange >= 0 ? currentCashChange : 0;
  venta.paymentHistory = isCashSale
    ? [{
      id: crypto.randomUUID(),
      amount: totalAmount,
      date: paidAt.toISOString(),
      paymentMethod,
      paymentReference: resolvedPaymentReference,
      receiptNumber,
      note: 'Pago actualizado de venta de contado',
      account: getAccountFromPaymentMethod(paymentMethod),
      createdAt: new Date().toISOString()
    }]
    : existingPayment
      ? existingPaymentHistory.map(entry => String(entry.id) === String(existingPayment.id)
        ? {
          id: existingPayment.id || crypto.randomUUID(),
          amount: paymentAmount,
          date: paidAt.toISOString(),
          paymentMethod,
          paymentReference: resolvedPaymentReference,
          receiptNumber,
          note: existingPayment.note || 'Abono a venta a crédito',
          account: getAccountFromPaymentMethod(paymentMethod),
          createdAt: existingPayment.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        : entry)
    : [
      ...(Array.isArray(venta.paymentHistory) ? venta.paymentHistory : []),
      {
        id: crypto.randomUUID(),
        amount: paymentAmount,
        date: paidAt.toISOString(),
        paymentMethod,
        paymentReference: resolvedPaymentReference,
        receiptNumber,
        note: 'Abono a venta a crédito',
        account: getAccountFromPaymentMethod(paymentMethod),
        createdAt: new Date().toISOString()
      }
    ];

  ensureSaleFinancialState(venta);

  await saveRecord(COLLECTIONS.ventas, venta);
  res.json({
    message: isCashSale
      ? "Pago actualizado correctamente."
      : existingPayment
        ? venta.balanceDue <= 0
          ? "Abono actualizado y cuenta saldada correctamente."
          : "Abono actualizado correctamente."
      : venta.balanceDue <= 0
        ? "Abono aplicado y cuenta saldada correctamente."
        : "Abono aplicado correctamente.",
    venta
  });
}));

app.get("/deudas-externas", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.externalDebts]);
  const sortedDebts = externalDebts
    .map(debt => ensureExternalDebtFinancialState(debt))
    .slice()
    .sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
  res.json(sortedDebts);
}));

app.post("/deudas-externas", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.externalDebts]);
  const tercero = String(req.body?.tercero || '').trim();
  const concepto = String(req.body?.concepto || '').trim();
  const tipo = String(req.body?.type || req.body?.tipo || '').trim().toLowerCase() === 'por-cobrar' ? 'por-cobrar' : 'por-pagar';
  const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date();
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
  const monto = normalizeNonNegativeAmount(req.body?.originalAmount ?? req.body?.monto ?? req.body?.amount);
  const observacion = String(req.body?.observacion || req.body?.note || '').trim();

  if (!tercero) {
    return res.status(400).json({ error: "El tercero es obligatorio." });
  }
  if (!concepto) {
    return res.status(400).json({ error: "El concepto es obligatorio." });
  }
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return res.status(400).json({ error: "La fecha no es válida." });
  }
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }
  if (monto === null || monto <= 0) {
    return res.status(400).json({ error: "El monto debe ser mayor a cero." });
  }

  const now = new Date().toISOString();
  const debt = ensureExternalDebtFinancialState({
    id: createDocId(COLLECTIONS.externalDebts),
    type: tipo,
    tercero,
    concepto,
    fecha: fecha.toISOString(),
    dueDate: dueDate ? dueDate.toISOString() : null,
    originalAmount: monto,
    paymentHistory: [],
    observacion: observacion || null,
    createdAt: now,
    updatedAt: now
  });

  externalDebts.push(debt);
  await saveRecord(COLLECTIONS.externalDebts, debt);
  res.status(201).json({ message: "Deuda externa registrada correctamente.", debt });
}));

app.patch("/deudas-externas/:id", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.externalDebts]);
  const { id } = req.params;
  const debt = externalDebts.find(item => String(item.id) === String(id));
  if (!debt) {
    return res.status(404).json({ error: "Deuda externa no encontrada." });
  }

  ensureExternalDebtFinancialState(debt);
  const tercero = String(req.body?.tercero || '').trim();
  const concepto = String(req.body?.concepto || '').trim();
  const tipo = String(req.body?.type || req.body?.tipo || '').trim().toLowerCase() === 'por-cobrar' ? 'por-cobrar' : 'por-pagar';
  const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date(debt.fecha || Date.now());
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
  const monto = normalizeNonNegativeAmount(req.body?.originalAmount ?? req.body?.monto ?? req.body?.amount);
  const observacion = String(req.body?.observacion || req.body?.note || '').trim();

  if (!tercero) {
    return res.status(400).json({ error: "El tercero es obligatorio." });
  }
  if (!concepto) {
    return res.status(400).json({ error: "El concepto es obligatorio." });
  }
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return res.status(400).json({ error: "La fecha no es válida." });
  }
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }
  if (monto === null || monto <= 0) {
    return res.status(400).json({ error: "El monto debe ser mayor a cero." });
  }
  if (monto + 0.0001 < Number(debt.totalPaid || 0)) {
    return res.status(400).json({ error: "El monto original no puede ser menor que lo ya abonado." });
  }

  debt.type = tipo;
  debt.tercero = tercero;
  debt.concepto = concepto;
  debt.fecha = fecha.toISOString();
  debt.dueDate = dueDate ? dueDate.toISOString() : null;
  debt.originalAmount = monto;
  debt.observacion = observacion || null;
  debt.updatedAt = new Date().toISOString();
  ensureExternalDebtFinancialState(debt);

  await saveRecord(COLLECTIONS.externalDebts, debt);
  res.json({ message: "Deuda externa actualizada correctamente.", debt });
}));

app.post("/deudas-externas/:id/abonos", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.externalDebts, COLLECTIONS.pagos, COLLECTIONS.compras]);
  const { id } = req.params;
  const debt = externalDebts.find(item => String(item.id) === String(id));
  if (!debt) {
    return res.status(404).json({ error: "Deuda externa no encontrada." });
  }

  ensureExternalDebtFinancialState(debt);
  const amount = normalizeNonNegativeAmount(req.body?.amount ?? req.body?.monto);
  const fecha = req.body?.date || req.body?.fecha ? new Date(req.body?.date || req.body?.fecha) : new Date();
  const account = normalizeFundAccount(req.body?.account);
  const paymentReference = String(req.body?.paymentReference || req.body?.referencia || '').trim();
  const note = String(req.body?.note || req.body?.observacion || '').trim();
  const requestedPaymentEntryId = String(req.body?.paymentEntryId || '').trim();
  const existingPaymentHistory = Array.isArray(debt.paymentHistory) ? debt.paymentHistory : [];
  const existingPayment = requestedPaymentEntryId
    ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
    : null;

  if (amount === null || amount <= 0) {
    return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
  }
  if (Number.isNaN(fecha.getTime())) {
    return res.status(400).json({ error: "La fecha del abono no es válida." });
  }
  if (!account) {
    return res.status(400).json({ error: "Selecciona si el abono se hizo por efectivo o bancos." });
  }
  if (requestedPaymentEntryId && !existingPayment) {
    return res.status(404).json({ error: "No se encontró el abono seleccionado para esta deuda externa." });
  }
  const maxAllowedAmount = existingPayment
    ? Number(debt.balanceDue || 0) + Number(existingPayment.amount || 0)
    : Number(debt.balanceDue || 0);
  if (amount - maxAllowedAmount > 0.0001) {
    return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
  }

  const receiptNumber = account === 'efectivo'
    ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
    : null;
  const resolvedPaymentReference = account === 'efectivo'
    ? receiptNumber
    : (paymentReference || null);

  debt.paymentHistory = existingPayment
    ? existingPaymentHistory.map(entry => String(entry.id) === String(existingPayment.id)
      ? {
        id: existingPayment.id || crypto.randomUUID(),
        amount,
        date: fecha.toISOString(),
        account,
        paymentMethod: account === 'efectivo' ? 'efectivo' : 'transferencia',
        paymentReference: resolvedPaymentReference,
        receiptNumber,
        note: note || null,
        createdAt: existingPayment.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      : entry)
    : [
      ...existingPaymentHistory,
      {
        id: crypto.randomUUID(),
        amount,
        date: fecha.toISOString(),
        account,
        paymentMethod: account === 'efectivo' ? 'efectivo' : 'transferencia',
        paymentReference: resolvedPaymentReference,
        receiptNumber,
        note: note || null,
        createdAt: new Date().toISOString()
      }
    ];
  debt.updatedAt = new Date().toISOString();
  ensureExternalDebtFinancialState(debt);

  await saveRecord(COLLECTIONS.externalDebts, debt);
  res.json({
    message: existingPayment
      ? debt.balanceDue <= 0
        ? 'Abono actualizado y deuda saldada correctamente.'
        : 'Abono actualizado correctamente.'
      : debt.balanceDue <= 0
        ? 'Abono aplicado y deuda saldada correctamente.'
        : 'Abono aplicado correctamente.',
    debt
  });
}));

// Eliminar producto si no tiene movimientos vinculados
app.delete("/productos/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const producto = productos.find(p => String(p.id) === String(id));
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const hasPurchase = compras.some(compra => Array.isArray(compra.items) && compra.items.some(item => String(item.id) === String(id)));
  const hasSale = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => String(item.id) === String(id) || (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.materiaPrimaId) === String(id))) || (Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.materiaPrimaId) === String(id)))));
  const hasInventoryMovement = inventoryMovements.some(movement => String(movement.productoId) === String(id));
  const linkedFlavor = sabores.some(flavor => String(flavor.materiaPrimaId) === String(id));
  const linkedTopping = toppings.some(topping => String(topping.materiaPrimaId) === String(id));
  const linkedSauce = salsas.some(sauce => String(sauce.materiaPrimaId) === String(id));
  if (hasPurchase || hasSale || hasInventoryMovement || linkedFlavor || linkedTopping || linkedSauce) {
    return res.status(400).json({ error: "No se puede eliminar un producto con movimientos vinculados." });
  }

  productos = productos.filter(p => String(p.id) !== String(id));
  await deleteRecord(COLLECTIONS.productos, id);
  res.json({ message: "Producto eliminado con éxito." });
}));

app.delete("/sabores/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const sabor = sabores.find(item => String(item.id) === String(id));
  if (!sabor) {
    return res.status(404).json({ error: "Sabor no encontrado." });
  }

  const hasSales = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.id) === String(id))));
  const hasBucketControl = baldesControl.some(bucket => String(bucket.saborId) === String(id));
  if (hasSales || hasBucketControl) {
    return res.status(400).json({ error: "No se puede eliminar un sabor usado en ventas." });
  }

  sabores = sabores.filter(item => String(item.id) !== String(id));
  await deleteRecord(COLLECTIONS.sabores, id);
  res.json({ message: "Sabor eliminado con éxito." });
}));

app.delete("/toppings/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const topping = toppings.find(item => String(item.id) === String(id));
  if (!topping) {
    return res.status(404).json({ error: "Topping no encontrado." });
  }

  const hasSales = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.id) === String(id))));
  const hasToppingControl = toppingControls.some(control => String(control.toppingId) === String(id));
  if (hasSales || hasToppingControl) {
    return res.status(400).json({ error: "No se puede eliminar un topping usado en ventas." });
  }

  toppings = toppings.filter(item => String(item.id) !== String(id));
  await deleteRecord(COLLECTIONS.toppings, id);
  res.json({ message: "Topping eliminado con éxito." });
}));

app.delete("/salsas/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const sauce = salsas.find(item => String(item.id) === String(id));
  if (!sauce) {
    return res.status(404).json({ error: "Salsa/aderezo no encontrado." });
  }

  const hasSales = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.id) === String(id))));
  const hasSauceControl = sauceControls.some(control => String(control.sauceId) === String(id));
  if (hasSales || hasSauceControl) {
    return res.status(400).json({ error: "No se puede eliminar una salsa/aderezo usado en ventas." });
  }

  salsas = salsas.filter(item => String(item.id) !== String(id));
  await deleteRecord(COLLECTIONS.salsas, id);
  res.json({ message: "Salsa/aderezo eliminado con éxito." });
}));

// Resumen de inventario
app.get("/inventario", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.productos]);
  const totalProductos = productos.length;
  const totalStock = productos.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const lowStockCount = productos.filter(item => Number(item.stock || 0) <= Number(item.stockMin || 0)).length;
  res.json({ totalProductos, totalStock, lowStockCount, productos });
}));

module.exports = app;

// Iniciar servidor local
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Servidor en http://localhost:${port}`);
  });
}
