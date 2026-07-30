import React, { useState } from 'react';
import { Layers, Plus, Edit2, Trash2, FolderKanban, Loader2 } from 'lucide-react';
import { pb } from '../services/pocketbase';

export default function SubProjects({ subProjects, setSubProjects, projects, selectedOrgId, user }) {
  const filteredProjects = projects.filter(p => !selectedOrgId || p.organization === selectedOrgId || !p.organization);

  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(filteredProjects[0]?.id || '');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(new Set());

  const filteredSubProjects = subProjects.filter(sp => {
    const projectMatch = selectedProjectId === 'all' || sp.project === selectedProjectId;
    const orgMatch = !selectedOrgId || !sp.project || filteredProjects.some(p => p.id === sp.project);
    return projectMatch && orgMatch;
  });

  const handleOpenCreate = () => {
    setEditId(null);
    setName('');
    setDescription('');
    setProjectId(filteredProjects[0]?.id || '');
    setStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sp) => {
    setEditId(sp.id);
    setName(sp.name);
    setDescription(sp.description || '');
    setProjectId(sp.project);
    setStatus(sp.status || 'active');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(prev => new Set([...prev, editId ? `edit-${editId}` : 'create']));

    if (editId) {
      // Update
      const updated = subProjects.map(sp => sp.id === editId ? { ...sp, name: name.trim(), description: description.trim(), project: projectId, status } : sp);
      setSubProjects(updated);
      try {
        if (pb.authStore.isValid) {
          await pb.collection('sub_projects').update(editId, {
            name: name.trim(),
            description: description.trim(),
            project: projectId,
            status
          });
        }
      } catch (err) {
        if (err?.status === 401) {
          pb.authStore.clear();
          window.location.href = '/login';
          return;
        }
        console.warn('Failed to update sub-project:', err);
      }
    } else {
      // Create
      try {
        if (pb.authStore.isValid) {
          const created = await pb.collection('sub_projects').create({
            name: name.trim(),
            description: description.trim(),
            project: projectId,
            status,
            user: pb.authStore.model?.id || user?.id
          });
          setSubProjects([...subProjects, created]);
        } else {
          // Offline fallback
          setSubProjects([...subProjects, {
            id: 'sp_' + Date.now(),
            name: name.trim(),
            description: description.trim(),
            project: projectId,
            status,
            user: user?.id
          }]);
        }
      } catch (err) {
        if (err?.status === 401) {
          pb.authStore.clear();
          window.location.href = '/login';
          return;
        }
        console.warn('Failed to create sub-project:', err);
      }
    }

    setLoading(prev => {
      const next = new Set(prev);
      next.delete(editId ? `edit-${editId}` : 'create');
      return next;
    });
    setName('');
    setDescription('');
    setEditId(null);
    setIsModalOpen(false);
  };

  const handleDelete = async (id) => {
    setLoading(prev => new Set([...prev, `delete-${id}`]));
    const prevItems = [...subProjects];
    setSubProjects(subProjects.filter(sp => sp.id !== id));

    try {
      if (pb.authStore.isValid) {
        await pb.collection('sub_projects').delete(id);
      }
    } catch (err) {
      setSubProjects(prevItems);
      if (err?.status === 401) {
        pb.authStore.clear();
        window.location.href = '/login';
        return;
      }
      console.warn('Failed to delete sub-project:', err);
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(`delete-${id}`);
        return next;
      });
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'in_progress': return 'bg-brand-500/10 text-brand-400 border-brand-500/20';
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'archived': return 'bg-slate-800 text-slate-400 border-slate-700';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Sub-Projects Overview
          </h2>
          <p className="text-xs text-slate-400">Nested project components under high-level parent projects.</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Parent Project Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Parent Projects</option>
              {filteredProjects.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleOpenCreate}
            disabled={loading.has('create')}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm shadow-glow transition-all disabled:opacity-50"
          >
            {loading.has('create') ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>New Sub-Project</span>
          </button>
        </div>
      </div>

      {/* Sub-projects list grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSubProjects.length === 0 ? (
          <div className="col-span-full p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
            No sub-projects found for this project filter.
          </div>
        ) : (
          filteredSubProjects.map(sp => {
            const parentProject = projects.find(p => p.id === sp.project);
            return (
              <div
                key={sp.id}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white text-base leading-snug">{sp.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getStatusBadge(sp.status)}`}>
                      {sp.status || 'active'}
                    </span>
                  </div>
                  {sp.description && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">{sp.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                    <FolderKanban className="w-3 h-3 text-indigo-400" />
                    <span className="text-[11px] truncate max-w-[120px]">
                      {parentProject ? parentProject.name : 'Parent Project'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(sp)}
                      disabled={loading.has(`edit-${sp.id}`)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                      title="Edit Sub-project"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sp.id)}
                      disabled={loading.has(`delete-${sp.id}`)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
                      title="Delete Sub-project"
                    >
                      {loading.has(`delete-${sp.id}`) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal CRUD Sub-Project */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">
              {editId ? 'Edit Sub-Project' : 'Create Sub-Project'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Sub-Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Auth Module & Baileys Setup"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Parent Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  {filteredProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="active">Active</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Details about this sub-project..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
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
                  disabled={loading.has(editId ? `edit-${editId}` : 'create')}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
                >
                  {loading.has(editId ? `edit-${editId}` : 'create') ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
