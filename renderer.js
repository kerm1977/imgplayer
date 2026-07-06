// ============================================================================
// IMAGE VIEWER ELECTRON - RENDERER PROCESS
// ============================================================================
// Main application logic for the image viewer.
// Handles UI interactions, image loading, and navigation.

const { ipcRenderer } = require('electron');

// ============================================================================
// DOM ELEMENTS
// ============================================================================

// Window controls
const winMinimize = document.getElementById('winMinimize');
const winMaximize = document.getElementById('winMaximize');
const winClose = document.getElementById('winClose');
const themeToggle = document.getElementById('themeToggle');

// Search
const searchInput = document.getElementById('searchInput');
const searchInfo = document.getElementById('searchInfo');

// Image viewer
const imageViewer = document.getElementById('imageViewer');
const imageNavigation = document.getElementById('imageNavigation');
const imageCounter = document.getElementById('imageCounter');
const prevImageBtn = document.getElementById('prevImageBtn');
const nextImageBtn = document.getElementById('nextImageBtn');

// Image info panel
const infoResolution = document.getElementById('infoResolution');
const infoAspect = document.getElementById('infoAspect');
const infoFormat = document.getElementById('infoFormat');
const infoSize = document.getElementById('infoSize');
const infoPath = document.getElementById('infoPath');

// Fullscreen modal
const fullscreenModal = document.getElementById('fullscreenModal');
const fullscreenImage = document.getElementById('fullscreenImage');
const fullscreenClose = document.getElementById('fullscreenClose');

// Help modal
const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');

console.log('Fullscreen modal elements:', fullscreenModal, fullscreenImage, fullscreenClose);

// Action buttons
const openImagesBtn = document.getElementById('openImagesBtn');
const helpBtn = document.getElementById('helpBtn');

// ============================================================================
// STATE
// ============================================================================

let images = [];
let originalImages = []; // Store original images for filtering
let currentImageIndex = 0;
let currentImagePath = null;
let currentRotation = 0;
let isImageFullscreen = false;
let currentZoom = 1;
let currentPanX = 0;
let currentPanY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let isFlipped = false;
let imageStates = {}; // Store rotation and flip state for each image

// ============================================================================
// WINDOW CONTROLS
// ============================================================================

winMinimize.addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
});

winMaximize.addEventListener('click', () => {
    if (currentImagePath) {
        // If there's an image loaded, toggle image fullscreen
        toggleImageFullscreen();
    } else {
        // Otherwise, maximize window normally
        ipcRenderer.send('maximize-window');
    }
});

winClose.addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

// Theme toggle
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLightTheme = document.body.classList.contains('light-theme');
    
    // Toggle icons
    const sunIcon = document.querySelector('.theme-icon-sun');
    const moonIcon = document.querySelector('.theme-icon-moon');
    
    if (isLightTheme) {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
    
    // Save theme preference
    localStorage.setItem('imageViewerTheme', isLightTheme ? 'light' : 'dark');
});

// ============================================================================
// IMAGE LOADING
// ============================================================================

function loadImages(imagePaths) {
    images = imagePaths;
    originalImages = imagePaths; // Store original images for filtering
    currentImageIndex = 0;
    
    if (images.length > 0) {
        loadImage(images[0]);
        imageNavigation.style.display = 'flex';
        updateImageCounter();
        saveState();
    } else {
        imageViewer.innerHTML = '<div class="no-image">No hay imágenes cargadas</div>';
        imageNavigation.style.display = 'none';
    }
}

function loadImage(imagePath) {
    currentImagePath = imagePath;
    
    // Load saved state for this image
    loadImageState(imagePath);
    
    currentZoom = 1;
    currentPanX = 0;
    currentPanY = 0;
    
    const img = document.createElement('img');
    img.src = `file://${imagePath}`;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    img.style.transform = `rotate(${currentRotation}deg) scale(${currentZoom}) translate(${currentPanX}px, ${currentPanY}px)`;
    img.style.borderRadius = '12px';
    img.style.cursor = 'grab';
    img.id = 'currentImage';
    
    // Add double click for fullscreen
    img.addEventListener('dblclick', toggleImageFullscreen);
    
    // Add wheel event for zoom
    img.addEventListener('wheel', handleZoom, { passive: false });
    
    // Add mouse events for pan
    img.addEventListener('mousedown', handleMouseDown);
    img.addEventListener('mousemove', handleMouseMove);
    img.addEventListener('mouseup', handleMouseUp);
    img.addEventListener('mouseleave', handleMouseUp);
    
    imageViewer.innerHTML = '';
    imageViewer.appendChild(img);
    
    // Load image metadata
    img.onload = () => {
        updateImageInfo(img, imagePath);
    };
    
    updateImageCounter();
    saveState();
}

