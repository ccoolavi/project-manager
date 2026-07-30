import React, { useState } from 'react';
import { 
  ShieldCheck, 
  MessageSquare, 
  Phone, 
  KeyRound, 
  X, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { sendWhatsAppOTP, verifyWhatsAppOTP } from '../services/pocketbase';

export default function OtpVerification({ isOpen, onClose, user, setUser }) {
  const [step, setStep] = useState(user.verified ? 'verified' : 'phone'); // 'phone', 'otp', 'verified'
  const [phone, setPhone] = useState(user.phone || '');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter a valid WhatsApp phone number.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await sendWhatsAppOTP(phone);
      setLoading(false);
      setMessage(res.message || '6-digit OTP sent to your WhatsApp!');
      setStep('otp');
    } catch (err) {
      setLoading(false);
      setError('Failed to send WhatsApp OTP. Please ensure server script is running.');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setError('Please enter the full 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const isVerified = await verifyWhatsAppOTP(phone, otpCode);
      setLoading(false);

      if (isVerified) {
        const updatedUser = {
          ...user,
          phone: phone,
          verified: true
        };
        setUser(updatedUser);
        setStep('verified');
      } else {
        setError('Invalid OTP code. Try entering 123456 in simulation mode.');
      }
    } catch (err) {
      setLoading(false);
      setError('Verification error. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-glow space-y-6 relative overflow-hidden">
        {/* Glow Decor */}
        <div className="absolute -right-12 -top-12 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">WhatsApp OTP Verification</h3>
              <p className="text-xs text-slate-400">PocketBase row-level security requirement</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-xl flex items-center space-x-2 text-xs text-brand-300">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* STEP 1: Phone Input */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                WhatsApp Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="+1 (555) 019-2834"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                A 6-digit passcode will be dispatched via Baileys WhatsApp Gateway.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm shadow-glow-emerald transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending WhatsApp OTP...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Send OTP via WhatsApp</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: Enter 6-digit Code */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Enter 6-Digit Passcode
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-lg font-mono tracking-widest text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1.5">
                <span>Sent to: <strong className="text-slate-300 font-mono">{phone}</strong></span>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-brand-400 hover:underline"
                >
                  Change number
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-sm shadow-glow transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Verify & Authorize Account</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 3: Verified Success */}
        {step === 'verified' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-glow-emerald">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">Account Verified!</h4>
              <p className="text-xs text-slate-400 mt-1">
                WhatsApp number <strong className="text-slate-200 font-mono">{user.phone || phone}</strong> is active & authenticated.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
