import { ChatThread } from '../../appwrite/models';

export type ChatsRepository = {
  listChats(limit?: number): Promise<ChatThread[]>;
  saveChat(chat: ChatThread): Promise<ChatThread>;
  deleteChat(chatId: string): Promise<void>;
};
