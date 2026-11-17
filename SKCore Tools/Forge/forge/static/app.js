const GAUGE_C = 2 * Math.PI * 52;
const ui = {
  view: "yard",
  projectId: null,
  buildId: null,
  target: "AOS",
  bootMinUntil: Date.now() + 1200,
  bootMaxUntil: Date.now() + 10000,
  bootDismissed: false,
  repos: [],
  repoKey: null,
  ghCommits: [],
  ghError: "",
  reposLoaded: false,
  commitsFor: null,
  commits: [],
  reply: "",
  logStick: true,
  forceView: false,
};
let S = { scan: { running: true, percent: 0, stage: "Starting", transcript: [] }, projects: [], builds: [] };
let displayed = 0;

const $ = (id) => document.getElementById(id);
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
function toast(message) {
  const el = $("toast");
  el.hidden = false;
  el.textContent = message;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 4600);
}
async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
  if (!res.ok && data.ok !== false) data.ok = false;
  if (!res.ok && !data.error) data.error = res.statusText;
  return data;
}
function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function lineClass(line) {
  if (/error|failed|exception/i.test(line)) return "bad";
  if (/success|dry run|finished/i.test(line)) return "good";
  if (/warning|dry-run|not installed/i.test(line)) return "warn";
  return "";
}
function projectById(id) {
  return (S.projects || []).find((p) => p.id === id) || null;
}
function buildById(id) {
  return (S.builds || []).find((b) => b.id === id) || null;
}
function activeBuild() {
  return (S.builds || []).find((b) => b.status === "running" || b.status === "queued") || null;
}
function bootVisible() {
  if (ui.bootDismissed) return false;
  if (Date.now() >= ui.bootMaxUntil) return false;
  const scan = S.scan || {};
  if (scan.running) return true;
  if (scan.finishedAt && Date.now() >= ui.bootMinUntil) return false;
  return Date.now() < ui.bootMinUntil;
}
function gaugeTarget() {
  if (bootVisible() || (S.scan && S.scan.running)) return S.scan.percent || 0;
  const build = buildById(ui.buildId) || activeBuild();
  if (build && (build.status === "running" || build.status === "queued" || !build.finishedAt)) return build.percent || 0;
  return build ? build.percent || 0 : 0;
}
function tick() {
  const target = gaugeTarget();
  const live = bootVisible() || (S.scan && S.scan.running) || (activeBuild() && activeBuild().status === "running");
  displayed = live ? displayed + (target - displayed) * 0.14 : target;
  document.querySelectorAll("[data-gauge]").forEach((el) => {
    const arc = el.querySelector(".g-value");
    if (arc) arc.style.strokeDashoffset = String(GAUGE_C * (1 - Math.max(0, Math.min(100, displayed)) / 100));
    const num = el.querySelector("[data-gauge-num]");
    if (num) num.textContent = String(Math.round(displayed));
  });
  requestAnimationFrame(tick);
}

function markSvg() {
  return `<span class="brand-icon"><span class="material-symbols-outlined" style="font-size: 1.1rem;">deployed_code</span></span>`;
}

function renderTop() {
  const gh = S.github || {};
  const tg = S.telegram || {};
  const scan = S.scan || {};
  const settings = S.settings || {};
  const live = activeBuild();

  const unityOk = scan.cliAvailable || (scan.editors && scan.editors.length > 0) || Boolean(settings.unityBin);
  const unityClass = unityOk ? "on" : "warn";
  const unityText = scan.cliAvailable
    ? (scan.cliVersion || "ready")
    : (scan.editors && scan.editors.length > 0)
    ? `${scan.editors.length} editor(s)`
    : settings.unityBin
    ? "configured"
    : "not found";

  const ghConnected = gh.connected || Boolean(settings.github_token) || Boolean(settings.githubConnected);
  const ghClass = ghConnected ? "on" : "";
  const ghText = ghConnected
    ? ((gh.profile && gh.profile.login) || settings.githubUser || "connected")
    : "off";

  const tgConnected = tg.polling || tg.connected || Boolean(settings.telegram_bot_token);
  const tgClass = tg.polling ? "on" : tgConnected ? "warn" : "";
  const tgText = tg.polling ? "listening" : tgConnected ? "ready" : "off";

  const buildClass = live ? "run" : "warn";
  const buildText = live
    ? `${live.projectName || "Build"} ${live.targetAlias || ""} ${Math.round(live.percent || 0)}%`
    : "idle";
  const html = `
    <div style="display:flex;align-items:center;gap:10px;">
      <a href="../../../index.html" class="pill" style="text-decoration:none;border-color:rgba(56,189,248,0.3);color:var(--cyan);font-weight:600;"><span class="material-symbols-outlined" style="font-size:0.95rem;">arrow_back</span> Hub Deck</a>
      <div class="brand" data-act="nav" data-view="yard">${markSvg()}<div><strong>SKCore FORGE</strong><em>Foundry</em></div></div>
    </div>
    <div class="pills">
      <button class="pill ${unityClass}" data-act="nav" data-view="settings"><i></i><b>UNITY</b> ${esc(unityText)}</button>
      <button class="pill ${ghClass}" data-act="nav" data-view="github"><i></i><b>GITHUB</b> ${esc(ghText)}</button>
      <button class="pill ${tgClass}" data-act="nav" data-view="telegram"><i></i><b>TELEGRAM</b> ${esc(tgText)}</button>
      <button class="pill ${live ? buildClass : ""}" data-act="open-build" data-id="${live ? live.id : ""}"><i></i><b>BUILD</b> ${esc(buildText)}</button>
    </div>`;
  const el = $("top");
  if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
}

