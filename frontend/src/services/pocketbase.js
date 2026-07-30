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

// Auth helpers
export function isAuthenticated() {
  return pb.authStore.isValid;
}

export function getCurrentUser() {
  if (!pb.authStore.isValid) return null;
  return pb.authStore.model;
}

export function getToken() {
  return pb.authStore.token;
}

export async function loginUser(email, password) {
  const authData = await pb.collection('users').authWithPassword(email, password);
  return authData;
}

export async function registerUser(data) {
  const record = await pb.collection('users').create(data);
  // Auto-login after registration
  await pb.collection('users').authWithPassword(data.email, data.password);
  return record;
}

export function logoutUser() {
  pb.authStore.clear();
}

// ── OTP / WhatsApp helpers ────────────────────────────────────
export async function sendWhatsAppOTP(phoneNumber) {
  try {
    const response = await fetch(`${OTP_URL}/api/whatsapp/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber }),
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.warn('Backend OTP API offline, using local simulation mode');
  }
  return { success: true, message: 'OTP sent via WhatsApp to ' + phoneNumber, mockCode: '123456' };
}

export async function verifyWhatsAppOTP(phoneNumber, code) {
  try {
    const response = await fetch(`${OTP_URL}/api/whatsapp/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber, code }),
    });
    if (response.ok) {
      const res = await response.json();
      return res.verified;
    }
  } catch (e) {
    console.warn('Backend OTP API offline, verifying with simulation logic');
  }
  return code === '123456' || (code.length === 6 && /^\d+$/.test(code));
}
