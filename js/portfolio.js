(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('js');
  // The introduction is decorative; it never blocks access to the page.
  const intro = document.querySelector('.intro');
  window.setTimeout(() => intro.remove(), 1500);
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    reveals.forEach(element => observer.observe(element));
    const navLinks = document.querySelectorAll('nav a');
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => {
            const active = link.hash === '#' + entry.target.id;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          });
        }
      });
    }, { rootMargin: '-15% 0px -55% 0px' });
    document.querySelectorAll('main section[id]').forEach(section => sectionObserver.observe(section));
  } else {
    reveals.forEach(element => element.classList.add('visible'));
  }
  const progress = document.querySelector('.reading-progress');
  let scheduled = false;
  const updateProgress = () => {
    const distance = root.scrollHeight - window.innerHeight;
    progress.style.width = (distance > 0 ? window.scrollY / distance * 100 : 0) + '%';
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
  const updateTime = () => {
    document.getElementById('local-time').textContent = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date()) + ' IST';
  };
  updateTime();
  window.setInterval(updateTime, 60000);
  document.getElementById('year').textContent = new Date().getFullYear();
  const orbital = document.querySelector('.orbital');
  const halo = document.querySelector('.orbit-halo');
  orbital.addEventListener('pointermove', event => {
    if (reducedMotion.matches || event.pointerType !== 'mouse') return;
    const bounds = orbital.getBoundingClientRect();
    const x = (event.clientX - bounds.left - bounds.width / 2) * 0.15;
    const y = (event.clientY - bounds.top - bounds.height / 2) * 0.15;
    halo.style.transform = `translate(${x}px, ${y}px) scale(1.4)`;
    orbital.querySelector('.orbital-sculpture').style.translate = `${x * 0.3}px ${y * 0.3}px`;
  });
  orbital.addEventListener('pointerleave', () => {
    halo.style.transform = '';
    orbital.querySelector('.orbital-sculpture').style.translate = '';
  });
  document.addEventListener('visibilitychange', () => {
    document.querySelectorAll('.orbital-sculpture, .orb-core, .tech-track').forEach(element => {
      element.style.animationPlayState = document.hidden ? 'paused' : '';
    });
  });
  const apiEndpoint = path => {
    const chatUrl = document.querySelector('meta[name="chat-api-url"]')?.content || '/api/chat';
    if (/^https?:\/\//i.test(chatUrl)) {
      const url = new URL(chatUrl);
      url.pathname = url.pathname.replace(/\/api\/chat\/?$/, path);
      return url.href;
    }
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return `http://localhost:8787${path}`;
    return path;
  };
  const form = document.getElementById('my-form');
  const button = document.getElementById('my-form-button');
  const status = document.getElementById('my-form-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    status.textContent = '';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const formSubmitUrl = form.action.replace('https://formsubmit.co/', 'https://formsubmit.co/ajax/');
      const response = await fetch(formSubmitUrl, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false || result.success === 'false') {
        throw new Error(result.message || 'Your message could not be submitted. Please try again.');
      }
      form.reset();
      status.textContent = 'Thanks for reaching out. Your message has been submitted.';
    } catch (error) {
      status.textContent = error.name === 'AbortError'
        ? 'Sending took too long. Please try again or email mdyaseenferoz@gmail.com.'
        : (error.message === 'Failed to fetch'
          ? 'Could not reach the form service. Please try again or email mdyaseenferoz@gmail.com.'
          : (error.message || 'Your message couldn’t be sent. Please try again or email mdyaseenferoz@gmail.com.'));
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      button.innerHTML = 'Send message <span>↗</span>';
    }
  });
  const assistantForm = document.getElementById('assistant-form');
  const assistantInput = document.getElementById('assistant-question');
  const assistantReplies = document.getElementById('assistant-replies');
  const assistantNote = document.querySelector('.assistant-note');
  if (assistantForm && assistantInput && assistantReplies) {
    const history = [];
    const endpoint = apiEndpoint('/api/chat');
    const addMessage = (text, kind) => {
      const message = document.createElement('p');
      message.className = 'assistant-message' + (kind === 'user' ? ' visitor' : '');
      message.textContent = text;
      assistantReplies.append(message);
      assistantReplies.scrollTop = assistantReplies.scrollHeight;
      message.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      return message;
    };
    const cleanAssistantReply = text => text
      .replace(/\r\n?/g, '\n')
      .replace(/```[\w-]*|```/g, '')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/gs, '$1')
      .replace(/__(.*?)__/gs, '$1')
      .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^>\s?/gm, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    assistantForm.addEventListener('submit', event => {
      event.preventDefault();
      const question = assistantInput.value.trim();
      if (!question || assistantForm.dataset.busy === 'true') return;
      addMessage(question, 'user');
      assistantInput.value = '';
      assistantForm.dataset.busy = 'true';
      const sendButton = assistantForm.querySelector('button');
      sendButton.disabled = true;
      sendButton.textContent = '…';
      const pending = addMessage('Thinking…', 'assistant');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ messages: [...history.slice(-10), { role: 'user', content: question }] }),
        signal: controller.signal
      }).then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(body.error || 'The assistant is temporarily unavailable.');
          error.status = response.status;
          throw error;
        }
        if (typeof body.reply !== 'string' || !body.reply.trim()) throw new Error('The assistant returned an empty answer.');
        const reply = cleanAssistantReply(body.reply).slice(0, 3000);
        history.push({ role: 'user', content: question }, { role: 'assistant', content: reply });
        pending.textContent = reply;
        if (Number.isInteger(body.remaining) && assistantNote) {
          assistantNote.textContent = body.remaining === 0
            ? 'Portfolio only · daily limit reached; try again tomorrow.'
            : `Portfolio only · ${body.remaining} questions left today on this connection.`;
        }
        if (body.remaining === 0) {
          assistantInput.disabled = true;
          sendButton.disabled = true;
        }
        assistantReplies.scrollTop = assistantReplies.scrollHeight;
      }).catch(error => {
        pending.textContent = error.name === 'AbortError'
          ? 'That took too long. Please try again.'
          : (error.message === 'Failed to fetch' ? 'Could not reach the AI service. Check the backend setup and try again.' : error.message);
        if (error.status === 429) {
          assistantInput.disabled = true;
          sendButton.disabled = true;
          if (assistantNote) assistantNote.textContent = 'Portfolio only · daily limit reached; try again tomorrow.';
        }
        assistantReplies.scrollTop = assistantReplies.scrollHeight;
      }).finally(() => {
        clearTimeout(timeout);
        assistantForm.dataset.busy = 'false';
        sendButton.disabled = assistantInput.disabled;
        sendButton.textContent = '↗';
        assistantInput.focus();
      });
    });
  }
})();

