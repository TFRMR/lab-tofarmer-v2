import re

# ---------- scan-saja.html ----------
path1 = "tofarmer-web/html/scan-saja.html"
with open(path1, "r", encoding="utf-8") as f:
    c1 = f.read()

old_header1 = '''      
        href="./login.html"
        class="glass-btn"
      >
        Login
      </a>'''
new_header1 = '''      
        href="./login.html"
        class="glass-btn"
        id="authBtn"
      >
        Login
      </a>'''
assert c1.count(old_header1) == 1, "header pattern scan-saja tidak unik/ tidak ketemu"
c1 = c1.replace(old_header1, new_header1)

old_js1 = "  state.user = user;\n\n  $('userName').textContent ="
new_js1 = """  state.user = user;

  const authBtn = $('authBtn');
  if (authBtn) {
    authBtn.textContent = 'Logout';
    authBtn.href = '#';
    authBtn.onclick = (e) => {
      e.preventDefault();
      localStorage.removeItem('tof_wallet');
      localStorage.removeItem('tof_login_username');
      localStorage.removeItem('tof_level');
      localStorage.removeItem('tof_rank');
      localStorage.removeItem('tof_xp');
      location.href = './login.html';
    };
  }

  $('userName').textContent ="""
assert c1.count(old_js1) == 1, "js pattern scan-saja tidak unik/ tidak ketemu"
c1 = c1.replace(old_js1, new_js1)

with open(path1, "w", encoding="utf-8") as f:
    f.write(c1)

# ---------- admin-scan-saja.html ----------
path2 = "tofarmer-web/html/admin-scan-saja.html"
with open(path2, "r", encoding="utf-8") as f:
    c2 = f.read()

old_header2 = '''      
        href="./login.html"
        class="glass-btn"
      >
        Login
      </a>'''
new_header2 = '''      
        href="./login.html"
        class="glass-btn"
        id="authBtn"
      >
        Login
      </a>'''
assert c2.count(old_header2) == 1, "header pattern admin-scan-saja tidak unik/ tidak ketemu"
c2 = c2.replace(old_header2, new_header2)

old_js2 = "  state.user =\n    user;"
new_js2 = """  state.user =
    user;

  const authBtn = $('authBtn');
  if (authBtn) {
    authBtn.textContent = 'Logout';
    authBtn.href = '#';
    authBtn.onclick = (e) => {
      e.preventDefault();
      localStorage.removeItem('tof_wallet');
      localStorage.removeItem('tof_login_username');
      localStorage.removeItem('tof_level');
      localStorage.removeItem('tof_rank');
      localStorage.removeItem('tof_xp');
      location.href = './login.html';
    };
  }"""
assert c2.count(old_js2) == 1, "js pattern admin-scan-saja tidak unik/ tidak ketemu"
c2 = c2.replace(old_js2, new_js2)

with open(path2, "w", encoding="utf-8") as f:
    f.write(c2)

print("OK — kedua file berhasil diupdate.")
