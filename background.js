const api = globalThis.browser || globalThis.chrome;

const tabVolumes = new Map();

const DEFAULT_VOLUME = 100;

function getTabState(tabId) {
  if (!tabVolumes.has(tabId)) {
    tabVolumes.set(tabId, { volume: DEFAULT_VOLUME, muted: false });
  }
  return tabVolumes.get(tabId);
}

async function persistState() {
  const data = {};
  for (const [tabId, state] of tabVolumes) {
    data[tabId] = state;
  }
  await api.storage.local.set({ tabVolumes: data });
}

async function restoreState() {
  const result = await api.storage.local.get("tabVolumes");
  if (result.tabVolumes) {
    for (const [tabId, state] of Object.entries(result.tabVolumes)) {
      tabVolumes.set(Number(tabId), state);
    }
  }
}

async function setVolume(tabId, volume) {
  const state = getTabState(tabId);
  state.volume = volume;
  state.muted = volume === 0;

  try {
    await api.tabs.sendMessage(tabId, {
      type: "SET_VOLUME",
      volume: state.muted ? 0 : volume,
    });
  } catch {
    // Content script not yet loaded or tab not accessible
  }

  await persistState();
}

async function toggleMute(tabId) {
  const state = getTabState(tabId);
  state.muted = !state.muted;

  try {
    await api.tabs.sendMessage(tabId, {
      type: "SET_VOLUME",
      volume: state.muted ? 0 : state.volume,
    });
  } catch {
    // Content script not available
  }

  await persistState();
  return state;
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case "GET_ALL_TABS": {
        const tabs = await api.tabs.query({});
        const result = tabs.map((tab) => {
          const state = getTabState(tab.id);
          return {
            id: tab.id,
            title: tab.title || "Untitled",
            url: tab.url || "",
            favIconUrl: tab.favIconUrl || "",
            audible: tab.audible || false,
            volume: state.volume,
            muted: state.muted,
          };
        });
        return result;
      }

      case "SET_VOLUME": {
        await setVolume(msg.tabId, msg.volume);
        return { ok: true };
      }

      case "TOGGLE_MUTE": {
        const state = await toggleMute(msg.tabId);
        return { ok: true, muted: state.muted, volume: state.volume };
      }

      case "GET_TAB_STATE": {
        const state = getTabState(msg.tabId);
        return state;
      }

      default:
        return { error: "unknown message type" };
    }
  };

  handle().then(sendResponse);
  return true; // keep message channel open for async response
});

api.tabs.onRemoved.addListener((tabId) => {
  tabVolumes.delete(tabId);
  persistState();
});

// Re-apply volume when a tab finishes loading (navigation / reload)
api.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete" && tabVolumes.has(tabId)) {
    const state = tabVolumes.get(tabId);
    const effectiveVolume = state.muted ? 0 : state.volume;
    if (effectiveVolume !== DEFAULT_VOLUME) {
      // Small delay to let the content script initialise
      setTimeout(async () => {
        try {
          await api.tabs.sendMessage(tabId, {
            type: "SET_VOLUME",
            volume: effectiveVolume,
          });
        } catch {
          // Content script might not be ready yet
        }
      }, 500);
    }
  }
});

restoreState();
