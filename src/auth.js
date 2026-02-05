import { URL } from 'url';

/**
 * Normalize auth config to handle both old (array) and new (object) key formats
 * 
 * Old format: { keys: ["key1", "key2"] }
 * New format: { keys: { "key1": { name: "User", projects: ["proj1"] } } }
 */
export function normalizeAuthConfig(config) {
  const auth = config?.auth ?? {};
  const enabled = auth.enabled === true;
  
  // Handle both array (legacy) and object (new) formats
  let keys = {};
  
  if (Array.isArray(auth.keys)) {
    // Legacy: convert array to object with full access
    for (const key of auth.keys) {
      if (typeof key === 'string' && key.trim().length > 0) {
        keys[key.trim()] = { name: 'User', projects: '*' };
      }
    }
  } else if (auth.keys && typeof auth.keys === 'object') {
    // New format: object with user info
    for (const [key, info] of Object.entries(auth.keys)) {
      if (typeof key === 'string' && key.trim().length > 0) {
        keys[key.trim()] = {
          name: info?.name || 'User',
          projects: info?.projects || '*'
        };
      }
    }
  }

  return { enabled, keys };
}

/**
 * Validate a key and return user info if valid
 * Returns: { valid: true, user: { name, projects } } or { valid: false }
 */
export function validateKey(authConfig, key) {
  if (!authConfig.enabled) {
    return { valid: true, user: { name: 'Anonymous', projects: '*' } };
  }
  
  if (typeof key !== 'string' || key.trim().length === 0) {
    return { valid: false };
  }
  
  const normalizedKey = key.trim();
  const userInfo = authConfig.keys[normalizedKey];
  
  if (!userInfo) {
    return { valid: false };
  }
  
  return { 
    valid: true, 
    user: {
      name: userInfo.name,
      projects: userInfo.projects
    }
  };
}

/**
 * Check if a user has access to a specific project
 */
export function canAccessProject(user, projectId) {
  if (!user) return false;
  if (user.projects === '*') return true;
  if (Array.isArray(user.projects)) {
    return user.projects.includes(projectId);
  }
  return false;
}

/**
 * Filter projects list to only those the user can access
 */
export function filterProjectsForUser(projects, user) {
  if (!user) return [];
  if (user.projects === '*') return projects;
  if (Array.isArray(user.projects)) {
    return projects.filter(p => user.projects.includes(p.id));
  }
  return [];
}

/**
 * Legacy compatibility: check if key is valid (boolean)
 */
export function isValidKey(authConfig, key) {
  return validateKey(authConfig, key).valid;
}

export function getKeyFromHttpRequest(req) {
  const headerKey = req?.headers?.['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  const queryKey = req?.query?.key;
  if (typeof queryKey === 'string' && queryKey.trim().length > 0) {
    return queryKey.trim();
  }

  return null;
}

export function getKeyFromWebSocketRequest(req) {
  if (!req?.url) return null;

  const base = `http://${req.headers.host || 'localhost'}`;
  const parsed = new URL(req.url, base);
  const key = parsed.searchParams.get('key');
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }

  return null;
}
