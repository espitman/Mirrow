import { app, BrowserWindow, nativeTheme } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BrowserController } from "./browser.js";
import { registerIpc } from "./ipc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let browserController: BrowserController | null = null;

async function createWindow() {
  nativeTheme.themeSource = "dark";

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#070816",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  browserController = new BrowserController(mainWindow);
  browserController.create();
  registerIpc(browserController);

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    browserController?.destroy();
    browserController = null;
    mainWindow = null;
  });
}

app.whenReady().then(createWindow).catch((error) => {
  console.error("Failed to start Mirrow", error);
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => console.error(error));
  }
});
