const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: false,
        autoHideMenuBar: true,
        title: '3SEC',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    win.loadFile('index.html');
    
    // 開発者ツールを開く
    win.webContents.openDevTools();
    
    // F11でフルスクリーン切り替え
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

