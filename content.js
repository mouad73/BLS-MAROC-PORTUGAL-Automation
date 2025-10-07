// Content Script - BLS Auto Login with Proxy Management
console.log('[BLS Content] Script loaded');

// Global state
let autoLoginEnabled = false; // Disabled by default - user must click Start in popup
let currentUser = null;
let monitorInterval = null;
let currentIP = 'Loading...';
let proxyStatus = { currentProxy: null, proxyList: [], autoRotateEnabled: false };

let processingStates = {
    formFilled: false,
    verifyClicked: false,
    loginAttempted: false
};

// ========================================
// UI NOTIFICATION SYSTEM
// ========================================
function showNotification(message, type = 'info', duration = 5000) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.bls-notification');
    existing.forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `bls-notification bls-notification-${type}`;
    
    // Icon based on type
    const icons = {
        'error': '❌',
        'warning': '⚠️',
        'success': '✅',
        'info': 'ℹ️'
    };
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">${icons[type] || icons.info}</span>
            <div style="flex: 1;">
                <div style="font-weight: bold; margin-bottom: 5px;">${type.toUpperCase()}</div>
                <div>${message}</div>
            </div>
            <button class="bls-notification-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit; padding: 0 5px;">✕</button>
        </div>
    `;
    
    // Styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        minWidth: '300px',
        maxWidth: '500px',
        padding: '15px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '999999',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        animation: 'slideInRight 0.3s ease-out',
        cursor: 'default'
    });
    
    // Type-specific colors
    const colors = {
        'error': { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
        'warning': { bg: '#fff3cd', color: '#856404', border: '#ffeeba' },
        'success': { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
        'info': { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' }
    };
    
    const colorScheme = colors[type] || colors.info;
    notification.style.background = colorScheme.bg;
    notification.style.color = colorScheme.color;
    notification.style.border = `1px solid ${colorScheme.border}`;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Close button handler
    const closeBtn = notification.querySelector('.bls-notification-close');
    closeBtn.onclick = () => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    };
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
    
    // Add animation keyframes if not exists
    if (!document.getElementById('bls-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'bls-notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    return notification;
}

// ========================================
// AUTOMATION CONTROL (via Popup AND Main UI)
// ========================================
let isAutomationEnabled = false;

// Automation controls integrated into main UI - no separate panel needed

function updateAutomationUI(isRunning) {
    const startBtn = document.getElementById('startAutomationBtn');
    const stopBtn = document.getElementById('stopAutomationBtn');
    const statusBadge = document.getElementById('automationStatusBadge');
    
    if (!startBtn || !stopBtn) return;
    
    if (isRunning) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (statusBadge) {
            statusBadge.textContent = '🟢 RUNNING';
            statusBadge.style.background = '#d4edda';
            statusBadge.style.color = '#155724';
            statusBadge.style.borderLeft = '4px solid #28a745';
        }
    } else {
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (statusBadge) {
            statusBadge.textContent = '🔴 STOPPED';
            statusBadge.style.background = '#f8d7da';
            statusBadge.style.color = '#721c24';
            statusBadge.style.borderLeft = '4px solid #dc3545';
        }
    }
}

function startAutomationFromUI() {
    isAutomationEnabled = true;
    autoLoginEnabled = true;
    saveAutomationState(true); // Persist across pages
    console.log('[BLS Auto] 🚀 Automation STARTED - Will continue across ALL pages');
    
    showNotification(
        'Automation Started!\n\nThe extension will now automate BLS appointment booking across all pages.',
        'success',
        4000
    );
    
    // Captcha monitoring is already running, just enable automation
    
    // Start page-specific automation immediately
    if (isLoginPage() && currentUser) {
        console.log('[BLS Auto] Starting login automation...');
        resetProcessingStates();
        startMonitoring();
        // Click verify button immediately when automation starts
        setTimeout(() => clickInitialVerify(), 1000);
    }
    
    if (isHomePage()) {
        console.log('[BLS Auto] Starting home redirect automation...');
        setTimeout(checkAndRedirectFromHome, 500);
        const homeInterval = setInterval(() => {
            if (!isAutomationEnabled) clearInterval(homeInterval);
            else checkAndRedirectFromHome();
        }, 3000);
    }
    
    if (isVisaTypePage()) {
        console.log('[BLS Auto] Starting visa type autofill...');
        setTimeout(() => runVisaTypeAutofill(), 1000);
    }
    
    if (isSlotSelectionPage()) {
        console.log('[BLS Auto] Starting slot selection automation...');
        setTimeout(() => runAutoSelectDateAndSlots(), 1000);
    }
    
    if (isApplicantSelectionPage()) {
        console.log('[BLS Auto] Starting applicant selection automation...');
        startAgreeButtonMonitoring();
    }
    
    if (isErrorPage() || isPendingAppointmentPage()) {
        console.log('[BLS Auto] Starting error page redirect...');
        setTimeout(handleErrorRedirect, 1000);
        const errorInterval = setInterval(() => {
            if (!isAutomationEnabled) clearInterval(errorInterval);
            else handleErrorRedirect();
        }, 2000);
    }
    
    updateAutomationUI(true);
}

function stopAutomationFromUI() {
    isAutomationEnabled = false;
    autoLoginEnabled = false;
    saveAutomationState(false); // Persist stop state
    console.log('[BLS Auto] ⏸️ Automation STOPPED by user');
    
    showNotification(
        'Automation Stopped!\n\nAll automation processes have been paused.',
        'info',
        3000
    );
    
    // Stop login monitoring but keep captcha solver running in background
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    
    // DON'T stop captcha monitoring - let it run in background always
    // This way captchas are solved even when automation is paused
    
    updateAutomationUI(false);
}

// Listen for messages from popup to start/stop automation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startAutomation') {
        startAutomationFromUI();
        sendResponse({ success: true, message: 'Automation started' });
    } else if (request.action === 'stopAutomation') {
        stopAutomationFromUI();
        sendResponse({ success: true, message: 'Automation stopped' });
    } else if (request.action === 'getAutomationStatus') {
        sendResponse({ 
            isRunning: isAutomationEnabled,
            autoLoginEnabled: autoLoginEnabled,
            currentPage: window.location.href
        });
    }
    return true; // Keep message channel open for async response
});

function updateCurrentPageName() {
    const pageNameEl = document.getElementById('currentPageName');
    if (!pageNameEl) return;
    
    if (isLoginPage()) pageNameEl.textContent = 'Login';
    else if (isHomePage()) pageNameEl.textContent = 'Home';
    else if (isVisaTypePage()) pageNameEl.textContent = 'Visa Type';
    else if (isSlotSelectionPage()) pageNameEl.textContent = 'Slot Selection';
    else if (isApplicantSelectionPage()) pageNameEl.textContent = 'Applicant Selection';
    else if (isErrorPage()) pageNameEl.textContent = 'Error';
    else pageNameEl.textContent = 'BLS Portal';
}

// Persist automation state across pages using sessionStorage
function saveAutomationState(isRunning) {
    try {
        sessionStorage.setItem('bls_automation_running', isRunning ? 'true' : 'false');
        console.log('[BLS Auto] Automation state saved:', isRunning);
    } catch (e) {
        console.error('[BLS Auto] Failed to save state:', e);
    }
}

function getAutomationState() {
    try {
        return sessionStorage.getItem('bls_automation_running') === 'true';
    } catch (e) {
        return false;
    }
}

function checkAndRestoreAutomationState() {
    const wasRunning = getAutomationState();
    console.log('[BLS Auto] 🔍 Checking automation state on page load...', wasRunning ? 'WAS RUNNING' : 'WAS STOPPED');
    
    if (wasRunning) {
        console.log('[BLS Auto] 🔄 Restoring automation state from previous page...');
        console.log('[BLS Auto] 📍 Current page:', window.location.pathname);
        
        // Wait a bit for UI to be ready, then restore
        setTimeout(() => {
            console.log('[BLS Auto] ✅ Re-starting automation on new page...');
            startAutomationFromUI();
        }, 1000); // Increased from 500ms to 1000ms for more reliable restoration
    } else {
        console.log('[BLS Auto] ⏸️ Automation was stopped - staying stopped');
        // Make sure UI shows stopped state
        updateAutomationUI(false);
    }
}

// ========================================
// CAPTCHA SOLVER MODULE
// ========================================
let captchaConfig = {
    enabled: true,
    apiKey: "", // Add your NoCaptcha API key here
    apiUrl: "https://pro.nocaptchaai.com/",
    softId: "BLS_UNIFIED_V1",
    checkInterval: 500,
    lastCaptchaHash: null
};

// Load captcha config from storage
chrome.storage.sync.get(['captchaConfig'], (result) => {
    if (result.captchaConfig) {
        captchaConfig = { ...captchaConfig, ...result.captchaConfig };
        console.log('[BLS Content] Loaded captcha config:', captchaConfig);
    }
    console.log('[BLS Captcha] Captcha solver enabled:', captchaConfig.enabled);
    console.log('[BLS Captcha] API Key:', captchaConfig.apiKey ? 'Set ✅' : 'Missing ❌');
});

// Save captcha config to storage
function saveCaptchaConfig() {
    chrome.storage.sync.set({ captchaConfig }, () => {
        console.log('[BLS Content] Captcha config saved');
    });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========================================
// AUTO-DISMISS ALERTS MODULE
// ========================================
// Override JavaScript alert/confirm/prompt functions
(function initAlertDismisser() {
    console.log('[BLS Alert] 🔇 Initializing auto-dismiss alerts...');
    
    // Store originals
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;
    
    // Override alert
    window.alert = function(message) {
        console.log('[BLS Alert] 🔇 Auto-dismissed alert:', message);
        return undefined;
    };
    
    // Override confirm (always return true = OK)
    window.confirm = function(message) {
        console.log('[BLS Alert] ✅ Auto-confirmed dialog:', message);
        return true;
    };
    
    // Override prompt (return empty string)
    window.prompt = function(message, defaultText = '') {
        console.log('[BLS Alert] 🔇 Auto-dismissed prompt:', message);
        return defaultText;
    };
    
    console.log('[BLS Alert] ✅ Alert auto-dismiss active');
})();

// ========================================
// PAGE DETECTION HELPERS
// ========================================
const isLoginPage = () => {
    return window.location.href === 'https://morocco.blsportugal.com/MAR/account/login' ||
           window.location.href.startsWith('https://morocco.blsportugal.com/MAR/account/login') ||
           /\/account\/login/i.test(location.pathname) || 
           /\/Account\/LogIn/i.test(location.pathname);
};

const isHomePage = () => {
    const currentURL = window.location.href;
    return currentURL.includes('/home/') ||
           currentURL.includes('/home') ||
           currentURL.match(/\/MAR\/?$/);
};

const isVisaTypePage = () => {
    return window.location.href.includes('/Appointment/VisaType');
};

const isSlotSelectionPage = () => {
    return window.location.href.includes('/Appointment/SlotSelection');
};

const isApplicantSelectionPage = () => {
    return window.location.href.includes('/Appointment/ApplicantSelection');
};

const isErrorPage = () => {
    return window.location.href.includes('/Home/Error') ||
           window.location.href.includes('?msg=') ||
           window.location.href.includes('NewAppointment?msg');
};

const isPendingAppointmentPage = () => {
    return window.location.href.includes('/Appointment/PendingAppointment');
};

// Captcha detection helpers - Check both main document AND iframes
const isImageCaptchaOpen = () => {
    // Check main document
    let cols = document.querySelectorAll('.col-4').length;
    let labels = document.querySelectorAll('.box-label').length;
    let actions = document.querySelectorAll('.img-actions').length;
    
    // Special case: AppointmentCaptcha page doesn't have .img-actions
    // Instead it has: <a href="javascript:OnClearSelect();">Clear Selection</a>
    const hasClearSelection = document.querySelector('a[href*="OnClearSelect"]') !== null;
    const hasCaptchaForm = document.querySelector('#captchaForm') !== null;
    
    // Check iframes if not found in main document
    if (cols === 0 || labels === 0) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeCols = iframeDoc.querySelectorAll('.col-4').length;
                const iframeLabels = iframeDoc.querySelectorAll('.box-label').length;
                const iframeActions = iframeDoc.querySelectorAll('.img-actions').length;
                const iframeClearSelection = iframeDoc.querySelector('a[href*="OnClearSelect"]') !== null;
                
                // Captcha loaded if we have cols + labels + (actions OR clear selection)
                if (iframeCols > 0 && iframeLabels > 0 && (iframeActions > 0 || iframeClearSelection)) {
                    console.log('[BLS Captcha] 🔍 Found fully loaded captcha in iframe!');
                    window.__CAPTCHA_IFRAME__ = iframe;
                    return true;
                }
            } catch (e) {
                // Cross-origin iframe, skip
            }
        }
    }
    
    // Main document captcha - check for EITHER .img-actions OR clear selection link
    if (cols > 0 && labels > 0 && (actions > 0 || hasClearSelection || hasCaptchaForm)) {
        window.__CAPTCHA_IFRAME__ = null; // Captcha is in main document
        console.log('[BLS Captcha] 🔍 Found fully loaded captcha in main document!');
        return true;
    }
    
    return false;
};

const getCaptchaHash = () => {
    const doc = window.__CAPTCHA_IFRAME__ ? (window.__CAPTCHA_IFRAME__.contentDocument || window.__CAPTCHA_IFRAME__.contentWindow.document) : document;
    const images = [...doc.querySelectorAll('.col-4 img')].map(img => img.src).join('|');
    const target = getTargetNumber();
    return `${images}|${target}`;
};

// DOM helpers for captcha solving
const findElementByPosition = (left, top) => {
    const doc = window.__CAPTCHA_IFRAME__ ? (window.__CAPTCHA_IFRAME__.contentDocument || window.__CAPTCHA_IFRAME__.contentWindow.document) : document;
    const elements = [...doc.querySelectorAll(".col-4")].filter(el => el.getClientRects().length);
    let maxZ = 0;
    let found = null;
    for (const el of elements) {
        const style = doc.defaultView.getComputedStyle(el, null);
        const elLeft = style.getPropertyValue("left");
        const elTop = style.getPropertyValue("top");
        const zIndex = style.getPropertyValue("z-index");
        if (elLeft === `${left}px` && elTop === `${top}px` && parseInt(zIndex) > maxZ && zIndex !== "auto") {
            maxZ = parseInt(zIndex);
            found = el;
        }
    }
    return found;
};

const getTargetNumber = () => {
    const doc = window.__CAPTCHA_IFRAME__ ? (window.__CAPTCHA_IFRAME__.contentDocument || window.__CAPTCHA_IFRAME__.contentWindow.document) : document;
    const labels = [...doc.querySelectorAll(".box-label")];
    let maxZ = 0;
    let targetText = null;
    for (const label of labels) {
        const zIndex = doc.defaultView.getComputedStyle(label, null).getPropertyValue("z-index");
        if (parseInt(zIndex) > maxZ && zIndex !== "auto") {
            maxZ = parseInt(zIndex);
            targetText = label.innerText.replace(/\D/g, "");
        }
    }
    return targetText;
};

const simulateClick = (element, options = {}) => {
    if (!element) return;
    const events = ["mouseover", "mousedown", "mouseup", "click"];
    options.bubbles = true;
    for (const eventType of events) {
        const event = new MouseEvent(eventType, options);
        element.dispatchEvent(event);
    }
};

const callCaptchaAPI = async (data, endpoint = "solve", method = "POST") => {
    const requestOptions = {
        method,
        headers: {
            "Content-Type": "application/json",
            "apikey": captchaConfig.apiKey,
            "softid": captchaConfig.softId
        }
    };
    if (method !== "GET") requestOptions.body = JSON.stringify(data);
    try {
        const response = await fetch(`${captchaConfig.apiUrl}${endpoint}`, requestOptions);
        const result = await response.json();
        if (result.error) {
            console.error('[BLS Captcha] API Error:', result.error);
            
            // Show UI notification for critical errors
            if (result.error.includes('Daily limit exhausted')) {
                const match = result.error.match(/(\d+)\s*seconds/);
                const secondsLeft = match ? parseInt(match[1]) : 0;
                const hoursLeft = Math.floor(secondsLeft / 3600);
                const minutesLeft = Math.floor((secondsLeft % 3600) / 60);
                
                const timeMessage = hoursLeft > 0 
                    ? `${hoursLeft}h ${minutesLeft}m` 
                    : `${minutesLeft} minutes`;
                
                showNotification(
                    `Captcha API Daily Limit Exhausted!\n\nTry again after: ${timeMessage}\n\nAutomation will pause until limit resets.`,
                    'error',
                    10000 // Show for 10 seconds
                );
                
                // Stop automation
                stopAutomationFromUI();
            } else if (result.error.includes('Invalid API key') || result.error.includes('apikey')) {
                showNotification(
                    `Invalid Captcha API Key!\n\nPlease check your NoCaptchaAI API key in the extension settings.`,
                    'error',
                    8000
                );
            } else {
                // Generic API error
                showNotification(
                    `Captcha API Error: ${result.error}`,
                    'warning',
                    6000
                );
            }
            
            return null;
        }
        return result;
    } catch (err) {
        console.error('[BLS Captcha] Network Error:', err);
        showNotification(
            `Captcha API Network Error!\n\nCannot connect to NoCaptchaAI service. Check your internet connection.`,
            'error',
            6000
        );
        return null;
    }
};

// Core captcha solver (simplified like working Tampermonkey script)
const solveCaptcha = async () => {
    console.log('[BLS Captcha] Starting captcha solve...');
    
    let attempts = 0;
    let elements = [];
    let targetNumber = null;
    
    // Wait for captcha elements to load
    while (attempts < 15) {
        const positions = [
            [0,0],[110,0],[220,0],
            [0,110],[110,110],[220,110],
            [0,220],[110,220],[220,220]
        ];
        elements = positions.map(([l,t]) => findElementByPosition(l,t));
        targetNumber = getTargetNumber();
        
        if (elements.filter(Boolean).length >= 6 && targetNumber) break;
        await delay(500);
        attempts++;
    }
    
    if (!targetNumber || elements.filter(Boolean).length < 6) {
        console.log('[BLS Captcha] ❌ Failed to find captcha elements');
        
        // Check if captcha failed to load (403 error on GenerateCaptcha)
        const captchaError = document.body.textContent.includes('403') || 
                            document.querySelector('.error, .alert-danger');
        
        if (captchaError || elements.filter(Boolean).length === 0) {
            showNotification(
                'Captcha Failed to Load!\n\nThe captcha images could not load (403 error).\n\nThis usually means:\n• Rate limited by BLS server\n• Proxy is blocked\n• Need to rotate proxy\n\nRotating to next proxy...',
                'error',
                8000
            );
            
            // Trigger proxy rotation
            await handleRateLimitWithAutoRotate();
        }
        
        return false;
    }

    console.log(`[BLS Captcha] 🎯 Target number: ${targetNumber}, Found ${elements.filter(Boolean).length} images`);

    // Build image data for API - EXACTLY like Tampermonkey script
    const imageData = {};
    const imageSources = {};
    
    elements.forEach((el, idx) => {
        if (!el) return;
        const img = el.querySelector("img");
        if (img && img.src && img.src.startsWith("data:image")) {
            imageData[idx] = img.src.replace(/^data:image\/(png|jpeg|gif);base64,/, "");
            imageSources[idx] = img.src;
        }
    });
    
    if (Object.keys(imageData).length === 0) {
        console.log('[BLS Captcha] ❌ No images found');
        return false;
    }

    console.log(`[BLS Captcha] 📤 Sending ${Object.keys(imageData).length} images to API...`);
    const apiData = { id: "morocco", method: "ocr", images: imageData, softid: captchaConfig.softId };
    const result = await callCaptchaAPI(apiData);
    
    if (!result || !result.solution) {
        console.log('[BLS Captcha] ❌ API returned no solution');
        return false;
    }

    console.log('[BLS Captcha] 📊 API Response:', result.solution);
    const solution = result.solution;
    let clicked = 0;
    
    const doc = window.__CAPTCHA_IFRAME__ ? (window.__CAPTCHA_IFRAME__.contentDocument || window.__CAPTCHA_IFRAME__.contentWindow.document) : document;
    
    // Click matching images - EXACTLY like Tampermonkey script
    if (Array.isArray(solution)) {
        // Array format: [{solution: "123"}, {solution: "456"}, ...]
        solution.forEach((item, idx) => {
            if (item.solution === targetNumber) {
                const src = imageSources[idx];
                if (src) {
                    const imgEl = doc.querySelector(`img[src="${src}"]`);
                    if (imgEl) {
                        simulateClick(imgEl);
                        clicked++;
                        console.log(`[BLS Captcha] ✅ Clicked image ${idx} (value: ${item.solution})`);
                    }
                }
            }
        });
    } else {
        // Object format: {0: "123", 1: "456", ...}
        Object.keys(solution).forEach(idx => {
            if (solution[idx] === targetNumber) {
                const src = imageSources[idx];
                if (src) {
                    const imgEl = doc.querySelector(`img[src="${src}"]`);
                    if (imgEl) {
                        simulateClick(imgEl);
                        clicked++;
                        console.log(`[BLS Captcha] ✅ Clicked image ${idx} (value: ${solution[idx]})`);
                    }
                }
            }
        });
    }

    console.log(`[BLS Captcha] ✅ Total clicked: ${clicked} images`);
    await delay(50);

    // Try captcha inner submit (for modal captchas with .img-actions)
    const innerSubmit = doc.querySelector("#captchaForm .img-actions > div:nth-child(3)") ||
                        doc.querySelector("input[type='submit']") ||
                        doc.querySelector(".submit-btn") ||
                        doc.querySelector("[onclick*='submit']");
    if (innerSubmit) {
        console.log('[BLS Captcha] ✅ Clicking inner submit button (modal captcha)');
        simulateClick(innerSubmit);
        await delay(2000); // Wait for processing
    }
    
    // For AppointmentCaptcha page (/MAR/Appointment/AppointmentCaptcha), 
    // the submit button is directly in the form
    const appointmentSubmit = doc.querySelector('#captchaForm button[id="btnVerify"][type="submit"]') ||
                             doc.querySelector('#captchaForm button[onclick*="OnCaptchaSubmit"]');
    
    if (appointmentSubmit) {
        console.log('[BLS Captcha] ✅ Found AppointmentCaptcha submit button, clicking...');
        simulateClick(appointmentSubmit);
        return true; // Done - no need to look for main submit or close popup
    }

    // Close the Kendo window popup (only for modal captchas)
    console.log('[BLS Captcha] 🔍 Looking for popup close button...');
    
    await delay(500);
    
    // Try multiple methods to close the popup
    // Method 1: Click the close button with aria-label="Close"
    let closeButton = document.querySelector('.k-window-actions a[aria-label="Close"]');
    if (closeButton) {
        console.log('[BLS Captcha] ✅ Found close button (Method 1), closing popup...');
        closeButton.click();
    } else {
        // Method 2: Find close button by class
        closeButton = document.querySelector('.k-window-action .k-i-close');
        if (closeButton && closeButton.parentElement) {
            console.log('[BLS Captcha] ✅ Found close button (Method 2), closing popup...');
            closeButton.parentElement.click();
        } else {
            // Method 3: Find any close button in window actions
            closeButton = document.querySelector('.k-window-actions .k-button-icon:last-child');
            if (closeButton) {
                console.log('[BLS Captcha] ✅ Found close button (Method 3), closing popup...');
                closeButton.click();
            } else {
                console.log('[BLS Captcha] ⚠️ No close button found, popup may close automatically');
            }
        }
    }
    
    await delay(500);

    // Then main submit (if present) - always in main document
    // This is for login page after modal closes
    await delay(1000);
    let mainSubmit = null;
    let tries = 0;
    while (!mainSubmit && tries < 15) {
        await delay(1000);
        mainSubmit = document.querySelector('button[id="btnVerify"][type="submit"]') ||
                     document.querySelector('button.btn-primary[type="submit"]') ||
                     document.querySelector('button[onclick*="OnCaptchaSubmit"]');
        tries++;
    }
    if (mainSubmit) {
        console.log('[BLS Captcha] ✅ Clicking main submit button (login page)');
        simulateClick(mainSubmit);
    }
    
    console.log('[BLS Captcha] 🎉 Captcha solve complete!');
    return true;
};

// One-time verify button click (from working Tampermonkey script)
if (typeof window.__BLS_VERIFY_CLICKED__ !== "boolean") window.__BLS_VERIFY_CLICKED__ = false;

const clickInitialVerify = async () => {
    if (window.__BLS_VERIFY_CLICKED__) return false;
    if (!isLoginPage()) return false;
    
    console.log('[BLS Captcha] Looking for initial verify button...');
    const verifyButton = document.querySelector('#btnVerify');
    if (verifyButton) {
        console.log('[BLS Captcha] Found verify button, clicking to open initial captcha...');
        window.__BLS_VERIFY_CLICKED__ = true;
        verifyButton.click();
        await delay(200); // Wait for modal to open
        console.log('[BLS Captcha] Initial verify button clicked, waiting for captcha to load...');
        return true;
    }
    return false;
};

// Captcha monitoring loop
let captchaMonitorInterval = null;

function startCaptchaMonitoring() {
    if (captchaMonitorInterval) return;
    
    console.log('[BLS Captcha] 🚀 Starting GLOBAL captcha monitoring...');
    console.log('[BLS Captcha] Will detect captchas on ANY page');
    console.log('[BLS Captcha] Check interval:', captchaConfig.checkInterval + 'ms');
    console.log('[BLS Captcha] Enabled:', captchaConfig.enabled);
    console.log('[BLS Captcha] ⚠️ Monitoring is active, but will only solve when automation is STARTED');
    
    // Click verify button on LOGIN page load only
    if (isLoginPage() && isAutomationEnabled) {
        setTimeout(() => clickInitialVerify(), 1000);
    }
    
    captchaMonitorInterval = setInterval(async () => {
        if (!captchaConfig.enabled || !isAutomationEnabled) return;
        
        const captchaOpen = isImageCaptchaOpen();
        
        if (captchaOpen) {
            console.log('[BLS Captcha] 🎯 Captcha detected on:', window.location.pathname);
            
            const currentHash = getCaptchaHash();
            if (currentHash !== captchaConfig.lastCaptchaHash) {
                console.log('[BLS Captcha] New captcha detected, solving...');
                captchaConfig.lastCaptchaHash = currentHash;
                
                const solved = await solveCaptcha();
                if (solved) {
                    console.log('[BLS Captcha] ✅ Captcha solved successfully!');
                    updateCaptchaStatus('✅ Captcha solved');
                    await delay(500);
                    
                    // After solving captcha, check if we need to proceed
                    await handlePostCaptchaActions();
                } else {
                    console.log('[BLS Captcha] ❌ Failed to solve captcha');
                    updateCaptchaStatus('❌ Captcha solve failed');
                }
            }
        }
    }, captchaConfig.checkInterval);
    
    console.log('[BLS Captcha] ✅ Global monitoring started!');
}

function stopCaptchaMonitoring() {
    if (captchaMonitorInterval) {
        clearInterval(captchaMonitorInterval);
        captchaMonitorInterval = null;
        console.log('[BLS Captcha] Stopped captcha monitoring');
    }
}

function updateCaptchaStatus(message) {
    const statusEl = document.getElementById('captchaStatus');
    if (statusEl) {
        statusEl.textContent = message;
        setTimeout(() => {
            statusEl.textContent = captchaConfig.enabled ? '🤖 Auto-solve: ON' : '🤖 Auto-solve: OFF';
        }, 3000);
    }
}

// ========================================
// END CAPTCHA SOLVER MODULE
// ========================================

// ========================================
// POST-CAPTCHA ACTIONS & AUTO-REDIRECT
// ========================================
async function handlePostCaptchaActions() {
    console.log('[BLS Auto] Checking post-captcha actions for:', window.location.pathname);
    
    // If on login page and captcha solved, redirect to appointment page
    if (isLoginPage()) {
        console.log('[BLS Auto] 🔄 Login captcha solved, redirecting to appointment page...');
        await delay(2000); // Wait for login to complete
        window.location.href = 'https://morocco.blsportugal.com/MAR/appointment/newappointment';
        return;
    }
    
    // If on visa type page, trigger autofill
    if (isVisaTypePage()) {
        console.log('[BLS Auto] On visa type page after captcha, triggering autofill...');
        await delay(1000);
        await runVisaTypeAutofill();
        return;
    }
}

// ========================================
// AUTO-REDIRECT MODULE (for home page)
// ========================================
let redirectAttempts = 0;
const MAX_REDIRECT_ATTEMPTS = 10;

function checkAndRedirectFromHome() {
    if (!isAutomationEnabled) return;
    if (isHomePage() && redirectAttempts < MAX_REDIRECT_ATTEMPTS) {
        redirectAttempts++;
        console.log(`[BLS Auto] 🔄 Redirecting from home to appointment page (attempt ${redirectAttempts})...`);
        window.location.href = 'https://morocco.blsportugal.com/MAR/appointment/newappointment';
    }
}

// Auto-redirect is now controlled by Start/Stop button in popup
// No automatic redirect until user clicks Start

// ========================================
// ERROR REDIRECT MODULE
// ========================================
function handleErrorRedirect() {
    if (!isAutomationEnabled) return;
    if (isErrorPage() || isPendingAppointmentPage()) {
        console.log('[BLS Auto] 🚨 Error/No slots page detected, redirecting...');
        setTimeout(() => {
            window.location.href = 'https://morocco.blsportugal.com/MAR/home/index';
        }, 2000);
    }
    
    // Check for "Book New Appointment" button
    const bookNewBtn = document.querySelector('a.btn.btn-primary[href="/MAR/appointment/newappointment"]');
    if (bookNewBtn && bookNewBtn.textContent.includes('Book New Appointment')) {
        console.log('[BLS Auto] 📝 Found "Book New Appointment" button, clicking...');
        bookNewBtn.click();
    }
}

// Error redirect is now controlled by Start/Stop button in popup
// No automatic redirect until user clicks Start

// ========================================
// VISA TYPE AUTO-FILL MODULE
// ========================================
async function runVisaTypeAutofill() {
    if (!isAutomationEnabled) {
        console.log('[BLS Autofill] ⏸️ Automation is disabled - click Start button to begin');
        return false;
    }
    
    console.log('[BLS Autofill] 🚀 Starting visa type autofill...');
    
    // Configuration - can be made editable via UI later
    const config = {
        category: "Normal",
        location: "Casablanca",
        // visaType: "Long Stay Visa",
        visaType: "Short Stay Visa",
        visaSubType: "Tourism",
        appointmentFor: "Individual"
    };
    
    try {
        // Wait for page variables to be available (same as Tampermonkey)
        let retries = 0;
        while (retries < 30) {
            const dataCheck = await executeInPageContext(`
                return {
                    hasCategory: typeof categoryData !== 'undefined',
                    hasLocation: typeof locationData !== 'undefined',
                    hasVisa: typeof visaIdData !== 'undefined',
                    hasVisaSub: typeof visasubIdData !== 'undefined'
                };
            `);
            
            if (dataCheck.success && dataCheck.result.hasCategory && 
                dataCheck.result.hasLocation && dataCheck.result.hasVisa && 
                dataCheck.result.hasVisaSub) {
                console.log('[BLS Autofill] ✅ Found required data arrays');
                break;
            }
            
            retries++;
            console.log(`[BLS Autofill] Waiting for data arrays... (attempt ${retries}/30)`);
            await delay(200);
        }

        if (retries >= 30) {
            console.log('[BLS Autofill] ❌ Required data arrays not found on page, aborting.');
            return false;
        }
        
        // EXACT SAME AS TAMPERMONKEY: Find visible dropdown IDs by labels
        const visibleFields = findVisibleDropdownInput();
        console.log('[BLS Autofill] 🔍 Found visible fields:', visibleFields);
        
        if (!visibleFields.category || !visibleFields.location) {
            console.log('[BLS Autofill] ❌ Could not find required dropdown fields');
            return;
        }
        
        let allFieldsSet = true;
        
        // Set Category - using page context
        if (visibleFields.category) {
            const catDD = await waitForKendoDropdown(`#${visibleFields.category}`);
            if (catDD) {
                const catResult = await executeInPageContext(`
                    const catDD = $('#${visibleFields.category}').data("kendoDropDownList");
                    const cat = categoryData.find(c => c.Name.includes("${config.category}"));
                    if (cat && catDD) {
                        catDD.value(cat.Id);
                        catDD.trigger("change");
                        return { Id: cat.Id, Name: cat.Name };
                    }
                    return null;
                `);
                
                if (catResult.success && catResult.result) {
                    console.log(`[BLS Autofill] ✅ Category set to ${catResult.result.Name}`);
                    await delay(200);
                } else {
                    console.log(`[BLS Autofill] ⚠️ Could not set Category`);
                    allFieldsSet = false;
                }
            } else {
                allFieldsSet = false;
            }
        }
        
        // Set Location - using page context
        if (visibleFields.location) {
            const locDD = await waitForKendoDropdown(`#${visibleFields.location}`);
            if (locDD) {
                const locResult = await executeInPageContext(`
                    const locDD = $('#${visibleFields.location}').data("kendoDropDownList");
                    const loc = locationData.find(l => l.Name.includes("${config.location}"));
                    if (loc && locDD) {
                        locDD.value(loc.Id);
                        locDD.trigger("change");
                        return { Id: loc.Id, Name: loc.Name };
                    }
                    return null;
                `);
                
                if (locResult.success && locResult.result) {
                    console.log(`[BLS Autofill] ✅ Location set to ${locResult.result.Name}`);
                    await delay(300);
                    
                    // Set Visa Type
                    if (visibleFields.visaType) {
                        const visaDD = await waitForKendoDropdown(`#${visibleFields.visaType}`);
                        if (visaDD) {
                            // Wait longer for location change event to populate visaTypeFilterData
                            await delay(800);
                            
                            // Search visaTypeFilterData (populated by location change event) - NO AWAIT INSIDE!
                            const visaResult = await executeInPageContext(`
                                return (function() {
                                    const visaDD = $('#${visibleFields.visaType}').data("kendoDropDownList");
                                    
                                    console.log('[BLS Autofill] Checking visaTypeFilterData...');
                                    console.log('[BLS Autofill] visaTypeFilterData exists?', typeof visaTypeFilterData !== 'undefined');
                                    console.log('[BLS Autofill] visaTypeFilterData length:', visaTypeFilterData ? visaTypeFilterData.length : 0);
                                    
                                    if (visaTypeFilterData && visaTypeFilterData.length > 0) {
                                        console.log('[BLS Autofill] All visa types:', visaTypeFilterData.map(v => v.Name));
                                        
                                        const visa = visaTypeFilterData.find(v => v.Name.includes("${config.visaType}"));
                                        if (visa && visaDD) {
                                            console.log('[BLS Autofill] ✅ Found visa:', visa.Name);
                                            visaDD.value(visa.Id);
                                            visaDD.trigger("change");
                                            return { Id: visa.Id, Name: visa.Name };
                                        } else {
                                            console.log('[BLS Autofill] ❌ Visa not found! Looking for: "${config.visaType}"');
                                        }
                                    } else {
                                        console.log('[BLS Autofill] ❌ visaTypeFilterData is empty or undefined!');
                                    }
                                    return null;
                                })();
                            `);
                            
                            console.log('[BLS Autofill] 🔍 visaResult:', visaResult);
                            console.log('[BLS Autofill] 🔍 visaResult.success:', visaResult.success);
                            console.log('[BLS Autofill] 🔍 visaResult.result:', visaResult.result);
                            
                            if (visaResult && visaResult.success && visaResult.result) {
                                console.log(`[BLS Autofill] ✅ Visa Type set to ${visaResult.result.Name}`);
                                
                                // CRITICAL: Wait longer for visa type change event to fully complete
                                await delay(800);
                                
                                // Re-detect visible fields in case Visa Sub Type appeared after Visa Type selection
                                const updatedFields = findVisibleDropdownInput();
                                console.log('[BLS Autofill] 🔍 Re-checking visible fields after Visa Type:', updatedFields);
                                
                                const visaSubTypeField = updatedFields.visaSubType || visibleFields.visaSubType;
                                console.log('[BLS Autofill] 🔍 Visa Sub Type field to use:', visaSubTypeField);
                                
                                // Set Visa Sub Type - wait for visa type change event to populate visasubIdFilterData
                                if (visaSubTypeField) {
                                    console.log(`[BLS Autofill] Found Visa Sub Type field ID: #${visaSubTypeField}`);
                                    const subDD = await waitForKendoDropdown(`#${visaSubTypeField}`);
                                    if (subDD) {
                                        // Search visasubIdFilterData (populated by visa type change event) - NO AWAIT INSIDE!
                                        const subResult = await executeInPageContext(`
                                            return (function() {
                                                const subDD = $('#${visaSubTypeField}').data("kendoDropDownList");
                                                
                                                console.log('[BLS Autofill] Checking visasubIdFilterData...');
                                                console.log('[BLS Autofill] visasubIdFilterData exists?', typeof visasubIdFilterData !== 'undefined');
                                                console.log('[BLS Autofill] visasubIdFilterData length:', visasubIdFilterData ? visasubIdFilterData.length : 0);
                                                
                                                if (visasubIdFilterData && visasubIdFilterData.length > 0) {
                                                    console.log('[BLS Autofill] All visa sub types:', visasubIdFilterData.map(v => v.Name));
                                                    
                                                    const sub = visasubIdFilterData.find(v => v.Name.includes("${config.visaSubType}"));
                                                    if (sub && subDD) {
                                                        console.log('[BLS Autofill] ✅ Found visa sub type:', sub.Name);
                                                        subDD.value(sub.Id);
                                                        subDD.trigger("change");
                                                        return { Id: sub.Id, Name: sub.Name };
                                                    } else {
                                                        console.log('[BLS Autofill] ❌ Visa Sub Type not found! Looking for: "${config.visaSubType}"');
                                                    }
                                                } else {
                                                    console.log('[BLS Autofill] ❌ visasubIdFilterData is empty or undefined!');
                                                }
                                                return null;
                                            })();
                                        `);
                                        
                                        if (subResult.success && subResult.result) {
                                            console.log(`[BLS Autofill] ✅ Visa Sub Type set to ${subResult.result.Name}`);
                                        } else {
                                            console.log(`[BLS Autofill] ⚠️ Could not set Visa Sub Type`);
                                            allFieldsSet = false;
                                        }
                                    } else {
                                        console.log(`[BLS Autofill] ❌ Visa Sub Type Kendo dropdown not found`);
                                        allFieldsSet = false;
                                    }
                                } else {
                                    console.log(`[BLS Autofill] ❌ Visa Sub Type field not detected in DOM`);
                                    allFieldsSet = false;
                                }
                            } else {
                                allFieldsSet = false;
                            }
                        } else {
                            allFieldsSet = false;
                        }
                    } else {
                        allFieldsSet = false;
                    }
                } else {
                    allFieldsSet = false;
                }
            } else {
                allFieldsSet = false;
            }
        }
        
        // Set Appointment For (radio button)
        const radioGroupName = findVisibleRadioGroup();
        if (radioGroupName) {
            const radios = document.querySelectorAll(`input[name="${radioGroupName}"]`);
            for (const radio of radios) {
                const label = document.querySelector(`label[for="${radio.id}"]`);
                if (label && label.textContent.trim().includes(config.appointmentFor)) {
                    radio.checked = true;
                    radio.click();
                    console.log(`[BLS Autofill] ✅ Appointment For set to ${config.appointmentFor}`);
                    break;
                }
            }
        } else {
            allFieldsSet = false;
        }
        
        console.log('[BLS Autofill] Autofill completed');
        
        if (allFieldsSet) {
            console.log('[BLS Autofill] ✅✅ All fields set successfully, now submitting...');
            await delay(100);
            const submitBtn = document.querySelector('#btnSubmit');
            if (submitBtn && !submitBtn.disabled) {
                submitBtn.click();
                console.log('[BLS Autofill] 🎉 Submit button clicked!');
            }
        } else {
            console.log('[BLS Autofill] ⚠️ Some fields were not set, skipping auto-submit.');
        }
        
        return allFieldsSet;
        
    } catch (error) {
        console.error('[BLS Autofill] ❌ Error:', error);
        return false;
    }
}

