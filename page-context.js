// This script runs in the page context (MAIN world) and has access to jQuery and page variables
// It communicates with content.js via window messages

console.log('[BLS Page Context] Script loaded in MAIN world');

// ========================================
// AUTO-DISMISS ALERTS (runs in page context to catch website alerts)
// ========================================
(function initAlertDismisser() {
    console.log('[BLS Page Alert] 🔇 Initializing auto-dismiss for page alerts...');
    
    // Store originals
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;
    
    // Override alert - auto-dismiss
    window.alert = function(message) {
        console.log('[BLS Page Alert] 🔇 Auto-dismissed alert:', message);
        // Log to show user what was dismissed
        if (message && message.toLowerCase().includes('invalid')) {
            console.warn('[BLS Page Alert] ⚠️ Caught "invalid selection" alert:', message);
        }
        return undefined;
    };
    
    // Override confirm - always return true (OK)
    window.confirm = function(message) {
        console.log('[BLS Page Alert] ✅ Auto-confirmed dialog:', message);
        return true;
    };
    
    // Override prompt - return empty string or default
    window.prompt = function(message, defaultText = '') {
        console.log('[BLS Page Alert] 🔇 Auto-dismissed prompt:', message);
        return defaultText;
    };
    
    console.log('[BLS Page Alert] ✅ Page-level alert auto-dismiss active');
})();

// Listen for commands from content script
window.addEventListener('message', async (event) => {
    // Only accept messages from same origin
    if (event.source !== window) return;
    if (!event.data.type || event.data.type !== 'BLS_EXECUTE') return;
    
    const { id, code } = event.data;
    
    try {
        // Execute the code in page context where jQuery and page variables exist
        const result = eval(`(function() { ${code} })()`);
        
        // Send result back to content script
        window.postMessage({
            type: 'BLS_RESULT',
            id: id,
            success: true,
            result: result
        }, '*');
    } catch (error) {
        window.postMessage({
            type: 'BLS_RESULT',
            id: id,
            success: false,
            error: error.message
        }, '*');
    }
});

console.log('[BLS Page Context] Ready to receive commands');