function renderNav() {
  const items = [
    ["yard", "dashboard", "Projects", "01"],
    ["builds", "history", "Builds", "02"],
    ["github", "code", "GitHub", "03"],
    ["telegram", "send", "Telegram", "04"],
    ["settings", "settings", "Settings", "05"],
  ];
  const html = items.map(([id, icon, label, n]) =>
    `<button type="button" data-act="nav" data-view="${id}" class="${ui.view === id ? "is-on" : ""}">
      <span style="display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:1rem;">${icon}</span> ${label}</span>
      <small>${n}</small>
    </button>`
  ).join("") + `<div class="nav-foot"><span class="mono">unity --projects</span> scan<br/>AOS = Android build</div>`;
  const el = $("nav");
  if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
}

function bannerHtml() {
  const scan = S.scan || {};
  const projects = S.projects || [];
  if (!scan.finishedAt) return "";
  const fromCli = projects.filter((p) => p.source === "unity-cli").length;
  if (scan.cliAvailable) {
    return `<div class="banner ok"><strong><span class="material-symbols-outlined" style="font-size:1rem;">check_circle</span> Unity CLI ${esc(scan.cliVersion || "")} Available</strong><span>Scanned via <em>unity --projects</em> (${fromCli} CLI projects detected).</span></div>`;
  }
  return `<div class="banner warn"><strong><span class="material-symbols-outlined" style="font-size:1rem;">warning</span> Unity CLI is not on PATH</strong><span>Folder scan mode active. Builds will run dry-run mode until Unity CLI is located.</span></div>`;
}

function stamp(p) {
  const b = p.activeBuild || p.lastBuild;
  if (!b) return "";
  const cls = b.status === "succeeded" ? "ok" : b.status === "failed" ? "bad" : b.status === "running" || b.status === "queued" ? "run" : "dry";
  const label = b.status === "dry_run" ? "dry run" : b.status;
  return `<span class="stamp ${cls}">${esc(b.targetAlias || "")} ${esc(label)}</span>`;
}

function cardHtml(p) {
  const git = p.git || {};
  const isRemote = Boolean(p.remoteOnly || p.source === "github");
  const source = isRemote ? "GitHub Remote" : p.source === "unity-cli" ? "Unity CLI" : p.source === "hub" ? "Hub" : "Folder";
  const sourceIcon = isRemote ? "cloud" : p.source === "unity-cli" ? "terminal" : "folder";
  const cover = p.cover
    ? `style="background-image:url('${esc(p.cover)}')"`
    : "";
  const active = p.activeBuild;
  const bar = active ? `<div class="card-bar"><span style="width:${Math.max(4, Math.round(active.percent || 0))}%"></span></div>` : "";
  const badgeClass = isRemote ? "remote" : "local";
  return `<article class="card ${isRemote ? "is-remote" : "is-local"} ${ui.projectId === p.id ? "is-on" : ""}" data-act="select-project" data-id="${esc(p.id)}">
    <div class="cover ${p.cover ? "" : "cover-fallback"}" ${cover}>
      <span class="slate">${esc(p.version || "unknown")}</span>
      <span class="src ${badgeClass}"><span class="material-symbols-outlined" style="font-size:0.75rem;vertical-align:-1px;margin-right:3px;">${sourceIcon}</span>${source}</span>
      ${p.sample ? `<span class="sample">Sample</span>` : ""}
    </div>
    <div class="card-body">
      <div class="card-title"><h3>${esc(p.name)}</h3>${stamp(p)}</div>
      <p class="path" title="${esc(p.path)}">${esc(p.path)}</p>
      <p class="meta"><span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:-1px;">account_tree</span> ${esc(git.branch || "staging")} · <span class="mono">${esc(git.short || "remote")}</span> ${isRemote ? "" : `· ${p.sceneCount || 0} scene${p.sceneCount === 1 ? "" : "s"}`}</p>
      <p class="subject">${esc(git.subject || "No commits yet")}</p>
      <div class="card-actions">
        <button type="button" class="btn primary" data-act="build-aos" data-id="${esc(p.id)}"><span class="material-symbols-outlined" style="font-size:0.9rem;">play_arrow</span> Build AOS</button>
        <button type="button" class="btn ghost" data-act="open-commits" data-id="${esc(p.id)}"><span class="material-symbols-outlined" style="font-size:0.9rem;">commit</span> Commit</button>
      </div>
      ${bar}
    </div>
  </article>`;
}