function findVisibleDropdownInput() {
    const allInputs = document.querySelectorAll('input[id]');
    const visibleInputs = { category: null, location: null, visaType: null, visaSubType: null };
    
    for (const input of allInputs) {
        const container = input.closest('.mb-3');
        if (!container) continue;
        
        const isVisible = !container.classList.contains('d-none') &&
                         container.offsetHeight > 0 &&
                         container.offsetWidth > 0;
        if (!isVisible) continue;
        
        const label = container.querySelector('label');
        if (!label) continue;
        
        const labelText = label.textContent.toLowerCase();
        
        if (labelText.includes('category') && !visibleInputs.category) visibleInputs.category = input.id;
        else if (labelText.includes('location') && !visibleInputs.location) visibleInputs.location = input.id;
        else if (labelText.includes('visa type') && !visibleInputs.visaType) visibleInputs.visaType = input.id;
        else if (labelText.includes('visa sub type') && !visibleInputs.visaSubType) visibleInputs.visaSubType = input.id;
    }
    return visibleInputs;
}

// Execute code in page context (has access to jQuery and page variables)
// Uses window.postMessage to communicate with page-context.js (MAIN world)
function executeInPageContext(code) {
    return new Promise((resolve) => {
        const messageId = 'bls_' + Date.now() + '_' + Math.random();
        
        // Listen for response from page context
        const listener = (event) => {
            // Only accept messages from same window
            if (event.source !== window) return;
            if (!event.data.type || event.data.type !== 'BLS_RESULT') return;
            if (event.data.id !== messageId) return;
            
            window.removeEventListener('message', listener);
            resolve(event.data);
        };
        window.addEventListener('message', listener);
        
        // Send code to page context for execution
        window.postMessage({
            type: 'BLS_EXECUTE',
            id: messageId,
            code: code
        }, '*');
        
        // Timeout after 5 seconds
        setTimeout(() => {
            window.removeEventListener('message', listener);
            resolve({ success: false, error: 'Timeout' });
        }, 5000);
    });
}


