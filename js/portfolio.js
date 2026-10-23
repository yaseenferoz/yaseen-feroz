(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const arrowIconMarkup = '<svg class="icon-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 12 12 4M5 4h7v7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
      button.innerHTML = `Send message <span>${arrowIconMarkup}</span>`;
    }
  });
  const assistantForm = document.getElementById('assistant-form');
  const assistantInput = document.getElementById('assistant-question');
  const assistantReplies = document.getElementById('assistant-replies');
  const assistantNote = document.querySelector('.assistant-note');
  const assistantLeadForm = document.getElementById('assistant-lead-form');
  const assistantLeadStatus = document.getElementById('assistant-lead-status');
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
    const showLeadForm = () => {
      assistantForm.hidden = true;
      if (assistantLeadForm) {
        assistantLeadForm.hidden = false;
        assistantLeadForm.querySelector('[name="name"]')?.focus();
      }
      if (assistantNote) assistantNote.textContent = 'Share your details with Yaseen to unlock 12 more questions today.';
    };
    const stopChatForToday = () => {
      assistantInput.disabled = true;
      const sendButton = assistantForm.querySelector('button');
      if (sendButton) sendButton.disabled = true;
      if (assistantNote) assistantNote.textContent = 'Portfolio only · today’s assistant limit reached. Please come back tomorrow.';
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
          error.code = body.code;
          throw error;
        }
        if (typeof body.reply !== 'string' || !body.reply.trim()) throw new Error('The assistant returned an empty answer.');
        const reply = cleanAssistantReply(body.reply).slice(0, 3000);
        history.push({ role: 'user', content: question }, { role: 'assistant', content: reply });
        pending.textContent = reply;
        if (Number.isInteger(body.remaining) && assistantNote) {
          assistantNote.textContent = body.remaining === 0 && !body.leadSubmitted
            ? 'Share your details with Yaseen to unlock 12 more questions today.'
            : body.remaining === 0
              ? 'Portfolio only · today’s assistant limit reached. Please come back tomorrow.'
              : `Portfolio only · ${body.remaining} questions left today on this connection.`;
        }
        if (body.remaining === 0 && body.leadSubmitted) {
          stopChatForToday();
        } else if (body.remaining === 0) {
          showLeadForm();
        }
        assistantReplies.scrollTop = assistantReplies.scrollHeight;
      }).catch(error => {
        pending.textContent = error.name === 'AbortError'
          ? 'That took too long. Please try again.'
          : (error.message === 'Failed to fetch' ? 'Could not reach the AI service. Check the backend setup and try again.' : error.message);
        if (error.status === 429 && error.code === 'LEAD_REQUIRED') {
          showLeadForm();
        } else if (error.status === 429 && error.code === 'DAILY_LIMIT_REACHED') {
          stopChatForToday();
        }
        assistantReplies.scrollTop = assistantReplies.scrollHeight;
      }).finally(() => {
        clearTimeout(timeout);
        assistantForm.dataset.busy = 'false';
        sendButton.disabled = assistantInput.disabled;
        sendButton.innerHTML = arrowIconMarkup;
        if (!assistantForm.hidden && !assistantInput.disabled) assistantInput.focus();
      });
    });

    if (assistantLeadForm) {
      assistantLeadForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (assistantLeadForm.dataset.busy === 'true') return;
        const submitButton = assistantLeadForm.querySelector('button[type="submit"]');
        assistantLeadForm.dataset.busy = 'true';
        if (submitButton) submitButton.disabled = true;
        if (assistantLeadStatus) assistantLeadStatus.textContent = 'Sending your details securely…';
        try {
          const formData = new FormData(assistantLeadForm);
          const response = await fetch(apiEndpoint('/api/contact'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              name: formData.get('name'),
              email: formData.get('email'),
              phone: formData.get('phone'),
              consent: formData.get('consent') === 'on'
            })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.success !== true) throw new Error(body.error || 'We could not send your details. Please try again.');

          assistantLeadForm.reset();
          assistantLeadForm.hidden = true;
          assistantForm.hidden = false;
          assistantInput.disabled = false;
          const sendButton = assistantForm.querySelector('button');
          const remaining = Number.isInteger(body.remaining) ? body.remaining : 12;
          if (remaining > 0) {
            if (sendButton) sendButton.disabled = false;
            if (assistantNote) assistantNote.textContent = `Your details were sent to Yaseen. You have ${remaining} more questions today.`;
            addMessage(`Thanks — your details were sent to Yaseen. You can ask up to ${remaining} more questions today.`, 'assistant');
            assistantInput.focus();
          } else {
            stopChatForToday();
          }
        } catch (error) {
          if (assistantLeadStatus) assistantLeadStatus.textContent = error.message || 'We could not send your details. Please try again.';
        } finally {
          assistantLeadForm.dataset.busy = 'false';
          if (submitButton) submitButton.disabled = false;
        }
      });
    }
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
