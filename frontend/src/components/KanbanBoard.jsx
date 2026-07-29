import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowRight, 
  ArrowLeft, 
  Calendar, 
  Tag, 
  Filter,
  Search,
  Layers,
  UserCheck
} from 'lucide-react';
import { pb } from '../services/pocketbase';

export default function KanbanBoard({ tasks, setTasks, subProjects = [], projects = [], selectedOrgId, user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubProjectId, setSelectedSubProjectId] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskSubProject, setNewTaskSubProject] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // Filter subprojects by selected organization
  const filteredProjects = projects.filter(p => !selectedOrgId || p.organization === selectedOrgId || !p.organization);
  const filteredSubProjects = subProjects.filter(sp => !selectedOrgId || !sp.project || filteredProjects.some(p => p.id === sp.project));

  const columns = [
    { id: 'todo', title: 'To Do', color: 'border-amber-500/40 bg-amber-500/5', badge: 'bg-amber-500/20 text-amber-300' },
    { id: 'in_progress', title: 'In Progress', color: 'border-brand-500/40 bg-brand-500/5', badge: 'bg-brand-500/20 text-brand-300' },
    { id: 'review', title: 'Review', color: 'border-indigo-500/40 bg-indigo-500/5', badge: 'bg-indigo-500/20 text-indigo-300' },
    { id: 'done', title: 'Done', color: 'border-emerald-500/40 bg-emerald-500/5', badge: 'bg-emerald-500/20 text-emerald-300' }
  ];

  const handleMoveTask = async (taskId, newStatus) => {
    const updated = tasks.map(task => 
      task.id === taskId ? { ...task, status: newStatus } : task
    );
    setTasks(updated);
    try {
      if (pb.authStore.isValid) {
        await pb.collection('tasks').update(taskId, { status: newStatus });
      }
    } catch (e) {}
  };

  const handleDeleteTask = async (taskId) => {
    setTasks(tasks.filter(task => task.id !== taskId));
    try {
      if (pb.authStore.isValid) {
        await pb.collection('tasks').delete(taskId);
      }
    } catch (e) {}
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const subProjId = newTaskSubProject || (filteredSubProjects[0]?.id || 'sp_1');
    const taskObj = {
      id: 'task_' + Date.now(),
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      sub_project: subProjId,
      priority: newTaskPriority.toLowerCase(),
      status: 'todo',
      due_date: newTaskDueDate || new Date().toISOString().split('T')[0],
      user: user.id || 'u_admin'
    };

    setTasks([...tasks, taskObj]);
    try {
      if (pb.authStore.isValid) {
        const created = await pb.collection('tasks').create({
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim(),
          sub_project: subProjId,
          status: 'todo',
          priority: newTaskPriority.toLowerCase(),
          due_date: taskObj.due_date,
          user: pb.authStore.model?.id || user.id
        });
        setTasks([...tasks.filter(t => t.id !== taskObj.id), created]);
      }
    } catch (e) {}

    setNewTaskTitle('');
    setNewTaskDesc('');
    setIsModalOpen(false);
  };

  const normalizedStatus = (statusStr) => {
    if (statusStr === 'in-progress') return 'in_progress';
    return statusStr || 'todo';
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSubProject = selectedSubProjectId === 'all' || task.sub_project === selectedSubProjectId;
    const matchesPriority = selectedPriority === 'All' || task.priority?.toLowerCase() === selectedPriority.toLowerCase();
    
    // Check if task belongs to org
    const taskSubProj = subProjects.find(sp => sp.id === task.sub_project);
    const orgMatch = !selectedOrgId || !taskSubProj || !taskSubProj.project || filteredProjects.some(p => p.id === taskSubProj.project);

    return matchesSearch && matchesSubProject && matchesPriority && orgMatch;
  });

  const getPriorityStyle = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'bg-rose-600/30 text-rose-300 border-rose-500/50 font-bold';
      case 'high': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'low': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default: return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Tasks Kanban Board
          </h2>
          <p className="text-xs text-slate-400">Manage tasks hierarchically grouped by sub-projects.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sub-Project Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedSubProjectId}
              onChange={(e) => setSelectedSubProjectId(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer max-w-[160px] truncate"
            >
              <option value="all" className="bg-slate-900">All Sub-Projects</option>
              {filteredSubProjects.map(sp => (
                <option key={sp.id} value={sp.id} className="bg-slate-900">{sp.name}</option>
              ))}
            </select>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl pl-9 pr-4 py-1.5 focus:outline-none focus:border-brand-500 transition-colors w-40 sm:w-48"
            />
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900">All Priorities</option>
              <option value="urgent" className="bg-slate-900">Urgent</option>
              <option value="high" className="bg-slate-900">High</option>
              <option value="medium" className="bg-slate-900">Medium</option>
              <option value="low" className="bg-slate-900">Low</option>
            </select>
          </div>

          {/* Create Task Button */}
          <button
            onClick={() => {
              setNewTaskSubProject(filteredSubProjects[0]?.id || '');
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm shadow-glow transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Kanban Columns Grid (4 columns: todo, in_progress, review, done) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => {
          const colTasks = filteredTasks.filter(t => normalizedStatus(t.status) === col.id);

          return (
            <div 
              key={col.id}
              className={`rounded-2xl border ${col.color} p-4 flex flex-col min-h-[480px] bg-slate-900/30 backdrop-blur-sm`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-slate-200 text-sm">{col.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${col.badge}`}>
                    {colTasks.length}
                  </span>
                </div>
              </div>

              {/* Task Cards Container */}
              <div className="flex-1 space-y-3 overflow-y-auto">
                {colTasks.length === 0 ? (
                  <div className="h-28 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    No tasks
                  </div>
                ) : (
                  colTasks.map(task => {
                    const subProj = subProjects.find(sp => sp.id === task.sub_project);

                    return (
                      <div 
                        key={task.id}
                        className="bg-slate-900 border border-slate-800/80 hover:border-brand-500/40 rounded-xl p-3.5 transition-all duration-200 shadow-sm hover:shadow-md space-y-2.5 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-slate-100 text-sm leading-snug">{task.title}</h4>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity p-1"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {task.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
                        )}

                        {/* Metadata Row */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] uppercase font-semibold ${getPriorityStyle(task.priority)}`}>
                            {task.priority || 'medium'}
                          </span>

                          {subProj && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 text-[10px] border border-indigo-800/50 truncate max-w-[120px]">
                              {subProj.name}
                            </span>
                          )}
                        </div>

                        {/* Footer Actions */}
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-[11px]">{task.due_date || task.dueDate || 'No date'}</span>
                          </div>

                          <div className="flex items-center space-x-1">
                            {col.id !== 'todo' && (
                              <button
                                onClick={() => {
                                  const prev = col.id === 'done' ? 'review' : col.id === 'review' ? 'in_progress' : 'todo';
                                  handleMoveTask(task.id, prev);
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                title="Move backward"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {col.id !== 'done' && (
                              <button
                                onClick={() => {
                                  const next = col.id === 'todo' ? 'in_progress' : col.id === 'in_progress' ? 'review' : 'done';
                                  handleMoveTask(task.id, next);
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                title="Move forward"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create New Task</h3>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Sub-Project</label>
                <select
                  value={newTaskSubProject}
                  onChange={(e) => setNewTaskSubProject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  {filteredSubProjects.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Task details..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
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
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
