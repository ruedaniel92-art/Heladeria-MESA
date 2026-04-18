const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./firebase");
const app = express();

const COLLECTIONS = {
  productos: "productos",
  compras: "compras",
  ventas: "ventas",
  sabores: "sabores",
  toppings: "toppings",
  salsas: "salsas",
  users: "users",
  baldesControl: "baldesControl",
  toppingControls: "toppingControls",
  sauceControls: "sauceControls",
  inventoryMovements: "inventoryMovements"
};

const AUTH_TOKEN_DURATION_MS = 10 * 60 * 1000;
const AUTH_PASSWORD_ITERATIONS = 210000;
const AUTH_SECRET = process.env.APP_AUTH_SECRET
  || crypto.createHash("sha256").update(String(process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_CLIENT_EMAIL || "heladeria-mesa-auth-secret")).digest("hex");
const MODULE_PERMISSION_KEYS = ["dashboard", "ingreso", "compras", "ventas", "sabores", "inventario", "seguridad"];
const DEFAULT_COLLECTION_CACHE_MS = 2 * 60 * 1000;
const COLLECTION_CACHE_MS = {
  [COLLECTIONS.users]: 10 * 60 * 1000,
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

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "El cuerpo JSON de la solicitud no es válido." });
  }
  return next(err);
});

// Permitir CORS desde el frontend local
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "X-Auth-Token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Base de datos temporal (memoria)
let productos = [];
let compras = [];
let ventas = [];
let sabores = [];
let toppings = [];
let salsas = [];
let users = [];
let baldesControl = [];
let toppingControls = [];
let sauceControls = [];
let inventoryMovements = [];
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

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function buildDefaultPermissions(role = "user") {
  const isAdmin = String(role || "user") === "admin";
  return MODULE_PERMISSION_KEYS.reduce((accumulator, key) => {
    accumulator[key] = isAdmin ? true : key === "dashboard";
    return accumulator;
  }, {});
}

function normalizeUserPermissions(rawPermissions, role = "user") {
  const defaults = buildDefaultPermissions(role);
  if (!rawPermissions || typeof rawPermissions !== "object") {
    return defaults;
  }

  return MODULE_PERMISSION_KEYS.reduce((accumulator, key) => {
    accumulator[key] = String(role || "user") === "admin"
      ? true
      : Boolean(rawPermissions[key] ?? defaults[key]);
    return accumulator;
  }, {});
}

