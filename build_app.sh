#!/usr/bin/env bash
set -e

APP_DIR="/Volumes/ROMS/OmniVault.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
SOURCE_DIR="/Volumes/ROMS/OmniVault-Source"

echo "=== Building Native macOS OmniVault.app on /Volumes/ROMS ==="

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 1. Build & copy frontend into Resources
echo "-> Building & Packaging Frontend Assets & Brand Icon..."
(cd "$SOURCE_DIR/frontend" && npm run build)
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

# Ensure bundled standalone Python runtime is present & up to date
STANDALONE_PY_SRC="$(find "$HOME/.local/share/uv/python" -type d -name "cpython-3.14*-macos-aarch64-none" -print -quit 2>/dev/null || true)"
if [ ! -d "$RESOURCES_DIR/python" ]; then
    echo "-> Packaging Bundled Standalone Python runtime..."
    if [ -n "$STANDALONE_PY_SRC" ] && [ -d "$STANDALONE_PY_SRC" ]; then
        cp -R "$STANDALONE_PY_SRC" "$RESOURCES_DIR/python"
    else
        echo "Error: Standalone Python build not found."
        exit 1
    fi
fi

echo "-> Installing/verifying all backend dependencies in bundled runtime..."
uv pip install --python "$RESOURCES_DIR/python/bin/python3" --break-system-packages \
    fastapi "uvicorn[standard]" httpx pydantic python-multipart beautifulsoup4 llama-cpp-python

# Sanitize dylib ID and sysconfig paths for complete relocation portability & privacy
if [ -f "$RESOURCES_DIR/python/lib/libpython3.14.dylib" ]; then
    install_name_tool -id @rpath/libpython3.14.dylib "$RESOURCES_DIR/python/lib/libpython3.14.dylib" 2>/dev/null || true
    codesign --force --sign - "$RESOURCES_DIR/python/lib/libpython3.14.dylib" 2>/dev/null || true
fi
if [ -n "$STANDALONE_PY_SRC" ]; then
    find "$RESOURCES_DIR/python" -name "_sysconfigdata*.py" -exec sed -i '' "s|$STANDALONE_PY_SRC|/Applications/OmniVault.app/Contents/Resources/python|g" {} + 2>/dev/null || true
fi

