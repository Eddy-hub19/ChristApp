import {
  GuessCharacterManager,
  IDLE_TTL_MS,
  guessCatalog,
} from './guess-character.manager';
import {
  MAX_QUESTIONS,
  ROUNDS_PER_MATCH,
  candidatesFor,
  poolForLevel,
} from './guess-character.engine';
import { getCharacter } from './data/characters';

type Msg = { userId: string; event: string; payload: any };

const ROOM = 'room-1';
const A = 'alice';
const B = 'bob';
/** Десять персонажів легкого рівня (рівень за замовчуванням), крім `except`: для «неправильних» здогадок. */
const wrongGuesses = (except: string) =>
  poolForLevel(1)
    .map((c) => c.id)
    .filter((id) => id !== except)
    .slice(0, MAX_QUESTIONS);
const PLAYERS: [string, string] = [A, B];

function setup(rng: () => number = () => 0, now: () => number = () => 1000) {
  const sent: Msg[] = [];
  const manager = new GuessCharacterManager(
    (userId, event, payload) => sent.push({ userId, event, payload }),
    rng,
    now,
  );
  /** Останній знімок, надісланий конкретному гравцеві. */
  const view = (userId: string) =>
    [...sent].reverse().find((m) => m.userId === userId)?.payload;
  const duel = {
    sync: (u: string) => manager.sync(ROOM, PLAYERS, u, false),
    presence: (u: string, p: boolean) =>
      manager.setPresence(ROOM, PLAYERS, u, false, p),
    level: (u: string, l: unknown) =>
      manager.selectLevel(ROOM, PLAYERS, u, false, l),
    ready: (u: string, r = true) =>
      manager.setReady(ROOM, PLAYERS, u, false, r),
    pick: (u: string, c: unknown) => manager.pick(ROOM, PLAYERS, u, false, c),
    ask: (u: string, t: unknown) => manager.ask(ROOM, PLAYERS, u, false, t),
    guess: (u: string, c: unknown) => manager.guess(ROOM, PLAYERS, u, false, c),
    next: (u: string) => manager.next(ROOM, PLAYERS, u, false),
    abort: (u: string) => manager.abort(ROOM, PLAYERS, u, false),
  };
  const solo = {
    sync: (u: string) => manager.sync(ROOM, PLAYERS, u, true),
    ready: (u: string) => manager.setReady(ROOM, PLAYERS, u, true, true),
    level: (u: string, l: unknown) =>
      manager.selectLevel(ROOM, PLAYERS, u, true, l),
    ask: (u: string, t: unknown) => manager.ask(ROOM, PLAYERS, u, true, t),
    guess: (u: string, c: unknown) => manager.guess(ROOM, PLAYERS, u, true, c),
    next: (u: string) => manager.next(ROOM, PLAYERS, u, true),
  };
  const startDuel = () => {
    duel.sync(A);
    duel.sync(B);
    duel.ready(A);
    duel.ready(B);
  };
  return { manager, sent, view, duel, solo, startDuel };
}

describe('lobby', () => {
  it('starts only when both players are ready; the first round starts with the secret being picked', () => {
    const { duel, view } = setup();
    duel.sync(A);
    duel.sync(B);
    duel.ready(A);
    expect(view(A).phase).toBe('lobby');
    duel.ready(B);
    expect(view(A).phase).toBe('picking');
    expect(view(A).round).toBe(1);
    expect(view(A).hiderId).toBe(A);
    expect(view(A).guesserId).toBe(B);
  });

  it('changing the level resets readiness and ignores unknown levels', () => {
    const { duel, view } = setup();
    duel.sync(A);
    duel.ready(A);
    duel.level(B, 2);
    expect(view(A).level).toBe(2);
    expect(view(A).ready[A]).toBe(false);
    duel.level(B, 99);
    expect(view(A).level).toBe(2);
  });

  it('ignores commands from people outside the chat', () => {
    const { manager, sent } = setup();
    manager.sync(ROOM, PLAYERS, 'mallory', false);
    manager.setReady(ROOM, PLAYERS, 'mallory', false, true);
    expect(sent).toHaveLength(0);
  });
});

