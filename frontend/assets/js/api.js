(function () {
  const BASE = window.location.origin + '/api';

  function getToken() {
    return localStorage.getItem('zd_token');
  }

  function buildHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function request(method, path, body) {
    const opts = { method, headers: buildHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (err) {
      throw new Error('Network error: ' + err.message);
    }

    if (res.status === 401) {
      localStorage.removeItem('zd_token');
      localStorage.removeItem('zd_user');
      window.dispatchEvent(new CustomEvent('zd:unauthorized'));
      throw new Error('Unauthorized');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.message) || 'Request failed');
    return data;
  }

  window.api = {
    get:    (path)       => request('GET',    path),
    post:   (path, body) => request('POST',   path, body),
    patch:  (path, body) => request('PATCH',  path, body),
    delete: (path)       => request('DELETE', path),
  };
})();
