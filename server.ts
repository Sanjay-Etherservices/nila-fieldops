import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  isEnvAdminPasscodeConfigured,
  requireAdmin,
  requireAuth,
  signSessionToken,
  verifyEnvAdminPasscode,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  ACTIVITY_TYPES,
  calculateDistanceMetres,
  DAY_ORDERS,
  db,
  getIstDateString,
  hashPassword,
  initDatabase,
  resolveGoogleMapsCoords,
  sanitizeMapsUrl,
  verifyPassword,
  type ActivityType,
  type DayOrder,
} from './server/db.ts';

initDatabase();

const app = express();
app.use(express.json({ limit: '1mb' }));

function hasAdminUserInDb(): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1")
    .get() as { count: number };
  return row.count > 0;
}

// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------

app.get('/api/auth/status', (_req, res) => {
  const envAdminEnabled = isEnvAdminPasscodeConfigured();
  const hasAdmin = hasAdminUserInDb();
  res.json({
    needsAdminSetup: !envAdminEnabled && !hasAdmin,
    envAdminEnabled,
  });
});

app.post('/api/auth/setup-admin', (req, res) => {
  if (isEnvAdminPasscodeConfigured()) {
    res.status(403).json({
      error: 'Admin passcode is configured via server environment secrets.',
    });
    return;
  }

  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const identifier =
    typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (fullName.length < 2 || fullName.length > 80) {
    res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
    return;
  }
  if (identifier.length < 3 || identifier.length > 100) {
    res.status(400).json({ error: 'Admin ID or email must be at least 3 characters.' });
    return;
  }
  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
    return;
  }

  const passwordHash = hashPassword(password);

  try {
    const createTx = db.transaction(() => {
      if (hasAdminUserInDb()) {
        throw new Error('ADMIN_EXISTS');
      }
      const result = db
        .prepare(
          `INSERT INTO users (role, identifier, full_name, phone, district, password_hash, active)
           VALUES ('admin', ?, ?, '', 'Tamil Nadu HQ', ?, 1)`
        )
        .run(identifier, fullName, passwordHash);
      return Number(result.lastInsertRowid);
    });

    const userId = createTx();
    const sessionUser = {
      userId,
      role: 'admin' as const,
      identifier,
      fullName,
    };
    const token = signSessionToken(sessionUser);
    res.status(201).json({ token, user: sessionUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'ADMIN_EXISTS') {
      res.status(409).json({ error: 'Admin account has already been claimed.' });
      return;
    }
    res.status(400).json({ error: 'Unable to complete Admin setup. Check identifier uniqueness.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const role = req.body?.role === 'admin' ? 'admin' : req.body?.role === 'agent' ? 'agent' : null;
  const identifier =
    typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!role) {
    res.status(400).json({ error: 'Please select Admin or Agent role.' });
    return;
  }
  if (!password) {
    res.status(400).json({ error: 'PIN or password is required.' });
    return;
  }

  if (role === 'admin') {
    if (isEnvAdminPasscodeConfigured() && verifyEnvAdminPasscode(password)) {
      const sessionUser = {
        userId: 0,
        role: 'admin' as const,
        identifier: identifier || 'admin',
        fullName: 'Regional Admin',
        isEnvAdmin: true,
      };
      const token = signSessionToken(sessionUser);
      res.json({ token, user: sessionUser });
      return;
    }

    if (!identifier) {
      res.status(400).json({ error: 'Admin ID or email is required.' });
      return;
    }

    const adminRow = db
      .prepare(
        `SELECT id, identifier, full_name, password_hash, active
         FROM users WHERE role = 'admin' AND LOWER(identifier) = ?`
      )
      .get(identifier) as
      | { id: number; identifier: string; full_name: string; password_hash: string; active: number }
      | undefined;

    if (!adminRow || adminRow.active !== 1 || !verifyPassword(password, adminRow.password_hash)) {
      res.status(401).json({ error: 'Invalid Admin credentials.' });
      return;
    }

    const sessionUser = {
      userId: adminRow.id,
      role: 'admin' as const,
      identifier: adminRow.identifier,
      fullName: adminRow.full_name,
    };
    const token = signSessionToken(sessionUser);
    res.json({ token, user: sessionUser });
    return;
  }

  if (!identifier) {
    res.status(400).json({ error: 'Agent ID or email is required.' });
    return;
  }

  const agentRow = db
    .prepare(
      `SELECT id, identifier, full_name, password_hash, active
       FROM users WHERE role = 'agent' AND LOWER(identifier) = ?`
    )
    .get(identifier) as
    | { id: number; identifier: string; full_name: string; password_hash: string; active: number }
    | undefined;

  if (!agentRow) {
    res.status(401).json({ error: 'Invalid Agent ID/email or PIN.' });
    return;
  }
  if (agentRow.active !== 1) {
    res.status(403).json({ error: 'This Agent account is currently deactivated. Contact Admin.' });
    return;
  }
  if (!verifyPassword(password, agentRow.password_hash)) {
    res.status(401).json({ error: 'Invalid Agent ID/email or PIN.' });
    return;
  }

  const sessionUser = {
    userId: agentRow.id,
    role: 'agent' as const,
    identifier: agentRow.identifier,
    fullName: agentRow.full_name,
  };
  const token = signSessionToken(sessionUser);
  res.json({ token, user: sessionUser });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.auth });
});

