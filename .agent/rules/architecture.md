---
trigger: always_on
description: Nx monorepo architecture and code structure rules
---

# Architecture Rules 

## 3. Nx Monorepo & Architecture Rules

* Follow Nx module boundaries strictly.
* Apps must never import from other apps.
* Business logic must live exclusively in `/libs` and in `apps/<app-name>/services`.
* Apps should only orchestrate: wiring, controllers, input/output.
* Shared utilities live in `/libs/shared`.
* Respect dependency tags to enforce architectural boundaries.
* All errors shall be captured by Sentry. App should support graceful termination.
* All apps connect to the same database (MVP only).
* Follow the n-tire Architecture with the structure below
    * `/libs/shared`: any shared things, especially for testing utils, ... Not depend on others.
    * `/libs/dal`: plan models, repositories with basic functions only. Only integration tests in this folder. Not depend on others.
    * `/apps/<app-name>/`: prefer services style, simple dependency injection via constructor using interfaces rather than using class, class style, mix of unit test and integration test, depends on `dal` and `shared`. 
* For app or lib, below is the sample structure we should follow
  * /src
     * config.ts: define the custom config for this app only, extends from base config
     * logger.ts: this app logger version,
     * main.ts: main entry 
     * worker.ts / server.ts: where we wiring up our server instances all together, start dependency services,....
     * container.ts: Simple version of IoC container. We basically just wiring up everything manually here if possible and reuse. Avoid adding httpServer instance or worker instance. Prefer inject service instances only. If any of the instance that need to wiring up up-on-request, use factory. All DAL repositories should be injected rather than direct access.
     * servers: where we keep all server classes (web or worker)
        * http-server.ts : HTTP web server class 
     * routes: put all routes here, with hierarchy
        * index.ts
        * v1/
            * route-entry.ts
     * middlewares: any middleware for webserver fastify, especially error handler, swagger validation
     * events: event handler, for Upstash Redis Stream
        * brokers
            * fetch-ticker-info.event.ts 
     * services: put all classes or services into here
        * telegram-client.service.ts
        * brokers/
            * base-broker.service.ts
            * broker-1.service.ts
  * /test: put all tests here, respect the relative path name
     * unit: unit tests
     * integration: integration test  
     * setup.ts: jest global setup
     * utils: test util for this app only. Any common utils load from `/libs/shared/test-utils`
## 10. AI-Friendly Code Structure

* Keep individual source files small (ideal range: 150–250 lines). Split large files into focused units.
* Use descriptive, domain-specific filenames instead of generic names.
* At the top of each major file, include a 3–5 line summary describing the purpose, inputs, outputs, and core flow.
* Each module must have a `README.md` documenting its responsibility, main flows, and relationships to other modules.

## 11. Continuous AI-Readiness Refactoring

* Treat code readability and structure as ongoing maintenance, similar to infrastructure upkeep.
* Refactor overly complex or unclear files to improve AI comprehension and reduce context needs.
* Consolidate duplicated logic into shared libraries to prevent scattered context.
* Improve clarity proactively: clear naming, elimination of dead code, and consistent patterns.

## 12. Source Code Is Documentation

* Write code so it can be understood without extra explanations.
* Avoid clever or opaque patterns that obscure intent.
* Ensure flows and data transformations are explicit and easily traceable.
* When logic is complex, document the flow in a module-level Markdown file.
