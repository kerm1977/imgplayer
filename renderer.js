/*
============================================================================
IMAGE VIEWER ELECTRON - RENDERER PROCESS
============================================================================
This file contains all JavaScript for the image viewer application.
It handles:
- Image loading and display
- Image transformation (scale, rotate)
- Image conversion between formats
- UI interactions and event listeners
============================================================================
*/

const { ipcRenderer } = require('electron');
const path = require('path');

// ============================================================================
// DOM ELEMENTS
// ============================================================================

// Window controls
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

// Sidebar
const sidebar = document.getElementById('sidebar');
const collapseBtn = document.getElementById('collapseBtn');

// Action buttons
const openImagesBtn = document.getElementById('openImagesBtn');

// Transform controls
const scaleWidth = document.getElementById('scaleWidth');
const scaleHeight = document.getElementById('scaleHeight');
const scaleBtn = document.getElementById('scaleBtn');
const rotateButtons = document.querySelectorAll('.rotate-btn');

// Conversion controls
const targetFormat = document.getElementById('targetFormat');
const quality = document.getElementById('quality');
const outputPath = document.getElementById('outputPath');
const browseOutputPath = document.getElementById('browseOutputPath');
const convertBtn = document.getElementById('convertBtn');

// Rename controls
const newFileName = document.getElementById('newFileName');
const renameCurrentBtn = document.getElementById('renameCurrentBtn');
const renameAllBtn = document.getElementById('renameAllBtn');

// Language and help
const languageSelect = document.getElementById('languageSelect');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');

// Image viewer
const imageContainer = document.getElementById('imageContainer');
const imageNavigation = document.getElementById('imageNavigation');
const prevImageBtn = document.getElementById('prevImageBtn');
const nextImageBtn = document.getElementById('nextImageBtn');
const imageCounter = document.getElementById('imageCounter');

// Modal
const progressModal = document.getElementById('progressModal');
const progressMessage = document.getElementById('progressMessage');

// ============================================================================
// STATE
// ============================================================================

let images = [];  // Array of loaded image paths
let currentImageIndex = 0;  // Current image index
let currentImagePath = null;  // Current image path
let zoomLevel = 1;  // Current zoom level (1 = 100%)
let isPanning = false;  // Panning state
let panStartX, panStartY, panTranslateX = 0, panTranslateY = 0;  // Pan coordinates
let currentLanguage = 'es';  // Current language (default: Spanish)
let rotation = 0;  // Current rotation in degrees
let flipHorizontal = false;  // Horizontal flip state
let flipVertical = false;  // Vertical flip state

// ============================================================================
// WINDOW CONTROLS
// ============================================================================

// Minimize window
minimizeBtn.addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
});

// Maximize/unmaximize window
maximizeBtn.addEventListener('click', () => {
    ipcRenderer.send('maximize-window');
});

// Close window
closeBtn.addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

// ============================================================================
// SIDEBAR COLLAPSE
// ============================================================================

// Toggle sidebar collapse
collapseBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    
    // Update icon based on sidebar state
    const icon = collapseBtn.querySelector('.collapse-icon');
    if (sidebar.classList.contains('collapsed')) {
        // When collapsed, icon should point right (>)
        icon.innerHTML = '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/>';
    } else {
        // When expanded, icon should point left (<)
        icon.innerHTML = '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>';
    }
    
    // Save settings
    saveSettings();
});

// Toggle section collapse
document.querySelectorAll('.section-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.toggle('collapsed');
        }
    });
});

// Toggle section collapse on header click
document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
        const targetId = header.querySelector('.section-collapse-btn').dataset.target;
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.toggle('collapsed');
        }
    });
});

// Save settings on quality change
quality.addEventListener('change', () => {
    saveSettings();
});

// Save settings on output path change
outputPath.addEventListener('change', () => {
    saveSettings();
});

// Save settings before closing window
window.addEventListener('beforeunload', () => {
    saveSettings();
});

// Toggle section collapse on title click
document.querySelectorAll('.section-header h3').forEach(title => {
    title.style.cursor = 'pointer';
    title.addEventListener('click', () => {
        const section = title.closest('.transform-controls, .conversion-controls, .rename-controls');
        if (section) {
            section.classList.toggle('collapsed');
        }
    });
});

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

// Load settings on startup
async function loadSettings() {
    const result = await ipcRenderer.invoke('load-settings');
    if (result.success) {
        const settings = result.settings;
        
        // Apply language
        if (settings.language) {
            currentLanguage = settings.language;
            languageSelect.value = settings.language;
            updateLanguage(settings.language);
        }
        
        // Apply sidebar collapsed state
        if (settings.sidebarCollapsed !== undefined) {
            if (settings.sidebarCollapsed) {
                sidebar.classList.add('collapsed');
                const icon = collapseBtn.querySelector('.collapse-icon');
                icon.innerHTML = '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/>';
            } else {
                sidebar.classList.remove('collapsed');
                const icon = collapseBtn.querySelector('.collapse-icon');
                icon.innerHTML = '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>';
            }
        }
        
        // Apply last output path
        if (settings.lastOutputPath) {
            outputPath.value = settings.lastOutputPath;
        }
        
        // Apply last quality
        if (settings.lastQuality) {
            quality.value = settings.lastQuality;
        }
        
        // Apply thumbnail size
        if (settings.thumbnailSize) {
            fileDialogThumbnailSize = settings.thumbnailSize;
        }
        
        // Apply default image path
        if (settings.defaultImagePath) {
            defaultImagePath = settings.defaultImagePath;
            updateDefaultFolderIndicator();
        }
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        language: currentLanguage,
        sidebarCollapsed: sidebar.classList.contains('collapsed'),
        lastOutputPath: outputPath.value,
        lastQuality: quality.value,
        thumbnailSize: fileDialogThumbnailSize,
        defaultImagePath: defaultImagePath
    };
    
    await ipcRenderer.send('save-settings', settings);
}

// Load settings on startup
loadSettings();

// ============================================================================
// LANGUAGE AND HELP
// ============================================================================

// Update language function
function updateLanguage(lang) {
    currentLanguage = lang;
    
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
    
    // Update select options with data-i18n
    document.querySelectorAll('option[data-i18n]').forEach(option => {
        const key = option.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            option.textContent = translations[lang][key];
        }
    });
    
    // Update file dialog selection count
    updateDialogSelectionUI();
}

