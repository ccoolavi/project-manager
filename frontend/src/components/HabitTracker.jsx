import React, { useState } from 'react';
import { 
  Flame, 
  Check, 
  Plus, 
  Trash2, 
  Award, 
  Target, 
  CalendarDays,
  Sparkles
} from 'lucide-react';

export default function HabitTracker({ habits, setHabits }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Personal');
  const [newTarget, setNewTarget] = useState(7);

  // Generate date labels for past 7 days ending today
  const getLast7Days = () => {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      dates.push({ iso, dayName, dayNum });
    }
    return dates;
  };

  const daysList = getLast7Days();
  const todayIso = daysList[daysList.length - 1].iso;

  const toggleHabitDay = (habitId, dateIso) => {
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;

      const dates = h.completedDates || [];
      const exists = dates.includes(dateIso);
      let newDates;
      let newStreak = h.streak || 0;

      if (exists) {
        newDates = dates.filter(d => d !== dateIso);
        if (dateIso === todayIso && newStreak > 0) newStreak -= 1;
      } else {
        newDates = [...dates, dateIso];
        if (dateIso === todayIso) newStreak += 1;
      }

      return { ...h, completedDates: newDates, streak: newStreak };
    });

    setHabits(updated);
  };

  const handleAddHabit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const habit = {
      id: 'h_' + Date.now(),
      title: newTitle.trim(),
      category: newCategory,
      targetDays: Number(newTarget),
      streak: 0,
      completedDates: []
    };

    setHabits([...habits, habit]);
    setNewTitle('');
    setIsModalOpen(false);
  };

  const handleDeleteHabit = (id) => {
    setHabits(habits.filter(h => h.id !== id));
  };

  // Calculate overall metrics
  const totalHabits = habits.length;
  const completedTodayCount = habits.filter(h => (h.completedDates || []).includes(todayIso)).length;
  const todayCompletionRate = totalHabits > 0 ? Math.round((completedTodayCount / totalHabits) * 100) : 0;
  const longestStreak = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Today's Progress</p>
            <h3 className="text-2xl font-bold text-white mt-1">{todayCompletionRate}%</h3>
            <p className="text-xs text-emerald-400 mt-1">{completedTodayCount} of {totalHabits} completed</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Target className="w-6 h-6 text-brand-400" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Max Active Streak</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-1 flex items-center gap-1.5">
              <Flame className="w-6 h-6 fill-amber-400/20 text-amber-400 animate-pulse" />
              <span>{longestStreak} Days</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Consistency builds mastery</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Award className="w-6 h-6 text-amber-400" />
          </div>
        </div>

        {/* Metric 3: Action Banner */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Build Lasting Routines</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">Track daily micro-habits on low-spec server.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-medium text-xs shadow-glow transition-all flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Habit</span>
          </button>
        </div>
      </div>

      {/* Habit List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand-400" />
            <span>Weekly Habit Consistency Matrix</span>
          </h3>
          <span className="text-xs text-slate-400">Past 7 Days</span>
        </div>

        {habits.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No habits tracked yet. Click "Add Habit" to begin!
          </div>
        ) : (
          <div className="space-y-3">
            {habits.map((habit) => {
              const dates = habit.completedDates || [];
              const weekCompletedCount = daysList.filter(d => dates.includes(d.iso)).length;

              return (
                <div
                  key={habit.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-colors group"
                >
                  {/* Habit Title & Meta */}
                  <div className="flex items-center space-x-3 min-w-[240px]">
                    <button
                      onClick={() => toggleHabitDay(habit.id, todayIso)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        dates.includes(todayIso)
                          ? 'bg-emerald-500 text-white shadow-glow-emerald'
                          : 'bg-slate-900 border border-slate-800 text-slate-600 hover:border-slate-600'
                      }`}
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <div>
                      <h4 className="font-semibold text-slate-100 text-sm">{habit.title}</h4>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                        <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300">
                          {habit.category}
                        </span>
                        <span className="flex items-center text-amber-400 font-medium text-[11px]">
                          <Flame className="w-3.5 h-3.5 mr-0.5 fill-amber-400/20" />
                          {habit.streak || 0} streak
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Past 7 Days Buttons */}
                  <div className="flex items-center space-x-2">
                    {daysList.map((day) => {
                      const isCompleted = dates.includes(day.iso);
                      const isToday = day.iso === todayIso;

                      return (
                        <div key={day.iso} className="flex flex-col items-center">
                          <span className={`text-[10px] mb-1 font-medium ${isToday ? 'text-brand-400' : 'text-slate-500'}`}>
                            {day.dayName}
                          </span>
                          <button
                            onClick={() => toggleHabitDay(habit.id, day.iso)}
                            className={`w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : isToday
                                ? 'bg-slate-900 border border-brand-500/40 text-slate-400 hover:text-white'
                                : 'bg-slate-900 border border-slate-800 text-slate-600 hover:text-slate-400'
                            }`}
                          >
                            {isCompleted ? <Check className="w-4 h-4 text-emerald-400" /> : day.dayNum}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions & Target */}
                  <div className="flex items-center justify-between md:justify-end space-x-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-medium">Goal: {weekCompletedCount}/{habit.targetDays} days</p>
                      <div className="w-24 h-1.5 bg-slate-900 rounded-full mt-1 overflow-hidden border border-slate-800">
                        <div 
                          className="h-full bg-brand-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (weekCompletedCount / habit.targetDays) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteHabit(habit.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Habit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Add New Habit</h3>
            <form onSubmit={handleAddHabit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Habit Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Morning 20m Meditate"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Days / Wk</label>
                  <select
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(num => (
                      <option key={num} value={num}>{num} days / week</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white"
                >
                  Save Habit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
