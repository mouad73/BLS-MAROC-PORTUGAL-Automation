// Background Service Worker for Proxy Management
console.log('[BLS Extension] Background service worker started');

let currentProxy = null;
let proxyList = [];
let currentProxyIndex = 0;
let autoRotateEnabled = false;
let currentIP = 'Not connected';

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('[BLS Extension] Extension installed/updated');
    
    // Load saved settings
    chrome.storage.sync.get(['proxyList', 'autoRotateEnabled', 'currentProxyIndex'], (result) => {
        proxyList = result.proxyList || [];
        autoRotateEnabled = result.autoRotateEnabled || false;
        currentProxyIndex = result.currentProxyIndex || 0;
        
        console.log('[BLS Extension] Loaded settings:', { proxyList, autoRotateEnabled, currentProxyIndex });
        
        // Apply proxy if available
        if (proxyList.length > 0 && autoRotateEnabled) {
            applyProxy(proxyList[currentProxyIndex]);
        }
    });
});

// Fetch current IP address with timeout and fallbacks
async function fetchCurrentIP() {
    const ipServices = [
        'https://api.ipify.org?format=json',
        'https://api.myip.com',
        'https://ipapi.co/json/',
        'https://ipinfo.io/json'
    ];
    
    for (const service of ipServices) {
        try {
            console.log('[BLS Extension] Attempting to fetch IP from:', service);
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(service, {
                signal: controller.signal,
                method: 'GET'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn('[BLS Extension] IP service returned error:', response.status);
                continue; // Try next service
            }
            
            const data = await response.json();
            
            // Different services return IP in different fields
            currentIP = data.ip || data.query || data.ipAddress || 'Unknown';
            
            console.log('[BLS Extension] ✅ Current IP:', currentIP);
            
            // Broadcast IP to all tabs
            chrome.tabs.query({ url: "https://morocco.blsportugal.com/*" }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'IP_UPDATED',
                        ip: currentIP
                    }).catch(err => console.log('Tab not ready:', err));
                });
            });
            
            // Update storage
            chrome.storage.sync.set({ currentIP });
            
            return currentIP;
        } catch (error) {
            console.warn('[BLS Extension] Failed to fetch IP from', service, ':', error.message);
            // Continue to next service
        }
    }
    
    // All services failed
    console.error('[BLS Extension] ❌ All IP services failed');
    currentIP = 'Unable to fetch IP';
    return currentIP;
}

// Apply proxy configuration
function applyProxy(proxy) {
    if (!proxy) {
        console.log('[BLS Extension] Clearing proxy');
        chrome.proxy.settings.clear({ scope: 'regular' }, () => {
            console.log('[BLS Extension] Proxy cleared');
            currentProxy = null;
            fetchCurrentIP();
        });
        return;
    }
    
    console.log('[BLS Extension] Applying proxy:', proxy.host);
    
    const proxyConfig = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: proxy.type || "http",
                host: proxy.host,
                port: parseInt(proxy.port)
            },
            bypassList: ["localhost", "127.0.0.1"]
        }
    };
    
    chrome.proxy.settings.set(
        { value: proxyConfig, scope: 'regular' },
        () => {
            if (chrome.runtime.lastError) {
                console.error('[BLS Extension] Proxy error:', chrome.runtime.lastError);
                return;
            }
            console.log('[BLS Extension] Proxy applied successfully');
            currentProxy = proxy;
            
            // Save current proxy
            chrome.storage.sync.set({ currentProxy });
            
            // Fetch new IP after proxy change
            setTimeout(() => fetchCurrentIP(), 2000);
        }
    );
}