function yardHtml() {
  const scan = S.scan || {};
  const projects = S.projects || [];
  const filter = ui.yardFilter || "all";
  const scanning = scan.running && ui.bootDismissed;
  
  const localProjects = projects.filter((p) => !p.remoteOnly && p.source !== "github");
  const remoteProjects = projects.filter((p) => p.remoteOnly || p.source === "github");

  let contentHtml = "";
  if (!projects.length) {
    contentHtml = `<div class="panel"><h2>No Unity projects yet</h2><p class="note">Add a folder that contains ProjectSettings/ProjectVersion.txt, or connect GitHub to view remote repositories.</p></div>`;
  } else if (filter === "local") {
    contentHtml = `<div class="section-header">
        <h2><span class="material-symbols-outlined icon-cyan">laptop</span> Local Workstation Projects</h2>
        <span class="badge-count">${localProjects.length} local</span>
      </div>
      <div class="grid">${localProjects.length ? localProjects.map(cardHtml).join("") : `<p class="note">No local projects discovered.</p>`}</div>`;
  } else if (filter === "remote") {
    contentHtml = `<div class="section-header">
        <h2><span class="material-symbols-outlined icon-cyan">cloud</span> GitHub Remote Repositories</h2>
        <span class="badge-count">${remoteProjects.length} remote</span>
      </div>
      <div class="grid">${remoteProjects.length ? remoteProjects.map(cardHtml).join("") : `<p class="note">No GitHub remote repositories found.</p>`}</div>`;
  } else {
    contentHtml = `
      ${localProjects.length ? `
        <div class="section-header">
          <h2><span class="material-symbols-outlined icon-cyan">laptop</span> Local Workstation Projects</h2>
          <span class="badge-count">${localProjects.length} local</span>
        </div>
        <div class="grid">${localProjects.map(cardHtml).join("")}</div>
      ` : ""}
      ${remoteProjects.length ? `
        <div class="section-header" style="${localProjects.length ? "margin-top:28px;" : ""}">
          <h2><span class="material-symbols-outlined icon-cyan">cloud</span> GitHub Remote Repositories</h2>
          <span class="badge-count">${remoteProjects.length} remote</span>
        </div>
        <div class="grid">${remoteProjects.map(cardHtml).join("")}</div>
      ` : ""}
    `;
  }

  const transcript = (scan.transcript || []).join("\n");
  return `<div class="yard-head">
      <div><p class="eyebrow">Project Foundry</p><h1>Unity Projects</h1></div>
      <div class="yard-actions">
        <div class="filter-pills">
          <button type="button" class="pill-btn ${filter === "all" ? "is-on" : ""}" data-act="set-yard-filter" data-filter="all">All (${projects.length})</button>
          <button type="button" class="pill-btn ${filter === "local" ? "is-on" : ""}" data-act="set-yard-filter" data-filter="local"><span class="material-symbols-outlined" style="font-size:0.8rem;">laptop</span> Local (${localProjects.length})</button>
          <button type="button" class="pill-btn ${filter === "remote" ? "is-on" : ""}" data-act="set-yard-filter" data-filter="remote"><span class="material-symbols-outlined" style="font-size:0.8rem;">cloud</span> Remote (${remoteProjects.length})</button>
        </div>
        <button type="button" class="btn primary" data-act="rescan" ${scanning ? "disabled" : ""}>${scanning ? "Scanning..." : "Rescan"}</button>
      </div>
    </div>
    ${bannerHtml()}
    ${contentHtml}
    <details class="transcript" style="margin-top:24px;"><summary>Scan Transcript</summary><pre>${esc(transcript || "Scan has finished.")}</pre></details>`;
}

function buildsHtml() {
  const builds = S.builds || [];
  const rows = builds.map((b) => {
    const cloudBtn = b.downloadUrl
      ? `<a href="${esc(b.downloadUrl)}" target="_blank" rel="noopener" class="btn small primary" style="margin-left:auto;text-decoration:none;" onclick="event.stopPropagation()"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">cloud_download</span> Download APK</a>`
      : "";
    return `<div class="build-row" style="display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:6px;background:var(--bg-surface-2);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;" data-act="open-build" data-id="${esc(b.id)}">
      <span class="tag ${esc(b.status)}">${esc(b.status)}</span>
      <span style="flex:1;"><strong>${esc(b.projectName || "Project")}</strong> ${esc(b.targetAlias || "")} · <span class="mono">${esc(b.shortSha || "HEAD")}</span><small style="display:block;color:var(--text-muted);">${esc(b.stage || "")} · ${esc(b.commitSubject || "")}</small></span>
      ${cloudBtn}
      <small class="mono" style="color:var(--text-muted);margin-left:8px;">${Math.round(b.percent || 0)}% · ${esc(ago(b.finishedAt || b.createdAt))}</small>
    </div>`;
  }).join("");
  return `<div class="page-head"><div><p class="eyebrow">Execution Logs</p><h1>Build History</h1></div></div>
    <div class="panel build-list">${rows || `<p class="note">No builds yet. Trigger a build from a project card or using the command prompt.</p>`}</div>`;
}

