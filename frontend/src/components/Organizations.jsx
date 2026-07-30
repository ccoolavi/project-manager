import React, { useState, useEffect } from 'react';
import { Building2, Plus, Users, Shield, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { pb } from '../services/pocketbase';

export default function Organizations({ organizations, setOrganizations, selectedOrgId, setSelectedOrgId, user }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(selectedOrgId || (organizations[0]?.id || ''));
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [loading, setLoading] = useState(new Set());

  useEffect(() => {
    if (selectedOrgId) setActiveOrgId(selectedOrgId);
  }, [selectedOrgId]);

  const activeOrg = organizations.find(o => o.id === activeOrgId) || organizations[0];
  const isAdmin = activeOrg
    ? (activeOrg.owner === user?.id)
    : true;

  useEffect(() => {
    async function loadMembers() {
      if (!activeOrgId || !pb.authStore.isValid) return;
      try {
        const res = await pb.collection('organization_members').getFullList({
          filter: `organization = "${activeOrgId}"`,
          expand: 'user',
          requestKey: null
        });
        setMembers(res);
      } catch (e) {
        console.warn('Failed to load members:', e);
        if (e?.status === 401) {
          pb.authStore.clear();
          window.location.href = '/login';
          return;
        }
        setMembers([]);
      }
    }
    loadMembers();
  }, [activeOrgId, user]);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(prev => new Set([...prev, 'create']));

    try {
      if (pb.authStore.isValid) {
        const created = await pb.collection('organizations').create({
          name: name.trim(),
          description: description.trim(),
          owner: pb.authStore.model?.id || user?.id
        });
        await pb.collection('organization_members').create({
          user: pb.authStore.model?.id || user?.id,
          organization: created.id,
          role: 'admin'
        });
        setOrganizations([...organizations, created]);
        setSelectedOrgId(created.id);
      }
    } catch (err) {
      if (err?.status === 401) {
        pb.authStore.clear();
        window.location.href = '/login';
        return;
      }
      console.warn('Failed to create organization:', err);
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete('create');
        return next;
      });
      setName('');
      setDescription('');
      setIsCreateModalOpen(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;

    setLoading(prev => new Set([...prev, 'add-member']));

    try {
      if (pb.authStore.isValid) {
        const created = await pb.collection('organization_members').create({
          user: newMemberEmail.trim(),
          organization: activeOrgId,
          role: newMemberRole
        });
        setMembers([...members, created]);
      }
    } catch (err) {
      if (err?.status === 401) {
        pb.authStore.clear();
        window.location.href = '/login';
        return;
      }
      console.warn('Failed to add member:', err);
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete('add-member');
        return next;
      });
      setNewMemberEmail('');
    }
  };

  const handleRemoveMember = async (memberId) => {
    setLoading(prev => new Set([...prev, `remove-${memberId}`]));
    const prevMembers = [...members];
    setMembers(members.filter(m => m.id !== memberId));

    try {
      if (pb.authStore.isValid) {
        await pb.collection('organization_members').delete(memberId);
      }
    } catch (err) {
      setMembers(prevMembers);
      if (err?.status === 401) {
        pb.authStore.clear();
        window.location.href = '/login';
        return;
      }
      console.warn('Failed to remove member:', err);
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(`remove-${memberId}`);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-400" />
            Organizations Management
          </h2>
          <p className="text-xs text-slate-400">Manage multi-organization workspace structures and member roles.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={loading.has('create')}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm shadow-glow transition-all disabled:opacity-50"
        >
          {loading.has('create') ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span>New Organization</span>
        </button>
      </div>

      {/* Grid of Orgs & Selected Org Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orgs List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider px-1">Your Organizations</h3>
          <div className="space-y-2">
            {organizations.map(org => {
              const isSelected = org.id === activeOrgId;
              return (
                <div
                  key={org.id}
                  onClick={() => {
                    setActiveOrgId(org.id);
                    setSelectedOrgId(org.id);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-600/15 border-brand-500 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{org.name}</h4>
                    {isSelected && (
                      <span className="text-[10px] bg-brand-500/20 text-brand-300 border border-brand-500/40 px-2 py-0.5 rounded-full font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  {org.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{org.description}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Members & Details Panel */}
        <div className="lg:col-span-2 space-y-6">
          {activeOrg ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{activeOrg.name}</h3>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-700">
                    ID: {activeOrg.id}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">{activeOrg.description || 'No description provided.'}</p>
              </div>

              {/* Members Section */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-brand-400" />
                    Organization Members ({members.length})
                  </h4>
                  {isAdmin && (
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                      Admin Permissions Active
                    </span>
                  )}
                </div>

                {/* Add Member Form (Admin only) */}
                {isAdmin && (
                  <form onSubmit={handleAddMember} className="flex flex-wrap sm:flex-nowrap gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <input
                      type="email"
                      required
                      placeholder="User email address..."
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="submit"
                      disabled={loading.has('add-member')}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {loading.has('add-member') ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Add</span>
                    </button>
                  </form>
                )}

                {/* Members List */}
                <div className="space-y-2">
                  {members.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">No members loaded.</p>
                  ) : (
                    members.map(m => {
                      const userName = m.expand?.user?.name || m.expand?.user?.email || m.user;
                      const userEmail = m.expand?.user?.email || m.user;
                      return (
                        <div key={m.id} className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs font-bold uppercase">
                              {userName.charAt(0)}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-white">{userName}</div>
                              <div className="text-[10px] text-slate-400">{userEmail}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              m.role === 'admin'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {m.role}
                            </span>
                            {isAdmin && m.user !== user?.id && (
                              <button
                                onClick={() => handleRemoveMember(m.id)}
                                disabled={loading.has(`remove-${m.id}`)}
                                className="text-slate-500 hover:text-rose-400 p-1 disabled:opacity-50"
                                title="Remove member"
                              >
                                {loading.has(`remove-${m.id}`) ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
              Select an organization to view details and members.
            </div>
          )}
        </div>
      </div>

      {/* Modal to Create Organization */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create Organization</h3>
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder="Acme Corp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Primary organization workspace..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading.has('create')}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
                >
                  {loading.has('create') ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
