import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

import './index.css';
import { getBrowserAppwriteServices } from './src/lib/appwrite/client';
import { AppUser, ChatMessage, ChatThread, UserSettings } from './src/lib/appwrite/models';
import { AppwriteAuthRepository } from './src/lib/repositories/auth/appwriteAuth';
import { AppwriteChatsRepository } from './src/lib/repositories/chats/appwriteChats';
import { AppwriteSettingsRepository, DEFAULT_USER_SETTINGS } from './src/lib/repositories/settings/appwriteSettings';

const API_KEY_STORAGE_KEY = 'boothHunter.userApiKey';

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function createDraftChat(userId: string): ChatThread {
  const now = new Date().toISOString();
  return {
    id: `local-${globalThis.crypto?.randomUUID?.() || now}` ,
    userId,
    title: '新对话',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function chatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  return (firstUser?.content || '新对话').slice(0, 40);
}

function useLocalStorageString(key: string, initialValue = '') {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue;
    return window.localStorage.getItem(key) || initialValue;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function App() {
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [authRepo, setAuthRepo] = useState<AppwriteAuthRepository | null>(null);
  const [settingsRepo, setSettingsRepo] = useState<AppwriteSettingsRepository | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [messageDraft, setMessageDraft] = useState('');
  const [apiKey, setApiKey] = useLocalStorageString(API_KEY_STORAGE_KEY, '');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    try {
      const services = getBrowserAppwriteServices();
      setAuthRepo(new AppwriteAuthRepository(services.account));
      setSettingsRepo(new AppwriteSettingsRepository(services.account));
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : 'Appwrite 初始化失败。');
    }
  }, []);

  const chatsRepo = useMemo(() => {
    if (!user) return null;
    try {
      const services = getBrowserAppwriteServices();
      return new AppwriteChatsRepository(services.databases, services.config, () => user.id);
    } catch {
      return null;
    }
  }, [user]);

  useEffect(() => {
    if (!authRepo || !settingsRepo) return;
    authRepo.getCurrentUser().then(async (currentUser) => {
      if (!currentUser) return;
      setUser(currentUser);
      setDisplayName(String(currentUser.prefs.displayName || currentUser.name || ''));
      const loadedSettings = await settingsRepo.getSettings();
      setSettings(loadedSettings);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '读取当前用户失败。'));
  }, [authRepo, settingsRepo]);

  useEffect(() => {
    if (!chatsRepo || !user) return;
    chatsRepo.listChats().then((items) => {
      const nextThreads = items.length > 0 ? items : [createDraftChat(user.id)];
      setThreads(nextThreads);
      setActiveChatId((current) => current || nextThreads[0].id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '读取历史对话失败。'));
  }, [chatsRepo, user]);

  const activeThread = threads.find((thread) => thread.id === activeChatId) || null;

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authRepo) return;
    setBusy(true);
    setError(null);
    try {
      const currentUser = authMode === 'sign-up'
        ? await authRepo.signUp({ email, password, name: displayName || email.split('@')[0] })
        : await authRepo.signIn({ email, password });
      setUser(currentUser);
      setDisplayName(String(currentUser.prefs.displayName || currentUser.name || ''));
      setThreads([createDraftChat(currentUser.id)]);
      setActiveChatId('');
      setStatus(authMode === 'sign-up' ? '注册并登录成功。' : '登录成功。');
      if (settingsRepo) {
        const loadedSettings = await settingsRepo.getSettings();
        setSettings(loadedSettings);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '认证失败。');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (!authRepo) return;
    setBusy(true);
    try {
      await authRepo.signOut();
      setUser(null);
      setThreads([]);
      setActiveChatId('');
      setStatus('已退出登录。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '退出登录失败。');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settingsRepo) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await settingsRepo.saveSettings({
        ...settings,
        displayName,
      });
      setSettings(saved);
      setStatus('设置已保存到 Appwrite。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存设置失败。');
    } finally {
      setBusy(false);
    }
  }

  async function persistThread(thread: ChatThread) {
    if (!chatsRepo) return thread;
    const saved = await chatsRepo.saveChat({
      ...thread,
      title: chatTitle(thread.messages),
      updatedAt: new Date().toISOString(),
    });
    setThreads((current) => {
      const others = current.filter((item) => item.id !== thread.id);
      return [saved, ...others];
    });
    setActiveChatId(saved.id);
    return saved;
  }

  function handleNewChat() {
    if (!user) return;
    const next = createDraftChat(user.id);
    setThreads((current) => [next, ...current]);
    setActiveChatId(next.id);
    setMessageDraft('');
  }

  async function handleDeleteChat(chatId: string) {
    if (!chatsRepo) return;
    const target = threads.find((thread) => thread.id === chatId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      if (!target.id.startsWith('local-')) {
        await chatsRepo.deleteChat(target.id);
      }
      const nextThreads = threads.filter((thread) => thread.id !== chatId);
      setThreads(nextThreads);
      setActiveChatId(nextThreads[0]?.id || '');
      setStatus('对话已删除。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除对话失败。');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeThread || !messageDraft.trim()) return;
    if (!apiKey.trim()) {
      setError('请先在右侧设置你的 LLM API key（只保存在本地浏览器）。');
      return;
    }

    const userMessage = createMessage('user', messageDraft.trim());
    const optimisticThread: ChatThread = {
      ...activeThread,
      messages: [...activeThread.messages, userMessage],
      updatedAt: new Date().toISOString(),
    };

    setThreads((current) => current.map((thread) => thread.id === activeThread.id ? optimisticThread : thread));
    setMessageDraft('');
    setBusy(true);
    setError(null);
    setStatus('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: {
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey,
            temperature: settings.temperature,
          },
          messages: optimisticThread.messages.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : message.role,
            content: message.content,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || '聊天请求失败。');
      }

      const assistantMessage = createMessage('assistant', String(payload.reply || ''));
      await persistThread({
        ...optimisticThread,
        messages: [...optimisticThread.messages, assistantMessage],
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setThreads((current) => current.map((thread) => thread.id === activeThread.id ? activeThread : thread));
      setMessageDraft(userMessage.content);
      setError(reason instanceof Error ? reason.message : '聊天失败。');
    } finally {
      setBusy(false);
    }
  }

  if (bootstrapError) {
    return (
      <div className="min-h-screen bg-[#0b1020] text-white p-8">
        <h1 className="text-2xl font-bold mb-4">Booth Hunter · Phase 1</h1>
        <p className="text-zinc-300 mb-2">前端缺少 Appwrite 配置，无法初始化。</p>
        <pre className="bg-black/30 p-4 rounded-xl overflow-x-auto text-sm">{bootstrapError}</pre>
        <p className="text-zinc-400 mt-4">请至少配置：VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / VITE_APPWRITE_DATABASE_ID</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1020] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold mb-2">Booth Hunter · Phase 1</h1>
          <p className="text-zinc-300 mb-6">Appwrite 托管登录 / 聊天 / 设置；BOOTH 数据库与知识库在本地构建。</p>
          <div className="flex gap-2 mb-4">
            <button className={`flex-1 rounded-xl px-4 py-2 ${authMode === 'sign-in' ? 'bg-white text-black' : 'bg-white/10 text-white'}`} onClick={() => setAuthMode('sign-in')}>登录</button>
            <button className={`flex-1 rounded-xl px-4 py-2 ${authMode === 'sign-up' ? 'bg-white text-black' : 'bg-white/10 text-white'}`} onClick={() => setAuthMode('sign-up')}>注册</button>
          </div>
          <form className="space-y-3" onSubmit={handleAuthSubmit}>
            {authMode === 'sign-up' && (
              <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="显示名称（可选）" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            )}
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold" disabled={busy}>
              {busy ? '处理中…' : authMode === 'sign-up' ? '注册并登录' : '登录'}
            </button>
          </form>
          {error && <p className="text-rose-300 mt-4 text-sm">{error}</p>}
          {status && <p className="text-emerald-300 mt-4 text-sm">{status}</p>}
        </div>
        <Analytics />
      </div>
    );
  }

  const thread = activeThread || (threads[0] || createDraftChat(user.id));

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px] gap-4 p-4">
        <aside className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold">对话</div>
              <div className="text-xs text-zinc-400">{user.email}</div>
            </div>
            <button className="rounded-xl bg-white text-black px-3 py-2 text-sm" onClick={handleNewChat}>新建</button>
          </div>
          <div className="space-y-2">
            {threads.map((item) => (
              <button key={item.id} onClick={() => setActiveChatId(item.id)} className={`w-full text-left rounded-2xl border px-3 py-3 ${item.id === thread.id ? 'border-white bg-white/10' : 'border-white/10 bg-black/10'}`}>
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-xs text-zinc-400 mt-1">{new Date(item.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
          {thread && (
            <button className="mt-4 w-full rounded-xl border border-rose-400/30 px-3 py-2 text-rose-200" onClick={() => handleDeleteChat(thread.id)} disabled={busy}>删除当前对话</button>
          )}
        </aside>

        <main className="rounded-3xl border border-white/10 bg-white/5 p-4 flex flex-col min-h-[70vh]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">Booth Hunter · Local-first Phase 1</h1>
              <p className="text-sm text-zinc-400">当前重点是数据库 / 知识库构建，因此这里只保留最小对话入口。</p>
            </div>
            <button className="rounded-xl border border-white/10 px-3 py-2" onClick={handleSignOut} disabled={busy}>退出登录</button>
          </div>

          <div className="flex-1 overflow-y-auto rounded-2xl bg-black/20 p-4 space-y-3">
            {thread.messages.length === 0 ? (
              <p className="text-zinc-400">还没有消息。你可以先在右侧配置 provider/model，然后发送一条测试消息。</p>
            ) : thread.messages.map((message) => (
              <div key={message.id} className={`rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-white text-black ml-auto max-w-[85%]' : 'bg-white/10 max-w-[90%]'}`}>
                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">{message.role}</div>
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="mt-4 space-y-3">
            <textarea className="w-full min-h-32 rounded-2xl bg-black/30 px-4 py-3" placeholder="输入你要发送给模型的内容…" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} />
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-400">API key 只保存在当前浏览器本地，不会上传到 Appwrite。</div>
              <button className="rounded-xl bg-white px-4 py-2 text-black font-semibold" disabled={busy}>
                {busy ? '发送中…' : '发送'}
              </button>
            </div>
            {error && <div className="text-sm text-rose-300">{error}</div>}
            {status && <div className="text-sm text-emerald-300">{status}</div>}
          </form>
        </main>

        <aside className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold mb-4">用户设置</h2>
          <form className="space-y-3" onSubmit={handleSaveSettings}>
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="显示名称" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="Provider 标签（可选）" value={settings.providerLabel || ''} onChange={(event) => setSettings((current) => ({ ...current, providerLabel: event.target.value }))} />
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="Base URL" value={settings.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))} />
            <input className="w-full rounded-xl bg-black/30 px-4 py-3" placeholder="Model" value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} />
            <label className="block text-sm text-zinc-400">Temperature: {settings.temperature.toFixed(2)}</label>
            <input className="w-full" type="range" min="0" max="1" step="0.05" value={settings.temperature} onChange={(event) => setSettings((current) => ({ ...current, temperature: Number(event.target.value) }))} />
            <textarea className="w-full min-h-28 rounded-xl bg-black/30 px-4 py-3" placeholder="你的 API key（只保存在本地浏览器）" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <button className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold" disabled={busy}>保存云端设置</button>
          </form>

          <div className="mt-6 rounded-2xl bg-black/20 p-4 text-sm text-zinc-300 space-y-2">
            <div>• 云端（Appwrite）：登录、聊天记录、非敏感设置、后续 compact catalog。</div>
            <div>• 本地：BOOTH raw SQLite、图片缓存、caption/OCR、embeddings。</div>
            <div>• 你现在可以把这个页面当成最小调试前端；真正的 Phase 1 核心在本地脚本。</div>
          </div>
        </aside>
      </div>
      <Analytics />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
