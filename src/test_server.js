import Store from './store.js';
import http from './http-fetch.js';
window.store = new Store("/test/", http);