function sanitizeUserForClient(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    nombre: String(user.nombre || user.name || ""),
    role: String(user.role || "user"),
    permissions: normalizeUserPermissions(user.permissions, user.role),
    active: user.active !== false,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex"), iterations = AUTH_PASSWORD_ITERATIONS) {
  const hashedValue = crypto.pbkdf2Sync(String(password), salt, iterations, 64, "sha512").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hashedValue}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, rawIterations, salt, expectedHash] = String(storedHash || "").split("$");
  if (algorithm !== "pbkdf2" || !rawIterations || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(rawIterations);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const derivedHash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derivedHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function isSafeEqual(left, right, encoding = "utf8") {
  const leftBuffer = Buffer.from(String(left || ""), encoding);
  const rightBuffer = Buffer.from(String(right || ""), encoding);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signAuthToken(user) {
  const payload = {
    sub: String(user.id),
    username: String(user.username || ""),
    role: String(user.role || "user"),
    permissions: normalizeUserPermissions(user.permissions, user.role),
    exp: Date.now() + AUTH_TOKEN_DURATION_MS
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  if (!isSafeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload));
  if (!payload?.sub || !payload?.exp || Number(payload.exp) < Date.now()) {
    return null;
  }

  return payload;
}

function extractBearerToken(req) {
  const authorizationHeader = String(req.headers.authorization || "").trim();
  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authorizationHeader.slice(7).trim();
}

async function attachAuthenticatedUser(req) {
  await hydrateStore([COLLECTIONS.users]);
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  const user = users.find(item => String(item.id) === String(payload.sub) && item.active !== false);
  if (!user) {
    return null;
  }

  req.authToken = token;
  req.authUser = user;
  req.refreshedAuthToken = signAuthToken(user);
  return user;
}

function attachAuthResponseHeaders(res, token) {
  if (!token) {
    return;
  }
  res.setHeader("X-Auth-Token", token);
}

function requireAuth(req, res, next) {
  attachAuthenticatedUser(req)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: "Debes iniciar sesión para continuar." });
      }
      attachAuthResponseHeaders(res, req.refreshedAuthToken);
      return next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (String(req.authUser?.role || "user") !== "admin") {
      return res.status(403).json({ error: "Solo un administrador puede realizar esta acción." });
    }
    return next();
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

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(error => {
      console.error(error);
      if (!res.headersSent) {
        const errorDetails = String(error?.details || error?.message || '').toLowerCase();
        const isQuotaExceeded = Number(error?.code) === 8 || errorDetails.includes('quota exceeded') || errorDetails.includes('resource_exhausted');
        if (isQuotaExceeded) {
          return res.status(503).json({ error: "Se alcanzó la cuota de Firestore. Debes esperar al reinicio de cuota o cambiar la configuración del proyecto." });
        }
        res.status(500).json({ error: "Ocurrió un error al comunicarse con Firestore." });
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

function findExistingConsumableCloseMovement(kind, control) {
  const config = getConsumableConfig(kind);
  if (!config || !control) {
    return null;
  }

  const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : null;
  const closeTime = closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate.getTime() : null;
  const expectedObservation = `Merma por cierre de ${config.label} ${control[config.entityNameField] || ''}`.trim();

  return inventoryMovements.find(movement => {
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
  }) || null;
}

function buildConsumableCloseInventoryMovement(kind, control, closeDate) {
  const config = getConsumableConfig(kind);
  const wasteQuantity = Number(control?.mermaReal || 0);
  if (!config || !control || wasteQuantity <= 0) {
    return null;
  }

  const producto = productos.find(item => String(item.id) === String(control[config.rawMaterialIdField] || ''));
  if (!producto) {
    return null;
  }

  const existingMovement = findExistingConsumableCloseMovement(kind, control);
  if (existingMovement) {
    return { producto, movement: existingMovement, exists: true };
  }

  const previousStock = Number(producto.stock || 0);
  const nextStock = previousStock - wasteQuantity;
  if (nextStock < 0) {
    throw new Error(`La merma del cierre no puede dejar el stock de ${producto.nombre} en negativo.`);
  }

  producto.stock = nextStock;
  const movement = buildInventoryMovement({
    producto,
    tipo: 'cierre-control',
    direccion: 'salida',
    cantidad: wasteQuantity,
    fecha: closeDate.toISOString(),
    observacion: `Merma por cierre de ${config.label} ${control[config.entityNameField] || ''}`.trim(),
    referencia: `Cierre ${config.label}`,
    saldoAnterior: previousStock,
    saldoNuevo: nextStock,
    costoUnitario: 0,
    costoTotal: 0,
    extraFields: {
      controlKind: kind,
      controlId: String(control.id),
      controlEntityId: String(control[config.entityIdField] || '')
    }
  });

  inventoryMovements.push(movement);
  return { producto, movement, exists: false };
}

function repairConsumableControls(kind) {
  const config = getConsumableConfig(kind);
  if (!config) {
    return { repairedControls: 0, createdMovements: 0, updatedSales: 0, updatedProducts: 0 };
  }

  let repairedControls = 0;
  let createdMovements = 0;
  const affectedSaleIds = new Set();
  const affectedProductIds = new Set();

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

    const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : new Date();
    const closeMovementResult = buildConsumableCloseInventoryMovement(kind, control, closeDate);
    if (closeMovementResult) {
      affectedProductIds.add(String(closeMovementResult.producto.id));
      if (!closeMovementResult.exists) {
        createdMovements += 1;
      }
    }
  });

  return {
    repairedControls,
    createdMovements,
    updatedSales: affectedSaleIds.size,
    updatedProducts: affectedProductIds.size
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "heladeria-mesa-api" });
});

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/auth/status", asyncHandler(async (req, res) => {
  const user = await attachAuthenticatedUser(req);
  attachAuthResponseHeaders(res, req.refreshedAuthToken);
  res.json({ configured: users.length > 0, authenticated: Boolean(user), user: sanitizeUserForClient(user) });
}));

