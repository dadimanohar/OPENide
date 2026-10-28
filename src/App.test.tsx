import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function returnToChatAfterOllamaCatalogCheck() {
  fireEvent.click(screen.getByRole("button", { name: "Settings & providers" }));
  await waitFor(() => expect(screen.getByText(/Ollama replied/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
}

describe("OpenIDE chat workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows and focuses the message box when New Chat is clicked", async () => {
    render(<App />);
    await returnToChatAfterOllamaCatalogCheck();
    const input = screen.getByRole("textbox", { name: "Message the AI" });
    expect(input).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message the AI" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("sends a real Ollama-shaped request and displays the provider response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => String(input).endsWith("/api/chat")
      ? jsonResponse({ message: { content: "A real provider response" } })
      : jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] }));
    render(<App />);
    await returnToChatAfterOllamaCatalogCheck();

    const input = screen.getByRole("textbox", { name: "Message the AI" });
    fireEvent.change(input, { target: { value: "Explain a TypeScript function" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("A real provider response")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:11434/api/chat", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("Explain a TypeScript function"),
      signal: expect.any(AbortSignal),
    }));
    expect(JSON.parse(localStorage.getItem("openide.conversations.v1") ?? "[]")[0].messages).toHaveLength(2);
  });

  it("opens chat history and returns to chat when a conversation is opened", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => String(input).endsWith("/api/chat")
      ? jsonResponse({ message: { content: "Saved response" } })
      : jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] }));
    render(<App />);
    await returnToChatAfterOllamaCatalogCheck();

    fireEvent.change(screen.getByRole("textbox", { name: "Message the AI" }), { target: { value: "A saved conversation" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Saved response");
    fireEvent.click(screen.getByRole("button", { name: "Chat history" }));

    const history = screen.getByRole("heading", { name: "Chat history" }).closest(".history-view");
    expect(history).not.toBeNull();
    const conversationButton = within(history as HTMLElement).getByText("A saved conversation", { selector: "strong" }).closest("button");
    expect(conversationButton).not.toBeNull();
    fireEvent.click(conversationButton as HTMLButtonElement);
    expect(screen.getByText("Saved response")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message the AI" })).toBeVisible();
  });

  it("keeps a draft editable and reports the unavailable provider when send is attempted", async () => {
    render(<App />);
    const input = screen.getByRole("textbox", { name: "Message the AI" });
    fireEvent.change(input, { target: { value: "Keep this draft for when Ollama is available." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/selected provider is not reachable/i)).toBeInTheDocument();
    expect(input).toHaveValue("Keep this draft for when Ollama is available.");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("does not send an Ollama request when the selected model is not installed", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => String(input).endsWith("/api/chat")
      ? jsonResponse({ message: { content: "unexpected" } })
      : jsonResponse({ models: [{ name: "another-model:latest" }] }));
    render(<App />);

    await waitFor(() => expect(screen.getByText(/not installed in Ollama/i)).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "Message the AI" }), { target: { value: "Do not send this" } });

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/chat"))).toBe(false);
  });

  it("labels a persisted provider whose session key expired and avoids sending with a missing key", async () => {
    localStorage.setItem("openide.providers.v1", JSON.stringify([
      { id: "ollama", name: "Ollama local", baseUrl: "http://127.0.0.1:11434", model: "qwen2.5-coder:7b", kind: "ollama" },
      { id: "cloud", name: "OpenAI", baseUrl: "https://api.example.com/v1", model: "demo-model", kind: "openai", hasApiKey: true },
    ]));
    sessionStorage.setItem("openide.activeProvider", "cloud");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "demo-model" }] }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings & providers" }));
    expect(await screen.findByText(/session key cleared/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message the AI" }), { target: { value: "Do not send without a key" } });

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(false);
  });

  it("keeps a pending answer attributed to the provider used when it was sent", async () => {
    const fetchMock = vi.mocked(fetch);
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith("/api/chat")) return new Promise<Response>((resolve) => { finish = resolve; });
      if (String(input).endsWith("/models")) return Promise.resolve(jsonResponse({ data: [{ id: "demo-model" }] }));
      return Promise.resolve(jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] }));
    });
    render(<App />);
    await returnToChatAfterOllamaCatalogCheck();
    fireEvent.click(screen.getByRole("button", { name: "Settings & providers" }));
    fireEvent.change(screen.getByLabelText("Provider name"), { target: { value: "Test Cloud" } });
    fireEvent.change(screen.getByLabelText("Model ID"), { target: { value: "demo-model" } });
    fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), { target: { value: "https://api.example.com/v1" } });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: "test-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use local model" }));
    await waitFor(() => expect(screen.getByText(/Ollama replied/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message the AI" }), { target: { value: "Route this to Qwen" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/Thinking with qwen2.5-coder:7b/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings & providers" }));
    const cloudCard = screen.getByText("Test Cloud").closest("article");
    expect(cloudCard).not.toBeNull();
    fireEvent.click(within(cloudCard as HTMLElement).getByRole("button", { name: "Use" }));
    finish?.(jsonResponse({ message: { content: "Qwen actually answered" } }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: /New chat/ }));

    const answer = await screen.findByText("Qwen actually answered");
    expect(answer.closest(".message")?.textContent).toContain("qwen2.5-coder:7b");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(false);
  });

  it("shows an actual provider failure rather than a fabricated answer", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => String(input).endsWith("/api/chat")
      ? jsonResponse({ error: "model not found" }, 404)
      : jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] }));
    render(<App />);
    await returnToChatAfterOllamaCatalogCheck();

    fireEvent.change(screen.getByRole("textbox", { name: "Message the AI" }), { target: { value: "Use the missing model" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("model not found")).toBeInTheDocument();
    expect(screen.queryByText(/mock|sample response/i)).not.toBeInTheDocument();
  });
});
