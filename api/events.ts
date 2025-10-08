import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  console.log("payload", payload);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    console.log("URL verification request");
    return new Response(payload.challenge, { status: 200 });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const botUserId = await getBotId();
    console.log("Bot User ID:", botUserId);

    const event = payload.event as SlackEvent;

    if (event.type === "app_mention") {
      console.log("Processing app mention");
      waitUntil(handleNewAppMention(event, botUserId));
    } else if (event.type === "assistant_thread_started") {
      console.log("Processing assistant thread started");
      waitUntil(assistantThreadMessage(event));
    } else if (event.type === "message") {
      console.log("Message event details:", {
        hasSubtype: !!event.subtype,
        channelType: event.channel_type,
       
      });

      if (
        !event.subtype &&
        event.channel_type === "im" &&
        !event.bot_id &&
        !event.bot_profile &&
        event.bot_id !== botUserId
      ) {
        console.log("Processing direct message");
        waitUntil(handleNewAssistantMessage(event, botUserId));
      } else {
        console.log("Message event filtered out due to conditions");
      }
    } else {
      console.log("Unhandled event type:", event.type);
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
