# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NOVIX** is a Context-Aware Multi-Agent Novel Writing System—an AI-powered editorial department that helps authors create long-form fiction while maintaining narrative coherence and consistency.

**License**: PolyForm Noncommercial License 1.0.0 (effective Jan 20, 2026) - strictly prohibits commercial use without written authorization.

## Architecture Overview

NOVIX is a full-stack application with a clear separation of concerns:

### Backend (FastAPI + Python)
- **Multi-Agent System**: Specialized agents (Director, Writer, Reviewer, Editor, Archivist) work collaboratively in a structured workflow
- **Context Engine**: Sophisticated context management with token budgeting, intelligent selection, compression, and degradation guards
- **LLM Gateway**: Provider abstraction supporting OpenAI, Anthropic, DeepSeek, and custom providers
- **File-based Storage**: All data persists as YAML/Markdown/JSONL files for Git compatibility
- **WebSocket Support**: Real-time streaming updates for long-running operations

### Frontend (React + Vite)
- **IDE-like Interface**: VS Code-inspired layout with activity bar, side panels, and status bar
- **Real-time Streaming**: Live draft generation and diff-based review interface
- **Minimalist Design**: "Calm & Focus" design language emphasizing distraction-free writing

### Data Flow
```
User Input → Director (outline) → Writer (draft) → Reviewer (critique) → Editor (polish)
                                      ↓
                              Archivist (fact tracking)
                                      ↓
                              Canon (dynamic facts)
```

## Directory Structure

```
backend/
├── app/
│   ├── agents/              # Agent implementations (archivist, writer, reviewer, editor)
│   ├── context_engine/      # Context management (orchestrator, selector, compressor, budgeter)
│   ├── llm_gateway/         # LLM provider abstraction
│   ├── routers/             # API endpoints (projects, cards, canon, drafts, session, websocket)
│   ├── schemas/             # Pydantic data models
│   ├── services/            # Business logic (crawler, wiki parser, search, LLM config)
│   ├── storage/             # File-based persistence layer
│   ├── orchestrator/        # Workflow orchestration
│   ├── utils/               # Utilities (logger, chapter_id)
│   ├── config.py            # Configuration management
│   └── main.py              # FastAPI app entry point
├── config.yaml              # Agent & LLM configuration
├── requirements.txt         # Python dependencies
└── run.bat/run.sh          # Startup scripts

frontend/
├── src/
│   ├── components/
│   │   ├── ide/             # IDE layout components (IDELayout, ActivityBar, SidePanel, etc.)
│   │   ├── project/         # Project management UI
│   │   ├── writing/         # Writing interface
│   │   ├── ui/              # Reusable UI components
│   │   └── panels/          # Collapsible panels (Explorer, Cards, Agents, Context, etc.)
│   ├── context/             # React context (IDEContext)
│   ├── hooks/               # Custom hooks (useTraceEvents)
│   ├── api.js               # API client
│   ├── App.jsx              # Root component
│   └── main.jsx             # Entry point
├── vite.config.js           # Vite dev server (port 3000, proxies to backend)
├── tailwind.config.js       # "Calm & Focus" design system
└── package.json             # Dependencies
```

## Common Development Commands

