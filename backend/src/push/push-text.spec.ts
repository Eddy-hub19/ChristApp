jest.mock('src/messages/book-sniff.util', () => ({
  bookPreviewLabel: (name: string) =>
    /\.(pdf|epub)$/i.test(name)
      ? `📖 ${name.replace(/\.(pdf|epub)$/i, '')}`
      : null,
}));
import { buildPushDisplay, pushMessageText } from './push-text';

describe('pushMessageText', () => {
  it('cleans text: legacy reply prefix, extra spaces', () => {
    expect(
      pushMessageText('TEXT', '[[reply:{"id":"1"}]]   Привіт   світ '),
    ).toBe('Привіт світ');
  });
  it('labels media and stickers', () => {
    expect(pushMessageText('VOICE', '')).toBe('🎤 Голосове');
    expect(pushMessageText('TEXT', '[[voice:abc]]')).toBe('🎤 Голосове');
    expect(pushMessageText('IMAGE', 'https://x/y.png')).toBe('🖼 Фото');
    expect(pushMessageText('FILE', 'a.docx')).toBe('📎 Файл');
    expect(pushMessageText('FILE', 'Book.pdf')).toBe('📖 Book');
    expect(pushMessageText('TEXT', '[[sticker:cat]]/stickers/cat.png')).toBe(
      'Стікер',
    );
    expect(pushMessageText('TEXT', '[[flock-invite:3]]')).toBe(
      '🐑 Запрошення в Отару',
    );
    expect(pushMessageText('TEXT', '[[flock-invite:0]]')).not.toContain('[[');
  });
  it('strips verse-share meta and HTML', () => {
    expect(
      pushMessageText(
        'TEXT',
        '[[verse-share:abc]]<p>В <b>начале</b> было&nbsp;Слово</p>',
      ),
    ).toBe('В начале было Слово');
  });
  it('is empty for empty content', () => {
    expect(pushMessageText('TEXT', '   ')).toBe('');
  });
});

describe('buildPushDisplay', () => {
  it('DM: title is the sender, body the message', () => {
    expect(
      buildPushDisplay({ kind: 'dm', senderName: 'Ed', text: 'hi' }),
    ).toEqual({ title: 'Ed', body: 'hi' });
  });
  it('group: title is the room, body "<name>: <message>"', () => {
    expect(
      buildPushDisplay({
        kind: 'group',
        senderName: 'Ed',
        roomTitle: 'Молитва',
        text: 'hi',
      }),
    ).toEqual({
      title: 'Молитва',
      body: 'Ed: hi',
    });
  });
  it('cinema: "🎬 <room>"', () => {
    expect(
      buildPushDisplay({
        kind: 'watch',
        senderName: 'Ed',
        roomTitle: 'Вечір',
        text: 'hi',
      }).title,
    ).toBe('🎬 Вечір');
  });
  it('replies to the recipient are labelled', () => {
    expect(
      buildPushDisplay({
        kind: 'dm',
        senderName: 'Ed',
        text: 'ok',
        isReplyToRecipient: true,
      }).body,
    ).toBe('Ed відповів(ла) вам: ok');
  });
  it('truncates long text to one line', () => {
    expect(
      buildPushDisplay({ kind: 'dm', senderName: 'Ed', text: 'x'.repeat(400) })
        .body.length,
    ).toBeLessThanOrEqual(220);
  });
});