// ---------------------------------------------------------------------------
// Dashboard Summary (Admin)
// ---------------------------------------------------------------------------

app.get('/api/dashboard/summary', requireAdmin, (_req, res) => {
  const today = getIstDateString();
  const locations = db
    .prepare('SELECT COUNT(*) AS count FROM locations WHERE active = 1')
    .get() as { count: number };
  const centres = db
    .prepare('SELECT COUNT(*) AS count FROM centres WHERE active = 1')
    .get() as { count: number };
  const agents = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'agent' AND active = 1")
    .get() as { count: number };
  const visitsToday = db
    .prepare('SELECT COUNT(*) AS count FROM collection_visits WHERE visit_date = ?')
    .get(today) as { count: number };
  const activeVisits = db
    .prepare(
      "SELECT COUNT(*) AS count FROM collection_visits WHERE visit_date = ? AND status = 'checked_in'"
    )
    .get(today) as { count: number };
  const outside100m = db
    .prepare(
      `SELECT COUNT(*) AS count FROM collection_visits
       WHERE visit_date = ? AND (in_within_100m = 0 OR out_within_100m = 0)`
    )
    .get(today) as { count: number };
  const fieldLogsToday = db
    .prepare("SELECT COUNT(*) AS count FROM field_status_logs WHERE substr(logged_at, 1, 10) = ?")
    .get(today) as { count: number };

  res.json({
    today,
    activeLocations: locations.count,
    activeCentres: centres.count,
    activeAgents: agents.count,
    visitsToday: visitsToday.count,
    activeVisits: activeVisits.count,
    outside100mWarnings: outside100m.count,
    fieldLogsToday: fieldLogsToday.count,
  });
});

// ---------------------------------------------------------------------------
// Locations Routes
// ---------------------------------------------------------------------------

app.get('/api/locations', requireAuth, (req: AuthenticatedRequest, res) => {
  const includeInactive = req.auth?.role === 'admin' && req.query.includeInactive === 'true';
  const rows = includeInactive
    ? db
        .prepare(
          `SELECT l.*, (SELECT COUNT(*) FROM centres c WHERE c.location_id = l.id AND c.active = 1) AS centre_count
           FROM locations l ORDER BY l.name ASC`
        )
        .all()
    : db
        .prepare(
          `SELECT l.*, (SELECT COUNT(*) FROM centres c WHERE c.location_id = l.id AND c.active = 1) AS centre_count
           FROM locations l WHERE l.active = 1 ORDER BY l.name ASC`
        )
        .all();
  res.json({ locations: rows });
});

app.post('/api/locations', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const state =
    typeof req.body?.state === 'string' && req.body.state.trim()
      ? req.body.state.trim()
      : 'Tamil Nadu';

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Location name must be between 2 and 80 characters.' });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO locations (name, state, active) VALUES (?, ?, 1)')
      .run(name, state);
    const created = db
      .prepare('SELECT *, 0 AS centre_count FROM locations WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ location: created });
  } catch {
    res.status(409).json({ error: 'A location with this name already exists.' });
  }
});

