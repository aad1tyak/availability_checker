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
                courseItem.innerHTML = `
                    <div>
                        <p class="font-medium text-gray-800">${course.courseUrl.split('/').slice(-1)[0]} - Section ${course.sectionLetter}</p>
                        <p class="text-sm text-gray-600">Status: <span id="status-${index}" class="font-semibold text-gray-500">Checking...</span></p>
                    </div>
                    <button data-index="${index}" class="remove-btn text-red-500 hover:text-red-700 font-medium text-sm px-2 py-1 rounded-md">Remove</button>
                `;
                courseListDiv.appendChild(courseItem);

                // Start checking status for this course
                checkCourseAvailability(course, index);
            });
        }
    }

    // Function to add a new course
    addCourseBtn.addEventListener('click', async () => {
        const courseUrl = courseUrlInput.value.trim();
        const sectionLetter = sectionLetterInput.value.trim().toUpperCase();

        if (courseUrl && sectionLetter) {
            let storedCourses = await chrome.storage.local.get(['trackedCourses']);
            let courses = storedCourses.trackedCourses || [];

            // Basic validation for URL and section letter (e.g., single char)
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

    // Function to remove a course
    courseListDiv.addEventListener('click', async (event) => {
        if (event.target.classList.contains('remove-btn')) {
            const indexToRemove = event.target.dataset.index;
            let storedCourses = await chrome.storage.local.get(['trackedCourses']);
            let courses = storedCourses.trackedCourses || [];
            courses.splice(indexToRemove, 1);
            await chrome.storage.local.set({ trackedCourses: courses });
            renderCourseList();
        }
    });

    // Function to trigger course availability check via background script
    async function checkCourseAvailability(course, index) {
        const statusSpan = document.getElementById(`status-${index}`);
        statusSpan.textContent = 'Checking...';
        statusSpan.classList.remove('text-green-600', 'text-red-600', 'text-yellow-600');
        statusSpan.classList.add('text-gray-500');

        try {
            // Send message to background script to perform the check
            const response = await chrome.runtime.sendMessage({
                action: "checkAndGetAvailability",
                courseUrl: course.courseUrl,
                sectionLetter: course.sectionLetter
            });

            if (response.success) {
                statusSpan.textContent = response.status.status; // e.g., "Available", "Restricted", "Full or Not Found"
                if (response.status.status === 'Available') {
                    statusSpan.classList.add('text-green-600');
                    // Notification Logic: Only if previously not available and now is
                    // This advanced notification logic would require storing previous status.
                    // For now, it will simply update the UI.
                } else if (response.status.status === 'Restricted') {
                    statusSpan.classList.add('text-yellow-600');
                } else {
                    statusSpan.classList.add('text-red-600');
                }
            } else {
                statusSpan.textContent = `Error: ${response.error}`;
                statusSpan.classList.add('text-red-600');
            }
        } catch (error) {
            console.error('Error sending message to background script:', error);
            statusSpan.textContent = 'Error during check';
            statusSpan.classList.add('text-red-600');
        }
    }

    // Initial render
    renderCourseList();
});