function waitForKendoDropdown(selector, maxAttempts = 50) {
    return new Promise((resolve) => {
        let tries = 0;
        async function check() {
            tries++;
            
            // Execute in page context to access jQuery and Kendo
            const result = await executeInPageContext(`
                if (typeof $ === 'undefined') return null;
                const dd = $('${selector}').data("kendoDropDownList");
                return dd ? { exists: true } : null;
            `);
            
            if (result && result.success && result.result && result.result.exists) {
                console.log(`[BLS Autofill] Found Kendo dropdown for ${selector} after ${tries} attempts`);
                // Return a proxy object that will execute commands in page context
                return resolve({
                    selector: selector,
                    async value(val) {
                        if (val === undefined) {
                            // Getter
                            const res = await executeInPageContext(`
                                return $('${selector}').data("kendoDropDownList").value();
                            `);
                            return res.result;
                        } else {
                            // Setter
                            await executeInPageContext(`
                                $('${selector}').data("kendoDropDownList").value(${val});
                            `);
                        }
                    },
                    async trigger(event) {
                        await executeInPageContext(`
                            $('${selector}').data("kendoDropDownList").trigger("${event}");
                        `);
                    },
                    get dataSource() {
                        return {
                            async read() {
                                await executeInPageContext(`
                                    $('${selector}').data("kendoDropDownList").dataSource.read();
                                `);
                            },
                            async data() {
                                const res = await executeInPageContext(`
                                    return $('${selector}').data("kendoDropDownList").dataSource.data().map(item => ({
                                        Id: item.Id,
                                        Name: item.Name,
                                        LegalEntityId: item.LegalEntityId
                                    }));
                                `);
                                return res.result || [];
                            },
                            get options() {
                                return {
                                    async data() {
                                        const res = await executeInPageContext(`
                                            return $('${selector}').data("kendoDropDownList").dataSource.options.data.map(item => ({
                                                Id: item.Id,
                                                Name: item.Name,
                                                LegalEntityId: item.LegalEntityId
                                            }));
                                        `);
                                        return res.result || [];
                                    }
                                };
                            }
                        };
                    }
                });
            }
            
            if (tries >= maxAttempts) {
                console.log(`[BLS Autofill] ⚠️ Kendo dropdown ${selector} not found after ${maxAttempts} attempts`);
                return resolve(null);
            }
            setTimeout(check, 100);
        }
        check();
    });
}

