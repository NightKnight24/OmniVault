import React, { useState, useEffect, useRef } from 'react';
import {
  X, Sliders, Radio, Plus, Trash2, Check, AlertCircle,
  ExternalLink, Globe, RefreshCw, Power, ShieldCheck,
  FolderOpen, HardDrive, Sparkles, Disc, Database, Zap,
  Upload, Download, Server, Image as ImageIcon, Activity, Unlock, Cloud, Lock
} from 'lucide-react';
import {
  fetchProviders, addProvider, deleteProvider, toggleProvider, testProviderConnection,
  fetchMirrorSources, addMirrorSource, deleteMirrorSource, toggleMirrorSource,
  importSourcePack, exportSourcePack, testAllSources,
  fetchSearchTemplates, addSearchTemplate, deleteSearchTemplate,
  fetchRealDebridConfig, saveRealDebridConfig, testRealDebridConnection,
  fetchTheGamesDbConfig, saveTheGamesDbConfig, testTheGamesDbKey,
  syncTheGamesDbPlatform, syncAllTheGamesDbPlatforms,
  fetchStorageConfig, saveStorageConfig, applyQuickSetup,
  browseDirectory, revealStorageFolder,
  fetchCloudTargets, saveCloudTargets, testCloudTarget,
  startCloudOAuth, openCloudSystemSignIn,
  startCloudRcloneSignIn, fetchCloudRcloneStatus
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

const TGDB_SYNC_PLATFORMS = [
  { id: 'Switch2', label: 'Nintendo Switch 2' },
  { id: 'Switch', label: 'Nintendo Switch' },
  { id: 'PS5', label: 'PlayStation 5' },
  { id: 'XboxSeriesX', label: 'Xbox Series X/S' },
  { id: 'XboxOne', label: 'Xbox One' },
  { id: 'Windows', label: 'Windows (PC)' },
  { id: 'macOS', label: 'macOS' },
  { id: 'PS4', label: 'PlayStation 4' },
  { id: 'PS3', label: 'PlayStation 3' },
  { id: '3DS', label: 'Nintendo 3DS' },
  { id: 'PSVita', label: 'PlayStation Vita' },
  { id: 'WiiU', label: 'Nintendo Wii U' },
  { id: 'Xbox360', label: 'Xbox 360' },
  { id: 'Xbox', label: 'Microsoft Xbox' },
  { id: 'GameCube', label: 'Nintendo GameCube' },
  { id: 'Wii', label: 'Nintendo Wii' },
  { id: 'PS2', label: 'PlayStation 2' },
  { id: 'PS1', label: 'PlayStation 1' },
  { id: 'PSP', label: 'PlayStation Portable' },
  { id: 'NDS', label: 'Nintendo DS' },
  { id: 'N64', label: 'Nintendo 64' },
  { id: 'SNES', label: 'Super Nintendo (SNES)' },
  { id: 'NES', label: 'Nintendo Entertainment System (NES)' },
  { id: 'GBA', label: 'Game Boy Advance (GBA)' },
  { id: 'Dreamcast', label: 'Sega Dreamcast' },
  { id: 'Saturn', label: 'Sega Saturn' },
  { id: 'Genesis', label: 'Sega Genesis' },
];

export default function UnifiedSettingsModal({
  isOpen,
  onClose,
  onOpenSetupWizard,
  totalGames = 0,
  onSourcesChanged,
  onCatalogUpdated,
}) {
  // Tab state: 'storage' | 'torznab' | 'templates'
  const [activeTab, setActiveTab] = useState('storage');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Providers & Templates State
  const [providers, setProviders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState('torznab');
  const [provUrl, setProvUrl] = useState('');
  const [provKey, setProvKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [formError, setFormError] = useState(null);

  // BYOS Mirror Sources & Pack Import/Export State
  const [mirrorSources, setMirrorSources] = useState([]);
  const [mirName, setMirName] = useState('');
  const [mirUrl, setMirUrl] = useState('');
  const [mirAdapter, setMirAdapter] = useState('wp_hoster');
  const [mirPlatforms, setMirPlatforms] = useState('ALL');
  const [mirSearchTemplate, setMirSearchTemplate] = useState('');
  const [mirFormError, setMirFormError] = useState(null);
  const [packText, setPackText] = useState('');
  const [packStatus, setPackStatus] = useState(null);
  const [importingPack, setImportingPack] = useState(false);
  const packFileRef = useRef(null);

  const [tplName, setTplName] = useState('');
  const [tplUrl, setTplUrl] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplError, setTplError] = useState(null);

  // TheGamesDB State
  const [tgdbConfig, setTgdbConfig] = useState({
    enabled: true,
    using_custom_key: false,
    has_custom_key: false,
    masked_custom_key: '',
    using_default_key: true,
    remaining_allowance: null,
  });
  const [tgdbCustomKey, setTgdbCustomKey] = useState('');
  const [tgdbEnabled, setTgdbEnabled] = useState(true);
  const [tgdbTesting, setTgdbTesting] = useState(false);
  const [tgdbTestResult, setTgdbTestResult] = useState(null);
  const [tgdbSaving, setTgdbSaving] = useState(false);
  const [tgdbSyncPlatform, setTgdbSyncPlatform] = useState('Switch2');
  const [tgdbSyncPages, setTgdbSyncPages] = useState(3);
  const [tgdbSyncing, setTgdbSyncing] = useState(false);
  const [tgdbSyncResult, setTgdbSyncResult] = useState(null);
  const [tgdbBatchScope, setTgdbBatchScope] = useState('all');
  const [tgdbBatchSyncing, setTgdbBatchSyncing] = useState(false);
  const [tgdbBatchResult, setTgdbBatchResult] = useState(null);

  // Source Health Check State
  const [testingAllSources, setTestingAllSources] = useState(false);
  const [sourceHealthSummary, setSourceHealthSummary] = useState(null);
  const [mirrorHealthMap, setMirrorHealthMap] = useState({});
  const [providerHealthMap, setProviderHealthMap] = useState({});

  // Real-Debrid State
  const [rdConfig, setRdConfig] = useState({
    enabled: false, has_key: false, masked_key: '', verified: false,
    username: '', account_type: '', days_left: 0, supported_hosts_count: 17,
  });
  const [rdApiKey, setRdApiKey] = useState('');
  const [rdEnabled, setRdEnabled] = useState(true);
  const [rdTesting, setRdTesting] = useState(false);
  const [rdTestResult, setRdTestResult] = useState(null);
  const [rdSaving, setRdSaving] = useState(false);

  // Storage & Downloads Folder State
  const [storageConfig, setStorageConfig] = useState(null);
  const [storageMode, setStorageMode] = useState('quick'); // 'quick' | 'custom'
  const [customPaths, setCustomPaths] = useState({
    dir_roms: '/Volumes/ROMS',
    dir_app_data: '/Volumes/ROMS/OmniVault-Data'
  });
  const [savingStorage, setSavingStorage] = useState(false);
  const [browsingField, setBrowsingField] = useState(null);

  // Cloud Storage Destinations State (iCloud Drive, Google Drive, OneDrive, WebDAV)
  const [cloudConfig, setCloudConfig] = useState({ default_target: 'local', targets: [] });
  const [cloudEdits, setCloudEdits] = useState({
    icloud: { custom_path: '', prefer_api: false, delete_local_after_upload: false, evict_local_after_sync: false },
    gdrive: { custom_path: '', prefer_api: false, delete_local_after_upload: true, evict_local_after_sync: false, rclone_remote: '', access_token: '', refresh_token: '', client_id: '' },
    onedrive: { custom_path: '', prefer_api: false, delete_local_after_upload: true, evict_local_after_sync: false, rclone_remote: '', access_token: '', refresh_token: '', client_id: '' },
    webdav: { webdav_url: '', username: '', password: '', base_path: '' },
  });
  const [expandedCloudApi, setExpandedCloudApi] = useState(null);
  const [testingCloudId, setTestingCloudId] = useState(null);
  const [cloudTestResults, setCloudTestResults] = useState({});
  const [savingCloudId, setSavingCloudId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadAllData();
    }
  }, [isOpen]);

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [provRes, mirRes, tplRes, storageRes, rdRes, tgdbRes, cloudRes] = await Promise.all([
        fetchProviders().catch(() => ({ providers: [] })),
        fetchMirrorSources(false).catch(() => ({ sources: [] })),
        fetchSearchTemplates().catch(() => ({ templates: [] })),
        fetchStorageConfig().catch(() => null),
        fetchRealDebridConfig().catch(() => null),
        fetchTheGamesDbConfig().catch(() => null),
        fetchCloudTargets().catch(() => null)
      ]);

      setProviders(provRes.providers || []);
      setMirrorSources(mirRes.sources || []);
      setTemplates(tplRes.templates || []);
      if (cloudRes) {
        setCloudConfig(cloudRes);
        const nextEdits = {};
        (cloudRes.targets || []).forEach((t) => {
          nextEdits[t.id] = {
            custom_path: t.custom_path || '',
            prefer_api: Boolean(t.prefer_api),
            delete_local_after_upload: Boolean(t.delete_local_after_upload),
            evict_local_after_sync: Boolean(t.evict_local_after_sync),
            rclone_remote: t.rclone_remote || '',
            access_token: '',
            refresh_token: '',
            client_id: t.client_id || '',
            client_secret: '',
            webdav_url: t.webdav_url || '',
            username: t.username || '',
            password: '',
            base_path: t.base_path || '',
          };
        });
        setCloudEdits((prev) => ({ ...prev, ...nextEdits }));
      }
      if (rdRes) {
        setRdConfig(rdRes);
        setRdEnabled(Boolean(rdRes.enabled || !rdRes.has_key));
      }
      if (tgdbRes) {
        setTgdbConfig(tgdbRes);
        setTgdbEnabled(Boolean(tgdbRes.enabled));
      }
      if (storageRes) {
        setStorageConfig(storageRes);
        setStorageMode(storageRes.mode || 'quick');
        setCustomPaths({
          dir_roms: storageRes.directories?.roms?.path || storageRes.quick_defaults?.dir_roms || '/Volumes/ROMS',
          dir_app_data: storageRes.directories?.app_data?.path || storageRes.quick_defaults?.dir_app_data || '/Volumes/ROMS/OmniVault-Data'
        });
      }
    } catch (err) {
      console.error('[UnifiedSettingsModal Error]:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFolder = async (fieldKey, currentPath) => {
    playClick();
    setBrowsingField(fieldKey);
    try {
      const res = await browseDirectory(currentPath);
      if (!res.canceled && res.path) {
        setCustomPaths(prev => ({
          ...prev,
          [fieldKey]: res.path
        }));
        playVictorySound();
        showToast(`Selected folder: ${res.path}`);
      }
    } catch (err) {
      console.error('[Browse Error]:', err);
    } finally {
      setBrowsingField(null);
    }
  };

  const handleApplyQuickSetup = async () => {
    playClick();
    setSavingStorage(true);
    try {
      const res = await applyQuickSetup();
      playVictorySound();
      setStorageConfig(res.config);
      setStorageMode('quick');
      setCustomPaths({
        dir_roms: res.config.directories?.roms?.path || '',
        dir_app_data: res.config.directories?.app_data?.path || '',
      });
      showToast('Quick Setup applied! Download & catalog folders provisioned.');
    } catch (err) {
      alert(`Could not apply quick setup: ${err.message}`);
    } finally {
      setSavingStorage(false);
    }
  };

  const handleSaveCustomStorage = async () => {
    playClick();
    setSavingStorage(true);
    try {
      const res = await saveStorageConfig({
        mode: 'custom',
        dir_roms: customPaths.dir_roms,
        dir_app_data: customPaths.dir_app_data,
      });
      playVictorySound();
      setStorageConfig(res.config);
      setStorageMode('custom');
      showToast('Custom directory paths saved and verified!');
    } catch (err) {
      alert(`Failed to save custom paths: ${err.message}`);
    } finally {
      setSavingStorage(false);
    }
  };

  const handleSelectVolumePreset = (volPath) => {
    playClick();
    setCustomPaths({
      dir_roms: volPath === '/Volumes/ROMS' ? '/Volumes/ROMS' : `${volPath}/ROMs`,
      dir_app_data: `${volPath}/OmniVault-Data`,
    });
    showToast(`Base drive set to: ${volPath}`);
  };

  const handleSetDefaultCloudTarget = async (targetId) => {
    playClick();
    setSavingCloudId(targetId);
    try {
      const res = await saveCloudTargets({ default_target: targetId });
      setCloudConfig({ default_target: res.default_target, targets: res.targets || [] });
      if (onSourcesChanged) onSourcesChanged();
      playVictorySound();
      const label = targetId === 'local' ? 'Local Drive' : (res.targets?.find((t) => t.id === targetId)?.name || targetId);
      showToast(`Default download destination set to ${label}!`);
    } catch (err) {
      alert(`Could not set default destination: ${err.message}`);
    } finally {
      setSavingCloudId(null);
    }
  };

  const handleBrowseCloudFolder = async (pid, currentPath) => {
    playClick();
    setBrowsingField(`cloud_${pid}`);
    try {
      const res = await browseDirectory(currentPath || null);
      if (!res.canceled && res.path) {
        const saved = await saveCloudTargets({ provider_id: pid, custom_path: res.path });
        setCloudConfig({ default_target: saved.default_target, targets: saved.targets || [] });
        setCloudEdits((prev) => ({
          ...prev,
          [pid]: { ...(prev[pid] || {}), custom_path: res.path },
        }));
        if (onSourcesChanged) onSourcesChanged();
        playVictorySound();
        showToast(`Cloud sync folder updated: ${res.path}`);
      }
    } catch (err) {
      alert(`Could not set cloud folder: ${err.message}`);
    } finally {
      setBrowsingField(null);
    }
  };

  const handleTestCloudTarget = async (pid) => {
    playClick();
    setTestingCloudId(pid);
    try {
      const edit = cloudEdits[pid] || {};
      const res = await testCloudTarget({
        provider_id: pid,
        custom_path: edit.custom_path,
        prefer_api: edit.prefer_api,
        rclone_remote: edit.rclone_remote,
        access_token: edit.access_token,
        refresh_token: edit.refresh_token,
        client_id: edit.client_id,
        webdav_url: edit.webdav_url,
        username: edit.username,
        password: edit.password,
        base_path: edit.base_path,
      });
      setCloudTestResults((prev) => ({ ...prev, [pid]: res }));
      if (res.status === 'ok') playVictorySound();
    } catch (err) {
      setCloudTestResults((prev) => ({ ...prev, [pid]: { status: 'error', message: err.message } }));
    } finally {
      setTestingCloudId(null);
    }
  };

  const [oauthWaitingId, setOauthWaitingId] = useState(null);
  const [oauthWaitingMode, setOauthWaitingMode] = useState('any');

  useEffect(() => {
    if (!isOpen || !oauthWaitingId) return undefined;
    const poll = setInterval(async () => {
      try {
        const [res, rcloneSt] = await Promise.all([
          fetchCloudTargets(),
          oauthWaitingMode === 'api' ? fetchCloudRcloneStatus(oauthWaitingId).catch(() => null) : Promise.resolve(null),
        ]);
        if (rcloneSt && rcloneSt.status === 'error') {
          const failedId = oauthWaitingId;
          setOauthWaitingId(null);
          setCloudTestResults((prev) => ({
            ...prev,
            [failedId]: { status: 'error', message: rcloneSt.message || 'Sign-in did not complete.' },
          }));
          return;
        }
        if (!res) return;
        setCloudConfig(res);
        const target = (res.targets || []).find((t) => t.id === oauthWaitingId);
        const ready = target && (oauthWaitingMode === 'api'
          ? (target.mode === 'api' && target.zero_local_disk)
          : target.available);
        if (ready) {
          setOauthWaitingId(null);
          setCloudEdits((prev) => ({
            ...prev,
            [target.id]: {
              ...(prev[target.id] || {}),
              prefer_api: Boolean(target.prefer_api),
              rclone_remote: target.rclone_remote || '',
            },
          }));
          setCloudTestResults((prev) => ({
            ...prev,
            [target.id]: {
              status: 'ok',
              message: target.mode === 'api'
                ? `${target.name} connected (${target.account || 'Direct Stream'}) • 0 Local Disk Stream active!`
                : `${target.name} connected!`,
            },
          }));
          playVictorySound();
          showToast(`${target.name} signed in & connected!`);
          if (onSourcesChanged) onSourcesChanged();
        }
      } catch {
        // ignore poll error
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [isOpen, oauthWaitingId, oauthWaitingMode, onSourcesChanged]);

  const handleCloudSystemSignIn = async (pid) => {
    playClick();
    try {
      const res = await openCloudSystemSignIn({ provider_id: pid });
      setOauthWaitingMode('any');
      setOauthWaitingId(pid);
      setCloudTestResults((prev) => ({ ...prev, [pid]: { status: 'ok', message: res.message } }));
      showToast(res.message || 'Opened cloud sign-in window...');
    } catch (err) {
      setCloudTestResults((prev) => ({ ...prev, [pid]: { status: 'error', message: err.message } }));
    }
  };

  const handleCloudRcloneSignIn = async (target) => {
    playClick();
    const pid = target.id;
    try {
      const res = await startCloudRcloneSignIn({ provider_id: pid });
      setOauthWaitingMode('api');
      setOauthWaitingId(pid);
      setCloudTestResults((prev) => ({
        ...prev,
        [pid]: {
          status: 'ok',
          message: res.message || `Chrome opened — sign in to ${target.name} & click Allow for 0-Disk streaming!`,
        },
      }));
      showToast(`Browser opened for 1-Click 0-Disk ${target.name} Sign-In...`);
    } catch (err) {
      setExpandedCloudApi(pid);
      setCloudTestResults((prev) => ({ ...prev, [pid]: { status: 'error', message: err.message } }));
    }
  };

  const handleCloudBrowserSignIn = async (target) => {
    playClick();
    const pid = target.id;
    const edit = cloudEdits[pid] || {};
    const hasClientId = Boolean(target.has_oauth_client_id || edit.client_id?.trim());
    const hasClientSecret = pid !== 'gdrive' || Boolean(target.has_oauth_client_secret || edit.client_secret?.trim());
    if (!hasClientId || !hasClientSecret) {
      setExpandedCloudApi(pid);
      const msg = "For zero developer console setup, click '1-Click 0-Disk Sign-In' (via rclone). Or enter your own custom OAuth Client ID below for direct PKCE Browser Sign-In.";
      setCloudTestResults((prev) => ({
        ...prev,
        [pid]: {
          status: 'info',
          message: msg,
        },
      }));
      return;
    }
    try {
      const res = await startCloudOAuth({
        provider_id: pid,
        client_id: edit.client_id?.trim() || undefined,
        client_secret: edit.client_secret?.trim() || undefined,
      });
      setOauthWaitingMode('api');
      setOauthWaitingId(pid);
      setCloudTestResults((prev) => ({
        ...prev,
        [pid]: { status: 'ok', message: res.message || 'Browser opened — click Allow to finish connecting!' },
      }));
      showToast('Sign in & click Allow in your browser...');
    } catch (err) {
      setExpandedCloudApi(pid);
      setCloudTestResults((prev) => ({ ...prev, [pid]: { status: 'error', message: err.message } }));
    }
  };

  const handleSaveCloudProvider = async (pid, clearToken = false) => {
    playClick();
    setSavingCloudId(pid);
    try {
      const edit = cloudEdits[pid] || {};
      const payload = pid === 'webdav'
        ? {
            provider_id: 'webdav',
            webdav_url: edit.webdav_url || '',
            username: edit.username || '',
            password: edit.password || '',
            base_path: edit.base_path || '',
            clear_token: clearToken,
          }
        : {
            provider_id: pid,
            custom_path: edit.custom_path || '',
            prefer_api: Boolean(edit.prefer_api),
            delete_local_after_upload: Boolean(edit.delete_local_after_upload),
            evict_local_after_sync: Boolean(edit.evict_local_after_sync),
            rclone_remote: edit.rclone_remote?.trim() || '',
            client_id: edit.client_id?.trim() || '',
            client_secret: edit.client_secret?.trim() || '',
            clear_token: clearToken,
          };
      if (!clearToken && pid !== 'webdav') {
        if (edit.access_token?.trim()) payload.access_token = edit.access_token.trim();
        if (edit.refresh_token?.trim()) payload.refresh_token = edit.refresh_token.trim();
      }
      const res = await saveCloudTargets(payload);
      setCloudConfig({ default_target: res.default_target, targets: res.targets || [] });
      setCloudEdits((prev) => ({
        ...prev,
        [pid]: { ...(prev[pid] || {}), access_token: '', refresh_token: '', client_secret: '', password: '' },
      }));
      if (onSourcesChanged) onSourcesChanged();
      playVictorySound();
      showToast(clearToken ? 'Disconnected cloud account.' : 'Cloud drive settings saved!');
    } catch (err) {
      alert(`Failed to save cloud drive settings: ${err.message}`);
    } finally {
      setSavingCloudId(null);
    }
  };

  const handleTestConnection = async () => {
    if (!provUrl.trim()) {
      setFormError('Please enter a feed or Torznab Endpoint URL first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setFormError(null);
    try {
      const res = await testProviderConnection({
        name: provName || 'Test Provider',
        type: provType,
        endpoint_url: provUrl.trim(),
        api_key: provKey.trim()
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ status: 'error', message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleAddProvider = async (e) => {
    e.preventDefault();
    if (!provName.trim() || !provUrl.trim()) {
      setFormError('Name and Endpoint URL are required');
      return;
    }
    try {
      await addProvider({
        name: provName.trim(),
        endpoint_url: provUrl.trim(),
        api_key: provKey.trim(),
        type: provType
      });
      setProvName('');
      setProvUrl('');
      setProvKey('');
      setTestResult(null);
      setFormError(null);
      const res = await fetchProviders();
      setProviders(res.providers || []);
      if (onSourcesChanged) onSourcesChanged();
      showToast('Indexer feed added successfully!');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteProvider = async (id) => {
    try {
      await deleteProvider(id);
      setProviders(prev => prev.filter(p => p.id !== id));
      if (onSourcesChanged) onSourcesChanged();
      showToast('Provider removed');
    } catch (err) {
      alert(`Could not delete provider: ${err.message}`);
    }
  };

  const handleToggleProvider = async (id) => {
    try {
      const res = await toggleProvider(id);
      setProviders(prev => prev.map(p => p.id === id ? { ...p, is_enabled: res.is_enabled } : p));
      if (onSourcesChanged) onSourcesChanged();
    } catch (err) {
      alert(`Could not toggle provider: ${err.message}`);
    }
  };

  const handleAddMirrorSource = async (e) => {
    e.preventDefault();
    setMirFormError(null);
    if (!mirName.trim() || !mirUrl.trim()) {
      setMirFormError('Source Name and Base URL are required');
      return;
    }
    try {
      await addMirrorSource({
        name: mirName.trim(),
        url: mirUrl.trim(),
        adapter: mirAdapter,
        platforms: mirPlatforms.split(',').map(s => s.trim()).filter(Boolean),
        search_template: mirSearchTemplate.trim(),
      });
      setMirName('');
      setMirUrl('');
      setMirSearchTemplate('');
      const res = await fetchMirrorSources(false);
      setMirrorSources(res.sources || []);
      if (onSourcesChanged) onSourcesChanged();
      playVictorySound();
      showToast('BYOS mirror source saved!');
    } catch (err) {
      setMirFormError(err.message);
    }
  };

  const handleDeleteMirrorSource = async (id) => {
    try {
      await deleteMirrorSource(id);
      setMirrorSources(prev => prev.filter(s => s.id !== id));
      if (onSourcesChanged) onSourcesChanged();
      showToast('Mirror source removed');
    } catch (err) {
      alert(`Could not delete mirror source: ${err.message}`);
    }
  };

  const handleToggleMirrorSource = async (id) => {
    try {
      const res = await toggleMirrorSource(id);
      setMirrorSources(prev => prev.map(s => s.id === id ? { ...s, is_enabled: res.is_enabled } : s));
      if (onSourcesChanged) onSourcesChanged();
    } catch (err) {
      alert(`Could not toggle mirror source: ${err.message}`);
    }
  };

  const handleImportPack = async () => {
    if (!packText.trim()) {
      setPackStatus({ status: 'error', message: 'Paste a JSON Source Pack or load a .json file first.' });
      return;
    }
    setImportingPack(true);
    setPackStatus(null);
    try {
      const parsed = JSON.parse(packText);
      const res = await importSourcePack(parsed);
      const [mirRes, provRes, tplRes] = await Promise.all([
        fetchMirrorSources(false),
        fetchProviders(),
        fetchSearchTemplates(),
      ]);
      setMirrorSources(mirRes.sources || []);
      setProviders(provRes.providers || []);
      setTemplates(tplRes.templates || []);
      if (onSourcesChanged) onSourcesChanged();
      playVictorySound();
      const summary = `Imported ${res.imported_mirrors} mirrors, ${res.imported_providers} indexers, ${res.imported_templates} templates.`;
      setPackStatus({ status: 'ok', message: summary });
      showToast(summary);
    } catch (err) {
      setPackStatus({ status: 'error', message: `Import failed: ${err.message}` });
    } finally {
      setImportingPack(false);
    }
  };

  const handleLoadPackFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPackText(String(reader.result || ''));
      setPackStatus({ status: 'ok', message: `Loaded ${file.name} — click Import Pack to apply.` });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportPack = async () => {
    try {
      const pack = await exportSourcePack();
      const formatted = JSON.stringify(pack, null, 2);
      setPackText(formatted);
      try {
        const blob = new Blob([formatted], { type: 'application/json' });
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = 'omnivault-sources.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
      } catch {
        // ignore in webviews that block blob downloads; JSON is still loaded into editor
      }
      setPackStatus({ status: 'ok', message: 'Current BYOS configuration loaded into editor & exported.' });
      showToast('Source pack exported!');
    } catch (err) {
      setPackStatus({ status: 'error', message: err.message });
    }
  };

  const handleTestTheGamesDb = async () => {
    setTgdbTesting(true);
    setTgdbTestResult(null);
    try {
      const res = await testTheGamesDbKey(tgdbCustomKey.trim());
      setTgdbTestResult(res);
      const updated = await fetchTheGamesDbConfig().catch(() => null);
      if (updated) setTgdbConfig(updated);
    } catch (err) {
      setTgdbTestResult({ status: 'error', message: err.message });
    } finally {
      setTgdbTesting(false);
    }
  };

  const handleSaveTheGamesDb = async (e, clearCustom = false) => {
    if (e) e.preventDefault();
    setTgdbSaving(true);
    try {
      const payload = { enabled: tgdbEnabled, clear_custom_key: clearCustom };
      if (!clearCustom && tgdbCustomKey.trim()) payload.api_key = tgdbCustomKey.trim();
      const updated = await saveTheGamesDbConfig(payload);
      setTgdbConfig(updated);
      setTgdbEnabled(Boolean(updated.enabled));
      setTgdbCustomKey('');
      playVictorySound();
      showToast(clearCustom ? 'Reverted to shared public TheGamesDB key.' : 'TheGamesDB settings saved!');
    } catch (err) {
      alert(`Failed to save TheGamesDB settings: ${err.message}`);
    } finally {
      setTgdbSaving(false);
    }
  };

  const handleSyncTheGamesDb = async () => {
    setTgdbSyncing(true);
    setTgdbSyncResult(null);
    try {
      const res = await syncTheGamesDbPlatform(tgdbSyncPlatform, tgdbSyncPages, 1);
      setTgdbSyncResult({
        status: 'ok',
        message: `${res.platform_name}: +${res.imported} new, ${res.updated} updated (${res.remaining_monthly_allowance ?? '?'} calls remaining)`,
      });
      const updated = await fetchTheGamesDbConfig().catch(() => null);
      if (updated) setTgdbConfig(updated);
      if (onCatalogUpdated) onCatalogUpdated();
      playVictorySound();
      showToast(`Synced ${res.platform_name} catalog from TheGamesDB!`);
    } catch (err) {
      setTgdbSyncResult({ status: 'error', message: err.message });
    } finally {
      setTgdbSyncing(false);
    }
  };

  const handleSyncAllTheGamesDb = async () => {
    setTgdbBatchSyncing(true);
    setTgdbBatchResult(null);
    try {
      const res = await syncAllTheGamesDbPlatforms(tgdbBatchScope, 1, true);
      const isStatic = res.source === 'thegamesdb_static_dump';
      const quotaNote = isStatic
        ? '0 API calls used'
        : `${res.remaining_monthly_allowance ?? '?'} calls left`;
      setTgdbBatchResult({
        status: 'ok',
        message: `Synced ${res.platforms_synced}/${res.total_platforms_targeted} systems: +${(res.total_imported || 0).toLocaleString()} new, ${(res.total_updated || 0).toLocaleString()} updated (${quotaNote}) • New Catalog Total: ${(res.total_catalog_games || 0).toLocaleString()} titles${res.stopped_early ? ' — paused early to preserve quota' : ''}`,
      });
      const updated = await fetchTheGamesDbConfig().catch(() => null);
      if (updated) setTgdbConfig(updated);
      if (onCatalogUpdated) onCatalogUpdated();
      playVictorySound();
      showToast(`Catalog synced: ${(res.total_catalog_games || 0).toLocaleString()} total titles!`);
    } catch (err) {
      setTgdbBatchResult({ status: 'error', message: err.message });
    } finally {
      setTgdbBatchSyncing(false);
    }
  };

  const handleTestAllSources = async () => {
    setTestingAllSources(true);
    try {
      const res = await testAllSources();
      setSourceHealthSummary(res.summary || null);
      const mMap = {};
      (res.mirrors || []).forEach((m) => {
        if (m?.source_id) mMap[m.source_id] = m;
      });
      setMirrorHealthMap(mMap);
      const pMap = {};
      (res.providers || []).forEach((p) => {
        if (p?.id) pMap[p.id] = p;
      });
      setProviderHealthMap(pMap);
      if (res.thegamesdb && res.thegamesdb.status !== 'disabled') {
        setTgdbTestResult(res.thegamesdb);
      }
      if (res.realdebrid && !['unconfigured', 'disabled'].includes(res.realdebrid.status)) {
        setRdTestResult(res.realdebrid);
      }
      const updatedRd = await fetchRealDebridConfig().catch(() => null);
      if (updatedRd) setRdConfig(updatedRd);
      playVictorySound();
      if (res.summary) {
        showToast(`Tested ${res.summary.total} sources: ${res.summary.online} online, ${res.summary.offline} offline`);
      }
    } catch (err) {
      showToast(`Source health check failed: ${err.message}`);
    } finally {
      setTestingAllSources(false);
    }
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    if (!tplName.trim() || !tplUrl.trim()) {
      setTplError('Name and URL Template are required');
      return;
    }
    if (!tplUrl.includes('{title}')) {
      setTplError("URL Template must include '{title}' variable placeholder");
      return;
    }
    try {
      await addSearchTemplate({
        name: tplName.trim(),
        url_template: tplUrl.trim(),
        description: tplDesc.trim()
      });
      setTplName('');
      setTplUrl('');
      setTplDesc('');
      setTplError(null);
      const res = await fetchSearchTemplates();
      setTemplates(res.templates || []);
      showToast('Template added!');
    } catch (err) {
      setTplError(err.message);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await deleteSearchTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      showToast('Template removed');
    } catch (err) {
      alert(`Could not delete template: ${err.message}`);
    }
  };

  const handleTestRealDebrid = async () => {
    setRdTesting(true);
    setRdTestResult(null);
    try {
      const res = await testRealDebridConnection(rdApiKey.trim());
      setRdTestResult(res);
    } catch (err) {
      setRdTestResult({ status: 'error', message: err.message });
    } finally {
      setRdTesting(false);
    }
  };

  const handleSaveRealDebrid = async (e) => {
    e.preventDefault();
    setRdSaving(true);
    setRdTestResult(null);
    try {
      const payload = { enabled: rdEnabled };
      if (rdApiKey.trim()) payload.api_key = rdApiKey.trim();
      const updated = await saveRealDebridConfig(payload);
      setRdConfig(updated);
      setRdEnabled(Boolean(updated.enabled));
      setRdApiKey('');
      setRdTestResult({
        status: 'ok',
        message: updated.enabled
          ? `Real-Debrid verified & unlocked (${updated.supported_hosts_count || 280}+ hosters active)!`
          : 'Real-Debrid disabled.',
      });
      if (onSourcesChanged) onSourcesChanged();
      playVictorySound();
      showToast(updated.enabled ? 'Real-Debrid verified & unlocked!' : 'Real-Debrid disabled');
    } catch (err) {
      setRdTestResult({ status: 'error', message: err.message });
    } finally {
      setRdSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-4xl bg-[#0b101b] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] text-slate-200">

        {/* Toast Notification */}
        {feedbackMsg && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-white/10 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/40 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-black text-white text-base sm:text-lg tracking-wide">
                  OmniVault Settings
                </h3>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Finder & Downloader
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Download folders, Torznab/Prowlarr indexers & custom web search templates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenSetupWizard && (
              <button
                onClick={() => { onClose(); onOpenSetupWizard(); }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-cyan-300 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Setup Wizard</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-white/10 flex items-center gap-1.5 bg-slate-950/60 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => { playClick(); setActiveTab('storage'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'storage'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage & Downloads</span>
          </button>

          <button
            onClick={() => { playClick(); setActiveTab('torznab'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'torznab'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Sources &amp; APIs</span>
          </button>

          <button
            onClick={() => { playClick(); setActiveTab('templates'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-violet-400 text-violet-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web Search Templates</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading settings...</div>
          ) : (
            <>
              {/* TAB 1: STORAGE & DOWNLOADS */}
              {activeTab === 'storage' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-slate-900 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-black text-white flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-cyan-400" />
                        <span>Download Destination & Catalog Storage</span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        Choose where downloaded ROM archives are saved and where OmniVault stores its metadata database and cover cache.
                      </p>
                    </div>

                    <div className="flex items-center p-1 rounded-xl bg-black/60 border border-white/10 shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => { playClick(); setStorageMode('quick'); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          storageMode === 'quick'
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Quick Setup</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClick(); setStorageMode('custom'); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          storageMode === 'custom'
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Custom Folders</span>
                      </button>
                    </div>
                  </div>

                  {storageMode === 'quick' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-mono text-cyan-400">AUTO-DETECTED PRESET</div>
                          <div className="text-sm font-bold text-white mt-0.5">
                            {storageConfig?.quick_defaults?.preset_label || 'Auto-Detected Storage'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyQuickSetup}
                          disabled={savingStorage}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${savingStorage ? 'animate-spin' : ''}`} />
                          <span>{savingStorage ? 'Applying...' : 'Apply Quick Defaults'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-white">
                              <Disc className="w-4 h-4 text-emerald-400" />
                              <span>ROMs / Downloads Folder</span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                              {storageConfig?.directories?.roms?.free_gb || 0} GB Free
                            </span>
                          </div>
                          <div className="mt-2 p-2.5 rounded-xl bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate">
                            {storageConfig?.directories?.roms?.path || customPaths.dir_roms}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Per-console folders (SNES, PS1, PS2...)</span>
                            <button
                              type="button"
                              onClick={() => revealStorageFolder('roms')}
                              className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                            >
                              <FolderOpen className="w-3 h-3" /> Reveal
                            </button>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-white">
                              <Database className="w-4 h-4 text-violet-400" />
                              <span>OmniVault Data & Cache</span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950 text-violet-400 border border-violet-800">
                              {totalGames > 0 ? `${totalGames.toLocaleString()} Titles` : 'Catalog Ready'}
                            </span>
                          </div>
                          <div className="mt-2 p-2.5 rounded-xl bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate">
                            {storageConfig?.directories?.app_data?.path || customPaths.dir_app_data}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Catalog database & cached artwork</span>
                            <button
                              type="button"
                              onClick={() => revealStorageFolder('app_data')}
                              className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                            >
                              <FolderOpen className="w-3 h-3" /> Reveal
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {storageMode === 'custom' && (
                    <div className="space-y-4">
                      {storageConfig?.detected_volumes && storageConfig.detected_volumes.length > 0 && (
                        <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 space-y-2">
                          <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Quick Drive Presets:</span>
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {storageConfig.detected_volumes.map((vol) => (
                              <button
                                key={vol.path}
                                type="button"
                                onClick={() => handleSelectVolumePreset(vol.path)}
                                className="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/50 text-xs font-mono font-bold text-slate-200 hover:text-cyan-300 flex items-center gap-2 transition-all cursor-pointer"
                              >
                                <span>{vol.name}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400">
                                  {vol.free_gb} GB Free
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Disc className="w-4 h-4 text-emerald-400" />
                          <span>ROMs / Downloads Folder</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customPaths.dir_roms}
                            onChange={(e) => setCustomPaths({ ...customPaths, dir_roms: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleBrowseFolder('dir_roms', customPaths.dir_roms)}
                            disabled={browsingField === 'dir_roms'}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                            <span>{browsingField === 'dir_roms' ? 'Selecting...' : 'Browse...'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => revealStorageFolder('roms', customPaths.dir_roms)}
                            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                            title="Reveal Folder"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Database className="w-4 h-4 text-violet-400" />
                          <span>OmniVault Data & Cache Folder</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customPaths.dir_app_data}
                            onChange={(e) => setCustomPaths({ ...customPaths, dir_app_data: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleBrowseFolder('dir_app_data', customPaths.dir_app_data)}
                            disabled={browsingField === 'dir_app_data'}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-violet-300 border border-violet-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                            <span>{browsingField === 'dir_app_data' ? 'Selecting...' : 'Browse...'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => revealStorageFolder('app_data', customPaths.dir_app_data)}
                            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                            title="Reveal Folder"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveCustomStorage}
                          disabled={savingStorage}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan cursor-pointer disabled:opacity-50"
                        >
                          {savingStorage ? 'Saving...' : 'Save Custom Folders'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CLOUD DRIVE DESTINATIONS (ICLOUD DRIVE, GOOGLE DRIVE, ONEDRIVE, WEBDAV) */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-sky-950/35 via-slate-900 to-slate-900 border border-sky-500/30 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-black text-white flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-sky-400" />
                          <span>Cloud Drive Destinations (iCloud • Google Drive • OneDrive • WebDAV)</span>
                        </h4>
                        <p className="text-xs text-slate-300 mt-1">
                          Sign in &amp; allow your cloud drive (or connect WebDAV / NAS with zero API keys) to stream ROMs straight into dedicated <span className="font-mono text-sky-300">OmniVault/ROMs/&lt;Console&gt;/</span> folders.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSetDefaultCloudTarget('local')}
                        disabled={savingCloudId === 'local'}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          cloudConfig.default_target === 'local'
                            ? 'bg-cyan-500 text-black border-cyan-400 font-black'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                        }`}
                      >
                        {cloudConfig.default_target === 'local' ? '✓ Default: Local Drive' : 'Use Local Drive Default'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3.5">
                      {(cloudConfig.targets || []).map((t) => {
                        const edit = cloudEdits[t.id] || {};
                        const testRes = cloudTestResults[t.id];
                        const isDefault = cloudConfig.default_target === t.id;
                        const isExpanded = expandedCloudApi === t.id;
                        const isWaitingAuth = oauthWaitingId === t.id;
                        const isWebDav = t.id === 'webdav';
                        return (
                          <div
                            key={t.id}
                            className={`p-4 rounded-2xl border space-y-3 transition-all ${
                              isDefault
                                ? 'bg-sky-950/35 border-sky-400/50'
                                : 'bg-slate-950/70 border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Cloud className={`w-4 h-4 ${t.available ? 'text-sky-400' : 'text-slate-500'}`} />
                                <span className="text-sm font-bold text-white">{t.name}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                  t.available
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                    : 'bg-slate-800 text-slate-400 border-white/10'
                                }`}>
                                  {t.available
                                    ? `✓ Connected • ${t.quota_label || (t.mode === 'api' ? '0 Local Disk Stream' : 'Cloud Sync Ready')}`
                                    : (isWaitingAuth ? 'Waiting for Sign-In...' : (isWebDav ? 'Optional (0-Disk Stream)' : 'Not Signed In'))}
                                </span>
                                {t.zero_local_disk && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60">
                                    Zero Local Drive Usage
                                  </span>
                                )}
                                {!t.zero_local_disk && t.auto_offload && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60">
                                    Auto-Offload After Sync
                                  </span>
                                )}
                                {t.account && (
                                  <span className="text-[11px] font-mono text-slate-400">{t.account}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {t.id === 'icloud' ? (
                                  !t.available && (
                                    <button
                                      type="button"
                                      onClick={() => handleCloudSystemSignIn('icloud')}
                                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-black text-[11px] font-black cursor-pointer"
                                    >
                                      Sign in to iCloud
                                    </button>
                                  )
                                ) : isWebDav ? null : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleCloudRcloneSignIn(t)}
                                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-[11px] font-black cursor-pointer shadow-glow-cyan"
                                      title={`1-Click 0-Disk Sign-In via rclone (no Google/Microsoft developer console needed)`}
                                    >
                                      {isWaitingAuth && oauthWaitingMode === 'api'
                                        ? 'Waiting Allow...'
                                        : (t.rclone_remote ? `Reconnect 0-Disk` : `1-Click 0-Disk Sign-In`)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCloudSystemSignIn(t.id)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold cursor-pointer"
                                      title={`Sign in via official ${t.name} desktop app`}
                                    >
                                      {t.desktop_app_installed ? `Sign in (${t.short_name} App)` : `Connect ${t.short_name} App`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCloudBrowserSignIn(t)}
                                      className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-bold cursor-pointer"
                                      title="Optional custom OAuth 2.0 Client ID Browser Sign-In"
                                    >
                                      {isWaitingAuth && oauthWaitingMode === 'api' ? 'Waiting...' : 'Browser Sign-In'}
                                    </button>
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleTestCloudTarget(t.id)}
                                  disabled={testingCloudId === t.id}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw className={`w-3 h-3 ${testingCloudId === t.id ? 'animate-spin' : ''}`} />
                                  <span>Test</span>
                                </button>
                                {!isWebDav && (
                                  <button
                                    type="button"
                                    onClick={() => handleBrowseCloudFolder(t.id, t.custom_path || t.mount_path)}
                                    disabled={browsingField === `cloud_${t.id}`}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <FolderOpen className="w-3 h-3" />
                                    <span>Folder...</span>
                                  </button>
                                )}
                                {t.roms_path && !String(t.roms_path).startsWith('Google Drive:') && !String(t.roms_path).startsWith('OneDrive:') && !String(t.roms_path).startsWith('WebDAV:') && (
                                  <button
                                    type="button"
                                    onClick={() => revealStorageFolder('roms', t.roms_path)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold cursor-pointer"
                                  >
                                    Reveal
                                  </button>
                                )}
                                {t.available && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetDefaultCloudTarget(t.id)}
                                    disabled={savingCloudId === t.id || isDefault}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                      isDefault
                                        ? 'bg-sky-500 text-black border-sky-400 font-black'
                                        : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40'
                                    }`}
                                  >
                                    {isDefault ? '✓ Default Target' : 'Set Default'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedCloudApi(isExpanded ? null : t.id)}
                                  className="px-2.5 py-1 rounded-lg bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/30 text-[11px] font-bold cursor-pointer"
                                >
                                  {isExpanded ? 'Hide Setup' : (isWebDav ? 'Connect WebDAV / NAS' : 'Options')}
                                </button>
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-slate-400 bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                              <span className="truncate">
                                Console Folder Layout:{' '}
                                <span className="text-slate-200">
                                  {(t.roms_path || `${t.name}/OmniVault/ROMs`).replace(/\/+$/, '').replace(/\/<Console>$/, '')}/&lt;Console&gt;/
                                </span>
                              </span>
                              <span className="text-emerald-400 text-[10px]">
                                Auto-sorted per console (SNES, PS5, Switch2, etc.)
                              </span>
                            </div>

                            {testRes && (
                              <div className={`p-2.5 rounded-xl text-xs font-semibold border ${
                                testRes.status === 'ok'
                                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                  : testRes.status === 'info'
                                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                              }`}>
                                {testRes.message}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-3">
                                {isWebDav ? (
                                  <>
                                    <div className="text-[11px] text-slate-300 leading-relaxed">
                                      <strong className="text-white">Zero-API Direct Cloud / NAS Proxy Streaming:</strong>{' '}
                                      Works with <strong>pCloud, Nextcloud, Koofr, Box, or Synology NAS</strong> — streams ROMs straight through RAM into <span className="font-mono text-cyan-300">OmniVault/ROMs/&lt;Console&gt;/</span> with <strong>0 bytes stored locally</strong> and zero OAuth apps or API keys required.
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      <input
                                        type="text"
                                        value={edit.webdav_url || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          webdav: { ...edit, webdav_url: e.target.value },
                                        }))}
                                        placeholder="WebDAV URL (e.g. https://webdav.pcloud.com or https://nas.local:5006)"
                                        className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 sm:col-span-2"
                                      />
                                      <input
                                        type="text"
                                        value={edit.username || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          webdav: { ...edit, username: e.target.value },
                                        }))}
                                        placeholder="Username / Email"
                                        className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                                      />
                                      <input
                                        type="password"
                                        value={edit.password || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          webdav: { ...edit, password: e.target.value },
                                        }))}
                                        placeholder={t.has_api_token ? `App Password (${t.masked_token || 'Saved'})` : 'Password / App Password'}
                                        className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <input
                                        type="text"
                                        value={edit.base_path || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          webdav: { ...edit, base_path: e.target.value },
                                        }))}
                                        placeholder="Optional base folder (e.g. Games or remote.php/dav/files/user)"
                                        className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                                      />
                                      <div className="flex items-center gap-2">
                                        {t.available && (
                                          <button
                                            type="button"
                                            onClick={() => handleSaveCloudProvider('webdav', true)}
                                            disabled={savingCloudId === 'webdav'}
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-bold cursor-pointer"
                                          >
                                            Disconnect
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleSaveCloudProvider('webdav', false)}
                                          disabled={savingCloudId === 'webdav'}
                                          className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-black cursor-pointer"
                                        >
                                          {savingCloudId === 'webdav' ? 'Saving...' : 'Save WebDAV'}
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : t.supports_oauth ? (
                                  <>
                                    <div className="p-3 rounded-xl bg-cyan-950/35 border border-cyan-500/30 space-y-2">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="text-[11px] text-slate-200">
                                          <strong className="text-cyan-300">Recommended: 1-Click 0-Disk Stream (via rclone)</strong>{' '}
                                          — zero Google Cloud / Microsoft Entra console setup, zero keys, 0 bytes touched on internal SSD.
                                        </div>
                                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                          t.rclone_installed
                                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                                            : 'bg-amber-950/70 text-amber-300 border-amber-700/60'
                                        }`}>
                                          {t.rclone_installed
                                            ? (t.rclone_remote ? `rclone: ${t.rclone_remote}:` : 'rclone ready')
                                            : 'Install: brew install rclone'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {(t.rclone_available_remotes || []).length > 0 && (
                                          <select
                                            value={edit.rclone_remote || t.rclone_remote || ''}
                                            onChange={(e) => setCloudEdits((prev) => ({
                                              ...prev,
                                              [t.id]: { ...edit, rclone_remote: e.target.value, prefer_api: Boolean(e.target.value) },
                                            }))}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                                          >
                                            <option value="">Auto ({`omnivault-${t.id}`})</option>
                                            {(t.rclone_available_remotes || []).map((rm) => (
                                              <option key={rm} value={rm}>{rm}:</option>
                                            ))}
                                          </select>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleCloudRcloneSignIn(t)}
                                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-xs font-black cursor-pointer"
                                        >
                                          {isWaitingAuth && oauthWaitingMode === 'api'
                                            ? 'Waiting for Allow...'
                                            : (t.rclone_remote ? `Reconnect ${t.short_name} (rclone)` : `1-Click 0-Disk Sign-In (${t.short_name})`)}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-slate-300 leading-relaxed">
                                      <strong className="text-white">Optional Advanced Fallback — Custom OAuth 2.0 Client ID:</strong>{' '}
                                      {t.id === 'gdrive'
                                        ? 'Or paste your own Google Cloud Desktop OAuth Client ID and Client Secret below and click '
                                        : 'Or paste your own Microsoft Entra public Client ID below (no secret required) and click '}
                                      <strong className="text-sky-300">Browser Sign-In</strong>.
                                      {t.has_api_token && (
                                        <span className="ml-2 font-mono text-emerald-400">
                                          • Active Session ({t.masked_token || 'Connected'})
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      <input
                                        type="text"
                                        value={edit.client_id || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          [t.id]: { ...edit, client_id: e.target.value },
                                        }))}
                                        placeholder={t.id === 'gdrive' ? 'Google Desktop OAuth Client ID (...apps.googleusercontent.com)' : 'Microsoft Entra Application (Client) ID'}
                                        className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                                      />
                                      {t.id === 'gdrive' && (
                                        <input
                                          type="password"
                                          value={edit.client_secret || ''}
                                          onChange={(e) => setCloudEdits((prev) => ({
                                            ...prev,
                                            [t.id]: { ...edit, client_secret: e.target.value },
                                          }))}
                                          placeholder={t.has_oauth_client_secret ? `Google Client Secret (Saved: ${t.masked_client_secret || '****'})` : 'Google Desktop OAuth Client Secret (GOCSPX-...)'}
                                          className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                                        />
                                      )}
                                      <input
                                        type="text"
                                        value={edit.custom_path || ''}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          [t.id]: { ...edit, custom_path: e.target.value },
                                        }))}
                                        placeholder="Optional custom local sync folder override"
                                        className={`px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 ${t.id === 'gdrive' ? 'sm:col-span-2' : ''}`}
                                      />
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-sky-500/20 text-[11px] text-slate-300 space-y-1">
                                      <div className="font-bold text-sky-300">1-Time Free Setup Guide ({t.name}):</div>
                                      {t.id === 'gdrive' ? (
                                        <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                                          <li>In <strong className="text-slate-200">Google Cloud Console</strong> → enable <strong className="text-slate-200">Google Drive API</strong></li>
                                          <li>Go to <strong className="text-slate-200">APIs &amp; Services → Credentials → Create OAuth client ID → Desktop app</strong></li>
                                          <li>Paste <strong className="text-slate-200">Client ID</strong> + <strong className="text-slate-200">Client Secret</strong> above &amp; click <strong className="text-sky-300">Sign in with Browser</strong> <em>(loopback 127.0.0.1 is automatic)</em></li>
                                        </ol>
                                      ) : (
                                        <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                                          <li>In <strong className="text-slate-200">Microsoft Entra</strong> → <strong className="text-slate-200">App registrations → New registration</strong></li>
                                          <li>Add <strong className="text-slate-200">Mobile &amp; desktop</strong> Redirect URI: <code className="text-cyan-300">http://127.0.0.1:19842/api/storage/cloud-oauth/callback</code></li>
                                          <li>Paste <strong className="text-slate-200">Application (client) ID</strong> above <em>(no secret needed)</em> &amp; click <strong className="text-sky-300">Sign in with Browser</strong></li>
                                        </ol>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
                                      <div className="flex items-center gap-4 flex-wrap">
                                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(edit.prefer_api)}
                                            onChange={(e) => setCloudEdits((prev) => ({
                                              ...prev,
                                              [t.id]: { ...edit, prefer_api: e.target.checked },
                                            }))}
                                          />
                                          <span>Direct Cloud Stream (0 bytes saved to local drive)</span>
                                        </label>
                                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(edit.evict_local_after_sync)}
                                            onChange={(e) => setCloudEdits((prev) => ({
                                              ...prev,
                                              [t.id]: { ...edit, evict_local_after_sync: e.target.checked },
                                            }))}
                                          />
                                          <span>Offload local sync copy after cloud upload</span>
                                        </label>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {(t.has_api_token || t.rclone_remote) && (
                                          <button
                                            type="button"
                                            onClick={() => handleSaveCloudProvider(t.id, true)}
                                            disabled={savingCloudId === t.id}
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-bold cursor-pointer"
                                          >
                                            Sign Out
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleSaveCloudProvider(t.id, false)}
                                          disabled={savingCloudId === t.id}
                                          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-bold cursor-pointer"
                                        >
                                          {savingCloudId === t.id ? 'Saving...' : 'Save Options'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleCloudBrowserSignIn(t)}
                                          className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-black cursor-pointer"
                                        >
                                          {isWaitingAuth ? 'Waiting...' : 'Sign in with Browser'}
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
                                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(edit.evict_local_after_sync)}
                                        onChange={(e) => setCloudEdits((prev) => ({
                                          ...prev,
                                          [t.id]: { ...edit, evict_local_after_sync: e.target.checked },
                                        }))}
                                      />
                                      <span>Cloud-Only Mode: Offload local Mac copy after iCloud Drive finishes uploading</span>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveCloudProvider(t.id, false)}
                                      disabled={savingCloudId === t.id}
                                      className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-black cursor-pointer"
                                    >
                                      {savingCloudId === t.id ? 'Saving...' : 'Save Options'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SOURCES, METADATA & APIs (BYOS) */}
              {activeTab === 'torznab' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="text-xs leading-relaxed text-slate-300">
                        <strong className="text-white block mb-0.5">Bring Your Own Sources (BYOS) + Internet Archive Default:</strong>
                        OmniVault ships with <strong>Internet Archive (archive.org)</strong> enabled as a clean open-preservation default (toggleable or removable anytime) and zero commercial ROM/torrent URLs hardcoded.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestAllSources}
                      disabled={testingAllSources}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-black flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-glow-cyan disabled:opacity-50"
                    >
                      <Activity className={`w-3.5 h-3.5 ${testingAllSources ? 'animate-spin' : ''}`} />
                      <span>{testingAllSources ? 'Testing All...' : 'Test All Sources'}</span>
                    </button>
                  </div>

                  {sourceHealthSummary && (
                    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span>Live Health Check Summary ({sourceHealthSummary.total} Sources):</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-700/60">
                          ✓ {sourceHealthSummary.online} Online
                        </span>
                        {sourceHealthSummary.degraded > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-700/60">
                            ⚠ {sourceHealthSummary.degraded} Degraded
                          </span>
                        )}
                        {sourceHealthSummary.offline > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-700/60">
                            ✗ {sourceHealthSummary.offline} Offline
                          </span>
                        )}
                        {sourceHealthSummary.disabled > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/10">
                            {sourceHealthSummary.disabled} Disabled
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TheGamesDB Metadata, Box Art & Platform Sync Card */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-sky-950/35 via-slate-900 to-slate-900 border border-sky-500/30 space-y-4">
                    <form onSubmit={(e) => handleSaveTheGamesDb(e, false)} className="space-y-3.5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2 flex-wrap">
                            <ImageIcon className="w-4 h-4 text-sky-400" />
                            <span>TheGamesDB Metadata &amp; Box Art</span>
                            {tgdbConfig.enabled && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] border font-mono ${
                                tgdbConfig.using_custom_key
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                  : 'bg-sky-950 text-sky-300 border-sky-700'
                              }`}>
                                {tgdbConfig.using_custom_key
                                  ? `Custom Key Active (${tgdbConfig.masked_custom_key})`
                                  : 'Shared Public Key Active'}
                              </span>
                            )}
                            {tgdbConfig.remaining_allowance !== null && tgdbConfig.remaining_allowance !== undefined && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-white/10 font-mono">
                                {tgdbConfig.remaining_allowance} calls left / mo
                              </span>
                            )}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Uses the built-in shared public key for official artwork &amp; synopses (Switch 2, Switch, PS5, PS4, Windows, macOS, 3DS, Vita, Retro), or enter your own personal API key below.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setTgdbEnabled(!tgdbEnabled)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            tgdbEnabled
                              ? 'bg-sky-950/60 border-sky-500/50 text-sky-300'
                              : 'bg-slate-800 border-white/10 text-slate-400'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{tgdbEnabled ? 'Enabled' : 'Disabled'}</span>
                        </button>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">
                          Optional Personal TheGamesDB API Key (overrides shared public key)
                        </label>
                        <input
                          type="password"
                          value={tgdbCustomKey}
                          onChange={(e) => setTgdbCustomKey(e.target.value)}
                          placeholder={
                            tgdbConfig.has_custom_key
                              ? `Custom key saved: ${tgdbConfig.masked_custom_key} (paste new key to replace)`
                              : 'Leave blank to use shared public key, or paste your own key'
                          }
                          className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400 font-mono"
                        />
                      </div>

                      {tgdbTestResult && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                          tgdbTestResult.status === 'ok'
                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                        }`}>
                          {tgdbTestResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <span>{tgdbTestResult.message}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleTestTheGamesDb}
                            disabled={tgdbTesting}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${tgdbTesting ? 'animate-spin text-sky-400' : ''}`} />
                            <span>{tgdbTesting ? 'Testing...' : 'Test Key'}</span>
                          </button>

                          {tgdbConfig.has_custom_key && (
                            <button
                              type="button"
                              onClick={() => handleSaveTheGamesDb(null, true)}
                              disabled={tgdbSaving}
                              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
                            >
                              Reset to Shared Key
                            </button>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={tgdbSaving}
                          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          {tgdbSaving ? 'Saving...' : 'Save TheGamesDB'}
                        </button>
                      </div>
                    </form>

                    {/* Sync Platform Catalog from TheGamesDB */}
                    <div className="pt-3.5 border-t border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          Sync Platform Catalog from TheGamesDB (Switch 2, PS5, Windows, macOS, etc.)
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={tgdbSyncPlatform}
                          onChange={(e) => setTgdbSyncPlatform(e.target.value)}
                          className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                        >
                          {TGDB_SYNC_PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>

                        <select
                          value={tgdbSyncPages}
                          onChange={(e) => setTgdbSyncPages(Number(e.target.value))}
                          className="bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                        >
                          <option value={1}>1 Page (20 titles)</option>
                          <option value={3}>3 Pages (60 titles)</option>
                          <option value={5}>5 Pages (100 titles)</option>
                        </select>

                        <button
                          type="button"
                          onClick={handleSyncTheGamesDb}
                          disabled={tgdbSyncing || !tgdbConfig.enabled}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-black font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${tgdbSyncing ? 'animate-spin' : ''}`} />
                          <span>{tgdbSyncing ? 'Syncing...' : 'Sync Titles'}</span>
                        </button>
                      </div>

                      {tgdbSyncResult && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                          tgdbSyncResult.status === 'ok'
                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                        }`}>
                          {tgdbSyncResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <span>{tgdbSyncResult.message}</span>
                        </div>
                      )}

                      {/* Batch Sync All Platforms */}
                      <div className="pt-3 border-t border-white/10 space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 block">
                          Batch Sync Multiple Systems (Zero API Quota • Full TheGamesDB Static Dump)
                        </span>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={tgdbBatchScope}
                            onChange={(e) => setTgdbBatchScope(e.target.value)}
                            className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                          >
                            <option value="all">All 39 Catalog Platforms (Full 100k+ Catalog • 0 API calls)</option>
                            <option value="modern">Modern + PC/Mac (Switch 2, PS5, Windows, macOS, Switch, PS4, etc. • 12 systems)</option>
                          </select>

                          <button
                            type="button"
                            onClick={handleSyncAllTheGamesDb}
                            disabled={tgdbBatchSyncing || !tgdbConfig.enabled}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${tgdbBatchSyncing ? 'animate-spin' : ''}`} />
                            <span>{tgdbBatchSyncing ? 'Importing Full Catalog...' : 'Sync All Platforms (Full Dump)'}</span>
                          </button>
                        </div>

                        {tgdbBatchResult && (
                          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                            tgdbBatchResult.status === 'ok'
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                          }`}>
                            {tgdbBatchResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                            <span>{tgdbBatchResult.message}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Real-Debrid Debrid Acceleration Card */}
                  <form onSubmit={handleSaveRealDebrid} className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2 flex-wrap">
                          <Unlock className="w-4 h-4 text-emerald-400" />
                          <span>Real-Debrid High-Speed Unlock</span>
                          {rdConfig.has_key && rdConfig.enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono">
                              {rdConfig.verified && rdConfig.username
                                ? `Verified • ${rdConfig.username} (${(rdConfig.account_type || 'premium').toUpperCase()}) • ${rdConfig.supported_hosts_count || 280}+ hosters unlocked`
                                : `Active (${rdConfig.masked_key})`}
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Token is validated on save and unlocks all {rdConfig.supported_hosts_count || 280}+ supported Real-Debrid file hosters and cached BitTorrent magnets directly in game details &amp; downloads.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRdEnabled(!rdEnabled)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          rdEnabled
                            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-800 border-white/10 text-slate-400'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{rdEnabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">
                        Real-Debrid API Token (real-debrid.com/apitoken)
                      </label>
                      <input
                        type="password"
                        value={rdApiKey}
                        onChange={(e) => setRdApiKey(e.target.value)}
                        placeholder={rdConfig.has_key ? `Saved: ${rdConfig.masked_key} (paste new token to replace)` : 'Paste your Real-Debrid API token'}
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 font-mono"
                      />
                    </div>

                    {rdTestResult && (
                      <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        rdTestResult.status === 'ok'
                          ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                      }`}>
                        {rdTestResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{rdTestResult.message}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={handleTestRealDebrid}
                        disabled={rdTesting}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${rdTesting ? 'animate-spin text-emerald-400' : ''}`} />
                        <span>{rdTesting ? 'Testing...' : 'Test Token'}</span>
                      </button>

                      <button
                        type="submit"
                        disabled={rdSaving}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        {rdSaving ? 'Saving...' : 'Save Real-Debrid'}
                      </button>
                    </div>
                  </form>

                  {/* Import / Export BYOS Source Pack (JSON) */}
                  <div className="p-5 rounded-2xl bg-slate-900/70 border border-violet-500/30 space-y-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2">
                          <Upload className="w-4 h-4 text-violet-400" />
                          <span>Import / Export BYOS Source Pack (JSON)</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Paste the example JSON pack from the README or load a local `.json` source pack to configure mirrors, torrent feeds &amp; templates in one click.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          ref={packFileRef}
                          type="file"
                          accept=".json,application/json"
                          onChange={handleLoadPackFile}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => packFileRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>Load .json File</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPack}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-cyan-500/30 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export Current Pack</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      value={packText}
                      onChange={(e) => setPackText(e.target.value)}
                      placeholder='{"mirror_sources": [...], "providers": [...], "search_templates": [...]}'
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400 font-mono"
                    />

                    {packStatus && (
                      <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        packStatus.status === 'ok'
                          ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                      }`}>
                        {packStatus.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{packStatus.message}</span>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleImportPack}
                        disabled={importingPack || !packText.trim()}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{importingPack ? 'Importing...' : 'Import Source Pack'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Configured BYOS Mirror & Scraper Sources */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-cyan-400" />
                        <span>BYOS Mirror &amp; Scraper Sources</span>
                      </span>
                      <span className="text-[11px] font-mono lowercase">
                        {mirrorSources.filter(s => s.is_enabled).length} / {mirrorSources.length} active
                      </span>
                    </h4>

                    {mirrorSources.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-slate-900/50 border border-dashed border-white/15 text-xs text-slate-400 text-center">
                        No BYOS mirror sources configured yet. Add a custom source below or import a JSON Source Pack above.
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {mirrorSources.map((s) => {
                          const mh = mirrorHealthMap[s.id];
                          return (
                            <div
                              key={s.id}
                              className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-all"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-sm font-bold text-white truncate">{s.name}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                                    {s.adapter}
                                  </span>
                                  {mh && (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                                      mh.status === 'online'
                                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                                        : mh.status === 'degraded'
                                        ? 'bg-amber-950/70 text-amber-300 border-amber-700/60'
                                        : mh.status === 'disabled'
                                        ? 'bg-slate-800 text-slate-400 border-white/10'
                                        : 'bg-rose-950/70 text-rose-300 border-rose-700/60'
                                    }`}>
                                      {mh.status === 'online'
                                        ? `✓ Online • ${mh.latency_ms}ms`
                                        : mh.status === 'degraded'
                                        ? `⚠ HTTP ${mh.http_code} • ${mh.latency_ms}ms`
                                        : mh.status === 'disabled'
                                        ? 'Disabled'
                                        : '✗ Offline'}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                                    {(s.platforms && s.platforms.length > 0) ? s.platforms.slice(0, 5).join(', ') + (s.platforms.length > 5 ? ` +${s.platforms.length - 5}` : '') : 'ALL'}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-400 font-mono truncate max-w-md">
                                  {s.url}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleToggleMirrorSource(s.id)}
                                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    s.is_enabled
                                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                      : 'bg-slate-800 border-white/10 text-slate-500'
                                  }`}
                                  title={s.is_enabled ? 'Disable Source' : 'Enable Source'}
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMirrorSource(s.id)}
                                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-white/10 text-slate-400 transition-colors cursor-pointer"
                                  title="Delete Source"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Custom Mirror Source Form */}
                    <form onSubmit={handleAddMirrorSource} className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-cyan-400" />
                        <span>Add Custom Mirror Source</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Display Name</label>
                          <input
                            type="text"
                            value={mirName}
                            onChange={(e) => setMirName(e.target.value)}
                            placeholder="e.g. My Custom Archive"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Protocol Adapter</label>
                          <select
                            value={mirAdapter}
                            onChange={(e) => setMirAdapter(e.target.value)}
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                          >
                            <option value="archive_org">archive_org (Internet Archive Open API)</option>
                            <option value="wp_hoster">wp_hoster (WordPress + Real-Debrid Hosters)</option>
                            <option value="wp_ajax_cdn">wp_ajax_cdn (WordPress AJAX Direct CDN)</option>
                            <option value="slug_cdn">slug_cdn (Slug Search -&gt; Direct CDN)</option>
                            <option value="platform_listing_token">platform_listing_token (Listing + Token CDN)</option>
                            <option value="html_search">html_search (Generic HTML Search)</option>
                            <option value="directory_link">directory_link (Web Directory Reference)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Base URL</label>
                          <input
                            type="text"
                            value={mirUrl}
                            onChange={(e) => setMirUrl(e.target.value)}
                            placeholder="https://example.org/"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Platforms (comma-separated or ALL)</label>
                          <input
                            type="text"
                            value={mirPlatforms}
                            onChange={(e) => setMirPlatforms(e.target.value)}
                            placeholder="Switch, Switch2, PS5, Windows, macOS, PS4"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">
                          Optional Search URL Template (uses <span className="font-mono text-cyan-400">{'{title}'}</span> / <span className="font-mono text-cyan-400">{'{platform}'}</span>)
                        </label>
                        <input
                          type="text"
                          value={mirSearchTemplate}
                          onChange={(e) => setMirSearchTemplate(e.target.value)}
                          placeholder="https://example.org/?s={title}"
                          className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>

                      {mirFormError && (
                        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{mirFormError}</span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-glow-cyan cursor-pointer"
                        >
                          Save Mirror Source
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Configured Torrent Indexers & Feeds */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Torrent Indexers &amp; Feeds (Torznab / JSON / RSS)</span>
                      <span className="text-[11px] font-mono lowercase">{providers.filter(p => p.is_enabled).length} / {providers.length} active</span>
                    </h4>

                    {providers.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-slate-900/50 border border-dashed border-white/15 text-xs text-slate-400 text-center">
                        No torrent indexers or feeds configured yet. Add Prowlarr, Jackett, JSON torrent API, or RSS feed below.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {providers.map((p) => {
                          const ph = providerHealthMap[p.id];
                          return (
                            <div
                              key={p.id}
                              className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-all"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-sm font-bold text-white truncate">{p.name}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                                    {p.type}
                                  </span>
                                  {ph && (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                                      ph.status === 'online'
                                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                                        : ph.status === 'disabled'
                                        ? 'bg-slate-800 text-slate-400 border-white/10'
                                        : 'bg-rose-950/70 text-rose-300 border-rose-700/60'
                                    }`}>
                                      {ph.status === 'online'
                                        ? `✓ Online • ${ph.latency_ms}ms`
                                        : ph.status === 'disabled'
                                        ? 'Disabled'
                                        : '✗ Offline'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 font-mono truncate max-w-md">
                                  {p.endpoint_url}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleToggleProvider(p.id)}
                                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    p.is_enabled
                                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                      : 'bg-slate-800 border-white/10 text-slate-500'
                                  }`}
                                  title={p.is_enabled ? 'Disable Provider' : 'Enable Provider'}
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProvider(p.id)}
                                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-white/10 text-slate-400 transition-colors cursor-pointer"
                                  title="Delete Provider"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add Indexer / Torrent Feed Form */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-cyan-400" />
                        <span>Add Custom Indexer / Torrent Feed</span>
                      </h4>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setProvName('Local Prowlarr');
                            setProvType('torznab');
                            setProvUrl('http://localhost:9696/api/v1/search');
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                        >
                          Preset: Prowlarr
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProvName('Local Jackett');
                            setProvType('torznab');
                            setProvUrl('http://localhost:9117/api/v2.0/indexers/all/results/torznab/api');
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                        >
                          Preset: Jackett
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleAddProvider} className="space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">
                            Provider Display Name
                          </label>
                          <input
                            type="text"
                            value={provName}
                            onChange={(e) => setProvName(e.target.value)}
                            placeholder="e.g. My Prowlarr Indexer"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">
                            Feed Type
                          </label>
                          <select
                            value={provType}
                            onChange={(e) => setProvType(e.target.value)}
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                          >
                            <option value="torznab">torznab (Prowlarr/Jackett)</option>
                            <option value="json_torrent_api">json_torrent_api (JSON Feed)</option>
                            <option value="rss_torrent_feed">rss_torrent_feed (RSS XML)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">
                            API Key (optional)
                          </label>
                          <input
                            type="password"
                            value={provKey}
                            onChange={(e) => setProvKey(e.target.value)}
                            placeholder="Torznab API key"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">
                          Endpoint Host URL
                        </label>
                        <input
                          type="text"
                          value={provUrl}
                          onChange={(e) => setProvUrl(e.target.value)}
                          placeholder="e.g. http://localhost:9696/api/v1/search"
                          className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>

                      {formError && (
                        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      {testResult && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                          testResult.status === 'ok'
                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                        }`}>
                          {testResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <span>{testResult.message}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={testing}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-cyan-400' : ''}`} />
                          <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                        </button>

                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-glow-cyan cursor-pointer"
                        >
                          Save Provider
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 3: WEB SEARCH TEMPLATES */}
              {activeTab === 'templates' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/30 flex items-start gap-3">
                    <Globe className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed text-slate-300">
                      <strong className="text-white block mb-0.5">External Search Templates:</strong>
                      Generate 1-click external web search shortcuts inside game details using <span className="font-mono text-cyan-300">{'{title}'}</span> and <span className="font-mono text-cyan-300">{'{platform}'}</span> placeholders.
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-white truncate">{t.name}</span>
                            {t.is_builtin && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-950 text-violet-300 border border-violet-800">
                                Built-in
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono truncate max-w-lg">
                            {t.url_template}
                          </div>
                        </div>

                        {!t.is_builtin && (
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-white/10 text-slate-400 transition-colors cursor-pointer shrink-0"
                            title="Delete Template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Plus className="w-4 h-4 text-violet-400" />
                      <span>Add Search URL Template</span>
                    </h4>

                    <form onSubmit={handleAddTemplate} className="space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">
                            Template Name
                          </label>
                          <input
                            type="text"
                            value={tplName}
                            onChange={(e) => setTplName(e.target.value)}
                            placeholder="e.g. My Custom Archive"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">
                            Short Description
                          </label>
                          <input
                            type="text"
                            value={tplDesc}
                            onChange={(e) => setTplDesc(e.target.value)}
                            placeholder="e.g. Searches retro preservation archive"
                            className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">
                          URL Template (Must include <span className="font-mono text-cyan-400">{'{title}'}</span>)
                        </label>
                        <input
                          type="text"
                          value={tplUrl}
                          onChange={(e) => setTplUrl(e.target.value)}
                          placeholder="e.g. https://myarchive.org/search?q={title}+{platform}"
                          className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400 font-mono"
                        />
                      </div>

                      {tplError && (
                        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{tplError}</span>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Save Template
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
