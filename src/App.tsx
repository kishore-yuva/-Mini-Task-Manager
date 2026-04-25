/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, CheckCircle2, Circle, Loader2, AlertCircle, LayoutGrid, Clock, Database, Check, LogOut, Mail, Lock, UserPlus, HelpCircle, X, Download, FileText, Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const USER_MANUAL_CONTENT = `
# Mini Task Manager - User Manual

Welcome to **Mini Task Manager**, a sleek, professional workspace designed for efficient task tracking and productivity.

## 🚀 Getting Started
Direct and instant access. No account creation or login required. Just start managing your tasks immediately in this unified workspace.

## 📋 Managing Tasks

### Creating a Task
Use the **"New Task"** panel. Enter a title, pick a status, and you're good to go.

### Searching & Filtering
The **Search Bar** in the Active Tasks panel allows you to find tasks by keyword instantly.

### Editing Tasks
Click a task title to enter **Edit Mode**. Press **Enter** to save or **Escape** to cancel. 

### Completion & Deletion
- Click icons to toggle status.
- Individual delete via the trash icon on hover.
- **Clear All** for bulk removal (requires double-click confirmation).

## 📊 Productivity Tracking
The circular health bar reflects your completion percentage. Aim for 100%!
`;

interface Task {
  id: string;
  userId: string;
  title: string;
  status: 'pending' | 'completed';
  endTime: string | null;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
}

