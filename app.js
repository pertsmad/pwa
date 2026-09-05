/* ===== ثبت ساعت کاری - app.js (نسخه کامل) ===== */
'use strict';

/* ---------- ثابت‌ها و State ---------- */
var STORAGE_KEY = 'work-hours-data-v2';
var OLD_STORAGE_KEY = 'workHoursData';
var FULL_DAY_MINUTES = 480; // یک روز کاری کامل = 8 ساعت
var JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];
var WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

var state = { tab: 'today', jYear: 0, jMonth: 0, jDay: 0, entryType: 'work',
  tasks: [],
  taskFilters: { status: 'all', priority: 'all', tag: 'all' },
  taskSort: { by: 'due', dir: 'asc' }
};
var data = { entries: [] };

/* ---------- تبدیل تاریخ جلالی/میلادی ---------- */
function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }

function gregorianToJalali(gy, gm, gd) {
  var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var jy, jm, jd, gy2, days;
  gy2 = (gm > 2) ? (gy + 1) : gy;
  days = 355666 + (365 * gy) + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) +
    ~~((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  jy = -1595 + (33 * ~~(days / 12053));
  days = mod(days, 12053);
  jy += 4 * ~~(days / 1461);
  days = mod(days, 1461);
  if (days > 365) { jy += ~~((days - 1) / 365); days = mod((days - 1), 365); }
  if (days < 186) { jm = 1 + ~~(days / 31); jd = 1 + mod(days, 31); }
  else { jm = 7 + ~~((days - 186) / 30); jd = 1 + mod((days - 186), 30); }
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  var gy, gm, gd, days;
  jy += 1595;
  days = -355668 + (365 * jy) + (~~(jy / 33) * 8) + ~~(mod(jy, 33) / 4) + jd +
    ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy = 400 * ~~(days / 146097);
  days = mod(days, 146097);
  if (days > 36524) {
    gy += 100 * ~~(--days / 36524);
    days = mod(days, 36524);
    if (days >= 365) days++;
  }
  gy += 4 * ~~(days / 1461);
  days = mod(days, 1461);
  if (days > 365) { gy += ~~((days - 1) / 365); days = mod((days - 1), 365); }
  gd = days + 1;
  var leap = (mod(gy, 4) === 0 && mod(gy, 100) !== 0) || (mod(gy, 400) === 0);
  var sal_a = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  gm = 0;
  while (gm < 13 && gd > sal_a[gm]) { gd -= sal_a[gm]; gm++; }
  return [gy, gm, gd];
}

function isJalaliLeap(jy) {
  var r = mod(jy, 33);
  return (r === 1 || r === 5 || r === 9 || r === 13 || r === 17 || r === 22 || r === 26 || r === 30);
}

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

function todayJalali() {
  var now = new Date();
  var j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { jy: j[0], jm: j[1], jd: j[2] };
}

function pad2(n) { n = String(n); return (n.length < 2) ? ('0' + n) : n; }
function formatJalaliKey(jy, jm, jd) { return jy + '-' + pad2(jm) + '-' + pad2(jd); }
function todayISO() { var t = todayJalali(); return formatJalaliKey(t.jy, t.jm, t.jd); }

/* ---------- Storage ---------- */
function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) { localStorage.setItem(STORAGE_KEY, raw); localStorage.removeItem(OLD_STORAGE_KEY); }
    }
    var parsed = raw ? JSON.parse(raw) : null;
    data = { entries: (parsed && Array.isArray(parsed.entries)) ? parsed.entries : [] };
  } catch (e) { data = { entries: [] }; }
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}

/* ---------- Helpers ---------- */
function $(id) { return document.getElementById(id); }

function entriesForDate(key) {
  return data.entries.filter(function (e) { return e.date === key; })
    .sort(function (a, b) { return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0); });
}

function timeToMinutes(t) {
  var p = String(t || '').split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  return Math.floor(mins / 60) + ':' + pad2(mins % 60);
}

function isWork(e) { return e.type !== 'leave'; }

