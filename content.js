(() => {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;

  let audioCtx = null;
  let gainNode = null;
  let currentVolume = 100;
  const processed = new WeakSet();

  function ensureAudioContext() {
    if (audioCtx) return true;
    try {
      audioCtx = new AudioContext();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = currentVolume / 100;
      gainNode.connect(audioCtx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resumeContext() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function processElement(el) {
    if (processed.has(el)) return;
    if (!ensureAudioContext()) return;

    try {
      const source = audioCtx.createMediaElementSource(el);
      source.connect(gainNode);
      processed.add(el);
    } catch {
      // Cross-origin or already-connected element; fall back to native volume
      applyNativeVolume(el);
    }
  }

  function applyNativeVolume(el) {
    const clamped = Math.min(currentVolume / 100, 1);
    el.volume = clamped;
  }

  function setVolume(value) {
    currentVolume = value;
    if (gainNode) {
      gainNode.gain.value = value / 100;
    }
  }

  function scanForMedia() {
    const elements = document.querySelectorAll("audio, video");
    elements.forEach((el) => processElement(el));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.tagName === "AUDIO" || node.tagName === "VIDEO") {
          processElement(node);
        }
        // Also check children of the added node
        const nested = node.querySelectorAll?.("audio, video");
        if (nested) nested.forEach((el) => processElement(el));
      }
    }
  });

  function init() {
    scanForMedia();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // Resume AudioContext on first user interaction (autoplay policy)
  const interactionEvents = ["click", "keydown", "touchstart", "pointerdown"];
  function onInteraction() {
    resumeContext();
    interactionEvents.forEach((e) =>
      document.removeEventListener(e, onInteraction, true)
    );
  }
  interactionEvents.forEach((e) =>
    document.addEventListener(e, onInteraction, true)
  );

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "SET_VOLUME") {
      setVolume(msg.volume);
      sendResponse({ ok: true, volume: currentVolume });
    } else if (msg.type === "GET_VOLUME") {
      sendResponse({ ok: true, volume: currentVolume });
    } else if (msg.type === "PING") {
      sendResponse({ ok: true });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
