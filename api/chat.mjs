import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHash } from 'node:crypto';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TOTAL_LENGTH = 3000;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const USAGE_TABLE = process.env.USAGE_TABLE || '';
const DAILY_QUESTION_LIMIT = Number.parseInt(process.env.DAILY_QUESTION_LIMIT || '12', 10);
const LEAD_QUESTION_LIMIT = DAILY_QUESTION_LIMIT * 2;
const client = new BedrockRuntimeClient({ region: REGION });
const usageClient = USAGE_TABLE ? new DynamoDBClient({ region: REGION }) : null;
const systemPrompt = `You are Yaseen Feroz's friendly portfolio assistant. Help visitors learn about Yaseen's publicly listed career, education, skills, projects, and contact details. Use only the facts below; never invent personal details, project features, responsibilities, or results. If information is missing, say so plainly and share a nearby known fact when helpful. For example, Yaseen is based in Hyderabad, India, but the portfolio does not state his hometown or birthplace. If asked where he is from, explain that distinction instead of presenting Hyderabad as his birthplace.\n\nUse a warm, natural voice with occasional gentle wit. When the visitor's wording invites it, add a short playful or dry aside, including in portfolio-related answers; do not limit humor to redirects or force it into every answer. Keep humor respectful and never make jokes about sensitive topics. For unrelated questions, briefly say you are best at Yaseen's portfolio and nudge the visitor toward his work, education, projects, or skills.\n\nKeep answers direct and short: usually 1 to 3 sentences, under 70 words. Write clean plain text that fits a compact chat bubble. Do not use Markdown, headings, # characters, asterisks, or decorative formatting. Avoid repeating the question or adding an unnecessary introduction.\n\nYaseen is a Senior Software Engineer at Innominds and is based in Hyderabad, India. His experience includes enterprise workflow and security software for Nokia, speech analytics, learning platforms, e-commerce, and web applications. His skills include Angular, TypeScript, JavaScript, Vue.js, React, Node.js, REST APIs, PostgreSQL, MongoDB, AWS, and software testing. His education section lists a Bachelor of Engineering in Electrical, Electronics and Communications Engineering from Visvesvaraya Technological University, marked October 2016. Portfolio projects include Codekraft MA QA Quality and Campuskraft. Contact: mdyaseenferoz@gmail.com.`;

function usageIdentity(sourceIp) {
  if (!sourceIp) throw new Error('The request did not include a client IP address.');
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = createHash('sha256').update(`${day}:${sourceIp}`).digest('hex');
  const expiresAt = Math.floor(Date.parse(`${day}T00:00:00.000Z`) / 1000) + 86400;
  return { key: { usageKey: { S: `${day}#${ipHash}` } }, expiresAt };
}

async function reserveDailyQuestion(sourceIp) {
  if (!usageClient || !USAGE_TABLE) return { remaining: null };
  const identity = usageIdentity(sourceIp);

  try {
    const result = await usageClient.send(new UpdateItemCommand({
      TableName: USAGE_TABLE,
      Key: identity.key,
      UpdateExpression: 'SET #requestCount = if_not_exists(#requestCount, :zero) + :one, #expiresAt = if_not_exists(#expiresAt, :expiresAt)',
      ConditionExpression: 'attribute_not_exists(#requestCount) OR #requestCount < :baseLimit OR (#leadSubmitted = :yes AND #requestCount < :leadLimit)',
      ExpressionAttributeNames: { '#requestCount': 'requestCount', '#expiresAt': 'expiresAt', '#leadSubmitted': 'leadSubmitted' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':yes': { BOOL: true },
        ':baseLimit': { N: String(DAILY_QUESTION_LIMIT) },
        ':leadLimit': { N: String(LEAD_QUESTION_LIMIT) },
        ':expiresAt': { N: String(identity.expiresAt) }
      },
      ReturnValues: 'ALL_NEW'
    }));

    const used = Number(result.Attributes?.requestCount?.N || 0);
    const leadSubmitted = result.Attributes?.leadSubmitted?.BOOL === true;
    const limit = leadSubmitted ? LEAD_QUESTION_LIMIT : DAILY_QUESTION_LIMIT;
    return { remaining: Math.max(0, limit - used), leadSubmitted, limit };
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
    const result = await usageClient.send(new GetItemCommand({
      TableName: USAGE_TABLE,
      Key: identity.key,
      ConsistentRead: true
    }));
    const leadSubmitted = result.Item?.leadSubmitted?.BOOL === true;
    return {
      limitReached: true,
      leadSubmitted,
      remaining: 0,
      limit: leadSubmitted ? LEAD_QUESTION_LIMIT : DAILY_QUESTION_LIMIT
    };
  }
}