function updateImageInfo(img, imagePath) {
    // Resolution
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    infoResolution.textContent = `${width} x ${height}`;
    
    // Aspect ratio
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(width, height);
    const aspectWidth = width / divisor;
    const aspectHeight = height / divisor;
    infoAspect.textContent = `${aspectWidth}:${aspectHeight}`;
    
    // Format
    const ext = imagePath.split('.').pop().toUpperCase();
    infoFormat.textContent = ext;
    
    // File size
    const fs = require('fs');
    try {
        const stats = fs.statSync(imagePath);
        const sizeInBytes = stats.size;
        const sizeInKB = sizeInBytes / 1024;
        const sizeInMB = sizeInKB / 1024;
        
        if (sizeInMB >= 1) {
            infoSize.textContent = `${sizeInMB.toFixed(2)} MB`;
        } else {
            infoSize.textContent = `${sizeInKB.toFixed(2)} KB`;
        }
    } catch (error) {
        infoSize.textContent = '-';
    }
    
    // Path
    const path = require('path');
    infoPath.textContent = path.basename(imagePath);
}

function rotateImage(direction) {
    const img = document.getElementById('currentImage');
    if (img) {
        if (direction === 'left') {
            currentRotation -= 90;
        } else {
            currentRotation += 90;
        }
        updateImageTransform();
        saveState();
    }
}

function toggleImageFullscreen() {
    const img = document.getElementById('currentImage');
    if (!img) return;
    
    isImageFullscreen = !isImageFullscreen;
    console.log('toggleImageFullscreen called, isImageFullscreen:', isImageFullscreen);
    
    if (isImageFullscreen) {
        // Enter fullscreen mode - show modal and set window to fullscreen
        console.log('Opening fullscreen modal with image:', currentImagePath);
        fullscreenImage.src = `file://${currentImagePath}`;
        fullscreenModal.classList.add('show');
        console.log('Modal show class added');
        
        // Set window to fullscreen
        ipcRenderer.send('set-fullscreen', true);
        
        // Add event listeners for fullscreen modal
        fullscreenImage.addEventListener('wheel', handleZoom, { passive: false });
        fullscreenImage.addEventListener('mousedown', handleMouseDown);
        fullscreenImage.addEventListener('mousemove', handleMouseMove);
        fullscreenImage.addEventListener('mouseup', handleMouseUp);
        fullscreenImage.addEventListener('mouseleave', handleMouseUp);
        fullscreenImage.addEventListener('dblclick', toggleImageFullscreen);
    } else {
        // Exit fullscreen mode - hide modal, reset window and reset to actual size
        console.log('Closing fullscreen modal');
        fullscreenModal.classList.remove('show');
        
        // Set window to normal
        ipcRenderer.send('set-fullscreen', false);
        
        resetImageSize();
        
        // Remove event listeners from fullscreen image
        fullscreenImage.removeEventListener('wheel', handleZoom);
        fullscreenImage.removeEventListener('mousedown', handleMouseDown);
        fullscreenImage.removeEventListener('mousemove', handleMouseMove);
        fullscreenImage.removeEventListener('mouseup', handleMouseUp);
        fullscreenImage.removeEventListener('mouseleave', handleMouseUp);
        fullscreenImage.removeEventListener('dblclick', toggleImageFullscreen);
    }
}

function toggleWindowFullscreen() {
    ipcRenderer.send('toggle-fullscreen');
}

function handleZoom(e) {
    e.preventDefault();
    
    const img = isImageFullscreen ? fullscreenImage : document.getElementById('currentImage');
    if (!img) return;
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    currentZoom = Math.max(0.1, Math.min(10, currentZoom + delta));
    
    updateImageTransform();
}

function handleMouseDown(e) {
    e.preventDefault();
    isDragging = true;
    dragStartX = e.clientX - currentPanX;
    dragStartY = e.clientY - currentPanY;
    const img = isImageFullscreen ? fullscreenImage : document.getElementById('currentImage');
    if (img) {
        img.style.cursor = 'grabbing';
    }
}

function handleMouseMove(e) {
    if (!isDragging) return;
    
    currentPanX = e.clientX - dragStartX;
    currentPanY = e.clientY - dragStartY;
    
    updateImageTransform();
}

function handleMouseUp(e) {
    isDragging = false;
    const img = isImageFullscreen ? fullscreenImage : document.getElementById('currentImage');
    if (img) {
        img.style.cursor = 'grab';
    }
}

