// Service Provider Directory - backend (Node.js built-in modules only, no npm install needed)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, DB = path.join(__dirname, 'db.json');
const hash = (p, s = crypto.randomBytes(8).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const check = (p, h) => hash(p, h.split(':')[0]) === h;
let db;
function load() {
  if (fs.existsSync(DB)) return db = JSON.parse(fs.readFileSync(DB));
  db = { seq: 10, users: [], providers: [], bookings: [], notes: [] };
  db.users.push({ id: 1, name: 'Admin', email: 'admin@demo.com', pass: hash('admin123'), role: 'admin' },
    { id: 2, name: 'Ravi Electric', email: 'provider@demo.com', pass: hash('provider123'), role: 'provider' },
    { id: 3, name: 'Neha Customer', email: 'customer@demo.com', pass: hash('customer123'), role: 'customer' });
  db.providers.push(
    { id: 4, ownerId: 2, name: 'Ravi Electric Works', category: 'Electrician', city: 'Jalandhar', phone: '9876500001', price: 300, description: 'Home wiring, fan and inverter repair. Same-day visits.' },
    { id: 5, ownerId: 2, name: 'AquaFix Plumbing', category: 'Plumber', city: 'Ludhiana', phone: '9876500002', price: 250, description: 'Leak repair, bathroom fittings and tank cleaning.' },
    { id: 6, ownerId: 2, name: 'Sparkle Home Care', category: 'Cleaning', city: 'Jalandhar', phone: '9876500003', price: 500, description: 'Deep cleaning for flats, offices and shops.' });
  save();
}
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 1));
const sessions = new Map();
const notify = (userId, text) => db.notes.unshift({ id: ++db.seq, userId, text, read: false, at: Date.now() });
const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const fail = (res, code, msg) => send(res, code, { error: msg });
const clean = s => String(s || '').trim().replace(/[<>]/g, '');
const STATUS = ['pending', 'accepted', 'rejected', 'completed', 'cancelled'];

function validateProvider(b) {
  const p = { name: clean(b.name), category: clean(b.category), city: clean(b.city), phone: clean(b.phone), price: Number(b.price), description: clean(b.description) };
  if (p.name.length < 3) return 'Name must be at least 3 characters.';
  if (!p.category) return 'Choose a category.';
  if (!p.city) return 'City is required.';
  if (!/^\d{10}$/.test(p.phone)) return 'Phone must be 10 digits.';
  if (!(p.price >= 0)) return 'Price must be a number.';
  return p;
}

