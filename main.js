// ============================================================================
// IMAGE VIEWER ELECTRON - MAIN PROCESS
// ============================================================================
// Main Electron process for the image viewer application.
// Handles window creation, IPC communication, and file dialogs.

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// ============================================================================
// WINDOW CREATION
// ============================================================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        maxWidth: 1600,
        maxHeight: 1080,
        frame: false,
        transparent: false,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================================
// APP EVENTS
// ============================================================================

app.on('ready', () => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// ============================================================================
// IPC HANDLERS
// ============================================================================

// Window controls
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) {
        if (mainWindow.isFullScreen()) {
            mainWindow.setFullScreen(false);
        } else {
            mainWindow.setFullScreen(true);
        }
    }
});

ipcMain.on('set-fullscreen', (event, isFullscreen) => {
    if (mainWindow) {
        mainWindow.setFullScreen(isFullscreen);
    }
});

// File dialogs
ipcMain.handle('select-image-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled) {
        return [];
    }

    return result.filePaths;
});

ipcMain.handle('load-folder-images', async (event, imagePath) => {
    const fs = require('fs');
    const path = require('path');
    
    const folderPath = path.dirname(imagePath);
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico'];
    
    try {
        const files = fs.readdirSync(folderPath);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase().replace('.', '');
            return imageExtensions.includes(ext);
        }).map(file => path.join(folderPath, file));
        
        // Sort files alphabetically
        imageFiles.sort();
        
        return imageFiles;
    } catch (error) {
        console.error('Error loading folder images:', error);
        return [imagePath]; // Return the original image if folder loading fails
    }
});

console.log('ImageViewerElectron main process initialized');