async function submitLead(sourceIp, input, origin, allowedOrigin) {
  if (!usageClient || !USAGE_TABLE) {
    return response(503, { error: 'Chat continuation is available on the hosted portfolio.' }, origin, allowedOrigin);
  }

  const name = typeof input?.name === 'string' ? input.name.trim().replace(/[\u0000-\u001f\u007f]/g, '') : '';
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
  const phoneDigits = phone.replace(/\D/g, '');
  if (name.length < 2 || name.length > 120) {
    return response(400, { error: 'Enter your name (2 to 120 characters).' }, origin, allowedOrigin);
  }
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(400, { error: 'Enter a valid email address.' }, origin, allowedOrigin);
  }
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return response(400, { error: 'Enter a valid phone number.' }, origin, allowedOrigin);
  }
  if (input?.consent !== true) {
    return response(400, { error: 'Please confirm that Yaseen may contact you.' }, origin, allowedOrigin);
  }

  let identity;
  let usage;
  try {
    identity = usageIdentity(sourceIp);
    usage = await usageClient.send(new GetItemCommand({
      TableName: USAGE_TABLE,
      Key: identity.key,
      ConsistentRead: true
    }));
  } catch (error) {
    console.error('Chat lead lookup failed:', error.name || 'Error');
    return response(503, { error: 'The continuation form is temporarily unavailable. Please try again later.' }, origin, allowedOrigin);
  }

  const item = usage.Item || {};
  const used = Number(item.requestCount?.N || 0);
  if (item.leadSubmitted?.BOOL === true) {
    return response(200, {
      success: true,
      alreadySubmitted: true,
      remaining: Math.max(0, LEAD_QUESTION_LIMIT - used)
    }, origin, allowedOrigin);
  }
  if (used < DAILY_QUESTION_LIMIT) {
    return response(409, {
      error: 'Use the first 12 assistant questions before requesting more.'
    }, origin, allowedOrigin);
  }

  const now = Math.floor(Date.now() / 1000);
  const lockUntil = now + 120;
  try {
    await usageClient.send(new UpdateItemCommand({
      TableName: USAGE_TABLE,
      Key: identity.key,
      UpdateExpression: 'SET #leadPendingUntil = :lockUntil, #expiresAt = if_not_exists(#expiresAt, :expiresAt)',
      ConditionExpression: 'attribute_not_exists(#leadSubmitted) AND (attribute_not_exists(#leadPendingUntil) OR #leadPendingUntil < :now)',
      ExpressionAttributeNames: { '#leadSubmitted': 'leadSubmitted', '#leadPendingUntil': 'leadPendingUntil', '#expiresAt': 'expiresAt' },
      ExpressionAttributeValues: {
        ':lockUntil': { N: String(lockUntil) },
        ':now': { N: String(now) },
        ':expiresAt': { N: String(identity.expiresAt) }
      }
    }));
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'Your details are already being submitted. Please wait a moment.' }, origin, allowedOrigin);
    }
    console.error('Chat lead reservation failed:', error.name || 'Error');
    return response(503, { error: 'The continuation form is temporarily unavailable. Please try again later.' }, origin, allowedOrigin);
  }

  try {
    const upstream = await fetch('https://formsubmit.co/ajax/mdyaseenferoz@gmail.com', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: allowedOrigin
      },
      body: JSON.stringify({
        _subject: 'Portfolio assistant: visitor wants to continue chatting',
        _template: 'box',
        _replyto: email,
        name,
        email,
        phone,
        message: 'This visitor reached the portfolio assistant question limit and asked to continue.'
      }),
      signal: AbortSignal.timeout(12000)
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.success === false || result.success === 'false') {
      throw new Error(`FormSubmit returned status ${upstream.status}.`);
    }

    await usageClient.send(new UpdateItemCommand({
      TableName: USAGE_TABLE,
      Key: identity.key,
      UpdateExpression: 'SET #leadSubmitted = :yes REMOVE #leadPendingUntil',
      ConditionExpression: '#leadPendingUntil = :lockUntil',
      ExpressionAttributeNames: { '#leadSubmitted': 'leadSubmitted', '#leadPendingUntil': 'leadPendingUntil' },
      ExpressionAttributeValues: { ':yes': { BOOL: true }, ':lockUntil': { N: String(lockUntil) } }
    }));
    return response(200, {
      success: true,
      remaining: Math.max(0, LEAD_QUESTION_LIMIT - used)
    }, origin, allowedOrigin);
  } catch (error) {
    try {
      await usageClient.send(new UpdateItemCommand({
        TableName: USAGE_TABLE,
        Key: identity.key,
        UpdateExpression: 'REMOVE #leadPendingUntil',
        ConditionExpression: '#leadPendingUntil = :lockUntil',
        ExpressionAttributeNames: { '#leadPendingUntil': 'leadPendingUntil' },
        ExpressionAttributeValues: { ':lockUntil': { N: String(lockUntil) } }
      }));
    } catch (cleanupError) {
      console.error('Chat lead reservation cleanup failed:', cleanupError.name || 'Error');
    }
    console.error('Chat lead delivery failed:', error.name || 'Error');
    return response(502, { error: 'We could not send your details right now. Please try again.' }, origin, allowedOrigin);
  }
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
  const method = event.requestContext?.http?.method || event.httpMethod || '';
  const path = event.rawPath || event.requestContext?.http?.path || '';
  const sourceIp = event.requestContext?.http?.sourceIp || '';
  if (method === 'OPTIONS') {
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
  if (path === '/api/contact') return submitLead(sourceIp, input, origin, allowedOrigin);
  if (path && path !== '/api/chat') return response(404, { error: 'This assistant route was not found.' }, origin, allowedOrigin);

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
    usage = await reserveDailyQuestion(sourceIp);
  } catch (error) {
    console.error('Chat usage limit check failed:', error.name || 'Error');
    return response(503, { error: 'The assistant is temporarily unavailable. Please try again later.' }, origin, allowedOrigin);
  }
  if (usage.limitReached) {
    const leadSubmitted = usage.leadSubmitted;
    return response(429, {
      code: leadSubmitted ? 'DAILY_LIMIT_REACHED' : 'LEAD_REQUIRED',
      error: leadSubmitted
        ? "You've used today's 12 additional questions. Please come back tomorrow."
        : "You've used today's 12 questions. Share your contact details to continue with up to 12 more today."
    }, origin, allowedOrigin);
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
    return response(200, {
      reply,
      remaining: usage.remaining,
      leadSubmitted: usage.leadSubmitted || false
    }, origin, allowedOrigin);
  } catch (error) {
    console.error('Bedrock chat request failed:', error.name || 'Error');
    return response(502, { error: 'The AI assistant is temporarily unavailable. Please try again shortly.' }, origin, allowedOrigin);
  }
};
