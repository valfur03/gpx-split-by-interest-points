#!/usr/bin/env tsx

import * as fs from "node:fs/promises";
import { Logger } from "./logger";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as process from "node:process";
import { argsSchema } from "./schemas/args.schema";
import { routeSchema, RouteSchemaType } from "./schemas/route.schema";
import { haversineDistance } from "./utils/math/geography";
import { deepPassthrough } from "./utils/zod";

const FILTER_PREFIX = "Jour";
const FILTER_REGEX = /Jour (\d+)/;

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

  const lastDayNumber =
    pointsOfInterest.reduce((acc, { name }) => {
      const res = FILTER_REGEX.exec(name) ?? [];
      const [, strNbr] = res;
      if (strNbr === undefined) {
        return acc;
      }

      const nbr = parseInt(strNbr);

      return nbr > acc ? nbr : acc;
    }, -Infinity) + 1;
  logger.debug("lastDayNumber=%d", lastDayNumber);
  logger.debug("computing segments");
  const { segments } = pointsOfInterest.reduce<{
    segments: Array<{ name: string; trkpt: RouteSchemaType["gpx"]["trk"]["trkseg"]["trkpt"] }>;
  }>(
    ({ segments }, { name, "@_lat": pointLat, "@_lon": pointLon }) => {
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
        segments: segments.reduce<Array<{ name: string; trkpt: RouteSchemaType["gpx"]["trk"]["trkseg"]["trkpt"] }>>(
          (acc, segment) => {
            const index = segment.trkpt.findIndex(({ "@_lat": lat, "@_lon": lon }) => {
              return closestRoutePoint["@_lat"] === lat && closestRoutePoint["@_lon"] === lon;
            });

            if (index < 0) {
              return [...acc, segment];
            }

            return [
              ...acc,
              { name: name, trkpt: segment.trkpt.slice(0, index + 1) },
              { name: segment.name, trkpt: segment.trkpt.slice(index + 1) },
            ];
          },
          [],
        ),
      };
    },
    {
      segments: [{ name: `${FILTER_PREFIX} ${lastDayNumber}`, trkpt: route.gpx.trk.trkseg.trkpt }],
    },
  );

  logger.debug("building new gpx files");
  return await Promise.all(
    segments.map(async (segment) => {
      const { name, trkpt } = segment;
      const newRoute = builder.build({
        ...route,
        gpx: {
          ...route.gpx,
          metadata: {
            ...route.gpx.metadata,
            name: `${route.gpx.metadata.name} (${name})`,
          },
          wpt: undefined,
          trk: {
            ...route.gpx.trk,
            trkseg: {
              trkpt,
            },
          },
        },
      });

      const outputFilePath = `${name}.gpx`;
      logger.debug("writing file '%s'", outputFilePath);
      return await fs.writeFile(outputFilePath, newRoute);
    }),
  );
}

main();
