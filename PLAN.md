# Rendervous

## AI-Powered Architectural Visualization

### Product & Engineering Brief

---

## 1. Product Vision

**Rendervous** is an AI-powered architectural visualization product that transforms architectural designs into photorealistic visualizations while preserving the original design.

The product is not intended to be a generic AI image generator.

Its core purpose is:

> **Turn an existing architectural design into a photorealistic visualization without redesigning it.**

The fundamental product loop is:

```text
DESIGN
  ↓
VISUALIZE
  ↓
REVIEW
  ↓
REVISE
  ↓
COMPARE
  ↓
FINALIZE
```

### Core product principle

> **The design is the source of truth. Appearance may change; geometry should not.**

---

# 2. Target Users

Primary users:

* Architects
* Architectural designers
* Interior designers
* Architecture studios
* Property developers
* Visualization teams

Potential secondary users:

* Real-estate professionals
* Contractors
* Homeowners
* Design students
* Landscape designers

The initial product should prioritize **professional architectural workflows**, rather than general-purpose image generation.

---

# 3. Core User Problem

Traditional architectural visualization requires significant time, expertise, and often expensive rendering software.

Architects may already have a detailed 3D design in SketchUp or another modeling application, but turning that design into compelling photorealistic imagery can require:

* material setup
* lighting setup
* landscaping
* environment creation
* rendering
* post-processing
* multiple iterations

AI can dramatically reduce this effort.

However, generic image-generation systems have a major problem:

> **They can produce a beautiful building that is no longer the building the architect designed.**

Rendervous should solve this problem.

---

# 4. Product Promise

### Primary promise

> **Your design, photorealistically visualized — not redesigned.**

### Alternative positioning

> **From architectural model to photorealistic vision.**

### Core differentiation

Rendervous prioritizes:

1. Design fidelity
2. Controlled visualization
3. Fast iteration
4. Revision history
5. Architectural workflow

rather than raw image-generation creativity.

---

# 5. MVP

The first version should deliberately be simple.

Do **not** begin by processing native SketchUp `.skp` files.

### MVP input

A rendered/exported image of the architectural model.

The reference can be:

* SketchUp viewport screenshot
* SketchUp clay render
* SketchUp material render
* simple architectural render

The image should clearly communicate the building's geometry and camera perspective.

### MVP output

A photorealistic architectural image that preserves the source design.

The AI should primarily transform:

* materials
* lighting
* reflections
* shadows
* vegetation
* atmosphere
* environment
* photographic realism

while preserving the architecture.

---

# 6. Geometry Preservation

Geometry preservation is the most important technical requirement.

The generated image should preserve:

### Building

* massing
* proportions
* floor count
* roof geometry
* wall positions
* openings
* building footprint

### Architectural elements

* windows
* doors
* columns
* balconies
* terraces
* stairs
* structural elements
* major facade elements

### Camera

* camera position
* viewing direction
* perspective
* framing
* composition
* relative scale

The model should not be encouraged to "improve" the architecture.

### Explicit principle

```text
REFERENCE GEOMETRY = IMMUTABLE

MATERIALS        = CHANGEABLE
LIGHTING         = CHANGEABLE
ENVIRONMENT      = CHANGEABLE
ATMOSPHERE       = CHANGEABLE
PHOTOGRAPHY      = CHANGEABLE
```

---

# 7. AI Model Strategy

Rendervous should initially use image-generation models available through **OpenRouter**.

The application should not be tightly coupled to a single model.

The model should be treated as replaceable infrastructure.

Conceptually:

```text
                    Rendervous
                        │
                        ↓
                  Model Router
                        │
           ┌────────────┼────────────┐
           ↓            ↓            ↓
        Model A      Model B      Model C
```

Eventually the system should evaluate models based on:

* geometry fidelity
* photorealism
* material quality
* interior performance
* exterior performance
* consistency
* cost
* latency
* reliability

The MVP may use one model, but the architecture should allow additional models later.

---

# 8. Model Evaluation Before Implementation

Before building sophisticated infrastructure, evaluate the available models.

Create a test set of representative architectural references.

Test each model using the same inputs and instructions.

Measure:

### Geometry

* Did the model preserve the building?
* Did it change the number of floors?
* Did it alter windows?
* Did it change roof geometry?
* Did it alter proportions?
* Did it add/remove architectural elements?

### Visual quality

* Material realism
* Lighting
* Reflections
* Shadows
* Vegetation
* Atmosphere
* Photographic quality

### Operational characteristics

