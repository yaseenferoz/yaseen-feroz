import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TOTAL_LENGTH = 3000;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const client = new BedrockRuntimeClient({ region: REGION });
const systemPrompt = `You are the portfolio assistant for Yaseen Feroz. Answer questions using only this portfolio context. Be concise, helpful, and honest; do not invent experience, results, project features, or personal information. If information is not included here, say so and offer the contact email mdyaseenferoz@gmail.com.\n\nYaseen is a Senior Software Engineer at Innominds. His experience includes enterprise workflow and security software for Nokia, speech analytics, learning platforms, e-commerce, and web applications. Skills include Angular, TypeScript, JavaScript, Vue.js, React, Node.js, REST APIs, PostgreSQL, MongoDB, AWS, and software testing. Portfolio projects include Codekraft MA QA Quality and Campuskraft; their public descriptions are brief, so do not make up details. Contact: mdyaseenferoz@gmail.com.`;

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

  try {
    const request = {
      system: [{ text: systemPrompt }],
      messages: normalized,
      inferenceConfig: { maxTokens: 500, temperature: 0.4, topP: 0.9 }
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
    return response(200, { reply }, origin, allowedOrigin);
  } catch (error) {
    console.error('Bedrock chat request failed:', error.name || 'Error');
    return response(502, { error: 'The AI assistant is temporarily unavailable. Please try again shortly.' }, origin, allowedOrigin);
  }
};
