/**
 * SKCore Tools Suite — Global Mission Control Event & Project Bus
 * Connects the Hub and all 9 cartridges via BroadcastChannel & LocalStorage.
 * Zero external dependencies.
 */
(function(window) {
  'use strict';

  const CHANNEL_NAME = 'skcore_bus';
  const STORAGE_PROJECT_KEY = 'skcore_active_project';
  const STORAGE_TELEMETRY_KEY = 'skcore_hub_telemetry';
  const STORAGE_ACTIVITY_KEY = 'skcore_activity_feed';

  // Default Project Metadata
  const DEFAULT_PROJECT = {
    id: 'fe-gb-starter_unity',
    name: 'fe-gb-starter_unity',
    rootPath: 'c:/Users/SemihKubilay/Documents/GHST/fe-gb-starter_unity',
    unityVersion: 'Unity 6000.0.32f1 (LTS)',
    targetPlatform: 'WebGL / Android',
    branch: 'main',
    lastSyncMs: Date.now()
  };

  // Initial Telemetry Cache
  const DEFAULT_TELEMETRY = {
    ats: {
      totalAssets: 95,
      totalBytes: 25165824, // ~24MB
      textures: 76,
      audio: 2,
      models: 4,
      optimizedCount: 18,
      status: 'Ready'
    },
    quest: {
      total: 0,
      inProgress: 0,
      completed: 0,
      criticalBugs: 0,
      sprintProgress: 0
    },
    forge: {
      lastBuildNumber: 14,
      status: 'success', // 'success' | 'building' | 'failed'
      target: 'WebGL / Android',
      duration: '42s',
      timestamp: Date.now() - 3600000 // 1 hour ago
    },
    profiler: {
      avgFrameTime: 16.2,
      targetFps: 60,
      hitches: 0,
      memoryMb: 148,
      status: 'Optimal'
    },
    localization: {
      totalKeys: 128,
      languages: ['EN', 'TR', 'DE', 'ES', 'FR', 'JA'],
      missingKeys: 0,
      status: '100% Translated'
    }
  };

  let broadcastChannel = null;
  try {
    if (typeof window.BroadcastChannel === 'function') {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {
    console.warn('[SKCore Bus] BroadcastChannel not supported, falling back to storage events');
  }

  const listeners = new Map();

  function on(eventType, callback) {
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set());
    }
    listeners.get(eventType).add(callback);
    return () => off(eventType, callback);
  }

  function off(eventType, callback) {
    if (listeners.has(eventType)) {
      listeners.get(eventType).delete(callback);
    }
  }

  function dispatch(eventType, payload) {
    // Notify local tab listeners
    if (listeners.has(eventType)) {
      listeners.get(eventType).forEach(cb => {
        try { cb(payload); } catch (err) { console.error('[SKCore Bus Listener Error]', err); }
      });
    }

    // Broadcast across tabs
    const message = { type: eventType, payload, timestamp: Date.now() };
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(message);
      } catch (err) {}
    }
  }

  // Listen to messages from other tabs
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (!event.data || !event.data.type) return;
      const { type, payload } = event.data;
      if (listeners.has(type)) {
        listeners.get(type).forEach(cb => {
          try { cb(payload); } catch (err) { console.error('[SKCore Bus Remote Listener Error]', err); }
        });
      }
    };
  }

  // Project Context Management
  function getActiveProject() {
    try {
      const saved = localStorage.getItem(STORAGE_PROJECT_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PROJECT;
    } catch (e) {
      return DEFAULT_PROJECT;
    }
  }

  function setActiveProject(project) {
    const updated = { ...getActiveProject(), ...project, lastSyncMs: Date.now() };
    localStorage.setItem(STORAGE_PROJECT_KEY, JSON.stringify(updated));
    dispatch('PROJECT_CHANGED', updated);
    logActivity('Project switched: ' + updated.name, 'hub');
    return updated;
  }

  // Telemetry Management
  function getTelemetry() {
    try {
      const saved = localStorage.getItem(STORAGE_TELEMETRY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset legacy mock quest telemetry if present
        if (parsed.quest && parsed.quest.total === 12 && parsed.quest.sprintProgress === 67) {
          parsed.quest = { total: 0, inProgress: 0, completed: 0, criticalBugs: 0, sprintProgress: 0 };
          localStorage.setItem(STORAGE_TELEMETRY_KEY, JSON.stringify(parsed));
        }
        return { ...DEFAULT_TELEMETRY, ...parsed };
      }
      return DEFAULT_TELEMETRY;
    } catch (e) {
      return DEFAULT_TELEMETRY;
    }
  }

  function updateTelemetry(system, patch) {
    const current = getTelemetry();
    current[system] = { ...current[system], ...patch };
    localStorage.setItem(STORAGE_TELEMETRY_KEY, JSON.stringify(current));
    dispatch('TELEMETRY_UPDATED', { system, data: current[system] });
    return current;
  }

  // Activity Log
  function getActivityFeed() {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVITY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function logActivity(text, source = 'system') {
    const feed = getActivityFeed();
    const entry = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text,
      source,
      time: Date.now()
    };
    const updated = [entry, ...feed].slice(0, 30);
    localStorage.setItem(STORAGE_ACTIVITY_KEY, JSON.stringify(updated));
    dispatch('ACTIVITY_LOGGED', entry);
    return entry;
  }

  // Quick Task Management for Universal Drawer / Command Palette
  function getQuickTasks() {
    try {
      const saved = localStorage.getItem('skcore_quick_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Clean out legacy mock tasks
        const valid = parsed.filter(t => !['task-1', 'task-2', 'task-3', 'task-4', 'task-5'].includes(t.id));
        if (valid.length !== parsed.length) {
          localStorage.setItem('skcore_quick_tasks', JSON.stringify(valid));
        }
        return valid;
      }
    } catch (e) {}

    return [];
  }

  function addQuickTask(title, priority = 'normal', category = 'General') {
    const tasks = getQuickTasks();
    const newTask = {
      id: 'task-' + Date.now(),
      title,
      priority,
      category,
      status: 'todo',
      createdMs: Date.now()
    };
    const updated = [newTask, ...tasks];
    localStorage.setItem('skcore_quick_tasks', JSON.stringify(updated));
    
    // Update Quest telemetry
    const inProg = updated.filter(t => t.status === 'in-progress').length;
    const completed = updated.filter(t => t.status === 'done').length;
    const critical = updated.filter(t => t.priority === 'critical' && t.status !== 'done').length;
    const sprintPct = Math.round((completed / updated.length) * 100);
    
    updateTelemetry('quest', {
      total: updated.length,
      inProgress: inProg,
      completed,
      criticalBugs: critical,
      sprintProgress: sprintPct
    });

    dispatch('TASK_ADDED', newTask);
    logActivity(`New task created: "${title}"`, 'quest');
    return newTask;
  }

  function toggleTaskStatus(taskId) {
    const tasks = getQuickTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;

    if (task.status === 'todo') task.status = 'in-progress';
    else if (task.status === 'in-progress') task.status = 'done';
    else task.status = 'todo';

    localStorage.setItem('skcore_quick_tasks', JSON.stringify(tasks));
    
    const inProg = tasks.filter(t => t.status === 'in-progress').length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const sprintPct = Math.round((completed / tasks.length) * 100);

    updateTelemetry('quest', {
      total: tasks.length,
      inProgress: inProg,
      completed,
      sprintProgress: sprintPct
    });

    dispatch('TASK_UPDATED', task);
    logActivity(`Task "${task.title}" status -> ${task.status}`, 'quest');
    return task;
  }

  // Format Helper
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // Global Export
  window.SKCoreBus = {
    on,
    off,
    dispatch,
    getActiveProject,
    setActiveProject,
    getTelemetry,
    updateTelemetry,
    getActivityFeed,
    logActivity,
    getQuickTasks,
    addQuickTask,
    toggleTaskStatus,
    formatBytes,
    formatTimeAgo
  };

})(window);
