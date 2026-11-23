const CATS = ['Electrician', 'Plumber', 'Cleaning', 'Carpenter', 'AC Repair', 'Tutor', 'Painter'];
let user = JSON.parse(localStorage.getItem('user') || 'null'), token = localStorage.getItem('token');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json(); if (!r.ok) { if (r.status === 401 && token) logout(); throw new Error(d.error || 'Something went wrong'); } return d;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2500); }
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').hidden = false; const f = $('#sheet input,#sheet select'); f && f.focus(); }
const closeModal = () => $('#modal').hidden = true;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.onkeydown = e => { if (e.key === 'Escape') closeModal(); };
$('#cat').innerHTML += CATS.map(c => `<option>${c}</option>`).join('');

function nav() {
  $('#nav').innerHTML = user ? `<span>${esc(user.name)} (${user.role})</span><button class="ghost sm" onclick="logout()">Log out</button>`
    : `<button class="ghost sm" onclick="authForm('login')">Log in</button><button class="sm" onclick="authForm('register')">Sign up</button>`;
}
function authForm(mode) {
  const reg = mode === 'register';
  openModal(`<h2>${reg ? 'Create your account' : 'Log in'}</h2>
  ${reg ? '<label>Name<input id="a-name"></label>' : ''}<label>Email<input id="a-email" type="email"></label>
  <label>Password<input id="a-pass" type="password"></label>
  ${reg ? '<label>I want to<select id="a-role"><option value="customer">Find a service provider</option><option value="provider">List my services</option></select></label>' : '<p class="meta">Demo: customer@demo.com / customer123 · provider@demo.com / provider123 · admin@demo.com / admin123</p>'}
  <div class="err" id="a-err"></div><button onclick="auth('${mode}')">${reg ? 'Create account' : 'Log in'}</button>`);
}
async function auth(mode) {
  try {
    const d = await api(mode, 'POST', { name: $('#a-name')?.value, email: $('#a-email').value, password: $('#a-pass').value, role: $('#a-role')?.value });
    token = d.token; user = d.user; localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
    closeModal(); nav(); loadDash(); toast('Welcome, ' + user.name);
  } catch (e) { $('#a-err').textContent = e.message; }
}
function logout() { token = user = null; localStorage.clear(); nav(); $('#dash').hidden = true; }

async function search(e) {
  e && e.preventDefault();
  const p = new URLSearchParams({ q: $('#q').value, category: $('#cat').value, city: $('#city').value });
  const list = await api('providers?' + p);
  $('#results').innerHTML = list.length ? list.map(x => `<article class="card"><span class="tag">${esc(x.category)}</span><h3>${esc(x.name)}</h3>
    <div class="meta">${esc(x.city)} · ${esc(x.phone)}</div><p>${esc(x.description)}</p><div class="price">From ₹${x.price}</div>
    <button onclick="bookForm(${x.id},'${esc(x.name).replace(/'/g, '')}')">Request booking</button></article>`).join('')
    : '<div class="empty">No providers match. Try a different category or clear the city.</div>';
}
$('#search').onsubmit = search;

function bookForm(id, name) {
  if (!user) return authForm('login');
  if (user.role !== 'customer') return toast('Log in as a customer to book.');
  openModal(`<h2>Book ${name}</h2><label>Preferred date<input id="b-date" type="date" min="${new Date().toISOString().slice(0, 10)}"></label>
  <label>What do you need?<textarea id="b-note" rows="3" maxlength="200"></textarea></label><div class="err" id="b-err"></div><button onclick="book(${id})">Send request</button>`);
}
async function book(id) {
  try { await api('bookings', 'POST', { providerId: id, date: $('#b-date').value, note: $('#b-note').value }); closeModal(); toast('Request sent'); loadDash(); }
  catch (e) { $('#b-err').textContent = e.message; }
}
async function setStatus(id, s) { try { await api('bookings/' + id, 'PATCH', { status: s }); toast('Booking ' + s); loadDash(); } catch (e) { toast(e.message); } }

