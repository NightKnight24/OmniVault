const API_BASE = '/api';

export async function fetchGames(params = {}) {
  const query = new URLSearchParams();
  if (params.platform && params.platform !== 'ALL') query.set('platform', params.platform);
  if (params.family && params.family !== 'ALL') query.set('family', params.family);
  if (params.genre && params.genre !== 'ALL') query.set('genre', params.genre);
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', params.page);
  if (params.pageSize) query.set('page_size', params.pageSize);
  if (params.featured_only) query.set('featured_only', 'true');
  if (params.favorites_only) query.set('favorites_only', 'true');
  
  const res = await fetch(`${API_BASE}/games?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch games');
  return res.json();
}

export async function fetchGame(id) {
  const res = await fetch(`${API_BASE}/games/${id}`);
  if (!res.ok) throw new Error('Failed to fetch game details');
  return res.json();
}
export const fetchGameById = fetchGame;

export async function fetchGameVideo(gameId, mode = 'gameplay') {
  const res = await fetch(`${API_BASE}/games/${gameId}/video?mode=${mode}`);
  if (!res.ok) throw new Error('Failed to fetch video');
  return res.json();
}

export async function fetchPlatforms() {
  const res = await fetch(`${API_BASE}/games/meta/platforms`);
  if (!res.ok) throw new Error('Failed to fetch platforms');
  return res.json();
}

export async function fetchConsoleFamilies() {
  const res = await fetch(`${API_BASE}/games/meta/families`);
  if (!res.ok) throw new Error('Failed to fetch console families');
  return res.json();
}

export async function fetchGenres(platform = 'ALL', family = 'ALL') {
  const query = new URLSearchParams();
  if (platform && platform !== 'ALL') query.set('platform', platform);
  if (family && family !== 'ALL') query.set('family', family);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/games/meta/genres${qStr}`);
  if (!res.ok) throw new Error('Failed to fetch genres');
  return res.json();
}

export async function fetchGameCheats(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/cheats`);
  if (!res.ok) throw new Error('Failed to fetch cheats');
  return res.json();
}

export async function fetchGamePatchesAndMods(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/patches-mods`);
  if (!res.ok) throw new Error('Failed to fetch patches and mods');
  return res.json();
}

export async function exportGameCheats(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/export-cheats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to export cheats');
  return res.json();
}

export async function scrapeSearch(query, platform) {
  const res = await fetch(`${API_BASE}/scrape/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, platform }),
  });
  if (!res.ok) throw new Error('Failed to search online sources');
  return res.json();
}

export async function importScrapedGame(game) {
  const res = await fetch(`${API_BASE}/scrape/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
  });
  if (!res.ok) throw new Error('Failed to import game to store');
  return res.json();
}

