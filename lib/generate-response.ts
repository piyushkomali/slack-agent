import { openai } from '@ai-sdk/openai';
import { streamText, tool, CoreMessage } from 'ai';
import { z } from 'zod';
import { exa } from './utils';

export const generateResponse = async (
    messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  const result = await streamText({
    model: openai('gpt-5-nano'),
    system: `You are a Slack bot assistant. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split('T')[0]}
    - Always include sources in your final response if you use web search.`,
    messages: messages as CoreMessage[],
    tools: {
      getWeather: tool({
        description: 'Get the current weather at a location',
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }: { latitude: number; longitude: number; city: string }) => {
          updateStatus?.(`is getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
        },
      }),
      webSearch: tool({
        description: 'Search the web for up-to-date information',
        parameters: z.object({
          query: z.string().min(1).max(100).describe('The search query'),
        }),
        execute: async ({ query }: { query: string }) => {
          updateStatus?.(`is searching the web for: ${query}...`);

          const { results } = await exa.searchAndContents(query, {
            livecrawl: 'always',
            numResults: 3,
          });
          return results.map(result => ({
            title: result.title,
            url: result.url,
            content: result.text.slice(0, 1000), // take just the first 1000 characters
            publishedDate: result.publishedDate,
          }));
        },
      }),
    },
    maxSteps: 10,
  });
  return result;
  // Convert markdown to Slack mrkdwn format
  // return result.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};