function findVisibleRadioGroup() {
    const radioGroups = document.querySelectorAll('input[type="radio"][name^="af"]');
    for (const radio of radioGroups) {
        const container = radio.closest('.mb-3');
        if (container && !container.classList.contains('d-none') &&
            container.offsetHeight > 0 && container.offsetWidth > 0) {
            return radio.name;
        }
    }
    return null;
}

// Manual control only - no auto-run
// User must click "Start Automation" button in control panel
if (isVisaTypePage()) {
    console.log('[BLS Auto] 📍 Detected Visa Type page - Ready for manual start');
}

// ========================================
// AUTO SELECT DATE AND SLOTS MODULE
// ========================================
async function runAutoSelectDateAndSlots() {
    if (!isAutomationEnabled) {
        console.log('[BLS Auto-Select] ⏸️ Automation is disabled - click Start button to begin');
        return false;
    }
    
    console.log('[BLS Auto-Select] 🚀 Starting date and slot selection...');
    
    try {
        // Check for "no slots" alert
        const alerts = document.querySelectorAll('.alert-danger, .alert');
        for (const alert of alerts) {
            if (alert.textContent.includes('not available') || alert.textContent.includes('No slot')) {
                console.log('[BLS Auto-Select] ❌ No slots available');
                return;
            }
        }
        
        // Step 1: Get available dates
        const availableDates = getAvailableDates();
        if (availableDates.length === 0) {
            console.log('[BLS Auto-Select] ❌ No available dates found');
            return;
        }
        
        console.log(`[BLS Auto-Select] ✅ Found ${availableDates.length} available dates`);
        
        // Step 2: Select random date
        const selectedDate = await selectRandomDate(availableDates);
        console.log('[BLS Auto-Select] ✅ Date selected:', selectedDate.value);
        await delay(2000); // Wait for slots to load
        
        // Step 3: Select slots
        const slotDropdowns = findVisibleSlotDropdowns();
        console.log(`[BLS Auto-Select] Found ${slotDropdowns.length} slot dropdowns`);
        
        if (slotDropdowns.length === 0) {
            console.log('[BLS Auto-Select] ❌ No slot dropdowns found');
            return;
        }
        
        const slotsSelected = await selectSlotsInSequence(slotDropdowns);
        console.log(`[BLS Auto-Select] ✅ Selected ${slotsSelected} slots`);
        
        if (slotsSelected === 0) {
            console.log('[BLS Auto-Select] ❌ No slots were selected');
            return;
        }
        
        // Step 4: Submit
        await delay(500);
        const submitBtn = document.querySelector('#btnSubmit, button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
            console.log('[BLS Auto-Select] 🎉 Form submitted!');
        }
        
    } catch (error) {
        console.error('[BLS Auto-Select] ❌ Error:', error);
    }
}

function getAvailableDates() {
    try {
        if (typeof availDates !== 'undefined' && availDates.ad) {
            const available = availDates.ad
                .filter(date => date.AppointmentDateType === 0 && date.SingleSlotAvailable === true)
                .map(date => ({
                    value: date.DateText,
                    displayValue: date.DateValue
                }));
            return available;
        }
    } catch (e) {
        console.error('[BLS Auto-Select] Error getting dates:', e);
    }
    return [];
}

async function selectRandomDate(availableDates) {
    const datePicker = findVisibleDatePicker();
    if (!datePicker) throw new Error('No date picker found');
    
    const randomIndex = Math.floor(Math.random() * availableDates.length);
    const selectedDate = availableDates[randomIndex];
    
    datePicker.value = selectedDate.value;
    datePicker.dispatchEvent(new Event('input', { bubbles: true }));
    datePicker.dispatchEvent(new Event('change', { bubbles: true }));
    datePicker.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // Trigger Kendo UI event if available
    if (typeof $ !== 'undefined') {
        const kendoWidget = $(datePicker).data('kendoDatePicker');
        if (kendoWidget) {
            kendoWidget.value(selectedDate.value);
            kendoWidget.trigger('change');
        }
    }
    
    return selectedDate;
}

function findVisibleDatePicker() {
    const datePickers = document.querySelectorAll('input[data-role="datepicker"]');
    for (const picker of datePickers) {
        const container = picker.closest('.mb-3');
        if (container && !container.style.display.includes('none') &&
            window.getComputedStyle(container).display !== 'none') {
            return picker;
        }
    }
    return datePickers[0];
}

function findVisibleSlotDropdowns() {
    const dropdowns = [];
    const slotInputs = document.querySelectorAll('input[data-role="dropdownlist"]');
    
    for (const input of slotInputs) {
        const container = input.closest('.mb-3');
        if (container && !container.style.display.includes('none') &&
            window.getComputedStyle(container).display !== 'none') {
            const wrapper = input.closest('span[role="listbox"]');
            if (wrapper) {
                dropdowns.push({
                    input: input,
                    wrapper: wrapper,
                    id: input.id
                });
            }
        }
    }
    return dropdowns;
}

