#!/usr/bin/env bash
set -e

APP_DIR="/Volumes/ROMS/OmniVault.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
SOURCE_DIR="/Volumes/ROMS/OmniVault-Source"

echo "=== Building Native macOS OmniVault.app on /Volumes/ROMS ==="

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 1. Copy frontend build into Resources
echo "-> Packaging Frontend Assets & Brand Icon..."
mkdir -p "$RESOURCES_DIR/frontend"
rm -rf "$RESOURCES_DIR/frontend/dist"
cp -R "$SOURCE_DIR/frontend/dist" "$RESOURCES_DIR/frontend/dist"
if [ -f "$SOURCE_DIR/AppIcon.icns" ]; then
    cp "$SOURCE_DIR/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
fi

# 2. Copy backend code and data into Resources
echo "-> Packaging Backend Service..."
mkdir -p "$RESOURCES_DIR/backend"
rm -rf "$RESOURCES_DIR/backend/app" "$RESOURCES_DIR/backend/data"
cp -R "$SOURCE_DIR/backend/app" "$RESOURCES_DIR/backend/app"
cp -R "$SOURCE_DIR/backend/data" "$RESOURCES_DIR/backend/data"
cp -R "$SOURCE_DIR/backend/pyproject.toml" "$RESOURCES_DIR/backend/"
cp -R "$SOURCE_DIR/backend/README.md" "$RESOURCES_DIR/backend/"

# Ensure bundled standalone Python runtime is present
STANDALONE_PY_SRC="$(find "$HOME/.local/share/uv/python" -type d -name "cpython-3.14*-macos-aarch64-none" -print -quit 2>/dev/null || true)"
if [ ! -d "$RESOURCES_DIR/python" ]; then
    echo "-> Packaging Bundled Standalone Python runtime..."
    if [ -n "$STANDALONE_PY_SRC" ] && [ -d "$STANDALONE_PY_SRC" ]; then
        cp -R "$STANDALONE_PY_SRC" "$RESOURCES_DIR/python"
    else
        echo "Error: Standalone Python build not found."
        exit 1
    fi
    echo "-> Installing backend dependencies into bundled runtime..."
    uv pip install --python "$RESOURCES_DIR/python/bin/python3" --break-system-packages fastapi "uvicorn[standard]" httpx pydantic python-multipart
    
    # Sanitize dylib ID and sysconfig paths for complete relocation portability & privacy
    if [ -f "$RESOURCES_DIR/python/lib/libpython3.14.dylib" ]; then
        install_name_tool -id @rpath/libpython3.14.dylib "$RESOURCES_DIR/python/lib/libpython3.14.dylib" 2>/dev/null || true
    fi
    find "$RESOURCES_DIR/python" -name "_sysconfigdata*.py" -exec sed -i '' "s|$STANDALONE_PY_SRC|/Applications/OmniVault.app/Contents/Resources/python|g" {} + 2>/dev/null || true
fi

# Clean up dev venv or backup files inside Resources to ensure clean standalone app
rm -rf "$RESOURCES_DIR/backend/.venv" "$RESOURCES_DIR/backend/data/vault.db.bak" "$RESOURCES_DIR/backend/data/vault.db-shm" "$RESOURCES_DIR/backend/data/vault.db-wal"
find "$RESOURCES_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$RESOURCES_DIR" -name ".DS_Store" -delete 2>/dev/null || true

# 3. Create Info.plist
cat << 'EOF' > "$CONTENTS_DIR/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>OmniVault</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.omnivault.classicstore</string>
    <key>CFBundleName</key>
    <string>OmniVault</string>
    <key>CFBundleDisplayName</key>
    <string>OmniVault</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <true/>
    </dict>
</dict>
</plist>
EOF

