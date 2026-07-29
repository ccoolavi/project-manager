import React, { useState } from 'react';
import { 
  TrendingUp, 
  Plus, 
  Lightbulb, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Tag, 
  Calendar,
  Filter
} from 'lucide-react';

export default function KaizenLog({ logs, setLogs }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterImpact, setFilterImpact] = useState('All');

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Architecture');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [impact, setImpact] = useState('High');
  const [tags, setTags] = useState('');

  const handleAddLog = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const log = {
      id: 'k_' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      title: title.trim(),
      category: category.trim(),
      problem: problem.trim(),
      solution: solution.trim(),
      impact: impact,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [category]
    };

    setLogs([log, ...logs]);
    setTitle('');
    setProblem('');
    setSolution('');
    setTags('');
    setIsModalOpen(false);
  };

  const handleDeleteLog = (id) => {
    setLogs(logs.filter(l => l.id !== id));
  };

  const filteredLogs = logs.filter(log => {
    if (filterImpact === 'All') return true;
    return log.impact === filterImpact;
  });

  const getImpactBadge = (imp) => {
    switch (imp) {
      case 'High':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Low':
        return 'bg-slate-700/60 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>Kaizen Log (Continuous Improvement)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Log daily bottlenecks, root-cause fixes, and operational refinements for long-term compound growth.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Impact Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterImpact}
              onChange={(e) => setFilterImpact(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900">All Impact</option>
              <option value="High" className="bg-slate-900">High Impact</option>
              <option value="Medium" className="bg-slate-900">Medium Impact</option>
              <option value="Low" className="bg-slate-900">Low Impact</option>
            </select>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium shadow-glow-emerald transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Log Kaizen Entry</span>
          </button>
        </div>
      </div>

      {/* Kaizen Timeline Feed */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
            No Kaizen logs found for this filter. Start documenting small daily improvements!
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 backdrop-blur-sm transition-all space-y-4 group"
            >
              {/* Card Top Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${getImpactBadge(log.impact)}`}>
                    {log.impact} Impact
                  </span>
                  <h3 className="font-bold text-slate-100 text-base">{log.title}</h3>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-400">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{log.date}</span>
                  </div>
                  <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                    {log.category}
                  </span>
                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Problem vs Solution Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Identified Problem / Bottleneck */}
                <div className="bg-slate-950/60 border border-rose-500/20 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Identified Bottleneck / Friction</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {log.problem || 'No problem details specified.'}
                  </p>
                </div>

                {/* Applied Solution / Kaizen Fix */}
                <div className="bg-slate-950/60 border border-emerald-500/20 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Implemented Continuous Fix</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {log.solution || 'No solution details specified.'}
                  </p>
                </div>
              </div>

              {/* Tags Row */}
              {log.tags && log.tags.length > 0 && (
                <div className="flex items-center space-x-2 pt-1">
                  <Tag className="w-3 h-3 text-slate-500" />
                  <div className="flex flex-wrap gap-1">
                    {log.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Log Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Record Kaizen Retrospective</span>
            </h3>

            <form onSubmit={handleAddLog} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Title / Improvement Summary</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Optimized PocketBase SQLite WAL mode"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Impact Rating</label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="High">High Impact</option>
                    <option value="Medium">Medium Impact</option>
                    <option value="Low">Low Impact</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Problem / Friction Point</label>
                <textarea
                  rows="2"
                  placeholder="What was slow, inefficient, or error-prone?"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Kaizen Solution / Action Taken</label>
                <textarea
                  rows="2"
                  placeholder="What specific change was implemented to prevent recurrence?"
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="Database, Speed, Infrastructure"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
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
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-glow-emerald"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
