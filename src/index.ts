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
const FILTER_REGEX = /Jour \d+/;

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

  logger.debug("filtering points of interest");
  const pointsOfInterest = route.gpx.wpt.filter(({ name }) => name.match(FILTER_REGEX));

  logger.debug("computing segments");
  const { segments } = pointsOfInterest.reduce<{
    segments: Array<RouteSchemaType["gpx"]["trk"]["trkseg"]["trkpt"]>;
  }>(
    ({ segments }, { "@_lat": pointLat, "@_lon": pointLon }) => {
      const { closestRoutePoint } = route.gpx.trk.trkseg.trkpt.reduce<{
        closestRoutePoint: { "@_lat": number; "@_lon": number; distance: number } | null;
      }>(
        ({ closestRoutePoint }, trkpt) => {
          const closestRoutePointDistance = closestRoutePoint?.distance ?? Infinity;
          const distance = haversineDistance(pointLat, pointLon, trkpt["@_lat"], trkpt["@_lon"]);

          if (distance < closestRoutePointDistance) {
            return { closestRoutePoint: { ...trkpt, distance } };
          }

          return { closestRoutePoint };
        },
        { closestRoutePoint: null },
      );

      if (closestRoutePoint === null) {
        return { segments };
      }

      return {
        segments: segments.reduce<Array<RouteSchemaType["gpx"]["trk"]["trkseg"]["trkpt"]>>((acc, segment) => {
          const index = segment.findIndex(({ "@_lat": lat, "@_lon": lon }) => {
            return closestRoutePoint["@_lat"] === lat && closestRoutePoint["@_lon"] === lon;
          });

          if (index < 0) {
            return [...acc, segment];
          }

          return [...acc, segment.slice(0, index + 1), segment.slice(index + 1)];
        }, []),
      };
    },
    {
      segments: [route.gpx.trk.trkseg.trkpt],
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
