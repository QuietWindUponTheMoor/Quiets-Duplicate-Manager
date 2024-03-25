const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { process_files, db } = require("./process");

// Initialize window variable
let win;

// Application icon path
const iconPath = path.join(__dirname, "assets", "icons", "icon.ico");

// Main process listeners
app.whenReady().then(async () => {

    // Create the window
    await createWindow();

    // IPC listeners go here
    // Start process listener
    ipcMain.on("start-process", async (event, data) => {
        // Get settings
        const search_dir = data.search_dir;
        const archive_dir = data.archive_dir; // Null allowable
        const settings = data.settings;

        // Temp/Debugging
        //const search_dir = "C:/Users/15632/Desktop/DUPLCIATE CHECKING TESTING/search";
        //const archive_dir = "C:/Users/15632/Desktop/DUPLCIATE CHECKING TESTING/archive";

        // Process the files
        await process_files(search_dir, archive_dir, settings)
            .then(() => {
                console.log("Done");
            })
            .catch(error => {
                console.error(error);
            });
    });
    // Fetch search dir request and open dialog box
    ipcMain.on("request-search-dir-box", async (event) => {
        const result = await dialog.showOpenDialog({
            properties: ["openDirectory"],
        });
        //console.log(`Search dir path selected: ${result.filePaths[0]}`);
        event.reply("fetched-search-path", result.filePaths[0]);
    });
    // Fetch archive dir request and open dialog box
    ipcMain.on("request-archive-dir-box", async (event) => {
        const result = await dialog.showOpenDialog({
            properties: ["openDirectory"],
        });
        //console.log(`Archive dir path selected: ${result.filePaths[0]}`);
        event.reply("fetched-archive-path", result.filePaths[0]);
    });
});
app.on("window-all-closed", async() => {
if (process.platform !== "darwin") {
    // TEMPORARY!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    await db.run("DELETE FROM all_files;");


    // Close the database connection
    db.close();

    // Quit application
    await app.quit();
}
});
app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        // Create application window
        createWindow();
    }
});



// Functions
async function createWindow() {
    // Create the window
    win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false, // Disable nodeIntegration
            contextIsolation: true, // Enable context isolation
            icon: iconPath,
            preload: path.join(__dirname, "../", "preload_settings", "preload.js") // Path to your preload script
        }
    });
    win.maximize();
    win.show();

    // Load the interface
    win.loadFile("index.html");

    // Open DevTools
    win.webContents.openDevTools();
}