async function selectSlotsInSequence(dropdowns) {
    let successCount = 0;
    
    for (let i = 0; i < dropdowns.length; i++) {
        const dropdown = dropdowns[i];
        
        try {
            console.log(`[BLS Auto-Select] Processing slot ${i + 1}/${dropdowns.length}`);
            
            // Open dropdown
            const selectButton = dropdown.wrapper.querySelector('.k-select');
            if (selectButton) {
                selectButton.click();
                await delay(500);
            }
            
            // Find available slots
            const listId = `${dropdown.id}-list`;
            const listContainer = document.getElementById(listId);
            
            if (!listContainer) {
                console.log(`[BLS Auto-Select] No list found for ${dropdown.id}`);
                continue;
            }
            
            const availableSlots = listContainer.querySelectorAll('.slot-item.bg-success');
            
            if (availableSlots.length === 0) {
                console.log(`[BLS Auto-Select] No available slots in ${dropdown.id}`);
                continue;
            }
            
            // Select random slot (prefer not first if multiple available)
            let slotToSelect;
            if (availableSlots.length > 1) {
                const randomIndex = Math.floor(Math.random() * (availableSlots.length - 1)) + 1;
                slotToSelect = availableSlots[randomIndex];
            } else {
                slotToSelect = availableSlots[0];
            }
            
            slotToSelect.click();
            console.log(`[BLS Auto-Select] ✅ Selected slot: ${slotToSelect.textContent.trim()}`);
            successCount++;
            
            await delay(300);
            
        } catch (error) {
            console.error(`[BLS Auto-Select] Error with dropdown ${dropdown.id}:`, error);
        }
    }
    
    return successCount;
}

// Auto-run on slot selection page
if (isSlotSelectionPage()) {
    setTimeout(() => runAutoSelectDateAndSlots(), 1000);
}

// ========================================
// CONFIRM SLOT DATE MODULE (I Agree button)
// ========================================
function tryClickAgreeButton() {
    if (!isAutomationEnabled) return false;
    const agreeBtn = document.querySelector('.modal-footer button.btn.btn-primary[onclick*="onTermsAgree"]');
    if (agreeBtn) {
        agreeBtn.click();
        console.log('[BLS Auto] ✅ "I Agree" button clicked!');
        return true;
    }
    return false;
}

