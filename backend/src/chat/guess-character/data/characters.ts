import type { Character, CharacterDef } from './character.types';
import { OT_EARLY } from './characters.ot-early';
import { OT_LATE } from './characters.ot-late';
import { NT } from './characters.nt';
import { TRAIT_IDS, type TraitId, type TraitValue } from './traits';

export function resolveCharacter(def: CharacterDef): Character {
  const yes = new Set<TraitId>(def.yes);
  const unknown = new Set<TraitId>(def.unknown ?? []);
  const traits = {} as Record<TraitId, TraitValue>;
  for (const id of TRAIT_IDS) {
    traits[id] = yes.has(id) ? 'yes' : unknown.has(id) ? 'unknown' : 'no';
  }
  const { yes: _yes, unknown: _unknown, ...rest } = def;
  void _yes;
  void _unknown;
  return { ...rest, traits };
}

export const CHARACTER_DEFS: readonly CharacterDef[] = [
  ...OT_EARLY,
  ...OT_LATE,
  ...NT,
];
export const CHARACTERS: readonly Character[] =
  CHARACTER_DEFS.map(resolveCharacter);

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
export const getCharacter = (id: unknown): Character | undefined =>
  typeof id === 'string' ? BY_ID.get(id) : undefined;
