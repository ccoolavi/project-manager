import { useState, useEffect } from 'react'
import { Heart, Award, Globe, Wallet, Save } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

/**
 * Ikigai: four questions whose overlap points at a sense of purpose. The labels
 * are written as plain questions rather than framework jargon, because most
 * people meeting this for the first time have never heard the term.
 */
const FIELDS = [
  {
    key: 'love',
    label: 'What you love',
    hint: 'The things you would happily spend a whole day on.',
    icon: Heart,
    accent: 'text-rose-400 border-rose-500/30'
  },
  {
    key: 'good_at',
    label: 'What you are good at',
    hint: 'Skills that come more easily to you than to most people.',
    icon: Award,
    accent: 'text-amber-400 border-amber-500/30'
  },
  {
    key: 'world_needs',
    label: 'What the world needs',
    hint: 'Problems you think are genuinely worth solving.',
    icon: Globe,
    accent: 'text-emerald-400 border-emerald-500/30'
  },
  {
    key: 'paid_for',
    label: 'What you can be paid for',
    hint: 'Work people already pay for, or would.',
    icon: Wallet,
    accent: 'text-brand-400 border-brand-500/30'
  }
]

export default function Ikigai() {
  const { currentOrg } = useOrg()
  const [values, setValues] = useState({
    love: '', good_at: '', world_needs: '', paid_for: '', purpose: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/ikigai`)
      setValues({
        love: res.data.love || '',
        good_at: res.data.good_at || '',
        world_needs: res.data.world_needs || '',
        paid_for: res.data.paid_for || '',
        purpose: res.data.purpose || ''
      })
    } catch {
      setError('Could not load your ikigai.')
    }
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put(`/api/orgs/${currentOrg.id}/ikigai`, values)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Could not save. Your answers are kept on this device and will be sent when you are back online.')
    }
    setSaving(false)
  }

  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value })
  const filled = FIELDS.filter((f) => values[f.key]?.trim()).length

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-1">Your ikigai</h2>
        <p className="text-sm text-slate-400">
          Four questions. Where the answers overlap is usually where your best work
          lives. There are no wrong answers, and you can change them whenever you like.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(filled / FIELDS.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-400">{filled} of {FIELDS.length} answered</span>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map((field) => {
          const Icon = field.icon
          return (
            <div
              key={field.key}
              className={`bg-slate-800 border rounded-lg p-5 ${field.accent}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={18} className={field.accent.split(' ')[0]} />
                <h3 className="font-semibold text-white">{field.label}</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">{field.hint}</p>
              <textarea
                value={values[field.key]}
                onChange={set(field.key)}
                rows={4}
                aria-label={field.label}
                placeholder="Write freely..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          )
        })}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h3 className="font-semibold text-white mb-1">In one sentence, what is your purpose?</h3>
        <p className="text-xs text-slate-500 mb-3">
          Read your four answers back, then try to sum them up. Come back and refine it.
        </p>
        <textarea
          value={values.purpose}
          onChange={set('purpose')}
          rows={2}
          aria-label="Purpose statement"
          placeholder="I want to..."
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg flex items-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}
