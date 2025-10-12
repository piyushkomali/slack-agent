import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil } from "./slack-utils";
import { generateResponse } from "./generate-response";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

  await client.chat.postMessage({
    channel: channel_id,
    thread_ts: thread_ts,
    text: "Hello, I'm an AI assistant built with the AI SDK by Vercel!",
  });

  await client.assistant.threads.setSuggestedPrompts({
    channel_id: channel_id,
    thread_ts: thread_ts,
    prompts: [
      {
        title: "Get the weather",
        message: "What is the current weather in London?",
      },
      {
        title: "Get the news",
        message: "What is the latest Premier League news from the BBC?",
      },
    ],
  });
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  updateStatus("is thinking...");

  const messages = await getThread(channel, thread_ts, botUserId);
  const result = await generateResponse(messages, updateStatus);
  
  // Post initial message
  const initialMessage = await client.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    text: "...",
    unfurl_links: false,
  });

  if (!initialMessage || !initialMessage.ts) {
    throw new Error("Failed to post initial message");
  }

  // Accumulate text and update message with rate limiting
  let accumulatedText = "";
  let lastUpdateTime = 0;
  const updateIntervalMs = 220; // Update every 500ms max

  for await (const delta of result.textStream) {
    accumulatedText += delta;
    const now = Date.now();
    
    // Update message if enough time has passed or if it's the last chunk
    if (now - lastUpdateTime >= updateIntervalMs) {
      const formattedText = accumulatedText
        .replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>")
        .replace(/\*\*/g, "*");
      
      await client.chat.update({
        channel: channel,
        ts: initialMessage.ts,
        text: formattedText,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: formattedText,
            },
          },
        ],
      });
      lastUpdateTime = now;
    }
  }

  // Final update to ensure we have the complete text
  const finalFormattedText = accumulatedText
    .replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>")
    .replace(/\*\*/g, "*");
  
  await client.chat.update({
    channel: channel,
    ts: initialMessage.ts,
    text: finalFormattedText,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: finalFormattedText,
        },
      },
    ],
  });

  updateStatus("");
}
