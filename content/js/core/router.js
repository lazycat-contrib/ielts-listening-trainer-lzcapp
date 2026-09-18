/**
 * Hash-based SPA Router
 * Simple, no dependencies.
 */

const routes = {};
let currentPage = null;

export function register(path, renderFn) {
  routes[path] = renderFn;
}

export function navigateTo(path) {
  const root = document.getElementById('app-root');
  if (!root) {
    console.warn('[Router] #app-root not found');
    return;
  }

  root.innerHTML = '';

  const renderFn = routes[path];
  if (renderFn) {
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.route === path);
    });

    // Update hash without triggering hashchange
    if (window.location.hash !== '#' + path) {
      history.pushState(null, '', '#' + path);
    }

    currentPage = path;

    try {
      renderFn(root);
    } catch (err) {
      console.error(`[Router] Error rendering ${path}:`, err);
      root.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>页面渲染失败</h3>
          <p style="color:var(--danger);">${err.message}</p>
        </div>`;
    }
  } else {
    console.warn(`[Router] No route registered for: ${path}`);
    navigateTo('dashboard');
  }
}

export function getCurrentRoute() {
  return currentPage;
}

/**
 * Set up hashchange listener.
 * Call once after registering all routes.
 */
export function listen() {
  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '#dashboard').replace('#', '');
    navigateTo(hash || 'dashboard');
  });

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const hash = (window.location.hash || '#dashboard').replace('#', '');
    navigateTo(hash || 'dashboard');
  });
}