describe('secrecy', () => {
  it('never sends the secret to the guesser before the round ends, but shows it to the hider', () => {
    const { duel, startDuel, view, sent } = setup();
    startDuel();
    duel.pick(A, 'moses');
    expect(view(A).secretId).toBe('moses');
    expect(view(B).secretId).toBeNull();
    duel.ask(B, 'male');
    duel.guess(B, 'aaron');
    // жоден пакет, надісланий відгадувачеві до кінця раунду, не містить id таємного персонажа чи його картки
    const toGuesser = JSON.stringify(
      sent.filter((m) => m.userId === B).map((m) => m.payload),
    );
    expect(toGuesser).not.toContain('"secretId":"moses"');
    expect(toGuesser).not.toContain('Мойсей');
    expect(view(B).reveal).toBeNull();
  });

  it('reveals the card to both players once the round is over', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'moses');
    duel.guess(B, 'moses');
    for (const u of [A, B]) {
      const r = view(u).reveal;
      expect(r.characterId).toBe('moses');
      expect(r.card.name.ua).toBe('Мойсей');
      expect(r.card.about.en.length).toBeGreaterThan(40);
      expect(r.card.refs[0].label.ua).toBe('Вих. 3:1-12');
    }
  });

  it('does not leak candidates to the hider and only gives them on the easy level', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'moses');
    expect(view(A).candidates).toBeNull();
    expect(view(B).candidates).toContain('moses');
    duel.level(B, 1); // у матчі рівень не міняється
    expect(view(B).level).toBe(1);

    const hard = setup();
    hard.duel.sync(A);
    hard.duel.sync(B);
    hard.duel.level(A, 3);
    hard.duel.ready(A);
    hard.duel.ready(B);
    hard.duel.pick(A, 'moses');
    expect(hard.view(B).candidates).toBeNull();
  });
});

describe('asking', () => {
  it('answers automatically from the trait table', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'moses');
    duel.ask(B, 'female');
    duel.ask(B, 'prophet');
    duel.ask(B, 'noDeath');
    duel.ask(B, 'warrior');
    expect(view(B).history).toEqual([
      { kind: 'question', trait: 'female', answer: 'no' },
      { kind: 'question', trait: 'prophet', answer: 'yes' },
      { kind: 'question', trait: 'noDeath', answer: 'no' },
      { kind: 'question', trait: 'warrior', answer: 'unknown' },
    ]);
    expect(view(A).history).toEqual(view(B).history); // загадувач бачить усі питання
  });

  it('lets only the guesser ask, only during the asking phase, and only real traits, once each', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.ask(B, 'male'); // ще обирають персонажа
    duel.pick(B, 'moses'); // відгадувач не може загадувати
    expect(view(B).phase).toBe('picking');
    duel.pick(A, 'nobody');
    expect(view(B).phase).toBe('picking');
    duel.pick(A, 'moses');
    duel.ask(A, 'male'); // загадувач не питає
    duel.ask(B, 'not-a-trait');
    duel.ask(B, 'male');
    duel.ask(B, 'male'); // повтор не рахується
    expect(view(B).history).toHaveLength(1);
  });

  it('narrows the easy-level hint list by the answers received', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'moses');
    const before = view(B).candidates.length;
    duel.ask(B, 'female');
    const after = view(B).candidates;
    expect(after.length).toBeLessThan(before);
    expect(after).toContain('moses');
    const expected = candidatesFor(poolForLevel(1), view(B).history).map(
      (c) => c.id,
    );
    expect(after).toEqual(expected);
    expect(
      after.every((id: string) => getCharacter(id)!.traits.female === 'no'),
    ).toBe(true);
  });

  it('keeps unknown answers as a separate class when narrowing', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'david');
    duel.ask(B, 'vision'); // у Давида — ні
    for (const id of view(B).candidates)
      expect(getCharacter(id)!.traits.vision).toBe('no');
  });
});

