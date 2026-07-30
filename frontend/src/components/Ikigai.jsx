import React, { useState, useEffect } from 'react';
import { Heart, Sparkles, Globe, DollarSign, Save, RefreshCw } from 'lucide-react';

const STORAGE_KEY = 'kaizenpm_ikigai';

const defaultIkigai = {
  love: '',
  goodAt: '',
  worldNeeds: '',
  paidFor: '',
  lastUpdated: null
};

export default function Ikigai() {
  const [data, setData] = useState(defaultIkigai);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setData({ ...defaultIkigai, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.warn('Failed to load Ikigai from localStorage:', e);
    }
  }, []);

  const updateField = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.warn('Failed to save Ikigai:', e);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all Ikigai fields?')) {
      setData(defaultIkigai);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const circles = [
    {
      key: 'love',
      label: 'What You Love',
      icon: Heart,
      color: 'from-pink-500/30 to-pink-600/20 border-pink-500/40 text-pink-300',
      placeholder: 'e.g., Writing, coding, teaching...',
      value: data.love
    },
    {
      key: 'goodAt',
      label: "What You're Good At",
      icon: Sparkles,
      color: 'from-blue-500/30 to-blue-600/20 border-blue-500/40 text-blue-300',
      placeholder: 'e.g., Problem solving, design...',
      value: data.goodAt
    },
    {
      key: 'worldNeeds',
      label: 'What the World Needs',
      icon: Globe,
      color: 'from-emerald-500/30 to-emerald-600/20 border-emerald-500/40 text-emerald-300',
      placeholder: 'e.g., Clean energy, education...',
      value: data.worldNeeds
    },
    {
      key: 'paidFor',
      label: 'What You Can Be Paid For',
      icon: DollarSign,
      color: 'from-amber-500/30 to-amber-600/20 border-amber-500/40 text-amber-300',
      placeholder: 'e.g., Consulting, development...',
      value: data.paidFor
    }
  ];

  // Count how many fields are filled
  const filledCount = circles.filter(c => c.value.trim().length > 0).length;
  const readyPercentage = Math.round((filledCount / 4) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-400" />
              <span>Ikigai — Reason for Being</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Find your purpose at the intersection of passion, mission, profession, and vocation.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-800 transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white transition-all flex items-center gap-1.5 shadow-glow"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saved ? 'Saved!' : 'Save to Browser'}</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-brand-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${readyPercentage}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
            {filledCount}/4 areas filled
          </span>
        </div>
      </div>

      {/* Venn Diagram Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {circles.map((circle) => {
          const Icon = circle.icon;
          const hasValue = circle.value.trim().length > 0;
          return (
            <div
              key={circle.key}
              className={`bg-gradient-to-br ${circle.color} border rounded-2xl p-5 backdrop-blur-sm transition-all space-y-3 hover:shadow-lg ${
                hasValue ? 'ring-1 ring-white/10' : ''
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-slate-950/60 border ${circle.color.split(' ').find(c => c.startsWith('border-'))}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-white">{circle.label}</h3>
              </div>
              <textarea
                value={circle.value}
                onChange={(e) => updateField(circle.key, e.target.value)}
                placeholder={circle.placeholder}
                rows={3}
                className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/30 resize-none transition-all"
              />
            </div>
          );
        })}
      </div>

      {/* Center Intersection Display */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 via-brand-500/20 to-emerald-500/20 border border-white/10 mb-2">
            <Heart className="w-6 h-6 text-rose-300" />
          </div>
          <h3 className="text-lg font-bold text-white">Your Ikigai Intersection</h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Ikigai lies where all four circles overlap — the convergence of what you love, what you're good at, what the world needs, and what you can be paid for.
          </p>
          {filledCount === 4 ? (
            <div className="mt-4 p-4 bg-gradient-to-r from-rose-500/10 via-brand-500/10 to-emerald-500/10 rounded-xl border border-white/10">
              <p className="text-sm text-slate-200 italic leading-relaxed">
                "{data.love || 'Your passion'} + {data.goodAt || 'Your skill'} + {data.worldNeeds || 'World need'} + {data.paidFor || 'Your value'} = Your Purpose"
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-2">
              Fill in all four areas above to see your intersection statement.
            </p>
          )}
          {data.lastUpdated && (
            <p className="text-[10px] text-slate-600 mt-3">
              Last saved: {new Date(data.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
