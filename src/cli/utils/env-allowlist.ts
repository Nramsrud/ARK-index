/**
 * Environment variable allowlist for subprocess execution
 *
 * Per spec: When spawning git/rg, ARK constructs a minimal environment
 * from allowed vars only; does not inherit full process environment.
 */

/**
 * Allowed environment variables for Unix platforms
 */
const UNIX_ALLOWED = [
  'PATH',
  'HOME',
  'USER',
  'TERM',
  'NO_COLOR',
  'FORCE_COLOR',
];

/**
 * Additional allowed environment variables for Windows/WSL
 */
const WINDOWS_ADDITIONAL = [
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'SystemRoot',
  'COMSPEC',
];

/**
 * Check if running on Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Get the list of allowed environment variable names for the current platform
 */
export function getAllowedEnvNames(): string[] {
  const allowed = [...UNIX_ALLOWED];

  if (isWindows()) {
    allowed.push(...WINDOWS_ADDITIONAL);
  }

  return allowed;
}

/**
 * Build a minimal environment object from the allowed list
 * Also includes any ARK_* prefixed variables
 */
export function getAllowedEnv(): NodeJS.ProcessEnv {
  const allowedNames = getAllowedEnvNames();
  const result: NodeJS.ProcessEnv = {};

  // Add explicitly allowed variables
  for (const name of allowedNames) {
    if (process.env[name] !== undefined) {
      result[name] = process.env[name];
    }
  }

  // Add ARK_* prefixed variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ARK_') && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