app.post("/auth/bootstrap", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.users]);
  if (users.length) {
    return res.status(409).json({ error: "La aplicación ya tiene usuarios configurados." });
  }

  const username = normalizeUsername(req.body?.username);
  const nombre = String(req.body?.nombre || req.body?.name || "").trim();
  const password = String(req.body?.password || "");

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "El usuario debe tener al menos 3 caracteres." });
  }

  if (!nombre) {
    return res.status(400).json({ error: "El nombre es obligatorio para crear el primer usuario." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  const now = new Date().toISOString();
  const user = {
    id: createDocId(COLLECTIONS.users),
    username,
    nombre,
    role: "admin",
    permissions: buildDefaultPermissions("admin"),
    active: true,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };

  users.push(user);
  await saveRecord(COLLECTIONS.users, user);
  const token = signAuthToken(user);
  attachAuthResponseHeaders(res, token);
  res.status(201).json({ token, user: sanitizeUserForClient(user) });
}));

app.post("/auth/login", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.users]);
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || "");
  const user = users.find(item => String(item.username || "") === username && item.active !== false);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  await saveRecord(COLLECTIONS.users, user);
  const token = signAuthToken(user);
  attachAuthResponseHeaders(res, token);
  res.json({ token, user: sanitizeUserForClient(user) });
}));

app.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
  attachAuthResponseHeaders(res, req.refreshedAuthToken);
  res.json({ user: sanitizeUserForClient(req.authUser) });
}));

app.get("/auth/users", requireAdmin, asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.users]);
  res.json(users.map(sanitizeUserForClient));
}));

app.post("/auth/users", requireAdmin, asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.users]);
  const username = normalizeUsername(req.body?.username);
  const nombre = String(req.body?.nombre || req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "user").trim().toLowerCase() === "admin" ? "admin" : "user";
  const permissions = normalizeUserPermissions(req.body?.permissions, role);

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "El usuario debe tener al menos 3 caracteres." });
  }

  if (!nombre) {
    return res.status(400).json({ error: "El nombre del usuario es obligatorio." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  if (users.some(item => String(item.username || "") === username)) {
    return res.status(409).json({ error: "Ya existe un usuario con ese nombre." });
  }

  const now = new Date().toISOString();
  const user = {
    id: createDocId(COLLECTIONS.users),
    username,
    nombre,
    role,
    permissions,
    active: true,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  users.push(user);
  await saveRecord(COLLECTIONS.users, user);
  res.status(201).json({ user: sanitizeUserForClient(user) });
}));

app.patch("/auth/users/:id", requireAdmin, asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.users]);
  const { id } = req.params;
  const user = users.find(item => String(item.id) === String(id));
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  const role = req.body?.role !== undefined
    ? (String(req.body.role).trim().toLowerCase() === "admin" ? "admin" : "user")
    : String(user.role || "user");
  const nombre = req.body?.nombre !== undefined ? String(req.body.nombre || "").trim() : String(user.nombre || "");
  const active = req.body?.active !== undefined ? Boolean(req.body.active) : user.active !== false;
  const password = req.body?.password !== undefined ? String(req.body.password || "") : "";

  if (!nombre) {
    return res.status(400).json({ error: "El nombre del usuario es obligatorio." });
  }

  if (password && password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  user.nombre = nombre;
  user.role = role;
  user.permissions = normalizeUserPermissions(req.body?.permissions ?? user.permissions, role);
  user.active = active;
  user.updatedAt = new Date().toISOString();

  if (password) {
    user.passwordHash = hashPassword(password);
  }

  await saveRecord(COLLECTIONS.users, user);
  res.json({ user: sanitizeUserForClient(user) });
}));

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
  const closeMovementResult = buildConsumableCloseInventoryMovement('bucket', bucket, fechaCierre);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.baldesControl, id: bucket.id, data: bucket },
    ...(closeMovementResult ? [
      { type: 'set', collection: COLLECTIONS.productos, id: closeMovementResult.producto.id, data: closeMovementResult.producto },
      { type: 'set', collection: COLLECTIONS.inventoryMovements, id: closeMovementResult.movement.id, data: closeMovementResult.movement }
    ] : []),
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
  const closeMovementResult = buildConsumableCloseInventoryMovement('topping', control, fechaCierre);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.toppingControls, id: control.id, data: control },
    ...(closeMovementResult ? [
      { type: 'set', collection: COLLECTIONS.productos, id: closeMovementResult.producto.id, data: closeMovementResult.producto },
      { type: 'set', collection: COLLECTIONS.inventoryMovements, id: closeMovementResult.movement.id, data: closeMovementResult.movement }
    ] : []),
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
  const closeMovementResult = buildConsumableCloseInventoryMovement('sauce', control, fechaCierre);

  await commitBatch([
    { type: 'set', collection: COLLECTIONS.sauceControls, id: control.id, data: control },
    ...(closeMovementResult ? [
      { type: 'set', collection: COLLECTIONS.productos, id: closeMovementResult.producto.id, data: closeMovementResult.producto },
      { type: 'set', collection: COLLECTIONS.inventoryMovements, id: closeMovementResult.movement.id, data: closeMovementResult.movement }
    ] : []),
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
    ...inventoryMovements.map(movement => ({ type: 'set', collection: COLLECTIONS.inventoryMovements, id: movement.id, data: movement })),
    ...ventas.map(venta => ({ type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }))
  ]);

  const summary = {
    baldes: bucketSummary,
    toppings: toppingSummary,
    salsas: sauceSummary,
    totals: {
      controles: bucketSummary.repairedControls + toppingSummary.repairedControls + sauceSummary.repairedControls,
      movimientosCreados: bucketSummary.createdMovements + toppingSummary.createdMovements + sauceSummary.createdMovements,
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
    items: validatedItems
  };
  compras.push(compra);
  await commitBatch([
    ...validatedItems.map(item => {
      const producto = productos.find(p => String(p.id) === String(item.id));
      return producto ? { type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto } : null;
    }),
    { type: 'set', collection: COLLECTIONS.compras, id: compra.id, data: compra }
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
    items: validatedItems
  };
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
  res.json(compras);
}));