* latency
* cost
* resolution
* API reliability
* consistency across generations

The first technical milestone is:

> **Determine which available model provides the best trade-off between photorealism and architectural fidelity.**

---

# 9. Prompting Strategy

The prompt should establish a strict hierarchy.

```text
1. Geometry
2. Camera
3. Materials
4. Lighting
5. Environment
6. Photography
```

The system should avoid language such as:

* redesign
* reimagine
* improve the architecture
* make the building more beautiful
* reinterpret

Instead, it should explicitly establish the reference as authoritative.

### Baseline prompt

```text
Transform the supplied architectural 3D model reference into a
photorealistic architectural photograph.

HIGHEST PRIORITY — GEOMETRY:

The reference model is the authoritative source of truth for the
architecture.

Preserve its geometry exactly. Treat every visible architectural
element as fixed.

Maintain:
- building massing and proportions
- number of floors
- roof geometry
- wall positions
- window and door positions and dimensions
- columns and structural elements
- balconies and terraces
- openings
- stairs
- major architectural features

SECOND PRIORITY — CAMERA:

Preserve the exact camera position, viewing direction, perspective,
framing and composition of the reference.

THIRD PRIORITY — MATERIALS:

Replace simple/default materials with physically realistic materials
appropriate to the existing surfaces.

FOURTH PRIORITY — LIGHTING:

Create physically plausible natural lighting, indirect illumination,
contact shadows, reflections and realistic exposure.

FIFTH PRIORITY — ENVIRONMENT:

Add realistic landscaping, vegetation, sky and environmental details
where appropriate, without modifying or obscuring the building geometry.

SIXTH PRIORITY — PHOTOGRAPHY:

Make the result resemble a professionally photographed real building
with realistic lens characteristics, depth, texture, exposure and color.

ABSOLUTE RESTRICTION:

Do not redesign the building.
Do not modify its geometry.
Do not change dimensions or proportions.
Do not add or remove architectural elements.
Do not change the number or position of windows, doors, floors,
columns, balconies, roofs or openings.

The final image should be recognizable as the exact same building shown
in the reference, only rendered as if it physically existed and had
been professionally photographed.

Geometry fidelity is more important than visual creativity.
```

This should be implemented as a configurable prompt template rather than permanently hardcoded.

---

# 10. Visualization Controls

The UI should expose simple architectural controls instead of raw AI parameters.

### Style

* Photorealistic
* Editorial
* Minimal
* Atmospheric

### Lighting

* Daylight
* Overcast
* Golden hour
* Sunset
* Night

### Environment

* Original
* Tropical
* Urban
* Forest
* Minimal

### Materials

* Preserve original
* Concrete
* Wood
* Stone
* Custom

### Geometry Fidelity

```text
STRICT ───────────────────── CREATIVE
  ●
```

Strict geometry should be the default.

---

# 11. Natural-Language Revision

Users should be able to modify the visualization using natural language.

Examples:

> "Make the facade exposed concrete."

> "Change the floor to dark teak."

> "Make it golden hour."

> "Add tropical landscaping around the pool."

> "Make the window frames black."

> "Make the sky overcast."

The system should preserve the original architectural reference while applying the requested visual change.

---

# 12. Revision System

Revision is a core feature, not an afterthought.

Every generated visualization should be treated as a revision.

Example:

```text
Villa Merapi

v0 — Original reference
v1 — Photorealistic daylight
v2 — Exposed concrete facade
v3 — Golden hour
v4 — Tropical landscaping
v5 — Dark teak interiors
```

Each revision should retain:

* parent revision
* original reference
* prompt/instruction
* model
* generation parameters
* output image
* timestamp

Users should be able to:

* compare revisions
* restore a revision
* branch from a revision
* regenerate
* create a new variation

---

# 13. Project Structure

The product should model architectural work as projects.

Conceptually:

```text
PROJECT
│
├── Design
│   └── Original model/reference
│
├── Views
│   ├── Exterior front
│   ├── Exterior rear
│   ├── Living room
│   └── Pool
│
├── Visualizations
│   ├── Daylight
│   ├── Golden hour
│   └── Night
│
└── Revisions
    ├── v1
    ├── v2
    ├── v3
    └── v4
```

The original design should remain the persistent source of truth.

---

# 14. Future 3D-Aware Pipeline

Once the MVP proves the concept, move beyond a single reference image.

The long-term architecture should extract information from the 3D model.

Potential inputs:

* geometry
* camera
* depth
* normals
* edges
* segmentation
* material IDs
* object masks

Potential pipeline:

