# QA Tool System Charts

## Purpose

This document provides a shared set of Mermaid charts for product discussion,
technical planning, onboarding, and design work.

Use these scope labels when discussing a chart:

- **Current concept:** behavior implemented under `concept/`
- **Target MVP:** behavior required for the first production version
- **Future:** behavior intentionally deferred beyond the MVP

The written source of truth remains:

- [QA Tool Requirements](./qa-tool-requirements.md)
- [QA Tool System Architecture](./system-architecture.md)
- [SDK To Tauri Connection](./sdk-tauri-connection.md)
- [QA Tool Implementation Roadmap](./implementation-roadmap.md)

## Chart Index

| Chart | Scope | Primary audience |
| --- | --- | --- |
| Product use cases | Target MVP | Product, design, engineering |
| System context | Target MVP and future | Engineering, architecture |
| Current SDK connection | Current concept | Mobile and desktop engineers |
| Target request lifecycle | Target MVP | Mobile and desktop engineers |
| Device access decision | Current concept and target MVP | Desktop engineers, security |
| Domain relationship model | Target MVP | Backend and product engineers |
| Delivery phases | Target product | Whole team |

## Product Use Cases

This chart shows the main actions available to each product persona. It is a
use-case-oriented flowchart, not a strict UML use-case diagram.

```mermaid
flowchart LR
    qaTester["QA Tester"]
    qaLead["QA Lead"]
    developer["Developer"]

    subgraph testManagement ["Test Management"]
        manageCases["Create and manage test cases"]
        managePlans["Create and organize test plans"]
        reviewResults["Review coverage and results"]
    end

    subgraph testExecution ["Test Execution"]
        startSession["Start a test session"]
        markResult["Mark pass, fail, blocked, or incomplete"]
        reportBug["Create a bug marker"]
        reviewHistory["Review session history"]
    end

    subgraph trafficInspection ["Device And Traffic Inspection"]
        pairDevice["Pair or register a device"]
        controlDevice["Enable or disable device access"]
        inspectRequest["Inspect request headers and body"]
        inspectResponse["Inspect response headers and body"]
        diagnoseFailure["Diagnose API failures"]
    end

    qaTester --> startSession
    qaTester --> markResult
    qaTester --> reportBug
    qaTester --> inspectRequest
    qaTester --> inspectResponse

    qaLead --> manageCases
    qaLead --> managePlans
    qaLead --> reviewResults
    qaLead --> reviewHistory

    developer --> pairDevice
    developer --> controlDevice
    developer --> inspectRequest
    developer --> inspectResponse
    developer --> diagnoseFailure

    style testManagement fill:#FFF3CD,stroke:#D6A62A
    style testExecution fill:#E8F3FF,stroke:#3D8ED0
    style trafficInspection fill:#E9F8EE,stroke:#3A9B5F
```

## System Context

This chart shows the target MVP system boundary and the future browser path.
The direct SDK-to-desktop stream remains available even when backend services
are unavailable.

```mermaid
flowchart LR
    iosApp["iOS Host App"]

    subgraph iosSdk ["iOS SDK"]
        capture["Capture API traffic"]
        overlay["Debug overlay"]
        liveTransport["Live WebSocket transport"]
    end

    subgraph desktop ["Tauri Desktop App"]
        wsServer["Rust WebSocket server"]
        accessPolicy["Device access policy"]
        inspector["React traffic inspector"]
        runner["Manual test runner"]
        localStore[(Local storage)]
    end

    subgraph backend ["Backend Platform"]
        api["Backend API"]
        realtime["Realtime service"]
        database[(PostgreSQL)]
        objectStore[(Object storage)]
    end

    webClient["Future Web Client"]

    iosApp --> capture
    iosApp --> overlay
    overlay --> liveTransport
    capture --> liveTransport
    liveTransport -->|"Local WebSocket"| wsServer
    wsServer --> accessPolicy
    accessPolicy --> inspector
    accessPolicy --> runner
    inspector --> localStore
    runner --> localStore

    runner -->|"HTTPS and realtime sync"| api
    localStore -->|"Queued sync"| api
    api --> database
    api --> objectStore
    api --> realtime
    realtime --> webClient
    webClient -->|"HTTPS"| api

    style iosSdk fill:#E8F3FF,stroke:#3D8ED0
    style desktop fill:#F2EAFE,stroke:#7C5CBF
    style backend fill:#E9F8EE,stroke:#3A9B5F
```

