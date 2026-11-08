# Telemetry reference

Every span name, attribute, event, failure code, metric and log field the project produces. Scripts and tests depend on these names; change them together.

## Service names and instrumentation scopes

| Process  | `service.name`       | Tracer / meter scope                     |
| -------- | -------------------- | ---------------------------------------- |
| browser  | `bikeshare-frontend` | `io.github.elhart05.bikeshare.frontend`  |
| rentals  | `rentals`            | `io.github.elhart05.bikeshare.rentals`   |
| fleet    | `fleet`              | `io.github.elhart05.bikeshare.fleet`     |

The Java agent adds its own scopes (`tomcat`, `java-http-client`, `spring-data`, `hibernate`, `jdbc`, `annotations`) and the browser its `fetch` instrumentation.

## Spans

| Span                                   | Producer                               | Notes                                                 |
| -------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `action.refresh`                       | browser, page load and Refresh button  | parent of `GET /stations` and `GET /rentals`          |
| `action.rent`                          | browser, Rent button                   | `POST /rentals`, then a reload                        |
| `action.return`                        | browser, Return button                 | `POST /rentals/{reference}/return`, then a reload     |
| `action.view_report`                   | browser, Report button                 | `GET /rentals/{reference}/report`                     |
| `POST /rentals`                        | agent, rentals server span             | parent of `rental.open`                               |
| `rental.open`                          | rentals, manual                        |                                                       |
| `rental.return`                        | rentals, manual                        |                                                       |
| `GET /rentals/{reference}/report`      | agent, rentals server span             |                                                       |
| `POST /stations/{code}/pickup`         | agent, fleet server span               | parent of `fleet.pickup`                              |
| `fleet.pickup`                         | fleet, manual                          |                                                       |
| `GET /stations/{code}/turnover-index`  | agent, fleet server span               | parent of `fleet.consolidation`                       |
| `fleet.consolidation`                  | fleet, `@WithSpan` read by the agent   | lasts `fleet.consolidation-ms` (500 ms by default)    |
| `fleet.<method>`                       | Spoon instrumented copy only           | `fleet.stations`, `fleet.station`, `fleet.available`, `fleet.drop_off`, `fleet.turnover_index` |

Successful `OPTIONS` preflight spans are dropped by the Collector.

## Span attributes

| Key                                   | Type   | Set on                                                    |
| ------------------------------------- | ------ | --------------------------------------------------------- |
| `bikeshare.rental.start_station`      | string | `action.rent`, `rental.open`, `rental.return`             |
| `bikeshare.rental.end_station`        | string | `action.return`, `rental.return`                          |
| `bikeshare.rental.reference`          | string | `action.return`, `action.view_report`, `rental.open`, `rental.return` |
| `bikeshare.bike.id`                   | string | `rental.open`, `fleet.pickup`                             |
| `bikeshare.rental.duration_minutes`   | long   | `rental.return`                                           |
| `bikeshare.rental.amount_eur`         | double | `rental.return`                                           |
| `bikeshare.subscriber.domain`         | string | `rental.open` (the domain only, never the address)        |
| `bikeshare.rental.failure.step`       | string | `rental.open`, `rental.return` on error                   |
| `bikeshare.rental.failure.reason`     | string | `rental.open`, `rental.return` on error                   |
| `bikeshare.station.code`              | string | `fleet.pickup`, `fleet.consolidation`                     |
| `bikeshare.fleet.rejection.reason`    | string | `fleet.pickup` on rejection                               |
| `bikeshare.fleet.consolidation_ms`    | long   | `fleet.consolidation`                                     |
| `bikeshare.failure.category`          | string | browser action span on failure                            |
| `bikeshare.failure.http_status`       | number | browser action span on failure (0 when no response)       |

## Span events and status

| Event              | On              | When                              |
| ------------------ | --------------- | --------------------------------- |
| `bike.picked_up`   | `rental.open`   | after the fleet pickup succeeds   |
| `bike.dropped_off` | `rental.return` | after the fleet drop-off succeeds |

`rental.open`, `rental.return` and `fleet.pickup` record failures with `recordException` and set status `ERROR` with the exception message. Browser action spans set `ERROR` with the failure message shown in the UI.

## Failure codes

`bikeshare.rental.failure.step`:

| Step               | Method       |
| ------------------ | ------------ |
| `subscriber_check` | open         |
| `fleet_pickup`     | open         |
| `save`             | open         |
| `lookup`           | return       |
| `fleet_drop_off`   | return       |
| `billing`          | return       |

`bikeshare.rental.failure.reason`:

| Reason                  | Cause                                      | Log level         |
| ----------------------- | ------------------------------------------ | ----------------- |
| `subscriber_rejected`   | unknown email or wrong password            | WARN              |
| `unknown_station`       | fleet answered 404                         | WARN              |
| `movement_refused`      | fleet answered 409                         | WARN              |
| `rental_not_found`      | unknown reference                          | WARN              |
| `rental_already_closed` | second return                              | WARN              |
| `fleet_unavailable`     | fleet answered 503                         | ERROR, with stack |
| `fleet_unreachable`     | no response from fleet                     | ERROR             |
| `internal_error`        | anything else                              | ERROR             |

`bikeshare.fleet.rejection.reason`:

| Reason                   | Cause                    |
| ------------------------ | ------------------------ |
| `station_not_found`      | unknown station code     |
| `station_out_of_service` | station is out of service |
| `no_bike_available`      | no bike at the station   |

Browser failure categories (`bikeshare.failure.category`): `unreachable` (no response: service down, network, CORS refused), `rejected` (the service answered with an error), `unexpected` (anything else).

## Metrics

Published by rentals only, by start station.

| Instrument                 | Kind                | Unit | Attribute                        | Prometheus series                                  |
| -------------------------- | ------------------- | ---- | -------------------------------- | -------------------------------------------------- |
| `bikeshare.rentals.opened` | counter             |      | `bikeshare.rental.start_station` | `bikeshare_rentals_opened_total`                   |
| `bikeshare.rentals.amount` | histogram           | EUR  | `bikeshare.rental.start_station` | `bikeshare_rentals_amount_EUR_bucket`, `_sum`, `_count` |

Histogram buckets: 1.1, 1.25, 1.5, 2.0, 3.0, 5.0, 10.0. The Prometheus label is `bikeshare_rental_start_station`. The Collector keeps only metrics whose name starts with `bikeshare.` and removes `service.instance.id`, so a JVM restart does not duplicate series.

## Java logs

Spring Boot writes ECS JSON to `logs/<service>.log` and a short format to the console. Top-level fields: `@timestamp`, `log.level`, `message`, `trace_id`, `span_id`. Dotted business keys are nested by the ECS writer: `bikeshare.rental.start_station` appears as `{"bikeshare":{"rental":{"start_station":...}}}`.

| Event (`message`)        | Level         | Producer                    | Fields                                                                                                  |
| ------------------------ | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `rental.opened`          | INFO          | `RentalService.open`        | `bikeshare.rental.reference`, `bikeshare.bike.id`, `bikeshare.rental.start_station`, `bikeshare.subscriber.domain` |
| `rental.closed`          | INFO          | `RentalService.returnRental`| `bikeshare.rental.reference`, `bikeshare.rental.start_station`, `bikeshare.rental.end_station`, `bikeshare.rental.duration_minutes`, `bikeshare.rental.amount_eur` (number) |
| `rental.open_failed`     | WARN or ERROR | `RentalService.open`        | `bikeshare.rental.failure.step`, `bikeshare.rental.failure.reason`, `bikeshare.rental.failure.detail`   |
| `rental.return_failed`   | WARN or ERROR | `RentalService.returnRental`| same as above                                                                                           |
| `fleet.pickup_rejected`  | WARN          | `FleetService.pickUp`       | `bikeshare.station.code`, `bikeshare.fleet.rejection.reason`                                            |

A successful fleet pickup logs nothing: rentals already logs the rental.

## Browser log

`BrowserLogger` writes one JSON line per event to the console: `{"@timestamp", "level", "message", ...fields, "trace_id", "span_id"}`. `scripts/browser.mjs` copies these lines to `logs/frontend.log`.

| Event                     | Console level                           | Fields                                                                                           |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `action.rent_confirmed`   | info                                    | `bikeshare.rental.reference`, `bikeshare.bike.id`, `bikeshare.rental.start_station`              |
| `action.return_confirmed` | info                                    | `bikeshare.rental.reference`, `bikeshare.rental.duration_minutes`, `bikeshare.rental.amount_eur` |
| `action.failed`           | warn for `rejected`, error otherwise    | `bikeshare.action.name`, `bikeshare.failure.category`, `bikeshare.failure.http_status`, `bikeshare.failure.message` |

## Collector processing

| Processor                   | Pipeline | Effect                                                                                     |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `filter/preflight`          | traces   | drops `OPTIONS` spans with status 200                                                      |
| `attributes/minimize`       | traces   | deletes `client.address`, `network.peer.address`, `network.peer.port`, `user_agent.original` |
| `resource/minimize`         | traces   | deletes `process.command_args`                                                             |
| `filter/app_metrics`        | metrics  | keeps only metrics named `bikeshare.*`                                                     |
| `resource/drop_instance_id` | metrics  | deletes `service.instance.id`                                                              |
| `batch`                     | both     | batches exports                                                                            |
