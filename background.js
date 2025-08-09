// background.js

const SESSION_COOKIE_NAME = 'pyauth'; 
const PRIMARY_YORKU_URL = 'https://www.yorku.ca/'; 
const YORKU_BASE_DOMAIN = '.yorku.ca'; 
const W2PROD_BASE_DOMAIN = 'https://w2prod.sis.yorku.ca';
const LOGINPPY_PATH = '/Apps/WebObjects/cdm.woa/wa/loginppy';

let lastCapturedToken = null; // Stores the most recently found URL token
let tokenGenerationInProgress = false; // Prevent multiple simultaneous token requests

// --- Cookie-based Login Check (Your working version) ---
async function isUserLoggedIn() {
  try {
    console.log('--- DEBUGGING COOKIES (from isUserLoggedIn) ---');
    console.log(`Attempting to get specific cookie '${SESSION_COOKIE_NAME}' from URL: ${PRIMARY_YORKU_URL}`);
    
    // First, try to get the specific session cookie using a valid URL
    const specificCookie = await chrome.cookies.get({
      url: PRIMARY_YORKU_URL, // Use a concrete URL here
      name: SESSION_COOKIE_NAME
    });

    if (specificCookie) {
      console.log(`✅ SUCCESS: Found targeted session cookie '${SESSION_COOKIE_NAME}' directly.`);
      console.log('Specific cookie details:', specificCookie);
      return true;
    } else {
      console.log(`🟡 Targeted session cookie '${SESSION_COOKIE_NAME}' NOT found directly. Performing exhaustive search.`);
      
      // If not found directly, perform an exhaustive search for all cookies
      const allCookies = await chrome.cookies.getAll({ domain: YORKU_BASE_DOMAIN }); 
      
      console.log(`Found ${allCookies.length} cookies for domain '${YORKU_BASE_DOMAIN}':`);
      let foundInAll = false;
      allCookies.forEach((cookie, index) => {
        console.log(`  [${index + 1}] Name: ${cookie.name}, Value: ${cookie.value.substring(0, Math.min(cookie.value.length, 30))}...`);
        console.log(`     Domain: ${cookie.domain}, Path: ${cookie.path}, Secure: ${cookie.secure}, HttpOnly: ${cookie.httpOnly}`);
        if (cookie.name === SESSION_COOKIE_NAME) {
          console.log(`  <-- THIS IS OUR TARGETED COOKIE!`);
          foundInAll = true;
        }
      });

      if (foundInAll) {
        console.log(`✅ SUCCESS: Found targeted session cookie '${SESSION_COOKIE_NAME}' in exhaustive search.`);
        return true;
      } else {
        console.log(`❌ FAILURE: Targeted session cookie '${SESSION_COOKIE_NAME}' not found anywhere in exhaustive search.`);
        return false;
      }
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

// --- Function to generate token and fetch HTML directly ---
async function generateTokenAndFetchHtml(targetUrl) {
  if (tokenGenerationInProgress) {
    console.log('Token generation already in progress, waiting...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    return null;
  }

  try {
    tokenGenerationInProgress = true;
    console.log(`Starting token generation and HTML fetch for: ${targetUrl}`);

    // Extract the path from the target URL for the loginppy redirect
    const urlObj = new URL(targetUrl);
    const targetPath = urlObj.pathname + urlObj.search;
    
    // Create new tab with loginppy URL
    const loginppyUrl = `${W2PROD_BASE_DOMAIN}${LOGINPPY_PATH}?url=${encodeURIComponent(targetPath)}`;
    console.log(`Opening loginppy URL: ${loginppyUrl}`);
    
    const tab = await chrome.tabs.create({ url: loginppyUrl, active: false });
    
    // Wait for the tab to finish loading (should redirect to tokenized URL)
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for redirect
    
    // Get the current URL of the tab (should now have token)
    const updatedTab = await chrome.tabs.get(tab.id);
    const finalUrl = updatedTab.url;
    
    console.log(`Final URL after redirect: ${finalUrl}`);
    
    // Check if the final URL has a token
    if (finalUrl && finalUrl.includes('token=')) {
      const urlObject = new URL(finalUrl);
      const token = urlObject.searchParams.get('token');
      if (token) {
        lastCapturedToken = token; // Store for future use
        console.log('✅ Token captured from redirected URL:', token.substring(0, 20) + '...');
        
        // Now fetch HTML directly from this tokenized URL
        console.log('Fetching HTML from tokenized URL...');
        const response = await fetch(finalUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        console.log('✅ Successfully fetched HTML, length:', html.length);
        
        // Close the tab
        try {
          await chrome.tabs.remove(tab.id);
        } catch (error) {
          console.log('Could not close token generation tab:', error);
        }
        
        tokenGenerationInProgress = false;
        return { html: html, token: token };
      }
    }
    
    // If we get here, something went wrong
    try {
      await chrome.tabs.remove(tab.id);
    } catch (error) {
      console.log('Could not close failed token generation tab:', error);
    }
    
    tokenGenerationInProgress = false;
    throw new Error('Failed to capture token from redirected URL');
    
  } catch (error) {
    tokenGenerationInProgress = false;
    console.error('Token generation and fetch failed:', error);
    throw error;
  }
}

// --- Function to parse availability from HTML using regex (no DOMParser needed) ---
function getAvailabilityStatusForSection(htmlContent, targetSectionLetter) {
    console.log(`Parsing HTML for section ${targetSectionLetter}`);
    console.log('HTML Content length:', htmlContent.length);
    console.log('First 500 chars of HTML:', htmlContent.substring(0, 500));
    
    let courseStatus = {
        sectionLetter: targetSectionLetter,
        status: 'Full or Not Found', 
        fullText: 'No matching section found'
    };

    try {
        // Look for section headers with regex
        const sectionHeaderRegex = /<TD[^>]*bgcolor="#CC0000"[^>]*>([^<]*Section\s+([A-Z])[^<]*)<\/TD>/gi;
        let match;
        let sectionFound = false;
        
        while ((match = sectionHeaderRegex.exec(htmlContent)) !== null) {
            const headerText = match[1];
            const sectionLetter = match[2];
            
            console.log(`Found section header: "${headerText.trim()}" - Section: ${sectionLetter}`);
            
            if (sectionLetter === targetSectionLetter) {
                console.log(`✅ Found matching section: ${sectionLetter}`);
                sectionFound = true;
                
                // Find the HTML content after this section header
                const afterHeaderIndex = sectionHeaderRegex.lastIndex;
                const htmlAfterHeader = htmlContent.substring(afterHeaderIndex, afterHeaderIndex + 2000); // Look at next 2000 chars
                
                // Look for availability indicators in the following content
                if (htmlAfterHeader.includes('Seats Available:')) {
                    if (htmlAfterHeader.includes('Remaining seats may be restricted')) {
                        courseStatus.status = 'Restricted';
                        courseStatus.fullText = 'Seats Available: Remaining seats may be restricted.';
                    } else {
                        courseStatus.status = 'Available';
                        courseStatus.fullText = 'Seats Available:';
                    }
                } else if (htmlAfterHeader.includes('Full') || htmlAfterHeader.includes('Closed')) {
                    courseStatus.status = 'Full';
                    courseStatus.fullText = 'Course section is full or closed';
                } else {
                    // Try to extract any text that might indicate status
                    const statusMatch = htmlAfterHeader.match(/(?:Seats?|Enrollment|Status)[^<]*?([^<]{10,50})/i);
                    if (statusMatch) {
                        courseStatus.fullText = statusMatch[1].trim();
                    }
                }
                break;
            }
        }
        
        if (!sectionFound) {
            console.log(`❌ Section ${targetSectionLetter} not found in HTML`);
            // Try to find any sections that do exist
            const allSectionsRegex = /Section\s+([A-Z])/g;
            const foundSections = [];
            let sectionMatch;
            while ((sectionMatch = allSectionsRegex.exec(htmlContent)) !== null) {
                foundSections.push(sectionMatch[1]);
            }
            console.log(`Available sections found: [${foundSections.join(', ')}]`);
            courseStatus.fullText = `Section ${targetSectionLetter} not found. Available sections: ${foundSections.join(', ')}`;
        }
        
    } catch (error) {
        console.error('Error parsing HTML:', error);
        courseStatus.fullText = 'Error parsing course information';
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
            
            // If no token, generate one AND fetch HTML directly
            if (!token) {
                console.log('No token available, generating token and fetching HTML directly...');
                try {
                    const result = await generateTokenAndFetchHtml(courseUrl);
                    if (result && result.html) {
                        console.log('✅ Successfully generated token and fetched HTML directly!');
                        
                        // Log the full HTML for debugging
                        console.log('='.repeat(80));
                        console.log(`FULL HTML CONTENT FOR ${courseUrl}:`);
                        console.log('='.repeat(80));
                        console.log(result.html);
                        console.log('='.repeat(80));
                        
                        // For now, just return success without parsing sections
                        return { success: true, status: { status: 'HTML Fetched Successfully', sectionLetter: sectionLetter, fullText: 'Check console for HTML content' }, html: result.html };
                    } else {
                        throw new Error('Token generation returned no HTML');
                    }
                } catch (error) {
                    console.error('Token generation and fetch failed:', error);
                    return { success: false, error: `Token generation failed: ${error.message}. Try manually visiting a YorkU course page first.`, status: { status: "Token Generation Failed" } };
                }
            }

            // If we already have a token, use it directly
            console.log('Using existing token for fetch...');
            const urlObject = new URL(courseUrl);
            urlObject.searchParams.set('token', token);
            const tokenizedCourseUrl = urlObject.toString();
            console.log(`Fetching tokenized course URL: ${tokenizedCourseUrl}`);

            try {
                const response = await fetch(tokenizedCourseUrl);
                if (!response.ok) {
                    // If token is invalid, generate new token and fetch directly
                    if (response.status === 403 || response.status === 401) {
                        console.log('Token expired, generating new token and fetching HTML directly...');
                        lastCapturedToken = null; // Clear old token
                        const result = await generateTokenAndFetchHtml(courseUrl);
                        if (result && result.html) {
                            console.log('✅ Token refresh and fetch successful!');
                            
                            // Log the full HTML for debugging
                            console.log('='.repeat(80));
                            console.log(`FULL HTML CONTENT FOR ${courseUrl}:`);
                            console.log('='.repeat(80));
                            console.log(result.html);
                            console.log('='.repeat(80));
                            
                            // For now, just return success without parsing sections
                            return { success: true, status: { status: 'HTML Fetched Successfully', sectionLetter: sectionLetter, fullText: 'Check console for HTML content' }, html: result.html };
                        } else {
                            throw new Error('Token refresh returned no HTML');
                        }
                    } else {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                }
                
                const html = await response.text();
                console.log('Successfully fetched HTML with existing token, length:', html.length);
                
                // Log the full HTML for debugging
                console.log('='.repeat(80));
                console.log(`FULL HTML CONTENT FOR ${courseUrl}:`);
                console.log('='.repeat(80));
                console.log(html);
                console.log('='.repeat(80));
                
                // For now, just return success without parsing sections
                return { success: true, status: { status: 'HTML Fetched Successfully', sectionLetter: sectionLetter, fullText: 'Check console for HTML content' }, html: html };
                
            } catch (error) {
                console.error('Fetch error:', error);
                return { success: false, error: `Fetch failed: ${error.message}`, status: { status: "Fetch Error" } };
            }
        }
        
        performAvailabilityCheck().then(response => {
            sendResponse(response);
        }).catch(error => {
            console.error('Unexpected error in performAvailabilityCheck:', error);
            sendResponse({ success: false, error: error.message, status: { status: "Unexpected Error" } });
        });
        return true;
    }
  }
);