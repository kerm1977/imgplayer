/*
============================================================================
IMAGE VIEWER ELECTRON - MAIN PROCESS
============================================================================
This is the Electron main process file. It handles:
- Window creation and lifecycle management
- IPC (Inter-Process Communication) handlers for file operations
- Image conversion using sharp
- Dialog handling for file selection
============================================================================
*/

// Import required Electron modules
const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require('electron');
// Node.js built-in modules for file system and path operations
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const AdmZip = require('adm-zip');

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Load settings from file
function loadSettingsFromFile() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
    return {
        language: 'es',
        sidebarCollapsed: true,
        lastOutputPath: '',
        lastQuality: '80',
        thumbnailSize: 24,
        defaultImagePath: ''
    };
}

// Save settings to file
function saveSettingsToFile(settings) {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
}

// Global reference to the main window object
// This reference is needed to prevent garbage collection of the window
let mainWindow;

// ============================================================================
// WINDOW CREATION AND LIFECYCLE
// ============================================================================

// Create and configure the main application window
// This function sets up the BrowserWindow with all necessary options
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,        // Initial window width in pixels
        height: 720,        // Initial window height in pixels
        minWidth: 960,      // Minimum width to prevent UI layout deformation
        minHeight: 660,     // Minimum height to prevent UI layout deformation
        title: 'PMOS Image Viewer',  // Window title displayed in title bar
        frame: false,         // Remove native OS frame for custom rounded corners
        transparent: true,    // Enable transparency for custom rounded corner effect
        webPreferences: {
            nodeIntegration: true,           // Allow Node.js APIs in renderer process
            contextIsolation: false,         // Disable context isolation (for legacy compatibility)
            enableRemoteModule: true         // Enable @electron/remote module
        }
    });

    // Load the index.html file as the window's content
    mainWindow.loadFile('index.html');

    // Open DevTools for debugging (commented out to prevent immediate close)
    // Uncomment the line below to open DevTools automatically on startup
    // mainWindow.webContents.openDevTools();

    // Event listeners for window maximize/unmaximize state changes
    // These notify the renderer process to update UI accordingly
    mainWindow.on('maximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-unmaximized');
    });

    // Clean up window reference when window is closed
    // This prevents memory leaks by allowing garbage collection
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================================
// APP LIFECYCLE EVENTS
// ============================================================================

// Store file to open when window is ready
let fileToOpen = null;

// Handle opening files from system (double-click on file)
app.on('open-file', (event, path) => {
    console.log('open-file event received:', path);
    event.preventDefault();
    fileToOpen = path;
    
    if (mainWindow) {
        console.log('Sending open-file to renderer:', path);
        mainWindow.webContents.send('open-file', path);
    } else {
        console.log('Main window not ready, storing file to open later');
    }
});

// Create window when Electron is ready
app.on('ready', () => {
    createWindow();
    
    // Check if file was passed as command line argument
    const args = process.argv.slice(1);
    console.log('Command line args:', args);
    
    // Find first argument that looks like a file path (not starting with -)
    const filePath = args.find(arg => !arg.startsWith('-') && fs.existsSync(arg));
    
    if (filePath) {
        console.log('Found file path in args:', filePath);
        fileToOpen = filePath;
    }
    
    // Send file to renderer when window is ready
    if (mainWindow) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('Window finished loading');
            // Add a small delay to ensure renderer is fully ready
            setTimeout(() => {
                if (fileToOpen) {
                    console.log('Sending file to renderer:', fileToOpen);
                    mainWindow.webContents.send('open-file', fileToOpen);
                    fileToOpen = null;
                }
            }, 500);
        });
    }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Create window when activated on macOS (if no windows exist)
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// ============================================================================
// IPC HANDLERS - FILE SELECTION
// ============================================================================

// IPC handler for opening image files
// Allows user to select one or more image files
// Returns: Array of selected file paths (null if canceled)
ipcMain.handle('select-image-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePaths;
    }
    return null;
});

// IPC handler for selecting a folder
// Allows user to select a folder containing images
// Returns: Array of image file paths in the selected folder (null if canceled)
ipcMain.handle('select-image-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];
        const fs = require('fs');
        const path = require('path');
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico'];

        try {
            const files = fs.readdirSync(folderPath);
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase().replace('.', '');
                return imageExtensions.includes(ext);
            }).map(file => path.join(folderPath, file));

            return imageFiles;
        } catch (error) {
            console.error('Error reading folder:', error);
            return null;
        }
    }
    return null;
});

