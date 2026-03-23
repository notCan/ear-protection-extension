# Ear Protection – Tab Volume Controller

A browser extension that lets you independently control the audio volume of each tab, from silent (0%) all the way up to 600% boost.

## Features

- **Per-tab volume control** — every tab gets its own volume slider (0–600%)
- **Volume boost** — amplify audio beyond 100% using the Web Audio API
- **Mute/unmute** per tab with one click
- **Persistent settings** — volume levels survive page reloads
- **Search** — quickly find a tab by title or URL
- **Audible indicator** — tabs currently playing audio are highlighted
- **Cross-browser** — works on Chrome (MV3) and Firefox (MV3 109+)

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `ear-protection-extension` folder
5. The extension icon appears in the toolbar — click it to open the volume controller

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside the `ear-protection-extension` folder
4. The extension icon appears in the toolbar

> For permanent installation in Firefox, the extension needs to be signed via [addons.mozilla.org](https://addons.mozilla.org).

## Usage

1. Click the extension icon in the toolbar
2. All open tabs are listed with their current volume
3. Drag the slider to adjust volume (0–600%)
4. Click the speaker icon to mute/unmute a tab
5. Use the search bar to filter tabs by name or URL

## How It Works

The extension injects a content script into every web page. The content script uses the **Web Audio API** to route audio from `<audio>` and `<video>` elements through a `GainNode`, which allows both reduction and amplification of the audio signal.

```
Media Element → AudioContext.createMediaElementSource()
  → GainNode (0.0 – 6.0) → AudioContext.destination
```

The background service worker manages per-tab state and relays volume changes between the popup UI and each tab's content script.

## Limitations

- **Cross-origin media**: Some sites serve media from different origins without CORS headers. The Web Audio API cannot process these, so boost above 100% may not work on all sites. Normal volume control (0–100%) still works via the native `HTMLMediaElement.volume` property.
- **Content Security Policy**: A few sites block inline AudioContext usage. The extension will not be able to control volume on these pages.
- **Shadow DOM**: Media elements inside closed Shadow DOMs cannot be detected by the content script.
- **Browser internal pages**: Chrome/Firefox internal pages (`chrome://`, `about:`) do not allow content scripts.

## Project Structure

```
ear-protection-extension/
├── manifest.json       Chrome MV3 + Firefox manifest
├── background.js       Service worker — state management & message relay
├── content.js          Content script — Web Audio API volume control
├── popup/
│   ├── popup.html      Extension popup markup
│   ├── popup.css       Dark-themed UI styles
│   └── popup.js        Tab listing, slider controls, messaging
├── icons/
│   └── icon.svg        Extension icon
└── README.md
```

## License

MIT
# ear-protection-extension
