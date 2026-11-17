/**
 * SKCore Tools Suite — Universal Slide-Over Quest Drawer ([Q])
 * Embedded slide-over panel for instant task tracking and live activity feed.
 */
(function(window) {
  'use strict';

  let drawerEl = null;
  let backdropEl = null;
  let activeTab = 'tasks'; // 'tasks' | 'activity'

  function init() {
    createDrawerDOM();
    bindEvents();
    renderTasks();
  }

  function createDrawerDOM() {
    if (document.getElementById('skcore-drawer-panel')) return;

    // Backdrop
    backdropEl = document.createElement('div');
    backdropEl.id = 'skcore-drawer-backdrop';
    backdropEl.className = 'fixed inset-0 z-[9990] hidden bg-black/40 backdrop-blur-sm transition-opacity duration-300';
    backdropEl.style.opacity = '0';

    // Drawer Panel
    drawerEl = document.createElement('div');
    drawerEl.id = 'skcore-drawer-panel';
    drawerEl.className = 'fixed bottom-0 right-0 top-0 z-[9995] flex w-full max-w-md flex-col border-l border-zinc-200/80 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 translate-x-full dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-[0_0_50px_rgba(0,0,0,0.8)]';

    drawerEl.innerHTML = `
      <!-- Drawer Header -->
      <div class="flex items-center justify-between border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
        <div class="flex items-center gap-2.5">
          <div class="grid size-8 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <span class="material-symbols-outlined text-[20px]">assignment</span>
          </div>
          <div>
            <h3 class="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Sprint Mission Control</h3>
            <div class="text-[11px] text-zinc-500 dark:text-zinc-400">Press <kbd class="font-mono font-semibold">Q</kbd> or ESC to dismiss</div>
          </div>
        </div>
        <button id="skcore-drawer-close" class="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Sprint Progress Bar -->
      <div id="skcore-drawer-sprint-bar" class="border-b border-zinc-200/60 bg-zinc-50/50 px-5 py-3 dark:border-zinc-800/60 dark:bg-zinc-900/30">
        <div class="flex items-center justify-between text-[11.5px] font-semibold text-zinc-600 dark:text-zinc-400">
          <span>Sprint Milestone Progress</span>
          <span id="skcore-drawer-progress-text" class="font-mono text-sky-600 dark:text-sky-400">67%</span>
        </div>
        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div id="skcore-drawer-progress-fill" class="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300" style="width: 67%"></div>
        </div>
      </div>

      <!-- Tab Switcher -->
      <div class="flex border-b border-zinc-200/80 px-5 dark:border-zinc-800">
        <button id="skcore-tab-tasks" class="border-b-2 border-sky-500 px-4 py-2.5 text-[12.5px] font-bold text-sky-600 dark:text-sky-400">
          Tasks &amp; Bugs
        </button>
        <button id="skcore-tab-activity" class="border-b-2 border-transparent px-4 py-2.5 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Live Activity Feed
        </button>
      </div>

      <!-- Quick Add Form -->
      <div id="skcore-drawer-add-box" class="border-b border-zinc-200/60 p-4 dark:border-zinc-800/60">
        <form id="skcore-drawer-form" class="flex gap-2">
          <input
            id="skcore-drawer-input"
            type="text"
            placeholder="Add task or log bug (e.g. 'Fix normal map seam')..."
            class="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-[12.5px] text-zinc-800 placeholder:text-zinc-400 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button type="submit" class="rounded-xl bg-sky-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-sky-500">
            Add
          </button>
        </form>
      </div>

      <!-- Content Container -->
      <div id="skcore-drawer-content" class="flex-1 overflow-y-auto p-4 space-y-2">
        <!-- Dynamically rendered -->
      </div>

      <!-- Drawer Footer -->
      <div class="flex items-center justify-between border-t border-zinc-200/80 bg-zinc-50/80 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <a href="./questboard/dist/index.html" class="flex items-center gap-1.5 text-[12px] font-bold text-sky-600 hover:text-sky-500 dark:text-sky-400">
          <span>Open Full QuestBoard</span>
          <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>
        <span class="text-[11px] text-zinc-400 font-mono">SQLite • WASM</span>
      </div>
    `;

    document.body.appendChild(backdropEl);
    document.body.appendChild(drawerEl);

    // Floating Drawer Trigger Button (Bottom Right)
    createFloatingPill();
  }

  function createFloatingPill() {
    if (document.getElementById('skcore-drawer-pill')) return;

    const pill = document.createElement('button');
    pill.id = 'skcore-drawer-pill';
    pill.className = 'fixed bottom-5 right-5 z-[9980] flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/90 px-3.5 py-2 text-[12.5px] font-semibold text-zinc-700 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-sky-400 hover:text-sky-600 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:text-sky-300';
    pill.innerHTML = `
      <span class="material-symbols-outlined text-[18px] text-sky-500">assignment</span>
      <span>Quests</span>
      <kbd class="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono dark:border-zinc-700 dark:bg-zinc-800">Q</kbd>
    `;

    pill.addEventListener('click', toggle);
    document.body.appendChild(pill);
  }

  function bindEvents() {
    document.getElementById('skcore-drawer-close')?.addEventListener('click', close);
    backdropEl?.addEventListener('click', close);

    // Tabs
    const tabTasks = document.getElementById('skcore-tab-tasks');
    const tabActivity = document.getElementById('skcore-tab-activity');

    tabTasks?.addEventListener('click', () => {
      activeTab = 'tasks';
      tabTasks.className = 'border-b-2 border-sky-500 px-4 py-2.5 text-[12.5px] font-bold text-sky-600 dark:text-sky-400';
      tabActivity.className = 'border-b-2 border-transparent px-4 py-2.5 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200';
      document.getElementById('skcore-drawer-add-box').classList.remove('hidden');
      renderTasks();
    });

    tabActivity?.addEventListener('click', () => {
      activeTab = 'activity';
      tabActivity.className = 'border-b-2 border-sky-500 px-4 py-2.5 text-[12.5px] font-bold text-sky-600 dark:text-sky-400';
      tabTasks.className = 'border-b-2 border-transparent px-4 py-2.5 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200';
      document.getElementById('skcore-drawer-add-box').classList.add('hidden');
      renderActivity();
    });

    // Form submission
    document.getElementById('skcore-drawer-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('skcore-drawer-input');
      const val = input.value.trim();
      if (!val) return;
      if (window.SKCoreBus) {
        window.SKCoreBus.addQuickTask(val, 'normal', 'Task');
      }
      input.value = '';
      renderTasks();
    });

    // Bus listeners
    if (window.SKCoreBus) {
      window.SKCoreBus.on('TASK_ADDED', () => renderTasks());
      window.SKCoreBus.on('TASK_UPDATED', () => renderTasks());
      window.SKCoreBus.on('ACTIVITY_LOGGED', () => {
        if (activeTab === 'activity') renderActivity();
      });
    }
  }

  function isOpen() {
    return drawerEl && !drawerEl.classList.contains('translate-x-full');
  }

  function open() {
    if (!drawerEl) init();
    backdropEl.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdropEl.style.opacity = '1';
      drawerEl.classList.remove('translate-x-full');
    });
    if (activeTab === 'tasks') renderTasks();
    else renderActivity();
  }

  function close() {
    if (!drawerEl) return;
    backdropEl.style.opacity = '0';
    drawerEl.classList.add('translate-x-full');
    setTimeout(() => {
      backdropEl.classList.add('hidden');
    }, 300);
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function renderTasks() {
    const container = document.getElementById('skcore-drawer-content');
    if (!container || !window.SKCoreBus) return;

    const tasks = window.SKCoreBus.getQuickTasks();
    const completed = tasks.filter(t => t.status === 'done').length;
    const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

    // Update progress bar
    const pText = document.getElementById('skcore-drawer-progress-text');
    const pFill = document.getElementById('skcore-drawer-progress-fill');
    if (pText) pText.textContent = `${pct}%`;
    if (pFill) pFill.style.width = `${pct}%`;

    container.innerHTML = '';

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div class="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 mb-3">
            <span class="material-symbols-outlined text-[24px]">assignment</span>
          </div>
          <div class="font-display font-bold text-[14px] text-zinc-800 dark:text-zinc-200">No Active Tasks</div>
          <p class="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
            Backlog is clean. Add a task above or open full QuestBoard to manage your sprint!
          </p>
        </div>
      `;
      return;
    }

    tasks.forEach(task => {
      const isDone = task.status === 'done';
      const isProg = task.status === 'in-progress';

      const card = document.createElement('div');
      card.className = `group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all duration-150 ${
        isDone
          ? 'border-zinc-200/60 bg-zinc-50/50 opacity-60 dark:border-zinc-800/50 dark:bg-zinc-900/30'
          : isProg
          ? 'border-sky-500/40 bg-sky-500/5 dark:border-sky-500/30 dark:bg-sky-500/10'
          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700'
      }`;

      const badgeColor =
        task.priority === 'critical'
          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : task.priority === 'high'
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'bg-zinc-200/60 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';

      card.innerHTML = `
        <div class="mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors ${
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : isProg
            ? 'border-sky-500 bg-sky-500/20 text-sky-500'
            : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400'
        }">
          <span class="material-symbols-outlined text-[14px]">${isDone ? 'check' : isProg ? 'hourglass_top' : ''}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${badgeColor}">${task.priority}</span>
            <span class="text-[10px] text-zinc-400">${task.category}</span>
          </div>
          <div class="mt-1 text-[12.5px] font-medium leading-snug ${isDone ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}">
            ${task.title}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        window.SKCoreBus.toggleTaskStatus(task.id);
        renderTasks();
      });

      container.appendChild(card);
    });
  }

  function renderActivity() {
    const container = document.getElementById('skcore-drawer-content');
    if (!container || !window.SKCoreBus) return;

    const feed = window.SKCoreBus.getActivityFeed();
    container.innerHTML = '';

    if (feed.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-[12px] text-zinc-400">
          No logged activity yet. Operations in ATS, Forge, or QuestBoard will stream here.
        </div>
      `;
      return;
    }

    feed.forEach(item => {
      const card = document.createElement('div');
      card.className = 'flex items-start gap-3 rounded-xl border border-zinc-200/60 bg-white p-3 text-[12px] dark:border-zinc-800/60 dark:bg-zinc-900/40';

      const icon =
        item.source === 'quest' ? 'assignment' :
        item.source === 'ats' ? 'auto_fix_high' :
        item.source === 'forge' ? 'precision_manufacturing' :
        item.source === 'pipeline' ? 'inventory_2' : 'info';

      card.innerHTML = `
        <div class="grid size-7 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-medium text-zinc-800 dark:text-zinc-200">${item.text}</div>
          <div class="mt-0.5 text-[10.5px] font-mono text-zinc-400">${window.SKCoreBus.formatTimeAgo(item.time)}</div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SKCoreDrawer = {
    open,
    close,
    toggle,
    renderTasks,
    renderActivity
  };

})(window);