// Language change handler
languageSelect.addEventListener('change', (e) => {
    updateLanguage(e.target.value);
    saveSettings();
});

// Help modal handlers
helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'flex';
});

closeHelpBtn.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// Close help modal on outside click
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.style.display = 'none';
    }
});

// Close help modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && helpModal.style.display === 'flex') {
        helpModal.style.display = 'none';
    }
});

// ============================================================================
// IMAGE LOADING
// ============================================================================

// File dialog state
let fileDialogPath = '';
let fileDialogView = 'list';
let fileDialogThumbnailSize = 50;
let fileDialogSelectedFiles = new Set();
let fileDialogAllFiles = [];
let defaultImagePath = '';

// Slideshow state
let slideshowInterval = null;
let slideshowRunning = false;
let slideshowFadeTimeout = null;
let slideshowVisible = true;

// Initialize file dialog overlay
async function initFileDialog() {
    // Use default path if set, otherwise use home directory
    if (defaultImagePath && defaultImagePath.trim() !== '') {
        fileDialogPath = defaultImagePath;
    } else {
        const homePath = await ipcRenderer.invoke('get-home-path');
        fileDialogPath = homePath;
    }

    // Initialize slider with saved value
    const slider = document.getElementById('thumbnailSizeSlider');
    slider.value = fileDialogThumbnailSize;
    document.getElementById('thumbnailSizeValue').textContent = `${fileDialogThumbnailSize}px`;

    // Set initial CSS variable
    const fileList = document.getElementById('fileDialogList');
    fileList.style.setProperty('--thumbnail-size', `${fileDialogThumbnailSize}px`);

    // Load files
    await loadDialogFiles();
    
    // Setup event listeners
    setupFileDialogListeners();
}

// Setup file dialog event listeners
function setupFileDialogListeners() {
    // View buttons
    document.querySelectorAll('.file-dialog-header .view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            setFileDialogView(view);
        });
    });

    // Size slider
    const sizeSlider = document.getElementById('thumbnailSizeSlider');
    sizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        setThumbnailSize(size);
    });

    // Close button
    document.getElementById('closeFileDialogBtn').addEventListener('click', () => {
        closeFileDialog();
    });
    
    // Cancel button
    document.getElementById('cancelFileDialogBtn').addEventListener('click', () => {
        closeFileDialog();
    });
    
    // Select button
    document.getElementById('selectFileDialogBtn').addEventListener('click', () => {
        const selected = Array.from(fileDialogSelectedFiles);
        loadSelectedImages(selected);
        closeFileDialog();
    });
    
    // Double click to open folder or image
    document.getElementById('fileDialogList').addEventListener('dblclick', async (e) => {
        const fileItem = e.target.closest('.file-item');
        if (fileItem) {
            const path = fileItem.dataset.path;
            if (fileItem.dataset.isDirectory === 'true') {
                // Open folder
                await navigateToPath(path);
            } else {
                // Open image directly
                loadSelectedImages([path]);
                closeFileDialog();
            }
        }
    });
    
    // Breadcrumb click handler (event delegation)
    document.getElementById('fileDialogBreadcrumbs').addEventListener('click', (e) => {
        const breadcrumb = e.target.closest('.breadcrumb');
        if (breadcrumb && breadcrumb.dataset.path) {
            e.preventDefault();
            e.stopPropagation();
            navigateToPath(breadcrumb.dataset.path);
        }
    });
    
    // Set default folder button
    document.getElementById('setDefaultFolderBtn').addEventListener('click', () => {
        defaultImagePath = fileDialogPath;
        saveSettings();
        updateDefaultFolderIndicator();
        // Visual feedback
        const btn = document.getElementById('setDefaultFolderBtn');
        btn.style.background = '#ff6b35';
        setTimeout(() => {
            btn.style.background = '';
        }, 1000);
    });
}

// Set file dialog view
function setFileDialogView(view) {
    fileDialogView = view;
    
    // Update button states
    document.querySelectorAll('.file-dialog-header .view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update file list class
    const fileList = document.getElementById('fileDialogList');
    fileList.className = `file-list view-${view}`;
    
    // Re-render files
    renderDialogFiles();
}

// Set thumbnail size dynamically
function setThumbnailSize(size) {
    fileDialogThumbnailSize = size;

    // Update CSS variable
    const fileList = document.getElementById('fileDialogList');
    fileList.style.setProperty('--thumbnail-size', `${size}px`);

    // Update display value
    document.getElementById('thumbnailSizeValue').textContent = `${size}px`;

    // Re-render files to update SVG sizes
    renderDialogFiles();

    // Save settings
    saveSettings();
}

// Load files for dialog
async function loadDialogFiles() {
    const result = await ipcRenderer.invoke('get-directory-files', fileDialogPath);
    
    if (result.success) {
        fileDialogAllFiles = result.files;
        renderDialogFiles();
        renderDialogBreadcrumbs();
    }
}

// Render files in dialog
function renderDialogFiles() {
    const fileList = document.getElementById('fileDialogList');
    fileList.innerHTML = '';
    
    // Filter image files
    const imageFiles = fileDialogAllFiles.filter(file => {
        const ext = file.name.toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.svg', '.ico'].some(e => ext.endsWith(e)) || file.isDirectory;
    });
    
    // Sort: directories first, then files alphabetically
    imageFiles.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    imageFiles.forEach(file => {
        const fileItem = createDialogFileItem(file);
        fileList.appendChild(fileItem);
    });
}

// Create file item for dialog
function createDialogFileItem(file) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.path = file.path;
    item.dataset.isDirectory = file.isDirectory;
    
    if (fileDialogSelectedFiles.has(file.path)) {
        item.classList.add('selected');
    }
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'file-thumbnail';

    if (file.isDirectory) {
        const svgSize = Math.round(fileDialogThumbnailSize * 0.75);
        thumbnail.innerHTML = `<svg viewBox="0 0 24 24" width="${svgSize}" height="${svgSize}" fill="#ff6b35"><path d="M10 4H2c-1.1 0-1.9.9-1.9 2L2 20c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
    } else {
        const img = document.createElement('img');
        img.src = `file://${file.path}`;
        img.style.width = `${fileDialogThumbnailSize}px`;
        img.style.height = `${fileDialogThumbnailSize}px`;
        img.style.objectFit = 'cover';
        img.style.borderRadius = '3px';
        img.style.maxWidth = '350px';
        img.style.maxHeight = '350px';
        img.style.minWidth = '16px';
        img.style.minHeight = '16px';
        img.onerror = () => {
            img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzY2NiI+PHBhdGggZD0iTTIxIDE5VjVjMC0xLjEtLjktMi0yLTJINWMtMS4xIDAtMiAuOS0yIDJ2MTRjMCAxLjEuOSAyIDIgMmgxNGMxLjEgMCAyLS45IDItMnptLTguNS02LjVsMi41IDMuMDFMMTQuNSAxMmw0LjUgNkg1bDMuNS00LjV6Ii8+PC9zdmc+';
        };
        thumbnail.appendChild(img);
    }
    
    // File name
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;

    item.appendChild(thumbnail);

    // Add size and type for details view
    if (fileDialogView === 'details') {
        const info = document.createElement('div');
        info.className = 'file-info';

        const path = document.createElement('div');
        path.className = 'file-path';
        path.textContent = file.path;

        const size = document.createElement('div');
        size.className = 'file-size';
        size.textContent = file.isDirectory ? '' : formatDialogFileSize(file.size);

        const type = document.createElement('div');
        type.className = 'file-type';
        type.textContent = file.isDirectory ? 'Carpeta' : getDialogFileType(file.name);

        info.appendChild(path);
        info.appendChild(size);
        info.appendChild(type);
        item.appendChild(info);
    } else if (fileDialogView === 'list') {
        const info = document.createElement('div');
        info.className = 'file-info';

        info.appendChild(name);

        const path = document.createElement('div');
        path.className = 'file-path';
        path.textContent = file.path;

        const size = document.createElement('div');
        size.className = 'file-size';
        size.textContent = file.isDirectory ? '' : formatDialogFileSize(file.size);

        info.appendChild(path);
        info.appendChild(size);
        item.appendChild(info);
    }
    
    // Click handler
    item.addEventListener('click', (e) => {
        if (e.shiftKey) {
            toggleDialogSelection(file.path);
        } else if (e.ctrlKey || e.metaKey) {
            toggleDialogSelection(file.path);
        } else {
            if (!file.isDirectory) {
                fileDialogSelectedFiles.clear();
                fileDialogSelectedFiles.add(file.path);
                updateDialogSelectionUI();
            }
        }
    });
    
    return item;
}

