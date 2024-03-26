class Process {
    // Elements
    start_button_el = document.querySelector("#start-process");
    search_dir_el = document.querySelector("#search-dir");
    search_dir_button_el = document.querySelector("#search-dir-button");
    archive_dir_el = document.querySelector("#archive-dir");
    archive_dir_button_el = document.querySelector("#archive-dir-button");
    delete_when_finished_setting = document.querySelector("#delete-when-finished-setting");
    //include_all_dupes_setting = document.querySelector("#include-all-duplicates-setting");
    archive_dir_section = document.querySelector("#archive-dir-section");

    // Fetched dirs
    search_dir = null; // Must change
    archive_dir = null; // Null by default, doesn't need to change

    constructor() {
        this.start_button_el.addEventListener("click", async () => {
            this.start();
        });
    }

    start() {
        // Open progress modal
        document.querySelector(".progress-modal").style.display = "flex";

        // Start processing
        electron.send("start-process", {
            search_dir: this.search_dir,
            archive_dir: this.archive_dir,
            settings: {
                delete_when_finished: this.delete_when_finished_setting.checked,
                //include_all_dupes: this.include_all_dupes_setting.checked,
            }
        });
    }

    async select_search_dir_listener() {
        // Request electron opens directory box
        electron.send("request-search-dir-box");

        // Wait/listen for a response
        electron.receive("fetched-search-path", (path) => {
            console.log("Selected search dir: " + path);
            this.search_dir = path;
        });
        
    }
    async select_archive_dir_listener() {
        // Request electron opens directory box
        electron.send("request-archive-dir-box");

        // Wait/listen for a response
        electron.receive("fetched-archive-path", (path) => {
            console.log("Selected archive dir: " + path);
            this.archive_dir = path;
        });
        
    }
}

// Create instance of class
let process = new Process();

// Set up listeners ----------------------
// Directory dialog boxes
process.search_dir_button_el.addEventListener("click", async () => {
    await process.select_search_dir_listener(); // Search dir
});
process.archive_dir_button_el.addEventListener("click", async () => {
    await process.select_archive_dir_listener(); // Archive dir
});

// If delete when finished is selected
process.delete_when_finished_setting.addEventListener("change", async function () {
    if (this.checked === true) {
        process.archive_dir_section.style.display = "none";
    } else {
        process.archive_dir_section.style.display = "flex";
    }
});




// PROCESS PROGRESS ---------------------------------------------------------------------------------------------------------------
// Elements
const progress_label = document.querySelector(".progress-percent");
const progress_bar = document.querySelector("#progress-bar");
const current_file = document.querySelector(".current-file");
const groups_el = document.querySelector("#groups");
const individual_files = document.querySelector("#individual-files");

// Initialize
let has_started = false;
let started_once = false; // So 'if (has_started === true)' can only be executed once
let total_search_size = 0;

// Listen for progress
electron.receive("total-search-size", async (total_size) => {
    if (has_started === false) {
        has_started = true;
    }
    if (has_started === true && started_once !== true) {
        document.querySelector("#progress-title").textContent = "Scan In Progress...";
        document.querySelector(".progress-bar-container").style.display = "flex";
        document.querySelector(".current-file").style.display = "flex";
        // Prevent this if-statement from running more than once
        started_once = true;
    }
    progress_bar.max = total_size;
    total_search_size = total_size;
});
electron.receive("process-progress", async function(data) {
    if (has_started === false) {
        has_started = true;
    }
    if (has_started === true && started_once !== true) {
        document.querySelector("#progress-title").textContent = "Scan In Progress...";
        document.querySelector(".progress-bar-container").style.display = "flex";
        document.querySelector(".current-file").style.display = "flex";
        // Prevent this if-statement from running more than once
        started_once = true;
    }
    // Data
    const file_type = data.file_type;
    const file_name = data.file_name;
    const file_path = data.file_path;
    const file_size = data.file_size;
    const current_scanned_size = data.current_scanned_size;
    const current_percentage = (current_scanned_size / total_search_size) * 100;

    // Update data
    progress_bar.value = current_scanned_size;
    current_file.textContent = file_path;
    progress_label.textContent = `${current_scanned_size.toFixed(2)}MB / ${total_search_size.toFixed(2)}MB (${current_percentage.toFixed(2)}%) Complete`;
});
// Process finished
electron.receive("process-finished", async function(data) {
    // Make finished section appear
    document.querySelector(".finished-data").style.display = "flex";
    document.querySelector("#progress-title").textContent = "Scan Complete!";

    // Fetch data
    const groups = data.groups; // A collection of groups
    const scanned_files = data.scanned_files; // A collection of all scanned files
    const total_scanned_size = data.total_scanned_size; // Total size in MB of all scanned files

    // Set results
    //document.querySelector("#include-all-dupes-setting-result").innerHTML = `<b>Include All Duplicates:</b> ${document.querySelector("#include-all-duplicates-setting").checked}`;
    document.querySelector("#delete-when-finished-setting-result").innerHTML = `<b>Delete When Finished:</b> ${document.querySelector("#delete-when-finished-setting").checked}`;
    document.querySelector("#total-scanned-size-result").innerHTML = `<b>Total Scanned Size:</b> ${total_scanned_size.toFixed(2)}MB`;
    document.querySelector("#total-groups-result").innerHTML = `<b>Groups Created:</b> ${groups.length}`;
    document.querySelector("#scanned-files-count-result").innerHTML = `<b>Scanned Files:</b> ${scanned_files.length}`;

    // Process and append the group
    await manage_groups(groups);

    // Process and append scanned files
    await manage_scanned_files(scanned_files);
});