describe('guessing and scoring', () => {
  it('gives the maximum for a correct guess on the very first attempt', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'noah');
    duel.guess(B, 'noah');
    expect(view(B).phase).toBe('roundEnd');
    expect(view(B).reveal).toMatchObject({
      guessed: true,
      attempts: 1,
      points: 10,
    });
    expect(view(B).scores[B]).toBe(10);
    expect(view(B).scores[A]).toBe(0);
  });

  it('charges a wrong guess as one question', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'noah');
    duel.ask(B, 'male');
    duel.guess(B, 'adam');
    expect(view(B).phase).toBe('asking');
    expect(view(B).history).toHaveLength(2);
    expect(view(B).history[1]).toEqual({
      kind: 'guess',
      character: 'adam',
      correct: false,
    });
    duel.guess(B, 'adam'); // ту саму помилку двічі не приймаємо
    expect(view(B).history).toHaveLength(2);
    duel.guess(B, 'noah');
    expect(view(B).reveal).toMatchObject({
      guessed: true,
      attempts: 3,
      points: 8,
    });
  });

  it('ends the round with zero points after the tenth attempt without a correct guess', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'noah');
    const traits = [
      'female',
      'nt',
      'king',
      'apostle',
      'priest',
      'judge',
      'warrior',
      'fisherman',
      'shepherd',
      'official',
    ];
    expect(traits).toHaveLength(MAX_QUESTIONS);
    traits.slice(0, MAX_QUESTIONS - 1).forEach((t) => duel.ask(B, t));
    expect(view(B).phase).toBe('asking');
    duel.ask(B, traits[MAX_QUESTIONS - 1]);
    expect(view(B).phase).toBe('roundEnd');
    expect(view(B).reveal).toMatchObject({
      guessed: false,
      attempts: 10,
      points: 0,
      characterId: 'noah',
    });
  });

  it('ends the round when wrong guesses use up the limit too', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'noah');
    wrongGuesses('noah').forEach((id) => duel.guess(B, id));
    expect(view(B).phase).toBe('roundEnd');
    expect(view(B).reveal.guessed).toBe(false);
  });

  it('only accepts characters from the chosen level', () => {
    const { duel, view } = setup();
    duel.sync(A);
    duel.sync(B);
    duel.level(A, 1);
    duel.ready(A);
    duel.ready(B);
    duel.pick(A, 'nehemiah'); // складність 3 на легкому рівні — недоступний
    expect(view(A).phase).toBe('picking');
    duel.pick(A, 'noah');
    duel.guess(B, 'nehemiah');
    expect(view(B).history).toHaveLength(0);
  });
});

describe('full match', () => {
  it('plays four rounds, swaps roles every round and crowns the higher total', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    const secrets = ['moses', 'david', 'noah', 'jonah'];
    const attemptsPerRound = [1, 3, 2, 10];
    const expectedPoints = [10, 8, 9, 0];

    for (let r = 0; r < ROUNDS_PER_MATCH; r++) {
      const hider = r % 2 === 0 ? A : B;
      const guesser = hider === A ? B : A;
      expect(view(A).round).toBe(r + 1);
      expect(view(A).hiderId).toBe(hider);
      expect(view(A).guesserId).toBe(guesser);

      duel.pick(hider, secrets[r]);
      if (r === 3) {
        // не вгадав — десять невдалих здогадок
        wrongGuesses(secrets[r]).forEach((id) => duel.guess(guesser, id));
      } else {
        for (let i = 0; i < attemptsPerRound[r] - 1; i++)
          duel.ask(guesser, ['male', 'ot', 'prophet'][i]);
        duel.guess(guesser, secrets[r]);
      }
      expect(view(A).reveal.points).toBe(expectedPoints[r]);
      if (r < ROUNDS_PER_MATCH - 1) {
        expect(view(A).phase).toBe('roundEnd');
        duel.next(A);
      }
    }

    // Round 1 & 3: Bob guessed (10 + 9 = 19); round 2 & 4: Alice guessed (8 + 0 = 8)
    expect(view(A).phase).toBe('matchEnd');
    expect(view(A).scores).toEqual({ [A]: 8, [B]: 19 });
    expect(view(A).matchWinner).toBe(B);
    expect(view(B).matchWinner).toBe(B);
    expect(view(A).results).toHaveLength(4);
    expect(view(A).matches).toEqual([
      { n: 1, winner: B, scores: { [A]: 8, [B]: 19 } },
    ]);
  });

  it('declares a draw on equal totals', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    for (let r = 0; r < ROUNDS_PER_MATCH; r++) {
      const hider = r % 2 === 0 ? A : B;
      const guesser = hider === A ? B : A;
      duel.pick(hider, 'moses');
      duel.guess(guesser, 'moses');
      if (r < ROUNDS_PER_MATCH - 1) duel.next(B);
    }
    expect(view(A).phase).toBe('matchEnd');
    expect(view(A).matchWinner).toBeNull();
    expect(view(A).scores).toEqual({ [A]: 20, [B]: 20 });
  });

  it('keeps the final result visible until both are ready for a rematch, then starts a fresh match', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    for (let r = 0; r < ROUNDS_PER_MATCH; r++) {
      const hider = r % 2 === 0 ? A : B;
      duel.pick(hider, 'moses');
      duel.guess(hider === A ? B : A, 'moses');
      if (r < ROUNDS_PER_MATCH - 1) duel.next(A);
    }
    duel.ready(A);
    expect(view(B).phase).toBe('matchEnd');
    expect(view(B).scores[A]).toBe(20);
    duel.ready(B);
    expect(view(A).phase).toBe('picking');
    expect(view(A).round).toBe(1);
    expect(view(A).scores).toEqual({ [A]: 0, [B]: 0 });
    expect(view(A).matches).toHaveLength(1); // журнал матчів не втрачається
  });
});