export default function App() {
  const appName = 'Mini Task Manager';
  const rawApiUrl = import.meta.env.VITE_API_URL || '';
  // Fix: If the API URL is a placeholder like "123" or doesn't look like a URL/absolute path, ignore it.
  const apiUrl = (rawApiUrl.startsWith('http') || rawApiUrl.startsWith('/')) 
    ? (rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl)
    : '';
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newStatus, setNewStatus] = useState<'pending' | 'completed'>('pending');
  const [newEndTime, setNewEndTime] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ status: string; db: string; configured: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    checkHealth();
    fetchTasks();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/health`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setDbStatus(data);
        }
      }
    } catch (err) {
      console.warn('Health check failed');
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    const requestUrl = `${apiUrl}/api/tasks`;
    try {
      const res = await fetch(requestUrl);
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Non-JSON response details:', {
          url: requestUrl,
          status: res.status,
          contentType,
          bodySnippet: text.substring(0, 200)
        });
        throw new Error(`API error: Expected JSON but received ${contentType || 'text/html'} from ${requestUrl}. (Status: ${res.status})`);
      }
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tasks');
      setTasks(data);
    } catch (err: any) {
      setError(err.message || 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (e: any) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const requestUrl = `${apiUrl}/api/tasks`;
    try {
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          title: newTitle, 
          status: newStatus,
          endTime: newEndTime || null 
        }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Task response Error:', { url: requestUrl, status: res.status, body: text.substring(0, 50) });
        throw new Error(`Task Error: Expected JSON but received ${contentType || 'text/html'} from ${requestUrl}. (Status: ${res.status})`);
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add task');
      }

      setTasks([data, ...tasks]);
      setNewTitle('');
      setNewStatus('pending');
      setNewEndTime('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch(`${apiUrl}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error('Invalid response from server.');
      }

      const updatedTask = await res.json();
      if (!res.ok) throw new Error('Failed to update status');
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t));
    } catch (err: any) {
      setError(err.message || 'Failed to update task status.');
    }
  };

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditEndTime(task.endTime || '');
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return setEditingId(null);
    try {
      const res = await fetch(`${apiUrl}/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          title: editTitle,
          endTime: editEndTime || null
        }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error('Invalid response from server.');
      }

      const updatedTask = await res.json();
      if (!res.ok) throw new Error('Failed to update title');
      setTasks(tasks.map(t => t.id === id ? updatedTask : t));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save task edit.');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/tasks/${id}`, { 
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete task');
      setTasks(tasks.filter(t => t.id !== id));
    } catch (err) {
      setError('Failed to delete task.');
    }
  };

  const deleteAllTasks = async () => {
    if (!isConfirmingDeleteAll) {
      setIsConfirmingDeleteAll(true);
      return;
    }
    
    try {
      const res = await fetch(`${apiUrl}/api/tasks`, { 
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Failed to delete all tasks');
      setTasks([]);
      setIsConfirmingDeleteAll(false);
    } catch (err) {
      setError('Failed to delete all tasks.');
      setIsConfirmingDeleteAll(false);
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const healthPercentage = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 100;

  const filteredTasks = tasks.filter(task => 
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 flex flex-col font-sans overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full flex-grow flex flex-col">
        {/* Guide Overlay */}
        <AnimatePresence>
          {showGuide && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowGuide(false)}
            >
              <motion.div 
                onClick={(e) => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
              >
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center">
                      <HelpCircle className="text-indigo-400 w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Application Guide</h3>
                      <p className="text-xs text-zinc-500">Master your productivity flow</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => window.print()}
                      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-zinc-700"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print / PDF
                    </button>
                    <button 
                      onClick={() => setShowGuide(false)}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 text-sm leading-relaxed" id="printable-manual">
                  <div className="markdown-body prose prose-invert max-w-none">
                    <ReactMarkdown>{USER_MANUAL_CONTENT}</ReactMarkdown>
                  </div>
                  
                  <section className="pt-8 border-t border-zinc-800">
                    <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" /> Managing Tasks
                    </h4>
                    <ul className="space-y-4 text-zinc-400">
                      <li className="flex gap-3">
                        <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-zinc-500 flex-shrink-0">1</span>
                        <span>Click a task title to <strong className="text-zinc-200">Edit</strong>. Press Enter to save or Escape to cancel.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-zinc-500 flex-shrink-0">2</span>
                        <span>Use the <strong className="text-zinc-200">Search Bar</strong> at the top to filter tasks by keywords.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-zinc-500 flex-shrink-0">3</span>
                        <span>Check the <strong className="text-zinc-200">Checkbox</strong> to toggle between Pending and Completed.</span>
                      </li>
                    </ul>
                  </section>

                  <section>
                    <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-400" /> Deleting Tasks
                    </h4>
                    <p className="text-zinc-400">
                      Hover over a task to see the delete icon. Use <strong className="text-red-400">Clear All</strong> for bulk deletion (requires double confirmation).
                    </p>
                  </section>

                  <div className="p-4 bg-indigo-600/5 border border-indigo-600/10 rounded-2xl">
                    <p className="text-xs text-indigo-300 italic text-center">
                      "Project health reflects your percentage of completed tasks."
                    </p>
                  </div>
                </div>
                
                <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 text-center">
                  <button 
                    onClick={() => setShowGuide(false)}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4"
                  >
                    Got it, thanks!
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header Block */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutGrid className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{appName}</h1>
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Efficient Workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full flex items-center gap-4 shadow-sm">
              <span className="flex items-center gap-2 text-sm text-zinc-400">
                <span className={`w-2 h-2 rounded-full bg-emerald-500 ${loading ? 'animate-pulse' : ''}`}></span>
                API Status: {loading ? 'Checking...' : 'Online'}
              </span>
              <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block"></div>
              <span className="text-sm text-zinc-300 font-medium hidden sm:block">
                {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowGuide(!showGuide)}
                className={`p-2 transition-colors ${showGuide ? 'text-indigo-400' : 'text-zinc-500 hover:text-white'}`}
                title="User Guide"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-6 gap-6 flex-grow pb-8">
          {/* Active Tasks Panel */}
          <div className="md:col-span-8 md:row-span-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col overflow-hidden text-zinc-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Active Tasks
              </h2>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Database className="w-4 h-4 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-zinc-800 text-zinc-400 text-xs px-3 py-1 rounded-full whitespace-nowrap">{filteredTasks.length} visible</span>
                  {tasks.length > 0 && (
                    <div className="flex items-center gap-2">
                      {isConfirmingDeleteAll && (
                        <button
                          onClick={() => setIsConfirmingDeleteAll(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={deleteAllTasks}
                        className={`${isConfirmingDeleteAll ? 'bg-red-600' : 'bg-red-500/10 hover:bg-red-500/20'} text-red-500 ${isConfirmingDeleteAll ? 'text-white' : ''} text-xs px-3 py-1 rounded-full transition-all font-medium flex items-center gap-1 active:scale-95`}
                        title={isConfirmingDeleteAll ? "Click again to confirm" : "Clear all tasks"}
                      >
                        <Trash2 className="w-3 h-3" />
                        {isConfirmingDeleteAll ? 'Are you sure?' : 'Clear All'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-10">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p>Initializing workspace...</p>
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 py-20 border-2 border-dashed border-zinc-800 rounded-2xl">
                  <CheckCircle2 className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium opacity-50">No pending actions</p>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 py-20">
                  <Database className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium opacity-50 text-center">No tasks match "{searchQuery}"</p>
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="text-indigo-400 text-sm mt-2 hover:underline"
                  >
                    Clear search query
                  </button>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group bg-zinc-900 border p-4 rounded-2xl flex items-center justify-between transition-all ${editingId === task.id ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-zinc-800/50 hover:border-indigo-500/50 hover:bg-zinc-800/50'}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <button 
                          onClick={() => toggleTaskStatus(task)}
                          className={`w-6 h-6 border-2 rounded-md flex items-center justify-center transition-colors ${task.status === 'completed' ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-700 hover:border-indigo-500'}`}
                        >
                          {task.status === 'completed' && <Check className="w-4 h-4 text-white" />}
                        </button>
                        <div className="flex-1">
                          {editingId === task.id ? (
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col gap-2 flex-1">
                                <input
                                  autoFocus
                                  className="w-full bg-zinc-950 border border-indigo-500 rounded-lg px-2 py-1 text-zinc-100 focus:outline-none"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit(task.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="datetime-local"
                                    value={editEndTime}
                                    onChange={(e) => setEditEndTime(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                              <button 
                                onClick={() => saveEdit(task.id)}
                                className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setEditingId(null)}
                                className="p-1.5 bg-zinc-800 text-zinc-400 rounded-md hover:bg-zinc-700 transition-colors"
                              >
                                <Plus className="w-4 h-4 rotate-45" />
                              </button>
                            </div>
                          ) : (
                            <div 
                              onClick={() => startEditing(task)}
                              className="cursor-text"
                            >
                              <p className={`font-medium transition-all ${task.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                                {task.title}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {new Date(task.createdAt).toLocaleDateString()}
                                </p>
                                {task.endTime && (
                                  <p className={`text-[10px] flex items-center gap-1 font-medium ${new Date(task.endTime) < new Date() && task.status === 'pending' ? 'text-red-400' : 'text-indigo-400'}`}>
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    Due: {new Date(task.endTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {!editingId && (
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Creation Panel */}
          <div className="md:col-span-4 md:row-span-3 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4 text-zinc-100">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Create Task
            </h2>
            <form onSubmit={addTask} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Title</label>
                <input 
                  type="text" 
                  placeholder="What needs to be done?" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                  Due Date <span className="text-[10px] lowercase font-normal opacity-50">(optional)</span>
                </label>
                <input 
                  type="datetime-local" 
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Initial Status</label>
                <div className="flex gap-2 p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setNewStatus('pending')}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${newStatus === 'pending' ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStatus('completed')}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${newStatus === 'completed' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Completed
                  </button>
                </div>
              </div>
              
              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 bg-red-500/10 text-red-500 rounded-xl flex items-center gap-2 text-xs border border-red-500/20"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                type="submit"
                disabled={isSubmitting || !newTitle.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/10 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Task
              </button>
            </form>
          </div>

          {/* Total Tasks Box */}
          <div className="md:col-span-4 md:row-span-1 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between transition-colors group">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Total Tasks</p>
              <p className="text-3xl font-bold mt-1 text-white">{tasks.length}</p>
            </div>
            <LayoutGrid className="w-8 h-8 text-zinc-800 group-hover:text-indigo-500/50 transition-colors" />
          </div>

          {/* Pending Box */}
          <div className="md:col-span-2 md:row-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between hover:border-indigo-500/30 transition-colors">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Pending</p>
              <p className="text-3xl font-bold mt-1 text-white">{pendingCount}</p>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 text-xs mt-2">
              <Circle className="w-4 h-4" />
              <span>In Queue</span>
            </div>
          </div>

          {/* Completed Box */}
          <div className="md:col-span-2 md:row-span-2 bg-indigo-600 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-2xl shadow-indigo-500/20 group">
            <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform text-white">
              <CheckCircle2 className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider">Completed</p>
              <p className="text-3xl font-bold mt-1 text-white">{completedCount}</p>
            </div>
            <div className="relative z-10 flex items-center gap-2 text-white/80 text-xs font-medium">
              <Check className="w-4 h-4" />
              <span>Finished</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
