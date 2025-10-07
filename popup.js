// Popup Script
console.log('[BLS Popup] Script loaded');

let proxyStatus = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    loadStatus();
    setupEventListeners();
});

function setupEventListeners() {
    // Automation controls
    document.getElementById('startAutomationBtn').addEventListener('click', () => {
        startAutomation();
    });
    
    document.getElementById('stopAutomationBtn').addEventListener('click', () => {
        stopAutomation();
    });
    
    // Proxy controls
    document.getElementById('refreshIPBtn').addEventListener('click', () => {
        refreshIP();
    });
    
    document.getElementById('rotateProxyBtn').addEventListener('click', () => {
        rotateProxy();
    });
    
    document.getElementById('clearProxyBtn').addEventListener('click', () => {
        clearProxy();
    });
}

function loadStatus() {
    // Load automation status
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getAutomationStatus' }, (response) => {
                if (response) {
                    updateAutomationUI(response.isRunning);
                }
            });
        }
    });
    
    // Load proxy status
    chrome.runtime.sendMessage({ type: 'GET_PROXY_STATUS' }, (response) => {
        if (response) {
            proxyStatus = response;
            updateUI();
        }
    });
}

function startAutomation() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'startAutomation' }, (response) => {
                if (response && response.success) {
                    console.log('[BLS Popup] Automation started');
                    updateAutomationUI(true);
                }
            });
        }
    });
}

function stopAutomation() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'stopAutomation' }, (response) => {
                if (response && response.success) {
                    console.log('[BLS Popup] Automation stopped');
                    updateAutomationUI(false);
                }
            });
        }
    });
}

function updateAutomationUI(isRunning) {
    const startBtn = document.getElementById('startAutomationBtn');
    const stopBtn = document.getElementById('stopAutomationBtn');
    const badge = document.getElementById('automationBadge');
    
    if (isRunning) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        badge.textContent = 'RUNNING';
        badge.className = 'badge badge-running';
    } else {
        startBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        badge.textContent = 'STOPPED';
        badge.className = 'badge badge-stopped';
    }
}

function updateUI() {
    // Update IP
    const ipEl = document.getElementById('currentIP');
    if (ipEl) {
        ipEl.textContent = proxyStatus.currentIP || '-';
        ipEl.className = 'value';
    }
    
    // Update Proxy Status
    const proxyEl = document.getElementById('proxyStatus');
    if (proxyEl) {
        if (proxyStatus.currentProxy) {
            const proxy = `${proxyStatus.currentProxy.host}:${proxyStatus.currentProxy.port}`;
            proxyEl.textContent = proxy.length > 20 ? proxy.substring(0, 17) + '...' : proxy;
            proxyEl.className = 'value success';
        } else {
            proxyEl.textContent = 'None';
            proxyEl.className = 'value error';
        }
    }
    
    // Update Proxy List
    updateProxyList();
}

function updateProxyList() {
    const listEl = document.getElementById('proxyList');
    if (!listEl) return;
    
    if (!proxyStatus.proxyList || proxyStatus.proxyList.length === 0) {
        listEl.innerHTML = `
            <div class="info-text">
                No proxies configured
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = proxyStatus.proxyList.map((proxy, index) => {
        const isActive = proxyStatus.currentProxy && 
                        proxyStatus.currentProxy.host === proxy.host && 
                        proxyStatus.currentProxy.port === proxy.port;
        
        return `
            <div class="proxy-item ${isActive ? 'active' : ''}">
                <div>
                    <strong>${proxy.type}://${proxy.host}:${proxy.port}</strong>
                    ${isActive ? '<span class="badge badge-active" style="margin-left: 5px;">ACTIVE</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function refreshIP() {
    showMessage('Refreshing IP...');
    chrome.runtime.sendMessage({ type: 'REFRESH_IP' }, (response) => {
        if (response && response.ip) {
            setTimeout(() => {
                loadStatus();
                showMessage(`✅ IP: ${response.ip}`, 2000);
            }, 1000);
        }
    });
}

function rotateProxy() {
    if (!proxyStatus.proxyList || proxyStatus.proxyList.length === 0) {
        showMessage('❌ No proxies configured', 2000);
        return;
    }
    
    showMessage('Rotating proxy...');
    chrome.runtime.sendMessage({ type: 'ROTATE_PROXY' }, (response) => {
        if (response && response.success) {
            setTimeout(() => {
                loadStatus();
                showMessage('✅ Proxy rotated', 2000);
            }, 1000);
        }
    });
}

function clearProxy() {
    showMessage('Clearing proxy...');
    chrome.runtime.sendMessage({ type: 'CLEAR_PROXY' }, (response) => {
        if (response && response.success) {
            setTimeout(() => {
                loadStatus();
                showMessage('✅ Proxy cleared', 2000);
            }, 1000);
        }
    });
}

function showMessage(message, duration = 1000) {
    const existingMsg = document.getElementById('tempMessage');
    if (existingMsg) {
        existingMsg.remove();
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.id = 'tempMessage';
    msgDiv.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 11px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    if (duration > 0) {
        setTimeout(() => {
            msgDiv.remove();
        }, duration);
    }
}