/* ---------- CRUD ---------- */
function addEntry(jy, jm, jd, type, start, end) {
  data.entries.push({
    id: String(Date.now()) + String(Math.floor(Math.random() * 1000)),
    date: formatJalaliKey(jy, jm, jd), type: type, start: start, end: end
  });
  saveData();
}

function deleteEntry(id) {
  data.entries = data.entries.filter(function (e) { return e.id !== id; });
  saveData();
}

/* ---------- محاسبات ---------- */
function dayTotals(key) {
  var work = 0, leave = 0;
  entriesForDate(key).forEach(function (e) {
    var d = timeToMinutes(e.end) - timeToMinutes(e.start);
    if (d < 0) d = 0;
    if (isWork(e)) work += d; else leave += d;
  });
  return { work: work, leave: leave };
}

function monthTotals(jy, jm) {
  var work = 0, leave = 0, leaveDays = [];
  var len = jalaliMonthLength(jy, jm);
  for (var d = 1; d <= len; d++) {
    var t = dayTotals(formatJalaliKey(jy, jm, d));
    work += t.work; leave += t.leave;
    if (t.leave >= FULL_DAY_MINUTES / 2) leaveDays.push(d);
  }
  return { work: work, leave: leave, leaveDays: leaveDays };
}

/* ---------- رندرینگ ---------- */
function fillDateSelectors() {
  var t = todayJalali();
  state.jYear = t.jy; state.jMonth = t.jm; state.jDay = t.jd;
  var ySel = $('jYear'), mSel = $('jMonth');
  ySel.innerHTML = ''; mSel.innerHTML = '';
  for (var y = t.jy - 5; y <= t.jy + 5; y++) {
    var oy = document.createElement('option');
    oy.value = y; oy.textContent = y;
    if (y === t.jy) oy.selected = true;
    ySel.appendChild(oy);
  }
  for (var m = 1; m <= 12; m++) {
    var om = document.createElement('option');
    om.value = m; om.textContent = JALALI_MONTHS[m - 1];
    if (m === t.jm) om.selected = true;
    mSel.appendChild(om);
  }
  updateDayOptions();
}

function updateDayOptions() {
  var dSel = $('jDay');
  var len = jalaliMonthLength(state.jYear, state.jMonth);
  if (state.jDay > len) state.jDay = len;
  dSel.innerHTML = '';
  for (var d = 1; d <= len; d++) {
    var o = document.createElement('option');
    o.value = d; o.textContent = d;
    if (d === state.jDay) o.selected = true;
    dSel.appendChild(o);
  }
}

function readSelectedDate() {
  state.jYear = parseInt($('jYear').value, 10);
  state.jMonth = parseInt($('jMonth').value, 10);
  state.jDay = parseInt($('jDay').value, 10);
  return formatJalaliKey(state.jYear, state.jMonth, state.jDay);
}

function renderDayView() {
  var key = formatJalaliKey(state.jYear, state.jMonth, state.jDay);
  var items = entriesForDate(key);
  var list = $('rangeList');
  list.innerHTML = '';
  if (!items.length) {
    var li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'بازه‌ای ثبت نشده است.';
    list.appendChild(li);
  }
  items.forEach(function (e) {
    var li = document.createElement('li');
    li.className = 'range-item' + (isWork(e) ? '' : ' leave-item');
    li.innerHTML = '<span class="range-type ' + (isWork(e) ? 'type-work' : 'type-leave') + '">' +
      (isWork(e) ? 'کاری' : 'مرخصی') + '</span>' +
      '<span class="range-time">' + e.start + ' تا ' + e.end + '</span>' +
      '<button class="btn-del" data-id="' + e.id + '" aria-label="حذف">&times;</button>';
    list.appendChild(li);
  });
  var t = dayTotals(key);
  $('dayWorkTotal').textContent = fmtDuration(t.work);
  $('dayLeaveTotal').textContent = fmtDuration(t.leave);
  $('listDateLabel').textContent = '( ' + state.jDay + ' ' + JALALI_MONTHS[state.jMonth - 1] + ' ' + state.jYear + ' )';
}