async function api(req, res, url) {
  let body = {}; 
  if (req.method !== 'GET') { let raw = ''; for await (const c of req) raw += c; try { body = raw ? JSON.parse(raw) : {}; } catch { return fail(res, 400, 'Invalid JSON'); } }
  const parts = url.pathname.split('/').filter(Boolean).slice(1), [r, id] = parts, q = url.searchParams, m = req.method;
  if (r === 'register' && m === 'POST') {
    const email = clean(body.email).toLowerCase(), name = clean(body.name), role = body.role === 'provider' ? 'provider' : 'customer';
    if (name.length < 2) return fail(res, 400, 'Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
    if (String(body.password || '').length < 6) return fail(res, 400, 'Password needs 6+ characters.');
    if (db.users.some(u => u.email === email)) return fail(res, 409, 'Email already registered.');
    const u = { id: ++db.seq, name, email, pass: hash(body.password), role }; db.users.push(u); save();
    const token = crypto.randomUUID(); sessions.set(token, u.id);
    return send(res, 201, { token, user: { id: u.id, name, email, role } });
  }
  if (r === 'login' && m === 'POST') {
    const u = db.users.find(x => x.email === clean(body.email).toLowerCase());
    if (!u || !check(String(body.password || ''), u.pass)) return fail(res, 401, 'Wrong email or password.');
    const token = crypto.randomUUID(); sessions.set(token, u.id);
    return send(res, 200, { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }
  if (r === 'providers' && m === 'GET' && !id) { // public: search + filter
    const text = (q.get('q') || '').toLowerCase(), cat = q.get('category'), city = (q.get('city') || '').toLowerCase();
    return send(res, 200, db.providers.filter(p => (!cat || p.category === cat) && (!city || p.city.toLowerCase().includes(city)) &&
      (!text || (p.name + p.description + p.category).toLowerCase().includes(text))));
  }
  const uid = sessions.get((req.headers.authorization || '').replace('Bearer ', ''));
  const me = db.users.find(u => u.id === uid);
  if (!me) return fail(res, 401, 'Please log in.');
  if (r === 'me') return send(res, 200, { id: me.id, name: me.name, email: me.email, role: me.role });
  if (r === 'providers') {
    if (m === 'POST') {
      if (me.role === 'customer') return fail(res, 403, 'Only providers can add listings.');
      const p = validateProvider(body); if (typeof p === 'string') return fail(res, 400, p);
      const rec = { id: ++db.seq, ownerId: me.id, ...p }; db.providers.push(rec); save(); return send(res, 201, rec);
    }
    const rec = db.providers.find(p => p.id == id);
    if (!rec) return fail(res, 404, 'Listing not found.');
    if (me.role !== 'admin' && rec.ownerId !== me.id) return fail(res, 403, 'Not your listing.');
    if (m === 'PUT') { const p = validateProvider(body); if (typeof p === 'string') return fail(res, 400, p); Object.assign(rec, p); save(); return send(res, 200, rec); }
    if (m === 'DELETE') { db.providers = db.providers.filter(p => p !== rec); db.bookings = db.bookings.filter(b => b.providerId !== rec.id); save(); return send(res, 200, { ok: true }); }
  }
  if (r === 'bookings') {
    if (m === 'GET') {
      const list = db.bookings.filter(b => me.role === 'admin' || (me.role === 'customer' ? b.customerId === me.id : b.ownerId === me.id));
      return send(res, 200, list.sort((a, b) => b.id - a.id));
    }
    if (m === 'POST') {
      if (me.role !== 'customer') return fail(res, 403, 'Only customers can book.');
      const p = db.providers.find(x => x.id == body.providerId); if (!p) return fail(res, 404, 'Provider not found.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || body.date < new Date().toISOString().slice(0, 10)) return fail(res, 400, 'Pick a date from today onwards.');
      const b = { id: ++db.seq, providerId: p.id, providerName: p.name, ownerId: p.ownerId, customerId: me.id, customerName: me.name, date: body.date, note: clean(body.note).slice(0, 200), status: 'pending', at: Date.now() };
      db.bookings.push(b); notify(p.ownerId, `New booking request from ${me.name} for ${b.date}.`); save(); return send(res, 201, b);
    }
    if (m === 'PATCH') {
      const b = db.bookings.find(x => x.id == id); if (!b) return fail(res, 404, 'Booking not found.');
      const s = body.status; if (!STATUS.includes(s)) return fail(res, 400, 'Invalid status.');
      const okProv = me.id === b.ownerId && ((b.status === 'pending' && ['accepted', 'rejected'].includes(s)) || (b.status === 'accepted' && s === 'completed'));
      const okCust = me.id === b.customerId && s === 'cancelled' && ['pending', 'accepted'].includes(b.status);
      if (!okProv && !okCust && me.role !== 'admin') return fail(res, 400, `Cannot change ${b.status} booking to ${s}.`);
      b.status = s; notify(me.id === b.customerId ? b.ownerId : b.customerId, `Booking #${b.id} (${b.providerName}) is now ${s}.`); save(); return send(res, 200, b);
    }
  }
  if (r === 'notifications') {
    if (m === 'POST') { db.notes.filter(n => n.userId === me.id).forEach(n => n.read = true); save(); return send(res, 200, { ok: true }); }
    return send(res, 200, db.notes.filter(n => n.userId === me.id).slice(0, 20));
  }
  if (r === 'reports') {
    if (me.role !== 'admin') return fail(res, 403, 'Admins only.');
    const by = (arr, f) => arr.reduce((o, x) => (o[f(x)] = (o[f(x)] || 0) + 1, o), {});
    return send(res, 200, { users: db.users.length, providers: db.providers.length, bookings: db.bookings.length,
      byCategory: by(db.providers, p => p.category), byStatus: by(db.bookings, b => b.status) });
  }
  fail(res, 404, 'Not found');
}

load();
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(e => { console.error(e); fail(res, 500, 'Server error'); });
  const f = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(f, (e, d) => e ? (res.writeHead(404), res.end('Not found')) : (res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }), res.end(d)));
}).listen(PORT, () => console.log('Running on http://localhost:' + PORT));