function githubHtml() {
  const gh = S.github || {};
  if (!gh.connected) {
    return `<div class="page-head"><div><p class="eyebrow">Account Integration</p><h1>Connect GitHub</h1></div></div>
      <div class="panel">
        <ol class="steps" style="line-height:1.8;padding-left:18px;margin-bottom:14px;color:var(--text-muted);">
          <li><a href="https://github.com/settings/tokens/new?scopes=repo&description=FORGE%20Unity%20builds" target="_blank" rel="noopener" style="color:var(--cyan)">Create a classic Personal Access Token</a> with <em>repo</em> scope.</li>
          <li>Paste it here. Token remains local in settings and only communicates with api.github.com.</li>
          <li>Enables direct commit search and worktree checkout for SHA builds.</li>
        </ol>
        <form data-form="github">
          <label class="field">Personal Access Token
            <input type="password" name="token" autocomplete="off" placeholder="ghp_… or github_pat_…" />
          </label>
          <button class="btn primary" type="submit">Connect Account</button>
        </form>
        ${ui.ghError ? `<p class="note" style="color:var(--rose);margin-top:8px;">${esc(ui.ghError)}</p>` : ""}
      </div>`;
  }
  const profile = gh.profile || {};
  const avatar = profile.avatar && profile.avatar.startsWith("https://")
    ? `<img src="${esc(profile.avatar)}" alt="" style="width:36px;height:36px;border-radius:4px;" />`
    : `<div class="avatar" style="width:36px;height:36px;border-radius:4px;background:var(--bg-surface-3);display:flex;align-items:center;justify-content:center;font-weight:bold;">${esc((profile.login || "?").slice(0, 1))}</div>`;
  const repos = ui.repos.map((r) => {
    const key = `${r.owner}/${r.name}`;
    return `<button type="button" class="repo ${ui.repoKey === key ? "is-on" : ""}" data-act="gh-repo" data-owner="${esc(r.owner)}" data-repo="${esc(r.name)}" style="width:100%;text-align:left;padding:8px;margin-bottom:4px;background:var(--bg-surface-2);border:1px solid var(--border-subtle);border-radius:4px;cursor:pointer;">
      <strong style="color:#fff;display:block;">${esc(r.fullName)}</strong><small style="color:var(--text-muted);font-family:var(--font-mono);">${r.private ? "private" : "public"} · ${esc(r.language || "—")} · ${esc(ago(r.updatedAt))}</small>
    </button>`;
  }).join("");
  const commits = ui.ghCommits.map((c) => `<div class="commit">
      <div><b>${esc(c.short)}</b><span>${esc(c.subject)}</span><small>${esc(c.author)} · ${esc(ago(c.date))}</small></div>
      <button type="button" class="btn small primary" data-act="fill-command" data-text="BUILD ${esc(ui.target)} commit ${esc(c.sha)}">Build ${esc(ui.target)}</button>
    </div>`).join("");
  return `<div class="page-head"><div><p class="eyebrow">Integration Active</p><h1>GitHub Account</h1></div>
      <button type="button" class="btn ghost" data-act="gh-off">Disconnect</button></div>
    <div class="panel profile" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">${avatar}<div><strong style="color:#fff;">${esc(profile.name || profile.login)}</strong><div class="path">${esc(profile.login || "")}</div></div></div>
    <div class="split">
      <div class="panel"><h2>Repositories</h2>${repos || `<p class="note">${esc(ui.ghError || "Loading repositories…")}</p>`}</div>
      <div class="panel"><h2>Commits</h2>${ui.repoKey ? commits || `<p class="note">No commits, or still loading.</p>` : `<p class="note">Select a repository to inspect remote commit SHAs.</p>`}</div>
    </div>`;
}

function telegramHtml() {
  const tg = S.telegram || {};
  const settings = S.settings || {};
  const thread = [...(S.commandLog || [])].reverse().slice(-18).map((entry) => `
    <div class="bubble user" style="margin-bottom:6px;padding:6px 10px;background:var(--bg-surface-3);border-radius:4px;"><span class="who" style="font-family:var(--font-mono);font-size:10px;color:var(--cyan);display:block;">${esc(entry.source === "telegram" ? "telegram" : "you")}</span>${esc(entry.text)}</div>
    <div class="bubble bot" style="margin-bottom:10px;padding:6px 10px;background:var(--bg-surface-2);border:1px solid var(--border-subtle);border-radius:4px;"><span class="who" style="font-family:var(--font-mono);font-size:10px;color:var(--emerald);display:block;">forge</span>${esc(entry.reply || "")}</div>
  `).join("");
  const connect = tg.connected
    ? `<p class="note">Bot is ${tg.polling ? "listening for Telegram commands" : "saved"}. ${tg.error ? esc(tg.error) : ""}</p>
       <button type="button" class="btn ghost" data-act="tg-off" style="margin-top:8px;">Disconnect bot</button>`
    : `<form data-form="telegram">
        <label class="field">Bot Token from BotFather
          <input type="password" name="token" autocomplete="off" placeholder="123456789:AA…" />
        </label>
        <button class="btn primary" type="submit">Connect Bot</button>
      </form>`;
  return `<div class="page-head"><div><p class="eyebrow">Remote Automation</p><h1>Telegram Bot</h1></div></div>
    <div class="split">
      <div class="panel">
        <p class="eyebrow">Pair Code</p>
        <div class="pair" style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--cyan);letter-spacing:0.1em;margin:8px 0;">${esc(settings.pairCode || tg.pairCode || "------")}</div>
        <p class="note">In Telegram, send <b>/pair ${esc(settings.pairCode || "")}</b> before running build commands.</p>
        <button type="button" class="btn ghost" data-act="regen-pair" style="margin-top:8px;">Generate New Code</button>
        <div style="height:14px"></div>
        ${connect}
        <p class="note" style="margin-top:8px;">Paired chats: ${(settings.telegramChats || tg.chats || []).length}</p>
      </div>
      <div class="phone" style="background:var(--bg-surface-1);border:1px solid var(--border-subtle);border-radius:6px;padding:12px;">
        <div class="thread" style="height:240px;overflow-y:auto;margin-bottom:10px;">${thread || `<div class="bubble bot" style="padding:6px;color:var(--text-muted);">Type BUILD AOS commit &lt;sha&gt; to test remote dispatch.</div>`}</div>
        <form data-form="phone" style="display:flex;gap:6px;">
          <input name="text" placeholder="BUILD AOS commit …" autocomplete="off" style="flex:1;background:var(--bg-canvas);border:1px solid var(--border-subtle);color:#fff;padding:6px;border-radius:4px;font-family:var(--font-mono);" />
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>
    </div>`;
}