## Current SDK Connection

This sequence reflects the current concept:

- Manual WebSocket URL
- Mandatory allowlist
- One completed `ApiRecord` per request or error
- Tauri event emitted after the record is accepted

```mermaid
sequenceDiagram
    participant User as Developer
    participant Overlay as iOS Debug Overlay
    participant Client as WebSocket Client
    participant Logger as Network Logger
    participant Server as Tauri Rust Server
    participant Policy as Device Allowlist
    participant UI as React Inspector

    User->>Overlay: Copy device ID
    User->>UI: Register and name device
    User->>Overlay: Enter WebSocket URL
    Overlay->>Client: Connect
    Client->>Server: WebSocket handshake
    Server-->>Client: Connection accepted
    Client->>Server: Ping
    Server-->>Client: Pong
    Overlay-->>User: Show connected status

    User->>Logger: Run API request
    Logger->>Logger: Capture request and response
    Logger->>Client: Send completed ApiRecord
    Client->>Server: ApiRecord JSON
    Server->>Policy: Check device ID and enabled state
    Policy-->>Server: Accept
    Server->>UI: Emit api-record
    UI-->>User: Show request and response
```

## Target Request Lifecycle

The target MVP should send versioned lifecycle events instead of waiting for a
single completed record. All events for one request share the same
`requestId`.

```mermaid
sequenceDiagram
    participant App as iOS Host App
    participant SDK as QA SDK
    participant Desktop as Tauri Desktop
    participant UI as Traffic Inspector

    App->>SDK: Start HTTP request
    SDK->>Desktop: request_started
    Desktop->>UI: Show in-progress request
    SDK->>Desktop: request_body_captured
    Desktop->>UI: Update request details

    alt Response received
        App-->>SDK: HTTP response
        SDK->>Desktop: response_received
        SDK->>Desktop: request_completed
        Desktop->>UI: Show completed request and response
    else Request failed
        App-->>SDK: Network error
        SDK->>Desktop: request_failed
        Desktop->>UI: Show failed request
    end
```

## Device Access Decision

The current concept always follows the allowlist branch. The target MVP adds a
setting for open mode while keeping allowlist mode as the default.

```mermaid
flowchart TD
    incoming(["Incoming traffic record"])
    validJson{"Valid message schema?"}
    policy{"Access mode?"}
    registered{"Device registered?"}
    enabled{"Device enabled?"}
    accept["Normalize and emit to UI"]
    rejectSchema["Reject invalid message"]
    rejectUnknown["Reject unknown device"]
    rejectDisabled["Reject disabled device"]

    incoming --> validJson
    validJson -->|"No"| rejectSchema
    validJson -->|"Yes"| policy
    policy -->|"Open"| accept
    policy -->|"Allowlist"| registered
    registered -->|"No"| rejectUnknown
    registered -->|"Yes"| enabled
    enabled -->|"No"| rejectDisabled
    enabled -->|"Yes"| accept

    style accept fill:#DCFCE7,stroke:#15803D
    style rejectSchema fill:#FEE2E2,stroke:#B42318
    style rejectUnknown fill:#FEE2E2,stroke:#B42318
    style rejectDisabled fill:#FEF3C7,stroke:#B45309
```

## Domain Relationship Model

This model covers the primary MVP relationships. Field-level definitions remain
in the system architecture document.

