/**
 * Єдина фабрика ключів React Query. Усі `useQuery` / `setQueryData` / `invalidateQueries` беруть ключі звідси,
 * тож ієрархія (корінь → частини) видна в одному місці, а інвалідація по префіксу не розходиться з реальними ключами.
 * Старі експорти (`chatRoomHistoryQueryKey`, `watchRoomsQueryKey`, …) лишились тонкими обгортками над цією фабрикою.
 */
export const queryKeys = {
  auth: {
    root: ["auth", "me"] as const,
    me: (userId: string | undefined) =>
      ["auth", "me", userId ?? "none"] as const,
  },
  user: {
    directory: () => ["users", "directory"] as const,
    avatarLikesMe: () => ["users", "me", "avatar-likes"] as const,
    avatarLikes: (userId: string) =>
      ["users", userId, "avatar-likes"] as const,
  },
  chat: {
    /** Список кімнат поточного користувача (наповнюється сокетом `myRooms`). */
    list: (userId: string | null | undefined) =>
      ["chat", "my-rooms", userId ?? "anonymous"] as const,
    history: (roomId: string | null | undefined) =>
      ["chat", "room-history", roomId ?? "none"] as const,
  },
  push: {
    unreadSummary: (userId: string | undefined) =>
      ["push", "unread-summary", userId ?? "anonymous"] as const,
    status: (userId: string | undefined) =>
      ["push", "status", userId ?? "anonymous"] as const,
  },
  cinema: {
    root: () => ["watch-rooms"] as const,
    rooms: (userId: string | undefined) =>
      ["watch-rooms", userId ?? "anonymous"] as const,
  },
  movies: {
    search: (lang: string, q: string) => ["movies", "search", lang, q] as const,
  },
  admin: {
    members: () => ["admin", "members"] as const,
    server: () => ["admin", "server"] as const,
  },
  verses: {
    saved: () => ["verses", "saved"] as const,
  },
  bible: {
    translations: () => ["bible", "translations"] as const,
    books: (translation: string) => ["bible", "books", translation] as const,
    chapters: (translation: string, bookId: string) =>
      ["bible", "chapters", translation, bookId] as const,
    chapterText: (translation: string, bookId: string, chapter: number) =>
      ["chapter", translation, bookId, chapter] as const,
    dailyBread: (translation: string) =>
      ["daily-bread", translation] as const,
  },
} as const;