app.patch('/api/locations/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid location ID.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as
    | { id: number; name: string; state: string; active: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found.' });
    return;
  }

  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : existing.name;
  const active =
    typeof req.body?.active === 'boolean' ? (req.body.active ? 1 : 0) : existing.active;

  try {
    db.prepare('UPDATE locations SET name = ?, active = ? WHERE id = ?').run(name, active, id);
    const updated = db
      .prepare(
        `SELECT l.*, (SELECT COUNT(*) FROM centres c WHERE c.location_id = l.id AND c.active = 1) AS centre_count
         FROM locations l WHERE l.id = ?`
      )
      .get(id);
    res.json({ location: updated });
  } catch {
    res.status(409).json({ error: 'Unable to update location. Name may already exist.' });
  }
});

// ---------------------------------------------------------------------------
// Centres & Google Maps Link Parsing Routes
// ---------------------------------------------------------------------------

app.post('/api/centres/parse-map-link', requireAdmin, async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) {
    res.status(400).json({ error: 'Google Maps URL is required.' });
    return;
  }

  try {
    const resolved = await resolveGoogleMapsCoords(url);
    if (!resolved) {
      res.status(422).json({
        error:
          'Could not extract coordinates automatically from this link. Enter latitude and longitude manually below.',
      });
      return;
    }
    res.json(resolved);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid Google Maps link.',
    });
  }
});