function settingsHtml() {
  const s = S.settings || {};
  const projects = S.projects || [];
  const options = [`<option value="">Auto Detect</option>`].concat(projects.map((p) =>
    `<option value="${esc(p.id)}" ${s.defaultProjectId === p.id ? "selected" : ""}>${esc(p.name)}</option>`
  )).join("");
  const install = S.install || {};
  return `<div class="page-head"><div><p class="eyebrow">System Configuration</p><h1>Settings</h1></div></div>
    <form class="panel" data-form="settings">
      <label class="field">Unity CLI Binary Path
        <input type="text" name="unityBin" value="${esc(s.unityBin || "")}" placeholder="unity (auto-detect from PATH)" />
      </label>
      <label class="field">Extra Scan Roots (one per line)
        <textarea name="scanRoots" rows="3" placeholder="${esc((s.defaultScanRoots || []).join("\n"))}">${esc((s.scanRoots || []).join("\n"))}</textarea>
      </label>
      <label class="field">Default Unity Project
        <select name="defaultProjectId">${options}</select>
      </label>
      <label class="field">Artifact Output Folder
        <input type="text" name="outputDir" value="${esc(s.outputDir || "")}" />
      </label>
      <label class="field">Android Export Format
        <select name="androidExport">
          <option value="apk" ${s.androidExport === "apk" ? "selected" : ""}>APK</option>
          <option value="aab" ${s.androidExport === "aab" ? "selected" : ""}>AAB</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" name="simulateIfMissing" ${s.simulateIfMissing ? "checked" : ""} /> Dry-run progress stream when Unity CLI is not found</label>
      <label class="check"><input type="checkbox" name="injectBuildScript" ${s.injectBuildScript ? "checked" : ""} /> Inject Assets/Editor/ForgeBuild.cs build script</label>
      <div class="row" style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn primary" type="submit">Save Settings</button>
        <button class="btn ghost" type="button" data-act="install-cli" ${install.running ? "disabled" : ""}>${install.running ? "Installing…" : "Install Unity CLI"}</button>
      </div>
    </form>
    <form class="panel" data-form="add-project">
      <label class="field">Add Project Directory Path
        <input type="text" name="path" placeholder="/Users/name/Projects/MyUnityGame" />
      </label>
      <button class="btn ghost" type="submit">Add &amp; Rescan</button>
    </form>`;
}

function phaseHtml(phases) {
  return `<ol class="phases">${(phases || []).map((ph) =>
    `<li class="phase ${esc(ph.state)}"><i></i><span>${esc(ph.label)}</span></li>`
  ).join("")}</ol>`;
}

function buildPanel(b) {
  const pct = Math.round(b.percent || 0);
  const log = (b.log || []).map((line) => `<div class="${lineClass(line)}">${esc(line)}</div>`).join("");
  const tone = b.status === "dry_run" ? "Dry run — simulated execution" : b.status === "succeeded" ? "Player build completed successfully" : b.status;
  return `<div class="ins-kicker">${esc(tone)}</div>
    <h2>${esc(b.projectName || "Build")} <em style="color:var(--cyan);font-style:normal;">${esc(b.targetAlias || "")}</em></h2>
    <p class="sha"><span class="mono">${esc(b.shortSha || "HEAD")}</span> · ${esc(b.commitSubject || b.target || "")}</p>
    <div class="build-meters">
      <div class="gauge-wrap gauge-sm" data-gauge style="width:50px;height:50px;">
        <svg viewBox="0 0 120 120" aria-hidden="true" class="gauge-svg">
          <circle class="g-track" cx="60" cy="60" r="52"></circle>
          <circle class="g-value" cx="60" cy="60" r="52"></circle>
        </svg>
        <div class="g-label"><strong data-gauge-num style="font-size:14px;">${pct}</strong></div>
      </div>
      <div class="meter-copy">
        <div class="stage">${esc(b.stage || "Waiting")}</div>
        <div class="molten"><span style="width:${Math.max(b.status === "queued" ? 4 : 0, pct)}%"></span></div>
        <p class="meta" style="font-size:10px;color:var(--text-subtle);">${esc(b.message || "")}</p>
      </div>
    </div>
    ${phaseHtml(b.phases)}
    <pre class="cmd">${esc(b.command || "Command appears when Unity CLI starts.")}</pre>
    <div class="log" id="build-log">${log || "<div>Waiting for log lines…</div>"}</div>
    ${b.downloadUrl ? `<div style="margin:12px 0;"><a href="${esc(b.downloadUrl)}" target="_blank" rel="noopener" class="btn primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;">cloud_download</span> Download APK Link (${esc(b.downloadUrl)})</a></div>` : ""}
    ${b.outputPath ? `<p class="path" style="margin-bottom:10px;">${esc(b.outputPath)}</p>` : ""}
    <div class="ins-actions">
      ${b.status === "running" || b.status === "queued" ? `<button type="button" class="btn danger" data-act="cancel-build" data-id="${esc(b.id)}">Cancel Build</button>` : ""}
      ${b.projectId ? `<button type="button" class="btn ghost" data-act="select-project" data-id="${esc(b.projectId)}">View Project</button>` : ""}
    </div>`;
}