### Backend

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run development server (http://localhost:8000)
python -m app.main

# Run tests
pytest

# Run specific test
pytest backend/tests/test_agents.py -v
```

### Frontend

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000, with HMR)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Full Stack (One-Click)

```bash
# Windows
start.bat

# macOS/Linux
./start.sh
```

This automatically:
- Installs Python and Node.js dependencies
- Starts backend on http://localhost:8000
- Starts frontend on http://localhost:3000
- Opens browser to frontend

### Production Build

```bash
python build_release.py
# Outputs: dist/NOVIX/NOVIX.exe (Windows)
# Bundles frontend assets, backend, and all dependencies
```

## Configuration

### Backend Configuration (`backend/config.yaml`)

Key sections:
- **llm**: Default provider and provider-specific settings
- **agents**: Per-agent configuration (provider, temperature, system prompts)
- **context_budget**: Token allocation across context types (system_rules, cards, canon, summaries, current_draft, output_reserve)
- **session**: Max iterations, auto-save interval
- **storage**: Data directory path

### Environment Variables (`backend/.env`)

```env
# LLM API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=...
CUSTOM_API_KEY=...
CUSTOM_BASE_URL=...
CUSTOM_MODEL_NAME=...

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Agent-specific providers (optional)
NOVIX_AGENT_WRITER_PROVIDER=openai
NOVIX_AGENT_REVIEWER_PROVIDER=anthropic
```

### Frontend Configuration (`frontend/vite.config.js`)

- Dev server: port 3000
- API proxy: `/api` → `http://localhost:8000`
- WebSocket proxy: `ws://localhost:8000`

## Key Architectural Patterns

### 1. Multi-Agent Workflow
Each agent has a specific role and is invoked sequentially:
- **Director**: Creates narrative outline
- **Writer**: Generates draft based on outline
- **Reviewer**: Provides critique and suggestions
- **Editor**: Polishes and refines
- **Archivist**: Extracts and tracks facts

### 2. Context Engineering
- **Token Budgeting**: Allocates tokens across different context types
- **Intelligent Selection**: Retrieves only relevant context for current task
- **Compression**: Summarizes context to fit within budget
- **Degradation Guards**: Prevents loss of critical information

### 3. LLM Provider Abstraction
- `llm_gateway/gateway.py`: Main interface
- `llm_gateway/providers/`: Pluggable provider implementations
- Supports multiple providers simultaneously with per-agent configuration

### 4. File-based Storage
- All data stored as YAML/Markdown/JSONL
- Git-friendly for version control
- Structure: `data/{project_name}/{cards,drafts,traces}/`

### 5. Real-time Streaming
- WebSocket endpoints for live updates
- Streaming LLM responses to frontend
- Agent status monitoring

## API Endpoints

### Projects
- `POST /projects` - Create project
- `GET /projects` - List projects
- `GET /projects/{project_id}` - Get project details

### Cards (Character/World/Style)
- `POST /projects/{project_id}/cards/characters` - Create character card
- `GET /projects/{project_id}/cards/characters` - List characters
- `PUT /projects/{project_id}/cards/style` - Update style guide

### Canon (Dynamic Facts)
- `GET /projects/{project_id}/canon` - Get all facts
- `POST /projects/{project_id}/canon` - Add fact
- `DELETE /projects/{project_id}/canon/{fact_id}` - Remove fact

### Drafts
- `POST /projects/{project_id}/drafts` - Create draft
- `GET /projects/{project_id}/drafts/{chapter_id}` - Get draft

### Session (Writing Workflow)
- `POST /projects/{project_id}/session/start` - Start writing session
- `POST /projects/{project_id}/session/feedback` - Submit feedback/revisions
- `WS /ws/{project_id}/session` - WebSocket for real-time updates

### Fanfiction
- `POST /fanfiction/crawl` - Crawl wiki for character/setting data
- `POST /fanfiction/batch-extract` - Batch extract multiple characters

## Data Storage Structure

```
data/{project_name}/
├── project.yaml              # Project metadata
├── cards/
│   ├── characters/
│   │   └── {character_name}.yaml
│   └── style.yaml
├── drafts/
│   └── {chapter_id}/
│       ├── scene_brief.yaml
│       ├── draft_v1.md
│       ├── review.yaml
│       ├── draft_v2.md
│       └── final.md
└── traces/                   # Execution logs
```

## Important Implementation Details

### Context Budget Allocation
The system divides available tokens across:
- **system_rules** (5%): Core system instructions
- **cards** (15%): Character/world/style information
- **canon** (10%): Dynamic facts accumulated during writing
- **summaries** (20%): Compressed context from previous chapters
- **current_draft** (30%): Current draft being worked on
- **output_reserve** (20%): Reserved for LLM output

### Agent Invocation Flow
1. **Director** reads project cards and creates outline
2. **Writer** uses outline + relevant canon to generate draft
3. **Reviewer** critiques draft and suggests improvements
4. **Editor** refines based on review
5. **Archivist** extracts new facts from final draft and updates canon

### WebSocket Message Format
```json
{
  "type": "agent_status|draft_chunk|review_complete",
  "agent": "writer|reviewer|editor",
  "content": "...",
  "timestamp": "2024-01-30T12:00:00Z"
}
```

## Development Workflow

1. **Backend changes**: Modify files in `backend/app/`, restart server with `python -m app.main`
2. **Frontend changes**: Modify files in `frontend/src/`, Vite HMR will auto-reload
3. **Configuration changes**: Edit `backend/config.yaml` or `backend/.env`, restart backend
4. **Testing**: Run `pytest` for backend tests
5. **Building**: Use `build_release.py` for production packaging

## Debugging

- **Backend logs**: Check console output from `python -m app.main`
- **Frontend logs**: Check browser console (F12)
- **API documentation**: Visit http://localhost:8000/docs (FastAPI Swagger UI)
- **Execution traces**: Check `data/{project_name}/traces/` for detailed logs

## Performance Considerations

- **Token budgeting**: Adjust `context_budget` in `config.yaml` based on model limits
- **Concurrent crawling**: Fanfiction crawling uses concurrent requests for speed
- **Context compression**: Automatically compresses old context to fit budget
- **Streaming responses**: WebSocket streaming prevents timeout on long operations

## Security Notes

- API Keys stored in `.env` (never commit to Git)
- File-based storage means all data is local (no external database)
- CORS configured for localhost dev and production domains
- Rate limiting: 200 requests/minute default
