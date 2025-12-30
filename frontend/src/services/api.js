// services/api.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to automatically add token
api.interceptors.request.use(
  (config) => {
    let token = localStorage.getItem('token');
    
    if (!token) {
      const vhAuth = localStorage.getItem('vh-auth');
      if (vhAuth) {
        try {
          const parsed = JSON.parse(vhAuth);
          token = parsed.token;
        } catch (e) {
          console.warn('Failed to parse vh-auth:', e);
        }
      }
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('vh-auth');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// User related API helpers
export const getUserInfo = () => {
  return api.get('/api/users/me');
};

export const login = (credentials) => {
  return api.post('/api/auth/login', credentials);
};

export const register = (userData) => {
  return api.post('/api/auth/register', userData);
};

// Project related API helpers
export const createProject = (data) => {
  return api.post('/api/projects', data);
};

export const listProjects = () => {
  return api.get('/api/projects');
};

// FIXED: Use the correct parameter name 'projectId'
export const getProject = (projectId) => {
  return api.get(`/api/projects/${projectId}`); // Changed from id to projectId
};

export const addCollaborator = (projectId, data) => {
  return api.post(`/api/projects/${projectId}/collaborators`, data);
};

export const getCollaborators = (projectId) => {
  return api.get(`/api/projects/${projectId}/collaborators`);
};

export const updateProject = (projectId, data) => {
  return api.put(`/api/projects/${projectId}`, data);
};

export const deleteProject = (projectId) => {
  return api.delete(`/api/projects/${projectId}`);
};

export const updateCollaborator = (projectId, collabId, data) => {
  return api.put(`/api/projects/${projectId}/collaborators/${collabId}`, data);
};

export const deleteCollaborator = (projectId, collabId) => {
  return api.delete(`/api/projects/${projectId}/collaborators/${collabId}`);
};

// Project status and stats
export const updateProjectStatus = (projectId, status) => {
  return api.put(`/api/projects/${projectId}/status`, { status });
};

export const getProjectStats = () => {
  return api.get('/api/projects/stats');
};

// Activity related API helpers
export const getActivities = () => {
  return api.get('/api/activity');
};

export const createActivity = (data) => {
  return api.post('/api/activity', data);
};

// Hourly report API helpers
export const getHourlyReports = () => {
  return api.get('/api/hourly-report');
};

export const createHourlyReport = (data) => {
  return api.post('/api/hourly-report', data);
};

// Daily target API helpers
export const getDailyTargets = () => {
  return api.get('/api/daily-target');
};

export const createDailyTarget = (data) => {
  return api.post('/api/daily-target', data);
};

// Pending leaves (for managers)
export const getPendingLeaves = () => {
  return api.get('/api/daily-target/pending-leaves');
};

// Time tracking API helpers
export const getTimeTracking = () => {
  return api.get('/api/time-tracking');
};

export const createTimeTracking = (data) => {
  return api.post('/api/time-tracking', data);
};

export const updateTimeTracking = (id, data) => {
  return api.put(`/api/time-tracking/${id}`, data);
};

// Employee activity API helpers
export const getEmployeeActivities = () => {
  return api.get('/api/employee-activity');
};

export const createEmployeeActivity = (data) => {
  return api.post('/api/employee-activity', data);
};

// Project files API helpers
export const getProjectFiles = (projectId) => {
  return api.get(`/api/projects/${projectId}/files`);
};

// In your api.js file
export const addProjectFile = async (projectId, formData) => {
  console.log('addProjectFile called with:', { projectId, formData })
  
  return api.post(`/api/projects/${projectId}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const deleteProjectFile = (projectId, fileId) => {
  return api.delete(`/api/projects/${projectId}/files/${fileId}`);
};

// Task Management APIs
export const getProjectTasks = (projectId) => {
  return api.get(`/api/projects/${projectId}/tasks`)
}

export const createTask = (projectId, taskData) => {
  return api.post(`/api/projects/${projectId}/tasks`, taskData)
}

export const updateTaskStatus = (projectId, taskId, statusData) => {
  return api.put(`/api/projects/${projectId}/tasks/${taskId}/status`, statusData)
}

export const getTaskDetails = (projectId, taskId) => {
  return api.get(`/api/projects/${projectId}/tasks/${taskId}`)
}

export const addTaskUpdate = (projectId, taskId, content) => {
  return api.post(`/api/projects/${projectId}/tasks/${taskId}/updates`, { content })
}

export const addTaskAttachment = (projectId, taskId, formData) => {
  return api.post(`/api/projects/${projectId}/tasks/${taskId}/attachments`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}
export default api;