```text
                    3D Model
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      Camera        Geometry       Materials
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Auxiliary passes
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
        Depth        Edges       Normals
          │            │            │
          └────────────┼────────────┘
                       ↓
                Image Generation
                       ↓
                Photorealistic
                   Render
```

This should improve spatial and geometric consistency compared with relying solely on prompts.

---

# 15. SketchUp Integration

The eventual goal is:

```text
SketchUp → Rendervous
```

rather than:

```text
SketchUp → Export Image → Rendervous
```

Investigate:

* SketchUp extensions
* automated viewport rendering
* camera extraction
* model metadata extraction
* geometry export
* material extraction
* depth generation
* supported intermediate formats

Native `.skp` processing should be considered a later-stage feature rather than an MVP requirement.

---

# 16. Localized Editing

A major future capability should be region-specific editing.

Example:

> Select wall → "Change to natural stone."

> Select floor → "Change to dark teak."

> Select landscaping → "Add tropical plants."

> Select sky → "Make it overcast."

The selected region should change while everything else remains stable.

Potential architecture:

```text
Reference
    │
    ↓
User selection / mask
    │
    ↓
Natural-language instruction
    │
    ↓
Inpainting / image model
    │
    ↓
Localized revision
```

This is likely to be more valuable to professional users than unrestricted image generation.

---

# 17. Future Geometry Validation

AI-generated images may still introduce subtle geometry drift.

Potential validation system:

```text
Original reference
       │
       ↓
Image generation
       │
       ↓
Generated render
       │
       ↓
Geometry validation
       │
   ┌───┴────┐
   ↓        ↓
 PASS      FAIL
   │        │
   ↓        ↓
Deliver   Regenerate
```

Potential validation methods:

* edge-map comparison
* segmentation comparison
* depth consistency
* architectural feature detection
* object masks
* multimodal model evaluation
* comparison against model-derived geometry

Do not implement this in the MVP unless model testing demonstrates that geometry drift is a blocking problem.

---

# 18. Technical Architecture

Suggested initial architecture:

```text
                    Browser
                       │
                       ↓
                  Web Frontend
                       │
                       ↓
                    API
                       │
              ┌────────┴────────┐
              ↓                 ↓
          PostgreSQL        Object Storage
              │
              ↓
          Job System
              │
              ↓
       AI Orchestration Layer
              │
              ↓
          OpenRouter
              │
              ↓
       Image Generation Model
```

### Frontend

Use Vue.js.

Responsibilities:

* project dashboard
* image upload
* visualization configuration
* generation status
* render gallery
* revision browser
* comparison view
* natural-language revision

### Backend

Python/FastAPI is suitable for the initial backend.

Responsibilities:

* authentication
* project management
* image management
* generation jobs
* prompt construction
* model abstraction
* OpenRouter integration
* revision management

### Database

PostgreSQL.

Potential entities:

```text
Project
Design
View
Visualization
Revision
GenerationJob
Model
Prompt
```

### Storage

Use object storage for:

* source images
* generated renders
* reference assets
* masks
* depth maps
* intermediate artifacts

---

# 19. Suggested Data Model

```text
Project
  id
  name
  created_at

Design
  id
  project_id
  source_type
  source_file
  created_at

View
  id
  design_id
  name
  reference_image
  camera_metadata

Visualization
  id
  view_id
  style
  settings
  current_revision_id

Revision
  id
  visualization_id
  parent_revision_id
  prompt
  model
  parameters
  input_reference
  output_image
  created_at

GenerationJob
  id
  revision_id
  status
  provider
  model
  started_at
  completed_at
  error
```

The critical relationship is:

```text
Design
  │
  └── View
       │
       └── Visualization
            │
            ├── Revision 1
            ├── Revision 2
            ├── Revision 3
            └── Revision N
```

---

# 20. UX Philosophy

Rendervous should feel like an **architectural visualization tool**, not an AI playground.

The interface should emphasize:

* Visualize
* Revise
* Compare
* Materials
* Lighting
* Environment
* Preserve geometry

Avoid exposing technical concepts unless the user wants advanced controls:

* model names
* inference parameters
* raw prompts
* conditioning methods
* ControlNet terminology
* technical model configuration

An advanced/expert mode can expose these later.

---

# 21. MVP User Flow

```text
1. Create project
       ↓
2. Upload architectural reference
       ↓
3. Select view
       ↓
4. Choose visualization settings
       ↓
5. Generate
       ↓
6. Review result
       ↓
7. Accept / revise
       ↓
8. Create revision
       ↓
9. Compare versions
```