app.get('/api/centres', requireAuth, (req: AuthenticatedRequest, res) => {
  const includeInactive = req.auth?.role === 'admin' && req.query.includeInactive === 'true';
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const dayOrder = typeof req.query.dayOrder === 'string' ? req.query.dayOrder.trim() : null;

  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (!includeInactive) {
    clauses.push('c.active = 1 AND l.active = 1');
  }
  if (locationId && Number.isInteger(locationId)) {
    clauses.push('c.location_id = ?');
    params.push(locationId);
  }
  if (dayOrder && DAY_ORDERS.includes(dayOrder as DayOrder)) {
    clauses.push('c.day_order = ?');
    params.push(dayOrder);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT c.*, l.name AS location_name
       FROM centres c
       JOIN locations l ON l.id = c.location_id
       ${whereSql}
       ORDER BY l.name ASC,
         CASE c.day_order
           WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
           WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 ELSE 7
         END ASC,
         c.name ASC`
    )
    .all(...params);

  res.json({ centres: rows });
});

app.post('/api/centres', requireAdmin, async (req, res) => {
  const locationId = Number(req.body?.locationId);
  const dayOrder = typeof req.body?.dayOrder === 'string' ? req.body.dayOrder.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const timeSlot = typeof req.body?.timeSlot === 'string' ? req.body.timeSlot.trim() : '';
  const rawMapsUrl =
    typeof req.body?.googleMapsUrl === 'string' ? req.body.googleMapsUrl.trim() : '';
  const sanitizedUrl = sanitizeMapsUrl(rawMapsUrl);

  if (!Number.isInteger(locationId) || locationId <= 0) {
    res.status(400).json({ error: 'Valid location is required.' });
    return;
  }
  if (!DAY_ORDERS.includes(dayOrder as DayOrder)) {
    res.status(400).json({ error: 'Valid day order (Mon–Sat) is required.' });
    return;
  }
  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Centre name must be between 2 and 80 characters.' });
    return;
  }
  if (timeSlot.length < 3 || timeSlot.length > 60) {
    res.status(400).json({ error: 'Time slot is required (e.g., 10:00 AM - 11:00 AM).' });
    return;
  }

  const loc = db.prepare('SELECT id FROM locations WHERE id = ?').get(locationId);
  if (!loc) {
    res.status(404).json({ error: 'Selected location does not exist.' });
    return;
  }

  let lat = req.body?.latitude !== undefined && req.body?.latitude !== '' ? Number(req.body.latitude) : NaN;
  let lng = req.body?.longitude !== undefined && req.body?.longitude !== '' ? Number(req.body.longitude) : NaN;
  let finalMapsUrl = sanitizedUrl;

  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && sanitizedUrl) {
    try {
      const resolved = await resolveGoogleMapsCoords(sanitizedUrl);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
        finalMapsUrl = resolved.resolvedUrl;
      }
    } catch {
      // Fall through to coordinate check
    }
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    res.status(400).json({
      error:
        'Valid latitude and longitude are required. Paste a Google Maps link with coordinates or enter them manually.',
    });
    return;
  }

  if (!finalMapsUrl) {
    finalMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  }

  const result = db
    .prepare(
      `INSERT INTO centres (location_id, day_order, name, time_slot, google_maps_url, latitude, longitude, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(locationId, dayOrder, name, timeSlot, finalMapsUrl, lat, lng);

  const created = db
    .prepare(
      `SELECT c.*, l.name AS location_name
       FROM centres c JOIN locations l ON l.id = c.location_id
       WHERE c.id = ?`
    )
    .get(Number(result.lastInsertRowid));

  res.status(201).json({ centre: created });
});

app.patch('/api/centres/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid centre ID.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM centres WHERE id = ?').get(id) as
    | {
        id: number;
        location_id: number;
        day_order: DayOrder;
        name: string;
        time_slot: string;
        google_maps_url: string;
        latitude: number;
        longitude: number;
        active: number;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Centre not found.' });
    return;
  }

  const locationId = req.body?.locationId ? Number(req.body.locationId) : existing.location_id;
  const dayOrder =
    typeof req.body?.dayOrder === 'string' && DAY_ORDERS.includes(req.body.dayOrder as DayOrder)
      ? req.body.dayOrder
      : existing.day_order;
  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : existing.name;
  const timeSlot =
    typeof req.body?.timeSlot === 'string' && req.body.timeSlot.trim()
      ? req.body.timeSlot.trim()
      : existing.time_slot;
  const googleMapsUrl =
    typeof req.body?.googleMapsUrl === 'string'
      ? sanitizeMapsUrl(req.body.googleMapsUrl) || existing.google_maps_url
      : existing.google_maps_url;
  const lat =
    req.body?.latitude !== undefined && req.body?.latitude !== ''
      ? Number(req.body.latitude)
      : existing.latitude;
  const lng =
    req.body?.longitude !== undefined && req.body?.longitude !== ''
      ? Number(req.body.longitude)
      : existing.longitude;
  const active =
    typeof req.body?.active === 'boolean' ? (req.body.active ? 1 : 0) : existing.active;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Invalid latitude or longitude.' });
    return;
  }

  db.prepare(
    `UPDATE centres
     SET location_id = ?, day_order = ?, name = ?, time_slot = ?, google_maps_url = ?, latitude = ?, longitude = ?, active = ?
     WHERE id = ?`
  ).run(locationId, dayOrder, name, timeSlot, googleMapsUrl, lat, lng, active, id);

  const updated = db
    .prepare(
      `SELECT c.*, l.name AS location_name
       FROM centres c JOIN locations l ON l.id = c.location_id
       WHERE c.id = ?`
    )
    .get(id);

  res.json({ centre: updated });
});

// ---------------------------------------------------------------------------
// Agents Management Routes (Admin)
// ---------------------------------------------------------------------------

