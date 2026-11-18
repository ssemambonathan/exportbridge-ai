import { Router } from 'express';
import { z } from 'zod';
import { GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { AiProviderUnavailableError, getGeminiClient } from '../agents/aiClient.ts';
import { sanitizeUntrustedText } from '../security/crypto.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { getOrCreateUser } from '../../db/users.ts';
import { appendChatMessage, createChatSessionForUserId } from '../../db/queries.ts';

const router = Router();

export const CHAT_PERSONAS = {
  export_compliance: {
    label: 'Export Compliance Officer',
    description: 'EUDR geolocation, phytosanitary certificates, rules of origin, and destination customs controls.',
    systemInstruction:
      'You are the ExportBridge AI Export Compliance Officer specializing in African agricultural exports (coffee, cocoa, sesame, tea, macadamia). Give rigorous, practical guidance on EU Deforestation Regulation (EUDR) polygon traceability, phytosanitary inspection, ICO/EAC certificates of origin, aflatoxin/moisture tolerances, and Incoterms 2020 documentary obligations. Never fabricate certifications or legal rulings; clearly distinguish verified trade standards from checklists requiring authority sign-off.',
  },
  pricing_strategist: {
    label: 'Commercial Pricing Strategist',
    description: 'FOB/CFR/CIF cost buildup, Mombasa/Djibouti port haulage, marine insurance, and buyer margin bands.',
    systemInstruction:
      'You are the ExportBridge AI Commercial Pricing Strategist. Help exporters and trade directors structure transparent cost buildups across EXW, FOB, CFR, and CIF Incoterms, factoring farmgate procurement, inland haulage, port terminal handling, ocean container freight, marine insurance, and working-capital risk. Present numbers clearly with itemized breakdowns.',
  },
  buyer_diligence: {
    label: 'Buyer Due Diligence Analyst',
    description: 'Importer vetting, payment terms (LC vs CAD vs TT), counterparty sanctions hygiene, and contract red flags.',
    systemInstruction:
      'You are the ExportBridge AI Buyer Due Diligence Analyst. Advise African exporters on vetting international buyers across Europe, Middle East, North America, and Asia—covering corporate registry verification, Irrevocable Confirmed Letters of Credit (LC), Cash Against Documents (CAD), trade credit insurance, and avoiding advance-fee or diversion risks.',
  },
  logistics_coordinator: {
    label: 'Origin Logistics Coordinator',
    description: 'Container stuffing, moisture control, East/West African corridor transit, and Bill of Lading timing.',
    systemInstruction:
      'You are the ExportBridge AI Origin Logistics Coordinator. Provide operational guidance on 20ft dry/reefer container loading, GrainPro/jute moisture protection, Mombasa/Dar es Salaam/Djibouti/Tema port clearance timelines, pre-shipment inspection (SGS/Bureau Veritas), and Bill of Lading release workflows.',
  },
} as const;

export const ALLOWED_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
  'gemini-4-carbon',
] as const;

const chatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.enum(ALLOWED_CHAT_MODELS).default('gemini-4-hydrogen'),
  persona: z.enum(['export_compliance', 'pricing_strategist', 'buyer_diligence', 'logistics_coordinator']).default('export_compliance'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().min(1).max(12000),
      })
    )
    .max(40)
    .default([]),
  sqlSessionId: z.number().int().positive().optional(),
  firebaseIdToken: z.string().max(4096).optional(),
});

function buildModelConfig(model: (typeof ALLOWED_CHAT_MODELS)[number], systemInstruction: string) {
  const config: Record<string, any> = {
    systemInstruction,
  };

  if (model === 'gemini-4-hydrogen') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
  } else if (model === 'gemini-4-argon') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
  } else if (model === 'gemini-4-carbon') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }
  // Note: gemini-3.1-flash-lite defaults to MINIMAL thinking; no thinkingConfig needed
  return config;
}