function projectPanel(p) {
  const git = p.git || {};
  const targets = ["AOS", "IOS", "WIN", "MAC", "LINUX", "WEB"];
  const chips = targets.map((t) =>
    `<button type="button" class="btn small ${ui.target === t ? "is-on" : ""}" data-act="set-target" data-target="${t}">${t}</button>`
  ).join("");
  const commits = (ui.commitsFor === p.id ? ui.commits : []).map((c) => `<div class="commit">
      <div><b>${esc(c.short)}</b><span>${esc(c.subject)}</span><small style="color:var(--text-subtle);">${esc(ago(c.date))}</small></div>
      <button type="button" class="btn small primary" data-act="build-sha" data-id="${esc(p.id)}" data-sha="${esc(c.sha)}">Build ${esc(ui.target)}</button>
    </div>`).join("");
  return `<div class="ins-kicker">${esc(p.version || "Unity Project")} · ${esc(p.source)}</div>
    <h2>${esc(p.name)}</h2>
    <p class="path">${esc(p.path)}</p>
    <p class="sha"><span class="mono">${esc(git.branch || "no git")} · ${esc(git.short || "—")}</span><br/>${esc(git.subject || "")}</p>
    ${git.remote ? `<p class="path">${esc(git.remote)}</p>` : ""}
    <div class="targets">${chips}</div>
    <div class="ins-actions" style="margin-top:10px;">
      <button type="button" class="btn primary" data-act="build-target" data-id="${esc(p.id)}">Build ${esc(ui.target)} Checkout</button>
      <button type="button" class="btn ghost" data-act="fill-command" data-text="BUILD ${esc(ui.target)} commit ${esc(git.sha || "")} ${esc(p.name)}">Fill Command</button>
    </div>
    <p class="note" style="margin-top:12px">Commit builds fetch SHA into a git worktree without disturbing your open Unity Editor.</p>
    <div class="commit-list">${commits || `<p class="meta">Loading commits…</p>`}</div>`;
}

function renderInspector() {
  const el = $("inspector");
  const build = ui.buildId ? buildById(ui.buildId) : null;
  const project = ui.projectId ? projectById(ui.projectId) : null;
  let html;
  if (build && (ui.buildId || !project)) {
    html = buildPanel(build);
  } else if (project) {
    html = projectPanel(project);
  } else if (activeBuild()) {
    html = buildPanel(activeBuild());
  } else {
    html = `<div class="empty">
      <p class="eyebrow">Telemetry &amp; Dispatch</p>
      <h2 style="font-size:15px;color:#fff;margin-bottom:8px;">Ready to Build</h2>
      <p class="note" style="line-height:1.6;">Select a project card to inspect commits, target platforms, and execution parameters, or enter a command in the bottom terminal dock.</p>
    </div>`;
  }
  if (el.dataset.sig === html) return;
  const prev = $("build-log");
  const top = prev ? prev.scrollTop : 0;
  el.dataset.sig = html;
  el.innerHTML = html;
  const log = $("build-log");
  if (log) log.scrollTop = ui.logStick === false ? top : log.scrollHeight;
}

function renderChips() {
  const projects = S.projects || [];
  const first = projects[0];
  const chips = [];
  if (first && first.git && first.git.sha) {
    chips.push(`BUILD AOS commit ${first.git.sha} ${first.name}`);
    if (projects[1] && projects[1].git) chips.push(`BUILD IOS commit ${projects[1].git.short} ${projects[1].name}`);
  }
  chips.push("PROJECTS", "STATUS");
  const html = chips.map((text) =>
    `<button type="button" class="chip" data-act="fill-command" data-text="${esc(text)}">${esc(text.length > 42 ? text.slice(0, 28) + "…" : text)}</button>`
  ).join("");
  const el = $("chips");
  if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
}

function renderReply() {
  const el = $("dock-reply");
  if (!ui.reply) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = ui.reply;
}

