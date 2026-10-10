import { MessageType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';

jest.mock(
  'src/messages/messages.service',
  () => ({
    MessagesService: class MessagesService {},
  }),
  { virtual: true },
);

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

jest.mock(
  'src/push/push.service',
  () => ({
    PushService: class PushService {},
  }),
  { virtual: true },
);

type SocketUser = {
  id: string;
  username: string;
  nickname: string | null;
};

type MockClient = {
  data: {
    user?: SocketUser;
  };
  handshake: {
    auth?: {
      token?: string;
    };
    headers?: {
      authorization?: string;
    };
  };
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  to: jest.Mock;
  disconnect: jest.Mock;
};

function createClient(user: SocketUser): MockClient {
  return {
    data: { user },
    handshake: {},
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn(() => ({ emit: jest.fn() })),
    disconnect: jest.fn(),
  };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let prisma: {
    room: { findUnique: jest.Mock };
    roomMember: { findUnique: jest.Mock };
    roomReadState: { findMany: jest.Mock };
  };
  let messagesService: {
    createRoomMessage: jest.Mock;
    markRoomAsRead: jest.Mock;
    getRoomMessages: jest.Mock;
    deleteMessageForUser: jest.Mock;
    resolveReplyTarget: jest.Mock;
    findByClientMessageId: jest.Mock;
  };
  let pushService: {
    sendChatMessagePush: jest.Mock;
  };
  let roomEmit: jest.Mock;

  beforeEach(() => {
    prisma = {
      room: {
        findUnique: jest.fn(),
      },
      roomMember: {
        findUnique: jest.fn(),
      },
      roomReadState: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    messagesService = {
      createRoomMessage: jest.fn(),
      markRoomAsRead: jest.fn().mockResolvedValue(undefined),
      getRoomMessages: jest.fn(),
      deleteMessageForUser: jest.fn(),
      resolveReplyTarget: jest.fn().mockResolvedValue(null),
      findByClientMessageId: jest.fn().mockResolvedValue(null),
    };

    pushService = {
      sendChatMessagePush: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new ChatGateway(
      {} as JwtService,
      prisma as never,
      messagesService as never,
      pushService as never,
    );

    roomEmit = jest.fn();
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      emit: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([]),
    };

    prisma.room.findUnique.mockResolvedValue({ title: 'private-room' });
  });

  it('delivers latest room history to user on join', async () => {
    const client = createClient({
      id: 'u2',
      username: 'receiver',
      nickname: 'receiver',
    });
    const history = [
      {
        id: 'm1',
        content: 'Первое',
        createdAt: new Date('2026-03-13T10:00:00.000Z'),
      },
      {
        id: 'm2',
        content: 'Последнее сообщение',
        createdAt: new Date('2026-03-13T10:01:00.000Z'),
      },
    ];

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u2' });
    messagesService.getRoomMessages.mockResolvedValue(history);

    await gateway.handleJoinRoom(
      { roomId: 'room-1', limit: 50, skip: 0 },
      client as never,
    );

    const roomHistoryCall = client.emit.mock.calls.find(
      ([eventName]: [string]) => eventName === 'roomHistory',
    );

    expect(roomHistoryCall).toBeDefined();
    expect(roomHistoryCall?.[1]?.messages?.at(-1)?.content).toBe(
      'Последнее сообщение',
    );
    expect(messagesService.markRoomAsRead).toHaveBeenCalledWith(
      'room-1',
      'u2',
      expect.any(Date),
    );
  });

  describe('clientMessageId (ідемпотентність відправки)', () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const saved = {
      id: 'm9',
      type: MessageType.TEXT,
      content: 'Привіт',
      fileUrl: null,
      createdAt: new Date('2026-03-13T10:05:00.000Z'),
      senderId: 'u1',
      roomId: 'room-1',
      clientMessageId: 'cid-1',
      sender: { username: 'sender', nickname: 'sender' },
    };

    it('зберігає clientMessageId й повертає його в ехо всій кімнаті', async () => {
      const client = createClient(sender);
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.createRoomMessage.mockResolvedValue(saved);

      await gateway.handleMessage(
        { roomId: 'room-1', content: 'Привіт', clientMessageId: 'cid-1' },
        client as never,
      );

      expect(messagesService.createRoomMessage).toHaveBeenCalledWith(
        expect.objectContaining({ clientMessageId: 'cid-1' }),
      );
      expect(roomEmit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'm9', clientMessageId: 'cid-1' }),
      );
    });

    it('повтор із тим самим id не створює дубль і лише повертає ехо відправнику', async () => {
      const client = createClient(sender);
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.findByClientMessageId.mockResolvedValue(saved);

      await gateway.handleMessage(
        { roomId: 'room-1', content: 'Привіт', clientMessageId: 'cid-1' },
        client as never,
      );

      expect(messagesService.createRoomMessage).not.toHaveBeenCalled();
      expect(roomEmit).not.toHaveBeenCalled();
      expect(pushService.sendChatMessagePush).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'm9', clientMessageId: 'cid-1' }),
      );
    });

    it('гонка: унікальний індекс відхилив другу відправку — віддається ехо першої', async () => {
      const client = createClient(sender);
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.findByClientMessageId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(saved);
      messagesService.createRoomMessage.mockRejectedValue({ code: 'P2002' });

      await gateway.handleMessage(
        { roomId: 'room-1', content: 'Привіт', clientMessageId: 'cid-1' },
        client as never,
      );

      expect(roomEmit).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'm9', clientMessageId: 'cid-1' }),
      );
      expect(client.emit).not.toHaveBeenCalledWith(
        'error',
        expect.anything(),
      );
    });

    it('некоректний clientMessageId ігнорується (звичайна відправка)', async () => {
      const client = createClient(sender);
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.createRoomMessage.mockResolvedValue({
        ...saved,
        clientMessageId: null,
      });

      await gateway.handleMessage(
        { roomId: 'room-1', content: 'Привіт', clientMessageId: 'bad id!' },
        client as never,
      );

      expect(messagesService.findByClientMessageId).not.toHaveBeenCalled();
      expect(messagesService.createRoomMessage).toHaveBeenCalledWith(
        expect.objectContaining({ clientMessageId: undefined }),
      );
    });
  });

  it('sends message to room and triggers push for recipient', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);
    const savedMessage = {
      id: 'm3',
      type: MessageType.TEXT,
      content: 'Свежое сообщение для получателя',
      fileUrl: null,
      createdAt: new Date('2026-03-13T10:02:00.000Z'),
      senderId: 'u1',
      sender: {
        username: 'sender',
        nickname: 'sender',
      },
    };

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
    messagesService.createRoomMessage.mockResolvedValue(savedMessage);

    await gateway.handleMessage(
      { roomId: 'room-1', content: 'Свежое сообщение для получателя' },
      client as never,
    );

    // Автор передаётся из сокета: createRoomMessage не делает лишних запросов (include sender) до emit.
    expect(messagesService.createRoomMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEXT',
        content: 'Свежое сообщение для получателя',
        senderId: 'u1',
        roomId: 'room-1',
        sender: { username: 'sender', nickname: 'sender' },
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith('newMessage', {
      id: 'm3',
      content: 'Свежое сообщение для получателя',
      type: MessageType.TEXT,
      fileUrl: undefined,
      username: 'sender',
      handle: 'sender',
      senderId: 'u1',
      createdAt: savedMessage.createdAt,
      roomId: 'room-1',
      reactions: [],
    });

    expect(pushService.sendChatMessagePush).toHaveBeenCalledWith({
      messageId: 'm3',
      roomId: 'room-1',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Свежое сообщение для получателя',
      messageType: MessageType.TEXT,
      fileUrl: null,
      createdAt: savedMessage.createdAt,
      excludeUserIds: [],
    });
  });

  it('stores replyToId and pushes "replied to you" for the original author', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);
    const savedMessage = {
      id: 'm4',
      type: MessageType.TEXT,
      content: 'Согласен',
      fileUrl: null,
      createdAt: new Date('2026-03-13T10:03:00.000Z'),
      senderId: 'u1',
      sender: { username: 'sender', nickname: 'sender' },
      replyToId: 'm1',
      replyTo: { id: 'm1', deleted: true as const },
    };

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
    messagesService.resolveReplyTarget.mockResolvedValue({
      id: 'm1',
      senderId: 'u2',
    });
    messagesService.createRoomMessage.mockResolvedValue(savedMessage);

    await gateway.handleMessage(
      { roomId: 'room-1', content: 'Согласен', replyToId: 'm1' },
      client as never,
    );

    expect(messagesService.resolveReplyTarget).toHaveBeenCalledWith(
      'room-1',
      'm1',
    );
    expect(messagesService.createRoomMessage).toHaveBeenCalledWith(
      expect.objectContaining({ replyToId: 'm1' }),
    );
    expect(roomEmit).toHaveBeenCalledWith(
      'newMessage',
      expect.objectContaining({
        replyToId: 'm1',
        replyTo: savedMessage.replyTo,
      }),
    );
    expect(pushService.sendChatMessagePush).toHaveBeenCalledWith(
      expect.objectContaining({ repliedToUserId: 'u2' }),
    );
  });

  it('does not send message when user has no room access', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    prisma.roomMember.findUnique.mockResolvedValue(null);

    await gateway.handleMessage(
      { roomId: 'room-1', content: 'Сообщение' },
      client as never,
    );

    expect(client.emit).toHaveBeenCalledWith('error', 'Нет доступа');
    expect(messagesService.createRoomMessage).not.toHaveBeenCalled();
    expect(pushService.sendChatMessagePush).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });

  describe('шлях до emit (затримка доставки)', () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const saved = {
      id: 'm20',
      type: MessageType.TEXT,
      content: 'Швидко',
      fileUrl: null,
      createdAt: new Date('2026-03-13T10:07:00.000Z'),
      senderId: 'u1',
      sender: { username: 'sender', nickname: 'sender' },
    };

    it('розсилає newMessage, не чекаючи запису read receipt у БД', async () => {
      const client = createClient(sender);
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.createRoomMessage.mockResolvedValue(saved);
      // Запис read receipt «висить» — emit мусить відбутись раніше.
      let releaseRead!: () => void;
      messagesService.markRoomAsRead.mockReturnValue(
        new Promise<void>((resolve) => {
          releaseRead = resolve;
        }),
      );

      const pending = gateway.handleMessage(
        { roomId: 'room-1', content: 'Швидко' },
        client as never,
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(roomEmit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'm20' }),
      );
      expect(pushService.sendChatMessagePush).toHaveBeenCalled();

      releaseRead();
      await pending;
      expect(messagesService.markRoomAsRead).toHaveBeenCalledWith(
        'room-1',
        'u1',
        saved.createdAt,
      );
    });

    it('збій запису read receipt не перетворює збережене повідомлення на «Ошибка сохранения»', async () => {
      const client = createClient(sender);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
      messagesService.createRoomMessage.mockResolvedValue(saved);
      messagesService.markRoomAsRead.mockRejectedValue(new Error('db down'));

      await gateway.handleMessage(
        { roomId: 'room-1', content: 'Швидко' },
        client as never,
      );

      expect(roomEmit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'm20' }),
      );
      expect(client.emit).not.toHaveBeenCalledWith(
        'error',
        'Ошибка сохранения сообщения',
      );
      errorSpy.mockRestore();
    });
  });

  it('rejects send when user is not a participant of dm title despite membership row', async () => {
    const sender = { id: 'u3', username: 'intruder', nickname: 'intruder' };
    const client = createClient(sender);

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u3' });
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });

    await gateway.handleMessage(
      { roomId: 'room-dm', content: 'Сообщение' },
      client as never,
    );

    expect(client.emit).toHaveBeenCalledWith('error', 'Нет доступа');
    expect(messagesService.createRoomMessage).not.toHaveBeenCalled();
  });

  it('deletes own message in global room and emits messageDeleted', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    messagesService.deleteMessageForUser.mockResolvedValue({
      ok: true,
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });

    await gateway.handleDeleteMessage(
      { messageId: 'm-global-1' },
      client as never,
    );

    expect(messagesService.deleteMessageForUser).toHaveBeenCalledWith(
      'm-global-1',
      'u1',
      { allowDeleteOthers: false },
    );

    expect(roomEmit).toHaveBeenCalledWith('messageDeleted', {
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });

    expect(client.emit).toHaveBeenCalledWith('deleteMessageResult', {
      ok: true,
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('rejects delete when message belongs to another user', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    messagesService.deleteMessageForUser.mockResolvedValue({
      ok: false,
      reason: 'not-owner',
    });

    await gateway.handleDeleteMessage(
      { messageId: 'm-foreign' },
      client as never,
    );

    expect(client.emit).toHaveBeenCalledWith('deleteMessageResult', {
      ok: false,
      messageId: 'm-foreign',
      error: 'Можно удалять только свои сообщения',
    });
    expect(roomEmit).not.toHaveBeenCalledWith(
      'messageDeleted',
      expect.anything(),
    );
  });

  it('allows admin to delete foreign message', async () => {
    const admin = { id: 'admin-1', username: 'neskai', nickname: 'neskai' };
    const client = createClient(admin);

    messagesService.deleteMessageForUser.mockResolvedValue({
      ok: true,
      messageId: 'm-foreign',
      roomId: 'room-1',
    });

    await gateway.handleDeleteMessage(
      { messageId: 'm-foreign' },
      client as never,
    );

    expect(messagesService.deleteMessageForUser).toHaveBeenCalledWith(
      'm-foreign',
      'admin-1',
      { allowDeleteOthers: true },
    );

    expect(roomEmit).toHaveBeenCalledWith('messageDeleted', {
      messageId: 'm-foreign',
      roomId: 'room-1',
    });
  });
});