function updateImageTransform() {
    const img = isImageFullscreen ? fullscreenImage : document.getElementById('currentImage');
    if (img) {
        const scaleX = isFlipped ? -1 : 1;
        img.style.transform = `rotate(${currentRotation}deg) scale(${scaleX * currentZoom}, ${currentZoom}) translate(${currentPanX}px, ${currentPanY}px)`;
    }
}

function resetImageSize() {
    currentZoom = 1;
    currentPanX = 0;
    currentPanY = 0;
    updateImageTransform();
    saveState();
}

function saveImageState() {
    if (!currentImagePath) return;
    
    imageStates[currentImagePath] = {
        rotation: currentRotation,
        flipped: isFlipped
    };
    
    // Save to localStorage for persistence
    localStorage.setItem('imageViewerImageStates', JSON.stringify(imageStates));
}

function loadImageState(imagePath) {
    if (imageStates[imagePath]) {
        currentRotation = imageStates[imagePath].rotation;
        isFlipped = imageStates[imagePath].flipped;
    } else {
        currentRotation = 0;
        isFlipped = false;
    }
}

function startSlideshow() {
    if (isSlideshowRunning || images.length === 0) return;
    
    isSlideshowRunning = true;
    console.log('Slideshow started');
    
    slideshowInterval = setInterval(() => {
        // Navigate to next image
        if (currentImageIndex < images.length - 1) {
            currentImageIndex++;
        } else {
            currentImageIndex = 0;
        }
        currentImagePath = images[currentImageIndex];
        
        if (isImageFullscreen) {
            // Update fullscreen image
            fullscreenImage.src = `file://${currentImagePath}`;
        } else {
            // Update normal viewer image
            loadImage(currentImagePath);
        }
        
        updateImageCounter();
    }, 6000); // 6 seconds
}

function pauseSlideshow() {
    if (!isSlideshowRunning) return;
    
    isSlideshowRunning = false;
    console.log('Slideshow paused');
    
    if (slideshowInterval) {
        clearInterval(slideshowInterval);
        slideshowInterval = null;
    }
}

function filterImages(searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        // If search is empty, restore original images
        images = [...originalImages];
        searchInfo.textContent = '';
        return;
    }
    
    const term = searchTerm.toLowerCase();
    const fs = require('fs');
    const path = require('path');
    
    const filtered = originalImages.filter(imagePath => {
        const filename = path.basename(imagePath).toLowerCase();
        const ext = path.extname(imagePath).toLowerCase().replace('.', '');
        
        // Get file size
        let sizeInKB = 0;
        try {
            const stats = fs.statSync(imagePath);
            sizeInKB = stats.size / 1024;
        } catch (error) {
            // Ignore errors
        }
        
        // Check if search term matches any criteria
        const matchesName = filename.includes(term);
        const matchesFormat = ext.includes(term);
        const matchesSize = sizeInKB.toString().includes(term);
        
        // For aspect ratio, we need to load the image first
        // For now, just check name, format, and size
        return matchesName || matchesFormat || matchesSize;
    });
    
    images = filtered;
    searchInfo.textContent = `${filtered.length} de ${originalImages.length} imágenes`;
    
    // If we have filtered images, load the first one
    if (filtered.length > 0) {
        currentImageIndex = 0;
        loadImage(filtered[0]);
    } else {
        imageViewer.innerHTML = '<div class="no-image">No se encontraron imágenes</div>';
        imageNavigation.style.display = 'none';
    }
}

function saveState() {
    const state = {
        images: images,
        currentImageIndex: currentImageIndex,
        currentImagePath: currentImagePath
    };
    localStorage.setItem('imageViewerState', JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem('imageViewerState');
    if (savedState) {
        const state = JSON.parse(savedState);
        images = state.images || [];
        currentImageIndex = state.currentImageIndex || 0;
        currentImagePath = state.currentImagePath || null;
        
        if (images.length > 0 && currentImagePath) {
            loadImage(currentImagePath);
            imageNavigation.style.display = 'flex';
            updateImageCounter();
        }
    }
}

function updateImageCounter() {
    if (images.length > 0) {
        imageCounter.textContent = `${currentImageIndex + 1} / ${images.length}`;
    }
}

// ============================================================================
// IMAGE NAVIGATION
// ============================================================================

prevImageBtn.addEventListener('click', () => {
    if (images.length > 0) {
        if (currentImageIndex > 0) {
            currentImageIndex--;
        } else {
            currentImageIndex = images.length - 1; // Go to last image
        }
        loadImage(images[currentImageIndex]);
    }
});

nextImageBtn.addEventListener('click', () => {
    if (images.length > 0) {
        if (currentImageIndex < images.length - 1) {
            currentImageIndex++;
        } else {
            currentImageIndex = 0; // Go to first image
        }
        loadImage(images[currentImageIndex]);
    }
});

// ============================================================================
// ACTION BUTTONS
// ============================================================================

openImagesBtn.addEventListener('click', async () => {
    const imageFiles = await ipcRenderer.invoke('select-image-files');
    if (imageFiles && imageFiles.length > 0) {
        // Load all images from the same folder as the first selected image
        const folderImages = await ipcRenderer.invoke('load-folder-images', imageFiles[0]);
        loadImages(folderImages);
        
        // Set current index to the first selected image
        const selectedIndex = folderImages.indexOf(imageFiles[0]);
        if (selectedIndex !== -1) {
            currentImageIndex = selectedIndex;
            loadImage(imageFiles[0]);
        }
    }
});

// Close fullscreen modal
fullscreenClose.addEventListener('click', () => {
    if (isImageFullscreen) {
        toggleImageFullscreen();
    }
});

helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'flex';
});

