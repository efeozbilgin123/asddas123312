import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema(
  {
    name: t.string(),
    look: t.string(),
    avatar: t.string().default('mannequin'),
    x: t.number(),
    z: t.number(),
    facing: t.number(),
    speed: t.number(),
    seatId: t.string().default(''),
    away: t.boolean().default(false)
  },
  'PlayerState'
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const CatSchema = schema(
  {
    x: t.number(),
    z: t.number(),
    facing: t.number(),
    action: t.string().default('sleep')
  },
  'CatSchema'
);
export type CatSchema = SchemaType<typeof CatSchema>;

export const SalonState = schema(
  {
    players: t.map(PlayerState),
    cat: CatSchema
  },
  'SalonState'
);
export type SalonState = SchemaType<typeof SalonState>;