function startAgreeButtonMonitoring() {
    if (!isAutomationEnabled) return;
    if (!isApplicantSelectionPage()) return;
    
    // Try immediately
    setTimeout(tryClickAgreeButton, 500);
    
    // Keep checking
    const agreeInterval = setInterval(() => {
        if (!isAutomationEnabled) {
            clearInterval(agreeInterval);
            return;
        }
        if (tryClickAgreeButton()) {
            clearInterval(agreeInterval);
        }
    }, 200);
    
    // Also observe DOM changes
    const observer = new MutationObserver(() => {
        if (!isAutomationEnabled) {
            observer.disconnect();
            return;
        }
        if (tryClickAgreeButton()) {
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// Auto-click is now controlled by Start/Stop button in popup
// No automatic clicking until user clicks Start

// ========================================
// END AUTOMATION MODULES
// ========================================


// Local Storage Functions (User Management)
function getUsers() {
    const users = localStorage.getItem('blsUsers');
    return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
    localStorage.setItem('blsUsers', JSON.stringify(users));
}

function getDefaultUser() {
    const users = getUsers();
    return users.find(user => user.isDefault) || null;
}

function setDefaultUser(userId) {
    const users = getUsers();
    users.forEach(user => {
        user.isDefault = user.id === userId;
    });
    saveUsers(users);
}

function createUser(name, email, password) {
    const users = getUsers();
    const id = Date.now().toString();
    const newUser = {
        id,
        name,
        email,
        password,
        isDefault: users.length === 0
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
}

function updateUser(id, data) {
    const users = getUsers();
    const userIndex = users.findIndex(user => user.id === id);
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...data };
        saveUsers(users);
        return users[userIndex];
    }
    return null;
}

function deleteUser(id) {
    const users = getUsers();
    const filteredUsers = users.filter(user => user.id !== id);

    if (filteredUsers.length > 0 && !filteredUsers.some(user => user.isDefault)) {
        filteredUsers[0].isDefault = true;
    }

    saveUsers(filteredUsers);
    return true;
}

function log(message) {
    console.log(`[BLS Auto] ${message}`);
}

// Proxy Management Functions
function updateProxyDisplay() {
    const proxyStatusEl = document.getElementById('proxyStatusText');
    const proxyIPEl = document.getElementById('proxyCurrentIP');
    
    if (proxyStatusEl) {
        if (proxyStatus.currentProxy) {
            proxyStatusEl.textContent = `${proxyStatus.currentProxy.host}:${proxyStatus.currentProxy.port}`;
            proxyStatusEl.style.color = '#28a745';
        } else {
            proxyStatusEl.textContent = 'No proxy active';
            proxyStatusEl.style.color = '#dc3545';
        }
    }
    
    if (proxyIPEl) {
        proxyIPEl.textContent = currentIP;
    }
}

function refreshProxyStatus() {
    log('Refreshing proxy status...');
    chrome.runtime.sendMessage({ type: 'GET_PROXY_STATUS' }, (response) => {
        console.log('[BLS Content] Proxy status response:', response);
        
        if (chrome.runtime.lastError) {
            console.error('[BLS Content] Error getting proxy status:', chrome.runtime.lastError);
            return;
        }
        
        if (response) {
            proxyStatus = response;
            currentIP = response.currentIP || currentIP;
            log(`Proxy status updated: ${response.proxyList?.length || 0} proxies, current: ${response.currentProxy?.host || 'none'}`);
            console.log('[BLS Content] Full proxy status:', proxyStatus);
            updateProxyDisplay();
            updateProxyList();
        } else {
            console.warn('[BLS Content] No response from background');
        }
    });
}

function refreshIP() {
    chrome.runtime.sendMessage({ type: 'REFRESH_IP' }, (response) => {
        if (response && response.ip) {
            currentIP = response.ip;
            updateProxyDisplay();
            log(`IP refreshed: ${currentIP}`);
        }
    });
}

function toggleAutoRotate() {
    const enabled = !proxyStatus.autoRotateEnabled;
    chrome.runtime.sendMessage({ 
        type: 'TOGGLE_AUTO_ROTATE', 
        enabled 
    }, (response) => {
        if (response && response.success) {
            proxyStatus.autoRotateEnabled = enabled;
            updateAutoRotateButton();
            log(`Auto-rotate ${enabled ? 'enabled' : 'disabled'}`);
        }
    });
}

function updateAutoRotateButton() {
    const btn = document.getElementById('toggleAutoRotateBtn');
    if (btn) {
        if (proxyStatus.autoRotateEnabled) {
            btn.textContent = '🔄 Auto-Rotate: ON';
            btn.style.background = '#28a745';
        } else {
            btn.textContent = '🔄 Auto-Rotate: OFF';
            btn.style.background = '#6c757d';
        }
    }
}

function rotateProxy() {
    chrome.runtime.sendMessage({ type: 'ROTATE_PROXY' }, (response) => {
        if (response && response.success) {
            log('Rotating to next proxy...');
            setTimeout(() => refreshProxyStatus(), 1000);
        }
    });
}

function applyProxy(index) {
    chrome.runtime.sendMessage({ 
        type: 'APPLY_PROXY', 
        index 
    }, (response) => {
        if (response && response.success) {
            log(`Applied proxy at index ${index}`);
            setTimeout(() => refreshProxyStatus(), 1000);
        }
    });
}

function clearProxy() {
    chrome.runtime.sendMessage({ type: 'CLEAR_PROXY' }, (response) => {
        if (response && response.success) {
            log('Proxy cleared');
            setTimeout(() => refreshProxyStatus(), 1000);
        }
    });
}

// Handle rate limit with automatic proxy rotation
let rateLimitRetries = 0;
const MAX_RATE_LIMIT_RETRIES = 10; // Try up to 10 proxies

async function handleRateLimitWithAutoRotate() {
    rateLimitRetries++;
    
    if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
        console.error('[BLS Auto] ❌ Maximum proxy rotation attempts reached!');
        console.error('[BLS Auto] All proxies seem to be rate limited. Stopping automation.');
        
        showNotification(
            `All Proxies Rate Limited!\n\nTried ${MAX_RATE_LIMIT_RETRIES} different proxies but all are blocked.\n\nSuggestions:\n• Wait 10-15 minutes\n• Add more proxies\n• Check if BLS is blocking your proxy provider`,
            'error',
            15000 // Show for 15 seconds
        );
        
        // Stop automation
        stopAutomationFromUI();
        rateLimitRetries = 0;
        return;
    }
    
    log(`🔄 Rate limit attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} - Rotating proxy...`);
    
    showNotification(
        `Rate Limit Detected!\n\nRotating to proxy ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}...`,
        'warning',
        3000
    );
    
    // Rotate to next proxy
    chrome.runtime.sendMessage({ type: 'ROTATE_PROXY' }, async (response) => {
        // Check for Chrome runtime errors
        if (chrome.runtime.lastError) {
            console.error('[BLS Auto] ❌ Chrome runtime error:', chrome.runtime.lastError.message);
            showNotification(
                `Extension Communication Error!\n\n${chrome.runtime.lastError.message}`,
                'error',
                8000
            );
            stopAutomationFromUI();
            return;
        }
        
        console.log('[BLS Auto] Rotate proxy response:', JSON.stringify(response, null, 2));
        
        if (response && response.success) {
            const proxyInfo = response.proxy 
                ? `${response.proxy.host}:${response.proxy.port}` 
                : `index ${response.index}`;
            
            log(`✅ Rotated to proxy index ${response.index}: ${proxyInfo}`);
            
            showNotification(
                `Proxy Rotated Successfully!\n\nNow using: ${proxyInfo}`,
                'success',
                3000
            );
            
            // Force IP refresh to get new IP
            chrome.runtime.sendMessage({ type: 'REFRESH_IP' }, async (ipResponse) => {
                if (ipResponse && ipResponse.ip) {
                    log(`🌐 New IP after rotation: ${ipResponse.ip}`);
                }
                
                log('⏳ Waiting 5 seconds for proxy connection to stabilize...');
                
                // Wait for proxy to stabilize
                await delay(5000);
                
                // Reload the page to retry with new proxy IP
                log('🔄 Reloading page with new proxy connection...');
                log(`🎯 Expected to use: ${proxyInfo}`);
                window.location.reload();
            });
        } else {
            const errorMsg = response?.error || 'Unknown error';
            console.error('[BLS Auto] ❌ Failed to rotate proxy:', errorMsg);
            console.error('[BLS Auto] Full response:', JSON.stringify(response, null, 2));
            
            // If rotation failed, maybe we're out of proxies
            showNotification(
                `Failed to Rotate Proxy!\n\nError: ${errorMsg}\n\nPlease add proxies in the extension popup.`,
                'error',
                8000
            );
            stopAutomationFromUI();
        }
    });
}

// Handle proxy connection timeouts and I/O errors
let proxyTimeoutRetries = 0;
const MAX_PROXY_TIMEOUT_RETRIES = 5;

async function handleProxyTimeout() {
    proxyTimeoutRetries++;
    
    if (proxyTimeoutRetries > MAX_PROXY_TIMEOUT_RETRIES) {
        console.error('[BLS Auto] ❌ Maximum proxy timeout retries reached!');
        console.error('[BLS Auto] All proxies are timing out. Possible issues:');
        console.error('  1. Proxy provider servers are down/overloaded');
        console.error('  2. Proxy credentials are incorrect');
        console.error('  3. Network connection is unstable');
        console.error('  4. BLS server is blocking your proxy provider');
        
        showNotification(
            `All Proxies Timing Out!\n\nTried ${MAX_PROXY_TIMEOUT_RETRIES} proxies but all timeout.\n\nPossible issues:\n• Proxy servers are down\n• Incorrect credentials\n• Network unstable\n• BLS blocking proxies\n\nSuggestions:\n• Check proxy provider status\n• Verify credentials\n• Try different provider\n• Wait and retry later`,
            'error',
            20000 // Show for 20 seconds
        );
        
        stopAutomationFromUI();
        proxyTimeoutRetries = 0;
        return;
    }
    
    log(`⏱️ Proxy timeout detected! (attempt ${proxyTimeoutRetries}/${MAX_PROXY_TIMEOUT_RETRIES})`);
    log('🔄 Rotating to next proxy to avoid timeout...');
    
    showNotification(
        `Proxy Timeout Detected!\n\nRotating to proxy ${proxyTimeoutRetries}/${MAX_PROXY_TIMEOUT_RETRIES}...`,
        'warning',
        3000
    );
    
    // Rotate to next proxy
    chrome.runtime.sendMessage({ type: 'ROTATE_PROXY' }, async (response) => {
        if (chrome.runtime.lastError) {
            console.error('[BLS Auto] ❌ Chrome runtime error:', chrome.runtime.lastError.message);
            showNotification(
                `Extension Error!\n\n${chrome.runtime.lastError.message}`,
                'error',
                6000
            );
            stopAutomationFromUI();
            return;
        }
        
        console.log('[BLS Auto] Rotate proxy response:', JSON.stringify(response, null, 2));
        
        if (response && response.success) {
            const proxyInfo = response.proxy 
                ? `${response.proxy.host}:${response.proxy.port}` 
                : `index ${response.index}`;
            
            log(`✅ Rotated to new proxy: ${proxyInfo}`);
            log('⏳ Waiting 3 seconds before retrying...');
            
            showNotification(
                `Proxy Switched!\n\nNow using: ${proxyInfo}\n\nRetrying in 3 seconds...`,
                'success',
                3000
            );
            
            await delay(3000);
            
            log('🔄 Reloading page with new proxy...');
            window.location.reload();
        } else {
            const errorMsg = response?.error || 'Unknown error';
            console.error('[BLS Auto] ❌ Failed to rotate proxy:', errorMsg);
            
            showNotification(
                `Failed to Rotate Proxy!\n\nError: ${errorMsg}\n\nPlease add proxies in the extension popup.`,
                'error',
                8000
            );
            stopAutomationFromUI();
        }
    });
}

// Reset rate limit counter on successful page load
window.addEventListener('load', () => {
    // If page loaded successfully, reset counters
    setTimeout(() => {
        const bodyText = document.body.textContent;
        
        // Reset rate limit counter if no 429 error
        if (!bodyText.includes('Too Many Requests') && !bodyText.includes('429')) {
            rateLimitRetries = 0;
        }
        
        // Reset timeout counter if no timeout errors
        const hasTimeoutError = bodyText.includes('timeout') || 
                               bodyText.includes('i/o timeout') ||
                               bodyText.includes('read tcp') ||
                               bodyText.includes('connection refused');
        
        if (!hasTimeoutError) {
            proxyTimeoutRetries = 0;
        }
    }, 2000);
});

function saveProxyList() {
    const textarea = document.getElementById('proxyListInput');
    if (!textarea) return;
    
    const lines = textarea.value.split('\n').filter(line => line.trim());
    const proxyList = [];
    
    lines.forEach((line, index) => {
        line = line.trim();
        if (!line) return;
        
        // Format: host:port:username:password
        // Password can contain colons and underscores (iProyal format)
        // Example: geo.iproyal.com:12321:username:password_with_underscores_and_colons
        
        let proxy = {
            type: 'http',
            host: '',
            port: 0,
            username: '',
            password: ''
        };
        
        // Check if type is specified (http://, socks5://, etc.)
        if (line.includes('://')) {
            const [typeStr, rest] = line.split('://');
            proxy.type = typeStr;
            line = rest;
        }
        
        // Split by colon, but only take first 4 parts (host:port:user:pass)
        // Everything after the 3rd colon is part of password
        const colonIndex1 = line.indexOf(':');
        if (colonIndex1 === -1) {
            log(`Invalid proxy format at line ${index + 1}: ${line}`);
            return;
        }
        
        proxy.host = line.substring(0, colonIndex1);
        
        const colonIndex2 = line.indexOf(':', colonIndex1 + 1);
        if (colonIndex2 === -1) {
            log(`Invalid proxy format at line ${index + 1}: ${line}`);
            return;
        }
        
        proxy.port = parseInt(line.substring(colonIndex1 + 1, colonIndex2));
        
        // Check if username and password are provided
        const colonIndex3 = line.indexOf(':', colonIndex2 + 1);
        if (colonIndex3 !== -1) {
            // Has authentication
            proxy.username = line.substring(colonIndex2 + 1, colonIndex3);
            // Everything after 3rd colon is the password (may contain colons/underscores)
            proxy.password = line.substring(colonIndex3 + 1);
        }
        
        // Validate
        if (proxy.host && proxy.port && !isNaN(proxy.port)) {
            proxyList.push(proxy);
            log(`Parsed proxy ${index + 1}: ${proxy.host}:${proxy.port} (${proxy.username ? 'with auth' : 'no auth'})`);
        } else {
            log(`Invalid proxy at line ${index + 1}: ${line}`);
        }
    });
    
    if (proxyList.length > 0) {
        log(`Attempting to save ${proxyList.length} proxies...`);
        console.log('[BLS Content] Proxy list to save:', proxyList);
        
        chrome.runtime.sendMessage({ 
            type: 'SET_PROXY_LIST', 
            proxyList 
        }, (response) => {
            console.log('[BLS Content] Save response:', response);
            
            if (chrome.runtime.lastError) {
                console.error('[BLS Content] Runtime error:', chrome.runtime.lastError);
                alert(`❌ Error: ${chrome.runtime.lastError.message}`);
                return;
            }
            
            if (response && response.success) {
                log(`Saved ${proxyList.length} proxies successfully`);
                alert(`✅ Saved ${proxyList.length} proxies successfully!`);
                switchTab('proxy-status');
                setTimeout(() => refreshProxyStatus(), 500);
            } else {
                log('Failed to save proxies');
                alert(`❌ Failed to save proxies: ${response?.error || 'Unknown error'}`);
            }
        });
    } else {
        log('No valid proxies to save');
        alert('⚠️ Please enter at least one valid proxy');
    }
}

function updateProxyList() {
    const listEl = document.getElementById('proxyListDisplay');
    if (!listEl) return;
    
    if (proxyStatus.proxyList.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">No proxies configured</div>';
        return;
    }
    
    listEl.innerHTML = proxyStatus.proxyList.map((proxy, index) => {
        const isActive = proxyStatus.currentProxy && 
                        proxyStatus.currentProxy.host === proxy.host && 
                        proxyStatus.currentProxy.port === proxy.port;
        
        const hasAuth = proxy.username && proxy.password;
        const authBadge = hasAuth ? '<span style="background: #ffc107; color: #000; padding: 1px 4px; border-radius: 2px; font-size: 8px; margin-left: 3px;">AUTH</span>' : '';
        
        return `
            <div style="
                border: 1px solid ${isActive ? '#28a745' : '#dee2e6'}; 
                border-radius: 4px; 
                padding: 6px; 
                margin-bottom: 5px;
                background: ${isActive ? '#d4edda' : '#fff'};
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div style="flex: 1;">
                    <strong>${proxy.type}://${proxy.host}:${proxy.port}</strong>
                    ${authBadge}
                    ${isActive ? '<span style="color: #28a745; font-size: 10px; margin-left: 5px;">[ACTIVE]</span>' : ''}
                    ${hasAuth ? `<br><small style="color: #6c757d; font-size: 9px;">User: ${proxy.username}</small>` : ''}
                </div>
                <button data-action="applyProxy" data-proxy-index="${index}" style="
                    background: #007bff; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px;
                    border-radius: 3px; 
                    cursor: pointer; 
                    font-size: 10px;
                " ${isActive ? 'disabled' : ''}>Use</button>
            </div>
        `;
    }).join('');
}

// UI Creation
function createUI() {
    const existingUI = document.getElementById('blsAutoLoginUI');
    if (existingUI) existingUI.remove();

    const uiHTML = `
        <div id="blsAutoLoginUI" class="bls-ui-container">
            <div class="bls-ui-header" id="blsUIHeader">
                <h3 style="margin: 0; font-size: 14px;">🔐 BLS Auto Login + Proxy Manager</h3>
                <button id="toggleUI" class="bls-btn-icon">−</button>
            </div>

            <div id="uiContent">
                <!-- Automation Status & Control -->
                <div id="automationStatusBadge" class="bls-status-bar" style="background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545; text-align: center; font-weight: bold; padding: 10px; margin-bottom: 15px;">
                    🔴 STOPPED
                </div>
                
                <div style="margin-bottom: 15px; display: flex; gap: 5px;">
                    <button id="startAutomationBtn" class="bls-btn bls-btn-success" style="flex: 1;">▶️ Start Automation</button>
                    <button id="stopAutomationBtn" class="bls-btn bls-btn-danger" style="flex: 1; display: none;">⏸️ Stop Automation</button>
                </div>
                
                <div style="margin-bottom: 10px; padding: 8px; background: #e7f3ff; border-radius: 4px; font-size: 10px; text-align: center;">
                    <strong>Current Page:</strong> <span id="currentPageName">-</span>
                </div>
                
                <!-- Proxy & IP Status Bar -->
                <div class="bls-status-bar">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-size: 10px; color: #6c757d;">Current IP:</div>
                            <div id="proxyCurrentIP" style="font-weight: bold; color: #007bff; font-size: 13px;">${currentIP}</div>
                        </div>
                        <button id="refreshIPBtn" class="bls-btn-sm bls-btn-primary">🔄 Refresh IP</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 10px; color: #6c757d;">Proxy:</div>
                            <div id="proxyStatusText" style="font-size: 11px; font-weight: bold;">Loading...</div>
                        </div>
                    </div>
                </div>

                <!-- Login Control Buttons -->
                <div style="margin-bottom: 15px; display: flex; gap: 5px;">
                    <button id="stopBtn" class="bls-btn bls-btn-danger">Stop Login</button>
                    <button id="runBtn" class="bls-btn bls-btn-success" disabled>Run Login</button>
                </div>

                <!-- Current User Display -->
                <div class="bls-current-user">
                    <strong>Current User:</strong> <span id="currentUserName">None</span>
                </div>

                <!-- Navigation Tabs -->
                <div class="bls-tabs">
                    <button class="tab-btn active" data-tab="users">👥 Users</button>
                    <button class="tab-btn" data-tab="create">➕ Add User</button>
                    <button class="tab-btn" data-tab="proxy-status">🌐 Proxy</button>
                    <button class="tab-btn" data-tab="proxy-config">⚙️ Config</button>
                    <button class="tab-btn" data-tab="captcha">🤖 Captcha</button>
                </div>

                <!-- Users Tab -->
                <div id="usersTab" class="tab-content">
                    <div id="usersList" style="max-height: 250px; overflow-y: auto;"></div>
                </div>

                <!-- Create User Tab -->
                <div id="createTab" class="tab-content" style="display: none;">
                    <div class="bls-form-group">
                        <label>Name:</label>
                        <input type="text" id="newUserName" class="bls-input" placeholder="Enter name">
                    </div>
                    <div class="bls-form-group">
                        <label>Email:</label>
                        <input type="email" id="newUserEmail" class="bls-input" placeholder="Enter email">
                    </div>
                    <div class="bls-form-group">
                        <label>Password:</label>
                        <input type="password" id="newUserPassword" class="bls-input" placeholder="Enter password">
                    </div>
                    <button id="createUserBtn" class="bls-btn bls-btn-success" style="width: 100%;">Create User</button>
                </div>

                <!-- Proxy Status Tab -->
                <div id="proxy-statusTab" class="tab-content" style="display: none;">
                    <div style="margin-bottom: 10px;">
                        <button id="toggleAutoRotateBtn" class="bls-btn" style="width: 100%;">
                            🔄 Auto-Rotate: OFF
                        </button>
                    </div>
                    <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                        <button id="rotateProxyBtn" class="bls-btn bls-btn-primary" style="flex: 1;">↻ Rotate Now</button>
                        <button id="clearProxyBtn" class="bls-btn bls-btn-warning" style="flex: 1;">✖ Clear Proxy</button>
                    </div>
                    <h4 style="margin: 10px 0 5px 0; font-size: 12px;">Proxy List:</h4>
                    <div id="proxyListDisplay" style="max-height: 200px; overflow-y: auto;"></div>
                </div>

                <!-- Proxy Config Tab -->
                <div id="proxy-configTab" class="tab-content" style="display: none;">
                    <div class="bls-form-group">
                        <label style="font-weight: bold;">Proxy List (one per line):</label>
                        <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px;">
                            <strong>iProyal Format (with auth):</strong><br>
                            <code>host:port:username:password</code><br>
                            <strong>Example:</strong><br>
                            <code style="font-size: 9px;">geo.iproyal.com:12321:user:pass_session-abc_country-ma</code><br>
                            <strong>Simple format (no auth):</strong><br>
                            <code>host:port</code> or <code>type://host:port</code>
                        </div>
                        <textarea id="proxyListInput" class="bls-textarea" rows="8" placeholder="Example with iProyal auth:
geo.iproyal.com:12321:username:password_with_session_info
geo.iproyal.com:12321:username:password_country-ma_session-xyz

Example without auth:
gate.dc.smartproxy.com:20000
socks5://proxy2.iproyal.com:12321"></textarea>
                    </div>
                    <button id="saveProxyListBtn" class="bls-btn bls-btn-success" style="width: 100%;">💾 Save Proxy List</button>
                    <div style="margin-top: 10px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 10px;">
                        <strong>📌 iProyal Tip:</strong><br>
                        Copy your proxies from <a href="https://dashboard.iproyal.com" target="_blank">iProyal Dashboard</a><br>
                        Format: <code>host:port:username:password</code><br>
                        ⚠️ Password can contain underscores and special characters - it will be parsed correctly!
                    </div>
                </div>

                <!-- Captcha Settings Tab -->
                <div id="captchaTab" class="tab-content" style="display: none;">
                    <div style="margin-bottom: 15px;">
                        <div style="padding: 10px; background: ${captchaConfig.enabled ? '#d4edda' : '#f8d7da'}; border-radius: 4px; text-align: center; font-weight: bold;">
                            <span id="captchaStatus">${captchaConfig.enabled ? '🤖 Auto-solve: ON' : '🤖 Auto-solve: OFF'}</span>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <button id="toggleCaptchaSolverBtn" class="bls-btn ${captchaConfig.enabled ? 'bls-btn-danger' : 'bls-btn-success'}" style="width: 100%;">
                            ${captchaConfig.enabled ? '❌ Disable Auto-Solve' : '✅ Enable Auto-Solve'}
                        </button>
                    </div>

                    <div class="bls-form-group">
                        <label style="font-weight: bold;">API Key:</label>
                        <input type="text" id="captchaApiKey" class="bls-input" placeholder="Enter NoCaptcha API key" value="${captchaConfig.apiKey}">
                        <div style="font-size: 10px; color: #6c757d; margin-top: 3px;">
                            Get your API key from <a href="https://pro.nocaptchaai.com/" target="_blank">NoCaptcha.ai</a>
                        </div>
                    </div>

                    <div class="bls-form-group">
                        <label style="font-weight: bold;">API URL:</label>
                        <input type="text" id="captchaApiUrl" class="bls-input" placeholder="API endpoint" value="${captchaConfig.apiUrl}">
                    </div>

                    <div class="bls-form-group">
                        <label style="font-weight: bold;">Check Interval (ms):</label>
                        <input type="number" id="captchaCheckInterval" class="bls-input" placeholder="500" value="${captchaConfig.checkInterval}" min="200" max="5000" step="100">
                        <div style="font-size: 10px; color: #6c757d; margin-top: 3px;">
                            How often to check for captchas (200-5000ms)
                        </div>
                    </div>

                    <button id="saveCaptchaConfigBtn" class="bls-btn bls-btn-success" style="width: 100%;">💾 Save Captcha Settings</button>

                    <div style="margin-top: 15px; padding: 10px; background: #e7f3ff; border-radius: 4px; font-size: 11px;">
                        <strong>ℹ️ How it works:</strong><br>
                        • Automatically detects image captchas<br>
                        • Sends images to NoCaptcha.ai API<br>
                        • Clicks correct images and submits<br>
                        • Works on login and appointment pages<br>
                        <br>
                        <strong>⚡ Fast Mode:</strong><br>
                        Lower interval = faster detection (uses more resources)
                    </div>
                </div>

                <!-- Edit User Modal -->
                <div id="editModal" style="display: none;" class="bls-modal">
                    <h4 style="margin: 0 0 10px 0; font-size: 12px;">Edit User</h4>
                    <input type="hidden" id="editUserId">
                    <div class="bls-form-group">
                        <label>Name:</label>
                        <input type="text" id="editUserName" class="bls-input">
                    </div>
                    <div class="bls-form-group">
                        <label>Email:</label>
                        <input type="email" id="editUserEmail" class="bls-input">
                    </div>
                    <div class="bls-form-group">
                        <label>Password:</label>
                        <input type="password" id="editUserPassword" class="bls-input">
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button id="saveUserBtn" class="bls-btn bls-btn-primary" style="flex: 1;">Save</button>
                        <button id="cancelEditBtn" class="bls-btn bls-btn-secondary" style="flex: 1;">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', uiHTML);
    setupUIEvents();
    refreshUsersList();
    updateCurrentUserDisplay();
    refreshProxyStatus();
    updateCurrentPageName(); // Update page name on any page
}

function setupUIEvents() {
    // Toggle UI
    document.getElementById('toggleUI').onclick = function() {
        const content = document.getElementById('uiContent');
        const btn = document.getElementById('toggleUI');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            btn.textContent = '−';
        } else {
            content.style.display = 'none';
            btn.textContent = '+';
        }
    };

    // Automation control buttons
    document.getElementById('startAutomationBtn').onclick = startAutomationFromUI;
    document.getElementById('stopAutomationBtn').onclick = stopAutomationFromUI;
    
    // Login control buttons
    document.getElementById('stopBtn').onclick = stopAutoLogin;
    document.getElementById('runBtn').onclick = startAutoLogin;
    
    // Update current page name
    updateCurrentPageName();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = function() {
            switchTab(this.dataset.tab);
        };
    });

    // Create user
    document.getElementById('createUserBtn').onclick = function() {
        const name = document.getElementById('newUserName').value.trim();
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value.trim();

        if (name && email && password) {
            createUser(name, email, password);
            document.getElementById('newUserName').value = '';
            document.getElementById('newUserEmail').value = '';
            document.getElementById('newUserPassword').value = '';
            refreshUsersList();
            updateCurrentUserDisplay();
            switchTab('users');
            log(`Created user: ${name}`);
        } else {
            alert('Please fill all fields');
        }
    };

    // Edit user events
    document.getElementById('saveUserBtn').onclick = function() {
        const id = document.getElementById('editUserId').value;
        const name = document.getElementById('editUserName').value.trim();
        const email = document.getElementById('editUserEmail').value.trim();
        const password = document.getElementById('editUserPassword').value.trim();

        if (name && email && password) {
            updateUser(id, { name, email, password });
            document.getElementById('editModal').style.display = 'none';
            refreshUsersList();
            updateCurrentUserDisplay();
            log(`Updated user: ${name}`);
        } else {
            alert('Please fill all fields');
        }
    };

    document.getElementById('cancelEditBtn').onclick = function() {
        document.getElementById('editModal').style.display = 'none';
    };
    
    // Proxy management buttons
    const refreshIPBtn = document.getElementById('refreshIPBtn');
    if (refreshIPBtn) {
        refreshIPBtn.onclick = refreshIP;
    }
    
    const toggleAutoRotateBtn = document.getElementById('toggleAutoRotateBtn');
    if (toggleAutoRotateBtn) {
        toggleAutoRotateBtn.onclick = toggleAutoRotate;
    }
    
    const rotateProxyBtn = document.getElementById('rotateProxyBtn');
    if (rotateProxyBtn) {
        rotateProxyBtn.onclick = rotateProxy;
    }
    
    const clearProxyBtn = document.getElementById('clearProxyBtn');
    if (clearProxyBtn) {
        clearProxyBtn.onclick = clearProxy;
    }
    
    const saveProxyListBtn = document.getElementById('saveProxyListBtn');
    if (saveProxyListBtn) {
        saveProxyListBtn.onclick = saveProxyList;
    }
    
    // Captcha solver buttons
    const toggleCaptchaSolverBtn = document.getElementById('toggleCaptchaSolverBtn');
    if (toggleCaptchaSolverBtn) {
        toggleCaptchaSolverBtn.onclick = function() {
            captchaConfig.enabled = !captchaConfig.enabled;
            saveCaptchaConfig();
            
            if (captchaConfig.enabled) {
                startCaptchaMonitoring();
                log('Captcha auto-solve enabled');
            } else {
                stopCaptchaMonitoring();
                log('Captcha auto-solve disabled');
            }
            
            // Recreate UI to update button and status
            createUI();
        };
    }
    
    const saveCaptchaConfigBtn = document.getElementById('saveCaptchaConfigBtn');
    if (saveCaptchaConfigBtn) {
        saveCaptchaConfigBtn.onclick = function() {
            const apiKey = document.getElementById('captchaApiKey').value.trim();
            const apiUrl = document.getElementById('captchaApiUrl').value.trim();
            const checkInterval = parseInt(document.getElementById('captchaCheckInterval').value);
            
            if (apiKey && apiUrl && checkInterval >= 200 && checkInterval <= 5000) {
                captchaConfig.apiKey = apiKey;
                captchaConfig.apiUrl = apiUrl;
                captchaConfig.checkInterval = checkInterval;
                saveCaptchaConfig();
                
                // Restart monitoring with new interval
                if (captchaConfig.enabled) {
                    stopCaptchaMonitoring();
                    startCaptchaMonitoring();
                }
                
                alert('✅ Captcha settings saved!');
                log('Captcha config updated');
            } else {
                alert('Please fill all fields correctly. Interval must be between 200-5000ms.');
            }
        };
    }
    
    // Event delegation for dynamically created buttons (user list and proxy list)
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // Handle user management buttons
        if (target.dataset.action === 'setDefault') {
            const userId = target.dataset.userId;
            setDefaultUser(userId);
            refreshUsersList();
            updateCurrentUserDisplay();
            log('Set default user');
        } else if (target.dataset.action === 'editUser') {
            const userId = target.dataset.userId;
            const users = getUsers();
            const user = users.find(u => u.id === userId);
            if (user) {
                document.getElementById('editUserId').value = user.id;
                document.getElementById('editUserName').value = user.name;
                document.getElementById('editUserEmail').value = user.email;
                document.getElementById('editUserPassword').value = user.password;
                document.getElementById('editModal').style.display = 'block';
            }
        } else if (target.dataset.action === 'deleteUser') {
            const userId = target.dataset.userId;
            const users = getUsers();
            const user = users.find(u => u.id === userId);
            if (user && confirm(`Delete user "${user.name}"?`)) {
                deleteUser(userId);
                refreshUsersList();
                updateCurrentUserDisplay();
                log(`Deleted user: ${user.name}`);
            }
        } else if (target.dataset.action === 'applyProxy') {
            const proxyIndex = parseInt(target.dataset.proxyIndex);
            applyProxy(proxyIndex);
        }
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.style.display = 'block';
    }
    
    // Refresh proxy status when viewing proxy tabs
    if (tabName.startsWith('proxy')) {
        refreshProxyStatus();
    }
}

function refreshUsersList() {
    const users = getUsers();
    const usersList = document.getElementById('usersList');

    if (users.length === 0) {
        usersList.innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">No users found</div>';
        return;
    }

    usersList.innerHTML = users.map(user => `
        <div class="bls-user-item ${user.isDefault ? 'default' : ''}">
            <div style="flex: 1;">
                <strong>${user.name}</strong> 
                ${user.isDefault ? '<span class="bls-badge-default">[DEFAULT]</span>' : ''}
                <br><small style="color: #6c757d;">${user.email}</small>
            </div>
            <div style="display: flex; gap: 5px; flex-direction: column;">
                <button data-action="setDefault" data-user-id="${user.id}" class="bls-btn-sm bls-btn-primary" ${user.isDefault ? 'disabled' : ''}>
                    Set Default
                </button>
                <div style="display: flex; gap: 3px;">
                    <button data-action="editUser" data-user-id="${user.id}" class="bls-btn-xs bls-btn-warning">Edit</button>
                    <button data-action="deleteUser" data-user-id="${user.id}" class="bls-btn-xs bls-btn-danger">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateCurrentUserDisplay() {
    currentUser = getDefaultUser();
    const display = document.getElementById('currentUserName');
    if (display) {
        display.textContent = currentUser ? currentUser.name : 'None';
    }
}

function stopAutoLogin() {
    autoLoginEnabled = false;
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('runBtn').disabled = false;
    log('Auto login stopped');
}

function startAutoLogin() {
    autoLoginEnabled = true;
    resetProcessingStates();
    startMonitoring();
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('runBtn').disabled = true;
    log('Auto login started');
}

function resetProcessingStates() {
    processingStates = {
        formFilled: false,
        verifyClicked: false,
        loginAttempted: false
    };
}

// Core Login Functions
function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
}

function fillForm() {
    if (!autoLoginEnabled || processingStates.formFilled || !currentUser) return false;

    const emailFields = document.querySelectorAll('input[type="text"][id*="UserId"], input[id*="email"], input[name*="email"]');
    const passwordFields = document.querySelectorAll('input[type="password"][id*="Password"], input[name*="password"]');

    let filled = 0;

    emailFields.forEach(field => {
        if (isVisible(field) && !field.value) {
            field.value = currentUser.email;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
        }
    });

    passwordFields.forEach(field => {
        if (isVisible(field) && !field.value) {
            field.value = currentUser.password;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
        }
    });

    if (filled > 0) {
        processingStates.formFilled = true;
        log(`Form filled for user: ${currentUser.name} (${filled} fields)`);
        return true;
    }
    return false;
}

function clickLogin() {
    if (!autoLoginEnabled || processingStates.loginAttempted) return false;
    
    // #btnSubmit is hidden initially (style="display:none") and only shows AFTER captcha solved
    const loginBtn = document.querySelector('#btnSubmit[type="submit"]');
    if (loginBtn && isVisible(loginBtn) && !loginBtn.disabled) {
        processingStates.loginAttempted = true;
        log('Captcha solved! Clicking login submit button...');
        loginBtn.click();
        return true;
    }
    return false;
}function clickVerifyButton() {
    if (!autoLoginEnabled || processingStates.verifyClicked) return false;
    
    // #btnVerify opens the captcha modal - click this FIRST (before login submit)
    const verifyBtn = document.querySelector('#btnVerify[type="button"]');
    if (verifyBtn && isVisible(verifyBtn) && !verifyBtn.disabled) {
        log('Clicking Verify button to open captcha modal...');
        processingStates.verifyClicked = true;
        verifyBtn.click();
        log('Verify button clicked - captcha modal should open now');
        return true;
    }
    return false;
}

function monitorPage() {
    if (!autoLoginEnabled) return;

    try {
        currentUser = getDefaultUser();
        if (!currentUser) {
            log('No default user set');
            return;
        }

        // Step 1: Fill the login form (email + password fields)
        if (!processingStates.formFilled) {
            if (fillForm()) {
                log('✅ Form filled, proceeding to verify step...');
                return;
            }
        }

        // Step 2: Click VERIFY button to open captcha modal (NOT login yet!)
        if (processingStates.formFilled && !processingStates.verifyClicked) {
            if (clickVerifyButton()) {
                log('✅ Verify clicked, waiting for captcha to appear and be solved...');
                return;
            }
        }

        // Step 3: After captcha is solved, #btnSubmit becomes visible - click it to login
        // The captcha solver runs independently and will solve the captcha automatically
        if (processingStates.verifyClicked && !processingStates.loginAttempted) {
            if (clickLogin()) {
                log('✅ Login submit clicked after captcha solved!');
                return;
            }
        }

    } catch (error) {
        log(`Monitor error: ${error.message}`);
    }
}

function startMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
    }
    monitorInterval = setInterval(monitorPage, 500);
    setTimeout(monitorPage, 100);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'IP_UPDATED':
            currentIP = request.ip;
            updateProxyDisplay();
            log(`IP updated: ${currentIP}`);
            break;
        case 'PROXY_ROTATED':
            log(`Proxy rotated to: ${request.proxy.host}:${request.proxy.port}`);
            refreshProxyStatus();
            break;
        case 'RATE_LIMIT_DETECTED':
            log(`⚠️ Rate limit detected! Status code: ${request.statusCode}`);
            log('🔄 Automatically rotating proxy and retrying...');
            
            // Auto-rotate proxy and reload page
            handleRateLimitWithAutoRotate();
            break;
    }
});

