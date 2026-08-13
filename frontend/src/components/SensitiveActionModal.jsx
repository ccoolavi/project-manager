import { ShieldCheck } from 'lucide-react'

/** Pass through the object returned by useSensitiveAction() as props. */
export default function SensitiveActionModal({ prompting, code, setCode, error, busy, confirm, cancel }) {
  if (!prompting) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-brand-400" />
          <h3 className="text-white font-semibold">Confirm this action</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          For your security, we emailed you a code. Enter it below to continue.
        </p>

        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          placeholder="000000"
          autoFocus
          aria-label="Verification code"
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-center text-lg tracking-widest placeholder-slate-600 focus:outline-none focus:border-brand-500"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={confirm}
            disabled={busy}
            className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {busy ? 'Checking...' : 'Confirm'}
          </button>
          <button
            onClick={cancel}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
