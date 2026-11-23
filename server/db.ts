import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'fieldops.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const DAY_ORDERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type DayOrder = (typeof DAY_ORDERS)[number];

export const ACTIVITY_TYPES = ['Sourcing', 'Loan', 'Training', 'Collection'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'agent')),
      identifier TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'Tamil Nadu',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS centres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      day_order TEXT NOT NULL CHECK(day_order IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat')),
      name TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      google_maps_url TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES users(id),
      centre_id INTEGER NOT NULL REFERENCES centres(id),
      visit_date TEXT NOT NULL,
      in_time TEXT NOT NULL,
      in_lat REAL NOT NULL,
      in_lng REAL NOT NULL,
      in_accuracy_m REAL NOT NULL,
      in_distance_m REAL NOT NULL,
      in_within_100m INTEGER NOT NULL,
      out_time TEXT,
      out_lat REAL,
      out_lng REAL,
      out_accuracy_m REAL,
      out_distance_m REAL,
      out_within_100m INTEGER,
      status TEXT NOT NULL CHECK(status IN ('checked_in', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS field_status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES users(id),
      activity_type TEXT NOT NULL CHECK(activity_type IN ('Sourcing', 'Loan', 'Training', 'Collection')),
      centre_id INTEGER REFERENCES centres(id),
      location_id INTEGER REFERENCES locations(id),
      remarks TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      accuracy_m REAL,
      logged_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_centres_location_day ON centres(location_id, day_order);
    CREATE INDEX IF NOT EXISTS idx_visits_date_centre ON collection_visits(visit_date, centre_id);
    CREATE INDEX IF NOT EXISTS idx_visits_agent_date ON collection_visits(agent_id, visit_date);
    CREATE INDEX IF NOT EXISTS idx_field_logs_logged_at ON field_status_logs(logged_at);
  `);

  seedInitialLocationsAndCentres();
}

function seedInitialLocationsAndCentres(): void {
  const locCountRow = db.prepare('SELECT COUNT(*) AS count FROM locations').get() as { count: number };
  if (locCountRow.count > 0) {
    return;
  }

  const insertLoc = db.prepare('INSERT INTO locations (name, state) VALUES (?, ?)');
  const insertCentre = db.prepare(`
    INSERT INTO centres (location_id, day_order, name, time_slot, google_maps_url, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seedTx = db.transaction(() => {
    const coimbatoreId = Number(insertLoc.run('Coimbatore', 'Tamil Nadu').lastInsertRowid);
    const maduraiId = Number(insertLoc.run('Madurai', 'Tamil Nadu').lastInsertRowid);
    const chennaiId = Number(insertLoc.run('Chennai', 'Tamil Nadu').lastInsertRowid);

    const initialCentres: Array<[number, DayOrder, string, string, number, number]> = [
      [coimbatoreId, 'Mon', 'Mars', '10:00 AM - 11:00 AM', 11.0168, 76.9558],
      [coimbatoreId, 'Mon', 'Saturn', '11:00 AM - 12:00 PM', 11.0086, 76.9510],
      [coimbatoreId, 'Tue', 'Neptune', '12:00 PM - 01:00 PM', 11.0285, 77.0031],
      [coimbatoreId, 'Wed', 'Mars', '10:00 AM - 11:00 AM', 11.0018, 77.0289],
      [maduraiId, 'Mon', 'Mars', '10:00 AM - 11:00 AM', 9.9252, 78.1490],
      [maduraiId, 'Tue', 'Saturn', '11:00 AM - 12:00 PM', 9.9391, 78.1370],
      [maduraiId, 'Wed', 'Neptune', '12:00 PM - 01:00 PM', 9.8825, 78.0537],
      [chennaiId, 'Mon', 'Mars', '10:00 AM - 11:00 AM', 13.0418, 80.2341],
      [chennaiId, 'Tue', 'Saturn', '11:00 AM - 12:00 PM', 12.9815, 80.2180],
      [chennaiId, 'Wed', 'Neptune', '12:00 PM - 01:00 PM', 12.9249, 80.1000],
    ];

    for (const [locId, dayOrder, name, slot, lat, lng] of initialCentres) {
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      insertCentre.run(locId, dayOrder, name, slot, url, lat, lng);
    }
  });

  seedTx();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuf = Buffer.from(keyHex, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function getIstDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function calculateDistanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function sanitizeMapsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function extractCoordsFromUrlString(input: string): { lat: number; lng: number } | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  })();

  const patterns: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|destination|center|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /\/maps\/(?:search|place)\/[^/]*?(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (isValidLatLng(lat, lng)) {
        return { lat, lng };
      }
    }
  }

  return null;
}

const ALLOWED_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
  'www.google.co.in',
  'google.co.in',
  'maps.google.co.in',
]);

function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    if (lower.startsWith('::ffff:')) {
      return isDisallowedIp(lower.replace('::ffff:', ''));
    }
    return false;
  }
  return true;
}

async function assertSafeGoogleMapsUrl(urlStr: string): Promise<URL> {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Google Maps URL must use https or http');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_MAPS_HOSTS.has(hostname)) {
    throw new Error('Only official Google Maps links can be auto-resolved');
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((r) => isDisallowedIp(r.address))) {
    throw new Error('Resolved network address is not permitted');
  }
  return parsed;
}

export async function resolveGoogleMapsCoords(
  rawUrl: string
): Promise<{ lat: number; lng: number; resolvedUrl: string } | null> {
  const sanitized = sanitizeMapsUrl(rawUrl);
  if (!sanitized) return null;

  const direct = extractCoordsFromUrlString(sanitized);
  if (direct) {
    return { ...direct, resolvedUrl: sanitized };
  }

  let currentUrl = sanitized;
  for (let hop = 0; hop < 4; hop++) {
    const validated = await assertSafeGoogleMapsUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(validated.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });
      const locationHeader = res.headers.get('location');
      if (locationHeader) {
        const nextUrl = new URL(locationHeader, validated.toString()).toString();
        const extracted = extractCoordsFromUrlString(nextUrl);
        if (extracted) {
          return { ...extracted, resolvedUrl: sanitizeMapsUrl(nextUrl) || sanitized };
        }
        currentUrl = nextUrl;
        continue;
      }
      if (res.ok) {
        const html = await res.text();
        const snippet = html.slice(0, 65000);
        const extracted = extractCoordsFromUrlString(snippet);
        if (extracted) {
          return { ...extracted, resolvedUrl: currentUrl };
        }
        const metaMatch = snippet.match(/content="[^"]*?center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i);
        if (metaMatch) {
          const lat = Number(metaMatch[1]);
          const lng = Number(metaMatch[2]);
          if (isValidLatLng(lat, lng)) {
            return { lat, lng, resolvedUrl: currentUrl };
          }
        }
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