export async function populateAllLibraries(limit = 300) {
  const res = await fetch(`${API_BASE}/scrape/populate-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error('Failed to scrape full libraries');
  return res.json();
}

export async function fetchDownloads() {
  const res = await fetch(`${API_BASE}/downloads`);
  if (!res.ok) throw new Error('Failed to fetch downloads');
  return res.json();
}

export async function fetchInstalledGames() {
  const res = await fetch(`${API_BASE}/downloads/installed`);
  if (!res.ok) throw new Error('Failed to fetch installed games');
  return res.json();
}

export async function launchInstalledGame(path) {
  const res = await fetch(`${API_BASE}/downloads/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to launch game');
  return res.json();
}

export async function deleteInstalledGame(path) {
  const res = await fetch(`${API_BASE}/downloads/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to delete game');
  return res.json();
}

export async function startDownload(gameId, type = 'direct', directUrl = null, filename = null) {
  const payload = { game_id: gameId, type };
  if (directUrl) payload.direct_url = directUrl;
  if (filename) payload.filename = filename;
  const res = await fetch(`${API_BASE}/downloads/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to start download');
  return res.json();
}

export async function revealInFinder(downloadId) {
  const res = await fetch(`${API_BASE}/downloads/${downloadId}/open`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reveal file in Finder');
  return res.json();
}

export async function cancelDownload(downloadId) {
  const res = await fetch(`${API_BASE}/downloads/${downloadId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to cancel download');
  return res.json();
}

export async function chatWithAI(message, history = []) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error('AI assistant unavailable');
  return res.json();
}

export async function fetchAISuggestions() {
  const res = await fetch(`${API_BASE}/ai/suggestions`);
  if (!res.ok) throw new Error('Failed to fetch AI suggestions');
  return res.json();
}

export async function toggleFavorite(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to toggle favorite');
  return res.json();
}

export async function rateGame(gameId, rating, review = '') {
  const res = await fetch(`${API_BASE}/games/${gameId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, review }),
  });
  if (!res.ok) throw new Error('Failed to save rating');
  return res.json();
}

export async function fetchGameReviews(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/reviews`);
  if (!res.ok) throw new Error('Failed to fetch game reviews');
  return res.json();
}

export async function submitGameReview(gameId, payload) {
  const res = await fetch(`${API_BASE}/games/${gameId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to submit game review');
  return res.json();
}

export async function fetchFavoritesCount() {
  const res = await fetch(`${API_BASE}/games/meta/favorites-count`);
  if (!res.ok) throw new Error('Failed to fetch favorites count');
  return res.json();
}

export async function verifyChecksum(path) {
  const res = await fetch(`${API_BASE}/downloads/verify-checksum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to verify checksum');
  return res.json();
}

export async function extractArchive(path) {
  const res = await fetch(`${API_BASE}/downloads/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to extract archive');
  return res.json();
}

export async function fetchProviders() {
  const res = await fetch(`${API_BASE}/providers`);
  if (!res.ok) throw new Error('Failed to fetch search providers');
  return res.json();
}

export async function addProvider(payload) {
  const res = await fetch(`${API_BASE}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add search provider');
  }
  return res.json();
}

export async function deleteProvider(providerId) {
  const res = await fetch(`${API_BASE}/providers/${providerId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete provider');
  return res.json();
}

export async function toggleProvider(providerId) {
  const res = await fetch(`${API_BASE}/providers/${providerId}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to toggle provider');
  return res.json();
}

export async function testProviderConnection(payload) {
  const res = await fetch(`${API_BASE}/providers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to test provider connection');
  return res.json();
}

export async function fetchSearchTemplates() {
  const res = await fetch(`${API_BASE}/providers/templates`);
  if (!res.ok) throw new Error('Failed to fetch search templates');
  return res.json();
}

export async function addSearchTemplate(payload) {
  const res = await fetch(`${API_BASE}/providers/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add search template');
  }
  return res.json();
}

export async function deleteSearchTemplate(templateId) {
  const res = await fetch(`${API_BASE}/providers/templates/${templateId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete search template');
  return res.json();
}

// =========================================================================
// Advanced Cheat Engineering Lab APIs
// =========================================================================

export async function diffSaves(formData) {
  const res = await fetch(`${API_BASE}/cheats-engine/save/diff`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to compare save files');
  }
  return res.json();
}

export async function searchSave(formData) {
  const res = await fetch(`${API_BASE}/cheats-engine/save/search`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to search save file');
  }
  return res.json();
}

export async function patchSave(payload) {
  const res = await fetch(`${API_BASE}/cheats-engine/save/patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to safely patch save file');
  }
  return res.json();
}

export async function fetchSaveBackups(path) {
  const res = await fetch(`${API_BASE}/cheats-engine/save/backups?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error('Failed to load save backups');
  return res.json();
}

export async function revertSave(path, backup_path) {
  const res = await fetch(`${API_BASE}/cheats-engine/save/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, backup_path }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to restore save backup');
  }
  return res.json();
}

export async function fetchRetroArchStatus() {
  const res = await fetch(`${API_BASE}/cheats-engine/retroarch/status`);
  if (!res.ok) throw new Error('Failed to query RetroArch status');
  return res.json();
}

export async function scanRetroArchRam(payload) {
  const res = await fetch(`${API_BASE}/cheats-engine/retroarch/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to scan RetroArch RAM');
  }
  return res.json();
}

export async function pokeRetroArchRam(payload) {
  const res = await fetch(`${API_BASE}/cheats-engine/retroarch/poke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to poke live RAM');
  }
  return res.json();
}

export async function freezeRetroArchRam(payload) {
  const res = await fetch(`${API_BASE}/cheats-engine/retroarch/freeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to freeze live RAM');
  }
  return res.json();
}

export async function unfreezeRetroArchRam(payload) {
  const res = await fetch(`${API_BASE}/cheats-engine/retroarch/unfreeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to unfreeze RAM');
  return res.json();
}

export async function analyzeRomCheats(formData) {
  const res = await fetch(`${API_BASE}/cheats-engine/rom/analyze`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to analyze ROM for cheats');
  }
  return res.json();
}

// =========================================================================
// Live AI Screen & Audio Translation APIs
// =========================================================================

export async function translateFrame(imageBase64 = null, voice = false) {
  const formData = new FormData();
  if (imageBase64) {
    formData.append('image_base64', imageBase64);
  }
  formData.append('voice', voice ? 'true' : 'false');
  
  const res = await fetch(`${API_BASE}/ai/translate-frame`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Live translation failed');
  }
  return res.json();
}

export async function fetchRetroArchAiConfig() {
  const res = await fetch(`${API_BASE}/ai/retroarch-config`);
  if (!res.ok) throw new Error('Failed to fetch RetroArch AI config');
  return res.json();
}

export async function speakText(text) {
  const res = await fetch(`${API_BASE}/ai/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to synthesize speech');
  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.play();
  return audio;
}

// =========================================================================
// Multi-Source ROM Scraper & Mirror Network APIs
// =========================================================================

export async function fetchMirrorSources() {
  const res = await fetch(`${API_BASE}/mirrors/sources`);
  if (!res.ok) throw new Error('Failed to fetch mirror sources');
  return res.json();
}

export async function searchMirrors(query, platform = null, sourceId = null) {
  const res = await fetch(`${API_BASE}/mirrors/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, platform, source_id: sourceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Multi-source mirror search failed');
  }
  return res.json();
}

export async function getGameMirrors(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/mirrors`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch game mirrors');
  }
  return res.json();
}

export async function getGameStreams(gameId) {
  return getGameMirrors(gameId);
}

export async function findWorkingMirror(title, platform = 'Retro', failedUrl = null) {
  const res = await fetch(`${API_BASE}/mirrors/find-mirror`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, platform, failed_url: failedUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Mirror resolution failed');
  }
  return res.json();
}

export async function testMirrorSource(sourceId) {
  const res = await fetch(`${API_BASE}/mirrors/test-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id: sourceId }),
  });
  if (!res.ok) throw new Error('Failed to test mirror source');
  return res.json();
}

export async function importAndDownloadMirror(payload) {
  const res = await fetch(`${API_BASE}/mirrors/import-and-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import and download from mirror');
  }
  return res.json();
}

// =========================================================================
// Native Emulator Management & Unified Settings APIs
// =========================================================================

export async function fetchEmulatorsStatus() {
  const res = await fetch(`${API_BASE}/emulators/status`);
  if (!res.ok) throw new Error('Failed to fetch emulators status');
  return res.json();
}

export async function installEmulator(emulatorId) {
  const res = await fetch(`${API_BASE}/emulators/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emulator_id: emulatorId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to install/update emulator');
  }
  return res.json();
}

export async function installAllEmulators() {
  const res = await fetch(`${API_BASE}/emulators/install-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to install all emulators');
  return res.json();
}

export async function launchInNativeEmulator(path, platform = 'Retro', force = false) {
  const res = await fetch(`${API_BASE}/emulators/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, platform, force }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to launch in native emulator');
  }
  return res.json();
}

export async function checkPlatformBios(platform) {
  const res = await fetch(`${API_BASE}/emulators/bios-check/${encodeURIComponent(platform)}`);
  if (!res.ok) return { required: false, ready: true };
  return res.json();
}

export async function fetchActiveSession() {
  const res = await fetch(`${API_BASE}/emulators/active-session`);
  if (!res.ok) return { session: null };
  return res.json();
}

export async function syncEmulatorControllers() {
  const res = await fetch(`${API_BASE}/emulators/sync-controllers`, { method: 'POST' });
  if (!res.ok) return { status: 'error' };
  return res.json();
}

export async function controlActiveEmulator(action, value = null) {
  const res = await fetch(`${API_BASE}/emulators/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Emulator control failed');
  }
  return res.json();
}

export async function fetchEmulatorSettings() {
  const res = await fetch(`${API_BASE}/emulators/settings`);
  if (!res.ok) throw new Error('Failed to fetch emulator settings');
  return res.json();
}

export async function saveEmulatorSettings(settings) {
  const res = await fetch(`${API_BASE}/emulators/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save emulator settings');
  }
  return res.json();
}

export async function fetchBiosStatus() {
  const res = await fetch(`${API_BASE}/emulators/bios`);
  if (!res.ok) throw new Error('Failed to fetch BIOS status');
  return res.json();
}

export async function uploadBiosFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/emulators/upload-bios`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to upload BIOS file');
  }
  return res.json();
}

export async function fetchSetupStatus() {
  const res = await fetch(`${API_BASE}/emulators/setup-status`);
  if (!res.ok) throw new Error('Failed to fetch setup status');
  return res.json();
}

export async function completeSetup(payload) {
  const res = await fetch(`${API_BASE}/emulators/complete-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to complete initial setup');
  }
  return res.json();
}

export async function openEmulatorFolder(folder = 'emulators') {
  const res = await fetch(`${API_BASE}/emulators/open-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  if (!res.ok) throw new Error('Failed to open folder');
  return res.json();
}

// =========================================================================
// Themes & AI Theme Studio APIs
// =========================================================================

export async function fetchThemes() {
  const res = await fetch(`${API_BASE}/themes`);
  if (!res.ok) throw new Error('Failed to fetch themes');
  return res.json();
}

export async function saveTheme(payload) {
  const res = await fetch(`${API_BASE}/themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save theme');
  }
  return res.json();
}

export async function activateTheme(themeId) {
  const res = await fetch(`${API_BASE}/themes/${themeId}/activate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to activate theme');
  return res.json();
}

export async function deleteTheme(themeId) {
  const res = await fetch(`${API_BASE}/themes/${themeId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete theme');
  return res.json();
}

export async function generateAITheme(prompt) {
  const res = await fetch(`${API_BASE}/themes/generate-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate AI theme');
  }
  return res.json();
}

// =========================================================================
// RetroAchievements Universal Trophy APIs
// =========================================================================

export async function fetchAchievementsConfig() {
  const res = await fetch(`${API_BASE}/achievements/config`);
  if (!res.ok) throw new Error('Failed to fetch achievements config');
  return res.json();
}

export async function saveAchievementsConfig(payload) {
  const res = await fetch(`${API_BASE}/achievements/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save achievements config');
  return res.json();
}

export async function fetchGameAchievements(gameId) {
  const res = await fetch(`${API_BASE}/achievements/game/${gameId}`);
  if (!res.ok) throw new Error('Failed to fetch game achievements');
  return res.json();
}

export async function scanGameAchievements(gameId) {
  const res = await fetch(`${API_BASE}/achievements/scan-progress/${gameId}`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to scan game achievements');
  return res.json();
}

export async function unlockAchievement(payload) {
  const res = await fetch(`${API_BASE}/achievements/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to unlock achievement');
  return res.json();
}

export async function fetchAchievementsSummary() {
  const res = await fetch(`${API_BASE}/achievements/summary`);
  if (!res.ok) throw new Error('Failed to fetch achievements summary');
  return res.json();
}

// =========================================================================
// OmniSync: Time-Machine Save States & Cloud APIs
// =========================================================================

export async function fetchSaveSnapshots(gameId) {
  const res = await fetch(`${API_BASE}/saves/snapshots/${gameId}`);
  if (!res.ok) throw new Error('Failed to fetch save snapshots');
  return res.json();
}

export async function createSaveSnapshot(payload) {
  const res = await fetch(`${API_BASE}/saves/create-snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create save snapshot');
  return res.json();
}

export async function rollbackSaveSnapshot(payload) {
  const res = await fetch(`${API_BASE}/saves/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to rollback save snapshot');
  return res.json();
}

export async function fetchCloudStatus() {
  const res = await fetch(`${API_BASE}/saves/cloud-status`);
  if (!res.ok) throw new Error('Failed to fetch cloud sync status');
  return res.json();
}

export async function syncCloudSaves(payload = {}) {
  const res = await fetch(`${API_BASE}/saves/sync-cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to sync cloud saves');
  return res.json();
}

// =========================================================================
// Lossless ROM Compressor (CHD / RVZ) & M3U APIs
// =========================================================================

export async function fetchCompressorAudit() {
  const res = await fetch(`${API_BASE}/compressor/audit`);
  if (!res.ok) throw new Error('Failed to audit ROM compression');
  return res.json();
}

export async function convertRomFormat(payload) {
  const res = await fetch(`${API_BASE}/compressor/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to compress ROM');
  return res.json();
}

export async function buildM3UPlaylist(payload) {
  const res = await fetch(`${API_BASE}/compressor/build-m3u`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to build M3U playlist');
  return res.json();
}

// =========================================================================
// OmniNet: Couch P2P Netplay APIs
// =========================================================================

export async function fetchNetplayLobbies() {
  const res = await fetch(`${API_BASE}/netplay/lobbies`);
  if (!res.ok) throw new Error('Failed to fetch netplay lobbies');
  return res.json();
}

export async function createNetplayLobby(payload) {
  const res = await fetch(`${API_BASE}/netplay/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create netplay lobby');
  return res.json();
}

export async function joinNetplayLobby(payload) {
  const res = await fetch(`${API_BASE}/netplay/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to join netplay lobby');
  return res.json();
}

// =========================================================================
// OmniVault Mod & Romhack Storefront APIs
// =========================================================================

export async function fetchModsCatalog(category = null, platform = null) {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (platform) params.append('platform', platform);
  const res = await fetch(`${API_BASE}/mods/catalog?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch mods catalog');
  return res.json();
}

export async function fetchGameMods(gameId) {
  const res = await fetch(`${API_BASE}/mods/game/${gameId}`);
  if (!res.ok) throw new Error('Failed to fetch game mods');
  return res.json();
}

export async function toggleGameMod(modId, enabled) {
  const res = await fetch(`${API_BASE}/mods/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mod_id: modId, enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to toggle mod');
  }
  return res.json();
}

export async function uploadCustomPatch(formData) {
  const res = await fetch(`${API_BASE}/mods/upload-custom`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to upload custom patch');
  }
  return res.json();
}

export async function scrapeCommunityMods(query, platform = null) {
  const params = new URLSearchParams({ query });
  if (platform) params.append('platform', platform);
  const res = await fetch(`${API_BASE}/mods/scrape-community?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to scrape community patches');
  return res.json();
}

export async function autoInstallCommunityMod(payload) {
  const res = await fetch(`${API_BASE}/mods/auto-install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to auto-install patch');
  }
  return res.json();
}

export async function aiGenerateMod(payload) {
  const res = await fetch(`${API_BASE}/mods/ai-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to synthesize mod via AI');
  }
  return res.json();
}

export async function generateEmulatorPatches(payload) {
  const res = await fetch(`${API_BASE}/mods/generate-emulator-patches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate emulator patches');
  }
  return res.json();
}

export async function scanLocalCollection() {
  const res = await fetch(`${API_BASE}/scrape/scan-local-collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to scan and scrape local ROM collection');
  return res.json();
}

// ==========================================
// STORAGE & DIRECTORY CONFIGURATION API
// ==========================================

export async function fetchStorageConfig() {
  const res = await fetch(`${API_BASE}/storage/config`);
  if (!res.ok) throw new Error('Failed to fetch storage configuration');
  return res.json();
}

export async function saveStorageConfig(payload) {
  const res = await fetch(`${API_BASE}/storage/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save storage configuration');
  }
  return res.json();
}

export async function applyQuickSetup() {
  const res = await fetch(`${API_BASE}/storage/quick-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to apply quick setup');
  }
  return res.json();
}

export async function browseDirectory(defaultPath = null) {
  const res = await fetch(`${API_BASE}/storage/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_path: defaultPath }),
  });
  if (!res.ok) throw new Error('Failed to open directory browser');
  return res.json();
}

export async function revealStorageFolder(folder = 'roms', customPath = null) {
  const res = await fetch(`${API_BASE}/storage/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, path: customPath }),
  });
  if (!res.ok) throw new Error('Failed to reveal storage folder');
  return res.json();
}

export async function fetchStorageVolumes() {
  const res = await fetch(`${API_BASE}/storage/volumes`);
  if (!res.ok) throw new Error('Failed to fetch available storage volumes');
  return res.json();
}