// Handle console logs
// Define console element
const consoleEl = document.querySelector(".console");
electron.receive("console-log", log => {
    log.forEach(() => {
        // Append to console
        console.log(log);
        consoleEl.insertAdjacentHTML("afterbegin", `<p class="text-line">${log}</p>`);
    });
});
electron.receive("console-success", log => {
    log.forEach(() => {
        // Append to console
        console.log(log);
        consoleEl.insertAdjacentHTML("afterbegin", `<p class="text-line success">${log}</p>`);
    });
});
electron.receive("console-error", log => {
    log.forEach(() => {
        // Append to console
        console.error(log);
        consoleEl.insertAdjacentHTML("afterbegin", `<p class="text-line error">${log}</p>`);
    });
});



// Helpers
function cap_first_letter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
async function manage_groups(data) {
    // Elements
    const groups_el = document.querySelector("#groups");

    // Initialize counter
    group_counter = 0;

    // Iterate through groups
    for (const group of data) {
        // Simplify data
        const group_size_in_mb = group.group_size_in_mb.toFixed(2);
        // Now files of group
        const group_files = group.files;
        
        // Create template
        const group_template = 
        `
        <div class="group col" id="group_${group_counter}">
            <div class="group-data col">
                <div class="group-meta" id="group-disclaimer">
                    <p class="label">DISCLAIMER:</p>
                    <p class="data">The first file in this list is an original and has not been moved/deleted.</p>
                </div>
                <div class="group-meta">
                    <p class="label">Group Size:</p>
                    <p class="data">${group_size_in_mb}MB</p>
                </div>
                <div class="group-meta">
                    <p class="label">Files Count:</p>
                    <p class="data">${group_files.length}</p>
                </div>
            </div>
            <!-- Group's files will be appended here -->
        </div>
        `;

        // Append to group element
        groups_el.innerHTML += group_template;

        // Create this group's element
        const this_group_el = document.querySelector(`#group_${group_counter}`);

        // Initialize group's files counter
        let files_counter = 0;

        // Iterate over group's files
        for (const file of group_files) {
            // Calculate if this is the first file in the group or not
            const first_file = files_counter === 0;

            // Simplify data
            const archived_path = file.file_archived_path;
            const original_path = file.file_original_path;
            const file_name = file.file_name_with_ext;
            const file_size_in_mb = file.file_size_in_mb.toFixed(2);
            const file_type = cap_first_letter(file.file_type);

            // Create this file's template
            const file_template =
            `
            <div class="file row">
                <div class="file-image-container"><img class="file-image" src="${first_file ? original_path : archived_path}"/></div>
                <div class="text-data col">
                    <div class="file-meta row">
                        <p class="label">Original Path:</p>
                        <p class="data">${original_path}</p>
                    </div>
                    <div class="file-meta row">
                        <p class="label">Archived Path:</p>
                        <p class="data">${first_file ? "null" : archived_path}</p>
                    </div>
                    <div class="file-meta row">
                        <p class="label">File Type:</p>
                        <p class="data">${file_type}</p>
                    </div>
                    <div class="file-meta row">
                        <p class="label">File Size:</p>
                        <p class="data">${file_size_in_mb}MB</p>
                    </div>
                </div>
            </div>
            `;

            // Append to group
            this_group_el.innerHTML += file_template;

            // Increment files counter
            files_counter++;
        }

        // Increment group counter
        group_counter++;
    }
}
async function manage_scanned_files(data) {
    // Fetch individual scanned files element
    const scanned_files_el = document.querySelector("#individual-files");

    // Iterate over scanned files
    for (const file of data) {
        // Simplify data
        const file_hash = file.file_hash; // May never need to use this on front end??? Not used for now
        const file_name_with_ext = file.file_name_with_ext;
        const file_original_path = file.file_original_path;
        const file_size_in_mb = file.file_size_in_mb.toFixed(2);
        const file_type = cap_first_letter(file.file_type);

        // Create template
        const file_template =
        `
        <div class="file row">
            <div class="text-data col">
                <div class="file-meta row">
                    <p class="label">File Name:</p>
                    <p class="data">${file_name_with_ext}</p>
                </div>
                <div class="file-meta row">
                    <p class="label">Original Path:</p>
                    <p class="data">${file_original_path}</p>
                </div>
                <div class="file-meta row">
                    <p class="label">File Type:</p>
                    <p class="data">${file_type}</p>
                </div>
                <div class="file-meta row">
                    <p class="label">File Size:</p>
                    <p class="data">${file_size_in_mb}MB</p>
                </div>
            </div>
        </div>
        `;

        // Append to scanned files element
        scanned_files_el.innerHTML += file_template;
    }
}