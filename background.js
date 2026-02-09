// Glanceify — Background Service Worker
// Handles context menu creation and messaging to content script

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "glanceify-read",
    title: "Read with Glanceify",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "glanceify-read" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "startReading",
      text: info.selectionText
    });
  }
});
