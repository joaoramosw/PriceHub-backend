import Type, { type Static } from 'typebox'

export const Envelope = Type.Object(
  {
    eventId: Type.String({ format: 'uuid' }),
    type: Type.String({ minLength: 1 }),
    version: Type.Integer({ minimum: 1 }),
    occurredAt: Type.String({ format: 'date-time' }),
    correlationId: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
    data: Type.Unknown(),
  },
  { additionalProperties: false },
)
export type Envelope = Static<typeof Envelope>
