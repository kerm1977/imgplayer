const { ipcRenderer } = require('electron');

let currentPath = '';
let currentView = 'thumbnails';
let currentSize = 'medium';
let selectedFiles = new Set();
let allFiles = [];

// Supported image extensions
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.svg', '.ico'];

// DOM elements
const fileList = document.getElementById('fileList');
const breadcrumbs = document.getElementById('breadcrumbs');
const cancelBtn = document.getElementById('cancelBtn');
const selectBtn = document.getElementById('selectBtn');
const selectedCount = document.getElementById('selectedCount');
const closeBtn = document.getElementById('closeBtn');

// View buttons
const viewButtons = document.querySelectorAll('.view-btn');
const sizeButtons = document.querySelectorAll('.size-btn');

// Initialize
async function init() {
    // Get initial path from main process
    const result = await ipcRenderer.invoke('get-dialog-initial-path');
    currentPath = result.path;
    
    // Load files
    await loadFiles();
    
    // Setup event listeners
    setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
    // View buttons
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            setView(view);
        });
    });
    
    // Size buttons
    sizeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size;
            setSize(size);
        });
    });
    
    // Close button
    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('close-file-dialog', { selected: [] });
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        ipcRenderer.send('close-file-dialog', { selected: [] });
    });
    
    // Select button
    selectBtn.addEventListener('click', () => {
        const selected = Array.from(selectedFiles);
        ipcRenderer.send('close-file-dialog', { selected });
    });
    
    // Double click to open folder
    fileList.addEventListener('dblclick', async (e) => {
        const fileItem = e.target.closest('.file-item');
        if (fileItem && fileItem.dataset.isDirectory === 'true') {
            const path = fileItem.dataset.path;
            await navigateTo(path);
        }
    });
}

// Set view mode
function setView(view) {
    currentView = view;
    
    // Update button states
    viewButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update file list class
    fileList.className = `file-list view-${view} size-${currentSize}`;
    
    // Re-render files
    renderFiles();
}

// Set icon size
function setSize(size) {
    currentSize = size;
    
    // Update button states
    sizeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === size);
    });
    
    // Update file list class
    fileList.className = `file-list view-${currentView} size-${size}`;
}

// Load files from current directory
async function loadFiles() {
    const result = await ipcRenderer.invoke('get-directory-files', currentPath);
    
    if (result.success) {
        allFiles = result.files;
        renderFiles();
        renderBreadcrumbs();
    }
}

// Render breadcrumbs
function renderBreadcrumbs() {
    breadcrumbs.innerHTML = '';
    
    // Split path into parts
    const path = require('path');
    const parts = currentPath.split(path.sep);
    
    // Add root/home
    const rootBreadcrumb = document.createElement('span');
    rootBreadcrumb.className = 'breadcrumb';
    rootBreadcrumb.textContent = parts[0] || '/';
    rootBreadcrumb.addEventListener('click', () => navigateTo(parts[0] || '/'));
    breadcrumbs.appendChild(rootBreadcrumb);
    
    // Add intermediate directories
    let buildPath = parts[0] || '/';
    for (let i = 1; i < parts.length; i++) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '›';
        breadcrumbs.appendChild(separator);
        
        buildPath = path.join(buildPath, parts[i]);
        const breadcrumb = document.createElement('span');
        breadcrumb.className = 'breadcrumb';
        breadcrumb.textContent = parts[i];
        breadcrumb.addEventListener('click', () => navigateTo(buildPath));
        breadcrumbs.appendChild(breadcrumb);
    }
}

// Render files in the file list
function renderFiles() {
    fileList.innerHTML = '';
    
    // Filter image files
    const imageFiles = allFiles.filter(file => {
        const ext = file.name.toLowerCase();
        return imageExtensions.some(ext2 => ext.endsWith(ext2)) || file.isDirectory;
    });
    
    // Sort: directories first, then files alphabetically
    imageFiles.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    imageFiles.forEach(file => {
        const fileItem = createFileItem(file);
        fileList.appendChild(fileItem);
    });
}

