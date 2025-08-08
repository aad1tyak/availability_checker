// background.js

const SESSION_COOKIE_NAME = 'pyauth';
const TARGET_DOMAIN_FOR_COOKIES = '.yorku.ca';
let lastCapturedToken = null; // Stores the most recently found URL token

// --- Cookie-based Login Check ---
async function isUserLoggedIn() {
  try {
    const cookie = await chrome.cookies.get({ url: `https://${TARGET_DOMAIN_FOR_COOKIES}/`, name: SESSION_COOKIE_NAME });
    return !!cookie;
  } catch (error) {
    console.error('Error checking for cookies:', error);
    return false;
  }
}

// --- Listener for tab URL changes to capture the token ---
// This listener runs every time a tab's URL changes or completes loading.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care about URLs that are fully loaded and are from the YorkU course system, and contain a 'token=' parameter.
  if (changeInfo.status === 'complete' && changeInfo.url && 
      changeInfo.url.includes('w2prod.sis.yorku.ca') && changeInfo.url.includes('token=')) {
    console.log(`Background: Detected URL change with token: ${changeInfo.url}`);
    const urlObject = new URL(changeInfo.url);
    const token = urlObject.searchParams.get('token');
    if (token) {
      lastCapturedToken = token;
      console.log('Background: Captured new token:', lastCapturedToken.substring(0, 20) + '...');
    }
  }
});

// --- Listener for messages from content scripts ---
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "checkLoginStatus") {
      isUserLoggedIn().then(isLoggedIn => {
        sendResponse({ status: isLoggedIn });
      });
      return true; // Indicates an asynchronous response
    } else if (request.action === "getCapturedToken") {
      sendResponse({ token: lastCapturedToken });
      return true; // Indicates an asynchronous response
    } else if (request.action === "navigateTab") {
        // Content script asks background to navigate the current tab
        const tabId = sender.tab.id; 
        const urlToNavigate = request.url;
        console.log(`Background: Received request to navigate tab ${tabId} to: ${urlToNavigate}`);
        chrome.tabs.update(tabId, { url: urlToNavigate }, () => {
          if (chrome.runtime.lastError) {
              console.error("Navigation error:", chrome.runtime.lastError.message);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
              sendResponse({ success: true });
          }
        });
        return true; // Indicates an asynchronous response
    } else if (request.action === "fetchHtml") { // Background performs the fetch to avoid CORS issues
      const urlToFetch = request.url;
      console.log(`Background: Received request to fetch URL: ${urlToFetch}`);
      fetch(urlToFetch)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.text();
        })
        .then(html => {
          sendResponse({ success: true, html: html });
        })
        .catch(error => {
          console.error(`Background: Failed to fetch ${urlToFetch}:`, error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates an asynchronous response
    }
  }
);