# Sanitize any embedded local build-cache paths in compiled C++ extension dylibs (exact byte-length replacement)
python3 - "$RESOURCES_DIR/python" << 'PYEOF'
import sys, pathlib
root = pathlib.Path(sys.argv[1])
local_user = pathlib.Path.home().name.encode("utf-8")
if local_user and local_user.lower() != b"nightknight24":
    base = b"nightknight24"
    repl = (base * ((len(local_user) // len(base)) + 1))[:len(local_user)]
    assert len(local_user) == len(repl)
    for p in root.rglob("*"):
        if p.is_file() and not p.is_symlink() and p.suffix in (".dylib", ".so", ".py", ".cfg", ".json"):
            data = p.read_bytes()
            if local_user in data:
                p.write_bytes(data.replace(local_user, repl))
PYEOF

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
    <string>1.0.2</string>
    <key>CFBundleVersion</key>
    <string>3</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
    <key>NSRemovableVolumesUsageDescription</key>
    <string>OmniVault accesses your external drive to load your ROM library, emulators, and save states.</string>
    <key>NSDownloadsFolderUsageDescription</key>
    <string>OmniVault accesses Downloads to import ROMs, BIOS files, and patches.</string>
    <key>NSDocumentsFolderUsageDescription</key>
    <string>OmniVault accesses Documents to manage your retro game folders and save backups.</string>
    <key>NSDesktopFolderUsageDescription</key>
    <string>OmniVault accesses Desktop to import game files.</string>
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
import SQLite3

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    let port = 19842
    var lastToggleTime: TimeInterval = 0
    var isLoaded = false
    var lastLeftMouseDownEvent: NSEvent?
    
    var storefrontURL: URL {
        return URL(string: "http://127.0.0.1:\(port)")!
    }
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1400, height: 900)
        let width: CGFloat = min(1440, max(640, floor(screenRect.width * 0.88)))
        let height: CGFloat = min(900, max(500, floor(screenRect.height * 0.86)))
        let rect = NSRect(x: 0, y: 0, width: width, height: height)
        let darkBg = NSColor(srgbRed: 8.0 / 255.0, green: 12.0 / 255.0, blue: 20.0 / 255.0, alpha: 1.0)
        
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.appearance = NSAppearance(named: .darkAqua)
        window.center()
        window.title = "OmniVault"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .visible
        window.isMovableByWindowBackground = true
        window.backgroundColor = darkBg
        window.delegate = self
        window.minSize = NSSize(width: 600, height: 450)
        window.collectionBehavior = [.fullScreenPrimary]
        window.setFrameAutosaveName("OmniVaultMainWindow")
        clampWindowToVisibleScreen()
        
        NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            self?.lastLeftMouseDownEvent = event
            return event
        }
        
        let config = WKWebViewConfiguration()
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        
        let dragBridgeJS = """
        (function() {
          document.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var dragZone = e.target && e.target.closest && e.target.closest('[data-window-drag]');
            if (!dragZone) return;
            var interactive = e.target.closest('button, a, input, select, textarea, label, [role="button"], [data-no-drag]');
            if (interactive) return;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.omnivault) {
              window.webkit.messageHandlers.omnivault.postMessage({ action: 'startWindowDrag' });
            }
          }, false);
          document.addEventListener('dblclick', function(e) {
            var dragZone = e.target && e.target.closest && e.target.closest('[data-window-drag]');
            if (!dragZone) return;
            var interactive = e.target.closest('button, a, input, select, textarea, label, [role="button"], [data-no-drag]');
            if (interactive) return;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.omnivault) {
              window.webkit.messageHandlers.omnivault.postMessage({ action: 'toggleWindowZoom' });
            }
          }, false);
        })();
        """
        let dragScript = WKUserScript(source: dragBridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(dragScript)
        config.userContentController.add(self, name: "omnivault")
        
        let initialBounds = window.contentView?.bounds ?? rect
        webView = WKWebView(frame: initialBounds, configuration: config)
        webView.underPageBackgroundColor = darkBg
        webView.navigationDelegate = self
        
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        
        if let contentView = window.contentView {
            contentView.autoresizesSubviews = true
            webView.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(webView)
            NSLayoutConstraint.activate([
                webView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
                webView.topAnchor.constraint(equalTo: contentView.topAnchor),
                webView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
            ])
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        showSplashScreen()
        setupGlobalQuickMenuMonitors()
        cleanupOrphanedServer()
        startBackendServer()
        pollServerAndLoad()
    }
    
    func clampWindowToVisibleScreen() {
        let currentFrame = window.frame
        let targetScreen = window.screen ?? NSScreen.main
        guard let visible = targetScreen?.visibleFrame else { return }
        var adjusted = currentFrame
        if adjusted.width > visible.width {
            adjusted.size.width = visible.width
        }
        if adjusted.height > visible.height {
            adjusted.size.height = visible.height
        }
        if adjusted.width < window.minSize.width {
            adjusted.size.width = min(window.minSize.width, visible.width)
        }
        if adjusted.height < window.minSize.height {
            adjusted.size.height = min(window.minSize.height, visible.height)
        }
        if adjusted.minX < visible.minX {
            adjusted.origin.x = visible.minX
        }
        if adjusted.maxX > visible.maxX {
            adjusted.origin.x = max(visible.minX, visible.maxX - adjusted.width)
        }
        if adjusted.minY < visible.minY {
            adjusted.origin.y = visible.minY
        }
        if adjusted.maxY > visible.maxY {
            adjusted.origin.y = max(visible.minY, visible.maxY - adjusted.height)
        }
        if adjusted != currentFrame {
            window.setFrame(adjusted, display: true)
        }
    }
    
    func syncWebViewport() {
        window.contentView?.layoutSubtreeIfNeeded()
        webView.needsLayout = true
        webView.evaluateJavaScript("window.dispatchEvent(new Event('resize'));", completionHandler: nil)
    }
    
    func windowDidResize(_ notification: Notification) {
        window.contentView?.layoutSubtreeIfNeeded()
    }
    
    func windowDidEndLiveResize(_ notification: Notification) {
        syncWebViewport()
    }
    
    func windowDidMove(_ notification: Notification) {
        window.contentView?.layoutSubtreeIfNeeded()
    }
    
    func windowDidChangeScreen(_ notification: Notification) {
        syncWebViewport()
    }
    
    func windowDidEnterFullScreen(_ notification: Notification) {
        syncWebViewport()
    }
    
    func windowDidExitFullScreen(_ notification: Notification) {
        syncWebViewport()
    }
    
    func resolveCatalogCount() -> String {
        var count = 67594
        var candidates: [String] = []
        let appSupportDB = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support/OmniVault/data/vault.db")
        candidates.append(appSupportDB)
        if let resourcePath = Bundle.main.resourcePath {
            candidates.append((resourcePath as NSString).appendingPathComponent("backend/data/vault.db"))
        }
        for dbPath in candidates {
            if FileManager.default.fileExists(atPath: dbPath) {
                var db: OpaquePointer?
                if sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK {
                    defer { sqlite3_close(db) }
                    var stmt: OpaquePointer?
                    if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM games;", -1, &stmt, nil) == SQLITE_OK {
                        defer { sqlite3_finalize(stmt) }
                        if sqlite3_step(stmt) == SQLITE_ROW {
                            let dbCount = Int(sqlite3_column_int64(stmt, 0))
                            if dbCount > 0 {
                                count = dbCount
                                break
                            }
                        }
                    }
                }
            }
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: count)) ?? "\(count)"
    }

    func showSplashScreen() {
        let formattedCount = resolveCatalogCount()
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
              max-width: 520px;
              text-align: center;
              padding: 0 16px;
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
        <body data-window-drag="true">
          <div class="logo-box">
            <div class="spinner"></div>
          </div>
          <h1>OmniVault</h1>
          <p id="boot-status">Booting Neural Retro Engine & Catalog...</p>
          <div class="badge">\(formattedCount) Preserved Titles</div>
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
        if let existing = self.serverProcess, existing.isRunning { return }
        let bundle = Bundle.main
        guard let resourcePath = bundle.resourcePath else { return }
        
        let backendDir = (resourcePath as NSString).appendingPathComponent("backend")
        let bundledPython314 = (resourcePath as NSString).appendingPathComponent("python/bin/python3.14")
        let bundledPython = (resourcePath as NSString).appendingPathComponent("python/bin/python3")
        let venvPython = (backendDir as NSString).appendingPathComponent(".venv/bin/python")
        
        var pythonPath = bundledPython314
        if !FileManager.default.fileExists(atPath: pythonPath) {
            if FileManager.default.fileExists(atPath: bundledPython) {
                pythonPath = (bundledPython as NSString).resolvingSymlinksInPath
            } else if FileManager.default.fileExists(atPath: venvPython) {
                pythonPath = (venvPython as NSString).resolvingSymlinksInPath
            } else {
                pythonPath = "/usr/bin/python3"
            }
        }
        
        let logUrl = URL(fileURLWithPath: "/tmp/omnivault_app.log")
        if !FileManager.default.fileExists(atPath: logUrl.path) {
            FileManager.default.createFile(atPath: logUrl.path, contents: nil)
        }
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: pythonPath)
        process.arguments = [
            "-B",
            "-m", "uvicorn",
            "app.main:app",
            "--host", "127.0.0.1",
            "--port", "\(port)",
            "--log-level", "info"
        ]
        process.currentDirectoryURL = URL(fileURLWithPath: backendDir)
        
        var env = ProcessInfo.processInfo.environment
        let pyBinDir = (pythonPath as NSString).deletingLastPathComponent
        env["PATH"] = "\(pyBinDir):/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
        env["PYTHONPATH"] = backendDir
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        process.environment = env
        
        if let fileHandle = try? FileHandle(forWritingTo: logUrl) {
            _ = try? fileHandle.seekToEnd()
            process.standardOutput = fileHandle
            process.standardError = fileHandle
        }
        
        do {
            try process.run()
            self.serverProcess = process
        } catch {
            let msg = "Failed to run backend (\(pythonPath)): \(error)\n"
            if let data = msg.data(using: .utf8), let fh = try? FileHandle(forWritingTo: logUrl) {
                _ = try? fh.seekToEnd()
                try? fh.write(contentsOf: data)
                try? fh.close()
            }
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
                if attempt > 0 && attempt % 6 == 0 {
                    DispatchQueue.main.async {
                        if self.serverProcess == nil || !(self.serverProcess?.isRunning ?? false) {
                            if attempt >= 12, let logStr = try? String(contentsOfFile: "/tmp/omnivault_app.log", encoding: .utf8) {
                                let lastLine = logStr.components(separatedBy: .newlines).last(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) ?? ""
                                if !lastLine.isEmpty {
                                    let safe = lastLine.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
                                    self.webView.evaluateJavaScript("var el=document.getElementById('boot-status'); if(el) el.innerText='Retrying engine: \(safe)';", completionHandler: nil)
                                }
                            }
                            self.startBackendServer()
                        }
                    }
                }
                let delay = attempt < 20 ? 0.25 : 0.5
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
            if action == "startWindowDrag" {
                DispatchQueue.main.async {
                    if let ev = self.lastLeftMouseDownEvent ?? NSApp.currentEvent, ev.type == .leftMouseDown {
                        self.window.performDrag(with: ev)
                    }
                }
            } else if action == "toggleWindowZoom" {
                DispatchQueue.main.async {
                    self.window.zoom(nil)
                }
            } else if action == "closeQuickMenu" || action == "quitGame" {
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

swiftc -O -lsqlite3 -target arm64-apple-macosx13.0 /tmp/OmniVaultMain.swift -o "$MACOS_DIR/OmniVault"
chmod +x "$MACOS_DIR/OmniVault"
rm -f /tmp/OmniVaultMain.swift

echo "-> Signing macOS App Bundle (binding Info.plist & entitlements)..."
xattr -cr "$APP_DIR" 2>/dev/null || true
find "$RESOURCES_DIR/python" -type f \( -name "*.dylib" -o -name "*.so" -o -name "python3.14" \) -exec codesign --force --sign - {} \; 2>/dev/null || true
find "$RESOURCES_DIR/backend" -type f \( -name "*.dylib" -o -name "*.so" -o -name "macos_ocr" \) -exec codesign --force --sign - {} \; 2>/dev/null || true
codesign --force --sign - "$MACOS_DIR/OmniVault"
codesign --force --sign - "$APP_DIR"

echo "=== Successfully Synced /Volumes/ROMS/OmniVault.app! ==="
