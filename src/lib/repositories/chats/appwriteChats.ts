import { Databases, ID, Permission, Query, Role } from 'appwrite';

import { AppwriteClientConfig } from '../../appwrite/config';
import { ChatMessage, ChatThread } from '../../appwrite/models';
import { ChatsRepository } from './types';

type ChatDocument = {
  userId: string;
  title: string;
  messagesJson: string;
};

function toChatThread(doc: any): ChatThread {
  return {
    id: doc.$id,
    userId: doc.userId,
    title: doc.title,
    messages: JSON.parse(doc.messagesJson || '[]') as ChatMessage[],
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  };
}

export class AppwriteChatsRepository implements ChatsRepository {
  constructor(
    private readonly databases: Databases,
    private readonly config: AppwriteClientConfig,
    private readonly currentUserId: () => string
  ) {}

  async listChats(limit = 30): Promise<ChatThread[]> {
    const response = await this.databases.listDocuments(
      this.config.databaseId,
      this.config.chatsCollectionId,
      [Query.orderDesc('$updatedAt'), Query.limit(limit)]
    );

    return response.documents.map(toChatThread);
  }

  async saveChat(chat: ChatThread): Promise<ChatThread> {
    const data: ChatDocument = {
      userId: chat.userId,
      title: chat.title,
      messagesJson: JSON.stringify(chat.messages),
    };

    if (chat.id && !chat.id.startsWith('local-')) {
      const updated = await this.databases.updateDocument(
        this.config.databaseId,
        this.config.chatsCollectionId,
        chat.id,
        data
      );
      return toChatThread(updated);
    }

    const userId = this.currentUserId();
    const permissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ];

    const created = await this.databases.createDocument(
      this.config.databaseId,
      this.config.chatsCollectionId,
      ID.unique(),
      data,
      permissions
    );

    return toChatThread(created);
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.databases.deleteDocument(this.config.databaseId, this.config.chatsCollectionId, chatId);
  }
}