function updateBoot() {
  const scan = S.scan || {};
  const stage = $("boot-stage");
  const bar = $("boot-bar");
  const log = $("boot-transcript");
  if (stage) stage.textContent = (scan.stage || "Scanning Unity Projects") + (scan.detail ? " — " + scan.detail : "");
  if (bar) bar.style.width = Math.max(4, scan.percent || 0) + "%";
  if (log) {
    const lines = (scan.transcript || []).slice(-8).join("\n");
    log.textContent = lines || "$ unity projects list --format json --no-pager";
    log.scrollTop = log.scrollHeight;
  }
  const boot = $("boot");
  if (!bootVisible() && boot) {
    if (!boot.classList.contains("is-hidden") && !boot.classList.contains("is-leaving")) {
      boot.classList.add("is-leaving");
      setTimeout(() => {
        boot.classList.add("is-hidden");
        boot.style.display = "none";
        boot.hidden = true;
        ui.bootDismissed = true;
      }, 350);
    } else if (boot.classList.contains("is-leaving") || boot.classList.contains("is-hidden")) {
      boot.style.display = "none";
      boot.hidden = true;
      ui.bootDismissed = true;
    }
  }
}

function updateYardScan() {
  const el = $("yard-scan");
  const scanning = ui.bootDismissed && S.scan && S.scan.running;
  el.hidden = !scanning;
  if (!scanning) return;
  $("yard-scan-stage").textContent = S.scan.stage || "Rescanning";
  $("yard-scan-bar").style.width = Math.max(4, S.scan.percent || 0) + "%";
  $("yard-scan-log").textContent = (S.scan.transcript || []).slice(-5).join("\n");
}

function renderView() {
  const el = $("view");
  if (!el) return;
  let html = "";
  if (ui.view === "yard") html = yardHtml();
  else if (ui.view === "builds") html = buildsHtml();
  else if (ui.view === "github") html = githubHtml();
  else if (ui.view === "telegram") html = telegramHtml();
  else if (ui.view === "settings") html = settingsHtml();
  else html = yardHtml();

  if (el.dataset.sig !== html) {
    el.dataset.sig = html;
    el.innerHTML = html;
  }
}

function render() {
  renderTop();
  renderNav();
  renderView();
  renderInspector();
  renderChips();
  renderReply();
  updateBoot();
  updateYardScan();
}

async function refresh() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    S = await res.json();
  } catch (err) {
    if (!S.projects || S.projects.length === 0) {
      S = {
        scan: { running: false, percent: 100, stage: "Idle (Foundry Standalone)", finishedAt: Date.now() - 1000, transcript: ["$ unity --projects --format json", "Scan complete: 2 project(s) ready."] },
        projects: [
          { id: "fe-gb-starter", name: "fe-gb-starter_unity", path: "fe-gb-starter_unity", unityVersion: "2022.3.20f1", gitBranch: "main", clean: true },
          { id: "sample-rpg", name: "SampleProject_RPG", path: "Assets/SampleRPG", unityVersion: "2021.3.18f1", gitBranch: "dev", clean: true }
        ],
        builds: [
          { id: "b-101", projectId: "fe-gb-starter", projectName: "fe-gb-starter_unity", targetAlias: "AOS", status: "success", percent: 100, durationSec: 42, finishedAt: new Date(Date.now() - 3600000).toISOString() },
          { id: "b-102", projectId: "sample-rpg", projectName: "SampleProject_RPG", targetAlias: "Windows", status: "success", percent: 100, durationSec: 88, finishedAt: new Date(Date.now() - 86400000).toISOString() }
        ],
        github: { connected: false },
        telegram: { polling: false },
        settings: { unityBin: "C:\\Program Files\\Unity\\Hub\\Editor\\2022.3.20f1\\Editor\\Unity.exe" }
      };
      ui.bootDismissed = true;
    }
  }
  if (S.scan && S.scan.finishedAt && Date.now() >= ui.bootMinUntil) {
    /* dismiss handled in updateBoot */
  }
  render();
}

async function loadCommits(id) {
  ui.commitsFor = id;
  ui.commits = [];
  const data = await api("/api/projects/" + encodeURIComponent(id) + "/commits");
  if (ui.commitsFor !== id) return;
  ui.commits = data.commits || [];
  render();
}

async function ensureRepos() {
  if (!S.github || !S.github.connected || ui.reposLoaded) return;
  ui.reposLoaded = true;
  const data = await api("/api/github/repos");
  if (!data.ok) { ui.ghError = data.error || "Could not list repositories"; ui.reposLoaded = false; }
  else ui.repos = data.repos || [];
  render();
}

async function runCommand(text) {
  const data = await api("/api/command", { method: "POST", body: { text, source: "ui" } });
  ui.reply = data.reply || data.error || "";
  if (data.buildId) {
    ui.buildId = data.buildId;
    ui.view = "yard";
    ui.logStick = true;
  }
  if (data.ok === false && data.error) toast(data.error);
  await refresh();
}