function init() {
    log('🚀 BLS Auto Extension with Full Automation started');
    console.log('[BLS Auto] 🌐 Running on:', window.location.pathname);
    console.log('[BLS Auto] ⏸️ Automation STOPPED - Click Start to begin full automation');
    console.log('[BLS Auto] 🔧 All modules ready, waiting for user command...');
    
    // Always create UI on ALL BLS pages (not just login)
    createUI();
    
    // Auto-start captcha monitoring (always active for captcha solving)
    console.log('[BLS Captcha] 🤖 Auto-starting captcha monitor...');
    startCaptchaMonitoring();
    
    // Set current user for login page
    if (isLoginPage()) {
        currentUser = getDefaultUser();
        // Don't start login monitoring automatically - wait for Start button
        stopAutoLogin();
    }
    
    console.log('[BLS Auto] 💡 Captcha solver is ACTIVE - Click "Start Automation" for full automation');
    
    // Log available modules (not active yet)
    console.log('[BLS Auto] 📦 Available modules (will activate on Start):');
    console.log('  • Auto-Dismiss Alerts');
    console.log('  • Global Captcha Solver');
    console.log('  • Auto-Redirect after Login');
    console.log('  • Auto-Redirect from Home');
    console.log('  • Visa Type Auto-Fill');
    console.log('  • Auto Select Date & Slots');
    console.log('  • Auto-Confirm Slot Terms');
    console.log('  • Error Page Redirect');
    
    // Page-specific logs
    if (isLoginPage()) console.log('[BLS Auto] 📍 On LOGIN page - Will auto-fill when automation starts');
    if (isHomePage()) console.log('[BLS Auto] 📍 On HOME page - Will auto-redirect when automation starts');
    if (isVisaTypePage()) console.log('[BLS Auto] 📍 On VISA TYPE page - Will auto-fill when automation starts');
    if (isSlotSelectionPage()) console.log('[BLS Auto] 📍 On SLOT SELECTION page - Will auto-select when automation starts');
    if (isApplicantSelectionPage()) console.log('[BLS Auto] 📍 On APPLICANT SELECTION page - Will auto-agree when automation starts');
    if (isErrorPage()) console.log('[BLS Auto] 📍 On ERROR page - Will auto-redirect when automation starts');
    
    // Check if automation was running before page change
    checkAndRestoreAutomationState();

    // Save state before page unloads to ensure persistence
    window.addEventListener('beforeunload', () => {
        // Save current automation state before leaving page
        console.log('[BLS Auto] 💾 Saving automation state before page unload:', isAutomationEnabled);
        saveAutomationState(isAutomationEnabled);
        
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }
        if (captchaMonitorInterval) {
            clearInterval(captchaMonitorInterval);
        }
    });
    
    // Also save state when visibility changes (tab switching, etc)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('[BLS Auto] 👁️ Tab hidden - saving automation state:', isAutomationEnabled);
            saveAutomationState(isAutomationEnabled);
        }
    });
}