// Toggle file selection in dialog
function toggleDialogSelection(path) {
    if (fileDialogSelectedFiles.has(path)) {
        fileDialogSelectedFiles.delete(path);
    } else {
        fileDialogSelectedFiles.add(path);
    }
    updateDialogSelectionUI();
}

// Update selection UI in dialog
function updateDialogSelectionUI() {
    document.querySelectorAll('#fileDialogList .file-item').forEach(item => {
        const path = item.dataset.path;
        item.classList.toggle('selected', fileDialogSelectedFiles.has(path));
    });
    
    const selectedCountText = translations[currentLanguage]?.selectedCount || 'seleccionados';
    document.getElementById('fileDialogSelectedCount').innerHTML = `${fileDialogSelectedFiles.size} <span data-i18n="selectedCount">${selectedCountText}</span>`;
    document.getElementById('selectFileDialogBtn').disabled = fileDialogSelectedFiles.size === 0;
}

// Update default folder indicator
function updateDefaultFolderIndicator() {
    const indicator = document.getElementById('defaultFolderIndicator');
    const pathDisplay = document.getElementById('defaultFolderPath');
    
    if (defaultImagePath && defaultImagePath.trim() !== '') {
        indicator.style.display = 'flex';
        pathDisplay.textContent = defaultImagePath;
        indicator.onclick = openDefaultFolder;
    } else {
        indicator.style.display = 'none';
        indicator.onclick = null;
    }
}

// Open default folder
function openDefaultFolder() {
    if (defaultImagePath && defaultImagePath.trim() !== '') {
        fileDialogPath = defaultImagePath;
        fileDialogSelectedFiles.clear();
        updateDialogSelectionUI();
        loadDialogFiles();
        fileDialogOverlay.style.display = 'flex';
    }
}

// Render breadcrumbs in dialog
function renderDialogBreadcrumbs() {
    const breadcrumbs = document.getElementById('fileDialogBreadcrumbs');
    breadcrumbs.innerHTML = '';
    
    const path = require('path');
    const parts = fileDialogPath.split(path.sep).filter(p => p); // Filter empty parts
    
    // Add root breadcrumb
    const rootBreadcrumb = document.createElement('span');
    rootBreadcrumb.className = 'breadcrumb';
    rootBreadcrumb.textContent = path.parse(fileDialogPath).root || '/';
    rootBreadcrumb.dataset.path = path.parse(fileDialogPath).root || '/';
    breadcrumbs.appendChild(rootBreadcrumb);
    
    let buildPath = path.parse(fileDialogPath).root || '/';
    for (let i = 0; i < parts.length; i++) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '›';
        breadcrumbs.appendChild(separator);
        
        buildPath = path.join(buildPath, parts[i]);
        const breadcrumb = document.createElement('span');
        breadcrumb.className = 'breadcrumb';
        breadcrumb.textContent = parts[i];
        breadcrumb.dataset.path = buildPath;
        breadcrumbs.appendChild(breadcrumb);
    }
}

// Navigate to specific path in dialog
async function navigateToPath(path) {
    fileDialogPath = path;
    fileDialogSelectedFiles.clear();
    updateDialogSelectionUI();
    await loadDialogFiles();
}

// Format file size for dialog
function formatDialogFileSize(bytes) {
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

// Get file type for dialog
function getDialogFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'jpg': 'JPEG', 'jpeg': 'JPEG', 'png': 'PNG', 'gif': 'GIF',
        'webp': 'WebP', 'bmp': 'BMP', 'tiff': 'TIFF', 'tif': 'TIFF',
        'heic': 'HEIC', 'heif': 'HEIF', 'svg': 'SVG', 'ico': 'ICO'
    };
    return types[ext] || ext.toUpperCase();
}

// Close file dialog
function closeFileDialog() {
    const overlay = document.getElementById('fileDialogOverlay');
    overlay.style.display = 'none';
    fileDialogSelectedFiles.clear();
}

