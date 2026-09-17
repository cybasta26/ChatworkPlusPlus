import './auto-settings.js';
chrome.runtime.onInstalled.addListener(details => { AutoSettings.initialize(details.reason).catch(console.error); });
