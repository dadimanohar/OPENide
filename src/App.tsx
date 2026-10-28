import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Braces, Check, ChevronDown, ChevronRight, CircleAlert, CircleHelp, Code2, File, FileCode2, FolderOpen, Globe, HardDrive, History, KeyRound, LayoutGrid, LoaderCircle, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";

type View = "chat" | "history" | "ide" | "providers";
type Message = { id: string; role: "user" | "assistant"; text: string; model?: string };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };
type Provider = { id: string; name: string; baseUrl: string; model: string; kind: "ollama" | "openai"; hasApiKey?: boolean };
const HISTORY_KEY = "openide.conversations.v1";
const PROVIDERS_KEY = "openide.providers.v1";
const DEFAULT: Provider = { id: "ollama", name: "Ollama local", baseUrl: "http://127.0.0.1:11434", model: "qwen2.5-coder:7b", kind: "ollama" };
const STARTER_FILES = [
  { name: "README.md", icon: File, language: "markdown", content: "# Welcome to your workspace\n\nOpen a project folder to start building with your local model.\n" },
  { name: "App.tsx", icon: FileCode2, language: "typescript", content: "export default function App() {\n  return (\n    <main>\n      <h1>Your next idea starts here.</h1>\n      <p>Ask your AI to help you make it real.</p>\n    </main>\n  );\n}\n" },
  { name: "styles.css", icon: FileCode2, language: "css", content: ":root {\n  font-family: Inter, sans-serif;\n  color: #182033;\n}\n\nmain {\n  max-width: 960px;\n  margin: 0 auto;\n  padding: 3rem;\n}\n" },
  { name: "package.json", icon: Braces, language: "json", content: '{\n  "name": "my-project",\n  "private": true,\n  "scripts": { "dev": "vite" }\n}\n' },
];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function stored<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function App() {
  const [view, setView] = useState<View>("chat");
  const [sidebar, setSidebar] = useState(true);
  const [chats, setChats] = useState<Conversation[]>(() => stored(HISTORY_KEY, []));
  const [active, setActive] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>(() => stored(PROVIDERS_KEY, [DEFAULT]));
  const [providerId, setProviderId] = useState(() => sessionStorage.getItem("openide.activeProvider") || "ollama");
  const [keysRevision, setKeysRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [providerForm, setProviderForm] = useState({ name: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "" });
  const [files, setFiles] = useState(STARTER_FILES);
  const [selectedFile, setSelectedFile] = useState("App.tsx");
  const [agentDraft, setAgentDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const provider = providers.find((item) => item.id === providerId) ?? providers[0] ?? DEFAULT;
  const conversation = chats.find((item) => item.id === active);
  const messages = conversation?.messages ?? [];
  const filtered = useMemo(() => chats.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  const getKey = (id: string) => sessionStorage.getItem(`openide.key.${id}`) || "";
  const effectiveProvider = providers.find((item) => item.id === providerId) ?? providers[0] ?? DEFAULT;
  const isOllamaProvider = (item: Provider) => item.kind === "ollama" && new URL(item.baseUrl).hostname === "127.0.0.1";
  const selectedProviderHasKey = !effectiveProvider.hasApiKey || Boolean(getKey(effectiveProvider.id));
  const selectedLocalModelMissing = isOllamaProvider(effectiveProvider) && modelStatus === "connected" && !models.includes(effectiveProvider.model);
  const displayModelStatus = !selectedProviderHasKey || selectedLocalModelMissing ? "offline" : modelStatus;
  const canSendChat = !busy && displayModelStatus === "connected";
  const displayModelError = !selectedProviderHasKey
    ? `The API key for ${effectiveProvider.name} is available only until this app session ends. Re-enter the key in Settings to use this provider again.`
    : selectedLocalModelMissing
      ? `The selected model “${effectiveProvider.model}” is not installed in Ollama. Install it or select an installed model.`
      : "";

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers)); }, [providers]);
  useEffect(() => { sessionStorage.setItem("openide.activeProvider", providerId); }, [providerId]);
  useEffect(() => {
    if (!providers.some((item) => item.id === providerId)) setProviderId(providers[0]?.id ?? "ollama");
  }, [providerId, providers]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, busy]);
  useEffect(() => {
    let cancelled = false;
    const checkedProvider = providers.find((item) => item.id === providerId) ?? providers[0] ?? DEFAULT;
    const base = checkedProvider.baseUrl.replace(/\/$/, "");
    const local = checkedProvider.kind === "ollama";
    const key = getKey(checkedProvider.id);
    setModels([]);
    if (checkedProvider.hasApiKey && !key) {
      setModelStatus("offline");
      return () => { cancelled = true; };
    }
    setModelStatus("checking");
    fetch(`${base}${local ? "/api/tags" : "/models"}`, {
      signal: AbortSignal.timeout(8000),
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    })
      .then(async (response) => {
        const body = await response.json() as { models?: { name?: string }[]; data?: { id?: string }[]; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message || `Provider returned HTTP ${response.status}.`);
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        const discovered = (local ? data.models?.map((model) => model.name) : data.data?.map((model) => model.id))
          ?.filter((item): item is string => typeof item === "string" && item.length > 0) ?? [];
        setModels(discovered);
        setModelStatus(discovered.length ? "connected" : "offline");
      })
      .catch(() => { if (!cancelled) { setModels([]); setModelStatus("offline"); } });
    return () => { cancelled = true; };
  }, [providerId, providers, keysRevision]);

  function updateChat(id: string, next: Message[]) {
    setChats((current) => current.map((item) => item.id === id ? { ...item, messages: next, title: item.messages.length ? item.title : next[0]?.text.slice(0, 54) || "New chat", updatedAt: Date.now() } : item));
  }
  function newChat() {
    setActive(null);
    setDraft("");
    setNotice("");
    setView("chat");
    requestAnimationFrame(() => chatInput.current?.focus());
  }
  async function complete(thread: Message[], requestProvider: Provider, system?: string) {
    if (requestProvider.hasApiKey && !getKey(requestProvider.id)) {
      throw new Error(`The API key for ${requestProvider.name} is available only until this app session ends. Re-enter it in Settings before using this provider.`);
    }
    const base = requestProvider.baseUrl.replace(/\/$/, "");
    const msgs = [...(system ? [{ role: "system", content: system }] : []), ...thread.map((message) => ({ role: message.role, content: message.text }))];
    if (requestProvider.kind === "ollama") {
      const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: requestProvider.model, stream: false, messages: msgs }) });
      const body = await response.json() as { message?: { content?: string }; error?: string };
      if (!response.ok) throw new Error(body.error || `Ollama returned HTTP ${response.status}.`);
      return body.message?.content || "The model returned an empty response.";
    }
    const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey(requestProvider.id)}` }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: requestProvider.model, messages: msgs }) });
    const body = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || `Provider returned HTTP ${response.status}.`);
    return body.choices?.[0]?.message?.content || "The model returned an empty response.";
  }
  async function sendChat(event?: FormEvent) {
    event?.preventDefault(); const text = draft.trim(); if (!text || busy) return;
    const requestProvider = providers.find((item) => item.id === providerId) ?? providers[0] ?? DEFAULT;
    if (!selectedProviderHasKey) { setNotice(`The API key for ${requestProvider.name} is no longer available. Re-enter it in Settings.`); return; }
    if (modelStatus !== "connected") { setNotice("The selected provider is not reachable. Check its connection before sending."); return; }
    if (isOllamaProvider(requestProvider) && !models.includes(requestProvider.model)) { setNotice(`The selected model “${requestProvider.model}” is not installed in Ollama. Install it or choose an installed model.`); return; }
    const id = active || uid(); const next = [...messages, { id: uid(), role: "user" as const, text }];
    setDraft(""); setBusy(true); setNotice("");
    if (!active) { setActive(id); setChats((current) => [{ id, title: text.slice(0, 54), updatedAt: Date.now(), messages: next }, ...current]); }
    else updateChat(id, next);
    try {
      const answer = await complete(next, requestProvider);
      updateChat(id, [...next, { id: uid(), role: "assistant", text: answer, model: requestProvider.model }]);
    }
    catch (error) {
      setNotice(error instanceof Error ? error.message : "The request failed. Check your provider.");
    }
    finally { setBusy(false); }
  }
  async function sendAgent(event?: FormEvent) {
    event?.preventDefault(); const text = agentDraft.trim(); if (!text || busy) return;
    const requestProvider = providers.find((item) => item.id === providerId) ?? providers[0] ?? DEFAULT;
    const file = files.find((item) => item.name === selectedFile);
    const prompt = `Help with this code request. Provide a concrete plan and code snippets. This prototype cannot edit project files or run commands.\n\nOpen file: ${file?.name}\n${file?.content ?? ""}\n\nRequest: ${text}`;
    setAgentDraft(""); setBusy(true); setNotice("");
    try { setNotice(await complete([{ id: uid(), role: "user", text: prompt }], requestProvider, "You are a careful senior coding assistant. Give actionable programming guidance; never claim to have edited files or run tools.")); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The request failed."); }
    finally { setBusy(false); }
  }
  function addProvider(event: FormEvent) {
    event.preventDefault(); const { name, baseUrl, model, apiKey } = providerForm; const url = baseUrl.trim().replace(/\/$/, "");
    if (!name.trim() || !model.trim() || !url) { setNotice("Enter a name, base URL, and model ID."); return; }
    try { const parsed = new URL(url); if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error("Use HTTPS for remote APIs. HTTP is only allowed for localhost."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid URL."); return; }
    const id = uid();
    if (apiKey.trim()) sessionStorage.setItem(`openide.key.${id}`, apiKey.trim());
    setProviders((current) => [...current, { id, name: name.trim(), baseUrl: url, model: model.trim(), kind: "openai", hasApiKey: Boolean(apiKey.trim()) }]);
    setProviderId(id);
    setKeysRevision((revision) => revision + 1);
    setProviderForm({ name: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "" });
    setNotice(apiKey.trim() ? "Provider saved. Its API key remains in memory for this app session only." : "Provider saved without a key; add one before using a remote provider.");
  }
  function openConversation(item: Conversation) { setActive(item.id); setView("chat"); }
  function prompt(text: string) { setDraft(text); setView("chat"); }

  return <main className={`app-shell ${sidebar ? "" : "sidebar-collapsed"}`}>
    {sidebar && <aside className="sidebar">
      <button className="brand" onClick={newChat} aria-label="OpenIDE home"><span className="brand-mark"><Code2 size={20}/></span><span>open<span className="brand-strong">IDE</span></span><span className="brand-beta">EARLY ACCESS</span></button>
      <div className="sidebar-search"><Search size={15}/><input aria-label="Search chats" placeholder="Search anything..." value={search} onChange={(event) => setSearch(event.target.value)}/><kbd>⌘ K</kbd></div>
      <div className="nav-caption">WORKSPACE</div><nav className="primary-nav" aria-label="Main navigation">
        <button className={view === "chat" ? "selected" : ""} onClick={() => setView("chat")}><MessageSquare size={17}/><span>New chat</span><kbd>⌘ 1</kbd></button>
        <button className={view === "ide" ? "selected" : ""} onClick={() => setView("ide")}><Code2 size={17}/><span>Agentic IDE</span><span className="nav-new">BETA</span></button>
        <button className={view === "history" ? "selected" : ""} onClick={() => setView("history")}><History size={17}/><span>Chat history</span></button>
      </nav>
      <div className="recent-heading"><span className="nav-caption">RECENT</span><button title="New conversation" onClick={newChat}><Plus size={15}/></button></div>
      <div className="recent-list">{filtered.length ? filtered.slice(0, 8).map((item) => <button className={`history-item ${active === item.id ? "active" : ""}`} key={item.id} onClick={() => openConversation(item)}><MessageSquare size={14}/><span>{item.title}</span></button>) : <p className="empty-recents">{search ? "No matching chats" : "Your conversations will show up here."}</p>}</div>
      <div className="sidebar-spacer"/><div className="sidebar-status"><span className={`status-dot ${displayModelStatus}`}/><span>{displayModelStatus === "connected" ? `${effectiveProvider.model} listed · not tested` : displayModelStatus === "checking" ? "Checking provider" : "AI provider unavailable"}</span></div>
      <button className={`settings-nav ${view === "providers" ? "selected" : ""}`} onClick={() => setView("providers")}><Settings2 size={17}/><span>Settings & providers</span></button>
      <button className="profile-row" onClick={() => setView("providers")}><span className="profile-avatar">O</span><span className="profile-details"><strong>Local workspace</strong><small>Private · on this device</small></span><MoreHorizontal size={18}/></button>
    </aside>}
    <section className="main-panel">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebar(!sidebar)} aria-label="Toggle sidebar">{sidebar ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}</button><div className="breadcrumb"><span>OpenIDE</span><ChevronRight size={14}/><strong>{view === "chat" ? conversation?.title || "New chat" : view === "ide" ? "Agentic IDE" : view === "history" ? "Chat history" : "Settings & providers"}</strong></div><div className="topbar-actions"><span className="privacy-chip"><ShieldCheck size={13}/>Local-first</span><button className="icon-button" title="Help"><CircleHelp size={17}/></button><button className="new-chat-top" onClick={newChat}><Plus size={15}/>New chat</button></div></header>
      {view === "chat" && <section className={`chat-view ${messages.length ? "has-messages" : ""}`}>
        {!messages.length ? <div className="welcome"><div className="welcome-pill"><Sparkles size={14}/> YOUR PRIVATE AI WORKSPACE</div><h1>Make something<br/><span>remarkable.</span></h1><p>Ideas, questions, and code — a thoughtful AI, right here in your workspace.</p><div className="suggestions"><button onClick={() => prompt("Help me plan and build a beautiful personal portfolio website.")}><span className="suggestion-icon lavender"><LayoutGrid size={17}/></span><span><strong>Start a project</strong><small>Turn an idea into a plan</small></span><ArrowRight size={15}/></button><button onClick={() => prompt("Explain how a local language model works, in simple terms.")}><span className="suggestion-icon peach"><Sparkles size={17}/></span><span><strong>Learn something</strong><small>Explore any topic, simply</small></span><ArrowRight size={15}/></button><button onClick={() => setView("ide")}><span className="suggestion-icon mint"><Braces size={17}/></span><span><strong>Build with AI</strong><small>Open your coding workspace</small></span><ArrowRight size={15}/></button></div></div> : <div className="message-list">{messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === "user" ? "Y" : <Sparkles size={16}/>}</div><div className="message-content"><div className="message-author">{message.role === "user" ? "You" : "OpenIDE"}<span>{message.role === "assistant" && <><span className="model-mini-dot"/>{message.model ?? provider.model}</>}</span></div><div className="message-text">{message.text}</div></div></article>)}{busy && <article className="message assistant"><div className="message-avatar"><Sparkles size={16}/></div><div className="message-content"><div className="message-author">OpenIDE</div><div className="thinking"><span/><span/><span/> Thinking with {provider.model}</div></div></article>}<div ref={bottom}/></div>}
        {(notice || displayModelError) && <div className="inline-error"><CircleAlert size={15}/>{notice || displayModelError}<button onClick={() => setNotice("")}><X size={14}/></button></div>}
        <div className="composer-wrap"><form className="composer" onSubmit={sendChat}><textarea ref={chatInput} aria-label="Message the AI" placeholder={displayModelStatus === "offline" ? "Check your selected model/provider in Settings before sending..." : "Ask anything — your conversation stays on this device"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} rows={2}/><div className="composer-tools"><div className="composer-left"><button type="button" className="attach-button" onClick={() => setView("ide")} title="Open coding workspace"><Plus size={18}/></button><span className="composer-hint">Shift + Enter for a new line</span></div><div className="composer-right"><button type="button" className="model-picker" onClick={() => setView("providers")}><span className={`provider-icon ${provider.kind === "ollama" ? "local" : "cloud"}`}>{provider.kind === "ollama" ? <HardDrive size={13}/> : <Globe size={13}/>}</span><span>{provider.model}</span><ChevronDown size={14}/></button><button type="submit" className="send-button" disabled={!draft.trim() || !canSendChat} aria-label="Send message">{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={16}/>}</button></div></div></form><div className="composer-disclaimer"><ShieldCheck size={12}/> Prototype chat history is saved in this browser. Verify important answers.</div></div>
      </section>}
      {view === "history" && <section className="history-view"><div className="section-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>Chat history</h1><p>Your conversations, saved privately on this device.</p></div><button className="primary-button" onClick={newChat}><Plus size={16}/>New conversation</button></div><div className="history-search"><Search size={17}/><input placeholder="Search conversations..." aria-label="Search conversation history" value={search} onChange={(event) => setSearch(event.target.value)}/></div>{!filtered.length ? <div className="empty-state"><span><History size={23}/></span><h2>No conversations yet</h2><p>Start chatting and your saved conversations will appear here.</p><button className="secondary-button" onClick={newChat}>Start a chat<ArrowRight size={15}/></button></div> : <div className="history-cards">{filtered.map((item) => <article className="history-card" key={item.id}><button className="history-card-main" onClick={() => openConversation(item)}><span className="history-card-icon"><MessageSquare size={17}/></span><span className="history-card-text"><strong>{item.title}</strong><small>{item.messages.length} messages · {new Date(item.updatedAt).toLocaleString()}</small></span><ChevronRight size={17}/></button><button className="delete-chat" aria-label={`Delete ${item.title}`} onClick={() => { setChats((current) => current.filter((chat) => chat.id !== item.id)); if (active === item.id) setActive(null); }}><X size={15}/></button></article>)}</div>}</section>}
      {view === "providers" && <section className="settings-view"><div className="section-heading"><div><span className="eyebrow">PERSONALIZE YOUR WORKSPACE</span><h1>Settings & providers</h1><p>Choose a local model or bring your own API key.</p></div></div><div className="privacy-note"><ShieldCheck size={19}/><div><strong>Private by design</strong><p>Local models run on your computer. API keys are stored in this browser session only. This prototype is not yet connected to secure desktop key storage.</p></div></div><div className="settings-grid"><div className="settings-main"><div className="provider-section-title"><span className="section-icon"><HardDrive size={17}/></span><div><h2>Local models</h2><p>Connect to Ollama running on this computer</p></div><span className={`connection-label ${modelStatus}`}>{modelStatus === "connected" ? <><Check size={13}/> Model catalog available</> : modelStatus === "checking" ? <><LoaderCircle className="spin" size={13}/> Checking catalog</> : "Model catalog unavailable"}</span></div><article className={`provider-card local-card ${providerId === "ollama" ? "current" : ""}`}><div className="provider-brand-row"><span className="provider-large local"><HardDrive size={19}/></span><div><strong>Ollama</strong><small>Offline inference · local model runtime</small></div>{providerId === "ollama" && <span className="using-pill"><Check size={12}/> IN USE</span>}</div><div className="provider-fields"><label>Ollama URL<input value={DEFAULT.baseUrl} readOnly/></label><label>Model<select value={provider.kind === "ollama" ? provider.model : DEFAULT.model} onChange={(event) => { setProviders((current) => current.map((item) => item.id === "ollama" ? { ...item, model: event.target.value } : item)); setProviderId("ollama"); }}><option value="qwen2.5-coder:7b">Qwen 2.5 Coder 7B · ~5 GB</option><option value="qwen2.5-coder:3b">Qwen 2.5 Coder 3B · ~2 GB</option><option value="qwen2.5-coder:1.5b">Qwen 2.5 Coder 1.5B · ~1 GB</option>{models.filter((item) => !item.startsWith("qwen2.5-coder:")).map((item) => <option key={item} value={item}>{item} · installed</option>)}</select></label></div><div className="model-advice"><Sparkles size={14}/><span><strong>Pick a model for your hardware.</strong> 7B uses more memory. Try 3B or 1.5B on lower-memory devices. This prototype connects to Ollama; it does not bundle model weights.</span></div><div className="provider-card-actions"><span className={`test-result ${modelStatus}`}>{modelStatus === "connected" ? <><Check size={14}/> Ollama replied; {models.length} model{models.length === 1 ? "" : "s"} listed (generation not tested)</> : modelStatus === "checking" ? "Checking Ollama model catalog…" : "Ollama/model unavailable"}</span><button className={providerId === "ollama" ? "secondary-button" : "primary-button"} onClick={() => { setProviderId("ollama"); setNotice(""); }}>{providerId === "ollama" ? "Selected" : "Use local model"}</button></div>{modelStatus === "offline" && <p className="setup-hint">Install Ollama, then run <code>ollama serve</code> and <code>ollama pull qwen2.5-coder:7b</code>. Smaller alternatives: <code>ollama pull qwen2.5-coder:3b</code>.</p>}</article>
        <div className="provider-section-title external-title"><span className="section-icon violet"><KeyRound size={17}/></span><div><h2>External API providers</h2><p>Optional OpenAI-compatible endpoints</p></div></div><form className="provider-card api-form" onSubmit={addProvider}><div className="provider-form-head"><div><strong>Add a provider</strong><p>Connect an API service or another compatible local server.</p></div><span className="optional-pill">OPTIONAL</span></div><div className="form-grid"><label>Provider name<input placeholder="e.g. OpenAI, LM Studio" value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} required/></label><label>Model ID<input placeholder="e.g. gpt-4o-mini" value={providerForm.model} onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })} required/></label><label className="full-width">OpenAI-compatible base URL<input placeholder="https://api.openai.com/v1" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} required/><small>HTTPS for remote endpoints; local HTTP allowed.</small></label><label className="full-width">API key <span className="muted-label">(optional for local servers)</span><input type="password" autoComplete="off" placeholder="Key is kept in this browser session" value={providerForm.apiKey} onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}/></label></div><div className="provider-card-actions"><span className="test-result"><ShieldCheck size={14}/> Session-only key storage in prototype</span><button type="submit" className="primary-button"><Plus size={15}/>Add provider</button></div></form>{providers.filter((item) => item.id !== "ollama").map((item) => <article className="provider-card saved-provider" key={item.id}><span className="provider-large cloud"><Globe size={18}/></span><div className="saved-provider-info"><strong>{item.name}</strong><small>{item.model} · {new URL(item.baseUrl).host}</small>{item.hasApiKey && !getKey(item.id) && <small className="key-expired">Session key cleared — remove this entry and add it again with the key.</small>}</div>{providerId === item.id && <span className="using-pill">IN USE</span>}<button className="secondary-button" onClick={() => setProviderId(item.id)}>{providerId === item.id ? "Selected" : "Use"}</button><button className="remove-provider" title={`Remove ${item.name}`} onClick={() => { sessionStorage.removeItem(`openide.key.${item.id}`); setProviders((current) => current.filter((entry) => entry.id !== item.id)); if (providerId === item.id) setProviderId("ollama"); }}><X size={15}/></button></article>)}</div><aside className="settings-aside"><div className="aside-card"><div className="aside-illustration"><Zap size={22}/></div><h3>Private by default</h3><p>Chat history is stored locally in this browser prototype. There is no cloud sync.</p><div className="aside-divider"/><div className="aside-check"><Check size={14}/> Local chat history</div><div className="aside-check"><Check size={14}/> You choose the provider</div><div className="aside-check"><Check size={14}/> No model bundled yet</div></div><div className="aside-card guide-card"><span className="guide-icon"><CircleHelp size={16}/></span><div><strong>Bring your own API</strong><p>Use your provider’s OpenAI-compatible endpoint. Review its pricing and privacy terms.</p></div></div></aside></div>{notice && <div className="toast-note"><Check size={15}/>{notice}<button onClick={() => setNotice("")}><X size={14}/></button></div>}</section>}
      {view === "ide" && <section className="ide-view"><div className="ide-toolbar"><div className="ide-project"><span className="folder-chip"><FolderOpen size={15}/></span><strong>sample-project</strong><ChevronDown size={14}/><span className="ide-separator"/><span className="ide-unsaved">Example workspace</span></div><div className="ide-toolbar-actions"><button className="secondary-button small-button" onClick={() => setNotice("Opening a real folder requires the Tauri desktop filesystem backend, which is not in this repository yet.")}><FolderOpen size={14}/>Open folder</button><button className="icon-button" aria-label="Editor options"><MoreHorizontal size={18}/></button></div></div><div className="ide-body"><aside className="explorer"><div className="explorer-head"><span>EXPLORER</span><button aria-label="Explorer options"><MoreHorizontal size={16}/></button></div><button className="explorer-project"><ChevronDown size={14}/><FolderOpen size={15}/><span>SAMPLE-PROJECT</span></button><div className="file-list">{files.map((item) => <button key={item.name} className={`file-item ${selectedFile === item.name ? "active" : ""}`} onClick={() => setSelectedFile(item.name)}><item.icon size={15}/>{item.name}</button>)}</div><button className="explorer-open" onClick={() => setNotice("Real project folder access is not available until the native desktop backend is implemented.")}><Plus size={15}/>Open project folder</button></aside><div className="editor-area"><div className="editor-tabs"><div className="editor-tab"><FileCode2 size={14}/>{selectedFile}<span className="file-tab-dot"/></div><div className="editor-tab-spacer"/><span className="editor-breadcrumb">sample-project <ChevronRight size={12}/>{selectedFile}</span></div><div className="editor-content"><div className="code-lines">{(files.find((item) => item.name === selectedFile)?.content ?? "").split("\n").map((line, index) => <div className="code-line" key={`${selectedFile}-${index}`}><span className="line-number">{String(index + 1).padStart(2, " ")}</span><span className="line-code">{line || " "}</span></div>)}</div><textarea className="editor-textarea" aria-label={`Edit sample ${selectedFile}`} spellCheck={false} value={files.find((item) => item.name === selectedFile)?.content ?? ""} onChange={(event) => setFiles((current) => current.map((item) => item.name === selectedFile ? { ...item, content: event.target.value } : item))}/></div><div className="editor-status"><span><Code2 size={12}/>{files.find((item) => item.name === selectedFile)?.language ?? "plaintext"}</span><span>UTF-8</span><span>Ln {files.find((item) => item.name === selectedFile)?.content.split("\n").length ?? 1}, Col 1</span></div></div><aside className="agent-panel"><div className="agent-header"><span className="agent-indicator"><Sparkles size={15}/></span><strong>OpenIDE Agent</strong><button className="icon-button" aria-label="Agent options"><MoreHorizontal size={17}/></button></div><div className="agent-context"><span className="context-chip"><FileCode2 size={12}/>{selectedFile}</span><button onClick={() => setNotice("Add-context support requires real project file access from the native desktop backend.")}><Plus size={13}/>Add context</button></div><div className="agent-conversation">{notice && !notice.includes("folder") && !notice.includes("context") ? <div className="agent-reply">{notice}<button onClick={() => setNotice("")}><X size={14}/>Clear response</button></div> : <div className="agent-welcome"><span className="agent-sparkle"><Sparkles size={20}/></span><h2>Build with your AI.</h2><p>Ask questions about this sample file or get help planning a change.</p><div className="agent-suggestions"><button onClick={() => setAgentDraft("Explain this file and point out potential issues.")}><MessageSquare size={14}/>Explain this file</button><button onClick={() => setAgentDraft("Help plan a new feature for this project.")}><Sparkles size={14}/>Plan a feature</button><button onClick={() => setAgentDraft("Review this code for bugs and suggest improvements.")}><ShieldCheck size={14}/>Review this code</button></div></div>}</div><form className="agent-composer" onSubmit={sendAgent}><textarea placeholder="Ask about your code…" value={agentDraft} onChange={(event) => setAgentDraft(event.target.value)} rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendAgent(); } }}/><div className="agent-compose-footer"><span><HardDrive size={12}/>{provider.model}</span><button className="send-button" aria-label="Send to coding assistant" disabled={!agentDraft.trim() || busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <ArrowRight size={17}/>}</button></div></form><div className="agent-footnote"><ShieldCheck size={12}/> Suggestions never modify files automatically.</div></aside></div><div className="ide-statusbar"><span><span className={`status-dot ${modelStatus}`}/>{displayModelStatus === "connected" ? "Model catalog answered · generation untested" : displayModelStatus === "checking" ? "Checking provider catalog" : "Selected model unavailable"}</span><span><Terminal size={13}/>Terminal <ChevronDown size={12}/></span></div></section>}
    </section>
    {!sidebar && <button className="floating-nav" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu size={18}/></button>}
  </main>;
}

export default App;
