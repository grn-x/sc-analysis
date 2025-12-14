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
 *
 *   // show banner manually later
 *   LocalEnv.showBanner('Custom message');
 *   // with options:
 *   LocalEnv.showBanner('Urgent!', { force: true, duration: 3000 });
 *
 *   // debug override; can be called before init
 *   LocalEnv.debugOverwriteLocal(true, 'Detected Local Host; But Overwritten', 'Detected External Host; But Overwritten');
 */

const LOGGING_ENABLED = false;

const LocalEnv = (() => {
    let _isLocal = null;

    let _debugOverride = null;
    let _debugMsgTrue = null;
    let _debugMsgFalse = null;

    //let _bannerShown = false; // cooldown to prevent multiple banners; true if a banner is shown

    // Banner queue; manage sequential banner display (except force? TOOD) using promise-based async await timeouts
    // used to be a simple bool flag, but now evolved into a full object, even though its still majorly dependent on
    // correct implementation in createLocalBanner/during its usage; not that great, but works for now
    // (ill not use this much anyways)
    const _bannerQueue = {
        active: false,              // currently banner showing flag; crucial in tryRegister to avoid raceconditions
        waiters: [],                // FIFO queue of {resolve, message} objects
        activeResolve: null,        // Resolve function to complete current banner
        delayBetween: 150,          // Delay (ms) between banners

        // Wait for turn to display banner
        async wait(message, force = false) {
            if(LOGGING_ENABLED)console.log('[LocalEnv] Banner queue wait called. Force:', force);
            // Force interrupts current banner and jumps to front / highest prio
            if (force && this.active) {
                // Trigger immediate removal of current banner //todo low priority fix
                if (this.activeResolve) {
                    this.activeResolve();
                    this.activeResolve = null;
                }
                this.active = false;
                //small delay to let DOM settle
                await new Promise(resolve => setTimeout(resolve, 100));
                return;
            }

            // proceed if no active notification
            if (!this.active && this.waiters.length === 0) {
                if(LOGGING_ENABLED)console.log('[LocalEnv] No active banner, proceeding immediately');
                return;
            }

            // otherwise: queue up and await returned promise
            return new Promise(resolve => {
                if(LOGGING_ENABLED)console.log('[LocalEnv] Banner queued');
                this.waiters.push({ resolve, message });
            });
        },

        // used to be called after wait; thinking this would be enough, though using the promise based wait only causes
        // simultaneous registers; thus tryRegister
        /*register() {
            this.active = true;
            console.log('[LocalEnv] Banner registered as active');
        },*/

        // called at start; attempt register if not active and send true; else return false and let obj wait
        // should be implemented via a while !tryRegister loop, awaiting wait() in loop body
        tryRegister() {
            if (!this.active) {
                this.active = true;
                if(LOGGING_ENABLED)console.log('[LocalEnv] Banner tryRegister succeeded');
                return true;
            }
            if(LOGGING_ENABLED)console.log('[LocalEnv] Banner tryRegister failed, already active');
            return false;
        },

        // code assumes that after banner finishes, it autonmously calls notify to trigger next in queue
        async notify() {
            if(LOGGING_ENABLED)console.log('[LocalEnv] Banner finished, checking queue');
            this.active = false;
            this.activeResolve = null;

            // delay between banners
            if (this.waiters.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delayBetween));
            }

            if (this.waiters.length > 0) {
                const next = this.waiters.shift();
                next.resolve();
            }
        }
    };

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

    // Now async, waits for queue, accepts duration and force params
    async function createLocalBanner(message, duration = 5000, force = false) {
        //if (_bannerShown) return;
        //_bannerShown = true;

        while(! _bannerQueue.tryRegister()){
            // Wait for our turn in the queue
            await _bannerQueue.wait(message, force);
        }
        // Register as active banner
        //_bannerQueue.register();

        const banner = document.createElement('div');
        banner.id = 'local-env-banner';
        banner.textContent = message;

        const closeBtn = document.createElement('span');
        closeBtn.textContent = 'x';
        closeBtn.style.cssText = 'margin-left:10px;cursor:pointer;font-weight:bold';
        //closeBtn.onclick = () => {
        //    banner.style.opacity = '0';
        //    setTimeout(() => banner.remove(), 300);
        //};

        // shared cleanup; notifies queue
        const removeBanner = () => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                banner.remove();
                // notify next waiter in queue
                _bannerQueue.notify();
            }, 400);
        };

        closeBtn.onclick = removeBanner;

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
            transition:opacity 0.4s ease,transform 0.4s ease
        `;

        document.body.appendChild(banner);

        requestAnimationFrame(() => {
            banner.style.opacity = '1';
            banner.style.transform = 'translateY(0)';
        });

        // call shared cleanup after custom duration!!!
        setTimeout(() => {
            if (!banner.isConnected) return;
            removeBanner();
        }, duration);
    }

    // internal helper that handles DOM ready logic; this gets exposed to outside
    // passes duration and force to createLocalBanner
    function _showBanner(message, duration = 5000, force = false) {
        if (document.readyState !== 'loading') {
            createLocalBanner(message, duration, force);
        } else {
            document.addEventListener('DOMContentLoaded', () => createLocalBanner(message, duration, force));
        }
    }

    // controllable debug layer between detection and usage
    // allows overwriting detected local state for testing purposes
    // if overwrite method is called; else actual value is returned
    function _getEffectiveIsLocal() {
        if (_isLocal === null) {
            _isLocal = detectLocalEnvironment();
        }

        if (_debugOverride !== null) {
            return _debugOverride;
        }
        return _isLocal;
    }

    return {
        /**
         * Initialize the local environment detector
         * @param {Object} options config options:
         * @param {boolean} options.showBanner display banner if local (default: true)
         * @param {string} options.bannerMessage custom banner message
         * @param {boolean} options.showBannerExt display banner even if not local (default: false)
         * @param {string} options.bannerMessageExt custom banner message for non-local
         */
        init(options = {}) {
            const {
                showBanner: shouldShowBanner = true,
                bannerMessage = 'Local hosting environment detected',
                showBannerExt: shouldShowBannerExt = false,
                bannerMessageExt = 'External Host detected'
            } = options;

            /*if (_isLocal === null) {
                _isLocal = detectLocalEnvironment();
                if(LOGGING_ENABLED)console.log('[LocalEnv] Local environment detected:', _isLocal);
            }

            if (_isLocal && shouldShowBanner) {
                _showBanner(bannerMessage);
            }
            if (!_isLocal && shouldShowBannerExt) {
                _showBanner(bannerMessageExt);
            }*/

            const effectiveIsLocal = _getEffectiveIsLocal();
            if(LOGGING_ENABLED)console.log('[LocalEnv] Local environment detected:', _isLocal);

            if(_debugOverride==null){ //normal execution log
                if (_isLocal && shouldShowBanner) {
                    _showBanner(bannerMessage, 7000);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 1: Evaluated as Local');
                }
                if (!_isLocal && shouldShowBannerExt) {
                    _showBanner(bannerMessageExt, 7000);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 2: Evaluated as External');
                }
            }else { //debug overwrite log
                /*if (effectiveIsLocal && shouldShowBanner) {
                    const msg =
                    (_debugMsgTrue) ? _debugMsgTrue : bannerMessage; // fallback to bannerMessage cannot happen accidentally
                                                                    // _dbgMsg setter provides default method params
                    _showBanner(msg);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 3: Debug Overwrite to Local');
                }
                if (!effectiveIsLocal && shouldShowBannerExt) {
                    const msg = (_debugMsgFalse) ? _debugMsgFalse : bannerMessageExt;
                    _showBanner(msg);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 4: Debug Overwrite to External');
                }*/ //This block differentiates by the user created constant value, but not by the actual detection result
                // that is overwritten; see below:

                if (_isLocal && shouldShowBanner) {
                    const msg =
                        (_debugMsgTrue) ? _debugMsgTrue : bannerMessage; // fallback to bannerMessage cannot happen accidentally
                    // _dbgMsg setter provides default method params
                    _showBanner(msg, 10000);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 3: Evaluated as Local, but Overwritten to Local =', _debugOverride);
                }
                if (!_isLocal && shouldShowBannerExt) {
                    const msg = (_debugMsgFalse) ? _debugMsgFalse : bannerMessageExt;
                    _showBanner(msg, 10000);
                    if(LOGGING_ENABLED)console.log('[LocalEnv] Init Path 4: Evaluated as External, but Overwritten to Local =', _debugOverride);
                }
            }


            return this;
        },

        /**
         * check if running in local environment
         * @returns {boolean}
         */
        get isLocal() {
            /*if (_isLocal === null) {
                _isLocal = detectLocalEnvironment();
            }
            return _isLocal;*/
            return _getEffectiveIsLocal();
        },

        /**
         * show banner manually (queues if one is already showing)
         * @param {string} message custom message
         * @param {Object} options display options
         * @param {boolean} options.force skip queue and show immediately (default: false)
         * @param {number} options.duration how long to show banner in ms (default: 5000)
         */
        showBanner(message = 'Manual Banner Message', options = {}) {
            const { force = false, duration = 5000 } = options;
            if(LOGGING_ENABLED)console.log('[LocalEnv] showBanner called');
            _showBanner(message, duration, force);
        },

        /**
         * Debug method to override local detection
         * @param {boolean} isLocal force isLocal to this value
         * @param {string} msgLocalTrue banner message when actual env is local but overridden
         * @param {string} msgLocalFalse banner message when actual env is not local but overridden
         */
        debugOverwriteLocal(isLocal, msgLocalTrue= `Detected Local Host; Value was overwritten to Local = ${isLocal}`, msgLocalFalse= `Detected External Host; Value was overwritten to Local = ${isLocal}`) {
            _debugOverride = isLocal;
            _debugMsgTrue = msgLocalTrue;
            _debugMsgFalse = msgLocalFalse;
            if(LOGGING_ENABLED)console.log('[LocalEnv] Debug override set:', _debugOverride);
            return this;
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
