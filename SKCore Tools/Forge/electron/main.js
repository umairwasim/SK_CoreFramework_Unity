/**
 * FORGE Electron — main process
 *
 * Startup sequence:
 *  1. Find a free port (prefer 8787)
 *  2. Spawn Python server (forge/server.py)
 *  3. Poll /api/health until ready
 *  4. Open BrowserWindow → http://127.0.0.1:<port>
 *  5. Show system tray icon
 *
 * Shutdown:
 *  - Kill Python process before app quits (no orphans)
 */

"use strict";

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

// ─── Paths ───────────────────────────────────────────────────────────────────
const FORGE_DIR = path.join(__dirname, "..", "forge");
const SERVER_SCRIPT = path.join(FORGE_DIR, "server.py");
const ICON_SVG = path.join(FORGE_DIR, "static", "favicon.svg");

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let pyProc = null;
let serverPort = 8787;
let isQuitting = false;

// ─── Port helpers ─────────────────────────────────────────────────────────────
/**
 * Reserves a port by briefly binding it, then immediately releases it.
 * This minimises the race window between "is free?" and "Python binds it".
 */
function reservePort(preferred = 8787) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    // Try preferred first
    srv.listen(preferred, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.once("error", () => {
      // preferred is taken — ask OS for a free one
      const fallback = net.createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
      fallback.once("error", reject);
    });
  });
}

// ─── Python server ────────────────────────────────────────────────────────────
function spawnPython(port) {
  // Try python3 first, fall back to python (Windows)
  const pythonBin = process.platform === "win32" ? "python" : "python3";

  const proc = spawn(pythonBin, [SERVER_SCRIPT], {
    cwd: FORGE_DIR,
    env: { ...process.env, FORGE_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => process.stdout.write(`[forge-py] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[forge-py] ${d}`));

  proc.on("exit", (code, signal) => {
    if (!isQuitting) {
      console.error(`[forge] Python server exited unexpectedly (code=${code} signal=${signal})`);
    }
  });

  proc.on("error", (err) => {
    console.error("[forge] Failed to start Python:", err.message);
    showFatalDialog(
      "Could not start Python server.\n\n" +
        `Make sure "${pythonBin}" is installed and on your PATH.\n\n` +
        err.message
    );
  });

  return proc;
}

function killPython() {
  if (!pyProc) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pyProc.pid), "/f", "/t"]);
    } else {
      pyProc.kill("SIGTERM");
    }
  } catch (_) {}
  pyProc = null;
}

// ─── Health check ─────────────────────────────────────────────────────────────
function waitForServer(port, maxMs = 20_000, intervalMs = 250) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      http
        .get(`http://127.0.0.1:${port}/api/health`, (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              if (json.ok) return resolve();
            } catch (_) {}
            retry();
          });
        })
        .on("error", retry);
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error("Server did not start in time"));
      setTimeout(attempt, intervalMs);
    }
    attempt();
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0d0d0d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Hide instead of close (tray keeps app alive)
  mainWindow.on("close", (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a simple 16×16 PNG fallback icon (Electron requires raster for tray)
  let icon;
  try {
    // Try to create a small monochrome icon from nothing — Electron lets you pass
    // an empty nativeImage and it renders a blank template on macOS.
    icon = nativeImage.createEmpty();
  } catch (_) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("FORGE — Unity build automation");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show FORGE",
      click() {
        showWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click() {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", showWindow);
  tray.on("double-click", showWindow);
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else if (serverPort) {
    createWindow(serverPort);
  }
}

// ─── App menu ──────────────────────────────────────────────────────────────────
function setAppMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Fatal dialog (no window yet) ─────────────────────────────────────────────
function showFatalDialog(message) {
  const { dialog } = require("electron");
  dialog.showErrorBox("FORGE — Fatal error", message);
  app.quit();
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  setAppMenu();

  try {
    serverPort = await reservePort(8787);
    console.log(`[forge] Using port ${serverPort}`);

    pyProc = spawnPython(serverPort);

    await waitForServer(serverPort);
    console.log("[forge] Python server ready");

    createWindow(serverPort);
    createTray();
  } catch (err) {
    showFatalDialog("FORGE failed to start:\n\n" + err.message);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  killPython();
});

app.on("activate", () => {
  // macOS: re-open window when dock icon is clicked
  showWindow();
});

app.on("window-all-closed", () => {
  // On non-macOS without tray we quit; with tray we keep running
  if (process.platform !== "darwin" && !tray) {
    app.quit();
  }
});