app.post("/compras/:id/pagar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const compra = compras.find(item => String(item.id) === String(id));
  const hadPaidAt = Boolean(compra?.paidAt);

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

  if (Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "La fecha de pago no es válida." });
  }

  if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const totalAmount = Array.isArray(compra.items)
    ? compra.items.reduce((sum, item) => sum + Number(item.costo || 0) * Number(item.cantidad || 0), 0)
    : 0;

  compra.originalPaymentType = originalPaymentType || (isCashPurchase ? 'contado' : 'credito');
  compra.paymentType = isCashPurchase ? 'contado' : 'credito';
  compra.paymentMethod = paymentMethod;
  compra.paymentReference = paymentReference || null;
  compra.cashOut = totalAmount;
  compra.cashReceived = totalAmount;
  compra.cashChange = 0;
  compra.paidAt = paidAt.toISOString();

  await saveRecord(COLLECTIONS.compras, compra);
  res.json({ message: hadPaidAt ? "Pago actualizado correctamente." : "Pago aplicado correctamente.", compra });
}));

// Historial de ventas
app.get("/ventas", asyncHandler(async (req, res) => {
  await hydrateStore([COLLECTIONS.ventas]);
  res.json(ventas);
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
  const venta = ventas.find(item => String(item.id) === String(id));
  const hadPaidAt = Boolean(venta?.paidAt);

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

  if (Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "La fecha de pago no es válida." });
  }

  if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const totalAmount = Array.isArray(venta.items)
    ? venta.items.reduce((sum, item) => sum + Number(item.precio || 0) * Number(item.cantidad || 0) + (Array.isArray(item.adicionales) ? item.adicionales.reduce((addonsSum, adicional) => addonsSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0) : 0), 0)
    : 0;
  const currentCashReceived = Number(venta.cashReceived);
  const currentCashChange = Number(venta.cashChange);

  venta.originalPaymentType = originalPaymentType || (isCashSale ? 'contado' : 'credito');
  venta.paymentType = isCashSale ? 'contado' : 'credito';
  venta.paymentMethod = paymentMethod;
  venta.paymentReference = paymentReference || null;
  venta.cashReceived = Number.isFinite(currentCashReceived) && currentCashReceived >= 0 ? currentCashReceived : totalAmount;
  venta.cashChange = Number.isFinite(currentCashChange) && currentCashChange >= 0 ? currentCashChange : 0;
  venta.paidAt = paidAt.toISOString();

  await saveRecord(COLLECTIONS.ventas, venta);
  res.json({ message: hadPaidAt ? "Pago actualizado correctamente." : "Pago aplicado correctamente.", venta });
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

app.get("/crear", asyncHandler(async (req, res) => {
  const producto = {
    id: createDocId(COLLECTIONS.productos),
    nombre: "Helado de fresa",
    precio: 3,
    stock: 15,
    tipo: 'producto terminado',
    stockMin: 0
  };

  productos.push(producto);
  await saveRecord(COLLECTIONS.productos, producto);
  res.send("Producto creado desde navegador 🍦");
}));