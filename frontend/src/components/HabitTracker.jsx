import { useState, useEffect } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import api from '../utils/api'

export default function HabitTracker() {
  const [habits, setHabits] = useState([])
  const [newHabit, setNewHabit] = useState('')
  const [loading, setLoading] = useState(false)

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
    }
    setLoading(false)
  }

  const createHabit = async () => {
    if (!newHabit.trim()) return
    try {
      const res = await api.post('/api/habits', {
        title: newHabit,
        target_days: 7
      })
      setHabits([...habits, res.data])
      setNewHabit('')
    } catch (err) {
      console.error('Failed to create habit:', err)
    }
  }

  const checkHabit = async (habitId) => {
    try {
      const res = await api.post(`/api/habits/${habitId}/check`)
      setHabits(habits.map(h => h.id === habitId ? res.data : h))
    } catch (err) {
      console.error('Failed to check habit:', err)
    }
  }

  const deleteHabit = async (habitId) => {
    try {
      await api.delete(`/api/habits/${habitId}`)
      setHabits(habits.filter(h => h.id !== habitId))
    } catch (err) {
      console.error('Failed to delete habit:', err)
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
          onKeyPress={(e) => e.key === 'Enter' && createHabit()}
          placeholder="Add new habit..."
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        />
        <button
          onClick={createHabit}
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
                  className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => deleteHabit(habit.id)}
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