function renderMonthView() {
  $('monthLabel').textContent = JALALI_MONTHS[state.jMonth - 1] + ' ' + state.jYear;
  var list = $('monthList');
  list.innerHTML = '';
  var grid = document.createElement('div');
  grid.className = 'cal-grid';
  var head = document.createElement('div');
  head.className = 'cal-head';
  WEEK_DAYS.forEach(function (w) {
    var c = document.createElement('div');
    c.className = 'cal-dow'; c.textContent = w;
    head.appendChild(c);
  });
  grid.appendChild(head);
  var g = jalaliToGregorian(state.jYear, state.jMonth, 1);
  var firstDow = new Date(g[0], g[1] - 1, g[2]).getDay(); // 0=یکشنبه
  var dow = (firstDow + 1) % 7; // شنبه = 0
  var len = jalaliMonthLength(state.jYear, state.jMonth);
  var i;
  for (i = 0; i < dow; i++) {
    var ec = document.createElement('div');
    ec.className = 'cal-cell empty-cell';
    grid.appendChild(ec);
  }
  var t = todayJalali();
  for (var d = 1; d <= len; d++) {
    (function (day) {
      var key = formatJalaliKey(state.jYear, state.jMonth, day);
      var tt = dayTotals(key);
      var cell = document.createElement('div');
      cell.className = 'cal-cell' + (tt.work > 0 ? ' has-work' : '') + (tt.leave > 0 ? ' has-leave' : '') +
        (state.jYear === t.jy && state.jMonth === t.jm && day === t.jd ? ' today' : '');
      cell.innerHTML = '<span class="cal-day-num">' + day + '</span>';
      cell.setAttribute('data-day', day);
      cell.setAttribute('title', 'کار: ' + fmtDuration(tt.work) + ' | مرخصی: ' + fmtDuration(tt.leave));
      cell.addEventListener('click', function () {
        state.jDay = day;
        updateDayOptions();
        activateTab('today');
        renderDayView();
      });
      grid.appendChild(cell);
    })(d);
  }
  list.appendChild(grid);
  var mt = monthTotals(state.jYear, state.jMonth);
  $('monthWorkTotal').textContent = fmtDuration(mt.work);
  $('monthLeaveTotal').textContent = fmtDuration(mt.leave);
  $('leaveDaysInfo').textContent = mt.leaveDays.length ?
    ('روزهای با بیش از نیم‌روز مرخصی: ' + mt.leaveDays.join('، ')) : '';
}

function activateTab(name) {
  state.tab = name;
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.tab').forEach(function (s) {
    s.classList.toggle('active', s.id === 'tab-' + name);
  });
}

/* ---------- Export اکسل/ورد ---------- */
function buildRowsHTML() {
  var rows = [];
  data.entries.slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); })
    .forEach(function (e) {
      var p = e.date.split('-');
      rows.push('<tr><td>' + p[0] + '/' + p[1] + '/' + p[2] + '</td><td>' +
        (isWork(e) ? 'کاری' : 'مرخصی') + '</td><td>' + e.start + '</td><td>' + e.end + '</td></tr>');
    });
  return rows.join('');
}