describe('leaving and coming back', () => {
  it('keeps the round in the middle of asking when a player leaves and returns', () => {
    const { duel, manager, startDuel, view, sent } = setup();
    startDuel();
    duel.pick(A, 'solomon');
    duel.ask(B, 'king');
    duel.ask(B, 'kings');

    duel.presence(B, false);
    expect(view(A).present[B]).toBe(false);
    expect(view(A).phase).toBe('asking'); // жодних таймерів і програшів за вихід

    manager.userDisconnected(A);
    duel.ask(A, 'male'); // не його хід — ігнорується
    // Alice (загадувач) теж ушла: стан не пропав
    sent.length = 0;
    duel.sync(B);
    const back = view(B);
    expect(back.phase).toBe('asking');
    expect(back.history).toHaveLength(2);
    expect(back.secretId).toBeNull();
    duel.sync(A);
    expect(view(A).secretId).toBe('solomon');
    duel.ask(B, 'wroteBook');
    expect(view(A).history).toHaveLength(3);
  });

  it('keeps a half-picked state: the hider can pick after returning', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.presence(A, false);
    duel.sync(A);
    expect(view(A).phase).toBe('picking');
    duel.pick(A, 'eve');
    expect(view(B).phase).toBe('asking');
  });

  it('forgets sessions nobody touched for a long time', () => {
    let t = 1000;
    const { manager, duel, view } = setup(
      () => 0,
      () => t,
    );
    duel.sync(A);
    duel.ready(A);
    t += IDLE_TTL_MS + 1;
    manager.sweepIdle();
    duel.sync(A);
    expect(view(A).ready[A]).toBe(false); // свіжа сесія
  });

  it('abort returns to the lobby without recording a result', () => {
    const { duel, startDuel, view } = setup();
    startDuel();
    duel.pick(A, 'moses');
    duel.abort(B);
    expect(view(A).phase).toBe('lobby');
    expect(view(A).matches).toEqual([]);
    expect(view(B).reveal).toBeNull();
  });
});

describe('solo mode', () => {
  it('lets the computer pick the secret, never revealing it, and the player scores alone', () => {
    const { solo, view } = setup(() => 0); // rng=0 → перший персонаж пулу (Адам)
    solo.sync(A);
    solo.ready(A);
    expect(view(A).mode).toBe('solo');
    expect(view(A).phase).toBe('asking');
    expect(view(A).hiderId).toBeNull();
    expect(view(A).guesserId).toBe(A);
    expect(view(A).secretId).toBeNull();
    solo.ask(A, 'female');
    expect(view(A).history[0]).toMatchObject({ answer: 'no' });
    solo.guess(A, 'adam');
    expect(view(A).reveal).toMatchObject({
      characterId: 'adam',
      attempts: 2,
      points: 9,
    });
    expect(view(A).scores[A]).toBe(9);
    expect(view(A).phase).toBe('roundEnd');
  });

  it('picks a different secret from the right level pool and finishes after four rounds', () => {
    const picks = [0.0, 0.5, 0.99, 0.3];
    let i = 0;
    const { solo, view } = setup(() => picks[i++ % picks.length]);
    solo.sync(A);
    solo.level(A, 1);
    solo.ready(A);
    const pool = poolForLevel(1);
    const seen: string[] = [];
    for (let r = 0; r < ROUNDS_PER_MATCH; r++) {
      expect(view(A).round).toBe(r + 1);
      // Кого загадано, клієнт не знає: перебираємо весь пул, поки раунд не завершиться.
      for (const c of pool) {
        solo.guess(A, c.id);
        if (view(A).phase !== 'asking') break;
      }
      seen.push(view(A).reveal.characterId);
      if (r < ROUNDS_PER_MATCH - 1) solo.next(A);
    }
    expect(view(A).phase).toBe('matchEnd');
    expect(view(A).matchWinner).toBeNull();
    expect(new Set(seen).size).toBeGreaterThan(1);
    for (const id of seen) expect(pool.some((c) => c.id === id)).toBe(true);
  });

  it('does not touch the duel session of the same chat', () => {
    const { solo, duel, view } = setup();
    duel.sync(A);
    duel.sync(B);
    solo.sync(A);
    solo.ready(A);
    expect(view(B).phase).toBe('lobby');
    expect(view(B).mode).toBe('duel');
  });
});

describe('catalog', () => {
  it('lists characters without their trait tables', () => {
    const catalog = guessCatalog();
    expect(catalog.characters.length).toBeGreaterThanOrEqual(60);
    expect(JSON.stringify(catalog.characters[0])).not.toContain('traits');
    expect(catalog.traits.length).toBeGreaterThan(30);
    expect(catalog.maxQuestions).toBe(10);
    expect(catalog.rounds).toBe(4);
  });
});