// Rotate to next proxy
function rotateProxy() {
    if (proxyList.length === 0) {
        console.log('[BLS Extension] No proxies available to rotate');
        return;
    }
    
    currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
    console.log('[BLS Extension] Rotating to proxy index:', currentProxyIndex);
    
    chrome.storage.sync.set({ currentProxyIndex });
    applyProxy(proxyList[currentProxyIndex]);
    
    // Notify content scripts
    chrome.tabs.query({ url: "https://morocco.blsportugal.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'PROXY_ROTATED',
                proxy: proxyList[currentProxyIndex],
                index: currentProxyIndex
            }).catch(err => console.log('Tab not ready:', err));
        });
    });
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[BLS Extension] Message received:', request.type);
    
    switch (request.type) {
        case 'GET_CURRENT_IP':
            fetchCurrentIP().then(ip => sendResponse({ ip }));
            return true; // Keep channel open for async response
            
        case 'GET_PROXY_STATUS':
            sendResponse({
                currentProxy,
                proxyList,
                currentProxyIndex,
                autoRotateEnabled,
                currentIP
            });
            break;
            
        case 'SET_PROXY_LIST':
            proxyList = request.proxyList;
            currentProxyIndex = 0;
            console.log('[BLS Extension] Saving proxy list:', proxyList.length, 'proxies');
            console.log('[BLS Extension] Proxy list data:', JSON.stringify(proxyList, null, 2));
            chrome.storage.sync.set({ proxyList, currentProxyIndex }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[BLS Extension] Error saving proxies:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('[BLS Extension] Proxy list saved successfully');
                    sendResponse({ success: true });
                }
            });
            return true;
            
        case 'TOGGLE_AUTO_ROTATE':
            autoRotateEnabled = request.enabled;
            chrome.storage.sync.set({ autoRotateEnabled }, () => {
                if (autoRotateEnabled && proxyList.length > 0) {
                    applyProxy(proxyList[currentProxyIndex]);
                } else if (!autoRotateEnabled) {
                    applyProxy(null); // Clear proxy
                }
                sendResponse({ success: true, enabled: autoRotateEnabled });
            });
            return true;
            
        case 'ROTATE_PROXY':
            if (proxyList.length === 0) {
                console.error('[BLS Extension] ❌ Cannot rotate: No proxies in list');
                setTimeout(() => {
                    sendResponse({ 
                        success: false, 
                        error: 'No proxies available. Please add proxies in the extension popup.' 
                    });
                }, 10);
                return true; // Async response
            } else {
                console.log('[BLS Extension] 🔄 Rotating from index', currentProxyIndex, 'to next proxy...');
                rotateProxy();
                // Wait a tiny bit for proxy to be applied, then respond
                setTimeout(() => {
                    console.log('[BLS Extension] ✅ Rotation complete. New index:', currentProxyIndex);
                    sendResponse({ 
                        success: true, 
                        proxy: currentProxy,
                        index: currentProxyIndex
                    });
                }, 100);
                return true; // Will respond asynchronously
            }
            break;
            
        case 'APPLY_PROXY':
            if (request.index >= 0 && request.index < proxyList.length) {
                currentProxyIndex = request.index;
                chrome.storage.sync.set({ currentProxyIndex });
                applyProxy(proxyList[currentProxyIndex]);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Invalid proxy index' });
            }
            break;
            
        case 'CLEAR_PROXY':
            applyProxy(null);
            sendResponse({ success: true });
            break;
            
        case 'REFRESH_IP':
            fetchCurrentIP().then(ip => sendResponse({ ip }));
            return true;
            
        default:
            console.log('[BLS Extension] Unknown message type:', request.type);
    }
    
    return false;
});

// Handle web request errors (rate limiting detection)
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.statusCode === 429 || details.statusCode === 403) {
            console.warn('[BLS Extension] ⚠️ Rate limit detected in onCompleted! Status:', details.statusCode);
            console.warn('[BLS Extension] URL:', details.url);
            console.warn('[BLS Extension] 🔄 Will notify content script to rotate proxy automatically');
            
            // Notify content script - it will handle rotation
            chrome.tabs.query({ url: "https://morocco.blsportugal.com/*" }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'RATE_LIMIT_DETECTED',
                        statusCode: details.statusCode,
                        url: details.url
                    }).catch(err => console.log('Tab not ready:', err));
                });
            });
        }
    },
    { urls: ["https://morocco.blsportugal.com/*"] }
);

// Also listen for network errors (429 might appear here too)
chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        console.warn('[BLS Extension] ⚠️ Network error detected:', details.error);
        console.warn('[BLS Extension] URL:', details.url);
        
        // If error message contains "429" or "Too Many Requests"
        if (details.error && (details.error.includes('429') || details.error.toLowerCase().includes('too many'))) {
            console.warn('[BLS Extension] 🔄 Rate limit in error - rotating proxy');
            
            // Notify content script
            chrome.tabs.query({ url: "https://morocco.blsportugal.com/*" }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'RATE_LIMIT_DETECTED',
                        statusCode: 429,
                        url: details.url,
                        error: details.error
                    }).catch(err => console.log('Tab not ready:', err));
                });
            });
        }
    },
    { urls: ["https://morocco.blsportugal.com/*"] }
);

// Handle proxy authentication (Manifest V3 compatible)
chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        console.log('[BLS Extension] Proxy auth required');
        
        if (currentProxy && currentProxy.username && currentProxy.password) {
            console.log('[BLS Extension] Providing proxy credentials for:', currentProxy.host);
            return {
                authCredentials: {
                    username: currentProxy.username,
                    password: currentProxy.password
                }
            };
        } else {
            console.warn('[BLS Extension] No credentials available for proxy auth');
            return { cancel: false };
        }
    },
    { urls: ["<all_urls>"] },
    ['asyncBlocking']
);

// Periodic IP check (every 5 minutes)
chrome.alarms.create('checkIP', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkIP') {
        fetchCurrentIP();
    }
});

// Initial IP fetch
fetchCurrentIP();
