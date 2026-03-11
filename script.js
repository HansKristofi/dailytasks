/* ============================
   SUPABASE CONFIG
   ============================ */
const SUPABASE_URL = 'https://cwhrnyrrpwavfmldokxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3aHJueXJycHdhdmZtbGRva3hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjExNTksImV4cCI6MjA4ODgzNzE1OX0.Oeb86Sq2tQ4dy5gCK3Eu0e0xwuq_qOV0X-ZqXGZAfcc';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================
   TASK DEFINITIONS
   ============================ */
// Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const WEEKDAYS = [1, 2, 3, 4, 5];

const TASKS = [
  { id: 'morning_hygiene', name: 'Morning Hygiene',               days: [1,2,3,4,5] },
  { id: 'reading',         name: 'Reading (30 min)',               days: [1,2,3,4,5] },
  { id: 'stretching',      name: 'Stretching & Jogging (10 min)', days: [1,2,3,4,5] },
  { id: 'eating_healthy',  name: 'Eating Healthy',                 days: [1,2,3,4,5] },
  { id: 'workout',         name: 'Workout',                        days: [1,2,5],     tag: 'Mon · Tue · Fri' },
  { id: 'webdev',          name: 'Web Development (1 hour)',       days: [1,2,3,4,5] },
  { id: 'night_hygiene',   name: 'Night Hygiene',                  days: [1,2,3,4,5] },
];

/* ============================
   IN-MEMORY CACHE
   { "YYYY-MM-DD": { taskId: true/false, ... } }
   ============================ */
let cache = {};

/* ============================
   DATE HELPERS
   ============================ */
const today    = new Date();
const todayKey = dateKey(today);
const todayDow = today.getDay();

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayTasks(dow) {
  return TASKS.filter(t => t.days.includes(dow));
}

function getDayCompletion(key, dow) {
  if (!WEEKDAYS.includes(dow)) return null;
  const tasks = getDayTasks(dow);
  if (!tasks.length) return null;
  const dayData = cache[key] || {};
  const done = tasks.filter(t => dayData[t.id]).length;
  return { done, total: tasks.length };
}

/* ============================
   SUPABASE HELPERS
   ============================ */
async function loadMonth(year, month) {
  const from = `${year}-${String(month + 1).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { data, error } = await db
    .from('daily_tasks')
    .select('date, task_id, completed')
    .gte('date', from)
    .lte('date', to);

  if (error) { console.error('Load error:', error); return; }

  data.forEach(row => {
    if (!cache[row.date]) cache[row.date] = {};
    cache[row.date][row.task_id] = row.completed;
  });
}

async function upsertTask(dateStr, taskId, completed) {
  const { error } = await db
    .from('daily_tasks')
    .upsert({ date: dateStr, task_id: taskId, completed },
             { onConflict: 'date,task_id' });

  if (error) console.error('Save error:', error);
}

/* ============================
   TODAY SECTION
   ============================ */
function renderTodayDate() {
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  document.getElementById('today-date').textContent =
    `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
  document.getElementById('today-day').textContent = days[todayDow];
}

function updateProgressRing(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;
  const ring  = document.getElementById('progress-ring-fill');
  const label = document.getElementById('progress-percent-ring');
  ring.style.strokeDashoffset = offset;
  label.textContent = pct + '%';
  pct === 100 ? ring.classList.add('complete') : ring.classList.remove('complete');
}

function renderTodayTasks() {
  const taskList   = document.getElementById('task-list');
  const weekendMsg = document.getElementById('weekend-msg');
  taskList.innerHTML = '';

  if (!WEEKDAYS.includes(todayDow)) {
    weekendMsg.style.display = 'block';
    updateProgressRing(0, 0);
    return;
  }

  weekendMsg.style.display = 'none';
  const tasks   = getDayTasks(todayDow);
  const dayData = cache[todayKey] || {};

  tasks.forEach((task, i) => {
    const isComplete = !!dayData[task.id];
    const item = document.createElement('div');
    item.className = 'task-item' + (isComplete ? ' completed' : '');
    item.dataset.taskId = task.id;
    item.style.animationDelay = `${i * 0.05}s`;
    item.innerHTML = `
      <div class="task-checkbox">
        <svg viewBox="0 0 12 12">
          <polyline points="1.5,6 4.5,9.5 10.5,2.5"/>
        </svg>
      </div>
      <span class="task-name">${task.name}</span>
      ${task.tag ? `<span class="task-tag">${task.tag}</span>` : ''}
    `;
    item.addEventListener('click', () => toggleTask(task.id, item));
    taskList.appendChild(item);
  });

  const done = tasks.filter(t => dayData[t.id]).length;
  updateProgressRing(done, tasks.length);
}

async function toggleTask(taskId, el) {
  if (!cache[todayKey]) cache[todayKey] = {};
  const newVal = !cache[todayKey][taskId];
  cache[todayKey][taskId] = newVal;

  // Optimistic UI update
  el.classList.toggle('completed', newVal);
  el.classList.remove('completing');
  void el.offsetWidth;
  el.classList.add('completing');
  setTimeout(() => el.classList.remove('completing'), 300);

  const tasks = getDayTasks(todayDow);
  const done  = tasks.filter(t => cache[todayKey][t.id]).length;
  updateProgressRing(done, tasks.length);
  renderCalendar();

  // Persist to Supabase
  await upsertTask(todayKey, taskId, newVal);
}

/* ============================
   CALENDAR
   ============================ */
let calYear  = today.getFullYear();
let calMonth = today.getMonth();

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function renderCalendar() {
  document.getElementById('calendar-month-title').textContent =
    `${MONTH_NAMES[calMonth]} ${calYear}`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(calYear, calMonth, d);
    const dow      = cellDate.getDay();
    const key      = dateKey(cellDate);
    const isToday  = key === todayKey;
    const isFuture = cellDate > today && !isToday;

    const cell  = document.createElement('div');
    cell.className = 'cal-day';

    const numEl = document.createElement('span');
    numEl.className = 'cal-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!WEEKDAYS.includes(dow)) {
      cell.classList.add('weekend');
    } else if (isFuture) {
      cell.classList.add('future-weekday');
    } else {
      const comp = getDayCompletion(key, dow);
      if (!comp || (comp.done === 0 && !cache[key])) {
        cell.classList.add('no-data');
      } else if (comp.done === comp.total) {
        cell.classList.add('done');
        const ck = document.createElement('span');
        ck.className = 'check-mark';
        ck.textContent = '✓';
        cell.appendChild(ck);
      } else {
        const pct = Math.round((comp.done / comp.total) * 100);
        cell.classList.add('partial');
        const pctEl = document.createElement('span');
        pctEl.className = 'cal-day-pct';
        pctEl.textContent = pct + '%';
        cell.appendChild(pctEl);
      }
    }

    if (isToday) cell.classList.add('today-cell');
    grid.appendChild(cell);
  }
}

/* ============================
   NAV BUTTONS
   ============================ */
document.getElementById('prev-month').addEventListener('click', async () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  await loadMonth(calYear, calMonth);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', async () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  await loadMonth(calYear, calMonth);
  renderCalendar();
});

/* ============================
   INIT
   ============================ */
async function init() {
  renderTodayDate();

  document.getElementById('task-list').innerHTML =
    `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;letter-spacing:0.05em;">Loading…</div>`;

  await loadMonth(calYear, calMonth);

  renderTodayTasks();
  renderCalendar();
}

init();
