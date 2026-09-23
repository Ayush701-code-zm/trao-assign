import { config } from '../config.js';
import net from 'net';
import dns from 'dns/promises';

const BLOCKED_HOSTS = new Set(['metadata.google.internal', 'metadata']);

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  return false;
}

export async function assertSafeUrl(input, { allowPrivate = config.allowPrivateUrls } = {}) {
  let url;
  try {
    url = new URL(input);
  } catch {
    const err = new Error('Invalid URL');
    err.code = 'INVALID_URL';
    throw err;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    const err = new Error('Only http and https URLs are allowed');
    err.code = 'INVALID_URL';
    throw err;
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    const err = new Error('Blocked host');
    err.code = 'INVALID_URL';
    throw err;
  }

  if (!allowPrivate) {
    if (host === 'localhost' || host.endsWith('.local')) {
      const err = new Error('Private/loopback addresses are not allowed');
      err.code = 'INVALID_URL';
      throw err;
    }

    if (net.isIP(host)) {
      if (isPrivateIp(host)) {
        const err = new Error('Private/loopback addresses are not allowed');
        err.code = 'INVALID_URL';
        throw err;
      }
    } else {
      try {
        const records = await dns.lookup(host, { all: true });
        for (const r of records) {
          if (isPrivateIp(r.address)) {
            const err = new Error('URL resolves to a private address');
            err.code = 'INVALID_URL';
            throw err;
          }
        }
      } catch (e) {
        if (e.code === 'INVALID_URL') throw e;
        // DNS failure is handled later as unreachable
      }
    }
  }

  return url;
}

export function resolveUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
