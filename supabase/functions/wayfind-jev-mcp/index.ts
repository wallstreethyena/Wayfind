import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@^1.6.0'
import { z } from 'npm:zod@^4.3.6'

import {
  DEFAULT_JEV_MODEL,
  MAX_CHECKS,
  MAX_LABELS,
  MAX_LEVELS,
  MAX_STATE_CHARS,
  runChecks,
  runClassification,
  runScore,
  safeGatewayError,
} from './jevCore.js'

const POLICY =
  'Bounded judgement only. Jev output is not factual evidence and never authorizes a destructive, safety-critical, compliance, legal, medical, financial, or irreversible production action.'

const paidReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
}

function jsonText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function mcpFailure(error: unknown) {
  const safe = safeGatewayError(error)
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: safe }) }],
  }
}

function jevOptions() {
  return {
    apiKey: Deno.env.get('TYPESAFE_API_KEY') || '',
    model: Deno.env.get('TYPESAFE_MODEL') || DEFAULT_JEV_MODEL,
  }
}

Deno.serve(
  // OAuth discovery MUST be outside the user-auth gate. The Supabase function
  // itself is deployed with verify_jwt=false; this middleware performs the real
  // OAuth 2.1 verification and exposes RFC 9728 protected-resource metadata.
  withOAuthProtectedResource(
    withSupabase({ auth: 'user' }, async (req, { supabase }) => {
      const ownerId = String(Deno.env.get('JEV_MCP_OWNER_USER_ID') || '').trim()
      if (!ownerId) {
        return Response.json({ error: 'jev_owner_not_configured' }, { status: 503 })
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
      }
      if (userData.user.id !== ownerId) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }

      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'wayfind-jev', version: '1.0.0' })

        server.registerTool(
          'jev_status',
          {
            title: 'Jev status',
            description: 'Check whether the Wayfind Jev gateway is configured. This does not call TypeSafe and consumes no Jev usage.',
            inputSchema: z.object({}),
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
          },
          async () => jsonText({
            ok: true,
            configured: Boolean(String(Deno.env.get('TYPESAFE_API_KEY') || '').trim()),
            model: Deno.env.get('TYPESAFE_MODEL') || DEFAULT_JEV_MODEL,
            ownerLocked: true,
            policy: POLICY,
            limits: { maxStateChars: MAX_STATE_CHARS, maxChecks: MAX_CHECKS, maxLabels: MAX_LABELS, maxLevels: MAX_LEVELS },
          }),
        )

        server.registerTool(
          'jev_check',
          {
            title: 'Jev proposition check',
            description: `Estimate support probabilities for up to ${MAX_CHECKS} propositions using only the supplied state. One call consumes TypeSafe/Jev usage. ${POLICY}`,
            inputSchema: z.object({
              state: z.string().min(1).max(MAX_STATE_CHARS),
              propositions: z.array(z.string().min(1).max(700)).min(1).max(MAX_CHECKS),
            }),
            annotations: paidReadAnnotations,
          },
          async (input) => {
            try {
              return jsonText({ ok: true, ...(await runChecks(input, jevOptions())), policy: POLICY })
            } catch (error) {
              return mcpFailure(error)
            }
          },
        )

        server.registerTool(
          'jev_classify',
          {
            title: 'Jev classification',
            description: `Choose one label from a bounded set using only the supplied state. One call consumes TypeSafe/Jev usage. ${POLICY}`,
            inputSchema: z.object({
              state: z.string().min(1).max(MAX_STATE_CHARS),
              instructions: z.string().min(1).max(1000),
              labels: z.array(z.object({
                label: z.string().min(1).max(80),
                description: z.string().max(500).optional(),
              })).min(2).max(MAX_LABELS),
            }),
            annotations: paidReadAnnotations,
          },
          async (input) => {
            try {
              return jsonText({ ok: true, ...(await runClassification(input, jevOptions())), policy: POLICY })
            } catch (error) {
              return mcpFailure(error)
            }
          },
        )

        server.registerTool(
          'jev_score',
          {
            title: 'Jev rubric score',
            description: `Estimate a score across an ordered rubric using only the supplied state. One call consumes TypeSafe/Jev usage. ${POLICY}`,
            inputSchema: z.object({
              state: z.string().min(1).max(MAX_STATE_CHARS),
              instructions: z.string().min(1).max(1000),
              levels: z.array(z.string().min(1).max(500)).min(2).max(MAX_LEVELS),
            }),
            annotations: paidReadAnnotations,
          },
          async (input) => {
            try {
              return jsonText({ ok: true, ...(await runScore(input, jevOptions())), policy: POLICY })
            } catch (error) {
              return mcpFailure(error)
            }
          },
        )

        return server
      })

      return handler.fetch(req)
    }),
  ),
)