function providerForm(p = {}) {
  openModal(`<h2>${p.id ? 'Edit listing' : 'Add listing'}</h2><label>Business name<input id="p-name" value="${esc(p.name)}"></label>
  <label>Category<select id="p-cat">${CATS.map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label>City<input id="p-city" value="${esc(p.city)}"></label><label>Phone (10 digits)<input id="p-phone" value="${esc(p.phone)}"></label>
  <label>Starting price (₹)<input id="p-price" type="number" min="0" value="${p.price ?? ''}"></label>
  <label>Description<textarea id="p-desc" rows="3">${esc(p.description)}</textarea></label><div class="err" id="p-err"></div>
  <button onclick="saveProvider(${p.id || 0})">Save listing</button>`);
}
async function saveProvider(id) {
  const b = { name: $('#p-name').value, category: $('#p-cat').value, city: $('#p-city').value, phone: $('#p-phone').value, price: $('#p-price').value, description: $('#p-desc').value };
  try { await api(id ? 'providers/' + id : 'providers', id ? 'PUT' : 'POST', b); closeModal(); toast('Listing saved'); search(); loadDash(); }
  catch (e) { $('#p-err').textContent = e.message; }
}
async function editProvider(id) { providerForm((await api('providers')).find(p => p.id === id)); }
async function delProvider(id) { if (confirm('Delete this listing and its bookings?')) { await api('providers/' + id, 'DELETE'); toast('Listing deleted'); search(); loadDash(); } }

async function loadDash() {
  if (!user) return; const d = $('#dash'); d.hidden = false;
  const [bookings, notes, all] = await Promise.all([api('bookings'), api('notifications'), api('providers')]);
  const mine = user.role === 'admin' ? all : all.filter(p => p.ownerId === user.id);
  const acts = b => user.role === 'customer' ? (['pending', 'accepted'].includes(b.status) ? `<button class="sm bad" onclick="setStatus(${b.id},'cancelled')">Cancel</button>` : '')
    : b.status === 'pending' ? `<button class="sm ok" onclick="setStatus(${b.id},'accepted')">Accept</button> <button class="sm bad" onclick="setStatus(${b.id},'rejected')">Reject</button>`
    : b.status === 'accepted' ? `<button class="sm" onclick="setStatus(${b.id},'completed')">Mark completed</button>` : '';
  let h = `<h2>${user.role === 'admin' ? 'Admin dashboard' : user.role === 'provider' ? 'Provider dashboard' : 'My bookings'}</h2>`;
  if (user.role === 'admin') { const r = await api('reports');
    h += `<div class="stats"><div class="stat"><b>${r.users}</b><br>Users</div><div class="stat"><b>${r.providers}</b><br>Listings</div><div class="stat"><b>${r.bookings}</b><br>Bookings</div>` +
      Object.entries(r.byStatus).map(([k, v]) => `<div class="stat"><b>${v}</b><br>${k}</div>`).join('') + '</div>'; }
  if (user.role !== 'customer') h += `<h2>${user.role === 'admin' ? 'All listings' : 'My listings'}</h2>${user.role === 'provider' ? '<button onclick="providerForm()">Add listing</button>' : ''}
    <div class="tablewrap"><table><tr><th>Name</th><th>Category</th><th>City</th><th>Price</th><th></th></tr>${mine.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.city)}</td><td>₹${p.price}</td>
    <td class="row"><button class="sm" onclick="editProvider(${p.id})">Edit</button><button class="sm bad" onclick="delProvider(${p.id})">Delete</button></td></tr>`).join('') || '<tr><td>No listings yet. Add your first one.</td></tr>'}</table></div>`;
  h += `<h2>Booking requests</h2><div class="tablewrap"><table><tr><th>#</th><th>Provider</th><th>Customer</th><th>Date</th><th>Note</th><th>Status</th><th></th></tr>
    ${bookings.map(b => `<tr><td>${b.id}</td><td>${esc(b.providerName)}</td><td>${esc(b.customerName)}</td><td>${b.date}</td><td>${esc(b.note)}</td><td><span class="st ${b.status}">${b.status}</span></td><td>${acts(b)}</td></tr>`).join('') || '<tr><td>No bookings yet.</td></tr>'}</table></div>
    <h2>Notifications</h2><div class="tablewrap">${notes.map(n => `<div class="note ${n.read ? '' : 'new'}">${esc(n.text)}</div>`).join('') || '<div class="note">Nothing new.</div>'}</div>`;
  d.innerHTML = h; if (notes.some(n => !n.read)) api('notifications', 'POST');
}
nav(); search(); if (user) loadDash().catch(() => {});
