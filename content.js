// content.js

// This script now primarily confirms login on any loaded YorkU page.
// The main course checking logic is initiated by popup.js via background.js.

// Function to send a message to the background script and get the login status
async function getLoginStatus() {
  const response = await chrome.runtime.sendMessage({ action: "checkLoginStatus" });
  return response.status;
}

// Main logic when content script loads on a page
async function runContentScript() {
  const isLoggedIn = await getLoginStatus();

  if (isLoggedIn) {
    console.log('✅ Content Script: Logged in. Ready to assist from popup.');
    // At this point, the extension knows the user is logged in.
    // The actual course availability checks will be triggered from the popup.
    // We could potentially add a badge or icon change here later.
  } else {
    console.log('❌ Content Script: Not logged in. Extension features might be limited.');
  }

  // Also, ensure the tab listener in background.js can capture the token during login redirects.
  // No action needed here, as the listener is in background.js.
}

// Run the main function when the content script loads on any matching page
runContentScript();