helpClose.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// Close help modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && helpModal.style.display === 'flex') {
        helpModal.style.display = 'none';
    }
});

// Live search
searchInput.addEventListener('input', (e) => {
    filterImages(e.target.value);
});

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keydown', (e) => {
    console.log('Key pressed:', e.key, 'images.length:', images.length);
    
    // Shift+A: Open images
    if (e.shiftKey && e.key === 'A') {
        e.preventDefault();
        openImagesBtn.click();
    }
    
    // a: Navigate to previous image (works in both normal and fullscreen mode)
    if (e.key === 'a' && images.length > 0) {
        e.preventDefault();
        console.log('Key a pressed, isImageFullscreen:', isImageFullscreen);
        if (isImageFullscreen) {
            // In fullscreen mode, navigate and update fullscreen image only
            if (currentImageIndex > 0) {
                currentImageIndex--;
            } else {
                currentImageIndex = images.length - 1;
            }
            currentImagePath = images[currentImageIndex];
            console.log('Updating fullscreen image to:', currentImagePath);
            fullscreenImage.src = `file://${currentImagePath}`;
            // Load saved state for the new image
            loadImageState(currentImagePath);
            updateImageTransform();
            updateImageCounter();
        } else {
            // In normal mode, use the button click
            prevImageBtn.click();
        }
    }
    
    // s: Navigate to next image (works in both normal and fullscreen mode)
    if (e.key === 's' && images.length > 0) {
        e.preventDefault();
        console.log('Key s pressed, isImageFullscreen:', isImageFullscreen);
        if (isImageFullscreen) {
            // In fullscreen mode, navigate and update fullscreen image only
            if (currentImageIndex < images.length - 1) {
                currentImageIndex++;
            } else {
                currentImageIndex = 0;
            }
            currentImagePath = images[currentImageIndex];
            console.log('Updating fullscreen image to:', currentImagePath);
            fullscreenImage.src = `file://${currentImagePath}`;
            // Load saved state for the new image
            loadImageState(currentImagePath);
            updateImageTransform();
            updateImageCounter();
        } else {
            // In normal mode, use the button click
            nextImageBtn.click();
        }
    }
    
    // q: Rotate left
    if (e.key === 'q' && currentImagePath) {
        e.preventDefault();
        currentRotation -= 90;
        saveImageState();
        updateImageTransform();
    }
    
    // w: Rotate right
    if (e.key === 'w' && currentImagePath) {
        e.preventDefault();
        currentRotation += 90;
        saveImageState();
        updateImageTransform();
    }
    
    // r: Flip image
    if (e.key === 'r' && currentImagePath) {
        e.preventDefault();
        isFlipped = !isFlipped;
        saveImageState();
        updateImageTransform();
    }
    
    // Space: Reset to actual size
    if (e.key === ' ' && currentImagePath) {
        e.preventDefault();
        resetImageSize();
    }
    
    // Escape: Close fullscreen modal
    if (e.key === 'Escape' && isImageFullscreen) {
        e.preventDefault();
        toggleImageFullscreen();
    }
    
    // ?: Help
    if (e.key === '?') {
        e.preventDefault();
        helpBtn.click();
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load saved theme preference
const savedTheme = localStorage.getItem('imageViewerTheme');
if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const sunIcon = document.querySelector('.theme-icon-sun');
    const moonIcon = document.querySelector('.theme-icon-moon');
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'block';
}

// Load saved image states
const savedImageStates = localStorage.getItem('imageViewerImageStates');
if (savedImageStates) {
    try {
        imageStates = JSON.parse(savedImageStates);
    } catch (error) {
        console.error('Error loading image states:', error);
        imageStates = {};
    }
}

// Load saved state
loadState();

console.log('ImageViewerElectron renderer process initialized');