// Progressive enhancement: all projects remain available without JavaScript.
(() => {
  const filters = document.querySelector('.project-filters');
  const projects = [...document.querySelectorAll('.project-card')];
  const archive = document.querySelector('.project-archive');
  const featuredGrid = document.querySelector('.project-featured-grid');
  const status = document.querySelector('.project-count');
  if (!filters || !archive || !featuredGrid || !status) return;
  const archiveProjects = projects.filter(project => archive.contains(project));
  const buttons = [...filters.querySelectorAll('button[data-filter]')];
  let activeCategory = 'all';
  let activeLabel = 'All projects';
  const matches = (project, category) => category === 'all' || project.dataset.category === category;
  const projectLabel = count => count + (count === 1 ? ' project' : ' projects');
  const updateStatus = () => {
    const count = projects.filter(project => !project.hidden).length;
    const archiveCount = archiveProjects.filter(project => !project.hidden).length;
    if (activeCategory === 'all' && !archive.open) {
      status.textContent = projectLabel(count) + ': ' + (count - archiveCount) + ' featured and ' + archiveCount + ' more in the archive.';
    } else {
      status.textContent = 'Showing ' + projectLabel(count) + (activeCategory === 'all' ? '' : ' / ' + activeLabel);
    }
    window.dispatchEvent(new Event('resize'));
  };
  buttons.forEach(button => {
    const count = projects.filter(project => matches(project, button.dataset.filter)).length;
    const countElement = button.querySelector('[data-filter-count]');
    if (countElement) countElement.textContent = String(count);
  });
  filters.hidden = false;
  filters.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button || !filters.contains(button)) return;
    activeCategory = button.dataset.filter;
    activeLabel = button.textContent.replace(/\s+\d+\s*$/, '').trim();
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    projects.forEach(project => {
      project.hidden = !matches(project, activeCategory);
      if (!project.hidden) project.classList.add('visible');
    });
    const archiveCount = archiveProjects.filter(project => !project.hidden).length;
    archive.hidden = archiveCount === 0;
    archive.open = activeCategory !== 'all' && archiveCount > 0;
    archive.querySelector('.project-archive-count').textContent = projectLabel(archiveCount);
    featuredGrid.hidden = !projects.some(project => !archive.contains(project) && !project.hidden);
    updateStatus();
  });
  archive.addEventListener('toggle', updateStatus);
  updateStatus();
})();
