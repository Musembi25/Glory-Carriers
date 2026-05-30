import { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "glory-carriers-pwa-install-dismissed";

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android/i.test(navigator.userAgent);
}

function isDesktopDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return !isIosDevice() && !isAndroidDevice() && window.matchMedia("(pointer: fine)").matches;
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg/i.test(ua);
}

function isInstallableDesktopBrowser() {
  return isDesktopDevice() && !isSafariBrowser();
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [manualHint, setManualHint] = useState(null);

  const standalone = useMemo(() => isStandaloneMode(), []);
  const ios = useMemo(() => isIosDevice(), []);
  const android = useMemo(() => isAndroidDevice(), []);
  const desktop = useMemo(() => isDesktopDevice(), []);
  const safari = useMemo(() => isSafariBrowser(), []);
  const installableDesktop = useMemo(() => isInstallableDesktopBrowser(), []);

  useEffect(() => {
    if (standalone || dismissed) {
      return undefined;
    }

    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setManualHint(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [standalone, dismissed]);

  if (standalone || dismissed) {
    return null;
  }

  async function installApp() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice?.outcome === "accepted") {
        setDeferredPrompt(null);
        setManualHint(null);
      }

      return;
    }

    if (ios) {
      setManualHint("ios");
      return;
    }

    if (android) {
      setManualHint("android");
      return;
    }

    if (desktop && safari) {
      setManualHint("desktop-safari");
      return;
    }

    if (desktop) {
      setManualHint("desktop-chrome");
    }
  }

  function dismiss() {
    setDismissed(true);
    setManualHint(null);

    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  }

  const showPrompt =
    deferredPrompt ||
    ios ||
    android ||
    installableDesktop ||
    (desktop && safari);

  if (!showPrompt && !manualHint) {
    return null;
  }

  function renderInstructions() {
    if (manualHint === "ios" || (ios && !deferredPrompt && !manualHint)) {
      return (
        <p>
          On iPhone or iPad: tap <strong>Share</strong>{" "}
          <span aria-hidden="true">(□↑)</span>, then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      );
    }

    if (manualHint === "android" || (android && !deferredPrompt && !manualHint)) {
      return (
        <p>
          On Android: open the browser menu <strong>(⋮)</strong>, then tap{" "}
          <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      );
    }

    if (manualHint === "desktop-safari" || (desktop && safari && manualHint !== "desktop-chrome")) {
      return (
        <p>
          On Mac (Safari): choose <strong>File → Add to Dock</strong>. On iPhone or iPad Safari,
          use <strong>Share → Add to Home Screen</strong>.
        </p>
      );
    }

    if (manualHint === "desktop-chrome" || (desktop && !safari && !deferredPrompt)) {
      return (
        <p>
          On Windows or Mac: click <strong>Install app</strong> below, or use the install icon in
          your browser address bar (Chrome, Edge, or Brave).
        </p>
      );
    }

    return (
      <p>
        Add Glory Carriers to your home screen or desktop for quick access, like a native app.
      </p>
    );
  }

  const primaryLabel = deferredPrompt
    ? "Install app"
    : ios || manualHint === "ios"
      ? "How to install"
      : android || manualHint
        ? "Show steps"
        : "Install app";

  return (
    <div className="install-app-prompt" role="region" aria-label="Install Glory Carriers app">
      <div className="install-app-prompt-inner">
        <div className="install-app-prompt-copy">
          <strong>Install Glory Carriers</strong>
          {renderInstructions()}
        </div>
        <div className="install-app-prompt-actions">
          <button type="button" className="primary-button" onClick={installApp}>
            {primaryLabel}
          </button>
          <button type="button" className="ghost-button" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
