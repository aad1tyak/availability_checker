// background.js

const SESSION_COOKIE_NAME = 'pyauth'; 
const PRIMARY_YORKU_URL = 'https://www.yorku.ca/'; 
const YORKU_BASE_DOMAIN = '.yorku.ca'; 

let lastCapturedToken = null; // Stores the most recently found URL token

// --- Cookie-based Login Check ---
async function isUserLoggedIn() {
  try {
    const specificCookie = await chrome.cookies.get({
      url: PRIMARY_YORKU_URL,
      name: SESSION_COOKIE_NAME
    });

    if (specificCookie) {
      console.log(`✅ SUCCESS: Found targeted session cookie '${SESSION_COOKIE_NAME}'.`);
      return true;
    } else {
      console.log(`❌ FAILURE: Targeted session cookie '${SESSION_COOKIE_NAME}' not found directly.`);
      // Fallback: full scan (useful for debugging, less performant for live check)
      const allCookies = await chrome.cookies.getAll({ domain: YORKU_BASE_DOMAIN }); 
      const foundInAll = allCookies.some(cookie => cookie.name === SESSION_COOKIE_NAME);
      if (foundInAll) {
          console.log(`✅ SUCCESS: Found targeted session cookie '${SESSION_COOKIE_NAME}' in exhaustive scan.`);
          return true;
      }
      return false;
    }
  } catch (error) {
    console.error('💥 ERROR in isUserLoggedIn cookie check:', error);
    return false;
  }
}

// --- Listener for tab URL changes to capture the token ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
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

// --- Function to parse availability from HTML (copied to background) ---
// This function needs to be available in background.js to parse fetched HTML
function getAvailabilityStatusForSection(htmlContent, targetSectionLetter) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const sectionHeaders = doc.querySelectorAll('TD[bgcolor="#CC0000"]');

    let courseStatus = {
        sectionLetter: targetSectionLetter,
        status: 'Full or Not Found', 
        fullText: ''
    };

    for (const headerTd of sectionHeaders) {
        const headerText = headerTd.textContent.trim();
        const sectionMatch = headerText.match(/Section\s+([A-Z])/);
        const currentSectionLetter = sectionMatch ? sectionMatch[1] : null;

        if (currentSectionLetter === targetSectionLetter) {
            let currentTr = headerTd.closest('TR'); 
            if (currentTr && currentTr.nextElementSibling) {
                let detailTr = currentTr.nextElementSibling;
                const innerAvailabilityTable = detailTr.querySelector('TABLE[cellpadding="0"][cellspacing="0"][border="0"]');
                if (innerAvailabilityTable) {
                    const actualSeatsTd = innerAvailabilityTable.querySelector('tr > td:nth-child(2)'); // Adjust this selector if needed
                    if (actualSeatsTd) {
                        const availabilityText = actualSeatsTd.textContent.trim();
                        courseStatus.fullText = availabilityText;

                        if (availabilityText === 'Seats Available:') {
                            courseStatus.status = 'Available';
                        } else if (availabilityText === 'Seats Available: Remaining seats may be restricted.') {
                            courseStatus.status = 'Restricted';
                        }
                    }
                }
            }
            break; 
        }
    }
    return courseStatus;
}


// --- Listener for messages from popup/content scripts ---
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    // Respond to content script with login status
    if (request.action === "checkLoginStatus") {
      isUserLoggedIn().then(isLoggedIn => {
        sendResponse({ status: isLoggedIn });
      });
      return true; 
    } 
    // Respond to content script with the last captured token
    else if (request.action === "getCapturedToken") {
      sendResponse({ token: lastCapturedToken });
      return true; 
    } 
    // Content script asks background to navigate the current tab (used for token generation)
    else if (request.action === "navigateTab") {
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
        return true; 
    } 
    // Background performs the fetch to avoid CORS issues
    else if (request.action === "fetchHtml") { 
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
      return true; 
    } 
    // NEW ACTION: Main logic to check course availability triggered by popup.js
    else if (request.action === "checkAndGetAvailability") {
        const courseUrl = request.courseUrl;
        const sectionLetter = request.sectionLetter;

        async function performAvailabilityCheck() {
            const isLoggedIn = await isUserLoggedIn();
            if (!isLoggedIn) {
                return { success: false, error: "Not logged in to YorkU.", status: { status: "Not Logged In" } };
            }

            // Strategy: Try to get the token, then fetch the URL
            let token = lastCapturedToken; // Use the last captured token
            
            // If no token, we might need to trigger a navigation to get one.
            // This is more complex for a general background check.
            // For now, assume the user will navigate through login sequence to capture a token.
            if (!token) {
                 return { success: false, error: "No token captured. Please log in through the YorkU portal to capture a token.", status: { status: "No Token" } };
            }

            // Construct the tokenized URL
            const urlObject = new URL(courseUrl);
            urlObject.searchParams.set('token', token); // Add the captured token
            const tokenizedCourseUrl = urlObject.toString();
            console.log(`Background: Attempting to fetch tokenized course URL: ${tokenizedCourseUrl}`);

            // Fetch the HTML using the background script's privileged access
            const fetchResult = await fetchHtmlFromBackgroundInternal(tokenizedCourseUrl); // Internal helper to avoid sending messages back and forth unnecessarily

            if (fetchResult.success) {
                const availability = getAvailabilityStatusForSection(fetchResult.html, sectionLetter);
                return { success: true, status: availability };
            } else {
                return { success: false, error: fetchResult.error, status: { status: "Fetch Error" } };
            }
        }
        
        performAvailabilityCheck().then(response => {
            sendResponse(response);
        });
        return true; // Indicates asynchronous response
    }
  }
);


// Internal helper for background script to fetch HTML
async function fetchHtmlFromBackgroundInternal(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        return { success: true, html: html };
    } catch (error) {
        console.error(`Background Internal Fetch Error for ${url}:`, error);
        return { success: false, error: error.message };
    }
}