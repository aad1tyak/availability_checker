// background.js

const SESSION_COOKIE_NAME = 'ppyauth';
const TARGET_DOMAIN = 'https://w2prod.sis.yorku.ca/';

// Function to check for the session cookie
async function isUserLoggedIn() {
  try {
    const cookie = await chrome.cookies.get({ url: TARGET_DOMAIN, name: SESSION_COOKIE_NAME });
    return !!cookie;
  } catch (error) {
    console.error('Error checking for cookies:', error);
    return false;
  }
}

// Listen for a message from the content script
chrome.runtime.onMessage.addListener(
  async function(request, sender, sendResponse) {
    if (request.action === "checkLoginStatus") {
      const isLoggedIn = await isUserLoggedIn();
      sendResponse({ status: isLoggedIn });
    }
  }
);