// Load selected images from dialog
async function loadSelectedImages(selectedFiles) {
    if (selectedFiles && selectedFiles.length > 0) {
        const imageFiles = selectedFiles.filter(file => {
            const ext = file.toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.svg', '.ico'].some(e => ext.endsWith(e));
        });
        
        if (imageFiles.length > 0) {
            if (imageFiles.length === 1) {
                const folderImages = await ipcRenderer.invoke('get-folder-images', imageFiles[0]);
                if (folderImages && folderImages.length > 0) {
                    images = folderImages;
                    currentImageIndex = images.indexOf(imageFiles[0]);
                    if (currentImageIndex === -1) currentImageIndex = 0;
                    displayImage(currentImageIndex);
                }
            } else {
                images = imageFiles;
                currentImageIndex = 0;
                displayImage(currentImageIndex);
            }
        }
    }
}

// Open images dialog
openImagesBtn.addEventListener('click', async () => {
    // Show file dialog overlay
    const overlay = document.getElementById('fileDialogOverlay');
    overlay.style.display = 'flex';
    
    // Initialize file dialog
    initFileDialog();
});

// Display image at specified index
function displayImage(index, forceReload = false) {
    if (index < 0 || index >= images.length) return;
    
    currentImageIndex = index;
    currentImagePath = images[index];
    
    // Reset zoom level and pan
    zoomLevel = 1;
    panTranslateX = 0;
    panTranslateY = 0;
    
    // Reset transformations
    rotation = 0;
    flipHorizontal = false;
    flipVertical = false;
    
    // Remove only the previous image, keep slideshow button
    const previousImage = document.getElementById('currentImage');
    if (previousImage) {
        previousImage.remove();
    }
    
    // Remove empty state if present
    const emptyState = imageContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Create image element
    const img = document.createElement('img');
    // Add timestamp to force reload when forceReload is true
    const timestamp = forceReload ? `?t=${Date.now()}` : '';
    img.src = `file://${currentImagePath}${timestamp}`;
    img.alt = 'Image';
    img.id = 'currentImage';
    
    img.onload = () => {
        // Update scale inputs with current dimensions
        scaleWidth.value = img.naturalWidth;
        scaleHeight.value = img.naturalHeight;
    };
    
    img.onerror = () => {
        imageContainer.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar la imagen</p>
            </div>
        `;
    };
    
    imageContainer.appendChild(img);
    
    // Add double click to enter fullscreen
    img.addEventListener('dblclick', (e) => {
        e.preventDefault();
        toggleFullscreen();
    });
    
    // Update navigation
    imageNavigation.style.display = 'flex';
    imageCounter.textContent = `${index + 1} / ${images.length}`;
    
    // Update button states
    prevImageBtn.disabled = index === 0;
    nextImageBtn.disabled = index === images.length - 1;
    
    // Update fullscreen counter if visible
    const fullscreenCounterText = document.getElementById('fullscreenCounterText');
    if (fullscreenCounterText) {
        fullscreenCounterText.textContent = `${index + 1} / ${images.length}`;
    }
    
    // Show/hide slideshow button
    const slideshowBtn = document.getElementById('slideshowBtn');
    if (slideshowBtn) {
        if (images.length >= 1) {
            slideshowBtn.style.display = 'flex';
            // Only show button and reset timer if slideshow is not running
            // to avoid flickering during automatic slideshow transitions
            if (!slideshowRunning) {
                slideshowBtn.classList.remove('hidden');
                slideshowVisible = true;
                resetSlideshowFadeTimer();
            }
        } else {
            slideshowBtn.style.display = 'none';
            stopSlideshow();
        }
    }
}

// ============================================================================
// IMAGE NAVIGATION
// ============================================================================

// Previous image
prevImageBtn.addEventListener('click', () => {
    if (currentImageIndex > 0) {
        displayImage(currentImageIndex - 1);
    }
});

// Next image
nextImageBtn.addEventListener('click', (e) => {
    // Check if this is a sidebar toggle click
    if (e.target.closest('#nextImageBtn').dataset.toggleSidebar === 'true') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
    }

    // Navigate to next image
    if (currentImageIndex < images.length - 1) {
        displayImage(currentImageIndex + 1);
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    // Delete/Suprimir to delete current image
    if ((e.key === 'Delete' || e.key === 'Suprimir') && currentImagePath) {
        e.preventDefault();
        confirmDeleteImage(currentImagePath);
        return;
    }

    // Spacebar to control slideshow in fullscreen, otherwise reset image to 100%
    if (e.key === ' ' && currentImagePath) {
        e.preventDefault();
        if (isFullscreen) {
            toggleSlideshow();
        } else {
            resetImageTo100();
        }
        return;
    }

    // Double click to enter fullscreen
    if (e.key === 'Enter' && currentImagePath) {
        e.preventDefault();
        toggleFullscreen();
        return;
    }

    // ESC to exit fullscreen
    if (e.key === 'Escape') {
        exitFullscreen();
        return;
    }

    // Image navigation with Alt key
    if (e.altKey) {
        if (e.key === 'ArrowLeft' && currentImageIndex > 0) {
            displayImage(currentImageIndex - 1);
        } else if (e.key === 'ArrowRight' && currentImageIndex < images.length - 1) {
            displayImage(currentImageIndex + 1);
        }
    }
    // Image transformations
    else if (currentImagePath) {
        if (e.key === 'ArrowRight' && !e.shiftKey) {
            rotateRight();
        } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
            rotateLeft();
        } else if (e.key === 'ArrowUp' && !e.shiftKey) {
            rotateUp();
        } else if (e.key === 'ArrowDown' && !e.shiftKey) {
            rotateDown();
        } else if (e.key === 'ArrowRight' && e.shiftKey) {
            flipHorizontal = !flipHorizontal;
            applyTransformations();
        } else if (e.key === 'ArrowLeft' && e.shiftKey) {
            flipHorizontal = !flipHorizontal;
            applyTransformations();
        } else if (e.key === 'ArrowUp' && e.shiftKey) {
            flipVertical = !flipVertical;
            applyTransformations();
        } else if (e.key === 'ArrowDown' && e.shiftKey) {
            flipVertical = !flipVertical;
            applyTransformations();
        }
    }
});

// ============================================================================
// IMAGE TRANSFORMATIONS
// ============================================================================

// Rotate image right (90 degrees clockwise)
function rotateRight() {
    rotation = (rotation + 90) % 360;
    applyTransformations();
}

// Rotate image left (90 degrees counter-clockwise)
function rotateLeft() {
    rotation = (rotation - 90) % 360;
    if (rotation < 0) rotation += 360;
    applyTransformations();
}

// Rotate image up (180 degrees vertical flip)
function rotateUp() {
    rotation = (rotation + 180) % 360;
    applyTransformations();
}

// Rotate image down (180 degrees vertical flip)
function rotateDown() {
    rotation = (rotation + 180) % 360;
    applyTransformations();
}

// Apply transformations to current image
function applyTransformations() {
    const img = document.getElementById('currentImage');
    if (!img) return;
    
    const scaleX = flipHorizontal ? -1 : 1;
    const scaleY = flipVertical ? -1 : 1;
    
    img.style.transform = `rotate(${rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
}

// Reset transformations
function resetTransformations() {
    rotation = 0;
    flipHorizontal = false;
    flipVertical = false;
    applyTransformations();
}

// Reset image to 100% (reset zoom, pan, and transformations)
function resetImageTo100() {
    zoomLevel = 1;
    panTranslateX = 0;
    panTranslateY = 0;
    resetTransformations();
    
    const img = document.getElementById('currentImage');
    if (img) {
        img.style.transform = `rotate(0deg) scaleX(1) scaleY(1)`;
    }
    
    // Update zoom display if exists
    const zoomDisplay = document.getElementById('zoomDisplay');
    if (zoomDisplay) {
        zoomDisplay.textContent = '100%';
    }
}

// ============================================================================
// FULLSCREEN
// ============================================================================

let isFullscreen = false;

function toggleFullscreen() {
    if (!isFullscreen) {
        enterFullscreen();
    } else {
        exitFullscreen();
    }
}

function enterFullscreen() {
    const imageContainer = document.getElementById('imageContainer');
    if (imageContainer) {
        imageContainer.requestFullscreen().catch(err => {
            console.log('Error entering fullscreen:', err);
        });
        isFullscreen = true;
    }
}

function exitFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
        isFullscreen = false;
    }
}

document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    
    // Show/hide fullscreen counter
    const fullscreenCounter = document.getElementById('fullscreenCounter');
    if (fullscreenCounter) {
        if (isFullscreen && images.length > 0) {
            fullscreenCounter.style.display = 'block';
            document.getElementById('fullscreenCounterText').textContent = `${currentImageIndex + 1} / ${images.length}`;
        } else {
            fullscreenCounter.style.display = 'none';
        }
    }
});

