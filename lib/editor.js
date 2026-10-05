'use strict';

const KINDS = { items: '$dataItems', weapons: '$dataWeapons', armors: '$dataArmors' };
const LIMIT = 200;

function value(text) {
  try { return JSON.parse(text); } catch { return text; }
}

function model(w) {
  const party = () => w.$gameParty;
  const named = list => (list || []).filter(x => x && x.name).map(x => ({ id: x.id, name: x.name }));
  const actor = id => w.$gameActors.actor(id);
  const listed = (names, store) => (names || []).map((name, id) => ({ id, name, value: store.value(id) })).slice(1);
  return {
    ready: () => !!(w.$gameParty && w.$gameActors && w.$gameSwitches && w.$gameVariables && w.$dataSystem),
    gold: () => party().gold(),
    setGold: n => party().gainGold(n - party().gold()),
    catalog: kind => named(w[KINDS[kind]]),
    owned: kind => named(w[KINDS[kind]])
      .map(e => ({ ...e, count: party().numItems(w[KINDS[kind]][e.id]) }))
      .filter(e => e.count > 0),
    setCount: (kind, id, n) => {
      const item = w[KINDS[kind]][id];
      party().gainItem(item, n - party().numItems(item), false);
    },
    paramNames: () => (w.$dataSystem.terms.params || []).slice(0, 8),
    actors: () => {
      const members = party().members();
      return named(w.$dataActors).map(e => {
        const a = actor(e.id);
        return {
          id: e.id, name: a.name() || e.name, inParty: members.includes(a),
          level: a.level, hp: a.hp, mp: a.mp, params: [0, 1, 2, 3, 4, 5, 6, 7].map(i => a.param(i)),
        };
      }).sort((x, y) => y.inParty - x.inParty);
    },
    setActor: (id, key, n) => {
      const a = actor(id);
      if (key === 'level') a.changeLevel(n, false);
      else if (key === 'hp') a.setHp(n);
      else if (key === 'mp') a.setMp(n);
      else a.addParam(key, n - a.param(key));
    },
    switches: () => listed(w.$dataSystem.switches, w.$gameSwitches),
    setSwitch: (id, on) => w.$gameSwitches.setValue(id, !!on),
    variables: () => listed(w.$dataSystem.variables, w.$gameVariables),
    setVariable: (id, text) => w.$gameVariables.setValue(id, value(text)),
  };
}

const CSS = `
#rpgm-editor { position: fixed; top: 0; right: 0; width: 380px; max-width: 100%; height: 100%; overflow: auto;
  box-sizing: border-box; padding: 8px; background: rgba(18, 18, 22, 0.96); color: #eee;
  font: 13px/1.4 sans-serif; z-index: 2147483647; user-select: text; }
#rpgm-editor summary { cursor: pointer; padding: 4px 0; font-weight: bold; }
#rpgm-editor .row { display: flex; gap: 6px; align-items: center; justify-content: space-between; padding: 1px 0; }
#rpgm-editor .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rpgm-editor input { font: inherit; background: #2a2a30; color: #eee; border: 1px solid #555; padding: 1px 4px; }
#rpgm-editor input[type=number], #rpgm-editor input.value { width: 90px; }
#rpgm-editor input.filter { width: 100%; box-sizing: border-box; margin: 2px 0 4px; }
#rpgm-editor details details { margin-left: 10px; }
#rpgm-editor p { margin: 4px 0; color: #aaa; }`;

const EVENTS = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel',
  'contextmenu', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'pointermove'];

