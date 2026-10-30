'use strict';

const DEFAULT_IDS = '1,2,3';
const DEFAULT_DELAY = '0';
const MAX_IDS = 5;
const MAX_DELAY = 5000;
const API = 'https://dummyjson.com/users/';

const usersSection = document.getElementById('users');
const summary = document.getElementById('summary');
const cancelButton = document.getElementById('cancel');

// Один AbortController на все запросы
const controller = new AbortController();

function setSummary(state, text) {
  summary.dataset.state = state;
  summary.textContent = text;
}

// Разбор и проверка параметров адресной строки
function parseParams() {
  const params = new URLSearchParams(window.location.search);
  const idsRaw = params.has('ids') ? params.get('ids') : DEFAULT_IDS;
  const delayRaw = params.has('delay') ? params.get('delay') : DEFAULT_DELAY;

  const parts = idsRaw.split(',').map((s) => s.trim());
  if (parts.length < 1 || parts.length > MAX_IDS) {
    return { error: `Параметр ids должен содержать от 1 до ${MAX_IDS} идентификаторов.` };
  }
  for (const part of parts) {
    if (!/^\d+$/.test(part) || Number(part) <= 0) {
      return {
        error: 'Некорректный параметр ids: допускаются только положительные целые числа через запятую, без пустых элементов.',
      };
    }
  }

  const delay = delayRaw.trim();
  if (!/^\d+$/.test(delay) || Number(delay) > MAX_DELAY) {
    return { error: `Некорректный параметр delay: нужно целое число от 0 до ${MAX_DELAY}.` };
  }

  return { ids: parts.map(Number), delay: Number(delay) };
}

// Запрос одного пользователя с проверкой response.ok
async function loadUser(id, delay) {
  const url = `${API}${id}?delay=${delay}`;
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createPlaceholder(id) {
  const article = document.createElement('article');
  article.dataset.id = String(id);
  article.dataset.state = 'loading';
  article.append(createEl('span', 'message', `Загрузка пользователя ${id}...`));
  return article;
}

function fillSuccess(article, user) {
  article.replaceChildren();
  article.dataset.state = 'success';

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  article.append(createEl('h2', 'name', fullName));

  const emailRow = createEl('p', 'row');
  const email = createEl('a', 'email', user.email ?? '');
  email.href = `mailto:${user.email ?? ''}`;
  emailRow.append(createEl('span', 'label', 'Почта: '), email);

  const cityRow = createEl('p', 'row');
  cityRow.append(createEl('span', 'label', 'Город: '), createEl('span', 'city', user.address?.city ?? ''));

  const companyRow = createEl('p', 'row');
  companyRow.append(createEl('span', 'label', 'Компания: '), createEl('span', 'company', user.company?.name ?? ''));

  article.append(emailRow, cityRow, companyRow);
}

function fillFailure(article, error) {
  article.replaceChildren();
  if (error && error.name === 'AbortError') {
    article.dataset.state = 'aborted';
    article.append(createEl('span', 'message', 'Запрос отменён'));
  } else {
    article.dataset.state = 'error';
    article.append(createEl('span', 'message', error?.message || 'Ошибка сети'));
  }
}

async function main() {
  const parsed = parseParams();

  if (parsed.error) {
    cancelButton.disabled = true;
    setSummary('error', parsed.error);
    return;
  }

  const { ids, delay } = parsed;

  // Карточки создаются сразу в порядке ids, поэтому порядок не зависит от скорости ответов
  const articles = ids.map((id) => {
    const article = createPlaceholder(id);
    usersSection.append(article);
    return article;
  });

  setSummary('loading', 'Загрузка...');

  cancelButton.addEventListener('click', () => controller.abort());

  // Все запросы запускаются одновременно
  const results = await Promise.allSettled(
    ids.map(async (id, i) => {
      try {
        const user = await loadUser(id, delay);
        fillSuccess(articles[i], user);
        return user;
      } catch (error) {
        fillFailure(articles[i], error);
        throw error;
      }
    })
  );

  cancelButton.disabled = true;

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const aborted = results.filter((r) => r.status === 'rejected' && r.reason?.name === 'AbortError').length;
  const failed = results.length - ok - aborted;

  let text = `Загружено: ${ok}; ошибок: ${failed}`;
  if (aborted > 0) text += `; отменено: ${aborted}`;

  let state;
  if (aborted > 0) state = 'aborted';
  else if (failed === 0) state = 'success';
  else if (ok === 0) state = 'error';
  else state = 'partial';

  setSummary(state, text);
}

main();
