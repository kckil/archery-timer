async function setupOfflineAccess() {
    const status = document.getElementById('offline-status');
    if (!window.isSecureContext || !('serviceWorker' in navigator)) {
        status.textContent = 'Offline access requires HTTPS (or localhost) and a browser with service worker support.';
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        const showReady = (updateAvailable = Boolean(registration.waiting)) => {
            status.textContent = updateAvailable
                ? 'Ready for offline use. Update available: close all app tabs and reopen to apply.'
                : 'Ready for offline use.';
        };
        const watchInstallation = () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed') showReady(Boolean(registration.active));
                if (worker.state === 'redundant') {
                    status.textContent = 'Offline download failed. Reconnect and reload to retry.';
                    console.error('Offline service worker installation failed.');
                }
            });
        };
        registration.addEventListener('updatefound', watchInstallation);
        watchInstallation();
        await navigator.serviceWorker.ready;
        showReady();
    } catch (error) {
        status.textContent = 'Offline setup failed. Reconnect and reload to retry.';
        console.error('Could not set up offline access:', error);
    }
}

setupOfflineAccess();
