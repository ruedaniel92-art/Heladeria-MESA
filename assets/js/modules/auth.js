export function createAuthModule(context) {
  const {
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
    securityUserStatus,
  } = context;

  let sessionInactivityTimeoutId = null;
  let lastActivityWriteAt = 0;

  function setAuthStatus(message, { error = false } = {}) {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.classList.toggle('error', error);
  }
  
  function persistAuthToken(token) {
    state.auth.token = token || '';
    try {
      if (state.auth.token) {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.auth.token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
    } catch (error) {
    }
  }
  
  function persistAuthUser(user) {
    state.auth.user = user || null;
    try {
      if (state.auth.user) {
        window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(state.auth.user));
      } else {
        window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      }
    } catch (error) {
    }
  }
  
  function clearSessionActivityTracking() {
    if (sessionInactivityTimeoutId) {
      window.clearTimeout(sessionInactivityTimeoutId);
      sessionInactivityTimeoutId = null;
    }
    lastActivityWriteAt = 0;
    try {
      window.localStorage.removeItem(AUTH_LAST_ACTIVITY_STORAGE_KEY);
    } catch (error) {
    }
  }
  
  function hasSessionTimedOut(referenceTime = Date.now()) {
    const lastActivityAt = getSavedSessionLastActivity();
    return Boolean(lastActivityAt) && referenceTime - lastActivityAt >= AUTH_INACTIVITY_LIMIT_MS;
  }
  
  function scheduleSessionInactivityCheck() {
    if (sessionInactivityTimeoutId) {
      window.clearTimeout(sessionInactivityTimeoutId);
      sessionInactivityTimeoutId = null;
    }
    if (!state.auth.token || !state.auth.user) {
      return;
    }
    const lastActivityAt = getSavedSessionLastActivity() || Date.now();
    const remainingMs = AUTH_INACTIVITY_LIMIT_MS - (Date.now() - lastActivityAt);
    if (remainingMs <= 0) {
      handleUnauthorizedSession('La sesión se cerró por inactividad después de 10 minutos.');
      return;
    }
    sessionInactivityTimeoutId = window.setTimeout(() => {
      handleUnauthorizedSession('La sesión se cerró por inactividad después de 10 minutos.');
    }, remainingMs + 50);
  }
  
  function markSessionActivity({ forceWrite = false } = {}) {
    if (!state.auth.token || !state.auth.user) {
      return;
    }
    const now = Date.now();
    if (forceWrite || now - lastActivityWriteAt >= AUTH_ACTIVITY_WRITE_THROTTLE_MS) {
      try {
        window.localStorage.setItem(AUTH_LAST_ACTIVITY_STORAGE_KEY, String(now));
        lastActivityWriteAt = now;
      } catch (error) {
      }
    }
    scheduleSessionInactivityCheck();
  }
  
  function renderSessionSummary() {
    if (!sessionUserName || !sessionUserMeta) return;
    if (!state.auth.user) {
      sessionUserName.textContent = 'Sin sesión';
      sessionUserMeta.textContent = 'Acceso restringido';
      return;
    }
    sessionUserName.textContent = state.auth.user.nombre || state.auth.user.username || 'Usuario';
    sessionUserMeta.textContent = `${state.auth.user.username || ''} · ${String(state.auth.user.role || 'user').toUpperCase()}`;
  }
  
  function renderSecurityCreatePermissions() {
    if (!securityCreatePermissions) return;
    securityCreatePermissions.innerHTML = buildPermissionCheckboxMarkup('security-create', buildDefaultModulePermissions('user'));
    syncPermissionInputsForRole(securityCreatePermissions, securityUserRoleInput?.value || 'user');
  }
  
  function renderSecurityUsers() {
    if (!securityUsersList) return;
    if (!state.auth.user || state.auth.user.role !== 'admin') {
      securityUsersList.innerHTML = '<p class="product-list-empty">Solo el administrador puede gestionar usuarios.</p>';
      return;
    }
    if (!state.auth.users.length) {
      securityUsersList.innerHTML = '<p class="product-list-empty">No hay usuarios registrados todavía.</p>';
      return;
    }
  
    securityUsersList.innerHTML = state.auth.users.map(user => {
      const permissions = normalizeModulePermissions(user.permissions, user.role);
      return `
        <article class="security-user-card" data-user-id="${escapeHtml(user.id)}">
          <div class="security-user-header">
            <div>
              <strong>${escapeHtml(user.nombre || user.username || 'Usuario')}</strong>
              <span>${escapeHtml(user.username || '')}</span>
            </div>
            <span>${user.updatedAt ? `Actualizado ${escapeHtml(formatDate(user.updatedAt))}` : 'Sin cambios recientes'}</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Nombre</label>
              <input type="text" data-user-field="nombre" value="${escapeHtml(user.nombre || '')}" />
            </div>
            <div class="field">
              <label>Rol</label>
              <select data-user-field="role">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
              </select>
            </div>
            <div class="field">
              <label>Estado</label>
              <select data-user-field="active">
                <option value="true" ${user.active !== false ? 'selected' : ''}>Activo</option>
                <option value="false" ${user.active === false ? 'selected' : ''}>Inactivo</option>
              </select>
            </div>
            <div class="field">
              <label>Nueva contraseña</label>
              <input type="password" data-user-field="password" placeholder="Dejar vacío para mantener" />
            </div>
          </div>
          <div class="field" style="margin-top: 10px;">
            <label>Qué puede ver</label>
            <div class="permission-grid" data-user-permissions>
              ${buildPermissionCheckboxMarkup(`security-user-${user.id}`, permissions, { disabled: user.role === 'admin' })}
            </div>
          </div>
          <div class="security-user-actions">
            <button type="button" class="secondary-btn" data-action="save-user">Guardar cambios</button>
            ${String(user.id) === String(state.auth.user?.id || '') ? '<span class="field-help">Tu propia sesión se actualizará al guardar.</span>' : ''}
          </div>
        </article>
      `;
    }).join('');
  
    securityUsersList.querySelectorAll('[data-user-field="role"]').forEach(select => {
      select.addEventListener('change', event => {
        const card = event.target.closest('[data-user-id]');
        const permissionsScope = card?.querySelector('[data-user-permissions]');
        syncPermissionInputsForRole(permissionsScope, event.target.value);
      });
    });
  }
  
  async function fetchAdminUsers() {
    if (!state.auth.user || state.auth.user.role !== 'admin') {
      state.auth.users = [];
      renderSecurityUsers();
      return;
    }
    const response = await fetch(buildApiUrl('/auth/users'), { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(await buildApiError(response, 'No se pudo cargar la lista de usuarios.'));
    }
    const result = await response.json();
    state.auth.users = Array.isArray(result) ? result : Array.isArray(result.users) ? result.users : [];
    renderSecurityUsers();
  }
  
  function setAuthMode(mode, { configured = true } = {}) {
    state.auth.mode = mode === 'bootstrap' ? 'bootstrap' : 'login';
    const bootstrapMode = state.auth.mode === 'bootstrap';
    authLoginForm.classList.toggle('field-hidden', bootstrapMode);
    authBootstrapForm.classList.toggle('field-hidden', !bootstrapMode);
    authModeToggle.classList.toggle('field-hidden', configured || bootstrapMode);
    authTitle.textContent = bootstrapMode ? 'Crear administrador' : 'Iniciar sesión';
    authDescription.textContent = bootstrapMode
      ? 'Configura el primer usuario administrador para proteger la aplicación.'
      : 'Ingresa tus credenciales para cargar la aplicación.';
    setAuthStatus(configured ? '' : 'No hay usuarios aún. Crea el administrador principal para empezar.');
  }
  
  function setBootstrapSecretRequirement(required) {
    const mustProvideSecret = Boolean(required);
    if (authBootstrapSecretField) {
      authBootstrapSecretField.classList.toggle('field-hidden', !mustProvideSecret);
    }
    if (authBootstrapSecretInput) {
      authBootstrapSecretInput.required = mustProvideSecret;
      if (!mustProvideSecret) {
        authBootstrapSecretInput.value = '';
      }
    }
  }
  
  function setAuthenticatedShell(isAuthenticated) {
    document.body.classList.toggle('auth-locked', !isAuthenticated);
    logoutButton.disabled = !isAuthenticated;
    renderSessionSummary();
    applyModulePermissions();
    setActiveTab(getFirstAccessibleModule(state.activeTab));
    if (isAuthenticated) {
      scheduleSessionInactivityCheck();
    }
  }
  
  function clearAuthenticatedState({ message = '', error = false } = {}) {
    persistAuthToken('');
    persistAuthUser(null);
    state.auth.users = [];
    clearSessionActivityTracking();
    renderSessionSummary();
    renderSecurityUsers();
    setAuthenticatedShell(false);
    setAuthMode(state.auth.configured ? 'login' : 'bootstrap', { configured: state.auth.configured });
    setAuthStatus(message, { error });
  }
  
  function handleUnauthorizedSession(message = 'La sesión expiró o ya no es válida. Inicia sesión nuevamente.') {
    const shouldShowMessage = !document.body.classList.contains('auth-locked');
    if (shouldShowMessage) {
      showError(message || 'Sesión expirada');
    }
    clearAuthenticatedState({
      message: shouldShowMessage ? message : '',
      error: shouldShowMessage
    });
  }
  
  installAuthenticatedFetch({
    getToken: () => state?.auth?.token || '',
    persistToken: persistAuthToken,
    onUnauthorized: () => handleUnauthorizedSession()
  });
  
  async function fetchAuthStatus() {
    await fetchRuntimeEnvironment({ setRuntimeEnvironment });
    const response = await fetch(buildApiUrl('/auth/status'), { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(await buildApiError(response, 'No se pudo validar el estado de autenticación.'));
    }
    const result = await response.json();
    state.auth.bootstrapSecretRequired = Boolean(result?.bootstrap?.requiresSecret);
    setBootstrapSecretRequirement(state.auth.bootstrapSecretRequired);
    return result;
  }
  
  async function restoreAuthenticatedUser() {
    if (!state.auth.token) {
      return false;
    }
  
    const response = await fetch(buildApiUrl('/auth/me'), { cache: 'no-cache' });
    if (!response.ok) {
      return false;
    }
  
    const result = await response.json();
    persistAuthUser(result.user || null);
    renderSessionSummary();
    applyModulePermissions();
    markSessionActivity({ forceWrite: true });
    return Boolean(state.auth.user);
  }
  
  async function startAuthenticatedApp() {
    if (!state.auth.token || !state.auth.user) {
      clearAuthenticatedState();
      return;
    }
    setAuthenticatedShell(true);
    setAuthStatus('');
    if (state.auth.user) {
      state.auth.user.permissions = normalizeModulePermissions(state.auth.user.permissions, state.auth.user.role);
      persistAuthUser(state.auth.user);
    }
    markSessionActivity({ forceWrite: true });
    renderSecurityCreatePermissions();
    renderSecurityUsers();
    if (state.auth.user?.role === 'admin') {
      try {
        await fetchAdminUsers();
      } catch (error) {
        if (securityUserStatus) {
          securityUserStatus.textContent = error.message || 'No se pudo cargar la lista de usuarios.';
        }
      }
    }
    await fetchProductos();
  }
  
  async function initializeAuthentication() {
    try {
      if (state.auth.token && hasSessionTimedOut()) {
        persistAuthToken('');
        persistAuthUser(null);
      }
  
      const status = await fetchAuthStatus();
      state.auth.configured = Boolean(status.configured);
      state.auth.bootstrapSecretRequired = Boolean(status?.bootstrap?.requiresSecret);
      setBootstrapSecretRequirement(state.auth.bootstrapSecretRequired);

      if (state.auth.token && status.authenticated && status.user) {
        persistAuthUser(status.user);
        await startAuthenticatedApp();
        return;
      }

      if (state.auth.token && status.authenticated && await restoreAuthenticatedUser()) {
        await startAuthenticatedApp();
        return;
      }

      if (state.auth.token && !status.authenticated) {
        persistAuthToken('');
        persistAuthUser(null);
      }

      clearAuthenticatedState();
      if (!state.auth.configured) {
        setAuthMode('bootstrap', { configured: false });
      }
    } catch (error) {
      clearAuthenticatedState({ message: error.message || 'No se pudo preparar la autenticación.', error: true });
    }
  }

  return {
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
    initializeAuthentication,
  };
}
