import { API_BASE } from "./taskOptions";

// Every request to the backend goes through here, so anything that must go
// with each request (later: the access code) is added in this one place.
export function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, options);
}