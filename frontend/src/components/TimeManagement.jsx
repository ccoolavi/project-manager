import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  BarChart2, 
  Calendar, 
  CheckCircle,
  Zap,
  Tag
} from 'lucide-react';

export default function TimeManagement({ timeEntries, setTimeEntries }) {
  // Timer State (in seconds)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [timerMode, setTimerMode] = useState('work'); // 'work' (25m) or 'break' (5m)

  // Quick Log State
  const [project, setProject] = useState('KaizenPM');
  const [task, setTask] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [category, setCategory] = useState('Development');

  useEffect(() => {
    let interval = null;
    if (isActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft(s => s - 1);
      }, 1000);
    } else if (secondsLeft === 0 && isActive) {
      setIsActive(false);
      // Auto Log completed session
      if (timerMode === 'work') {
        const newEntry = {
          id: 't_' + Date.now(),
          project: project || 'General',
          task: task || 'Pomodoro Focused Session',
          durationMinutes: 25,
          category: category || 'Focus',
          date: new Date().toISOString()
        };
        setTimeEntries([newEntry, ...timeEntries]);
      }
    }
    return () => clearInterval(interval);
  }, [isActive, secondsLeft, timerMode, project, task, category, timeEntries, setTimeEntries]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = (mode = timerMode) => {
    setIsActive(false);
    setTimerMode(mode);
    setSecondsLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleManualLog = (e) => {
    e.preventDefault();
    if (!task.trim()) return;

    const entry = {
      id: 't_' + Date.now(),
      project: project.trim(),
      task: task.trim(),
      durationMinutes: Number(durationMinutes),
      category: category.trim(),
      date: new Date().toISOString()
    };

    setTimeEntries([entry, ...timeEntries]);
    setTask('');
  };

  // Metrics Calculations
  const totalMinutes = timeEntries.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Group by category for breakdown bar
  const categoryStats = timeEntries.reduce((acc, curr) => {
    const cat = curr.category || 'Other';
    acc[cat] = (acc[cat] || 0) + curr.durationMinutes;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Banner & Active Pomodoro Timer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Pomodoro Timer Card (2 Cols) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-bold text-white">Pomodoro Focus Timer</h2>
            </div>
            <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => resetTimer('work')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  timerMode === 'work' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                25m Focus
              </button>
              <button
                onClick={() => resetTimer('break')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  timerMode === 'break' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                5m Break
              </button>
            </div>
          </div>

          {/* Large Countdown Display */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-6xl sm:text-7xl font-extrabold text-white tracking-widest font-mono drop-shadow-glow">
              {formatTime(secondsLeft)}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {isActive ? 'Session in progress... Stay focused!' : 'Timer paused'}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={toggleTimer}
              className={`px-8 py-3 rounded-2xl font-bold text-sm flex items-center space-x-2 shadow-lg transition-all ${
                isActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-glow-amber'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-glow'
              }`}
            >
              {isActive ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Focus Session</span>
                </>
              )}
            </button>
            <button
              onClick={() => resetTimer()}
              className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-2xl transition-colors"
              title="Reset timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Quick Time Logger & Metrics */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Log Completed Time</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Manual entry for tasks done outside Pomodoro.</p>
          </div>

          <form onSubmit={handleManualLog} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Task Title</label>
              <input
                type="text"
                required
                placeholder="Refactored database queries"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Duration (mins)</label>
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium text-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Time Entry</span>
            </button>
          </form>

          {/* Quick Stat */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total Logged Time:</span>
            <span className="font-bold text-brand-400">{totalHours} hrs ({totalMinutes} mins)</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown & History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Category Allocation */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <span>Time Distribution</span>
          </h3>

          <div className="space-y-3">
            {Object.keys(categoryStats).length === 0 ? (
              <p className="text-xs text-slate-500">No time logged yet.</p>
            ) : (
              Object.entries(categoryStats).map(([cat, mins]) => {
                const pct = Math.round((mins / (totalMinutes || 1)) * 100);
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">{cat}</span>
                      <span className="text-slate-400">{mins} mins ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: History Log (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-brand-400" />
            <span>Recent Time Logs</span>
          </h3>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {timeEntries.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No time logs recorded.</p>
            ) : (
              timeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-brand-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">{entry.task}</p>
                      <p className="text-[10px] text-slate-400">{entry.project || 'General'} &bull; {new Date(entry.date).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">
                      {entry.category}
                    </span>
                    <span className="font-bold text-white bg-brand-600/20 text-brand-300 px-2.5 py-1 rounded-lg border border-brand-500/30">
                      {entry.durationMinutes}m
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