app.get('/api/agents', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, role, identifier, full_name, phone, district, active, created_at
       FROM users WHERE role = 'agent'
       ORDER BY active DESC, full_name ASC`
    )
    .all();
  res.json({ agents: rows });
});

app.post('/api/agents', requireAdmin, (req, res) => {
  const identifier =
    typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const district = typeof req.body?.district === 'string' ? req.body.district.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (identifier.length < 3 || identifier.length > 100) {
    res.status(400).json({ error: 'Agent ID or email must be between 3 and 100 characters.' });
    return;
  }
  if (fullName.length < 2 || fullName.length > 80) {
    res.status(400).json({ error: 'Agent full name must be between 2 and 80 characters.' });
    return;
  }
  if (password.length < 4 || password.length > 128) {
    res.status(400).json({ error: 'PIN or password must be at least 4 characters.' });
    return;
  }

  const passwordHash = hashPassword(password);
  try {
    const result = db
      .prepare(
        `INSERT INTO users (role, identifier, full_name, phone, district, password_hash, active)
         VALUES ('agent', ?, ?, ?, ?, ?, 1)`
      )
      .run(identifier, fullName, phone, district, passwordHash);

    const created = db
      .prepare(
        `SELECT id, role, identifier, full_name, phone, district, active, created_at
         FROM users WHERE id = ?`
      )
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ agent: created });
  } catch {
    res.status(409).json({ error: 'An account with this Agent ID or email already exists.' });
  }
});

app.patch('/api/agents/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid agent ID.' });
    return;
  }

  const existing = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'agent'")
    .get(id) as
    | {
        id: number;
        full_name: string;
        phone: string;
        district: string;
        active: number;
        password_hash: string;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }

  const fullName =
    typeof req.body?.fullName === 'string' && req.body.fullName.trim()
      ? req.body.fullName.trim()
      : existing.full_name;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : existing.phone;
  const district =
    typeof req.body?.district === 'string' ? req.body.district.trim() : existing.district;
  const active =
    typeof req.body?.active === 'boolean' ? (req.body.active ? 1 : 0) : existing.active;
  const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (newPassword && newPassword.length < 4) {
    res.status(400).json({ error: 'New PIN or password must be at least 4 characters.' });
    return;
  }

  const passwordHash = newPassword ? hashPassword(newPassword) : existing.password_hash;

  db.prepare(
    `UPDATE users
     SET full_name = ?, phone = ?, district = ?, active = ?, password_hash = ?
     WHERE id = ? AND role = 'agent'`
  ).run(fullName, phone, district, active, passwordHash, id);

  const updated = db
    .prepare(
      `SELECT id, role, identifier, full_name, phone, district, active, created_at
       FROM users WHERE id = ?`
    )
    .get(id);

  res.json({ agent: updated });
});

// ---------------------------------------------------------------------------
// Collection Visits Routes (GPS Check-In / Check-Out)
// ---------------------------------------------------------------------------

const VISIT_SELECT_SQL = `
  SELECT
    v.*,
    u.full_name AS agent_name,
    u.identifier AS agent_identifier,
    c.name AS centre_name,
    c.day_order AS day_order,
    c.time_slot AS time_slot,
    c.latitude AS centre_lat,
    c.longitude AS centre_lng,
    c.google_maps_url AS centre_maps_url,
    l.id AS location_id,
    l.name AS location_name
  FROM collection_visits v
  JOIN users u ON u.id = v.agent_id
  JOIN centres c ON c.id = v.centre_id
  JOIN locations l ON l.id = c.location_id
`;

app.get('/api/visits', requireAuth, (req: AuthenticatedRequest, res) => {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (req.auth?.role === 'agent') {
    clauses.push('v.agent_id = ?');
    params.push(req.auth.userId);
  } else {
    if (req.query.locationId) {
      clauses.push('l.id = ?');
      params.push(Number(req.query.locationId));
    }
    if (typeof req.query.dayOrder === 'string' && DAY_ORDERS.includes(req.query.dayOrder as DayOrder)) {
      clauses.push('c.day_order = ?');
      params.push(req.query.dayOrder);
    }
    if (req.query.centreId) {
      clauses.push('c.id = ?');
      params.push(Number(req.query.centreId));
    }
    if (req.query.agentId) {
      clauses.push('v.agent_id = ?');
      params.push(Number(req.query.agentId));
    }
  }

  if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    clauses.push('v.visit_date = ?');
    params.push(req.query.date);
  }
  if (req.query.status === 'checked_in' || req.query.status === 'completed') {
    clauses.push('v.status = ?');
    params.push(req.query.status);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`${VISIT_SELECT_SQL} ${whereSql} ORDER BY v.in_time DESC LIMIT 250`)
    .all(...params);

  res.json({ visits: rows });
});

app.post('/api/visits/check-in', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth?.role !== 'agent') {
    res.status(403).json({ error: 'Only Field Agents can record centre check-ins.' });
    return;
  }

  const centreId = Number(req.body?.centreId);
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const accuracy = Number(req.body?.accuracy ?? 0);

  if (!Number.isInteger(centreId) || centreId <= 0) {
    res.status(400).json({ error: 'Please select a valid centre.' });
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid GPS coordinates are required for check-in.' });
    return;
  }

  const centre = db
    .prepare(
      `SELECT c.*, l.active AS location_active
       FROM centres c JOIN locations l ON l.id = c.location_id
       WHERE c.id = ?`
    )
    .get(centreId) as
    | { id: number; latitude: number; longitude: number; active: number; location_active: number }
    | undefined;

  if (!centre || centre.active !== 1 || centre.location_active !== 1) {
    res.status(404).json({ error: 'Selected centre is inactive or unavailable.' });
    return;
  }

  const today = getIstDateString();
  const openVisit = db
    .prepare(
      `SELECT id FROM collection_visits
       WHERE agent_id = ? AND centre_id = ? AND visit_date = ? AND status = 'checked_in'`
    )
    .get(req.auth.userId, centreId, today);

  if (openVisit) {
    res.status(409).json({
      error: 'You already have an active check-in at this centre today. Please check out first.',
    });
    return;
  }

  const distanceM = calculateDistanceMetres(lat, lng, centre.latitude, centre.longitude);
  const within100m = distanceM <= 100 ? 1 : 0;
  const nowIso = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO collection_visits (
         agent_id, centre_id, visit_date, in_time,
         in_lat, in_lng, in_accuracy_m, in_distance_m, in_within_100m, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'checked_in')`
    )
    .run(
      req.auth.userId,
      centreId,
      today,
      nowIso,
      lat,
      lng,
      Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
      distanceM,
      within100m
    );

  const created = db
    .prepare(`${VISIT_SELECT_SQL} WHERE v.id = ?`)
    .get(Number(result.lastInsertRowid));

  res.status(201).json({ visit: created });
});