```mermaid
erDiagram
    WORKSPACE ||--o{ TEST_CASE : contains
    WORKSPACE ||--o{ TAG : contains
    WORKSPACE ||--o{ TEST_PLAN : contains
    WORKSPACE ||--o{ TEST_SESSION : contains
    WORKSPACE ||--o{ DEVICE : registers

    TEST_CASE ||--o{ TEST_CASE_TAG : classified_by
    TAG ||--o{ TEST_CASE_TAG : applies_to

    TEST_PLAN ||--o{ TEST_PLAN_ITEM : contains
    TEST_CASE ||--o{ TEST_PLAN_ITEM : included_in

    TEST_SESSION ||--o{ SESSION_CASE_RESULT : records
    TEST_CASE ||--o{ SESSION_CASE_RESULT : evaluated_as
    DEVICE ||--o{ TEST_SESSION : runs

    TEST_SESSION ||--o{ API_LOG_EVENT : captures
    DEVICE ||--o{ API_LOG_EVENT : produces
    TEST_SESSION ||--o{ BUG : marks
    TEST_CASE ||--o{ BUG : relates_to

    WORKSPACE {
        string id PK
        string name
    }

    DEVICE {
        string id PK
        string workspace_id FK
        string name
        string platform
        boolean enabled
    }

    TEST_CASE {
        string id PK
        string workspace_id FK
        string title
        string status
        string platform
    }

    TAG {
        string id PK
        string workspace_id FK
        string name
    }

    TEST_CASE_TAG {
        string test_case_id FK
        string tag_id FK
    }

    TEST_PLAN {
        string id PK
        string workspace_id FK
        string name
    }

    TEST_PLAN_ITEM {
        string plan_id FK
        string test_case_id FK
    }

    TEST_SESSION {
        string id PK
        string workspace_id FK
        string device_id FK
        string result
        datetime started_at
        datetime stopped_at
    }

    SESSION_CASE_RESULT {
        string id PK
        string session_id FK
        string test_case_id FK
        string status
    }

    API_LOG_EVENT {
        string id PK
        string session_id FK
        string device_id FK
        string request_id
        string event_type
        datetime timestamp
    }

    BUG {
        string id PK
        string session_id FK
        string test_case_id FK
        string severity
        string status
    }
```

## Delivery Phases

This chart summarizes dependency order rather than calendar dates.

```mermaid
flowchart LR
    foundation["Phase 0: Foundation"]
    mvp["Phase 1: MVP Core"]
    sessionDepth["Phase 2: Session Depth"]
    collaboration["Phase 3: Collaboration and Web"]
    advanced["Phase 4: Advanced QA Features"]

    foundation --> mvp
    mvp --> sessionDepth
    sessionDepth --> collaboration
    collaboration --> advanced

    foundationItems["Domain language, versioned event schema, API style"]
    mvpItems["Backend CRUD, Tauri runner, iOS SDK, pairing, live inspector"]
    sessionItems["Multi-device sessions, timeline, replay, bug log windows"]
    collaborationItems["Web UI, shared dashboards, backend ingestion"]
    advancedItems["Imports, analytics, notifications, Android exploration"]

    foundation --> foundationItems
    mvp --> mvpItems
    sessionDepth --> sessionItems
    collaboration --> collaborationItems
    advanced --> advancedItems

    style foundation fill:#F3F4F6,stroke:#6B7280
    style mvp fill:#DBEAFE,stroke:#2563EB
    style sessionDepth fill:#DCFCE7,stroke:#15803D
    style collaboration fill:#F3E8FF,stroke:#7E22CE
    style advanced fill:#FEF3C7,stroke:#B45309
```

## Using These Charts

- Keep chart labels short and move detailed rules into prose.
- Update the written source of truth before changing a chart.
- Preserve the current concept, target MVP, and future distinctions.
- Use the same entity and event names across requirements, code, and design.
- Copy Mermaid blocks into FigJam, GitHub, or Mermaid-compatible documentation
  tools when a visual artifact is needed.
