// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const courseUrlInput = document.getElementById('courseUrl');
    const sectionLetterInput = document.getElementById('sectionLetter');
    const addCourseBtn = document.getElementById('addCourseBtn');
    const courseListDiv = document.getElementById('courseList');
    const noCoursesMessage = document.getElementById('noCoursesMessage');

    // Function to render courses in the UI
    async function renderCourseList() {
        const storedCourses = await chrome.storage.local.get(['trackedCourses']);
        const courses = storedCourses.trackedCourses || [];
        courseListDiv.innerHTML = ''; // Clear existing list

        if (courses.length === 0) {
            noCoursesMessage.style.display = 'block';
        } else {
            noCoursesMessage.style.display = 'none';
            courses.forEach((course, index) => {
                const courseItem = document.createElement('div');
                courseItem.className = 'flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm';
                
                // Extract a more readable course name from URL
                const courseDisplayName = extractCourseNameFromUrl(course.courseUrl);
                
                courseItem.innerHTML = `
                    <div class="flex-1">
                        <p class="font-medium text-gray-800">${courseDisplayName} - Section ${course.sectionLetter}</p>
                        <p class="text-sm text-gray-600">Status: <span id="status-${index}" class="font-semibold text-gray-500">Not checked yet</span></p>
                        <button data-index="${index}" class="check-btn text-blue-500 hover:text-blue-700 font-medium text-sm px-2 py-1 rounded-md mr-2">Check Now</button>
                    </div>
                    <button data-index="${index}" class="remove-btn text-red-500 hover:text-red-700 font-medium text-sm px-2 py-1 rounded-md">Remove</button>
                `;
                courseListDiv.appendChild(courseItem);
            });
        }
    }

    // Function to extract a readable course name from URL
    function extractCourseNameFromUrl(url) {
        try {
            const urlParts = url.split('/');
            const lastPart = urlParts[urlParts.length - 1];
            if (lastPart && lastPart.includes('.')) {
                return lastPart.substring(0, 20) + '...'; // Show first 20 chars
            }
            return 'Course'; // Fallback
        } catch {
            return 'Course';
        }
    }

    // Function to add a new course
    addCourseBtn.addEventListener('click', async () => {
        const courseUrl = courseUrlInput.value.trim();
        const sectionLetter = sectionLetterInput.value.trim().toUpperCase();

        if (courseUrl && sectionLetter) {
            let storedCourses = await chrome.storage.local.get(['trackedCourses']);
            let courses = storedCourses.trackedCourses || [];

            // Basic validation for URL and section letter
            if (!courseUrl.startsWith('https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm.woa/')) {
                alert('Please enter a valid YorkU course URL starting with https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm.woa/');
                return;
            }
            if (!/^[A-Z]$/.test(sectionLetter)) {
                alert('Please enter a single uppercase letter for the section (e.g., A, B).');
                return;
            }
            
            // Check for duplicates
            const isDuplicate = courses.some(c => c.courseUrl === courseUrl && c.sectionLetter === sectionLetter);
            if (isDuplicate) {
                alert('This course and section is already being tracked!');
                return;
            }

            courses.push({ courseUrl, sectionLetter });
            await chrome.storage.local.set({ trackedCourses: courses });
            courseUrlInput.value = '';
            sectionLetterInput.value = '';
            renderCourseList();
        } else {
            alert('Please enter both a Course URL and a Section Letter.');
        }
    });

    // Function to handle clicks (both check and remove)
    courseListDiv.addEventListener('click', async (event) => {
        const index = event.target.dataset.index;
        
        if (event.target.classList.contains('remove-btn')) {
            // Remove course
            let storedCourses = await chrome.storage.local.get(['trackedCourses']);
            let courses = storedCourses.trackedCourses || [];
            courses.splice(index, 1);
            await chrome.storage.local.set({ trackedCourses: courses });
            renderCourseList();
        } else if (event.target.classList.contains('check-btn')) {
            // Check course availability
            let storedCourses = await chrome.storage.local.get(['trackedCourses']);
            let courses = storedCourses.trackedCourses || [];
            if (courses[index]) {
                checkCourseAvailability(courses[index], index);
            }
        }
    });

    // Function to trigger course availability check via background script
    async function checkCourseAvailability(course, index) {
        const statusSpan = document.getElementById(`status-${index}`);
        const checkBtn = document.querySelector(`button[data-index="${index}"].check-btn`);
        
        if (!statusSpan) return; // Element not found
        
        statusSpan.textContent = 'Checking...';
        statusSpan.classList.remove('text-green-600', 'text-red-600', 'text-yellow-600');
        statusSpan.classList.add('text-gray-500');
        
        if (checkBtn) {
            checkBtn.disabled = true;
            checkBtn.textContent = 'Checking...';
        }

        try {
            console.log(`Checking availability for: ${course.courseUrl}, Section: ${course.sectionLetter}`);
            
            // Send message to background script to perform the check
            const response = await chrome.runtime.sendMessage({
                action: "checkAndGetAvailability",
                courseUrl: course.courseUrl,
                sectionLetter: course.sectionLetter
            });

            console.log('Response from background:', response);

            if (response.success) {
                statusSpan.textContent = response.status.status;
                
                // Log the HTML for debugging
                if (response.html) {
                    console.log('='.repeat(80));
                    console.log(`FETCHED HTML FOR ${course.courseUrl} SECTION ${course.sectionLetter}:`);
                    console.log('='.repeat(80));
                    console.log(response.html);
                    console.log('='.repeat(80));
                }
                
                // Color code the status
                if (response.status.status === 'Available') {
                    statusSpan.classList.add('text-green-600');
                } else if (response.status.status === 'Restricted') {
                    statusSpan.classList.add('text-yellow-600');
                } else {
                    statusSpan.classList.add('text-red-600');
                }
            } else {
                statusSpan.textContent = `Error: ${response.error}`;
                statusSpan.classList.add('text-red-600');
                console.error('Background script error:', response.error);
            }
        } catch (error) {
            console.error('Error sending message to background script:', error);
            statusSpan.textContent = 'Error during check';
            statusSpan.classList.add('text-red-600');
        } finally {
            // Re-enable the check button
            if (checkBtn) {
                checkBtn.disabled = false;
                checkBtn.textContent = 'Check Now';
            }
        }
    }

    // Initial render
    renderCourseList();
});