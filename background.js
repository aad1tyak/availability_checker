// background.js

const SESSION_COOKIE_NAME = 'pyauth'; 
const PRIMARY_YORKU_URL = 'https://www.yorku.ca/'; 
const YORKU_BASE_DOMAIN = '.yorku.ca'; 
const W2PROD_BASE_DOMAIN = 'https://w2prod.sis.yorku.ca';
const LOGINPPY_PATH = '/Apps/WebObjects/cdm.woa/wa/loginppy';

let lastCapturedToken = null; // Stores the most recently found URL token
let tokenGenerationInProgress = false; // Prevent multiple simultaneous token requests

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

// --- Enhanced listener for tab URL changes to capture tokens ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Capture tokens from any YorkU URL that has one
  if (changeInfo.status === 'complete' && changeInfo.url && 
      changeInfo.url.includes('yorku.ca') && changeInfo.url.includes('token=')) {
    console.log(`Background: Detected URL change with token: ${changeInfo.url}`);
    const urlObject = new URL(changeInfo.url);
    const token = urlObject.searchParams.get('token');
    if (token && token.length > 10) { // Basic validation
      lastCapturedToken = token;
      console.log('Background: Captured new token:', lastCapturedToken.substring(0, 20) + '...');
      tokenGenerationInProgress = false; // Reset flag
    }
  }
});