// Check if page itself returned 429 (page load error)
function check429OnPageLoad() {
    // Don't check if page is still loading
    if (document.readyState !== 'complete') {
        console.log('[BLS Auto] ⏳ Page still loading, skipping 429 check...');
        return false;
    }
    
    // Wait for body to be fully loaded
    if (!document.body || document.body.innerText.length < 100) {
        console.log('[BLS Auto] ⏳ Body not fully loaded yet, skipping 429 check...');
        return false;
    }
    
    // Check if page HTML contains 429 or 403 error messages
    const bodyText = document.body.innerText;
    const htmlText = document.documentElement.innerHTML;
    
    // Common 429 indicators
    const has429 = bodyText.includes('429') || 
                   bodyText.includes('Too Many Requests') ||
                   bodyText.includes('Rate Limit') ||
                   htmlText.includes('429');
    
    // Check for 403 Forbidden errors (proxy blocked)
    const has403 = bodyText.includes('403') || 
                   bodyText.includes('Forbidden') ||
                   bodyText.includes('Access Denied') ||
                   htmlText.includes('403');
    
    // Check for 502 Bad Gateway errors
    const has502 = bodyText.includes('502') || 
                   bodyText.includes('Bad Gateway') ||
                   bodyText.includes('Application Temporarily Unavailable') ||
                   bodyText.includes('technical difficulties') ||
                   htmlText.includes('502');
    
    // Check if page title indicates error
    const titleHas429 = document.title && (
        document.title.includes('429') || 
        document.title.includes('Too Many Requests') ||
        document.title.includes('403') ||
        document.title.includes('Forbidden') ||
        document.title.includes('502') ||
        document.title.includes('Bad Gateway') ||
        document.title.includes('Unavailable')
    );
    
    if (has429 || titleHas429) {
        console.warn('[BLS Auto] ⚠️ 429 detected on FULLY LOADED page!');
        console.warn('[BLS Auto] Page title:', document.title);
        console.warn('[BLS Auto] Body text preview:', bodyText.substring(0, 200));
        
        // Trigger auto-rotation
        handleRateLimitWithAutoRotate();
        return true;
    }
    
    if (has403) {
        console.warn('[BLS Auto] ⚠️ 403 Forbidden detected on FULLY LOADED page!');
        console.warn('[BLS Auto] Page title:', document.title);
        console.warn('[BLS Auto] Body text preview:', bodyText.substring(0, 200));
        
        showNotification(
            '403 Forbidden - Proxy Blocked!\n\nBLS server is blocking the current proxy.\n\nRotating to next proxy...',
            'error',
            6000
        );
        
        // Trigger auto-rotation
        handleRateLimitWithAutoRotate();
        return true;
    }
    
    if (has502) {
        console.warn('[BLS Auto] ⚠️ 502 Bad Gateway detected on FULLY LOADED page!');
        console.warn('[BLS Auto] Page title:', document.title);
        console.warn('[BLS Auto] Body text preview:', bodyText.substring(0, 200));
        
        showNotification(
            '502 Bad Gateway - Server Error!\n\nBLS application is temporarily unavailable.\n\nThis could mean:\n• Proxy is blocked\n• Server overloaded\n• Need different IP\n\nRotating proxy and retrying...',
            'error',
            8000
        );
        
        // Trigger auto-rotation
        handleRateLimitWithAutoRotate();
        
        // After rotation, redirect to login page to retry from beginning
        setTimeout(() => {
            console.log('[BLS Auto] 🔄 Redirecting to login page after 502 error and proxy rotation...');
            window.location.href = 'https://morocco.blsportugal.com/MAR/account/login';
        }, 3000); // Wait 3 seconds for proxy rotation to complete
        
        return true;
    }
    
    return false;
}

// Check for proxy timeout errors in page content
function checkForTimeoutErrors() {
    if (!isAutomationEnabled) return false;
    
    const bodyText = document.body ? document.body.innerText : '';
    const htmlText = document.documentElement ? document.documentElement.innerHTML : '';
    
    // Check for timeout indicators
    const hasTimeout = bodyText.includes('i/o timeout') || 
                      bodyText.includes('read tcp') ||
                      bodyText.includes('connection timeout') ||
                      bodyText.includes('connection refused') ||
                      bodyText.includes('ECONNREFUSED') ||
                      bodyText.includes('ETIMEDOUT') ||
                      bodyText.includes('ERR_PROXY_CONNECTION_FAILED') ||
                      bodyText.includes('ERR_CONNECTION_TIMED_OUT') ||
                      htmlText.includes('timeout');
    
    if (hasTimeout) {
        console.warn('[BLS Auto] ⚠️ Proxy timeout/connection error detected!');
        console.warn('[BLS Auto] Page title:', document.title);
        console.warn('[BLS Auto] Error message:', bodyText.substring(0, 300));
        
        // Trigger auto-rotation
        handleProxyTimeout();
        return true;
    }
    return false;
}

// Monitor for resource loading errors (403, 500, etc.)
let captchaLoadErrorCount = 0;
const MAX_CAPTCHA_LOAD_ERRORS = 3;

// Listen for failed resource loads
window.addEventListener('error', async (event) => {
    if (!isAutomationEnabled) return;
    
    // Check if it's a captcha image that failed to load
    if (event.target && event.target.tagName === 'IMG' && event.target.src) {
        if (event.target.src.includes('GenerateCaptcha') || 
            event.target.closest('#captchaForm') ||
            event.target.closest('.k-window')) {
            
            captchaLoadErrorCount++;
            console.error('[BLS Captcha] ❌ Captcha image failed to load:', event.target.src);
            
            if (captchaLoadErrorCount >= MAX_CAPTCHA_LOAD_ERRORS) {
                console.error('[BLS Captcha] Too many captcha load failures!');
                
                showNotification(
                    `Captcha Images Failed to Load!\n\n${captchaLoadErrorCount} captcha images failed (403/429 error).\n\nThis means BLS is blocking the current proxy.\n\nRotating to next proxy...`,
                    'error',
                    8000
                );
                
                captchaLoadErrorCount = 0; // Reset counter
                await handleRateLimitWithAutoRotate();
            }
        }
    }
}, true); // Use capture phase to catch errors early

// Reset captcha error counter on successful page load
window.addEventListener('load', () => {
    captchaLoadErrorCount = 0;
});

// Start - Wait for page to FULLY load before checking errors
window.addEventListener('load', () => {
    init();
    // Check for 429 and timeout errors after page is COMPLETELY loaded
    setTimeout(() => {
        console.log('[BLS Auto] ✅ Page fully loaded, checking for errors...');
        check429OnPageLoad();
        checkForTimeoutErrors();
    }, 2000); // Increased delay for slow proxies
});