app.post('/api/visits/:id/check-out', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth?.role !== 'agent') {
    res.status(403).json({ error: 'Only Field Agents can record centre check-outs.' });
    return;
  }

  const id = Number(req.params.id);
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const accuracy = Number(req.body?.accuracy ?? 0);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid visit ID.' });
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid GPS coordinates are required for check-out.' });
    return;
  }

  const visit = db
    .prepare(
      `SELECT v.*, c.latitude AS centre_lat, c.longitude AS centre_lng
       FROM collection_visits v
       JOIN centres c ON c.id = v.centre_id
       WHERE v.id = ?`
    )
    .get(id) as
    | {
        id: number;
        agent_id: number;
        status: string;
        centre_lat: number;
        centre_lng: number;
      }
    | undefined;

  if (!visit) {
    res.status(404).json({ error: 'Visit record not found.' });
    return;
  }
  if (visit.agent_id !== req.auth.userId) {
    res.status(403).json({ error: 'You can only check out from your own visits.' });
    return;
  }
  if (visit.status === 'completed') {
    res.status(409).json({ error: 'This visit is already checked out.' });
    return;
  }

  const outDistanceM = calculateDistanceMetres(lat, lng, visit.centre_lat, visit.centre_lng);
  const outWithin100m = outDistanceM <= 100 ? 1 : 0;
  const nowIso = new Date().toISOString();

  db.prepare(
    `UPDATE collection_visits
     SET out_time = ?, out_lat = ?, out_lng = ?, out_accuracy_m = ?,
         out_distance_m = ?, out_within_100m = ?, status = 'completed'
     WHERE id = ?`
  ).run(
    nowIso,
    lat,
    lng,
    Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
    outDistanceM,
    outWithin100m,
    id
  );

  const updated = db.prepare(`${VISIT_SELECT_SQL} WHERE v.id = ?`).get(id);
  res.json({ visit: updated });
});

// ---------------------------------------------------------------------------
// Field Status Routes (Sourcing, Loan, Training, Collection — NO loan amount)
// ---------------------------------------------------------------------------