The first successful experience should take as few steps as possible.

---

# 22. MVP Feature List

### Required

* [ ] User/project creation
* [ ] Upload reference image
* [ ] Image storage
* [ ] Visualization configuration
* [ ] OpenRouter integration
* [ ] Image generation
* [ ] Generation status
* [ ] Render display
* [ ] Revision creation
* [ ] Revision history
* [ ] Basic comparison
* [ ] Error handling
* [ ] Generation metadata

### Nice to have

* [ ] Natural-language revision
* [ ] Multiple styles
* [ ] Multiple lighting presets
* [ ] Model selection
* [ ] Download/export
* [ ] Side-by-side comparison

### Not MVP

* [ ] Native `.skp` processing
* [ ] Automatic depth extraction
* [ ] Geometry validation
* [ ] Region-specific editing
* [ ] Multi-model automatic routing
* [ ] Advanced 3D scene understanding

---

# 23. Development Phases

## Phase 0 — Model Evaluation

Build a small internal evaluation harness.

Input:

```text
Reference architectural image
```

Output:

```text
Model A
Model B
Model C
```

Evaluate geometry preservation, quality, cost and latency.

---

## Phase 1 — Rendering MVP

Build:

```text
Upload
  ↓
Configure
  ↓
Generate
  ↓
Display
```

Focus on proving that the basic rendering experience works.

---

## Phase 2 — Revision Workflow

Add:

* revision history
* branching
* natural-language instructions
* comparison
* regeneration

This turns the system from an image generator into a visualization workflow.

---

## Phase 3 — Architectural Controls

Add:

* material controls
* lighting controls
* environment controls
* camera locking
* stronger geometry preservation

---

## Phase 4 — 3D Integration

Investigate:

* SketchUp integration
* `.skp` workflows
* camera extraction
* geometry extraction
* depth
* normals
* segmentation
* masks

---

## Phase 5 — Controlled Editing

Implement localized editing:

```text
Select → Describe change → Generate → Compare
```

---

## Phase 6 — Geometry Validation

Introduce automated geometry consistency checking and regeneration.

---

# 24. Critical Engineering Principle

Do not over-engineer the first version.

The first technical question is:

> **Can current image-generation models turn a SketchUp architectural reference into a compelling photorealistic visualization while keeping the building recognizably identical?**

If the answer is no, additional UI and infrastructure will not solve the fundamental problem.

If the answer is yes, build the product around the workflow.

---

# 25. Critical Product Principle

Rendervous should **not compete primarily on image-generation quality**.

The underlying models will change rapidly.

The durable product value should come from:

```text
Architectural design
        +
Geometry preservation
        +
Controlled visualization
        +
Revision history
        +
Natural-language iteration
        +
Design-aware workflow
```

The models are infrastructure.

The workflow is the product.

---

# 26. Initial Agent Mission

The coding/research agent should begin by answering these questions before implementing the full application:

1. Which image-generation models available through OpenRouter support image/reference-based generation?
2. Which currently provide the best architectural geometry preservation?
3. Which support multiple reference images?
4. Which support image editing/inpainting?
5. Which support masks?
6. What input/output resolutions are available?
7. What are the current costs?
8. What are the API limitations and rate limits?
9. How consistent are repeated generations?
10. How much geometry drift occurs in realistic architectural examples?
11. What reference-image format produces the best results?
12. Can depth/edge/normal conditioning be used with the selected models?
13. What is the simplest viable OpenRouter integration?
14. What is the minimum backend architecture needed for asynchronous image generation?

The agent should **research current model capabilities and documentation before making assumptions about the API**.

---

# 27. Definition of Success

The MVP is successful if an architect can take an existing architectural reference and reliably produce an image where:

### The building is still the same building

while:

* materials look real
* lighting looks real
* landscaping looks real
* shadows look real
* atmosphere looks real
* the image looks professionally photographed

and the architect can then say:

> "Keep this design, but change X."

and obtain another visualization without losing the original design.

That is the core of Rendervous.

---

# 28. Product North Star

```text
             ARCHITECTURAL DESIGN
                      │
                      ↓
                 RENDERVOUS
                      │
             ┌────────┴────────┐
             ↓                 ↓
        VISUALIZE             REVISE
             │                 │
             └────────┬────────┘
                      ↓
                 COMPARE
                      │
                      ↓
              APPROVED VISION
```

**Rendervous exists to make the distance between an architect's design and its photorealistic vision nearly instantaneous — without losing the design along the way.**