// ============================================================================
// SLIDESHOW
// ============================================================================

// Start slideshow
function startSlideshow() {
    if (images.length <= 1) return;
    
    slideshowRunning = true;
    updateSlideshowIcon();
    
    // Show button initially
    const slideshowBtn = document.getElementById('slideshowBtn');
    slideshowBtn.classList.remove('hidden');
    slideshowVisible = true;
    
    // Start fade timer (fade after 3 seconds regardless of state)
    resetSlideshowFadeTimer();
    
    // Start interval (change image every 6 seconds)
    slideshowInterval = setInterval(() => {
        if (currentImageIndex < images.length - 1) {
            displayImageWithFade(currentImageIndex + 1);
        } else {
            displayImageWithFade(0); // Loop back to first image
        }
    }, 6000);
}

// Stop slideshow
function stopSlideshow() {
    slideshowRunning = false;
    clearInterval(slideshowInterval);
    clearTimeout(slideshowFadeTimeout);
    updateSlideshowIcon();
    
    const slideshowBtn = document.getElementById('slideshowBtn');
    if (slideshowBtn) {
        slideshowBtn.classList.remove('hidden');
        slideshowVisible = true;
        
        // Still fade after 3 seconds
        resetSlideshowFadeTimer();
    }
}

// Reset slideshow fade timer
function resetSlideshowFadeTimer() {
    clearTimeout(slideshowFadeTimeout);
    slideshowFadeTimeout = setTimeout(() => {
        const slideshowBtn = document.getElementById('slideshowBtn');
        if (slideshowBtn) {
            slideshowBtn.classList.add('hidden');
            slideshowVisible = false;
        }
    }, 3000);
}

// Toggle slideshow
function toggleSlideshow() {
    if (slideshowRunning) {
        stopSlideshow();
    } else {
        startSlideshow();
    }
}

// Update slideshow icon (play/pause)
function updateSlideshowIcon() {
    const icon = document.getElementById('slideshowIcon');
    if (slideshowRunning) {
        // Pause icon
        icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
        // Play icon
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
}

// Display image with fade transition
function displayImageWithFade(index) {
    const img = document.getElementById('currentImage');
    if (!img) return;
    
    // Fade out
    img.style.transition = 'opacity 0.5s ease';
    img.style.opacity = '0';
    
    setTimeout(() => {
        displayImage(index);
        // Fade in
        setTimeout(() => {
            const newImg = document.getElementById('currentImage');
            if (newImg) {
                newImg.style.opacity = '1';
            }
        }, 50);
    }, 500);
}

// Show slideshow button on mouse move
document.addEventListener('mousemove', () => {
    const slideshowBtn = document.getElementById('slideshowBtn');
    if (slideshowBtn && slideshowBtn.style.display !== 'none' && !slideshowVisible) {
        slideshowBtn.classList.remove('hidden');
        slideshowVisible = true;
        
        // Reset fade timer regardless of slideshow state
        resetSlideshowFadeTimer();
    }
});

// Slideshow button click handler
document.getElementById('slideshowBtn').addEventListener('click', toggleSlideshow);

// Connect transform buttons
document.getElementById('rotateLeftBtn').addEventListener('click', rotateLeft);
document.getElementById('rotateRightBtn').addEventListener('click', rotateRight);
document.getElementById('rotateUpBtn').addEventListener('click', rotateUp);
document.getElementById('rotateDownBtn').addEventListener('click', rotateDown);
document.getElementById('flipHorizontalBtn').addEventListener('click', () => {
    flipHorizontal = !flipHorizontal;
    applyTransformations();
});
document.getElementById('flipVerticalBtn').addEventListener('click', () => {
    flipVertical = !flipVertical;
    applyTransformations();
});
document.getElementById('resetTransformBtn').addEventListener('click', resetTransformations);

// ============================================================================
// ZOOM WITH MOUSE SCROLL
// ============================================================================

// Handle mouse wheel zoom on image container
imageContainer.addEventListener('wheel', (e) => {
    if (!currentImagePath) return;

    const img = document.getElementById('currentImage');
    if (!img) return;

    e.preventDefault();

    // Store previous zoom level
    const previousZoom = zoomLevel;

    // Zoom in/out based on scroll direction
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomLevel = Math.max(0.1, Math.min(5, zoomLevel + delta));

    // Calculate zoom ratio
    const zoomRatio = zoomLevel / previousZoom;

    // Get natural image dimensions (constant)
    const naturalImageWidth = img.naturalWidth;
    const naturalImageHeight = img.naturalHeight;

    // Get current displayed image dimensions
    const imageRect = img.getBoundingClientRect();
    const currentImageWidth = imageRect.width;
    const currentImageHeight = imageRect.height;

    // Calculate current scale factor
    const currentScale = currentImageWidth / naturalImageWidth;

    // Apply zoom with transform
    updateImageTransform();
}, { passive: false });

// Pan with middle click (scroll button)
imageContainer.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle click (scroll button)
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX - panTranslateX;
        panStartY = e.clientY - panTranslateY;
        imageContainer.style.cursor = 'grabbing';
    }
});