function install(w, key = 'F8') {
  const d = w.document;
  const m = model(w);
  let panel = null;
  const el = (tag, props, ...kids) => {
    const e = Object.assign(d.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  const row = (label, input) => el('div', { className: 'row' }, el('span', { textContent: label, title: label }), input);
  const number = (v, set, refresh) => el('input', {
    type: 'number', value: v, onchange: e => { set(Number(e.target.value)); refresh(); },
  });
  const section = (title, rows, opts = {}) => {
    const list = el('div');
    const filter = el('input', { className: 'filter', placeholder: 'Filter', oninput: () => refresh() });
    const refresh = () => {
      const q = filter.value.toLowerCase();
      const all = rows(refresh).filter(([label]) => !q || label.toLowerCase().includes(q));
      list.replaceChildren(...all.slice(0, LIMIT).map(([label, input]) => row(label, input)));
      if (all.length > LIMIT) list.append(el('p', { textContent: `${all.length - LIMIT} more; filter to find them` }));
    };
    const box = el('details', { open: !!opts.open }, el('summary', { textContent: title }));
    if (opts.filter) box.append(filter);
    box.append(list);
    if (opts.add) box.append(opts.add(refresh));
    refresh();
    return box;
  };

  const inventory = (kind, title) => section(title, refresh => m.owned(kind).map(e =>
    [e.name, number(e.count, n => m.setCount(kind, e.id, n), refresh)]), {
    filter: true,
    add: refresh => {
      const id = `rpgm-editor-${kind}`;
      const input = el('input', { placeholder: 'Add by name' });
      input.setAttribute('list', id);
      const options = m.catalog(kind).map(e => el('option', { value: `${e.name} #${e.id}` }));
      const add = () => {
        const hit = /#(\d+)$/.exec(input.value);
        if (!hit) return;
        const owned = m.owned(kind).find(e => e.id === +hit[1]);
        m.setCount(kind, +hit[1], (owned ? owned.count : 0) + 1);
        input.value = '';
        refresh();
      };
      return el('div', { className: 'row' }, input, el('datalist', { id }, ...options), el('button', { textContent: 'Add', onclick: add }));
    },
  });

  const actors = () => {
    const names = m.paramNames();
    const box = el('details', {}, el('summary', { textContent: 'Actors' }));
    for (const a of m.actors()) {
      box.append(section(`${a.name}${a.inParty ? ' (party)' : ''}`, refresh => {
        const now = m.actors().find(x => x.id === a.id);
        const set = k => n => m.setActor(a.id, k, n);
        return [['Level', number(now.level, set('level'), refresh)], ['HP', number(now.hp, set('hp'), refresh)],
          ['MP', number(now.mp, set('mp'), refresh)],
          ...now.params.map((p, i) => [names[i] || `Param ${i}`, number(p, set(i), refresh)])];
      }));
    }
    return box;
  };

  const render = () => {
    const top = panel.scrollTop;
    panel.replaceChildren(el('style', { textContent: CSS }),
      el('p', { textContent: `${key} or Esc closes. Changes apply at once; save in-game to keep them.` }));
    if (!m.ready()) {
      panel.append(el('p', { textContent: 'Start or load a game first.' }));
      return;
    }
    panel.append(
      row('Gold', number(m.gold(), m.setGold, () => render())),
      inventory('items', 'Items'), inventory('weapons', 'Weapons'), inventory('armors', 'Armor'),
      actors(),
      section('Switches', refresh => m.switches().map(s => [`${s.id} ${s.name}`,
        el('input', { type: 'checkbox', checked: !!s.value, onchange: e => { m.setSwitch(s.id, e.target.checked); refresh(); } })]),
      { filter: true }),
      section('Variables', refresh => m.variables().map(v => [`${v.id} ${v.name}`,
        el('input', { className: 'value', value: typeof v.value === 'string' ? v.value : JSON.stringify(v.value),
          onchange: e => { m.setVariable(v.id, e.target.value); refresh(); } })]),
      { filter: true }));
    panel.scrollTop = top;
  };

  w.addEventListener('keydown', e => {
    if (e.key !== key && !(e.key === 'Escape' && panel)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (panel) { panel.remove(); panel = null; return; }
    panel = el('div', { id: 'rpgm-editor' });
    for (const type of EVENTS) panel.addEventListener(type, ev => ev.stopPropagation());
    d.body.append(panel);
    render();
  }, true);
}

module.exports = { model, install, value };
