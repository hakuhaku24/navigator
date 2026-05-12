import type { ContingencyConfig, ContingencyEvent, TripContext } from '../types'
import { detectWeatherEvent } from './weather-detector'
import { detectTrafficEvent } from './traffic-detector'
import { detectVenueEvent } from './venue-detector'
import { detectGroupEvent } from './group-detector'

export interface DetectorOverrides {
  weather?: Parameters<typeof detectWeatherEvent>[1]
  traffic?: Parameters<typeof detectTrafficEvent>[1]
  venue?: Parameters<typeof detectVenueEvent>[1]
  group?: Parameters<typeof detectGroupEvent>[1]
}

export async function detectAllContingencies(
  tripContext: TripContext,
  _config: ContingencyConfig,
  overrides: DetectorOverrides = {},
): Promise<ContingencyEvent[]> {
  const [weather, traffic, venue, group] = await Promise.all([
    detectWeatherEvent(tripContext.current_location, overrides.weather),
    detectTrafficEvent(tripContext.current_route, overrides.traffic),
    detectVenueEvent(tripContext.current_poi, overrides.venue),
    detectGroupEvent(tripContext.group_state, overrides.group),
  ])

  return [weather, traffic, venue, group].filter((e): e is ContingencyEvent => e !== null)
}

export { detectWeatherEvent, detectTrafficEvent, detectVenueEvent, detectGroupEvent }