const FIELD_LOG_SELECT_SQL = `
  SELECT
    f.*,
    u.full_name AS agent_name,
    u.identifier AS agent_identifier,
    c.name AS centre_name,
    c.day_order AS day_order,
    c.time_slot AS time_slot,
    COALESCE(l.name, l2.name) AS location_name
  FROM field_status_logs f
  JOIN users u ON u.id = f.agent_id
  LEFT JOIN centres c ON c.id = f.centre_id
  LEFT JOIN locations l ON l.id = c.location_id
  LEFT JOIN locations l2 ON l2.id = f.location_id
`;

app.get('/api/field-status', requireAuth, (req: AuthenticatedRequest, res) => {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (req.auth?.role === 'agent') {
    clauses.push('f.agent_id = ?');
    params.push(req.auth.userId);
  } else {
    if (req.query.locationId) {
      const locId = Number(req.query.locationId);
      clauses.push('(c.location_id = ? OR f.location_id = ?)');
      params.push(locId, locId);
    }
    if (
      typeof req.query.activityType === 'string' &&
      ACTIVITY_TYPES.includes(req.query.activityType as ActivityType)
    ) {
      clauses.push('f.activity_type = ?');
      params.push(req.query.activityType);
    }
    if (req.query.agentId) {
      clauses.push('f.agent_id = ?');
      params.push(Number(req.query.agentId));
    }
  }

  if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    clauses.push('substr(f.logged_at, 1, 10) = ?');
    params.push(req.query.date);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`${FIELD_LOG_SELECT_SQL} ${whereSql} ORDER BY f.logged_at DESC LIMIT 250`)
    .all(...params);

  res.json({ logs: rows });
});

app.post('/api/field-status', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth?.role !== 'agent') {
    res.status(403).json({ error: 'Only Field Agents can submit Field Status updates.' });
    return;
  }

  const activityType =
    typeof req.body?.activityType === 'string' ? req.body.activityType.trim() : '';
  const centreId = req.body?.centreId ? Number(req.body.centreId) : null;
  const locationIdInput = req.body?.locationId ? Number(req.body.locationId) : null;
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim() : '';
  const lat = req.body?.lat !== undefined && req.body?.lat !== null ? Number(req.body.lat) : null;
  const lng = req.body?.lng !== undefined && req.body?.lng !== null ? Number(req.body.lng) : null;
  const accuracy =
    req.body?.accuracy !== undefined && req.body?.accuracy !== null
      ? Number(req.body.accuracy)
      : null;

  if (!ACTIVITY_TYPES.includes(activityType as ActivityType)) {
    res.status(400).json({ error: 'Select Sourcing, Loan, Training, or Collection.' });
    return;
  }

  if ((activityType === 'Sourcing' || activityType === 'Loan') && (!centreId || !Number.isInteger(centreId))) {
    res.status(400).json({ error: `Centre selection is required for ${activityType}.` });
    return;
  }

  if (activityType === 'Loan' && remarks.length < 2) {
    res.status(400).json({ error: 'Remarks are required when logging Loan field status.' });
    return;
  }

  let resolvedLocationId = locationIdInput;
  if (centreId) {
    const centre = db
      .prepare('SELECT id, location_id, active FROM centres WHERE id = ?')
      .get(centreId) as { id: number; location_id: number; active: number } | undefined;
    if (!centre || centre.active !== 1) {
      res.status(404).json({ error: 'Selected centre is unavailable.' });
      return;
    }
    resolvedLocationId = centre.location_id;
  }

  const nowIso = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO field_status_logs (
         agent_id, activity_type, centre_id, location_id, remarks,
         lat, lng, accuracy_m, logged_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.auth.userId,
      activityType,
      centreId,
      resolvedLocationId,
      remarks,
      lat !== null && Number.isFinite(lat) ? lat : null,
      lng !== null && Number.isFinite(lng) ? lng : null,
      accuracy !== null && Number.isFinite(accuracy) ? Math.round(accuracy) : null,
      nowIso
    );

  const created = db
    .prepare(`${FIELD_LOG_SELECT_SQL} WHERE f.id = ?`)
    .get(Number(result.lastInsertRowid));

  res.status(201).json({ log: created });
});

// ---------------------------------------------------------------------------
// Vite / Static Frontend Serving on Port 3000
// ---------------------------------------------------------------------------

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nila FieldOps server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
