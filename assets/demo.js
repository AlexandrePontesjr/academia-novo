/* DukFit — Motor de Demonstração Estática (Mock completo do sistema) */

(function () {
  const PAGES = [
    // Público
    { group: 'Site Público & Matrícula', file: 'index.html', route: '/', title: 'Landing Page (DukFit)' },
    { group: 'Site Público & Matrícula', file: 'matricula.html', route: '/matricula', title: 'Quero Treinar (Matrícula)' },
    { group: 'Site Público & Matrícula', file: 'matricula-confirmar.html', route: '/matricula/confirmar', title: 'Confirmar Matrícula' },
    { group: 'Site Público & Matrícula', file: 'matricula-enviado.html', route: '/matricula/enviado', title: 'Matrícula Enviada' },

    // Autenticação
    { group: 'Autenticação & Acesso', file: 'login.html', route: '/login', title: 'Login' },
    { group: 'Autenticação & Acesso', file: 'login-two-factor.html', route: '/login/two-factor', title: 'Verificação 2FA' },
    { group: 'Autenticação & Acesso', file: 'esqueci-senha.html', route: '/esqueci-senha', title: 'Esqueci a Senha' },
    { group: 'Autenticação & Acesso', file: 'definir-senha.html', route: '/definir-senha', title: 'Definir Nova Senha' },
    { group: 'Autenticação & Acesso', file: 'primeiro-acesso.html', route: '/primeiro-acesso', title: 'Primeiro Acesso' },

    // Operação
    { group: 'Operação & Check-in', file: 'dashboard.html', route: '/dashboard', title: 'Início (Painel)' },
    { group: 'Operação & Check-in', file: 'check-in.html', route: '/check-in', title: 'Balcão de Check-in' },
    { group: 'Operação & Check-in', file: 'check-ins.html', route: '/check-ins', title: 'Presenças (Relatório)' },

    // Alunos
    { group: 'Alunos', file: 'students.html', route: '/students', title: 'Lista de Alunos' },
    { group: 'Alunos', file: 'students-new.html', route: '/students/new', title: 'Novo Aluno' },
    { group: 'Alunos', file: 'student-detail.html', route: '/students/[id]', title: 'Ficha do Aluno' },
    { group: 'Alunos', file: 'student-edit.html', route: '/students/[id]/edit', title: 'Editar Aluno' },
    { group: 'Alunos', file: 'student-print.html', route: '/students/[id]/print', title: 'Ficha Impressa (Aluno)' },

    // Planos, Financeiro e Leads
    { group: 'Planos, Financeiro & Leads', file: 'plans.html', route: '/plans', title: 'Planos' },
    { group: 'Planos, Financeiro & Leads', file: 'plans-new.html', route: '/plans/new', title: 'Novo Plano' },
    { group: 'Planos, Financeiro & Leads', file: 'plan-edit.html', route: '/plans/[id]/edit', title: 'Editar Plano' },
    { group: 'Planos, Financeiro & Leads', file: 'payments.html', route: '/payments', title: 'Pagamentos' },
    { group: 'Planos, Financeiro & Leads', file: 'leads.html', route: '/leads', title: 'Interessados (Leads)' },

    // Equipe & Administração
    { group: 'Equipe & Administração', file: 'staff.html', route: '/staff', title: 'Funcionários' },
    { group: 'Equipe & Administração', file: 'staff-new.html', route: '/staff/new', title: 'Novo Funcionário' },
    { group: 'Equipe & Administração', file: 'staff-detail.html', route: '/staff/[id]', title: 'Ficha do Funcionário' },
    { group: 'Equipe & Administração', file: 'staff-edit.html', route: '/staff/[id]/edit', title: 'Editar Funcionário' },
    { group: 'Equipe & Administração', file: 'staff-print.html', route: '/staff/[id]/print', title: 'Ficha Impressa (Equipe)' },
    { group: 'Equipe & Administração', file: 'users.html', route: '/users', title: 'Usuários & Perfis' },
    { group: 'Equipe & Administração', file: 'audit.html', route: '/audit', title: 'Auditoria' },
    { group: 'Equipe & Administração', file: 'privacy.html', route: '/privacy', title: 'Privacidade & LGPD' },

    // Conta & Portal do Aluno
    { group: 'Conta & Portal do Aluno', file: 'account.html', route: '/account', title: 'Minha Conta (Equipe)' },
    { group: 'Conta & Portal do Aluno', file: 'two-factor-setup.html', route: '/two-factor/setup', title: 'Configurar 2FA' },
    { group: 'Conta & Portal do Aluno', file: 'minha-conta.html', route: '/minha-conta', title: 'Portal do Aluno' },

    // Sistema
    { group: 'Sistema & Mapa', file: '404.html', route: '/404', title: 'Página Não Encontrada (404)' },
    { group: 'Sistema & Mapa', file: 'mapa.html', route: '/mapa', title: 'Mapa de Todas as Telas' },
  ];

  const ROLES = {
    admin: { name: 'Marcos Duque', label: 'Administrador', initials: 'MD' },
    reception: { name: 'Camila Ferreira', label: 'Recepção', initials: 'CF' },
    trainer: { name: 'Rafael Costa', label: 'Professor', initials: 'RC' },
    student: { name: 'Lucas Andrade', label: 'Aluno', initials: 'LA' },
  };

  function getRole() {
    try {
      return localStorage.getItem('dukfit_demo_role') || 'admin';
    } catch {
      return 'admin';
    }
  }

  function setRole(role) {
    try {
      localStorage.setItem('dukfit_demo_role', role);
    } catch {}
    if (role === 'student') {
      window.location.href = 'minha-conta.html';
    } else {
      window.location.reload();
    }
  }

  function currentFile() {
    const path = window.location.pathname;
    const last = path.split('/').pop();
    return last || 'index.html';
  }

  // Ícones SVG inline leves (sem dependências externas)
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-7"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 7-2 8 0"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 14.5-4 16 0"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };

  const NAV_ITEMS = [
    { file: 'dashboard.html', label: 'Início', icon: 'home', roles: ['admin', 'reception', 'trainer'] },
    { file: 'students.html', label: 'Alunos', icon: 'users', roles: ['admin', 'reception', 'trainer'] },
    { file: 'leads.html', label: 'Interessados', icon: 'mail', roles: ['admin', 'reception'] },
    { file: 'check-in.html', label: 'Check-in', icon: 'checkin', roles: ['admin', 'reception'] },
    { file: 'check-ins.html', label: 'Presenças', icon: 'chart', roles: ['admin', 'reception'] },
    { file: 'plans.html', label: 'Planos', icon: 'layers', roles: ['admin', 'reception'] },
    { file: 'payments.html', label: 'Pagamentos', icon: 'card', roles: ['admin', 'reception'] },
    { file: 'staff.html', label: 'Funcionários', icon: 'badge', roles: ['admin'] },
    { file: 'users.html', label: 'Usuários', icon: 'key', roles: ['admin'] },
    { file: 'audit.html', label: 'Auditoria', icon: 'history', roles: ['admin'] },
    { file: 'privacy.html', label: 'Privacidade', icon: 'shield', roles: ['admin'] },
    { file: 'account.html', label: 'Minha conta', icon: 'user', roles: ['admin', 'reception', 'trainer'] },
  ];

  function positionNavPills(animate) {
    const sideNav = document.querySelector('.nav-list');
    const sidePill = document.querySelector('.nav-slider-pill');
    const activeSide = sideNav ? sideNav.querySelector('.nav-item.active') : null;

    if (sideNav && sidePill && activeSide) {
      const applySide = () => {
        sidePill.style.transform = `translateY(${activeSide.offsetTop}px)`;
        sidePill.style.height = `${activeSide.offsetHeight}px`;
        sidePill.classList.add('ready');
      };
      if (!animate) {
        const prevTop = sessionStorage.getItem('dukfit_prev_nav_top');
        const prevH = sessionStorage.getItem('dukfit_prev_nav_h');
        if (prevTop && prevH) {
          sidePill.style.transition = 'none';
          sidePill.style.transform = `translateY(${prevTop}px)`;
          sidePill.style.height = `${prevH}px`;
          sidePill.classList.add('ready');
          void sidePill.offsetHeight;
          sidePill.style.transition = '';
        } else {
          sidePill.style.transition = 'none';
          applySide();
          void sidePill.offsetHeight;
          sidePill.style.transition = '';
        }
      }
      requestAnimationFrame(applySide);
      sessionStorage.setItem('dukfit_prev_nav_top', String(activeSide.offsetTop));
      sessionStorage.setItem('dukfit_prev_nav_h', String(activeSide.offsetHeight));
    }

    const bottomNav = document.querySelector('.bottom-nav');
    const bottomPill = document.querySelector('.bottom-nav-pill');
    const activeTab = bottomNav ? bottomNav.querySelector('.bottom-tab.active') : null;
    if (bottomNav && bottomPill && activeTab) {
      const applyBottom = () => {
        bottomPill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
        bottomPill.style.width = `${activeTab.offsetWidth}px`;
        bottomPill.classList.add('ready');
      };
      if (!animate) {
        bottomPill.style.transition = 'none';
        applyBottom();
        void bottomPill.offsetWidth;
        bottomPill.style.transition = '';
      } else {
        requestAnimationFrame(applyBottom);
      }
    }
  }

  window.renderAppShell = function (activeFile, mainHtml) {
    const root = document.getElementById('app-root');
    if (!root) return;

    const existingShell = root.querySelector('.app-shell');
    if (existingShell) {
      // SPA transition: mantém sidebar montada e desliza o pill suavemente
      existingShell.querySelectorAll('.nav-list .nav-item').forEach((a) => {
        a.classList.toggle('active', a.getAttribute('href') === activeFile);
      });
      existingShell.querySelectorAll('.bottom-nav .bottom-tab').forEach((a) => {
        if (a.tagName === 'A') {
          a.classList.toggle('active', a.getAttribute('href') === activeFile);
        }
      });
      const main = existingShell.querySelector('main.container-app');
      if (main) {
        main.classList.remove('is-leaving', 'is-entering');
        main.innerHTML = mainHtml;
        void main.offsetWidth;
        main.classList.add('is-entering');
      }
      positionNavPills(true);
      if (typeof window.__applyMotionPolish === 'function') {
        window.__applyMotionPolish();
      }
      return;
    }

    const role = getRole();
    const user = ROLES[role] || ROLES.admin;
    const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role));

    const sideLinks = visibleNav
      .map(
        (item) =>
          `<a href="${item.file}" class="nav-item ${item.file === activeFile ? 'active' : ''}">${ICONS[item.icon]}<span>${item.label}</span></a>`
      )
      .join('');

    const bottomTabs = [
      visibleNav[0],
      visibleNav[1],
      visibleNav.find((i) => i.file === 'check-in.html') || visibleNav[2],
      visibleNav.find((i) => i.file === 'payments.html') || visibleNav[3],
    ]
      .filter(Boolean)
      .map(
        (item) =>
          `<a href="${item.file}" class="bottom-tab ${item.file === activeFile ? 'active' : ''}">${ICONS[item.icon]}<span>${item.label}</span></a>`
      )
      .join('');

    root.innerHTML = `
      <div class="app-shell">
        <aside class="side-nav">
          <div>
            <a href="index.html" class="brand-link">
              <img src="assets/dukfit/logo-dukfit-96.webp" alt="DukFit" />
              <span>DukFit</span>
            </a>
            <nav class="nav-list" aria-label="Menu principal">
              <span class="nav-slider-pill" aria-hidden="true"></span>
              ${sideLinks}
            </nav>
          </div>
          <div style="display:grid;gap:0.5rem;padding-top:1rem;border-top:1px solid var(--border);">
            <a href="minha-conta.html" class="nav-item">${ICONS.user}<span>Visão do Aluno</span></a>
            <a href="login.html" class="nav-item">${ICONS.logout}<span>Sair</span></a>
          </div>
        </aside>

        <header class="app-topbar">
          <div class="user-chip">
            <div class="avatar-circle">${user.initials}</div>
            <div class="user-chip-meta">
              <div class="user-chip-name">${user.name}</div>
              <div class="user-chip-role">Perfil: ${user.label}</div>
            </div>
          </div>
          <div class="role-sim-wrap">
            <label class="role-sim-label" for="role-sim">Simular perfil:</label>
            <select id="role-sim" class="select role-sim-select" aria-label="Simular perfil">
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>Administrador</option>
              <option value="reception" ${role === 'reception' ? 'selected' : ''}>Recepção</option>
              <option value="trainer" ${role === 'trainer' ? 'selected' : ''}>Professor</option>
              <option value="student">Aluno (Portal)</option>
            </select>
          </div>
        </header>

        <main class="container-app">${mainHtml}</main>

        <nav class="bottom-nav" aria-label="Navegação rápida">
          <span class="bottom-nav-pill" aria-hidden="true"></span>
          ${bottomTabs}
          <button type="button" class="bottom-tab" onclick="window.openDemoDrawer()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            <span>Mais</span>
          </button>
        </nav>

        ${
          role !== 'trainer'
            ? `<a href="check-in.html" class="fab-checkin" aria-label="Registrar check-in" title="Balcão de Check-in">${ICONS.checkin}</a>`
            : ''
        }
      </div>
    `;

    const sel = document.getElementById('role-sim');
    if (sel) {
      sel.addEventListener('change', (e) => setRole(e.target.value));
    }

    positionNavPills(false);
    window.addEventListener('resize', () => positionNavPills(false));
  };

  window.demoToast = function (message) {
    let el = document.getElementById('demo-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-toast';
      el.className = 'demo-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.__demoToastTimer);
    window.__demoToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };

  function injectDemoNavigator() {
    if (document.body.dataset.noDemoDock === 'true') return;
    const file = currentFile();
    const groups = {};
    PAGES.forEach((p) => {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    });

    const dock = document.createElement('div');
    dock.className = 'demo-dock no-print';
    dock.innerHTML = `
      <button type="button" class="demo-dock-btn" id="btn-open-demo-nav" aria-label="Abrir índice de telas (${PAGES.length})" title="Telas da demonstração (${PAGES.length})">
        <span class="demo-dot"></span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span class="demo-dock-label">Telas (${PAGES.length})</span>
      </button>
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'demo-drawer-backdrop no-print';
    backdrop.id = 'demo-drawer-backdrop';

    const sectionsHtml = Object.entries(groups)
      .map(
        ([groupName, items]) => `
        <div style="margin-top:1.1rem;">
          <div class="eyebrow" style="margin-bottom:0.45rem;">${groupName}</div>
          <div class="demo-page-grid">
            ${items
              .map(
                (p) => `
              <a href="${p.file}" class="demo-page-link ${p.file === file ? 'current' : ''}">
                <span style="font-weight:600;">${p.title}</span>
                <span class="route-tag">${p.route}</span>
              </a>`
              )
              .join('')}
          </div>
        </div>`
      )
      .join('');

    backdrop.innerHTML = `
      <div class="demo-drawer" role="dialog" aria-label="Navegador de telas da demonstração">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;padding-bottom:0.75rem;border-bottom:1px solid var(--border);">
          <div>
            <div class="eyebrow">DukFit · Demonstração Interativa</div>
            <h2 style="margin:0;font-size:1.25rem;">Todas as telas do sistema (${PAGES.length} páginas)</h2>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <a href="mapa.html" class="btn btn-secondary btn-sm">Mapa</a>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-demo-nav">Fechar</button>
          </div>
        </div>
        ${sectionsHtml}
      </div>
    `;

    document.body.appendChild(dock);
    document.body.appendChild(backdrop);

    window.openDemoDrawer = () => backdrop.classList.add('open');
    window.closeDemoDrawer = () => backdrop.classList.remove('open');

    document.getElementById('btn-open-demo-nav').addEventListener('click', window.openDemoDrawer);
    document.getElementById('btn-close-demo-nav').addEventListener('click', window.closeDemoDrawer);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) window.closeDemoDrawer();
    });
  }

  window.DUKFIT_PAGES = PAGES;

  function applyMotionPolish() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // 1. Staggered reveal para painéis e blocos de landing
    const targets = document.querySelectorAll('.panel, .metric-tile, .landing-section > div');
    targets.forEach((el, idx) => {
      if (!el.classList.contains('reveal-stagger')) {
        el.style.setProperty('--stagger-i', String(Math.min(idx, 10)));
        el.classList.add('reveal-stagger');
      }
    });

    // 2. SuccessCheck SVG stroke calibration (10-success-check)
    document.querySelectorAll('.t-success-check').forEach((wrap) => {
      const shapes = wrap.querySelectorAll('svg path, svg polyline');
      shapes.forEach((shape) => {
        if (typeof shape.getTotalLength === 'function') {
          const len = Math.ceil(shape.getTotalLength()) + 1;
          shape.style.strokeDasharray = String(len);
          shape.style.strokeDashoffset = String(len);
        }
      });
      void wrap.offsetWidth;
      wrap.classList.add('is-in');
      shapes.forEach((shape) => {
        shape.style.strokeDashoffset = '0';
      });
    });
  }

  window.__applyMotionPolish = applyMotionPolish;

  let spaBusy = false;
  async function navigateInShell(href, pushHistory) {
    if (spaBusy || !location.protocol.startsWith('http')) {
      window.location.href = href;
      return;
    }
    const appRoot = document.getElementById('app-root');
    if (!appRoot || !appRoot.querySelector('.app-shell')) {
      window.location.href = href;
      return;
    }

    spaBusy = true;
    const main = appRoot.querySelector('main.container-app');
    if (main) main.classList.add('is-leaving');

    try {
      const [res] = await Promise.all([
        fetch(href),
        new Promise((r) => setTimeout(r, 130)),
      ]);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.getElementById('app-root')) {
        window.location.href = href;
        return;
      }

      document.title = doc.title || document.title;
      if (pushHistory) history.pushState({ href }, '', href);

      // Atualiza destaque no drawer de telas
      const targetFile = href.split('/').pop().split('?')[0].split('#')[0] || 'dashboard.html';
      document.querySelectorAll('.demo-page-link').forEach((link) => {
        link.classList.toggle('current', link.getAttribute('href') === targetFile);
      });

      // Executa os scripts inline da página carregada (exceto assets/demo.js)
      const scripts = Array.from(doc.querySelectorAll('script')).filter((s) => !s.src);
      scripts.forEach((s) => {
        const fn = new Function(s.textContent || '');
        fn();
      });

      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      window.location.href = href;
    } finally {
      spaBusy = false;
    }
  }

  function bindSpaNavigation() {
    if (!location.protocol.startsWith('http')) return;
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (!href.endsWith('.html')) return;
      // Páginas fora do AppShell navegam normalmente
      const outside = ['index.html', 'login.html', 'minha-conta.html', 'mapa.html', '404.html', 'student-print.html', 'staff-print.html'];
      if (outside.includes(href)) return;
      if (!document.querySelector('#app-root .app-shell')) return;

      e.preventDefault();
      if (typeof window.closeDemoDrawer === 'function') window.closeDemoDrawer();
      navigateInShell(href, true);
    });

    window.addEventListener('popstate', () => {
      if (document.querySelector('#app-root .app-shell')) {
        navigateInShell(currentFile(), false);
      }
    });
  }

  function initDemo() {
    injectDemoNavigator();
    applyMotionPolish();
    bindSpaNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemo);
  } else {
    initDemo();
  }
})();
