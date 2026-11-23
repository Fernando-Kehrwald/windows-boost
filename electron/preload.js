const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  call: (name, ...args) => ipcRenderer.invoke('call', name, ...args).then((r) => {
    if (r && r.__error) throw new Error(r.__error);
    return r;
  }),
  on: (event, cb) => {
    const fn = (_e, name, payload) => { if (name === event) cb(payload); };
    ipcRenderer.on('event', fn);
    return () => ipcRenderer.removeListener('event', fn);
  },
});
