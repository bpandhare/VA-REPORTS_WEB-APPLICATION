// frontend/src/services/api.js
import axios from 'axios';

// This will be https://your-backend-api.com in production
// or http://localhost:5000 in development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
// Instead of hardcoded URLs, use:
const API_URL = import.meta.env.VITE_API_URL || ''

// In your API service files
axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;

// Project related API helpers
export const createProject = async (data) => {
  const token = localStorage.getItem('token') || ''
  return api.post('/api/projects', data, { headers: { Authorization: `Bearer ${token}` } })
}

export const listProjects = async () => {
  const token = localStorage.getItem('token') || ''
  return api.get('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
}

export const addCollaborator = async (projectId, data) => {
  const token = localStorage.getItem('token') || ''
  return api.post(`/api/projects/${projectId}/collaborators`, data, { headers: { Authorization: `Bearer ${token}` } })
}

export const getCollaborators = async (projectId) => {
  const token = localStorage.getItem('token') || ''
  return api.get(`/api/projects/${projectId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
}

export const updateProject = async (projectId, data) => {
  const token = localStorage.getItem('token') || ''
  return api.put(`/api/projects/${projectId}`, data, { headers: { Authorization: `Bearer ${token}` } })
}

export const deleteProject = async (projectId) => {
  const token = localStorage.getItem('token') || ''
  return api.delete(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
}

export const updateCollaborator = async (projectId, collabId, data) => {
  const token = localStorage.getItem('token') || ''
  return api.put(`/api/projects/${projectId}/collaborators/${collabId}`, data, { headers: { Authorization: `Bearer ${token}` } })
}

export const deleteCollaborator = async (projectId, collabId) => {
  const token = localStorage.getItem('token') || ''
  return api.delete(`/api/projects/${projectId}/collaborators/${collabId}`, { headers: { Authorization: `Bearer ${token}` } })
}