/**
 * SKCore Tools Suite — Spotlight Command Palette (Ctrl+K)
 * Universal launcher & quick-action execution engine.
 */
(function(window) {
  'use strict';

  const COMMANDS = [
    // Navigation
    { id: 'nav-ats', title: 'Open ATS (Asset Transformation Service)', subtitle: 'Inspect, downscale & optimize textures, audio and 3D models', icon: 'auto_fix_high', category: 'Navigation', url: './ATS/index.html' },
    { id: 'nav-quest', title: 'Open QuestBoard (Task & Milestone Hub)', subtitle: 'Manage sprint backlog, quest dependencies and developer tasks', icon: 'assignment', category: 'Navigation', url: './questboard/dist/index.html' },
    { id: 'nav-forge', title: 'Open SKCore Forge (Build Pipeline)', subtitle: 'Telemetry dial, git branches and multi-platform compilation', icon: 'precision_manufacturing', category: 'Navigation', url: './Forge/index.html' },
    { id: 'nav-profiler', title: 'Open OmniProfiler (Diagnostics & Hitches)', subtitle: 'Real-time frame-time budgets, hitch histogram and CPU spikes', icon: 'speed', category: 'Navigation', url: './profiler/dist/index.html' },
    { id: 'nav-gamefeel', title: 'Open GameFeel Lab (Springs & Physics)', subtitle: 'Squash, stretch, camera shake, hitstop and easing curves', icon: 'sports_esports', category: 'Navigation', url: './gamefeel-lab/index.html' },
    { id: 'nav-vfx', title: 'Open Slash Forge VFX Studio', subtitle: '3D blade trails, glowing arcs and projectile sparks', icon: 'flare', category: 'Navigation', url: './Weapon Slash Effect Generator/3D-Melee-Trail-Slash-VFX-Studio.html' },
    { id: 'nav-verlet', title: 'Open Verlet Physics Studio', subtitle: 'Interactive elastic rope, cloth grid and soft-body simulation', icon: 'gesture', category: 'Navigation', url: './Verlet Studio/index.html' },
    { id: 'nav-lut', title: 'Open Cinematic LUT Studio', subtitle: '3D color grading cubes, chromatic prism and grading wheels', icon: 'palette', category: 'Navigation', url: './lut-studio/index.html' },
    { id: 'nav-loc', title: 'Open Localization Tools', subtitle: 'Multi-lingual glossary, term consistency and audio bindings', icon: 'translate', category: 'Navigation', url: './Localization Tools/index.html' },

    // Quick Actions
    { id: 'act-new-task', title: 'Create New Task in QuestBoard', subtitle: 'Quickly log a feature, bug or milestone without leaving current tool', icon: 'add_task', category: 'Quick Action', action: () => promptNewTask() },
    { id: 'act-drawer', title: 'Toggle Universal Quest Drawer (Press [Q])', subtitle: 'Open slide-over task list for immediate backlog check-off', icon: 'view_sidebar', category: 'Quick Action', action: () => window.SKCoreDrawer && window.SKCoreDrawer.toggle() },
    { id: 'act-theme', title: 'Toggle Dark / Light Mode (Bedside Lamp)', subtitle: 'Pull the vintage bedside lamp chain to switch theme across suite', icon: 'lightbulb', category: 'Quick Action', action: () => toggleTheme() },
    { id: 'act-switch-proj', title: 'Change Active Unity Project', subtitle: 'Switch target repository and re-synchronize global telemetry', icon: 'folder_open', category: 'Quick Action', action: () => promptSwitchProject() },
    { id: 'act-export-bundle', title: 'Export Unified Gameplay Bundle', subtitle: 'Package GameFeel curves, slash trail mesh and verlet parameters', icon: 'inventory_2', category: 'Pipeline', action: () => exportGameplayBundle() }
  ];

  let modalEl = null;
  let inputEl = null;
  let resultsEl = null;
  let activeIndex = 0;
  let filteredCommands = [];

  function init() {
    createPaletteDOM();
    bindKeyboard();
  }

  function createPaletteDOM() {
    if (document.getElementById('skcore-palette-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'skcore-palette-backdrop';
    backdrop.className = 'fixed inset-0 z-[9999] hidden items-start justify-center bg-black/60 pt-20 backdrop-blur-md transition-opacity duration-200';
    backdrop.style.opacity = '0';

    backdrop.innerHTML = `
      <div id="skcore-palette-panel" class="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 p-0 shadow-2xl transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]">
        <!-- Search Header -->
        <div class="flex items-center gap-3 border-b border-zinc-200/80 px-4 py-3.5 dark:border-zinc-800">
          <span class="material-symbols-outlined text-zinc-400 dark:text-zinc-500">search</span>
          <input
            id="skcore-palette-input"
            type="text"
            placeholder="Type a command or search tools (e.g. 'vfx', 'new task', 'theme')..."
            autocomplete="off"
            spellcheck="false"
            class="w-full bg-transparent text-[15px] font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <kbd class="hidden rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 sm:inline-block">ESC</kbd>
        </div>

        <!-- Command List -->
        <div id="skcore-palette-results" class="max-h-[380px] overflow-y-auto p-2">
          <!-- Dynamically populated -->
        </div>

        <!-- Footer Bar -->
        <div class="flex items-center justify-between border-t border-zinc-200/80 bg-zinc-50/80 px-4 py-2.5 text-[11.5px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <div class="flex items-center gap-3">
            <span><kbd class="font-mono text-[10.5px] font-semibold">↑</kbd> <kbd class="font-mono text-[10.5px] font-semibold">↓</kbd> to navigate</span>
            <span><kbd class="font-mono text-[10.5px] font-semibold">ENTER</kbd> to select</span>
            <span><kbd class="font-mono text-[10.5px] font-semibold">Q</kbd> to toggle quest drawer</span>
          </div>
          <div class="font-medium">
            <span class="text-sky-600 dark:text-sky-400">SKCore</span> Mission Control
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    modalEl = backdrop;
    inputEl = document.getElementById('skcore-palette-input');
    resultsEl = document.getElementById('skcore-palette-results');

    // Close on clicking backdrop
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    // Handle filter typing
    inputEl.addEventListener('input', (e) => {
      render(e.target.value);
    });

    // Handle key navigation
    inputEl.addEventListener('keydown', onKeyDown);
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }

      // [Q] for drawer (when not inside an input)
      if (e.key.toLowerCase() === 'q' && !['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
        if (!isOpen()) {
          e.preventDefault();
          window.SKCoreDrawer && window.SKCoreDrawer.toggle();
        }
      }
    });
  }

  function isOpen() {
    return modalEl && !modalEl.classList.contains('hidden');
  }

  function open() {
    if (!modalEl) init();
    modalEl.classList.remove('hidden');
    modalEl.classList.add('flex');
    requestAnimationFrame(() => {
      modalEl.style.opacity = '1';
      inputEl.value = '';
      inputEl.focus();
      render('');
    });
  }

  function close() {
    if (!modalEl) return;
    modalEl.style.opacity = '0';
    setTimeout(() => {
      modalEl.classList.add('hidden');
      modalEl.classList.remove('flex');
    }, 150);
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function render(query) {
    const q = query.trim().toLowerCase();
    filteredCommands = COMMANDS.filter(cmd => {
      if (!q) return true;
      return cmd.title.toLowerCase().includes(q) ||
             cmd.subtitle.toLowerCase().includes(q) ||
             cmd.category.toLowerCase().includes(q);
    });

    activeIndex = 0;
    resultsEl.innerHTML = '';

    if (filteredCommands.length === 0) {
      resultsEl.innerHTML = `
        <div class="p-8 text-center text-[13px] text-zinc-500">
          No commands matching <span class="font-semibold text-zinc-700 dark:text-zinc-300">"${query}"</span>
        </div>
      `;
      return;
    }

    let lastCategory = '';
    filteredCommands.forEach((cmd, idx) => {
      if (cmd.category !== lastCategory) {
        lastCategory = cmd.category;
        const catHeader = document.createElement('div');
        catHeader.className = 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500';
        catHeader.textContent = lastCategory;
        resultsEl.appendChild(catHeader);
      }

      const item = document.createElement('div');
      item.className = `group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${
        idx === activeIndex
          ? 'bg-sky-500/10 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100'
          : 'hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/80'
      }`;
      item.dataset.index = idx;

      item.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="grid size-8 shrink-0 place-items-center rounded-lg ${
            idx === activeIndex
              ? 'bg-sky-500 text-white'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400 group-hover:text-sky-500'
          }">
            <span class="material-symbols-outlined text-[19px]">${cmd.icon}</span>
          </div>
          <div class="min-w-0 truncate">
            <div class="text-[13.5px] font-semibold truncate ${idx === activeIndex ? 'text-sky-600 dark:text-sky-300' : 'text-zinc-800 dark:text-zinc-200'}">
              ${highlightMatch(cmd.title, q)}
            </div>
            <div class="text-[11.5px] text-zinc-400 truncate dark:text-zinc-500">
              ${cmd.subtitle}
            </div>
          </div>
        </div>
        <div class="shrink-0 text-[11px] font-mono text-zinc-400">
          ${idx === activeIndex ? '↵ Enter' : ''}
        </div>
      `;

      item.addEventListener('mouseenter', () => {
        activeIndex = idx;
        updateActiveItem();
      });

      item.addEventListener('click', () => {
        execute(cmd);
      });

      resultsEl.appendChild(item);
    });
  }

  function updateActiveItem() {
    const items = resultsEl.querySelectorAll('[data-index]');
    items.forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      const isAct = idx === activeIndex;
      if (isAct) {
        el.className = 'group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-100 bg-sky-500/10 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.className = 'group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-100 hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/80';
      }
    });
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredCommands.length) {
        activeIndex = (activeIndex + 1) % filteredCommands.length;
        updateActiveItem();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredCommands.length) {
        activeIndex = (activeIndex - 1 + filteredCommands.length) % filteredCommands.length;
        updateActiveItem();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[activeIndex]) {
        execute(filteredCommands[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function execute(cmd) {
    close();
    if (cmd.url) {
      window.location.href = cmd.url;
    } else if (typeof cmd.action === 'function') {
      cmd.action();
    }
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return text.substring(0, idx) +
           '<span class="underline decoration-sky-400 font-bold">' + text.substring(idx, idx + query.length) + '</span>' +
           text.substring(idx + query.length);
  }

  // Action Helpers
  function promptNewTask() {
    const title = window.prompt('Enter new task description for QuestBoard:');
    if (title && title.trim()) {
      if (window.SKCoreBus) {
        window.SKCoreBus.addQuickTask(title.trim(), 'normal', 'Development');
      }
      if (window.SKCoreDrawer) {
        window.SKCoreDrawer.open();
      }
    }
  }

  function toggleTheme() {
    // Triggers hub lamp pull or updates localStorage
    const saved = localStorage.getItem('skcore_theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('skcore_theme', saved);
    if (saved === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    // Play bedside lamp sound if present
    if (typeof window.triggerLampPull === 'function') {
      window.triggerLampPull();
    }
  }

  function promptSwitchProject() {
    const current = window.SKCoreBus ? window.SKCoreBus.getActiveProject().name : 'fe-gb-starter_unity';
    const next = window.prompt('Enter Unity project directory name or path:', current);
    if (next && next.trim() && next.trim() !== current) {
      if (window.SKCoreBus) {
        window.SKCoreBus.setActiveProject({ name: next.trim() });
      }
    }
  }

  function exportGameplayBundle() {
    const bundle = {
      bundleVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      gameFeel: {
        springStiffness: 140,
        springDamping: 12,
        hitStopDurationMs: 45,
        cameraShakeTrauma: 0.75
      },
      slashVFX: {
        bladeLength: 2.2,
        arcAngleDeg: 160,
        glowColor: '#38bdf8',
        emissionIntensity: 4.5
      },
      verletPhysics: {
        clothSubsteps: 8,
        gravity: [0, -9.81, 0],
        stiffness: 0.92
      }
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKCore_GameplayPresetBundle.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.SKCoreBus) {
      window.SKCoreBus.logActivity('Exported GameplayPresetBundle.json', 'pipeline');
    }
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SKCorePalette = {
    open,
    close,
    toggle
  };

})(window);
