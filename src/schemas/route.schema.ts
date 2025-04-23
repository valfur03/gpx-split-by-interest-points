import { z } from "zod";

export const routeSchema = z.object({
  gpx: z.object({
    metadata: z.object({
      name: z.string(),
    }),
    wpt: z.array(
      z.object({
        name: z.string(),
        "@_lat": z.coerce.number(),
        "@_lon": z.coerce.number(),
      }),
    ),
    trk: z.object({
      trkseg: z.object({
        trkpt: z.array(
          z.object({
            "@_lat": z.coerce.number(),
            "@_lon": z.coerce.number(),
          }),
        ),
      }),
    }),
  }),
});
export type RouteSchemaType = z.infer<typeof routeSchema>;
