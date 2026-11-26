const API_BASE = '/api';

export async function fetchGames(params = {}, signal = undefined) {
  const query = new URLSearchParams();
  if (params.platform && params.platform !== 'ALL') query.set('platform', params.platform);
  if (params.family && params.family !== 'ALL') query.set('family', params.family);
  if (params.genre && params.genre !== 'ALL') query.set('genre', params.genre);
  if (params.developer && params.developer !== 'ALL') query.set('developer', params.developer);
  if (params.publisher && params.publisher !== 'ALL') query.set('publisher', params.publisher);
  if (params.esrb && params.esrb !== 'ALL') query.set('esrb', params.esrb);
  if (params.players && params.players !== 'ALL') query.set('players', params.players);
  if (params.coop) query.set('coop', 'true');
  if (params.decade && params.decade !== 'ALL') query.set('decade', String(params.decade));
  if (params.year) query.set('year', String(params.year));
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', params.page);
  if (params.pageSize) query.set('page_size', params.pageSize);
  if (params.featured_only) query.set('featured_only', 'true');
  if (params.favorites_only) query.set('favorites_only', 'true');

  const res = await fetch(`${API_BASE}/games?${query.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error('Failed to fetch games');
  return res.json();
}

export async function fetchGame(id) {
  const res = await fetch(`${API_BASE}/games/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch game details');
  return res.json();
}
export const fetchGameById = fetchGame;

export async function fetchPlatforms() {
  const res = await fetch(`${API_BASE}/games/meta/platforms`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch platforms');
  return res.json();
}

export async function fetchConsoleFamilies() {
  const res = await fetch(`${API_BASE}/games/meta/families`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch console families');
  return res.json();
}

export async function fetchGenres(platform = 'ALL', family = 'ALL', signal = undefined) {
  const query = new URLSearchParams();
  if (platform && platform !== 'ALL') query.set('platform', platform);
  if (family && family !== 'ALL') query.set('family', family);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/games/meta/genres${qStr}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error('Failed to fetch genres');
  return res.json();
}

export async function fetchCatalogFilters(platform = 'ALL', family = 'ALL', signal = undefined) {
  const query = new URLSearchParams();
  if (platform && platform !== 'ALL') query.set('platform', platform);
  if (family && family !== 'ALL') query.set('family', family);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/games/meta/filters${qStr}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error('Failed to fetch catalog filter facets');
  return res.json();
}

export async function setGameSource(gameId, payload) {
  const res = await fetch(`${API_BASE}/games/${gameId}/set-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save custom source link');
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
  if (!res.ok) throw new Error('Failed to import game to catalog');
  return res.json();
}

export async function scanLocalCollection() {
  const res = await fetch(`${API_BASE}/scrape/scan-local-collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to scan local ROM collection');
  return res.json();
}

export async function fetchDownloads() {
  const res = await fetch(`${API_BASE}/downloads`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch downloads');
  return res.json();
}

export async function fetchInstalledGames(refresh = false) {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`${API_BASE}/downloads/installed${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch downloaded ROMs');
  return res.json();
}

export async function deleteInstalledGame(path) {
  const res = await fetch(`${API_BASE}/downloads/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to delete file');
  return res.json();
}

export async function startDownload(
  gameId,
  type = 'direct',
  directUrl = null,
  filename = null,
  destinationTarget = null
) {
  const payload = { game_id: gameId, type };
  if (directUrl) payload.direct_url = directUrl;
  if (filename) payload.filename = filename;
  if (destinationTarget) payload.destination_target = destinationTarget;
  const res = await fetch(`${API_BASE}/downloads/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to start download');
  }
  return res.json();
}

export async function revealInFinder(downloadId) {
  const res = await fetch(`${API_BASE}/downloads/${downloadId}/open`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reveal file in Finder');
  return res.json();
}

export async function revealLocalPath(path) {
  const res = await fetch(`${API_BASE}/downloads/open-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to reveal path in Finder');
  return res.json();
}

export async function cancelDownload(downloadId) {
  const res = await fetch(`${API_BASE}/downloads/${downloadId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to cancel download');
  return res.json();
}

export async function moveQueuedDownload(downloadId, direction = 'up') {
  const res = await fetch(`${API_BASE}/downloads/${downloadId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  if (!res.ok) throw new Error('Failed to reorder download queue');
  return res.json();
}

export async function pauseDownloadQueue() {
  const res = await fetch(`${API_BASE}/downloads/queue/pause`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to pause queue');
  return res.json();
}

export async function resumeDownloadQueue() {
  const res = await fetch(`${API_BASE}/downloads/queue/resume`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resume queue');
  return res.json();
}

export async function clearCompletedDownloads() {
  const res = await fetch(`${API_BASE}/downloads/clear-completed`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear finished downloads');
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

export async function fetchRealDebridConfig() {
  const res = await fetch(`${API_BASE}/providers/realdebrid`);
  if (!res.ok) throw new Error('Failed to fetch Real-Debrid config');
  return res.json();
}

export async function saveRealDebridConfig(payload) {
  const res = await fetch(`${API_BASE}/providers/realdebrid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to validate Real-Debrid token');
  }
  return res.json();
}

export async function testRealDebridConnection(apiKey = '') {
  const res = await fetch(`${API_BASE}/providers/realdebrid/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) throw new Error('Failed to test Real-Debrid token');
  return res.json();
}

export async function fetchTheGamesDbConfig() {
  const res = await fetch(`${API_BASE}/providers/thegamesdb`);
  if (!res.ok) throw new Error('Failed to fetch TheGamesDB config');
  return res.json();
}

export async function saveTheGamesDbConfig(payload) {
  const res = await fetch(`${API_BASE}/providers/thegamesdb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save TheGamesDB config');
  return res.json();
}

export async function testTheGamesDbKey(apiKey = '') {
  const res = await fetch(`${API_BASE}/providers/thegamesdb/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) throw new Error('Failed to test TheGamesDB key');
  return res.json();
}

export async function syncTheGamesDbPlatform(platform = 'Switch2', maxPages = 3, startPage = 1) {
  const res = await fetch(`${API_BASE}/providers/thegamesdb/sync-platform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, max_pages: maxPages, start_page: startPage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to sync platform from TheGamesDB');
  }
  return res.json();
}

export async function syncAllTheGamesDbPlatforms(scope = 'all', pagesPerPlatform = 1, useStaticDump = true) {
  const res = await fetch(`${API_BASE}/providers/thegamesdb/sync-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope,
      pages_per_platform: pagesPerPlatform,
      use_static_dump: useStaticDump,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to sync platforms from TheGamesDB');
  }
  return res.json();
}

export async function enrichGameTheGamesDb(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/enrich-tgdb`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to refresh metadata from TheGamesDB');
  }
  return res.json();
}

export async function getGameVideos(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}/videos`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load game videos');
  }
  return res.json();
}

// =========================================================================
// Multi-Source ROM Mirror & Scraper Network APIs (BYOS)
// =========================================================================

export async function fetchMirrorSources(ping = true) {
  const res = await fetch(`${API_BASE}/mirrors/sources?ping=${ping ? 'true' : 'false'}`);
  if (!res.ok) throw new Error('Failed to fetch mirror sources');
  return res.json();
}

export async function addMirrorSource(payload) {
  const res = await fetch(`${API_BASE}/mirrors/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save mirror source');
  }
  return res.json();
}

export async function deleteMirrorSource(sourceId) {
  const res = await fetch(`${API_BASE}/mirrors/sources/${sourceId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete mirror source');
  return res.json();
}

export async function toggleMirrorSource(sourceId) {
  const res = await fetch(`${API_BASE}/mirrors/sources/${sourceId}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to toggle mirror source');
  return res.json();
}

export async function importSourcePack(pack) {
  const res = await fetch(`${API_BASE}/mirrors/import-pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import source pack');
  }
  return res.json();
}

export async function exportSourcePack() {
  const res = await fetch(`${API_BASE}/mirrors/export-pack`);
  if (!res.ok) throw new Error('Failed to export source pack');
  return res.json();
}

export async function searchMirrors(query, platform = null, sourceId = null, strict = false) {
  const res = await fetch(`${API_BASE}/mirrors/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, platform, source_id: sourceId, strict }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Multi-source mirror search failed');
  }
  return res.json();
}

export async function getGameMirrors(gameId, sourceId = null) {
  const qs = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : '';
  const res = await fetch(`${API_BASE}/games/${gameId}/mirrors${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch game mirrors');
  }
  return res.json();
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

export async function testAllSources() {
  const res = await fetch(`${API_BASE}/mirrors/test-all`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to test all sources');
  }
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to compress ROM');
  }
  return res.json();
}

export async function buildM3UPlaylist(payload) {
  const res = await fetch(`${API_BASE}/compressor/build-m3u`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to build M3U playlist');
  }
  return res.json();
}

// =========================================================================
// Storage, Setup & Directory Configuration APIs
// =========================================================================

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

export async function fetchSetupStatus() {
  const res = await fetch(`${API_BASE}/storage/setup-status`);
  if (!res.ok) throw new Error('Failed to fetch setup status');
  return res.json();
}

export async function completeSetup(payload = {}) {
  const res = await fetch(`${API_BASE}/storage/complete-setup`, {
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

export async function fetchCloudTargets() {
  const res = await fetch(`${API_BASE}/storage/cloud-targets`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch cloud storage targets');
  return res.json();
}

export async function saveCloudTargets(payload) {
  const res = await fetch(`${API_BASE}/storage/cloud-targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save cloud storage settings');
  }
  return res.json();
}

export async function testCloudTarget(payload) {
  const res = await fetch(`${API_BASE}/storage/cloud-targets/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to test cloud target');
  return res.json();
}

export async function startCloudOAuth(payload) {
  const res = await fetch(`${API_BASE}/storage/cloud-oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to start cloud sign-in');
  }
  return res.json();
}

export async function openCloudSystemSignIn(payload) {
  const res = await fetch(`${API_BASE}/storage/cloud-signin-system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to open cloud sign-in');
  }
  return res.json();
}