// Create file item element
function createFileItem(file) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.path = file.path;
    item.dataset.isDirectory = file.isDirectory;
    
    if (selectedFiles.has(file.path)) {
        item.classList.add('selected');
    }
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'file-thumbnail';
    
    if (file.isDirectory) {
        // Folder icon (inline SVG with fixed size)
        const svgSize = currentSize === 'small' ? 18 : currentSize === 'large' ? 36 : 24;
        thumbnail.innerHTML = `<svg viewBox="0 0 24 24" width="${svgSize}" height="${svgSize}" fill="#ff6b35"><path d="M10 4H2c-1.1 0-1.9.9-1.9 2L2 20c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
    } else {
        // Try to load thumbnail
        const img = document.createElement('img');
        img.src = `file://${file.path}`;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        img.onerror = () => {
            // Fallback to generic image icon
            img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzY2NiI+PHBhdGggZD0iTTIxIDE5VjVjMC0xLjEtLjktMi0yLTJINWMtMS4xIDAtMiAuOS0yIDJ2MTRjMCAxLjEuOSAyIDIgMmgxNGMxLjEgMCAyLS45IDItMnptLTguNS02LjVsMi41IDMuMDFMMTQuNSAxMmw0LjUgNkg1bDMuNS00LjV6Ii8+PC9zdmc+';
        };
        thumbnail.appendChild(img);
    }
    
    // File name
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;
    
    item.appendChild(thumbnail);
    item.appendChild(name);
    
    // Add size and type for details view
    if (currentView === 'details') {
        const size = document.createElement('div');
        size.className = 'file-size';
        size.textContent = file.isDirectory ? '' : formatFileSize(file.size);
        
        const type = document.createElement('div');
        type.className = 'file-type';
        type.textContent = file.isDirectory ? 'Carpeta' : getFileType(file.name);
        
        item.appendChild(size);
        item.appendChild(type);
    } else if (currentView === 'list') {
        const size = document.createElement('div');
        size.className = 'file-size';
        size.textContent = file.isDirectory ? '' : formatFileSize(file.size);
        item.appendChild(size);
    }
    
    // Click handler for selection
    item.addEventListener('click', (e) => {
        if (e.shiftKey) {
            // Shift+click for range selection (simplified)
            toggleSelection(file.path);
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd+click for multiple selection
            toggleSelection(file.path);
        } else {
            // Single click
            if (!file.isDirectory) {
                selectedFiles.clear();
                selectedFiles.add(file.path);
                updateSelectionUI();
            }
        }
    });
    
    return item;
}

// Toggle file selection
function toggleSelection(path) {
    if (selectedFiles.has(path)) {
        selectedFiles.delete(path);
    } else {
        selectedFiles.add(path);
    }
    updateSelectionUI();
}

// Update selection UI
function updateSelectionUI() {
    // Update file item classes
    document.querySelectorAll('.file-item').forEach(item => {
        const path = item.dataset.path;
        item.classList.toggle('selected', selectedFiles.has(path));
    });
    
    // Update selected count
    selectedCount.textContent = `${selectedFiles.size} seleccionados`;
    
    // Enable/disable select button
    selectBtn.disabled = selectedFiles.size === 0;
}

// Navigate up one directory
async function navigateUp() {
    const parentPath = require('path').dirname(currentPath);
    if (parentPath !== currentPath) {
        await navigateTo(parentPath);
    }
}

// Navigate to specific path
async function navigateTo(path) {
    currentPath = path;
    selectedFiles.clear();
    updateSelectionUI();
    await loadFiles();
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Get file type from extension
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'jpg': 'JPEG',
        'jpeg': 'JPEG',
        'png': 'PNG',
        'gif': 'GIF',
        'webp': 'WebP',
        'bmp': 'BMP',
        'tiff': 'TIFF',
        'tif': 'TIFF',
        'heic': 'HEIC',
        'heif': 'HEIF',
        'svg': 'SVG',
        'ico': 'ICO'
    };
    return types[ext] || ext.toUpperCase();
}

// Initialize on load
init();
