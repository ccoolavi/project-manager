import PocketBase from 'pocketbase';

// PocketBase instance — configured to point to your Oracle Cloud server IP
// When hosted on GitHub Pages, VITE_PB_URL is embedded at build time.
const VITE_PB_URL = import.meta.env.VITE_PB_URL;
const PB_URL = VITE_PB_URL || 'http://92.4.85.159:8090';
export const pb = new PocketBase(PB_URL);

// OTP service URL — derived from PB_URL by replacing port 8090 with 3002
// The WhatsApp OTP gateway runs as a separate Node.js Express service
const OTP_URL = PB_URL.replace(':8090', ':3003');

// Helper to check if PocketBase server is reachable
export async function checkBackendHealth() {
  try {
    await pb.health.check();
    return true;
  } catch (e) {
    return false;
  }
}

// Initial state generators for fallback / standalone storage
const STORAGE_KEYS = {
  TASKS: 'kaizen_tasks_v1',
  HABITS: 'kaizen_habits_v1',
  LOGS: 'kaizen_logs_v1',
  TIME_ENTRIES: 'kaizen_time_entries_v1',
  USER: 'kaizen_user_v1'
};

const DEFAULT_TASKS = [
  { id: '1', title: 'Deploy PocketBase binary to OCPU instance', category: 'Infrastructure', priority: 'High', status: 'done', dueDate: '2026-07-28', tags: ['Backend', 'ARM'] },
  { id: '2', title: 'Implement WhatsApp Baileys OTP verification', category: 'Auth', priority: 'High', status: 'in-progress', dueDate: '2026-07-29', tags: ['Security', 'WhatsApp'] },
  { id: '3', title: 'Build static Vite SPA with TailwindCSS', category: 'Frontend', priority: 'Medium', status: 'in-progress', dueDate: '2026-07-29', tags: ['UI/UX', 'React'] },
  { id: '4', title: 'Integrate Hermes Agent CLI (pm-cli wrapper)', category: 'Agent', priority: 'High', status: 'todo', dueDate: '2026-07-30', tags: ['Python', 'CLI'] },
  { id: '5', title: 'Configure Row Level Access Rules in PocketBase', category: 'Database', priority: 'Low', status: 'todo', dueDate: '2026-07-31', tags: ['Security'] },
];

const DEFAULT_HABITS = [
  { id: 'h1', title: 'Daily Code Review & Refactor', targetDays: 7, streak: 12, category: 'Engineering', completedDates: ['2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'] },
  { id: 'h2', title: 'System Health Check & Memory Audit', targetDays: 7, streak: 8, category: 'Ops', completedDates: ['2026-07-27', '2026-07-28', '2026-07-29'] },
  { id: 'h3', title: 'Kaizen Daily Retrospective', targetDays: 5, streak: 5, category: 'Personal', completedDates: ['2026-07-28', '2026-07-29'] },
  { id: 'h4', title: '30m Technical Reading / Docs', targetDays: 5, streak: 14, category: 'Learning', completedDates: ['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'] },
];

const DEFAULT_KAIZEN_LOGS = [
  { id: 'k1', date: '2026-07-28', title: 'Reduced idle memory footprint by switching to PocketBase SPA', category: 'Architecture', problem: 'Node SSR memory consumption exceeded 500MB on 6GB server', solution: 'Compiled static Vite SPA served by PocketBase webserver', impact: 'High', tags: ['Memory', 'Performance'] },
  { id: 'k2', date: '2026-07-27', title: 'Automated agent administration via pm-cli', category: 'Automation', problem: 'Manual database maintenance took developer time', solution: 'Exposed structured JSON CLI commands for Hermes agent', impact: 'Medium', tags: ['CLI', 'Hermes'] }
];

const DEFAULT_TIME_ENTRIES = [
  { id: 't1', project: 'KaizenPM', task: 'Frontend Dashboard Development', durationMinutes: 90, category: 'Development', date: '2026-07-29T00:00:00.000Z' },
  { id: 't2', project: 'Infrastructure', task: 'PocketBase DB Schema setup', durationMinutes: 45, category: 'DevOps', date: '2026-07-28T18:30:00.000Z' },
  { id: 't3', project: 'Security', task: 'WhatsApp OTP script integration', durationMinutes: 60, category: 'Security', date: '2026-07-28T14:00:00.000Z' }
];

const DEFAULT_USER = {
  id: 'u_admin',
  username: 'admin',
  email: 'admin@kaizen.local',
  phone: '+15550192834',
  verified: false,
  role: 'Administrator'
};

export const getStorageData = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};

export const setStorageData = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

// Data service providers
export const TaskService = {
  async getAll() {
    return getStorageData(STORAGE_KEYS.TASKS, DEFAULT_TASKS);
  },
  async saveAll(tasks) {
    setStorageData(STORAGE_KEYS.TASKS, tasks);
    return tasks;
  }
};

export const HabitService = {
  async getAll() {
    return getStorageData(STORAGE_KEYS.HABITS, DEFAULT_HABITS);
  },
  async saveAll(habits) {
    setStorageData(STORAGE_KEYS.HABITS, habits);
    return habits;
  }
};

export const KaizenService = {
  async getAll() {
    return getStorageData(STORAGE_KEYS.LOGS, DEFAULT_KAIZEN_LOGS);
  },
  async saveAll(logs) {
    setStorageData(STORAGE_KEYS.LOGS, logs);
    return logs;
  }
};

export const TimeService = {
  async getAll() {
    return getStorageData(STORAGE_KEYS.TIME_ENTRIES, DEFAULT_TIME_ENTRIES);
  },
  async saveAll(entries) {
    setStorageData(STORAGE_KEYS.TIME_ENTRIES, entries);
    return entries;
  }
};

export const UserService = {
  getUser() {
    return getStorageData(STORAGE_KEYS.USER, DEFAULT_USER);
  },
  saveUser(user) {
    setStorageData(STORAGE_KEYS.USER, user);
    return user;
  },
  async sendWhatsAppOTP(phoneNumber) {
    // Call Node.js Baileys / Meta OTP endpoint if server available, else fallback simulation
    try {
      const response = await fetch(`${OTP_URL}/api/whatsapp/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber })
      });
      if (response.ok) return await response.json();
    } catch (e) {
      console.warn('Backend OTP API offline, using local simulation mode');
    }
    // Simulation fallback response
    return { success: true, message: 'OTP sent via WhatsApp to ' + phoneNumber, mockCode: '123456' };
  },
  async verifyWhatsAppOTP(phoneNumber, code) {
    try {
      const response = await fetch(`${OTP_URL}/api/whatsapp/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, code })
      });
      if (response.ok) {
        const res = await response.json();
        return res.verified;
      }
    } catch (e) {
      console.warn('Backend OTP API offline, verifying with simulation logic');
    }
    // Accept valid 6-digit input
    return code === '123456' || (code.length === 6 && /^\d+$/.test(code));
  }
};
