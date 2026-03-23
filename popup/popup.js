(() => {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;
  const tabListEl = document.getElementById("tab-list");
  const searchEl = document.getElementById("search");

  const VOLUME_MIN = 0;
  const VOLUME_MAX = 600;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let allTabs = [];

  // ── SVG icon builders ──

  function createSvgRoot(size) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    return svg;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function buildIconVolume() {
    const svg = createSvgRoot(14);
    svg.appendChild(svgEl("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }));
    svg.appendChild(svgEl("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }));
    svg.appendChild(svgEl("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }));
    return svg;
  }

  function buildIconMuted() {
    const svg = createSvgRoot(14);
    svg.appendChild(svgEl("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }));
    svg.appendChild(svgEl("line", { x1: "23", y1: "9", x2: "17", y2: "15" }));
    svg.appendChild(svgEl("line", { x1: "17", y1: "9", x2: "23", y2: "15" }));
    return svg;
  }

  function buildIconGlobe() {
    const svg = createSvgRoot(10);
    svg.appendChild(svgEl("circle", { cx: "12", cy: "12", r: "10" }));
    svg.appendChild(svgEl("line", { x1: "2", y1: "12", x2: "22", y2: "12" }));
    svg.appendChild(svgEl("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" }));
    return svg;
  }

  function setMuteIcon(btn, muted) {
    btn.textContent = "";
    btn.appendChild(muted ? buildIconMuted() : buildIconVolume());
  }

  // ── Helpers ──

  function sendMessage(msg) {
    return new Promise((resolve) => {
      api.runtime.sendMessage(msg, resolve);
    });
  }

  function isUserTab(tab) {
    if (!tab.url) return true;
    const skip = ["chrome://", "chrome-extension://", "about:", "moz-extension://", "edge://"];
    return !skip.some((prefix) => tab.url.startsWith(prefix));
  }

  function volumeClass(volume, muted) {
    if (muted || volume === 0) return "muted";
    if (volume > 100) return "boosted";
    return "";
  }

  function updateSliderFill(input) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`;
  }

  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // ── Build a single tab card ──

  function buildTabCard(tab) {
    const card = el("div", "tab-card");
    card.dataset.tabId = tab.id;

    const effectiveVolume = tab.muted ? 0 : tab.volume;
    const volClass = volumeClass(tab.volume, tab.muted);

    // ── Tab info row ──
    const info = el("div", "tab-info");

    if (tab.favIconUrl) {
      const img = el("img", "tab-favicon");
      img.src = tab.favIconUrl;
      img.alt = "";
      info.appendChild(img);
    } else {
      const ph = el("div", "tab-favicon-placeholder");
      ph.appendChild(buildIconGlobe());
      info.appendChild(ph);
    }

    const title = el("span", "tab-title");
    title.textContent = tab.title;
    title.title = tab.title;
    info.appendChild(title);

    if (tab.audible) {
      info.appendChild(el("span", "audible-badge"));
    }

    card.appendChild(info);

    // ── Volume controls row ──
    const controls = el("div", "volume-controls");

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = VOLUME_MIN;
    slider.max = VOLUME_MAX;
    slider.step = 1;
    slider.value = tab.muted ? 0 : tab.volume;
    controls.appendChild(slider);

    const volInput = document.createElement("input");
    volInput.type = "number";
    volInput.className = "volume-input " + volClass;
    volInput.value = effectiveVolume;
    volInput.min = VOLUME_MIN;
    volInput.max = VOLUME_MAX;
    controls.appendChild(volInput);

    const pct = el("span", "volume-percent");
    pct.textContent = "%";
    controls.appendChild(pct);

    const muteBtn = el("button", "btn-mute" + (tab.muted ? " is-muted" : ""));
    muteBtn.title = tab.muted ? "Unmute" : "Mute";
    setMuteIcon(muteBtn, tab.muted);
    controls.appendChild(muteBtn);

    card.appendChild(controls);

    updateSliderFill(slider);

    // ── Interaction logic ──

    function clampVolume(val) {
      const n = Math.round(Number(val));
      if (isNaN(n) || n < VOLUME_MIN) return VOLUME_MIN;
      if (n > VOLUME_MAX) return VOLUME_MAX;
      return n;
    }

    function syncUI(vol, fromSlider) {
      volInput.value = vol;
      volInput.className = "volume-input " + volumeClass(vol, false);
      if (!fromSlider) slider.value = vol;
      updateSliderFill(slider);
      const isMuted = vol === 0;
      muteBtn.classList.toggle("is-muted", isMuted);
      setMuteIcon(muteBtn, isMuted);
    }

    let debounceTimer = null;
    function applyVolume(vol) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendMessage({ type: "SET_VOLUME", tabId: tab.id, volume: vol });
      }, 30);
    }

    slider.addEventListener("input", () => {
      const vol = Number(slider.value);
      syncUI(vol, true);
      applyVolume(vol);
    });

    function commitInputValue() {
      const vol = clampVolume(volInput.value);
      syncUI(vol, false);
      applyVolume(vol);
    }

    volInput.addEventListener("blur", commitInputValue);
    volInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitInputValue();
        volInput.blur();
      }
    });
    volInput.addEventListener("focus", () => volInput.select());

    muteBtn.addEventListener("click", async () => {
      const result = await sendMessage({ type: "TOGGLE_MUTE", tabId: tab.id });
      if (!result) return;

      const isMuted = result.muted;
      muteBtn.classList.toggle("is-muted", isMuted);
      setMuteIcon(muteBtn, isMuted);
      muteBtn.title = isMuted ? "Unmute" : "Mute";

      const displayVol = isMuted ? 0 : result.volume;
      slider.value = displayVol;
      volInput.value = displayVol;
      volInput.className = "volume-input " + volumeClass(result.volume, isMuted);
      updateSliderFill(slider);
    });

    return card;
  }

  // ── Render ──

  function renderTabs(tabs) {
    tabListEl.textContent = "";

    if (tabs.length === 0) {
      const empty = el("div", "empty");
      empty.textContent = "No tabs found";
      tabListEl.appendChild(empty);
      return;
    }

    tabs.sort((a, b) => {
      if (a.audible !== b.audible) return a.audible ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    for (const tab of tabs) {
      tabListEl.appendChild(buildTabCard(tab));
    }
  }

  // ── Search / filter ──

  searchEl.addEventListener("input", () => {
    const query = searchEl.value.toLowerCase().trim();
    const filtered = query
      ? allTabs.filter((t) => t.title.toLowerCase().includes(query) || t.url.toLowerCase().includes(query))
      : allTabs;
    renderTabs(filtered);
  });

  // ── Init ──

  async function init() {
    const tabs = await sendMessage({ type: "GET_ALL_TABS" });
    if (!tabs) {
      tabListEl.textContent = "";
      const empty = el("div", "empty");
      empty.textContent = "Could not load tabs";
      tabListEl.appendChild(empty);
      return;
    }
    allTabs = tabs.filter(isUserTab);
    renderTabs(allTabs);
    searchEl.focus();
  }

  init();
})();
