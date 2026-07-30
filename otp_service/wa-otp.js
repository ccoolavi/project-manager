import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';
import cors from 'cors';
import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 3002;
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || '';

const pb = new PocketBase(PB_URL);

let sock = null;

// In-memory store for generated OTPs: phone -> { otp, expiresAt, userId }
const otpStore = new Map();

/**
 * Authenticate PocketBase SDK using Admin credentials if provided.
 */
async function getAuthenticatedPB() {
  if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
    try {
      if (!pb.authStore.isValid) {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
      }
    } catch (err) {
      console.error('[PocketBase Auth Error]:', err.message);
    }
  }
  return pb;
}

/**
 * Initialize Baileys WhatsApp Connection
 */
async function connectToWhatsApp() {
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n========================================');
      console.log('Scan the QR code below to pair WhatsApp:');
      console.log('========================================\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WhatsApp Connection Closed] Status code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('✅ [WhatsApp Connected] Baileys socket is active and ready.');
    }
  });
}

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Format phone number to WhatsApp JID format
 * e.g., "+1 (234) 567-8900" -> "12345678900@s.whatsapp.net"
 */
function formatPhoneToJID(phone) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Helper handler to send OTP
 */
async function handleSendOTP(req, res) {
  try {
    const { phone, userId } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // Expires in 5 minutes

    otpStore.set(cleanPhone, { otp, expiresAt, userId });

    const jid = formatPhoneToJID(phone);

    if (sock && sock.user) {
      await sock.sendMessage(jid, {
        text: `🔒 *Verification Code*: ${otp}\n\nYour code is valid for 5 minutes. Do not share it with anyone.`
      });
      console.log(`[WhatsApp OTP] Code ${otp} dispatched to ${cleanPhone}`);
    } else {
      console.warn(`[WhatsApp OTP Warning] Baileys socket not connected. Generated OTP: ${otp} for ${cleanPhone}`);
    }

    res.json({
      success: true,
      message: 'OTP generated and sent via WhatsApp',
      expiresInSeconds: 300
    });
  } catch (error) {
    console.error('[Error handleSendOTP]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Helper handler to verify OTP and update PocketBase user
 */
async function handleVerifyOTP(req, res) {
  try {
    const { phone, otp, userId } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone number and OTP code are required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const storedRecord = otpStore.get(cleanPhone);

    if (!storedRecord) {
      return res.status(400).json({ success: false, error: 'No active OTP request found for this phone number' });
    }

    if (Date.now() > storedRecord.expiresAt) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ success: false, error: 'OTP code has expired' });
    }

    if (storedRecord.otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP code' });
    }

    // OTP verification successful -> consume OTP
    otpStore.delete(cleanPhone);

    // Update PocketBase user record
    const client = await getAuthenticatedPB();
    let targetUserId = userId || storedRecord.userId;

    if (!targetUserId) {
      try {
        const userRecord = await client.collection('users').getFirstListItem(`phone="${cleanPhone}"`);
        targetUserId = userRecord.id;
      } catch (e) {
        console.warn(`[PocketBase Lookup Warning] User with phone ${cleanPhone} not found directly.`);
      }
    }

    let updatedRecord = null;
    if (targetUserId) {
      updatedRecord = await client.collection('users').update(targetUserId, {
        verified: true,
        phoneVerified: true
      });
      console.log(`[PocketBase Success] User ${targetUserId} marked as verified.`);
    }

    res.json({
      success: true,
      message: 'OTP verified successfully and user marked as verified',
      verified: true,
      userId: targetUserId || null
    });
  } catch (error) {
    console.error('[Error handleVerifyOTP]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Register routes
app.post('/api/whatsapp/send-otp', handleSendOTP);
app.post('/api/send-otp', handleSendOTP);
app.post('/send-otp', handleSendOTP);
app.post('/api/whatsapp/verify-otp', handleVerifyOTP);
app.post('/api/verify-otp', handleVerifyOTP);
app.post('/verify-otp', handleVerifyOTP);

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsappConnected: Boolean(sock && sock.user),
    pocketbase: PB_URL
  });
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp OTP Service running on port ${PORT}`);
  connectToWhatsApp().catch((err) => console.error('Failed to initialize Baileys:', err));
});
