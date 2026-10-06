import { CHAT_VIEW_KEY, RoomViewRegistry, WATCH_VIEW_KEY } from './room-view.registry';

describe('RoomViewRegistry', () => {
  it('only people who are looking at the room right now are viewers', () => {
    const r = new RoomViewRegistry();
    r.setViewing('s1', 'u1', CHAT_VIEW_KEY('room'), true);
    r.setViewing('s2', 'u2', CHAT_VIEW_KEY('other'), true);
    expect(r.viewerIds(CHAT_VIEW_KEY('room'))).toEqual(['u1']);
    expect(r.isViewing('u2', CHAT_VIEW_KEY('room'))).toBe(false);
  });

  it('hidden / locked / socket lost: viewer disappears immediately', () => {
    const r = new RoomViewRegistry();
    r.setViewing('s1', 'u1', CHAT_VIEW_KEY('room'), true);
    r.setViewing('s1', 'u1', CHAT_VIEW_KEY('room'), false);
    expect(r.viewerIds(CHAT_VIEW_KEY('room'))).toEqual([]);
    r.setViewing('s1', 'u1', CHAT_VIEW_KEY('room'), true);
    expect(r.clearSocket('s1')).toBe(true); // disconnect
    expect(r.viewerIds(CHAT_VIEW_KEY('room'))).toEqual([]);
  });

  it('a keepalive request can clear a socket, but only its owner can', () => {
    const r = new RoomViewRegistry();
    r.setViewing('s1', 'u1', WATCH_VIEW_KEY('hall'), true);
    expect(r.clearSocket('s1', 'mallory')).toBe(false);
    expect(r.viewerIds(WATCH_VIEW_KEY('hall'))).toEqual(['u1']);
    expect(r.clearSocket('s1', 'u1')).toBe(true);
  });

  it('chat and cinema keys do not mix; a second device keeps the user a viewer', () => {
    const r = new RoomViewRegistry();
    r.setViewing('phone', 'u1', CHAT_VIEW_KEY('x'), true);
    r.setViewing('laptop', 'u1', CHAT_VIEW_KEY('x'), true);
    r.clearSocket('phone');
    expect(r.viewerIds(CHAT_VIEW_KEY('x'))).toEqual(['u1']);
    expect(r.viewerIds(WATCH_VIEW_KEY('x'))).toEqual([]);
  });
});