function downloadBlob(blob, filename) {
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function exportToExcel() {
  var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
    '<table border="1"><tr><th>تاریخ</th><th>نوع</th><th>از</th><th>تا</th></tr>' +
    buildRowsHTML() + '</table></body></html>';
  var blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
  downloadBlob(blob, 'work-hours-' + todayISO() + '.xls');
}

function exportToWord() {
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
    '<head><meta charset="UTF-8"></head><body dir="rtl"><h2>گزارش ساعت کاری</h2>' +
    '<table border="1"><tr><th>تاریخ</th><th>نوع</th><th>از</th><th>تا</th></tr>' +
    buildRowsHTML() + '</table></body></html>';
  var blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  downloadBlob(blob, 'work-hours-' + todayISO() + '.doc');
}


/* ---------- وظایف (Tasks) ---------- */
var TASKS_STORAGE_KEY = 'work-hours-tasks-v1';
var TASK_PRIORITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
var TASK_PRIORITY_LABELS = { low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی' };
var TASK_STATUS_LABELS = { pending: 'در حال انجام', done: 'تکمیل‌شده', deferred: 'به تعویق افتاده' };

function loadTasks() {
  try {
    var raw = localStorage.getItem(TASKS_STORAGE_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    state.tasks = (parsed && Array.isArray(parsed.tasks)) ? parsed.tasks : [];
  } catch (e) { state.tasks = []; }
}

function saveTasks() {
  try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify({ tasks: state.tasks })); } catch (e) {}
}

function addTask(jy, jm, jd, title, description, priority, tags) {
  var msg = $('taskMsg');
  if (!title || !String(title).trim()) {
    msg.textContent = 'عنوان وظیفه را وارد کنید.';
    msg.classList.remove('ok'); msg.classList.add('err');
    return false;
  }
  state.tasks.push({
    id: String(Date.now()) + String(Math.floor(Math.random() * 1000)),
    title: String(title).trim(),
    description: description || '',
    dueDate: formatJalaliKey(jy, jm, jd),
    priority: priority,
    tags: tags,
    status: 'pending',
    createdAt: Date.now()
  });
  saveTasks();
  msg.textContent = 'وظیفه اضافه شد.';
  msg.classList.remove('err'); msg.classList.add('ok');
  return true;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
  saveTasks();
  renderTasks();
}

function setTaskStatus(id, status) {
  state.tasks.forEach(function (t) { if (t.id === id) t.status = status; });
  saveTasks();
  renderTasks();
}

function jalaliKeyToDayNumber(key) {
  var p = String(key).split('-');
  var g = jalaliToGregorian(parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10));
  return g[0] * 10000 + g[1] * 100 + g[2];
}

function todayDayNumber() {
  var t = todayJalali();
  var g = jalaliToGregorian(t.jy, t.jm, t.jd);
  return g[0] * 10000 + g[1] * 100 + g[2];
}