async function startBuild(body) {
  const data = await api("/api/builds", { method: "POST", body });
  if (!data.ok) { toast(data.error || "Could not start build"); return; }
  ui.buildId = data.build.id;
  ui.reply = data.reply || "";
  ui.logStick = true;
  ui.view = "yard";
  await refresh();
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "nav") {
    ui.view = btn.dataset.view;
    if (ui.view === "github") ensureRepos();
    render();
    return;
  }
  if (act === "set-yard-filter") {
    ui.yardFilter = btn.dataset.filter;
    render();
    return;
  }
  if (act === "rescan") {
    await api("/api/scan", { method: "POST" });
    await refresh();
    return;
  }
  if (act === "select-project") {
    ui.projectId = btn.dataset.id;
    ui.buildId = null;
    render();
    loadCommits(btn.dataset.id);
    return;
  }
  if (act === "open-commits") {
    event.stopPropagation();
    ui.projectId = btn.dataset.id;
    ui.buildId = null;
    render();
    loadCommits(btn.dataset.id);
    return;
  }
  if (act === "build-aos") {
    event.stopPropagation();
    ui.projectId = btn.dataset.id;
    await startBuild({ projectId: btn.dataset.id, target: "AOS", source: "card" });
    return;
  }
  if (act === "build-target") {
    await startBuild({ projectId: btn.dataset.id, target: ui.target, source: "ui" });
    return;
  }
  if (act === "build-sha") {
    await startBuild({ projectId: btn.dataset.id, target: ui.target, sha: btn.dataset.sha, source: "ui" });
    return;
  }
  if (act === "open-build") {
    if (!btn.dataset.id) return;
    ui.buildId = btn.dataset.id;
    ui.logStick = true;
    ui.view = "yard";
    render();
    return;
  }
  if (act === "cancel-build") {
    await api("/api/builds/" + encodeURIComponent(btn.dataset.id) + "/cancel", { method: "POST", body: {} });
    await refresh();
    return;
  }
  if (act === "set-target") {
    ui.target = btn.dataset.target;
    render();
    return;
  }
  if (act === "fill-command") {
    const input = $("command");
    input.value = btn.dataset.text || "";
    input.focus();
    return;
  }
  if (act === "gh-off") {
    await api("/api/github/disconnect", { method: "POST", body: {} });
    ui.reposLoaded = false;
    ui.repos = [];
    await refresh();
    return;
  }
  if (act === "gh-repo") {
    ui.repoKey = btn.dataset.owner + "/" + btn.dataset.repo;
    ui.ghCommits = [];
    render();
    const data = await api(`/api/github/repos/${encodeURIComponent(btn.dataset.owner)}/${encodeURIComponent(btn.dataset.repo)}/commits`);
    if (!data.ok) toast(data.error || "Could not load commits");
    ui.ghCommits = data.commits || [];
    render();
    return;
  }
  if (act === "tg-off") {
    await api("/api/telegram/disconnect", { method: "POST", body: {} });
    await refresh();
    return;
  }
  if (act === "regen-pair") {
    await api("/api/telegram/pair", { method: "POST", body: {} });
    await refresh();
    return;
  }
  if (act === "install-cli") {
    const data = await api("/api/unity/install", { method: "POST", body: {} });
    if (!data.ok) toast(data.error || "Could not start installer");
    await refresh();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (kind === "github") {
    const res = await api("/api/github/connect", { method: "POST", body: { token: data.token } });
    if (!res.ok) { ui.ghError = res.error || "GitHub rejected the token"; toast(ui.ghError); render(); return; }
    ui.ghError = "";
    ui.reposLoaded = false;
    form.reset();
    await refresh();
    ensureRepos();
    return;
  }
  if (kind === "telegram") {
    const res = await api("/api/telegram/connect", { method: "POST", body: { token: data.token } });
    if (!res.ok) { toast(res.error || "Telegram rejected the token"); return; }
    toast("Bot connected. Pair a chat with the code, then send BUILD AOS.");
    form.reset();
    await refresh();
    return;
  }
  if (kind === "phone") {
    const text = (data.text || "").trim();
    if (!text) return;
    form.reset();
    await runCommand(text);
    return;
  }
  if (kind === "settings") {
    ui.forceView = true;
    const res = await api("/api/settings", {
      method: "POST",
      body: {
        unityBin: data.unityBin || "",
        scanRoots: data.scanRoots || "",
        defaultProjectId: data.defaultProjectId || "",
        outputDir: data.outputDir || "",
        androidExport: data.androidExport || "apk",
        simulateIfMissing: form.elements.simulateIfMissing.checked,
        injectBuildScript: form.elements.injectBuildScript.checked,
      },
    });
    ui.forceView = false;
    if (!res.ok) toast(res.error || "Could not save");
    else toast("Settings saved");
    await refresh();
    return;
  }
  if (kind === "add-project") {
    const res = await api("/api/projects/add", { method: "POST", body: { path: data.path } });
    if (!res.ok) toast(res.error || "Could not add that folder");
    else toast("Added. Rescanning.");
    await refresh();
  }
});

$("dock").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("command").value.trim();
  if (!text) return;
  await runCommand(text);
});

document.addEventListener("scroll", (event) => {
  if (event.target && event.target.id === "build-log") {
    const el = event.target;
    ui.logStick = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    $("command").focus();
  }
});

const bootEl = $("boot");
if (bootEl) {
  bootEl.addEventListener("click", () => {
    ui.bootDismissed = true;
    bootEl.classList.add("is-hidden");
    bootEl.style.display = "none";
    bootEl.hidden = true;
  });
}

render();
requestAnimationFrame(tick);
api("/api/scan", { method: "POST" }).then(refresh);
setInterval(refresh, 450);