document.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panTranslateX = e.clientX - panStartX;
        panTranslateY = e.clientY - panStartY;
        updateImageTransform();
    }
});

document.addEventListener('mouseup', () => {
    isPanning = false;
    imageContainer.style.cursor = 'default';
});

function updateImageTransform() {
    const img = document.getElementById('currentImage');
    if (img) {
        img.style.transform = `translate(${panTranslateX}px, ${panTranslateY}px) scale(${zoomLevel})`;
        img.style.transition = 'transform 0.1s ease';
    }
}

// ============================================================================
// FULLSCREEN ON DOUBLE CLICK
// ============================================================================

// Open image in fullscreen on double click
imageContainer.addEventListener('dblclick', () => {
    if (currentImagePath) {
        ipcRenderer.send('open-fullscreen', currentImagePath, images, currentImageIndex);
    }
});

// ============================================================================
// IMAGE TRANSFORMATION - SCALE
// ============================================================================

scaleBtn.addEventListener('click', async () => {
    if (!currentImagePath) {
        alert(translations[currentLanguage].noImageLoaded);
        return;
    }
    
    const width = parseInt(scaleWidth.value);
    const height = parseInt(scaleHeight.value);
    
    if (!width || !height) {
        alert('Ingresa dimensiones válidas');
        return;
    }
    
    // Show progress modal
    progressModal.style.display = 'flex';
    progressMessage.textContent = translations[currentLanguage].scaling;
    
    try {
        const result = await ipcRenderer.invoke('scale-image', currentImagePath, currentImagePath, width, height, 'cover');
        
        if (result.success) {
            // Reload image with force reload to show changes
            displayImage(currentImageIndex, true);
        } else {
            alert(`${translations[currentLanguage].error}: ${result.error}`);
        }
    } catch (error) {
        alert(`${translations[currentLanguage].error}: ${error.message}`);
    } finally {
        progressModal.style.display = 'none';
    }
});

// ============================================================================
// IMAGE TRANSFORMATION - ROTATE
// ============================================================================

rotateButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!currentImagePath) {
            alert(translations[currentLanguage].noImageLoaded);
            return;
        }
        
        const angle = parseInt(btn.dataset.angle);
        
        // Show progress modal
        progressModal.style.display = 'flex';
        progressMessage.textContent = translations[currentLanguage].rotating;
        
        try {
            const result = await ipcRenderer.invoke('rotate-image', currentImagePath, currentImagePath, angle);
            
            if (result.success) {
                // Reload image with force reload to show changes
                displayImage(currentImageIndex, true);
            } else {
                alert(`${translations[currentLanguage].error}: ${result.error}`);
            }
        } catch (error) {
            alert(`${translations[currentLanguage].error}: ${error.message}`);
        } finally {
            progressModal.style.display = 'none';
        }
    });
});

// ============================================================================
// IMAGE CONVERSION
// ============================================================================

// Browse output path
browseOutputPath.addEventListener('click', async () => {
    const savePath = await ipcRenderer.invoke('select-save-path');
    if (savePath) {
        outputPath.value = savePath;
    }
});