// IPC handler for getting all images from a folder
// When user selects a single image, this function finds all images in the same folder
// Parameters:
//   - imagePath: Path to the selected image file
// Returns: Array of all image file paths in the same folder
ipcMain.handle('get-folder-images', async (event, imagePath) => {
    try {
        const folderPath = path.dirname(imagePath);
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico'];
        
        const files = fs.readdirSync(folderPath);
        const imageFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase().replace('.', '');
                return imageExtensions.includes(ext);
            })
            .map(file => path.join(folderPath, file))
            .sort(); // Sort alphabetically for consistent ordering
        
        return imageFiles;
    } catch (error) {
        console.error('Error getting folder images:', error);
        return [imagePath]; // Return at least the selected image if folder scan fails
    }
});

// IPC handler for renaming a single file
// Parameters:
//   - oldPath: Current file path
//   - newPath: New file path
// Returns: Success status
ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
    try {
        fs.renameSync(oldPath, newPath);
        return { success: true };
    } catch (error) {
        console.error('Error renaming file:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for deleting a file
// Parameters:
//   - filePath: Path to the file to delete
// Returns: Success status
ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        fs.unlinkSync(filePath);
        return { success: true };
    } catch (error) {
        console.error('Error deleting file:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for batch renaming files
// Parameters:
//   - renameOperations: Array of objects { oldPath, newPath }
// Returns: Success status and error details
ipcMain.handle('batch-rename-files', async (event, renameOperations) => {
    const errors = [];
    
    for (const operation of renameOperations) {
        try {
            fs.renameSync(operation.oldPath, operation.newPath);
        } catch (error) {
            errors.push({ file: operation.oldPath, error: error.message });
        }
    }
    
    return {
        success: errors.length === 0,
        errors: errors,
        total: renameOperations.length,
        failed: errors.length
    };
});

// ============================================================================
// IPC HANDLERS - IMAGE CONVERSION
// ============================================================================

// IPC handler for image conversion requests from renderer process
// This handler runs in the main process to avoid blocking the UI renderer
// Parameters:
//   - inputPath: Path to the source image file
//   - outputPath: Path where the converted file should be saved
//   - format: Target image format (jpg, png, webp, gif, bmp, tiff)
//   - quality: Quality setting (1-100 for lossy formats)
// Returns: Promise that resolves on success, rejects on error
ipcMain.handle('convert-image', async (event, inputPath, outputPath, format, quality) => {
    try {
        let sharpInstance = sharp(inputPath);

        // Set format-specific options
        switch (format.toLowerCase()) {
            case 'jpg':
            case 'jpeg':
                sharpInstance = sharpInstance.jpeg({ quality: quality || 80 });
                break;
            case 'png':
                sharpInstance = sharpInstance.png({ quality: quality || 80 });
                break;
            case 'webp':
                sharpInstance = sharpInstance.webp({ quality: quality || 80 });
                break;
            case 'gif':
                sharpInstance = sharpInstance.gif();
                break;
            case 'bmp':
                sharpInstance = sharpInstance.bmp();
                break;
            case 'tiff':
                sharpInstance = sharpInstance.tiff();
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }

        await sharpInstance.toFile(outputPath);
        return { success: true, outputPath };
    } catch (error) {
        console.error('Image conversion error:', error);
        return { success: false, error: error.message };
    }
});

// ============================================================================
// IPC HANDLERS - IMAGE TRANSFORMATION
// ============================================================================

// IPC handler for image scaling
// Parameters:
//   - inputPath: Path to the source image file
//   - outputPath: Path where the scaled image should be saved
//   - width: Target width (null to maintain aspect ratio)
//   - height: Target height (null to maintain aspect ratio)
//   - fit: Fit method (cover, contain, fill, inside, outside)
ipcMain.handle('scale-image', async (event, inputPath, outputPath, width, height, fit) => {
    try {
        // If input and output are the same, use a temporary file
        const tempPath = inputPath === outputPath ? inputPath + '.tmp' : outputPath;
        
        await sharp(inputPath)
            .resize(width, height, { fit: fit || 'cover' })
            .toFile(tempPath);
        
        // If using temp file, replace original
        if (tempPath !== outputPath) {
            fs.copyFileSync(tempPath, outputPath);
            fs.unlinkSync(tempPath);
        }
        
        return { success: true, outputPath };
    } catch (error) {
        console.error('Image scaling error:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for image rotation
// Parameters:
//   - inputPath: Path to the source image file
//   - outputPath: Path where the rotated image should be saved
//   - angle: Rotation angle in degrees (90, 180, 270)
ipcMain.handle('rotate-image', async (event, inputPath, outputPath, angle) => {
    try {
        // If input and output are the same, use a temporary file
        const tempPath = inputPath === outputPath ? inputPath + '.tmp' : outputPath;
        
        await sharp(inputPath)
            .rotate(angle, {
                background: { r: 0, g: 0, b: 0, alpha: 0 }  // Transparent background
            })
            .toFile(tempPath);
        
        // If using temp file, replace original
        if (tempPath !== outputPath) {
            fs.copyFileSync(tempPath, outputPath);
            fs.unlinkSync(tempPath);
        }
        
        return { success: true, outputPath };
    } catch (error) {
        console.error('Image rotation error:', error);
        return { success: false, error: error.message };
    }
});

// ============================================================================
// IPC HANDLERS - SAVE DIALOG
// ============================================================================

// IPC handler for save dialog (for image conversion output)
// Allows user to choose where to save converted image files
// Returns: Selected save file path (null if canceled)
ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
            { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
            { name: 'PNG', extensions: ['png'] },
            { name: 'WebP', extensions: ['webp'] },
            { name: 'GIF', extensions: ['gif'] },
            { name: 'BMP', extensions: ['bmp'] },
            { name: 'TIFF', extensions: ['tiff'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePath;
    }
    return null;
});

// ============================================================================
// IPC HANDLERS - WINDOW CONTROL
// ============================================================================

// IPC handler for minimizing window
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

// IPC handler for maximizing/unmaximizing window
ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

// IPC handler for closing window
ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

// IPC handler for toggling DevTools
ipcMain.on('toggle-devtools', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
});

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

// IPC handler to save settings
ipcMain.handle('save-settings', async (event, settings) => {
    const success = saveSettingsToFile(settings);
    return { success };
});

// IPC handler to load settings
ipcMain.handle('load-settings', async () => {
    const settings = loadSettingsFromFile();
    return { success: true, settings };
});

// ============================================================================
// CUSTOM FILE DIALOG
// ============================================================================

// IPC handler to get home path for dialog
ipcMain.handle('get-home-path', async () => {
    return app.getPath('home');
});

// IPC handler to get directory files
ipcMain.handle('get-directory-files', async (event, dirPath) => {
    try {
        const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const fileList = [];

        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            try {
                const stats = await fs.promises.stat(fullPath);
                fileList.push({
                    name: file.name,
                    path: fullPath,
                    isDirectory: file.isDirectory(),
                    size: stats.size
                });
            } catch (error) {
                // Skip files that can't be accessed
            }
        }

        return { success: true, files: fileList };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// IPC handler to close file dialog and return selected files
ipcMain.on('close-file-dialog', (event, data) => {
    if (fileDialogWindow) {
        fileDialogWindow.close();
    }
    mainWindow.webContents.send('file-dialog-selection', data.selected);
});

// ============================================================================
// COMPRESSION
// ============================================================================

// IPC handler for selecting files for compression
ipcMain.handle('select-files-for-compression', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePaths;
    }
    return [];
});

// IPC handler for compressing files
ipcMain.handle('compress-files', async (event, files, format, fileName, password) => {
    try {
        // RAR is proprietary format, cannot be created without external tools
        if (format === 'rar') {
            return { success: false, error: 'RAR es un formato propietario. Use ZIP, TAR o 7Z para compresión.' };
        }

        // Select save location
        const saveResult = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `${fileName}.zip`,
            filters: [
                { name: 'ZIP', extensions: ['zip'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (saveResult.canceled) {
            return { success: false, error: 'Cancelado por usuario' };
        }

        const outputPath = saveResult.filePath;

        // Create zip archive
        const zip = new AdmZip();

        // Add files to archive
        for (const filePath of files) {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    zip.addLocalFolder(filePath, path.basename(filePath));
                } else {
                    zip.addLocalFile(filePath);
                }
            }
        }

        // Write archive
        zip.writeZip(outputPath);

        return { success: true, outputPath };
    } catch (error) {
        console.error('Compression error:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for decompressing files
ipcMain.handle('decompress-file', async (event, archivePath, password) => {
    try {
        // Select destination directory
        const dirResult = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (dirResult.canceled) {
            return { success: false, error: 'Cancelado por usuario' };
        }

        const destDir = dirResult.filePaths[0];

        // Read zip archive
        const zip = new AdmZip(archivePath);

        // Extract all files
        zip.extractAllTo(destDir, true);

        return { success: true, outputPath: destDir };
    } catch (error) {
        console.error('Decompression error:', error);
        return { success: false, error: error.message };
    }
});
