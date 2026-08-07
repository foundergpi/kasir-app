/**
 * Auth - Login, session, dan manajemen user
 */
const Auth = (() => {
  const SESSION_KEY = 'kasir_session';

  function login(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        const users = await KasirDB.getAll(KasirDB.STORES.USERS);
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
          const session = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            login_at: new Date().toISOString(),
          };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          resolve(session);
        } else {
          reject(new Error('Username atau password salah'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getSession() {
    const s = sessionStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function isAdmin() {
    const s = getSession();
    return s && s.role === 'admin';
  }

  return { login, logout, getSession, isLoggedIn, isAdmin };
})();