// Convert image
convertBtn.addEventListener('click', async () => {
    if (!currentImagePath) {
        alert('No hay imagen cargada');
        return;
    }
    
    if (!outputPath.value) {
        alert('Selecciona la ruta de salida');
        return;
    }
    
    const format = targetFormat.value;
    const qual = parseInt(quality.value);
    
    // Show progress modal
    progressModal.style.display = 'flex';
    progressMessage.textContent = 'Convirtiendo imagen...';
    
    try {
        const result = await ipcRenderer.invoke('convert-image', currentImagePath, outputPath.value, format, qual);
        
        if (result.success) {
            alert('Imagen convertida exitosamente');
        } else {
            alert(`Error al convertir: ${result.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        progressModal.style.display = 'none';
    }
});

// ============================================================================
// WINDOW STATE EVENTS
// ============================================================================

// Handle window maximize event from main process
ipcRenderer.on('window-maximized', () => {
    document.body.classList.add('maximized');
});

// Handle window unmaximize event from main process
ipcRenderer.on('window-unmaximized', () => {
    document.body.classList.remove('maximized');
});

// ============================================================================
// FILE RENAME
// ============================================================================

// Rename current file
renameCurrentBtn.addEventListener('click', async () => {
    if (!currentImagePath) {
        alert(translations[currentLanguage].noImageLoaded);
        return;
    }
    
    const newName = newFileName.value.trim();
    if (!newName) {
        alert(translations[currentLanguage].enterName);
        return;
    }
    
    const ext = path.basename(currentImagePath).split('.').pop();
    const newPath = path.join(path.dirname(currentImagePath), `${newName}.${ext}`);
    
    const result = await ipcRenderer.invoke('rename-file', currentImagePath, newPath);
    
    if (result.success) {
        // Update images array
        const index = images.indexOf(currentImagePath);
        if (index !== -1) {
            images[index] = newPath;
            currentImagePath = newPath;
        }
        displayImage(currentImageIndex, true);
        newFileName.value = '';
        alert(translations[currentLanguage].success);
    } else {
        alert(`${translations[currentLanguage].error}: ${result.error}`);
    }
});

// Rename all files with sequential numbering
renameAllBtn.addEventListener('click', async () => {
    if (images.length === 0) {
        alert(translations[currentLanguage].noImagesLoaded);
        return;
    }
    
    const baseName = newFileName.value.trim();
    if (!baseName) {
        alert(translations[currentLanguage].enterBaseName);
        return;
    }
    
    const renameOperations = [];
    const errors = [];
    
    for (let i = 0; i < images.length; i++) {
        const oldPath = images[i];
        const ext = path.basename(oldPath).split('.').pop();
        const newPath = path.join(path.dirname(oldPath), `${baseName}_${String(i + 1).padStart(3, '0')}.${ext}`);
        renameOperations.push({ oldPath, newPath });
    }
    
    progressModal.style.display = 'flex';
    progressMessage.textContent = translations[currentLanguage].renaming;
    
    const result = await ipcRenderer.invoke('batch-rename-files', renameOperations);
    
    progressModal.style.display = 'none';
    
    if (result.success) {
        // Update images array with new paths
        images = renameOperations.map(op => op.newPath);
        currentImagePath = images[currentImageIndex];
        displayImage(currentImageIndex, true);
        newFileName.value = '';
        alert(`${result.total} ${translations[currentLanguage].filesRenamed}`);
    } else {
        alert(`${translations[currentLanguage].renameErrors}: ${result.failed}\n${result.errors.map(e => e.error).join('\n')}`);
    }
});

// ============================================================================
// UNDO/REDO SYSTEM
// ============================================================================

const MAX_HISTORY = 500;
let historyStack = [];
let redoStack = [];

// Save current state to history
function saveState() {
    const state = {
        stickers: stickers.map(s => ({
            id: s.id,
            name: s.name,
            src: s.src,
            left: s.element.style.left,
            top: s.element.style.top,
            width: s.element.style.width,
            height: s.element.style.height,
            transform: s.element.style.transform,
            zIndex: s.element.style.zIndex,
            rotation: s.element.dataset.rotation || 0
        })),
        currentImageIndex: currentImageIndex,
        images: [...images]
    };

    historyStack.push(JSON.stringify(state));
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }

    // Clear redo stack on new action
    redoStack = [];
}

// Restore state from history
function restoreState(stateStr) {
    const state = JSON.parse(stateStr);

    // Clear current stickers
    stickers.forEach(s => s.element.remove());
    stickers = [];

    // Restore stickers
    state.stickers.forEach(s => {
        const imageContainer = document.getElementById('imageContainer');
        if (!imageContainer) return;

        const stickerContainer = document.createElement('div');
        stickerContainer.className = 'sticker-container';
        stickerContainer.id = s.id;
        stickerContainer.style.left = s.left;
        stickerContainer.style.top = s.top;
        stickerContainer.style.width = s.width;
        stickerContainer.style.height = s.height;
        stickerContainer.style.transform = s.transform;
        stickerContainer.style.zIndex = s.zIndex;
        stickerContainer.dataset.name = s.name;
        stickerContainer.dataset.rotation = s.rotation;

        const stickerImage = document.createElement('img');
        stickerImage.className = 'sticker-image';
        stickerImage.src = s.src;
        stickerImage.style.width = '100%';
        stickerImage.style.height = '100%';
        stickerImage.style.objectFit = 'contain';

        // Delete button
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'sticker-delete';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSticker(s.id);
        });

        // Resize handles
        const handles = ['resize-se', 'resize-ne', 'resize-sw', 'resize-nw'];
        handles.forEach(handleClass => {
            const handle = document.createElement('div');
            handle.className = `sticker-handle ${handleClass}`;
            handle.dataset.handle = handleClass;
            stickerContainer.appendChild(handle);
        });

        // Rotate handle
        const rotateHandle = document.createElement('div');
        rotateHandle.className = 'sticker-handle rotate';
        rotateHandle.dataset.handle = 'rotate';
        stickerContainer.appendChild(rotateHandle);

        stickerContainer.appendChild(deleteBtn);
        stickerContainer.appendChild(stickerImage);
        imageContainer.appendChild(stickerContainer);

        stickers.push({
            id: s.id,
            element: stickerContainer,
            name: s.name,
            src: s.src
        });

        setupStickerEvents(stickerContainer);
    });

    // Restore images
    images = state.images;
    currentImageIndex = state.currentImageIndex;
    currentImagePath = images[currentImageIndex];

    // Update UI
    updateLayersList();
    displayImage(currentImageIndex, true);
}

// Undo
function undo() {
    if (historyStack.length === 0) return;

    // Save current state to redo stack
    const currentState = {
        stickers: stickers.map(s => ({
            id: s.id,
            name: s.name,
            src: s.src,
            left: s.element.style.left,
            top: s.element.style.top,
            width: s.element.style.width,
            height: s.element.style.height,
            transform: s.element.style.transform,
            zIndex: s.element.style.zIndex,
            rotation: s.element.dataset.rotation || 0
        })),
        currentImageIndex: currentImageIndex,
        images: [...images]
    };
    redoStack.push(JSON.stringify(currentState));

    // Restore previous state
    const previousState = historyStack.pop();
    restoreState(previousState);
}

// Redo
function redo() {
    if (redoStack.length === 0) return;

    // Save current state to history
    const currentState = {
        stickers: stickers.map(s => ({
            id: s.id,
            name: s.name,
            src: s.src,
            left: s.element.style.left,
            top: s.element.style.top,
            width: s.element.style.width,
            height: s.element.style.height,
            transform: s.element.style.transform,
            zIndex: s.element.style.zIndex,
            rotation: s.element.dataset.rotation || 0
        })),
        currentImageIndex: currentImageIndex,
        images: [...images]
    };
    historyStack.push(JSON.stringify(currentState));

    // Restore next state
    const nextState = redoStack.pop();
    restoreState(nextState);
}

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
    }
});

// ============================================================================
// STICKERS / OVERLAY IMAGES - REMOVED
// ============================================================================

// ============================================================================
// DELETE IMAGE
// ============================================================================

// Confirm delete image
function confirmDeleteImage(imagePath) {
    const fileName = path.basename(imagePath);
    const confirmed = confirm(`¿Estás seguro de que deseas eliminar "${fileName}"?\n\nEsta acción no se puede deshacer.`);

    if (confirmed) {
        deleteImage(imagePath);
    }
}

// Delete image
async function deleteImage(imagePath) {
    try {
        const result = await ipcRenderer.invoke('delete-file', imagePath);
        if (result.success) {
            // Remove from images array
            const index = images.indexOf(imagePath);
            if (index > -1) {
                images.splice(index, 1);
            }

            // Display next or previous image
            if (images.length > 0) {
                const newIndex = Math.min(index, images.length - 1);
                displayImage(newIndex);
            } else {
                // No more images
                currentImagePath = null;
                currentImageIndex = 0;
                const img = document.getElementById('currentImage');
                if (img) {
                    img.src = '';
                }
            }
        } else {
            alert(`Error al eliminar imagen: ${result.error}`);
        }
    } catch (error) {
        alert(`Error al eliminar imagen: ${error.message}`);
    }
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

// Context menu for right-click on image
imageContainer.addEventListener('contextmenu', (e) => {
    if (currentImagePath) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    }
});

// Show context menu
function showContextMenu(x, y) {
    // Remove existing context menu
    const existingMenu = document.getElementById('contextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // Create context menu
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        <span>Eliminar</span>
    `;
    deleteItem.addEventListener('click', () => {
        confirmDeleteImage(currentImagePath);
        menu.remove();
    });

    menu.appendChild(deleteItem);

    // Add decompress option if file is an archive
    const ext = path.extname(currentImagePath).toLowerCase();
    if (['.zip', '.tar', '.7z', '.rar'].includes(ext)) {
        const decompressItem = document.createElement('div');
        decompressItem.className = 'context-menu-item';
        decompressItem.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z"/></svg>
            <span>Descomprimir</span>
        `;
        decompressItem.addEventListener('click', () => {
            decompressFile(currentImagePath);
            menu.remove();
        });
        menu.appendChild(decompressItem);
    }

    document.body.appendChild(menu);

    // Close menu on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Decompress file
async function decompressFile(archivePath) {
    const password = prompt('Ingresa la contraseña (si el archivo está protegido):');

    const result = await ipcRenderer.invoke('decompress-file', archivePath, password || '');

    if (result.success) {
        alert(`Archivo descomprimido exitosamente en: ${result.outputPath}`);
    } else {
        alert(`Error al descomprimir: ${result.error}`);
    }
}

// ============================================================================
// COMPRESSOR
// ============================================================================

let selectedFilesForCompression = [];

// Open file selector for compression
document.getElementById('openFileSelectorBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const files = await ipcRenderer.invoke('select-files-for-compression');
    if (files.length > 0) {
        selectedFilesForCompression = [...selectedFilesForCompression, ...files];
        updateSelectedFilesList();
    }
});

// Update selected files list
function updateSelectedFilesList() {
    const container = document.getElementById('selectedFilesContainer');
    const list = document.getElementById('selectedFilesList');

    if (selectedFilesForCompression.length > 0) {
        container.style.display = 'block';
        list.innerHTML = '';

        selectedFilesForCompression.forEach((filePath, index) => {
            const item = document.createElement('div');
            item.className = 'selected-file-item';

            const fileName = document.createElement('span');
            fileName.className = 'file-name';
            fileName.textContent = path.basename(filePath);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'file-actions';

            // Check if file is an archive
            const ext = path.extname(filePath).toLowerCase();
            const isArchive = ['.zip', '.tar', '.7z', '.rar'].includes(ext);

            if (isArchive) {
                const decompressBtn = document.createElement('button');
                decompressBtn.className = 'decompress-file';
                decompressBtn.textContent = 'Descomprimir';
                decompressBtn.addEventListener('click', () => {
                    decompressFileFromList(filePath);
                });
                actionsDiv.appendChild(decompressBtn);
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                selectedFilesForCompression.splice(index, 1);
                updateSelectedFilesList();
            });

            actionsDiv.appendChild(removeBtn);
            item.appendChild(fileName);
            item.appendChild(actionsDiv);
            list.appendChild(item);
        });
    } else {
        container.style.display = 'none';
    }
}

// Decompress file from list
async function decompressFileFromList(archivePath) {
    const result = await ipcRenderer.invoke('decompress-file', archivePath, '');

    if (result.success) {
        alert(`Archivo descomprimido exitosamente en: ${result.outputPath}`);
    } else {
        alert(`Error al descomprimir: ${result.error}`);
    }
}

// Compress files
document.getElementById('compressBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (selectedFilesForCompression.length === 0) {
        alert('Por favor selecciona archivos para comprimir');
        return;
    }

    const format = document.getElementById('compressFormat').value;
    const fileName = document.getElementById('compressFileName').value.trim();
    const password = document.getElementById('compressPassword').value;
    const passwordConfirm = document.getElementById('compressPasswordConfirm').value;

    if (!fileName) {
        alert('Por favor ingresa un nombre para el archivo comprimido');
        return;
    }

    if (password && password !== passwordConfirm) {
        alert('Las contraseñas no coinciden');
        return;
    }

    const result = await ipcRenderer.invoke('compress-files', selectedFilesForCompression, format, fileName, password);

    if (result.success) {
        alert(`Archivo comprimido exitosamente: ${result.outputPath}`);
        // Clear selection
        selectedFilesForCompression = [];
        updateSelectedFilesList();
        document.getElementById('compressFileName').value = '';
        document.getElementById('compressPassword').value = '';
        document.getElementById('compressPasswordConfirm').value = '';
    } else {
        alert(`Error al comprimir: ${result.error}`);
    }
});

// Toggle section collapse function - make it globally accessible
window.toggleSection = function(sectionId) {
    console.log('toggleSection called with:', sectionId);
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.toggle('collapsed');
        console.log('Toggled collapsed class on:', sectionId, 'Current classes:', target.className);
    } else {
        console.log('Target not found:', sectionId);
    }
};

// Setup section collapse with event delegation (only for buttons and header, not h3)
document.addEventListener('click', (e) => {
    // Check if clicked on collapse button
    const btn = e.target.closest('.section-collapse-btn');
    if (btn) {
        e.stopPropagation();
        const targetId = btn.dataset.target;
        console.log('Collapse button clicked, targetId:', targetId);
        const target = document.getElementById(targetId);
        if (target) {
            target.classList.toggle('collapsed');
            console.log('Toggled collapsed class on:', targetId, 'Current classes:', target.className);
        }
        return;
    }

    // Check if clicked on section-header (but not on h3 or button)
    const header = e.target.closest('.section-header[data-target]');
    if (header && !e.target.closest('h3') && !e.target.closest('.section-collapse-btn')) {
        e.stopPropagation();
        const targetId = header.dataset.target;
        console.log('Section-header clicked, targetId:', targetId);
        const target = document.getElementById(targetId);
        if (target) {
            target.classList.toggle('collapsed');
            console.log('Toggled collapsed class on:', targetId, 'Current classes:', target.className);
        }
        return;
    }
});