# 4. Compile Swift Native Launcher
echo "-> Compiling Native macOS Binary (OmniVault)..."
cat << 'EOF' > /tmp/OmniVaultMain.swift
import Cocoa
import WebKit
import GameController

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    let port = 19842
    var lastToggleTime: TimeInterval = 0
    var isLoaded = false
    
    var storefrontURL: URL {
        return URL(string: "http://127.0.0.1:\(port)")!
    }
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1400, height: 900)
        let width: CGFloat = min(1440, max(1100, screenRect.width * 0.92))
        let height: CGFloat = min(920, max(750, screenRect.height * 0.92))
        let rect = NSRect(x: 0, y: 0, width: width, height: height)
        
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "OmniVault • Classic ROM Store"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.backgroundColor = NSColor(red: 0.03, green: 0.05, blue: 0.08, alpha: 1.0)
        window.delegate = self
        window.minSize = NSSize(width: 900, height: 600)
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        
        let config = WKWebViewConfiguration()
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.userContentController.add(self, name: "omnivault")
        
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = self
        
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        
        window.contentView?.addSubview(webView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        showSplashScreen()
        setupGlobalQuickMenuMonitors()
        cleanupOrphanedServer()
        startBackendServer()
        pollServerAndLoad()
    }
    
    func showSplashScreen() {
        let splashHTML = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: #080c14;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #f8fafc;
              overflow: hidden;
              -webkit-user-select: none;
            }
            .logo-box {
              width: 80px;
              height: 80px;
              border-radius: 24px;
              background: linear-gradient(135deg, rgba(0, 210, 255, 0.2), rgba(14, 165, 233, 0.05));
              border: 1px solid rgba(0, 210, 255, 0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 24px;
              box-shadow: 0 0 35px rgba(0, 210, 255, 0.25);
            }
            .spinner {
              width: 32px;
              height: 32px;
              border: 3px solid rgba(0, 210, 255, 0.15);
              border-top-color: #00d2ff;
              border-radius: 50%;
              animation: spin 0.75s linear infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            h1 {
              font-size: 22px;
              font-weight: 800;
              letter-spacing: 3px;
              margin: 0 0 8px 0;
              color: #ffffff;
              text-transform: uppercase;
            }
            p {
              font-size: 13px;
              color: #94a3b8;
              margin: 0;
              letter-spacing: 0.5px;
            }
            .badge {
              margin-top: 18px;
              padding: 4px 12px;
              border-radius: 9999px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
              font-size: 11px;
              color: #38bdf8;
              font-family: ui-monospace, Menlo, monospace;
            }
          </style>
        </head>
        <body>
          <div class="logo-box">
            <div class="spinner"></div>
          </div>
          <h1>OmniVault</h1>
          <p>Booting Neural Retro Engine & Catalog...</p>
          <div class="badge">73,906 Preserved Titles</div>
        </body>
        </html>
        """
        webView.loadHTMLString(splashHTML, baseURL: nil)
    }
    
    func cleanupOrphanedServer() {
        let task = Process()
        task.launchPath = "/bin/sh"
        task.arguments = ["-c", "lsof -ti:\(port) | while read -r pid; do kill -9 $pid 2>/dev/null; done"]
        try? task.run()
        task.waitUntilExit()
    }
    
    func startBackendServer() {
        let bundle = Bundle.main
        guard let resourcePath = bundle.resourcePath else { return }
        
        let backendDir = (resourcePath as NSString).appendingPathComponent("backend")
        let bundledPython = (resourcePath as NSString).appendingPathComponent("python/bin/python3")
        let venvPython = (backendDir as NSString).appendingPathComponent(".venv/bin/python")
        
        var pythonPath = bundledPython
        if !FileManager.default.fileExists(atPath: pythonPath) {
            if FileManager.default.fileExists(atPath: venvPython) {
                pythonPath = venvPython
            } else {
                pythonPath = "/usr/bin/python3"
            }
        }
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: pythonPath)
        process.arguments = [
            "-m", "uvicorn",
            "app.main:app",
            "--host", "127.0.0.1",
            "--port", "\(port)",
            "--log-level", "warning"
        ]
        process.currentDirectoryURL = URL(fileURLWithPath: backendDir)
        
        var env = ProcessInfo.processInfo.environment
        let pyBinDir = (pythonPath as NSString).deletingLastPathComponent
        env["PATH"] = "\(pyBinDir):/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
        env["PYTHONPATH"] = backendDir
        process.environment = env
        
        let logUrl = URL(fileURLWithPath: "/tmp/omnivault_app.log")
        FileManager.default.createFile(atPath: logUrl.path, contents: nil)
        if let fileHandle = try? FileHandle(forWritingTo: logUrl) {
            process.standardOutput = fileHandle
            process.standardError = fileHandle
        }
        
        do {
            try process.run()
            self.serverProcess = process
        } catch {
            print("Failed to run backend: \(error)")
        }
    }
    
    func pollServerAndLoad(attempt: Int = 0) {
        guard !isLoaded else { return }
        
        let healthURL = URL(string: "http://127.0.0.1:\(port)/api/health")!
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 0.5
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200,
               let d = data, let str = String(data: d, encoding: .utf8), str.contains("ok") {
                DispatchQueue.main.async {
                    self.isLoaded = true
                    let req = URLRequest(url: self.storefrontURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30.0)
                    self.webView.load(req)
                }
            } else {
                let delay = attempt < 20 ? 0.2 : 0.5
                DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                    self.pollServerAndLoad(attempt: attempt + 1)
                }
            }
        }
        task.resume()
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard !isLoaded else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self else { return }
            self.pollServerAndLoad()
        }
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !isLoaded else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self else { return }
            self.pollServerAndLoad()
        }
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let dict = message.body as? [String: Any], let action = dict["action"] as? String {
            if action == "closeQuickMenu" || action == "quitGame" {
                DispatchQueue.main.async {
                    self.window.level = .normal
                    NSApp.activate(ignoringOtherApps: true)
                    self.window.makeKeyAndOrderFront(nil)
                }
            }
        }
    }

    func triggerQuickMenuOverlay(fromBackground: Bool) {
        let now = Date().timeIntervalSince1970
        if now - lastToggleTime < 0.35 { return }
        lastToggleTime = now
        
        DispatchQueue.main.async {
            self.window.level = .floating
            if fromBackground || !NSApp.isActive {
                NSApp.activate(ignoringOtherApps: true)
                self.window.makeKeyAndOrderFront(nil)
            }
            self.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('omnivault-toggle-quickmenu'));", completionHandler: nil)
        }
    }
    
    func bindController(_ controller: GCController) {
        guard let gamepad = controller.extendedGamepad else { return }
        
        gamepad.buttonHome?.pressedChangedHandler = { [weak self] _, _, pressed in
            if pressed {
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }
        
        gamepad.buttonMenu.pressedChangedHandler = { [weak self] _, _, pressed in
            if pressed, gamepad.buttonOptions?.isPressed == true {
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }

        gamepad.buttonOptions?.pressedChangedHandler = { [weak self] _, _, pressed in
            if pressed, gamepad.buttonMenu.isPressed {
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }

        gamepad.leftThumbstickButton?.pressedChangedHandler = { [weak self] _, _, pressed in
            if pressed, gamepad.rightThumbstickButton?.isPressed == true {
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }

        gamepad.rightThumbstickButton?.pressedChangedHandler = { [weak self] _, _, pressed in
            if pressed, gamepad.leftThumbstickButton?.isPressed == true {
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }
    }
    
    func setupGlobalQuickMenuMonitors() {
        GCController.shouldMonitorBackgroundEvents = true
        for controller in GCController.controllers() {
            bindController(controller)
        }
        NotificationCenter.default.addObserver(
            forName: .GCControllerDidConnect,
            object: nil,
            queue: .main
        ) { [weak self] note in
            if let ctrl = note.object as? GCController {
                self?.bindController(ctrl)
            }
        }
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
        
        // High-frequency polling timer for background gamepad combo detection
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            for ctrl in GCController.controllers() {
                guard let gp = ctrl.extendedGamepad else { continue }
                let home = gp.buttonHome?.isPressed ?? false
                let start = gp.buttonMenu.isPressed
                let select = gp.buttonOptions?.isPressed ?? false
                let l3 = gp.leftThumbstickButton?.isPressed ?? false
                let r3 = gp.rightThumbstickButton?.isPressed ?? false
                
                if home || (start && select) || (l3 && r3) {
                    self?.triggerQuickMenuOverlay(fromBackground: true)
                    break
                }
            }
        }
        
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 122 || (event.keyCode == 53 && event.modifierFlags.contains(.command)) { // F1 or Cmd+Esc
                self?.triggerQuickMenuOverlay(fromBackground: true)
            }
        }
    }
    
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.terminate(nil)
        return true
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        if let proc = serverProcess, proc.isRunning {
            proc.terminate()
        }
        cleanupOrphanedServer()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
EOF

swiftc -O -target arm64-apple-macosx13.0 /tmp/OmniVaultMain.swift -o "$MACOS_DIR/OmniVault"
chmod +x "$MACOS_DIR/OmniVault"

echo "=== Successfully Synced /Volumes/ROMS/OmniVault.app! ==="
