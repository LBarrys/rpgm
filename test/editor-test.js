'use strict';
const { model, value } = require('../lib/editor.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

class Actor {
  constructor(id, name) { Object.assign(this, { id, _name: name, level: 1, hp: 50, mp: 10, plus: [0, 0, 0, 0, 0, 0, 0, 0] }); }
  name() { return this._name; }
  param(i) { return 100 + this.plus[i]; }
  addParam(i, d) { this.plus[i] += d; }
  changeLevel(n) { this.level = n; }
  setHp(n) { this.hp = Math.min(n, this.param(0)); }
  setMp(n) { this.mp = n; }
}
class Store {
  constructor() { this.data = []; }
  value(id) { return this.data[id] ?? 0; }
  setValue(id, v) { this.data[id] = v; }
}
const counts = new Map();
const actors = [null, new Actor(1, 'Harold'), new Actor(2, 'Therese'), new Actor(3, 'Marsha')];
const w = {
  $dataItems: [null, { id: 1, name: 'Potion' }, { id: 2, name: '' }, { id: 3, name: 'Ether' }],
  $dataWeapons: [null, { id: 1, name: 'Sword' }],
  $dataArmors: [null],
  $dataActors: [null, { id: 1, name: 'Harold' }, { id: 2, name: 'Therese' }, { id: 3, name: 'Marsha' }],
  $dataSystem: { switches: ['', 'Door open', 'Boss beaten'], variables: ['', 'Coins', 'Name'], terms: { params: ['Max HP', 'Max MP', 'Attack'] } },
};
const m = model(w);
is('not ready before a game is started', m.ready(), false);

Object.assign(w, {
  $gameParty: {
    _gold: 100,
    gold() { return this._gold; },
    gainGold(n) { this._gold = Math.max(0, this._gold + n); },
    numItems: item => counts.get(item) || 0,
    gainItem: (item, n) => counts.set(item, Math.max(0, (counts.get(item) || 0) + n)),
    members: () => [actors[2]],
  },
  $gameActors: { actor: id => actors[id] },
  $gameSwitches: new Store(),
  $gameVariables: new Store(),
});
is('ready once a game is running', m.ready(), true);

m.setGold(5000);
is('gold is set to the value asked for', m.gold(), 5000);

is('the catalog lists named entries only', m.catalog('items').map(e => e.name), ['Potion', 'Ether']);
is('nothing is owned at first', m.owned('items'), []);
m.setCount('items', 1, 7);
is('an item count is set through gainItem', m.owned('items'), [{ id: 1, name: 'Potion', count: 7 }]);
m.setCount('items', 1, 2);
is('and lowered the same way', m.owned('items')[0].count, 2);
m.setCount('items', 1, 0);
is('an item at 0 leaves the list', m.owned('items'), []);
m.setCount('weapons', 1, 1);
is('weapons are their own list', m.owned('weapons').map(e => e.name), ['Sword']);

is('party members come first', m.actors().map(a => a.name), ['Therese', 'Harold', 'Marsha']);
is('and are marked', m.actors()[0].inParty, true);
m.setActor(1, 'level', 30);
m.setActor(1, 'hp', 80);
m.setActor(1, 2, 150);
const harold = m.actors().find(a => a.id === 1);
is('level is changed', harold.level, 30);
is('HP is changed', harold.hp, 80);
is('a parameter is set to the value asked for', harold.params[2], 150);
is('through addParam, as a permanent bonus', actors[1].plus[2], 50);
is('parameter names come from the game', m.paramNames(), ['Max HP', 'Max MP', 'Attack']);

is('switches are listed from id 1 with names', m.switches(), [{ id: 1, name: 'Door open', value: 0 }, { id: 2, name: 'Boss beaten', value: 0 }]);
m.setSwitch(2, 1);
is('a switch is turned on', w.$gameSwitches.value(2), true);
m.setVariable(1, '42');
m.setVariable(2, 'Ann');
is('a numeric variable stays a number', w.$gameVariables.value(1), 42);
is('text stays text', w.$gameVariables.value(2), 'Ann');
is('JSON values are parsed', value('[1,2]'), [1, 2]);

process.exit(failed ? 1 : 0);
