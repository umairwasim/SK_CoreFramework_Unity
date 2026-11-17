const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    backgroundColor: '#0c0d11',
    title: 'QuestBoard',
    webPreferences: { contextIsolation: true },
  })
  if (process.env.QUESTBOARD_DEV === '1') win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
