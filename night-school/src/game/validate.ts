import type { Action, Cond, StageDef } from './types';

/** マップ側で作られた物の名前 */
export interface MapNames {
  objects: Set<string>;
  openables: Set<string>;
  spawns: Set<string>;
}

/**
 * ステージデータの参照切れ（存在しないノート・スクリプト・扉・地点など）を起動時に見つける。
 * 開発中だけ呼ぶ。
 */
export function validateStage(stage: StageDef, map: MapNames): string[] {
  const errors: string[] = [];
  const notes = new Set(stage.notes.map((n) => n.id));
  const items = new Set(stage.items.map((i) => i.id));
  const actors = new Set((stage.actors ?? []).map((a) => a.id));
  const ids = new Set<string>();
  for (const n of stage.notes) {
    if (ids.has(`note:${n.id}`)) errors.push(`duplicate note "${n.id}"`);
    ids.add(`note:${n.id}`);
  }
  for (const d of stage.interactables) {
    if (ids.has(`obj:${d.id}`)) errors.push(`duplicate interactable "${d.id}"`);
    ids.add(`obj:${d.id}`);
  }

  const cond = (c: Cond | undefined, where: string): void => {
    if (!c) return;
    if ('note' in c && !notes.has(c.note)) errors.push(`${where}: unknown note "${c.note}"`);
    if ('item' in c && !items.has(c.item)) errors.push(`${where}: unknown item "${c.item}"`);
    if ('noItem' in c && !items.has(c.noItem)) errors.push(`${where}: unknown item "${c.noItem}"`);
    if ('all' in c) c.all.forEach((x) => cond(x, where));
    if ('any' in c) c.any.forEach((x) => cond(x, where));
    if ('not' in c) cond(c.not, where);
  };

  const actions = (list: Action[], where: string): void => {
    for (const a of list) {
      if ('note' in a && !notes.has(a.note)) errors.push(`${where}: unknown note "${a.note}"`);
      if ('give' in a && !items.has(a.give)) errors.push(`${where}: unknown item "${a.give}"`);
      if ('take' in a && !items.has(a.take)) errors.push(`${where}: unknown item "${a.take}"`);
      if ('run' in a && !stage.scripts[a.run]) errors.push(`${where}: unknown script "${a.run}"`);
      if ('open' in a && !map.openables.has(a.open)) errors.push(`${where}: unknown openable "${a.open}"`);
      if ('close' in a && !map.openables.has(a.close)) errors.push(`${where}: unknown openable "${a.close}"`);
      if ('rattle' in a) for (const r of a.rattle) if (!map.openables.has(r)) errors.push(`${where}: unknown openable "${r}"`);
      if ('teleport' in a && !map.spawns.has(a.teleport)) errors.push(`${where}: unknown spawn "${a.teleport}"`);
      if ('look' in a && !map.objects.has(a.look)) errors.push(`${where}: unknown object "${a.look}"`);
      if ('actor' in a && !actors.has(a.actor)) errors.push(`${where}: unknown actor "${a.actor}"`);
      if ('tutorial' in a && !stage.tutorials?.[a.tutorial]) errors.push(`${where}: unknown tutorial "${a.tutorial}"`);
      if ('choice' in a) a.choice.options.forEach((o) => (cond(o.when, where), actions(o.actions, where)));
      if ('sequence' in a) {
        actions(a.sequence.correct, where);
        actions(a.sequence.wrong, where);
      }
      if ('if' in a) {
        cond(a.if, where);
        actions(a.then, where);
        actions(a.else ?? [], where);
      }
    }
  };

  for (const d of stage.interactables) {
    if (!map.objects.has(d.id)) errors.push(`interactable "${d.id}" has no object in the map`);
    cond(d.visibleWhen, d.id);
    d.names?.forEach((n) => cond(n.when, d.id));
    d.reactions.forEach((r) => (cond(r.when, d.id), actions(r.actions, d.id)));
  }
  for (const [name, list] of Object.entries(stage.scripts)) actions(list, `script ${name}`);
  for (const t of stage.triggers ?? []) {
    cond(t.when, `trigger ${t.id}`);
    actions(t.actions, `trigger ${t.id}`);
  }
  for (const v of stage.visibility ?? []) {
    if (!map.objects.has(v.id)) errors.push(`visibility: unknown object "${v.id}"`);
    cond(v.when, `visibility ${v.id}`);
  }
  for (const e of stage.enemies ?? []) {
    if (!map.objects.has(e.id)) errors.push(`enemy "${e.id}" has no object in the map`);
    cond(e.activeWhen, `enemy ${e.id}`);
    actions(e.onDefeat, `enemy ${e.id}`);
    actions(e.onHalf ?? [], `enemy ${e.id}`);
  }
  actions(stage.intro, 'intro');
  stage.objectives.forEach((o) => cond(o.when, 'objectives'));
  return errors;
}
