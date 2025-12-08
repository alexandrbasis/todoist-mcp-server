# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based MCP (Model Context Protocol) server that bridges Claude with the Todoist API, enabling natural language task management. The entire server implementation is contained in a single file ([src/index.ts](src/index.ts)).

## Development Commands

### Build and Development
- `npm run build` - Compile TypeScript and make output executable (required before testing)
- `npm run watch` - Watch mode for development (auto-recompile on changes)
- `npm install` - Install dependencies

### Testing
Test the server by configuring it in Claude Desktop or using the MCP inspector:
```bash
# Set environment variable first
export TODOIST_API_TOKEN="your_token_here"

# Run the built server
node dist/index.js
```

### Docker
```bash
docker build -t todoist-mcp-server .
docker run -e TODOIST_API_TOKEN="your_token" todoist-mcp-server
```

## Architecture

### Single-File MCP Server Pattern
The entire implementation lives in [src/index.ts](src/index.ts) following this structure:
1. **Tool Definitions** (lines 13-129): Static tool schemas defining inputs/outputs for 5 Todoist operations
2. **Server Initialization** (lines 132-152): MCP server setup with stdio transport and Todoist client
3. **Type Guards** (lines 154-216): Runtime type validation for tool arguments
4. **Request Handlers** (lines 219-410): Tool execution logic with error handling
5. **Server Startup** (lines 412-421): Entry point and error handling

### MCP Communication Pattern
- Uses **stdio transport** for bidirectional communication with Claude
- Implements two request handlers:
  - `ListToolsRequestSchema`: Returns available tools
  - `CallToolRequestSchema`: Executes tool operations
- All responses include `isError` flag for error handling

### Todoist Integration Approach
**Search-Based Operations**: Update, delete, and complete tools use fuzzy search by task name:
```typescript
const matchingTask = tasks.find(task =>
  task.content.toLowerCase().includes(args.task_name.toLowerCase())
);
```
This allows natural language like "complete the meeting task" without requiring task IDs.

### Type Safety Pattern
Uses type guard functions (e.g., `isCreateTaskArgs`) for runtime validation of tool arguments before calling Todoist API.

## Configuration

### Required Environment Variable
`TODOIST_API_TOKEN` - Must be set or server exits with error (checked at [src/index.ts:145](src/index.ts#L145))

### TypeScript Configuration
- Target: ES2020 with ES2022 modules
- Module resolution: bundler (Node.js ESM)
- Strict mode enabled
- Single entry point: [src/index.ts](src/index.ts)

## Research Guidelines (from .cursor/rules)

When researching external APIs or documentation:
1. **Prefer Exa MCP**: Start with `get_code_context_exa` for code-aware context
2. **Fallback to web search**: Use `web_search_exa` if code context insufficient
3. **Use Ref sparingly**: Only for authoritative documentation verification when Exa results conflict or after failed integration attempts

## Adding New Tools

To add a new Todoist operation:
1. Define tool schema constant (following `CREATE_TASK_TOOL` pattern)
2. Add type guard function for argument validation
3. Implement handler in `CallToolRequestSchema` callback
4. Add tool to array in `ListToolsRequestSchema` handler
5. Rebuild with `npm run build`

## Notes

- No test suite currently exists - test manually via Claude Desktop or MCP inspector
- No linting configuration - TypeScript strict mode provides type checking
- Uses natural language date parsing via Todoist API (`due_string` parameter)
- Error responses use `isError: true` flag per MCP convention
