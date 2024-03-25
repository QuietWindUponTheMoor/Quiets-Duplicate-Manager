const { contextBridge, ipcRenderer } = require("electron");

// Expose a safe subset of ipcRenderer
contextBridge.exposeInMainWorld('electron', {
    // Send message to main process
    send: (channel, data) => {
      ipcRenderer.send(channel, data);
    },
    // Receive message from main process
    receive: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    // Remove the listener for a message from the main process
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
});
