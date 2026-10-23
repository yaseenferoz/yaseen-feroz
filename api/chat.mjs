import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHash } from 'node:crypto';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TOTAL_LENGTH = 3000;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const USAGE_TABLE = process.env.USAGE_TABLE || '';
const DAILY_QUESTION_LIMIT = Number.parseInt(process.env.DAILY_QUESTION_LIMIT || '12', 10);
const client = new BedrockRuntimeClient({ region: REGION });
const usageClient = USAGE_TABLE ? new DynamoDBClient({ region: REGION }) : null;
const systemPrompt = `You are Yaseen Feroz's portfolio assistant. Answer only questions about Yaseen, his portfolio, career, skills, projects, and how to contact him. If someone asks about another topic or asks you to act as a general AI, briefly say you can help with Yaseen's portfolio and invite a relevant question. Use only the facts below. Do not invent project details, responsibilities, results, or personal information. If the portfolio does not say, say that briefly and offer mdyaseenferoz@gmail.com when useful.\n\nKeep each answer direct and short: usually 1 to 3 sentences, under 70 words. Write clean plain text that fits a compact chat bubble. Do not use Markdown, headings, # characters, asterisks, or decorative formatting. Avoid repeating the question or adding an unnecessary introduction.\n\nYaseen is a Senior Software Engineer at Innominds. His experience includes enterprise workflow and security software for Nokia, speech analytics, learning platforms, e-commerce, and web applications. His skills include Angular, TypeScript, JavaScript, Vue.js, React, Node.js, REST APIs, PostgreSQL, MongoDB, AWS, and software testing. Portfolio projects include Codekraft MA QA Quality and Campuskraft. Contact: mdyaseenferoz@gmail.com.`;

async function reserveDailyQuestion(sourceIp) {
  if (!usageClient || !USAGE_TABLE) return { remaining: null };
  if (!sourceIp) throw new Error('The request did not include a client IP address.');

  const day = new Date().toISOString().slice(0, 10);
  const ipHash = createHash('sha256').update(`${day}:${sourceIp}`).digest('hex');
  const expiresAt = Math.floor(Date.parse(`${day}T00:00:00.000Z`) / 1000) + 86400;

  const result = await usageClient.send(new UpdateItemCommand({
    TableName: USAGE_TABLE,
    Key: { usageKey: { S: `${day}#${ipHash}` } },
    UpdateExpression: 'SET #requestCount = if_not_exists(#requestCount, :zero) + :one, #expiresAt = if_not_exists(#expiresAt, :expiresAt)',
    ConditionExpression: 'attribute_not_exists(#requestCount) OR #requestCount < :limit',
    ExpressionAttributeNames: { '#requestCount': 'requestCount', '#expiresAt': 'expiresAt' },
    ExpressionAttributeValues: {
      ':zero': { N: '0' },
      ':one': { N: '1' },
      ':limit': { N: String(DAILY_QUESTION_LIMIT) },
      ':expiresAt': { N: String(expiresAt) }
    },
    ReturnValues: 'UPDATED_NEW'
  }));

  const used = Number(result.Attributes?.requestCount?.N || DAILY_QUESTION_LIMIT);
  return { remaining: Math.max(0, DAILY_QUESTION_LIMIT - used) };
}

function response(statusCode, payload, origin, allowedOrigin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
  if (allowedOrigin && origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return { statusCode, headers, body: JSON.stringify(payload) };
}

export const handler = async event => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return response(204, {}, origin, allowedOrigin);
  }
  if (allowedOrigin && origin !== allowedOrigin) {
    return response(403, { error: 'This site is not allowed to use the assistant.' }, origin, allowedOrigin);
  }

  let input;
  try {
    input = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return response(400, { error: 'Invalid JSON request.' }, origin, allowedOrigin);
  }
  const messages = input?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return response(400, { error: `Send between 1 and ${MAX_MESSAGES} conversation messages.` }, origin, allowedOrigin);
  }
  let totalLength = 0;
  const normalized = [];
  for (const [index, message] of messages.entries()) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      return response(400, { error: 'Each message must have a valid role and text.' }, origin, allowedOrigin);
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return response(400, { error: 'Each message must contain text within the length limit.' }, origin, allowedOrigin);
    }
    totalLength += content.length;
    normalized.push({ role: message.role, content: [{ text: content }] });
  }
  if (messages[messages.length - 1].role !== 'user') {
    return response(400, { error: 'Please refresh the page and resend your question.' }, origin, allowedOrigin);
  }
  if (totalLength > MAX_TOTAL_LENGTH) {
    return response(400, { error: 'Conversation is too long. Please start a new chat.' }, origin, allowedOrigin);
  }

  let usage;
  try {
    usage = await reserveDailyQuestion(event.requestContext?.http?.sourceIp || '');
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return response(429, { error: "This connection has reached today's assistant limit. Please try again tomorrow." }, origin, allowedOrigin);
    }
    console.error('Chat usage limit check failed:', error.name || 'Error');
    return response(503, { error: 'The assistant is temporarily unavailable. Please try again later.' }, origin, allowedOrigin);
  }

  try {
    const request = {
      system: [{ text: systemPrompt }],
      messages: normalized,
      inferenceConfig: { maxTokens: 220, temperature: 0.3, topP: 0.8 }
    };
    let output;
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20000)
      });
      if (!upstream.ok) {
        console.error('Bedrock API-key request failed with status:', upstream.status);
        throw new Error('Bedrock request failed.');
      }
      const payload = await upstream.json();
      output = payload.output;
    } else {
      const result = await client.send(new ConverseCommand({ modelId: MODEL_ID, ...request }), {
        abortSignal: AbortSignal.timeout(20000)
      });
      output = result.output;
    }
    const reply = (output?.message?.content || []).map(block => block.text || '').join('').trim();
    if (!reply) throw new Error('Bedrock returned an empty response.');
    return response(200, { reply, remaining: usage.remaining }, origin, allowedOrigin);
  } catch (error) {
    console.error('Bedrock chat request failed:', error.name || 'Error');
    return response(502, { error: 'The AI assistant is temporarily unavailable. Please try again shortly.' }, origin, allowedOrigin);
  }
};