function formatGeminiApiError(err: any, model: string): { status: number; message: string } {
  const msg = String(err?.message || err || 'Unknown AI error');
  if (err instanceof AiProviderUnavailableError) {
    return { status: 503, message: msg };
  }
  if (/PERMISSION_DENIED|API_KEY_INVALID|403|401/i.test(msg)) {
    return {
      status: 403,
      message: `API key permissions do not authorize model "${model}". Check your API key in Settings > Secrets or switch to gemini-4-hydrogen / gemini-3.1-flash-lite.`,
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return {
      status: 429,
      message: `Quota or rate limit reached for "${model}". Selecting a paid billing key in Settings > Secrets increases quota, or switch to gemini-4-hydrogen / gemini-3.1-flash-lite.`,
    };
  }
  if (/NOT_FOUND|404/i.test(msg)) {
    return {
      status: 404,
      message: `Model "${model}" is currently unavailable on this key. Please select another model.`,
    };
  }
  return { status: 500, message: `Gemini chat request failed: ${msg}` };
}

async function persistTurnToCloudSql(params: {
  firebaseIdToken?: string;
  sqlSessionId?: number;
  persona: string;
  model: string;
  userText: string;
  modelText: string;
}): Promise<number | undefined> {
  if (!params.firebaseIdToken) return params.sqlSessionId;
  try {
    const decoded = await adminAuth.verifyIdToken(params.firebaseIdToken);
    const sqlUser = await getOrCreateUser(decoded.uid, decoded.email || 'member@exportbridge.local', decoded.name);
    let sessionId = params.sqlSessionId;
    if (!sessionId) {
      const created = await createChatSessionForUserId(sqlUser.id, {
        title: params.userText.slice(0, 72) || 'ExportBridge Copilot',
        persona: params.persona,
        model: params.model,
      });
      sessionId = created.id;
    }
    await appendChatMessage({ sessionId, role: 'user', content: params.userText, model: params.model });
    await appendChatMessage({ sessionId, role: 'model', content: params.modelText, model: params.model });
    return sessionId;
  } catch (err) {
    console.error('Non-fatal Cloud SQL chat persistence notice:', err);
    return params.sqlSessionId;
  }
}

router.get('/personas', requireAuth, (_req, res) => {
  res.json({
    personas: Object.entries(CHAT_PERSONAS).map(([id, p]) => ({
      id,
      label: p.label,
      description: p.description,
    })),
    models: [
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', tier: 'Standard · Balanced' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', tier: 'Fast · Low Latency' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', tier: 'Complex Interactive · Paid Key' },
      { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', tier: 'Deep Reasoning · Paid Key' },
    ],
  });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid chat payload', details: parsed.error.flatten() });
  }

  const { message, model, persona, history, sqlSessionId, firebaseIdToken } = parsed.data;
  const cleanMessage = sanitizeUntrustedText(message).sanitized;
  const personaSpec = CHAT_PERSONAS[persona];

  try {
    const ai = getGeminiClient();
    const chat = ai.chats.create({
      model,
      history: history.map((turn) => ({
        role: turn.role,
        parts: [{ text: sanitizeUntrustedText(turn.text).sanitized }],
      })),
      config: buildModelConfig(model, personaSpec.systemInstruction),
    });

    const response: GenerateContentResponse = await chat.sendMessage({
      message: cleanMessage,
    });
    const replyText = (response.text ?? '').trim() || 'No response text generated.';
    const persistedSessionId = await persistTurnToCloudSql({
      firebaseIdToken,
      sqlSessionId,
      persona,
      model,
      userText: cleanMessage,
      modelText: replyText,
    });

    return res.json({
      reply: replyText,
      model,
      persona,
      sqlSessionId: persistedSessionId,
    });
  } catch (err: any) {
    const formatted = formatGeminiApiError(err, model);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post('/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid chat payload', details: parsed.error.flatten() });
  }

  const { message, model, persona, history, sqlSessionId, firebaseIdToken } = parsed.data;
  const cleanMessage = sanitizeUntrustedText(message).sanitized;
  const personaSpec = CHAT_PERSONAS[persona];

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const ai = getGeminiClient();
    const chat = ai.chats.create({
      model,
      history: history.map((turn) => ({
        role: turn.role,
        parts: [{ text: sanitizeUntrustedText(turn.text).sanitized }],
      })),
      config: buildModelConfig(model, personaSpec.systemInstruction),
    });

    const stream = await chat.sendMessageStream({
      message: cleanMessage,
    });

    let accumulated = '';
    for await (const chunk of stream) {
      const c = chunk as GenerateContentResponse;
      const delta = c.text ?? '';
      if (delta) {
        accumulated += delta;
        sendEvent({ type: 'chunk', text: delta });
      }
    }

    const finalText = accumulated.trim() || 'No response generated.';
    const persistedSessionId = await persistTurnToCloudSql({
      firebaseIdToken,
      sqlSessionId,
      persona,
      model,
      userText: cleanMessage,
      modelText: finalText,
    });

    sendEvent({
      type: 'done',
      text: finalText,
      model,
      persona,
      sqlSessionId: persistedSessionId,
    });
    res.end();
  } catch (err: any) {
    const formatted = formatGeminiApiError(err, model);
    sendEvent({ type: 'error', status: formatted.status, error: formatted.message });
    res.end();
  }
});

export default router;
