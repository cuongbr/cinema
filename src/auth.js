const crypto = require('crypto');
const { promisify } = require('util');
const pool = require('./db');

const scrypt = promisify(crypto.scrypt);
const cookieName = 'cineve_session';
const sessionSeconds = 7 * 24 * 60 * 60;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, keyHex] = String(stored || '').split(':');
  if (!/^[0-9a-f]{32}$/.test(saltHex || '') || !/^[0-9a-f]{128}$/.test(keyHex || '')) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(actual, Buffer.from(keyHex, 'hex'));
}

function readToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`));
  const token = cookie ? cookie.slice(cookieName.length + 1) : '';
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieOptions(req) {
  const secure = req.secure ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/${secure}`;
}

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP()');
  await pool.query('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash(token), userId, expiresAt]);
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Max-Age=${sessionSeconds}; ${cookieOptions(req)}`);
}

async function clearSession(req, res) {
  const token = readToken(req);
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash(token)]);
  res.setHeader('Set-Cookie', `${cookieName}=; Max-Age=0; ${cookieOptions(req)}`);
}

async function attachUser(req, res, next) {
  if (req.path.startsWith('/health')) return next();
  try {
    const token = readToken(req);
    req.currentUser = null;
    if (token) {
      const [[user]] = await pool.query(`
        SELECT u.id, u.name, u.email
        FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
      `, [tokenHash(token)]);
      req.currentUser = user || null;
    }
    res.locals.currentUser = req.currentUser;
    next();
  } catch (error) { next(error); }
}

function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  const source = origin || referer;
  if (source) {
    try {
      const sourceUrl = new URL(source);
      const host = req.get('host');
      if (sourceUrl.host !== host || !['http:', 'https:'].includes(sourceUrl.protocol)) {
        return res.status(403).send('Yêu cầu không hợp lệ');
      }
    } catch { return res.status(403).send('Yêu cầu không hợp lệ'); }
  }
  next();
}

module.exports = { hashPassword, verifyPassword, createSession, clearSession, attachUser, sameOrigin };
