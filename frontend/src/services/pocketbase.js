import PocketBase from 'pocketbase';

// PocketBase instance — configured to point to your Oracle Cloud server IP
// When hosted on GitHub Pages, VITE_PB_URL is embedded at build time.
const VITE_PB_URL = import.meta.env.VITE_PB_URL;
const PB_URL = VITE_PB_URL || 'http://92.4.85.159:8090';
export const pb = new PocketBase(PB_URL);

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
  const response = await fetch(`${PB_URL}/api/whatsapp/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: phoneNumber,
      userId: pb.authStore.model?.id || '',
    }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to send OTP (${response.status})`);
  }
  return await response.json();
}

export async function verifyWhatsAppOTP(phoneNumber, code) {
  const response = await fetch(`${PB_URL}/api/whatsapp/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phoneNumber, otp: code }),
  });
  if (!response.ok) {
    throw new Error(`Failed to verify OTP (${response.status})`);
  }
  const res = await response.json();
  return res.verified;
}
