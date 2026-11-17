// The only bridge between the panel page and the app: a small, fixed set of calls.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("helper", {
  state: () => ipcRenderer.invoke("helper:state"),
  signIn: (mode: "signin" | "signup", email: string, password: string, server?: string) => ipcRenderer.invoke("helper:sign-in", mode, email, password, server),
  signOut: () => ipcRenderer.invoke("helper:sign-out"),
  solve: () => ipcRenderer.invoke("helper:solve"),
  chat: (question: unknown, turns: unknown) => ipcRenderer.invoke("helper:chat", question, turns),
  openScreenSettings: () => ipcRenderer.invoke("helper:open-screen-settings"),
  relaunch: () => ipcRenderer.invoke("helper:relaunch"),
  hide: () => ipcRenderer.invoke("helper:hide"),
  openWeb: () => ipcRenderer.invoke("helper:open-web"),
  onEvent: (listener: (event: unknown) => void) => {
    const wrapped = (_: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on("helper:event", wrapped);
    return () => ipcRenderer.removeListener("helper:event", wrapped);
  },
});