function addDaysToDayNumber(num, days) {
  var gy = ~~(num / 10000), gm = ~~((num % 10000) / 100), gd = num % 100;
  var d = new Date(gy, gm - 1, gd);
  d.setDate(d.getDate() + days);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function isOverdue(task) {
  if (task.status === 'done') return false;
  return jalaliKeyToDayNumber(task.dueDate) < todayDayNumber();
}

function isDueSoon(task) {
  if (task.status === 'done') return false;
  if (isOverdue(task)) return false;
  var due = jalaliKeyToDayNumber(task.dueDate);
  var today = todayDayNumber();
  return due >= today && due <= addDaysToDayNumber(today, 3);
}

function getFilteredSortedTasks() {
  var f = state.taskFilters;
  var items = state.tasks.filter(function (t) {
    if (f.status !== 'all' && t.status !== f.status) return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (f.tag !== 'all' && (t.tags || []).indexOf(f.tag) === -1) return false;
    return true;
  });
  var dir = state.taskSort.dir === 'desc' ? -1 : 1;
  items.sort(function (a, b) {
    var r = 0;
    if (state.taskSort.by === 'due') {
      r = jalaliKeyToDayNumber(a.dueDate) - jalaliKeyToDayNumber(b.dueDate);
    } else if (state.taskSort.by === 'priority') {
      r = (TASK_PRIORITY_ORDER[a.priority] || 0) - (TASK_PRIORITY_ORDER[b.priority] || 0);
    } else {
      r = (a.createdAt || 0) - (b.createdAt || 0);
    }
    return r * dir;
  });
  return items;
}

function renderTaskFilterOptions() {
  var sel = $('filterTag');
  if (!sel) return;
  var tags = [];
  state.tasks.forEach(function (t) {
    (t.tags || []).forEach(function (tag) { if (tags.indexOf(tag) === -1) tags.push(tag); });
  });
  var cur = sel.value || 'all';
  sel.innerHTML = '';
  var all = document.createElement('option');
  all.value = 'all'; all.textContent = 'همه';
  sel.appendChild(all);
  tags.forEach(function (tag) {
    var o = document.createElement('option');
    o.value = tag; o.textContent = tag;
    sel.appendChild(o);
  });
  if (cur === 'all' || tags.indexOf(cur) !== -1) sel.value = cur;
  else sel.value = 'all';
}

function renderTasks() {
  var list = $('taskList');
  if (!list) return;
  list.innerHTML = '';
  var items = getFilteredSortedTasks();
  if (!items.length) {
    var div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'وظیفه‌ای ثبت نشده است.';
    list.appendChild(div);
    return;
  }
  items.forEach(function (t) {
    var el = document.createElement('div');
    var cls = 'task-item';
    if (isOverdue(t)) cls += ' overdue';
    else if (isDueSoon(t)) cls += ' due-soon';
    if (t.status === 'done') cls += ' status-done';
    el.className = cls;
    var p = t.dueDate.split('-');
    var html = '<div class="task-title">' + t.title +
      ' <span class="task-priority priority-' + t.priority + '">' + (TASK_PRIORITY_LABELS[t.priority] || t.priority) + '</span></div>';
    if (t.description) html += '<div class="task-desc">' + t.description + '</div>';
    html += '<div class="task-due">سررسید: ' + p[0] + '/' + p[1] + '/' + p[2] + '</div>';
    if (t.tags && t.tags.length) {
      html += '<div class="task-tags">';
      t.tags.forEach(function (tag) { html += '<span class="task-tag">' + tag + '</span>'; });
      html += '</div>';
    }
    html += '<div class="task-actions">' +
      '<select class="task-status-select" data-id="' + t.id + '">' +
      '<option value="pending"' + (t.status === 'pending' ? ' selected' : '') + '>در حال انجام</option>' +
      '<option value="done"' + (t.status === 'done' ? ' selected' : '') + '>تکمیل‌شده</option>' +
      '<option value="deferred"' + (t.status === 'deferred' ? ' selected' : '') + '>به تعویق افتاده</option>' +
      '</select>' +
      '<button type="button" class="btn-del task-del-btn" data-id="' + t.id + '" aria-label="حذف">&times;</button>' +
      '</div>';
    el.innerHTML = html;
    list.appendChild(el);
  });
}

function fillTaskDateSelectors() {
  var t = todayJalali();
  var ySel = $('taskYear'), mSel = $('taskMonth'), dSel = $('taskDay');
  ySel.innerHTML = ''; mSel.innerHTML = ''; dSel.innerHTML = '';
  for (var y = t.jy - 5; y <= t.jy + 5; y++) {
    var oy = document.createElement('option');
    oy.value = y; oy.textContent = y;
    if (y === t.jy) oy.selected = true;
    ySel.appendChild(oy);
  }
  for (var m = 1; m <= 12; m++) {
    var om = document.createElement('option');
    om.value = m; om.textContent = JALALI_MONTHS[m - 1];
    if (m === t.jm) om.selected = true;
    mSel.appendChild(om);
  }
  var len = jalaliMonthLength(t.jy, t.jm);
  for (var d = 1; d <= len; d++) {
    var od = document.createElement('option');
    od.value = d; od.textContent = d;
    if (d === t.jd) od.selected = true;
    dSel.appendChild(od);
  }
}

function updateTaskDayOptions() {
  var dSel = $('taskDay');
  var jy = parseInt($('taskYear').value, 10), jm = parseInt($('taskMonth').value, 10);
  var len = jalaliMonthLength(jy, jm);
  var cur = parseInt(dSel.value, 10) || 1;
  dSel.innerHTML = '';
  for (var d = 1; d <= len; d++) {
    var o = document.createElement('option');
    o.value = d; o.textContent = d;
    if (d === Math.min(cur, len)) o.selected = true;
    dSel.appendChild(o);
  }
}

function readSelectedTaskDate() {
  return formatJalaliKey(
    parseInt($('taskYear').value, 10),
    parseInt($('taskMonth').value, 10),
    parseInt($('taskDay').value, 10)
  );
}

/* ---------- رندر کلی ---------- */
function renderAll() {
  renderDayView();
  renderMonthView();
  renderTaskFilterOptions();
  renderTasks();
}

/* ---------- Event Listeners ---------- */
function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      activateTab(b.getAttribute('data-tab'));
      renderAll();
    });
  });
  $('prevMonth').addEventListener('click', function () {
    state.jMonth--; if (state.jMonth < 1) { state.jMonth = 12; state.jYear--; }
    renderMonthView();
  });
  $('nextMonth').addEventListener('click', function () {
    state.jMonth++; if (state.jMonth > 12) { state.jMonth = 1; state.jYear++; }
    renderMonthView();
  });
  $('jDay').addEventListener('change', function () { readSelectedDate(); renderDayView(); });
  $('jMonth').addEventListener('change', function () {
    readSelectedDate(); updateDayOptions(); readSelectedDate(); renderDayView();
  });
  $('jYear').addEventListener('change', function () {
    readSelectedDate(); updateDayOptions(); readSelectedDate(); renderDayView();
  });
  $('todayBtn').addEventListener('click', function () {
    var t = todayJalali();
    state.jYear = t.jy; state.jMonth = t.jm; state.jDay = t.jd;
    updateDayOptions();
    renderDayView();
  });
  $('entryForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    readSelectedDate();
    var start = $('startInput').value, end = $('endInput').value;
    var msg = $('formMsg');
    if (!start || !end) { msg.textContent = 'ساعت شروع و پایان را وارد کنید.'; return; }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      msg.textContent = 'ساعت پایان باید بعد از ساعت شروع باشد.'; return;
    }
    addEntry(state.jYear, state.jMonth, state.jDay, state.entryType, start, end);
    $('startInput').value = ''; $('endInput').value = '';
    msg.textContent = 'بازه اضافه شد.';
    renderAll();
  });
  document.querySelectorAll('#typeToggle .type-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#typeToggle .type-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      state.entryType = b.getAttribute('data-type');
    });
  });
  $('rangeList').addEventListener('click', function (ev) {
    var btn = ev.target.closest('.btn-del');
    if (!btn) return;
    deleteEntry(btn.getAttribute('data-id'));
  });
  $('taskForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('taskMsg');
    var title = $('taskTitle').value;
    var desc = $('taskDesc').value;
    var priority = $('taskPriority').value;
    var tags = $('taskTags').value.split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    var key = readSelectedTaskDate();
    var p = key.split('-');
    var ok = addTask(parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10),
      title, desc, priority, tags);
    if (ok) {
      $('taskTitle').value = ''; $('taskDesc').value = ''; $('taskTags').value = '';
      $('taskPriority').value = 'medium';
      renderTaskFilterOptions();
      renderTasks();
    }
  });
  $('taskMonth').addEventListener('change', updateTaskDayOptions);
  $('taskYear').addEventListener('change', updateTaskDayOptions);
  $('filterStatus').addEventListener('change', function () {
    state.taskFilters.status = this.value; renderTasks();
  });
  $('filterPriority').addEventListener('change', function () {
    state.taskFilters.priority = this.value; renderTasks();
  });
  $('filterTag').addEventListener('change', function () {
    state.taskFilters.tag = this.value; renderTasks();
  });
  $('sortBy').addEventListener('change', function () {
    state.taskSort.by = this.value; renderTasks();
  });
  $('sortDir').addEventListener('change', function () {
    state.taskSort.dir = this.value; renderTasks();
  });
  $('taskList').addEventListener('change', function (ev) {
    var sel = ev.target.closest('.task-status-select');
    if (sel) setTaskStatus(sel.getAttribute('data-id'), sel.value);
  });
  $('taskList').addEventListener('click', function (ev) {
    var btn = ev.target.closest('.btn-del');
    if (!btn) return;
    deleteTask(btn.getAttribute('data-id'));
  });
  $('exportExcel').addEventListener('click', exportToExcel);
  $('exportWord').addEventListener('click', exportToWord);
}

/* ---------- Init ---------- */
function init() {
  loadData();
  loadTasks();
  fillDateSelectors();
  fillTaskDateSelectors();
  bindEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
