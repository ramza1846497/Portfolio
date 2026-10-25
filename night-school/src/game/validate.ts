import type { Action, Cond, StageDef } from './types';

/**
 * ステージデータの参照切れ（存在しないノート・スクリプト・扉など）を起動時に見つける。
 * 開発中だけ呼ぶ。
 */
export function validateStage(stage: StageDef, objectNames: Set<string>, openables: Set<string>): string[] {
  const errors: string[] = [];
  const notes = new Set(stage.notes.map((n) => n.id));
  const items = new Set(stage.items.map((i) => i.id));

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
      if ('run' in a && !stage.scripts[a.run]) errors.push(`${where}: unknown script "${a.run}"`);
      if ('open' in a && !openables.has(a.open)) errors.push(`${where}: unknown openable "${a.open}"`);
      if ('choice' in a) a.choice.options.forEach((o) => (cond(o.when, where), actions(o.actions, where)));
      if ('if' in a) {
        cond(a.if, where);
        actions(a.then, where);
        actions(a.else ?? [], where);
      }
    }
  };

  for (const d of stage.interactables) {
    if (!objectNames.has(d.id)) errors.push(`interactable "${d.id}" has no object in the map`);
    cond(d.visibleWhen, d.id);
    d.names?.forEach((n) => cond(n.when, d.id));
    d.reactions.forEach((r) => (cond(r.when, d.id), actions(r.actions, d.id)));
  }
  for (const [name, list] of Object.entries(stage.scripts)) actions(list, `script ${name}`);
  actions(stage.intro, 'intro');
  stage.objectives.forEach((o) => cond(o.when, 'objectives'));
  return errors;
}
