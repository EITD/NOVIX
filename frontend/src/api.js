import axios from 'axios';

const API_BASE = '/api';

// Projects API
export const projectsAPI = {
  list: () => axios.get(`${API_BASE}/projects`),
  get: (id) => axios.get(`${API_BASE}/projects/${id}`),
  create: (data) => axios.post(`${API_BASE}/projects`, data),
  delete: (id) => axios.delete(`${API_BASE}/projects/${id}`),
  getStats: (id) => axios.get(`${API_BASE}/projects/${id}/stats`),
  getDashboard: (id) => axios.get(`${API_BASE}/projects/${id}/dashboard`),
};

// Cards API
export const cardsAPI = {
  // Character cards
  listCharacters: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/cards/characters`),
  getCharacter: (projectId, name) => axios.get(`${API_BASE}/projects/${projectId}/cards/characters/${name}`),
  createCharacter: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/cards/characters`, data),
  updateCharacter: (projectId, name, data) => axios.put(`${API_BASE}/projects/${projectId}/cards/characters/${name}`, data),
  deleteCharacter: (projectId, name) => axios.delete(`${API_BASE}/projects/${projectId}/cards/characters/${name}`),

  // World cards
  listWorld: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/cards/world`),
  getWorld: (projectId, name) => axios.get(`${API_BASE}/projects/${projectId}/cards/world/${name}`),
  createWorld: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/cards/world`, data),
  updateWorld: (projectId, name, data) => axios.put(`${API_BASE}/projects/${projectId}/cards/world/${name}`, data),
  deleteWorld: (projectId, name) => axios.delete(`${API_BASE}/projects/${projectId}/cards/world/${name}`),

  // Style cards
  getStyle: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/cards/style`),
  updateStyle: (projectId, data) => axios.put(`${API_BASE}/projects/${projectId}/cards/style`, data),
  extractStyle: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/cards/style/extract`, data),
};

// Session API
export const sessionAPI = {
  start: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/start`, data),
  getStatus: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/session/status`),
  submitFeedback: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/feedback`, data),
  answerQuestions: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/answer-questions`, data),
  cancel: (projectId) => axios.post(`${API_BASE}/projects/${projectId}/session/cancel`),
  analyze: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/analyze`, data),
  saveAnalysis: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/save-analysis`, data),
  analyzeSync: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/analyze-sync`, data),
  analyzeBatch: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/analyze-batch`, data),
  saveAnalysisBatch: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/session/save-analysis-batch`, data),
};

// Drafts API
export const draftsAPI = {
  listChapters: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/drafts`),
  listSummaries: (projectId, volumeId) =>
    axios.get(`${API_BASE}/projects/${projectId}/drafts/summaries`, {
      params: volumeId ? { volume_id: volumeId } : undefined,
    }),
  listVersions: (projectId, chapter) => axios.get(`${API_BASE}/projects/${projectId}/drafts/${chapter}/versions`),
  getDraft: (projectId, chapter, version) => axios.get(`${API_BASE}/projects/${projectId}/drafts/${chapter}/${version}`),
  getSceneBrief: (projectId, chapter) => axios.get(`${API_BASE}/projects/${projectId}/drafts/${chapter}/scene-brief`),
  getFinal: (projectId, chapter) => axios.get(`${API_BASE}/projects/${projectId}/drafts/${chapter}/final`),
  getSummary: (projectId, chapter) => axios.get(`${API_BASE}/projects/${projectId}/drafts/${chapter}/summary`),
  saveSummary: (projectId, chapter, data) => axios.post(`${API_BASE}/projects/${projectId}/drafts/${chapter}/summary`, data),
  deleteChapter: (projectId, chapter) => axios.delete(`${API_BASE}/projects/${projectId}/drafts/${chapter}`),
  updateContent: (projectId, chapter, data) => axios.put(`${API_BASE}/projects/${projectId}/drafts/${chapter}/content`, data),
};

// Volumes API
export const volumesAPI = {
  list: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/volumes`),
  get: (projectId, volumeId) => axios.get(`${API_BASE}/projects/${projectId}/volumes/${volumeId}`),
  create: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/volumes`, data),
  update: (projectId, volumeId, data) => axios.put(`${API_BASE}/projects/${projectId}/volumes/${volumeId}`, data),
  delete: (projectId, volumeId) => axios.delete(`${API_BASE}/projects/${projectId}/volumes/${volumeId}`),
  getSummary: (projectId, volumeId) => axios.get(`${API_BASE}/projects/${projectId}/volumes/${volumeId}/summary`),
  saveSummary: (projectId, volumeId, data) => axios.put(`${API_BASE}/projects/${projectId}/volumes/${volumeId}/summary`, data),
  getStats: (projectId, volumeId) => axios.get(`${API_BASE}/projects/${projectId}/volumes/${volumeId}/stats`),
};

// Canon API (Facts)
export const canonAPI = {
  list: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/canon/facts`),
  get: (projectId, factId) => axios.get(`${API_BASE}/projects/${projectId}/canon/facts/by-id/${factId}`),
  create: (projectId, data) => axios.post(`${API_BASE}/projects/${projectId}/canon/facts`, data),
  update: (projectId, factId, data) => axios.put(`${API_BASE}/projects/${projectId}/canon/facts/by-id/${factId}`, data),
  delete: (projectId, factId) => axios.delete(`${API_BASE}/projects/${projectId}/canon/facts/by-id/${factId}`),
  getTree: (projectId) => axios.get(`${API_BASE}/projects/${projectId}/facts/tree`),
};

// Config API
export const configAPI = {
  getProfiles: () => axios.get(`${API_BASE}/config/llm/profiles`),
  saveProfile: (data) => axios.post(`${API_BASE}/config/llm/profiles`, data),
  fetchModels: (data) => axios.post(`${API_BASE}/proxy/fetch-models`, data),
  deleteProfile: (id) => axios.delete(`${API_BASE}/config/llm/profiles/${id}`),

  getAssignments: () => axios.get(`${API_BASE}/config/llm/assignments`),
  updateAssignments: (data) => axios.post(`${API_BASE}/config/llm/assignments`, data),

  getProvidersMeta: () => axios.get(`${API_BASE}/config/llm/providers_meta`),
};

// WebSocket for real-time updates
export const createWebSocket = (projectId, onMessage, options = {}) => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsHost = window.location.host;

  const {
    onStatus,
    maxRetries = 6,
    retryDelay = 800,
    maxDelay = 8000,
    heartbeatInterval = 20000
  } = options;

  let ws = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let shouldReconnect = true;
  let retryCount = 0;

  const notifyStatus = (status) => {
    onStatus?.(status);
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = window.setInterval(() => {
      try {
        ws?.send(String(Date.now()));
      } catch {
        // ignore
      }
    }, heartbeatInterval);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const connect = () => {
    notifyStatus(retryCount > 0 ? 'reconnecting' : 'connecting');
    ws = new WebSocket(`${wsProtocol}://${wsHost}/ws/${projectId}/session`);

    ws.onopen = () => {
      retryCount = 0;
      notifyStatus('connected');
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      stopHeartbeat();
      if (shouldReconnect && retryCount < maxRetries) {
        const delay = Math.min(maxDelay, retryDelay * Math.pow(1.5, retryCount));
        retryCount += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      } else {
        notifyStatus('disconnected');
      }
    };
  };

  connect();

  return {
    get socket() {
      return ws;
    },
    close: () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopHeartbeat();
      ws?.close();
    }
  };
};
