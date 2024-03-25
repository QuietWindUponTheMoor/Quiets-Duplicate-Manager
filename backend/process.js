// Imports
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { createHash } = require("crypto");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

// Setup database
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(`cache/cache.db`);

// Create database tables
db.serialize(async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS all_files (
        file_name_with_ext TEXT,
        file_hash TEXT,
        file_size_in_mb REAL,
        file_original_path TEXT,
        file_type TEXT
    )`);
});

// File system functions
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);

class Startup {
    // IPC
    win;

    // Dirs
    search_dir = null;
    archive_dir = null; // Null allowable

    // Settings
    delete_when_finished = null;
    //include_all_dupes = null;

    // Progress
    finished = false;

    // Storage
    total_search_size = 0;
    groups = [];
    scanned_files = [];
    total_scanned_size = 0;

    // Mapping
    all_files_map;

    constructor(search_dir, archive_dir, settings) {
        // Dirs
        this.search_dir = search_dir;
        this.archive_dir = archive_dir;

        // Settings
        this.delete_when_finished = settings.delete_when_finished;
        //this.include_all_dupes = settings.include_all_dupes;

        // Get the reference to the window you want to send the message to
        this.win = BrowserWindow.getAllWindows()[0];
    }

    enable_debugging() { // Debugging enabler
        // Call stack logging
        const stack = new Error().stack;
        this.log(stack);

        // Memory usage/allocation logging
        const used = process.memoryUsage();
        this.log(`Memory usage (MB):
        - RSS: ${Math.round(used.rss / 1024 / 1024)}
        - Heap total: ${Math.round(used.heapTotal / 1024 / 1024)}
        - Heap used: ${Math.round(used.heapUsed / 1024 / 1024)}
        - External: ${Math.round(used.external / 1024 / 1024)}
        `);
    }
    log(...log) {
        // Log this to normal console
        console.log(...log);
        // Send to front end
        this.win.webContents.send("console-log", log);
    }
    error(...log) {
        // Log this to normal console
        console.error(...log);
        // Send to front end
        this.win.webContents.send("console-error", log);
    }
    success(...log) {
        // Log this to normal console
        console.log(...log);
        // Send to front end
        this.win.webContents.send("console-success", log);
    }
    async calculate_file_size(file_path) {
        // Get file stats
        const stats = await stat(file_path);
        // Get size in bytes and convert to MB
        const file_size_in_bytes = stats.size;
        const file_size_in_mb = file_size_in_bytes / (1024 * 1024);

        // Return
        return file_size_in_mb;
    }
    get_file_type(file) {
        // Map of supported file types
        const file_types = {
            image: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".tiff", ".webp"],
            audio: [".mp3", ".wav", ".ogg", ".flac", ".aac", ".wma"],
            video: [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm"],
            document: [".pdf", ".php", ".txt", ".html", ".iptx", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".csv", ".rtf", ".odt", ".ods", ".odp", ".odg", ".pub", ".epub", ".md", ".tex", ".log", ".json", ".xml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".ini", ".bat", ".sh", ".ps1", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".vb", ".js", ".ts", ".css", ".scss", ".less", ".ejs", ".jsp", ".aspx", ".asp", ".jspx", ".xhtml", ".php3", ".php4", ".php5", ".php7", ".phps", ".phtml", ".inc", ".bak", ".backup", ".temp", ".tmp", ".swp"],
        };
    
        // Get the file's extension
        const extension = path.extname(file).toLowerCase();
    
        // Check if file is of a supported file type
        for (const category in file_types) {
            if (file_types[category].includes(extension)) {
                // Return type
                return category;
            }
        }
    
        // If not, return with 'other'
        return 'other';
    }
    async fetch_all_records_from_table(select_query) {
        return new Promise((resolve, reject) => {
            db.all(select_query, (error, rows) => {
                if (error) {
                    this.error("Error extracting item from cache: " + error.message);
                    reject(error);
                    return;
                }
                resolve(rows);
            });
        });
    }
    async purge_cache() {
        // Log this action starting
        this.log("Process is finished, purging cache, please wait...");

        // Purge cache
        await db.run("DELETE FROM all_files;");

        // Log finished
        this.success("Cache successfully purged!");
    }
}

class TraverseHelpers extends Startup {
    async calc_file_stat_and_path(directory, file) {
        // Calc file path
        const file_path = path.join(directory, file);

        // Get file stats (to check if it"s a directory or a file)
        const file_stat = await stat(file_path);

        return {file_stat: file_stat, file_path: file_path};
    }
    async calc_file_contents_and_hash(file_path) {
        // Get file contents
        const file_contents = await readFile(file_path);
        // Create hash
        const file_hash = createHash("sha256").update(file_contents).digest("base64");

        return {file_contents: file_contents, file_hash: file_hash};
    }
    async insert_file_into_cache(file_data) {
        /*
        File data looks like:
        {file_name_with_ext, file_hash, file_size_in_mb, file_original_path, file_type}
        
        NOTE:
        Return values currently are not being used for this function,
        but they're here in case they need to be later and it is forgotten where they need to be placed :)
        */

        try {
            // Insert into scanned_files table
            const query = "INSERT INTO all_files (file_name_with_ext, file_hash, file_size_in_mb, file_original_path, file_type) VALUES (?, ?, ?, ?, ?);";
            await db.run(query, [file_data.file_name_with_ext, file_data.file_hash, file_data.file_size_in_mb, file_data.file_original_path, file_data.file_type]);
            
            // If no error occurred, return true
            return true;
        } catch (error) {
            // If an error occurred, log the error and return false
            this.error("WARNING! Something went wrong writing file to cache:", error);
            return false;
        }
    }
    calculate_hash_similarity(hash_1, hash_2) { // Use Hamming Distance
        // Determine if hashes are of equal length (if not, something really messed up BAD)
        if (hash_1.length !== hash_2.length) {
            this.error("WARNING! Hashes are not the same length!" + hash_1 + " !== " + hash_2);
            return false;
        }

        // Calculate distance
        let distance = 0;
        for (let i = 0; i < hash_1.length; i++) {
            if (hash_1[i] !== hash_2[i]) {
                distance++;
            }
        }

        // Normalize distance
        let similarity = 1 - (distance / hash_1.length);
        
        // Return similarity
        return similarity;
    }
}

class ManageTraverse extends TraverseHelpers {
    async cache_files(directory_path = this.search_dir) {
        // Get a list of files and folders in search dir
        let all_files = await readdir(directory_path);
        this.log("Reading files...");

        // Iterate second time over all items, including folders
        for (const item of all_files) {
            // Calculate file_stat and file_path
            const {file_stat, file_path} = await this.calc_file_stat_and_path(directory_path, item);

            // If item is not a directory
            if (!file_stat.isDirectory()) {
                // Fetch file's hash and contents
                const {file_contents, file_hash} = await this.calc_file_contents_and_hash(file_path);

                // Calculate file size
                const file_size_in_mb = await this.calculate_file_size(file_path);

                // Update total_search_size
                this.total_search_size += file_size_in_mb;

                // Create file_data object
                const file_data = {
                    file_name_with_ext: item,
                    file_hash: file_hash,
                    file_size_in_mb: file_size_in_mb,
                    file_original_path: file_path,
                    file_type: this.get_file_type(item),
                };

                // Insert into cache
                const successfully_inserted = await this.insert_file_into_cache(file_data);

                // Log this iteration
                this.log("Caching current file: " + file_path);
            } else {
                // Item is directory/folder, traverse
                this.log(`Item is directory (${item}), traversing...`);
                this.log("Reading current item: " + file_path);
                await this.cache_files(file_path);
            }
        }
    }
    async create_hash_map() {
        // Create map
        let all_files_map = new Map();
        let record_counter = 0;

        try {
            // Log that fetching files to create map
            this.log("Fetching files from cache to create map... please wait... (This could take a moment)");

            // Fetch all records from cache
            const records = await this.fetch_all_records_from_table("SELECT * FROM all_files");

            for (const record of records) {
                // Create a key for this record
                const key = `${record_counter}_${record.file_hash}`;

                // Add to map
                all_files_map.set(key, record);

                // Increment record counter
                record_counter++;
            }

            // Set all files map prop
            this.all_files_map = all_files_map;

            // Return
            return true;
        } catch (error) {
            this.error("Error creating map: " + error);
            // Return
            return false;
        }
    }
    async group_files() {
        // Simplify all_files_map from prop
        const map = this.all_files_map;
    
        // Initialize groups array to store the grouped files
        const groups = [];
    
        // Set to keep track of processed file keys
        const processedKeys = new Set();
    
        // Iterate over each file in the map
        for (const [key, fileData] of map.entries()) {
            // Skip this file if it has already been processed
            if (processedKeys.has(key)) {
                continue;
            }
    
            // Initialize a new group
            const group = {
                files: [],
                group_size_in_mb: 0
            };
    
            // Add the current file to the group
            group.files.push({
                file_archived_path: path.join(this.archive_dir, fileData.file_name_with_ext),
                file_name_with_ext: fileData.file_name_with_ext,
                file_original_path: fileData.file_original_path,
                file_size_in_mb: fileData.file_size_in_mb,
                file_type: fileData.file_type
            });
            group.group_size_in_mb += fileData.file_size_in_mb;
    
            // Compare the current file with every other file in the map
            for (const [compareKey, compareFileData] of map.entries()) {
                // Skip comparing the file with itself
                if (key !== compareKey) {
                    // Calculate the similarity between the hash values of the files
                    const similarity = this.calculate_hash_similarity(fileData.file_hash, compareFileData.file_hash);
                    // If the similarity is greater than or equal to 0.8, add the file to the group
                    if (similarity >= 0.8) {
                        group.files.push({
                            file_archived_path: path.join(this.archive_dir, compareFileData.file_name_with_ext),
                            file_name_with_ext: compareFileData.file_name_with_ext,
                            file_original_path: compareFileData.file_original_path,
                            file_size_in_mb: compareFileData.file_size_in_mb,
                            file_type: compareFileData.file_type
                        });
                        group.group_size_in_mb += compareFileData.file_size_in_mb;
                        // Add the compareKey to processedKeys to mark it as processed
                        processedKeys.add(compareKey);
                    }
                }
            }
    
            // Add the current key to processedKeys to mark it as processed
            processedKeys.add(key);
    
            // Check if the group should be included
            if (group.files.length > 1) {
                // Set file_archived_path to null if delete_when_finished is true
                if (this.delete_when_finished) {
                    group.files.forEach(file => file.file_archived_path = null);
                }
    
                // Add the group to the list of groups
                groups.push(group);
            }
        }
    
        // Return the list of groups
        return groups;
    }
    async calculate_total_search_size_failover() {
        // Simplify map prop
        const map = this.all_files_map;

        // Initialize size
        let size = 0;

        // Iterate over each file in the map
        for (const [key, fileData] of map.entries()) {
            // Update size
            size += fileData.file_size_in_mb;
        }

        // Update total_search_size
        this.total_search_size = size;

        await this.win.webContents.send("total-search-size", this.total_search_size);
    }
    async determine_delete_or_move() {
        // Notify delete or move
        this.log("Starting determination process...");
    
        // Simplify map prop
        const map = this.all_files_map;
    
        // Set to store processed files
        const processedFiles = new Set();
    
        // Iterate over each file in the map
        for (const [key, fileData] of map.entries()) {

            // Add to scanned files
            this.scanned_files.push(fileData);
        
            // Update total scanned size
            this.total_scanned_size += fileData.file_size_in_mb;
    
            // Update front-end
            // Now send current file data
            this.win.webContents.send("process-progress", {
                file_name: fileData.file_name_with_ext,
                original_file_path: fileData.file_original_path,
                archived_file_path: path.join(this.archive_dir, fileData.file_name_with_ext), // New to this dataset
                file_size: fileData.file_size_in_mb,
                file_type: fileData.file_type,
                current_scanned_size: this.total_scanned_size,
            });

            // Skip if the file has already been processed
            if (processedFiles.has(key)) {
                continue;
            }
    
            // Flag to determine if a duplicate was found
            let duplicateFound = false;
    
            // Compare the current file with every other file in the map
            for (const [compareKey, compareFileData] of map.entries()) {
                // Skip comparing the file with itself
                if (key !== compareKey) {
                    // Calculate the similarity between the hash values of the files
                    const similarity = this.calculate_hash_similarity(fileData.file_hash, compareFileData.file_hash);
    
                    if (similarity >= 0.8) { // If files are alike at all within 20%
                        // Move or delete the file if not already processed
                        if (!processedFiles.has(compareKey)) {
                            if (this.delete_when_finished !== true) { // If user opted not to delete
                                // Move to archive directory
                                await rename(compareFileData.file_original_path, path.join(this.archive_dir, compareFileData.file_name_with_ext));
                            } else { // user opted to delete when finished
                                // Delete the file
                                await unlink(compareFileData.file_original_path);
                            }
                            // Mark as processed
                            processedFiles.add(compareKey);
                            // Mark duplicate found
                            duplicateFound = true;
                        }
                    }
                }
            }
    
            // Mark current file as processed if a duplicate was found
            if (duplicateFound) {
                processedFiles.add(key);
            }
        }
    }
}

class Traverse extends ManageTraverse {
    async steps() {
        // Create hash map
        await this.cache_files();

        // Log the total search size
        this.success("Finished fetching files!");

        // Create a hash map based on the file data
        await this.create_hash_map();

        // Log that hash map is created
        this.success("all_files_map created!");

        // Group files
        this.groups = await this.group_files();

        this.success("Groups created!");

        // Start total_search_size failover process
        await this.calculate_total_search_size_failover();

        // Start delete or move determination process
        await this.determine_delete_or_move();

        // Lastly, change finished option to finished
        this.finished = true;
    }
}

class Process extends Traverse {
    async start_processing() {
        // Start traversal from the search directory
        await this.steps();

        // After traverse_search_dir() finished
        if (this.finished === true) {
            // Log the data
            this.success("Scanned Files: ", this.scanned_files);
            this.success("Grouped Files: ", this.groups);
            this.success("Total Search Size: " + this.total_search_size + "MB");
            this.success("Total Scanned Size: " + this.total_scanned_size + "MB");

            // Fetch all

            // Send to front end
            await this.win.webContents.send("process-finished", {
                scanned_files: this.scanned_files,
                groups: this.groups,
                total_scanned_size: this.total_scanned_size,
            });
        } else {
            this.error("Something went wrong, and the process could not be completed.");
        }

        // Purge cache
        await this.purge_cache();
    }
}

module.exports = {
    process_files: async function(search_dir, archive_dir, settings) {
        // Initialize Process class structure
        const process = new Process(search_dir, archive_dir, settings);

        // Start process
        await process.start_processing();
    },
    db: db,
};