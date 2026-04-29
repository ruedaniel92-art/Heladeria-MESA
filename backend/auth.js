const crypto = require("crypto");

const MODULE_PERMISSION_KEYS = ["dashboard", "ingreso", "compras", "ventas", "pagos", "efectivo", "sabores", "inventario", "seguridad"];
const DEFAULT_AUTH_TOKEN_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_AUTH_PASSWORD_ITERATIONS = 210000;

function createAuthHandlers({
  app,
  asyncHandler,
  authSecret,
  authTokenDurationMs = DEFAULT_AUTH_TOKEN_DURATION_MS,
  authPasswordIterations = DEFAULT_AUTH_PASSWORD_ITERATIONS,
  collections,
  createDocId,
  getBootstrapSecret,
  getUsers,
  hydrateStore,
  isBootstrapSecretRequired,
  saveRecord
}) {
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

  function hashPassword(password, salt = crypto.randomBytes(16).toString("hex"), iterations = authPasswordIterations) {
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
      exp: Date.now() + authTokenDurationMs
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = crypto.createHmac("sha256", authSecret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  function verifyAuthToken(token) {
    const [encodedPayload, signature] = String(token || "").split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = crypto.createHmac("sha256", authSecret).update(encodedPayload).digest("base64url");
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
    await hydrateStore([collections.users]);
    const token = extractBearerToken(req);
    if (!token) {
      return null;
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      return null;
    }

    const user = getUsers().find(item => String(item.id) === String(payload.sub) && item.active !== false);
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

  function requirePermission(permissionKey) {
    const normalizedPermissionKey = String(permissionKey || "").trim();
    return (req, res, next) => {
      const checkPermission = () => {
        const user = req.authUser;
        const role = String(user?.role || "user");
        const permissions = normalizeUserPermissions(user?.permissions, role);
        if (role === "admin" || permissions[normalizedPermissionKey]) {
          return next();
        }
        return res.status(403).json({ error: "No tienes permiso para acceder a este mÃ³dulo." });
      };

      if (req.authUser) {
        return checkPermission();
      }

      return requireAuth(req, res, checkPermission);
    };
  }

  function registerAuthRoutes() {
    app.get("/auth/status", asyncHandler(async (req, res) => {
      await hydrateStore([collections.users]);
      const users = getUsers();
      const user = await attachAuthenticatedUser(req);
      attachAuthResponseHeaders(res, req.refreshedAuthToken);
      res.json({
        configured: users.length > 0,
        authenticated: Boolean(user),
        user: sanitizeUserForClient(user),
        bootstrap: {
          allowed: users.length === 0,
          requiresSecret: isBootstrapSecretRequired(),
          secretConfigured: Boolean(getBootstrapSecret())
        }
      });
    }));

    app.post("/auth/bootstrap", asyncHandler(async (req, res) => {
      await hydrateStore([collections.users]);
      const users = getUsers();
      if (users.length) {
        return res.status(409).json({ error: "La aplicación ya tiene usuarios configurados." });
      }

      const bootstrapSecret = getBootstrapSecret();
      const providedBootstrapSecret = String(
        req.headers["x-bootstrap-secret"]
          || req.body?.bootstrapSecret
          || ""
      ).trim();

      if (isBootstrapSecretRequired()) {
        if (!bootstrapSecret) {
          return res.status(503).json({
            error: "El primer acceso está protegido. Configura APP_BOOTSTRAP_SECRET para crear el administrador inicial."
          });
        }

        if (!isSafeEqual(providedBootstrapSecret, bootstrapSecret)) {
          return res.status(403).json({
            error: "Se requiere una clave de instalación válida para crear el primer administrador."
          });
        }
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
        id: createDocId(collections.users),
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
      await saveRecord(collections.users, user);
      const token = signAuthToken(user);
      attachAuthResponseHeaders(res, token);
      res.status(201).json({ token, user: sanitizeUserForClient(user) });
    }));

    app.post("/auth/login", asyncHandler(async (req, res) => {
      await hydrateStore([collections.users]);
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || "");

      if (!username || !password) {
        return res.status(400).json({ error: "Datos incompletos" });
      }

      const users = getUsers();
      const user = users.find(item => String(item.username || "") === username && item.active !== false);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      }

      user.lastLoginAt = new Date().toISOString();
      user.updatedAt = user.lastLoginAt;
      await saveRecord(collections.users, user);
      const token = signAuthToken(user);
      attachAuthResponseHeaders(res, token);
      res.json({ token, user: sanitizeUserForClient(user) });
    }));

    app.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
      attachAuthResponseHeaders(res, req.refreshedAuthToken);
      res.json({ user: sanitizeUserForClient(req.authUser) });
    }));

    app.get("/auth/users", requireAdmin, asyncHandler(async (req, res) => {
      await hydrateStore([collections.users], { forceRefresh: true });
      res.json(getUsers().map(sanitizeUserForClient));
    }));

    app.post("/auth/users", requireAdmin, asyncHandler(async (req, res) => {
      await hydrateStore([collections.users]);
      const users = getUsers();
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
        id: createDocId(collections.users),
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
      await saveRecord(collections.users, user);
      res.status(201).json({ user: sanitizeUserForClient(user) });
    }));

    app.patch("/auth/users/:id", requireAdmin, asyncHandler(async (req, res) => {
      await hydrateStore([collections.users]);
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const users = getUsers();
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

      const activeAdmins = users.filter(item => item.active !== false && String(item.role || "user") === "admin");
      const isLastActiveAdmin = user.active !== false && String(user.role || "user") === "admin" && activeAdmins.length === 1;
      if (isLastActiveAdmin && (role !== "admin" || active === false)) {
        return res.status(409).json({ error: "No puedes eliminar el último administrador" });
      }

      user.nombre = nombre;
      user.role = role;
      user.permissions = normalizeUserPermissions(req.body?.permissions ?? user.permissions, role);
      user.active = active;
      user.updatedAt = new Date().toISOString();

      if (password) {
        user.passwordHash = hashPassword(password);
      }

      await saveRecord(collections.users, user);
      res.json({ user: sanitizeUserForClient(user) });
    }));
  }

  return {
    attachAuthenticatedUser,
    attachAuthResponseHeaders,
    registerAuthRoutes,
    requireAdmin,
    requireAuth,
    requirePermission
  };
}

module.exports = {
  createAuthHandlers,
  DEFAULT_AUTH_PASSWORD_ITERATIONS,
  DEFAULT_AUTH_TOKEN_DURATION_MS,
  MODULE_PERMISSION_KEYS
};
