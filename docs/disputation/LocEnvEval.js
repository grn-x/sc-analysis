/**
 * local hosting detection
 * Usage:
 *   import { LocalEnv } from './LocEnvEval.js';
 *
 *   // optional banner
 *   LocalEnv.init({ showBanner: true, bannerMessage: 'Dev Mode' });
 *
 *   // is-local checks without reevaluation
 *   if (LocalEnv.isLocal) { ... }
 */

const LocalEnv = (() => {
    let _isLocal = null;
    let _bannerShown = false;

    function isValidIPv4Octet(num) {
        return num >= 0 && num <= 255;
    }

    function isPrivateIPv4(hostname) {
        // remove port
        const host = hostname.split(':')[0];

        // validate IPv4 format
        const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!match) return false;

        const octets = match.slice(1, 5).map(Number);

        // validate octet ranges
        if (!octets.every(isValidIPv4Octet)) return false;

        const [a, b, c, d] = octets;

        // 10.0.0.0/8
        if (a === 10) return true;

        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;

        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;

        // 127.0.0.0/8 (loopback)
        if (a === 127) return true;

        // 169.254.0.0/16 (link-local)
        if (a === 169 && b === 254) return true;

        // 0.0.0.0/8 (this network)
        if (a === 0) return true;

        return false;
    }

    function isPrivateIPv6(hostname) {
        // remove port; IPv6 uses brackets
        const host = hostname.replace(/^\[|\].*$/g, '').toLowerCase();

        // Loopback ::1
        if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

        // Link-local fe80::/10
        if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

        // unique local fc00::/7; includes fd00::/8
        if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;

        return false;
    }

    function detectLocalEnvironment() {
        const host = window.location.hostname.toLowerCase();
        const protocol = window.location.protocol;

        // file:// protocol
        if (protocol === 'file:') return true;

        // exact localhost matches
        if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return true;

        // *.localhost domains (RFC 6761)
        if (host.endsWith('.localhost')) return true;

        // .local domains (mDNS)
        if (host.endsWith('.local')) return true;

        // private IPv4 addresses
        if (isPrivateIPv4(host)) return true;

        // private IPv6 addresses
        if (host.includes(':') && isPrivateIPv6(host)) return true;

        /*  //do this? TODO?
            // Common development hostnames
            const devHosts = ['0.0.0.0', 'local.', 'dev.', 'test.'];
            if (devHosts.some(prefix => host.startsWith(prefix))) return true;
        */
        return false;
    }

    function createLocalBanner(message) {
        if (_bannerShown) return;
        _bannerShown = true;

        const banner = document.createElement('div');
        banner.id = 'local-env-banner';
        banner.textContent = message;

        const closeBtn = document.createElement('span');
        closeBtn.textContent = 'x';
        closeBtn.style.cssText = 'margin-left:10px;cursor:pointer;font-weight:bold';
        closeBtn.onclick = () => {
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        };

        banner.appendChild(closeBtn);

        banner.style.cssText = `
            position:fixed;
            top:10px;
            left:10px;
            padding:12px 16px;
            background:rgba(0,0,0,0.85);
            color:white;
            font-family:system-ui,sans-serif;
            font-size:14px;
            border-radius:8px;
            box-shadow:0 4px 12px rgba(0,0,0,0.3);
            z-index:99999;
            opacity:0;
            transform:translateY(-10px);
            transition:opacity 0.3s ease,transform 0.3s ease
        `;

        document.body.appendChild(banner);

        requestAnimationFrame(() => {
            banner.style.opacity = '1';
            banner.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            if (!banner.isConnected) return;
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-10px)';
            setTimeout(() => banner.remove(), 300);
        }, 5000);
    }

    return {
        /**
         * Initialize the local environment detector
         * @param {Object} options config options:
         * @param {boolean} options.showBanner display banner if local (default: false)
         * @param {string} options.bannerMessage custom banner message
         */
        init(options = {}) {
            const { showBanner = false, bannerMessage = 'Local hosting environment detected' } = options;

            if (_isLocal === null) {
                _isLocal = detectLocalEnvironment();
                console.log('[LocalEnv] Local environment detected:', _isLocal);
            }

            if (showBanner && _isLocal && document.readyState !== 'loading') {
                createLocalBanner(bannerMessage);
            } else if (showBanner && _isLocal) {
                document.addEventListener('DOMContentLoaded', () => createLocalBanner(bannerMessage));
            }

            return this;
        },

        /**
         * check if running in local environment
         * @returns {boolean}
         */
        get isLocal() {
            if (_isLocal === null) {
                _isLocal = detectLocalEnvironment();
            }
            return _isLocal;
        },

        /**
         * show banner manually
         * @param {string} message custom message
         */
        showBanner(message = 'Local hosting environment detected') {
            if (this.isLocal) {
                if (document.readyState !== 'loading') {
                    createLocalBanner(message);
                } else {
                    document.addEventListener('DOMContentLoaded', () => createLocalBanner(message));
                }
            }
        }
    };
})();

// ES6 export https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
export { LocalEnv };

/* CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalEnv };
}
*/
