#!/usr/bin/env tsx

import * as fs from "node:fs/promises";
import { Logger } from "./logger";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as process from "node:process";
import { argsSchema } from "./schemas/args.schema";
import { routeSchema, RouteSchemaType } from "./schemas/route.schema";
import { haversineDistance } from "./utils/math/geography";
import { deepPassthrough } from "./utils/zod";

const OUTPUT_FILE_PATH = "output.gpx";

async function main() {
  const logger = new Logger();
  const parser = new XMLParser({ ignoreAttributes: false });
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const args = argsSchema.parse(process.argv);

  logger.debug("reading file '%s'", args.filePath);
  const buffer = await fs.readFile(args.filePath);
  logger.debug("parsing xml");
  const xml = parser.parse(buffer.toString());
  logger.debug("validating schema");
  const route = deepPassthrough(routeSchema).parse(xml);

  logger.debug("computing segments");
  const { segments } = route.gpx.trk.trkseg.trkpt.reduce<{
    segments: Array<RouteSchemaType["gpx"]["trk"]["trkseg"]["trkpt"]>;
    nearestPoint: {
      distance: number;
      name: string;
    } | null;
    wpt: RouteSchemaType["gpx"]["wpt"];
  }>(
    ({ segments, nearestPoint, wpt }, trkpt) => {
      const nearestPointDistance = nearestPoint?.distance ?? Infinity;
      const newNearestPoint = wpt.reduce<{
        distance: number;
        name: string;
      } | null>((nearestPoint, { name, "@_lat": pointLat, "@_lon": pointLon }) => {
        const pointDistance = nearestPoint?.distance ?? Infinity;

        const distance = haversineDistance(trkpt["@_lat"], trkpt["@_lon"], pointLat, pointLon);

        if (distance < pointDistance) {
          return { distance, name };
        }
        return nearestPoint;
      }, null);

      if (newNearestPoint !== null && nearestPoint !== null && newNearestPoint.distance > nearestPointDistance) {
        return {
          segments: [...segments, [trkpt]],
          nearestPoint: null,
          wpt: wpt.filter(({ name }) => name !== nearestPoint.name),
        };
      }

      const lastSegment = segments.at(-1) ?? [];
      return {
        segments: [...segments.slice(0, -1), [...lastSegment, trkpt]],
        nearestPoint: newNearestPoint,
        wpt,
      };
    },
    {
      segments: [],
      nearestPoint: null,
      wpt: route.gpx.wpt,
    },
  );

  logger.debug("building new gpx");
  const newRoute = builder.build({
    ...route,
    gpx: {
      ...route.gpx,
      trk: {
        ...route.gpx.trk,
        trkseg: segments.map((trkpt) => ({ trkpt })),
      },
    },
  });

  logger.debug("writing file '%s'", OUTPUT_FILE_PATH);
  return await fs.writeFile(OUTPUT_FILE_PATH, newRoute);
}

main();
