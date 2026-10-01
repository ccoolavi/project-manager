import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import api from '../utils/api'
import { useToast } from './Toast'

// The server records check-ins by UTC date, so the "done today" state is judged by the same clock.
const doneToday = (habit) => (habit.completed_dates || []).includes(new Date().toISOString().slice(0, 10))

export default function HabitTracker() {
  const toast = useToast()
  const [habits, setHabits] = useState([])
  const [newHabit, setNewHabit] = useState('')
  const [loading, setLoading] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    fetchHabits()
  }, [])

  const fetchHabits = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/habits')
      setHabits(res.data)
    } catch (err) {
      console.error('Failed to fetch habits:', err)
      toast.fromError(err, 'Could not load your habits.')
    }
    setLoading(false)
  }

  const createHabit = async () => {
    if (savingRef.current) return
    if (!newHabit.trim()) {
      toast.error('Type the name of the habit first.')
      return
    }
    savingRef.current = true
    try {
      const res = await api.post('/api/habits', {
        title: newHabit.trim(),
        target_days: 7
      })
      setHabits((cur) => [...cur, res.data])
      setNewHabit('')
    } catch (err) {
      console.error('Failed to create habit:', err)
      if (err.queued) setNewHabit('') // saved on this device: do not let it be typed twice
      toast.fromError(err, 'Could not add the habit.')
    }
    savingRef.current = false
  }

  const checkHabit = async (habitId) => {
    try {
      const res = await api.post(`/api/habits/${habitId}/check`)
      setHabits((cur) => cur.map(h => h.id === habitId ? res.data : h))
    } catch (err) {
      console.error('Failed to check habit:', err)
      toast.fromError(err, 'Could not update the habit.')
    }
  }

  const deleteHabit = async (habitId) => {
    try {
      await api.delete(`/api/habits/${habitId}`)
      setHabits((cur) => cur.filter(h => h.id !== habitId))
    } catch (err) {
      console.error('Failed to delete habit:', err)
      if (err.queued) setHabits((cur) => cur.filter(h => h.id !== habitId))
      toast.fromError(err, 'Could not delete the habit.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Private to you &mdash; not tied to any organisation, and no one else can see or share these.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createHabit()}
          placeholder="Add new habit..."
          aria-label="New habit name"
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        />
        <button
          onClick={createHabit}
          aria-label="Add habit"
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="grid gap-3">
        {habits.map(habit => (
          <div key={habit.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <p className="font-medium text-white">{habit.title}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-sm text-slate-400">
                    Streak: <span className="text-emerald-400 font-semibold">{habit.streak} days</span>
                  </span>
                  <span className="text-sm text-slate-400">
                    Target: <span className="text-blue-400">{habit.target_days} days/week</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => checkHabit(habit.id)}
                  aria-label={doneToday(habit) ? `${habit.title}: done today` : `Mark ${habit.title} done today`}
                  aria-pressed={doneToday(habit)}
                  className={`p-2 rounded-lg ${
                    doneToday(habit)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
                  }`}
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => deleteHabit(habit.id)}
                  aria-label={`Delete ${habit.title}`}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {habits.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <p>No habits yet. Create one to get started! 🎯</p>
        </div>
      )}
    </div>
  )
}