// --- Function to generate token by navigating through loginppy ---
async function generateTokenForUrl(targetUrl) {
  if (tokenGenerationInProgress) {
    console.log('Token generation already in progress, waiting...');
    // Wait for ongoing generation
    let attempts = 0;
    while (tokenGenerationInProgress && attempts < 30) { // Wait up to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  }

  try {
    tokenGenerationInProgress = true;
    console.log(`Starting token generation for: ${targetUrl}`);

    // Extract the path from the target URL for the loginppy redirect
    const urlObj = new URL(targetUrl);
    const targetPath = urlObj.pathname + urlObj.search;
    
    // Create new tab with loginppy URL
    const loginppyUrl = `${W2PROD_BASE_DOMAIN}${LOGINPPY_PATH}?url=${encodeURIComponent(targetPath)}`;
    console.log(`Opening loginppy URL: ${loginppyUrl}`);
    
    const tab = await chrome.tabs.create({ url: loginppyUrl, active: false });
    
    // Wait for token to be captured
    let attempts = 0;
    while (!lastCapturedToken && attempts < 20) { // Wait up to 20 seconds
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      console.log(`Waiting for token... attempt ${attempts}`);
    }

    // Close the tab used for token generation
    try {
      await chrome.tabs.remove(tab.id);
    } catch (error) {
      console.log('Could not close token generation tab:', error);
    }

    tokenGenerationInProgress = false;
    
    if (lastCapturedToken) {
      console.log('Token generation successful!');
      return lastCapturedToken;
    } else {
      throw new Error('Token generation timed out');
    }
    
  } catch (error) {
    tokenGenerationInProgress = false;
    console.error('Token generation failed:', error);
    throw error;
  }
}

// --- Function to parse availability from HTML ---
function getAvailabilityStatusForSection(htmlContent, targetSectionLetter) {
    console.log(`Parsing HTML for section ${targetSectionLetter}`);
    console.log('HTML Content length:', htmlContent.length);
    console.log('First 500 chars of HTML:', htmlContent.substring(0, 500));
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const sectionHeaders = doc.querySelectorAll('TD[bgcolor="#CC0000"]');
    console.log(`Found ${sectionHeaders.length} section headers`);

    let courseStatus = {
        sectionLetter: targetSectionLetter,
        status: 'Full or Not Found', 
        fullText: 'No matching section found'
    };

    for (const headerTd of sectionHeaders) {
        const headerText = headerTd.textContent.trim();
        console.log(`Checking header: ${headerText}`);
        
        const sectionMatch = headerText.match(/Section\s+([A-Z])/);
        const currentSectionLetter = sectionMatch ? sectionMatch[1] : null;

        if (currentSectionLetter === targetSectionLetter) {
            console.log(`Found matching section: ${currentSectionLetter}`);
            let currentTr = headerTd.closest('TR'); 
            if (currentTr && currentTr.nextElementSibling) {
                let detailTr = currentTr.nextElementSibling;
                const innerAvailabilityTable = detailTr.querySelector('TABLE[cellpadding="0"][cellspacing="0"][border="0"]');
                if (innerAvailabilityTable) {
                    const actualSeatsTd = innerAvailabilityTable.querySelector('tr > td:nth-child(2)');
                    if (actualSeatsTd) {
                        const availabilityText = actualSeatsTd.textContent.trim();
                        console.log(`Found availability text: "${availabilityText}"`);
                        courseStatus.fullText = availabilityText;

                        if (availabilityText === 'Seats Available:') {
                            courseStatus.status = 'Available';
                        } else if (availabilityText.includes('Remaining seats may be restricted')) {
                            courseStatus.status = 'Restricted';
                        } else {
                            courseStatus.status = 'Full';
                        }
                    }
                }
            }
            break; 
        }
    }
    console.log('Final course status:', courseStatus);
    return courseStatus;
}

// --- Main message listener ---
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    
    if (request.action === "checkLoginStatus") {
      isUserLoggedIn().then(isLoggedIn => {
        sendResponse({ status: isLoggedIn });
      });
      return true; 
    } 
    
    else if (request.action === "getCapturedToken") {
      sendResponse({ token: lastCapturedToken });
      return true; 
    } 
    
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
    
    // MAIN ACTION: Check course availability with enhanced token handling
    else if (request.action === "checkAndGetAvailability") {
        const courseUrl = request.courseUrl;
        const sectionLetter = request.sectionLetter;

        async function performAvailabilityCheck() {
            console.log(`Starting availability check for ${courseUrl}, section ${sectionLetter}`);
            
            const isLoggedIn = await isUserLoggedIn();
            if (!isLoggedIn) {
                return { success: false, error: "Not logged in to YorkU. Please log in through the YorkU portal first.", status: { status: "Not Logged In" } };
            }

            let token = lastCapturedToken;
            
            // If no token, try to generate one
            if (!token) {
                console.log('No token available, attempting to generate one...');
                try {
                    token = await generateTokenForUrl(courseUrl);
                } catch (error) {
                    console.error('Token generation failed:', error);
                    return { success: false, error: `Token generation failed: ${error.message}. Please visit a YorkU course page first to capture a token.`, status: { status: "Token Generation Failed" } };
                }
            }

            // Construct the tokenized URL
            const urlObject = new URL(courseUrl);
            urlObject.searchParams.set('token', token);
            const tokenizedCourseUrl = urlObject.toString();
            console.log(`Fetching tokenized course URL: ${tokenizedCourseUrl}`);

            // Fetch the HTML
            try {
                const response = await fetch(tokenizedCourseUrl);
                if (!response.ok) {
                    // If token is invalid, try generating a new one
                    if (response.status === 403 || response.status === 401) {
                        console.log('Token might be expired, trying to generate new token...');
                        lastCapturedToken = null; // Clear old token
                        token = await generateTokenForUrl(courseUrl);
                        
                        // Try again with new token
                        urlObject.searchParams.set('token', token);
                        const newTokenizedUrl = urlObject.toString();
                        const retryResponse = await fetch(newTokenizedUrl);
                        if (!retryResponse.ok) {
                            throw new Error(`HTTP error after token refresh! status: ${retryResponse.status}`);
                        }
                        const html = await retryResponse.text();
                        const availability = getAvailabilityStatusForSection(html, sectionLetter);
                        return { success: true, status: availability, html: html };
                    } else {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                }
                
                const html = await response.text();
                console.log('Successfully fetched HTML, length:', html.length);
                
                const availability = getAvailabilityStatusForSection(html, sectionLetter);
                return { success: true, status: availability, html: html };
                
            } catch (error) {
                console.error('Fetch error:', error);
                return { success: false, error: `Fetch failed: ${error.message}`, status: { status: "Fetch Error" } };
            }
        }
        
        performAvailabilityCheck().then(response => {
            sendResponse(response);
        });
        return true;
    }
  }
);